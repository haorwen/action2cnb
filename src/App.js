import React, { useState } from 'react';
import './App.css';
import yaml from 'js-yaml';

function App() {
  const [githubYaml, setGithubYaml] = useState('');
  const [cnbYaml, setCnbYaml] = useState('');
  const [error, setError] = useState('');
  const [useYamlAnchors, setUseYamlAnchors] = useState(true);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setGithubYaml(event.target.result);
    };
    reader.readAsText(file);
  };

  const loadSampleFile = () => {
    fetch('/sample-workflow.yml')
      .then(response => response.text())
      .then(data => {
        setGithubYaml(data);
      })
      .catch(err => {
        setError(`Error loading sample file: ${err.message}`);
      });
  };

  const convertToCNB = () => {
    setError('');
    setCnbYaml('');

    try {
      // 1) 解析 GitHub Actions workflow
      const githubWorkflow = yaml.load(githubYaml);
      if (!githubWorkflow) {
        setError('无法解析 YAML：内容为空');
        return;
      }

      // 2) 分支选择（定时任务要求明确分支，不支持 glob，普通事件可用默认 main）
      let defaultBranch = 'main';
      if (githubWorkflow.on && githubWorkflow.on.push && githubWorkflow.on.push.branches) {
        const br = githubWorkflow.on.push.branches;
        defaultBranch = Array.isArray(br) ? (br[0] || 'main') : br || 'main';
      }

      // 3) 全局 env（pipeline 级别）
      const globalEnv = githubWorkflow.env || {};

      // 4) 构建可识别事件映射（将 GH 事件名映射为 CNB 支持的事件名）
      const EVENT_MAP = {
        push: 'push',
        pull_request: 'pull_request',
        workflow_dispatch: 'web_trigger', // 页面手动触发
        repository_dispatch: 'api_trigger', // API 触发
      };

      // 5) 收集 GH 触发类型（排除 schedule，schedule 单独处理为 crontab）
      const triggerOn = githubWorkflow.on;
      const rawTriggerTypes = (typeof triggerOn === 'string')
        ? [triggerOn]
        : Array.isArray(triggerOn)
          ? triggerOn
          : triggerOn ? Object.keys(triggerOn) : [];
      const triggerTypes = rawTriggerTypes.filter(t => t !== 'schedule');

      // 6) 生成模板（使用锚点时会被 <<: *alias 合并）
      const templates = {}; // { [jobName]: pipelineTemplate }

      if (githubWorkflow.jobs) {
        Object.entries(githubWorkflow.jobs).forEach(([jobName, jobConfig]) => {
          const pipelineTemplate = createPipelineFromJob(jobName, jobConfig, globalEnv);
          // 模板里不放 name，具体流水线实例再填 name，避免被合并覆盖
          delete pipelineTemplate.name;
          templates[jobName] = pipelineTemplate;
        });
      }

      // 7) 根据事件生成流水线引用（每个事件下引用模板）
      const branches = { [defaultBranch]: {} }; // { branchKey: { eventKey: [pipelines...] } }

      // 普通事件（push / pull_request / web_trigger / api_trigger ...）
      triggerTypes.forEach(ghEvent => {
        const eventKey = EVENT_MAP[ghEvent];
        if (!eventKey) return; // 跳过 CNB 不支持的事件
        branches[defaultBranch][eventKey] = [];
        if (githubWorkflow.jobs) {
          Object.keys(githubWorkflow.jobs).forEach(jobName => {
            // 使用锚点：事件下的流水线只需要 name + <<: *alias
            // 针对 Node.js 矩阵构建：每个版本生成独立模板，不保留任何 ${{ matrix.node-version }} 占位符
            const originalJobConfig = githubWorkflow.jobs[jobName];
            if (originalJobConfig.strategy && originalJobConfig.strategy.matrix && originalJobConfig.strategy.matrix['node-version']) {
              const versions = originalJobConfig.strategy.matrix['node-version'];
              versions.forEach(ver => {
                const aliasName = `${jobName}-${ver}`;
                // 基于原 jobConfig 重新构建 pipeline，确保 stages 正常生成
                const rebuiltPipeline = createPipelineFromJob(jobName, {
                  ...originalJobConfig,
                  strategy: undefined, // 移除矩阵定义避免递归
                }, globalEnv);
                // 强制替换镜像为当前版本
                // 如果版本是类似 16.x 这种，去掉 .x
                const cleanVer = String(ver).endsWith('.x') ? String(ver).slice(0, -2) : String(ver);
                rebuiltPipeline.docker = { image: `node:${cleanVer}` };
                templates[aliasName] = rebuiltPipeline;
                branches[defaultBranch][eventKey].push({ alias: aliasName, name: `${eventKey}-${aliasName}` });
              });
              // 删除原 jobName 模板，避免生成空 stages 的锚点
              delete templates[jobName];
            } else {
              branches[defaultBranch][eventKey].push({ alias: jobName, name: `${eventKey}-${jobName}` });
            }
          });
        }
      });

      // 定时任务（"crontab: ${CRON}" 作为事件名，必须是明确分支）
      if (triggerOn && triggerOn.schedule) {
        const schedules = Array.isArray(triggerOn.schedule) ? triggerOn.schedule : [triggerOn.schedule];
        schedules.forEach((sch) => {
          const cronExpr = sch && sch.cron;
          if (!cronExpr) return;
          const cronKey = `crontab: ${cronExpr}`; // 注意：YAML 里要加引号
          branches[defaultBranch][cronKey] = [];
          if (githubWorkflow.jobs) {
            Object.keys(githubWorkflow.jobs).forEach(jobName => {
              branches[defaultBranch][cronKey].push({ alias: jobName, name: `crontab-${jobName}` });
            });
          }
        });
      }

      // 8) 输出 YAML
      if (useYamlAnchors) {
        // (A) 使用锚点与别名，构造正确的 <<: *alias 语法
        const yamlText = buildYamlWithAnchors(templates, branches);
        setCnbYaml(yamlText);
      } else {
        // (B) 不使用锚点，直接把模板内容合并到实例（深拷贝）
        const expanded = expandTemplates(templates, branches);
        setCnbYaml(yaml.dump(expanded));
      }
    } catch (err) {
      setError(`Error converting workflow: ${err.message}`);
      console.error(err);
    }
  };

  /**
   * 将模板+事件结构渲染为带锚点与别名的 YAML 字符串
   */
  const buildYamlWithAnchors = (templates, branches) => {
    const parts = [];

    // 1) 顶部输出模板锚点：`.name: &name`，其值是一个映射，需要缩进
    Object.entries(templates).forEach(([name, tpl]) => {
      parts.push(`.${name}: &${name}`);
      parts.push(indentBlock(yaml.dump(tpl), 2));
      parts.push('');
    });

    // 2) 输出分支与事件
    Object.entries(branches).forEach(([branch, events]) => {
      parts.push(`${quoteIfNeeded(branch)}:`);
      Object.entries(events).forEach(([eventKey, arr]) => {
        const isCron = eventKey.startsWith('crontab: ');
        const ek = isCron ? `"${eventKey}"` : eventKey; // crontab 带冒号，须加引号
        parts.push(`  ${ek}:`);
        if (!arr || arr.length === 0) {
          parts.push('    []');
          return;
        }
        arr.forEach(item => {
          parts.push('    -');
          parts.push(`      name: ${quoteIfNeeded(item.name)}`);
          parts.push(`      <<: *${item.alias}`);
        });
      });
    });

    return parts.join('\n');
  };

  /** 深度合并模板：把 alias 展开成完整对象（不使用锚点时用） */
  const expandTemplates = (templates, branches) => {
    const out = {};
    Object.entries(branches).forEach(([branch, events]) => {
      out[branch] = {};
      Object.entries(events).forEach(([eventKey, items]) => {
        // crontab key 要保留原样（含空格与冒号）
        out[branch][eventKey] = items.map(({ alias, name }) => {
          const tpl = deepClone(templates[alias] || {});
          return { name, ...tpl };
        });
      });
    });
    return out;
  };

  // Helper: 创建模板 Pipeline（符合 CNB 语法：pipeline.docker/env/stages/jobs/script）
  const createPipelineFromJob = (jobName, jobConfig, globalEnv = {}) => {
    const pipeline = {
      env: Object.keys(globalEnv).length ? { ...globalEnv } : undefined,
      docker: undefined,
      stages: []
    };

    // 1) 解析 runs-on -> docker.image（注意 GH 用的是 "runs-on"）
    const runsOn = jobConfig?.runsOn || jobConfig?.['runs-on'];
    const mappedImage = mapRunnerToDockerImage(runsOn);

    // 2) 将 steps 转换为一个 Stage，包含多个 Job（脚本任务）
    // 将 GH steps 转为多个 stage（而不是一个 stage 多个 job）
    const stages = [];

    // job 级 env（stage 级生效）
    if (jobConfig && jobConfig.env && Object.keys(jobConfig.env).length > 0) {
      // 每个 stage 都继承 job 级 env
    }

    let imageFromSetupNode = undefined;

    if (Array.isArray(jobConfig?.steps)) {
      jobConfig.steps.forEach((step, index) => {
        const taskName = step.name || `step-${index + 1}`;
        const stepEnv = step.env && Object.keys(step.env).length > 0 ? { ...step.env } : undefined;

        // 新建一个 stage 对应这个 step（直接包含 script，不再嵌套 jobs）
        const stage = {
          name: taskName
        };
        if (jobConfig && jobConfig.env && Object.keys(jobConfig.env).length > 0) {
          stage.env = { ...jobConfig.env };
        }
        if (stepEnv) {
          stage.env = { ...(stage.env || {}), ...stepEnv };
        }

        if (step.uses) {
          if (String(step.uses).startsWith('actions/checkout@')) {
            return; // 跳过
          }
          if (String(step.uses).startsWith('actions/setup-node@')) {
            const ver = step.with?.['node-version'] || step.with?.['node-version-file'] || '20';
            imageFromSetupNode = `node:${String(ver).replace(/^v/, '')}`;
            return;
          }
          stage.script = `# 使用 GitHub Action: ${step.uses}\n# 请手动替换为等效 CNB 插件或脚本`;
          stages.push(stage);
          return;
        }

        if (step.run) {
          stage.script = String(step.run);
        }

        stages.push(stage);
      });
    }

    // 如果 setup-node 指定了镜像优先使用，否则用 runs-on 映射
    const finalImage = imageFromSetupNode || mappedImage;
    if (finalImage) {
      pipeline.docker = { image: finalImage };
    }

    // 没有 steps 的空任务，给个空脚本避免语法错误
    if (!stages.length) {
      stages.push({ name: 'noop', jobs: [{ name: 'noop', script: 'echo "noop"' }] });
    }

    pipeline.stages.push(...stages);

    // 清理 undefined
    if (!pipeline.env) delete pipeline.env;
    if (!pipeline.docker) delete pipeline.docker;

    return pipeline;
  };

  // GH Runner 到 CNB docker.image 的简单映射
  const mapRunnerToDockerImage = (runsOn) => {
    if (!runsOn) return undefined;
    if (Array.isArray(runsOn)) runsOn = runsOn[0];

    switch (runsOn) {
      case 'ubuntu-latest':
      case 'ubuntu-24.04':
      case 'ubuntu-22.04':
        return 'ubuntu:22.04';
      case 'ubuntu-20.04':
        return 'ubuntu:20.04';
      case 'windows-latest':
        // CNB 基于容器执行，Windows Runner 暂不直接支持，退化为 alpine
        return 'alpine:latest';
      case 'macos-latest':
      case 'macos-14':
      case 'macos-13':
        // macOS 不直接支持，退化为 alpine
        return 'alpine:latest';
      default:
        return 'ubuntu:latest';
    }
  };

  // ------ Utils ------
  const indentBlock = (text, spaces = 2) => {
    const pad = ' '.repeat(spaces);
    return String(text)
      .split('\n')
      .map((line) => (line.trim().length ? pad + line : line))
      .join('\n');
  };

  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

  const quoteIfNeeded = (s) => {
    const str = String(s);
    return /[:#\-?*&!|>'"%@`{}[\],\s]/.test(str) ? JSON.stringify(str) : str;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>GitHub Actions to CNB Converter</h1>
        <a
          href="https://cnb.cool/haorwen/action2cnb"
          className="repo-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          项目仓库
        </a>
        <p>Upload a GitHub Actions workflow file (.yml) to convert it to CNB format</p>
      </header>
      <div className="early-stage-note">
        该项目目前处于早期开发阶段，如果您遇到任何问题，请提交issue反馈。<br />本项目只是方便基础语法的转换，部分高级语法可能无法转换，请参考CNB官方文档修改并检查后进行使用。
      </div>
      <main className="App-main">
        <div className="converter-container">
          <div className="file-upload">
            <input
              type="file"
              accept=".yml,.yaml"
              onChange={handleFileUpload}
              className="file-input"
            />
            <button onClick={loadSampleFile} className="sample-button">
              加载示例
            </button>
            <button onClick={convertToCNB} className="convert-button" disabled={!githubYaml}>
              转换成cnb.yml
            </button>
          </div>

          <div className="options">
            <label className="option-label">
              <input
                type="checkbox"
                checked={useYamlAnchors}
                onChange={(e) => setUseYamlAnchors(e.target.checked)}
              />
              使用 YAML 锚点和别名简化配置（推荐）
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="editors">
            <div className="editor-container">
              <h3>GitHub Actions Workflow</h3>
              <textarea
                value={githubYaml}
                onChange={(e) => setGithubYaml(e.target.value)}
                placeholder="上传你的github workflow文件或者直接在这里粘贴"
                className="code-editor"
              />
            </div>

            <div className="editor-container">
              <h3>CNB Workflow</h3>
              <textarea
                value={cnbYaml}
                readOnly
                placeholder="转换完的CNB流水线会在这里展示"
                className="code-editor"
              />
            </div>
          </div>

          {cnbYaml && (
            <div className="download-section">
              <a
                href={`data:text/yaml;charset=utf-8,${encodeURIComponent(cnbYaml)}`}
                download=".cnb.yml"
                className="download-button"
              >
                Download CNB Workflow
              </a>
            </div>
          )}

          <div className="info-section">
            <h3>什么是 CNB YAML 高级语法</h3>
            <p>
              CNB 支持 YAML 高级语法，如锚点 (&)、别名 (*) 和对象合并 (&lt;&lt;) 符号来简化配置文件。
              这种方式可以减少重复，使配置文件更加简洁。建议打开使用 YAML 锚点和别名简化配置选项。
            </p>
            <pre className="code-example">
{`.pipeline: &pipeline  # 定义锚点\n  docker:\n    image: node:22\n  stages:\n    - name: install\n      script: npm install\n    - name: test\n      script: npm test\n\nmain:\n  pull_request:\n    - <<: *pipeline  # 使用别名引用\n  push:\n    - <<: *pipeline  # 使用别名引用`}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
