import yaml from 'js-yaml';
import yamlMerger from './yaml-merger.js';

/**
 * GitHub Actions 到 CNB 工作流转换器
 */
class WorkflowConverter {
  constructor() {
    // 构建可识别事件映射（将 GH 事件名映射为 CNB 支持的事件名）
    this.EVENT_MAP = {
      push: 'push',
      pull_request: 'pull_request',
      workflow_dispatch: 'web_trigger', // 页面手动触发
      repository_dispatch: 'api_trigger', // API 触发
    };
  }

  /**
   * 主转换方法
   * @param {string} githubYaml - GitHub Actions YAML 内容
   * @param {boolean} useYamlAnchors - 是否使用 YAML 锚点
   * @returns {string} - 转换后的 CNB YAML
   */
  convertToCNB(githubYaml, useYamlAnchors = true) {
    try {
      // 1) 解析 GitHub Actions workflow
      const githubWorkflow = yaml.load(githubYaml);
      if (!githubWorkflow) {
        throw new Error('无法解析 YAML：内容为空');
      }

      // 2) 分支选择（定时任务要求明确分支，不支持 glob，普通事件可用默认 main）
      let defaultBranch = 'main';
      if (githubWorkflow.on && githubWorkflow.on.push && githubWorkflow.on.push.branches) {
        const br = githubWorkflow.on.push.branches;
        defaultBranch = Array.isArray(br) ? (br[0] || 'main') : br || 'main';
      }

      // 3) 全局 env（pipeline 级别）
      const globalEnv = githubWorkflow.env || {};

      // 4) 收集 GH 触发类型（排除 schedule，schedule 单独处理为 crontab）
      const triggerOn = githubWorkflow.on;
      const rawTriggerTypes = (typeof triggerOn === 'string')
        ? [triggerOn]
        : Array.isArray(triggerOn)
          ? triggerOn
          : triggerOn ? Object.keys(triggerOn) : [];
      const triggerTypes = rawTriggerTypes.filter(t => t !== 'schedule');

      // 5) 分析依赖关系
      const dependencyGraph = this.buildDependencyGraph(githubWorkflow.jobs || {});

      // 6) 生成模板（使用锚点时会被 <<: *alias 合并）
      //    ——注意：矩阵 node-version 的 job，模板中**去掉 docker**，只保留可复用部分（env / stages 等）
      const templates = {}; // { [jobName]: pipelineTemplate }

      if (githubWorkflow.jobs) {
        Object.entries(githubWorkflow.jobs).forEach(([jobName, jobConfig]) => {
          const isMatrixNode =
            jobConfig?.strategy?.matrix &&
            jobConfig.strategy.matrix['node-version'];

          const pipelineTemplate = this.createPipelineFromJob(
            jobName,
            jobConfig,
            globalEnv,
            dependencyGraph,
            {
              stripDocker: Boolean(isMatrixNode), // 矩阵：模板不带 docker，实例再覆盖 image
            }
          );

          // 模板里不放 name，具体流水线实例再填 name，避免被合并覆盖
          delete pipelineTemplate.name;
          templates[jobName] = pipelineTemplate;
        });
      }

      // 6) 根据事件生成流水线引用（每个事件下引用模板）
      //    结构：{ branchKey: { eventKey: [ { alias, name, overrides? }, ... ] } }
      const branches = { [defaultBranch]: {} };

      // 普通事件（push / pull_request / web_trigger / api_trigger ...）
      triggerTypes.forEach(ghEvent => {
        const eventKey = this.EVENT_MAP[ghEvent];
        if (!eventKey) return; // 跳过 CNB 不支持的事件
        branches[defaultBranch][eventKey] = [];

        if (githubWorkflow.jobs) {
          Object.entries(githubWorkflow.jobs).forEach(([jobName, jobConfig]) => {
            // 针对 Node.js 矩阵构建：模板复用除 image 外所有内容，实例只覆盖 docker.image
            const nodeVers = jobConfig?.strategy?.matrix?.['node-version'];
            if (nodeVers) {
              const versions = Array.isArray(nodeVers) ? nodeVers : [nodeVers];
              versions.forEach(ver => {
                const cleanVer = this.normalizeNodeVer(ver); // 去掉前导 v 与末尾 .x
                branches[defaultBranch][eventKey].push({
                  alias: jobName, // 复用基础模板（不含 docker）
                  name: `${eventKey}-${jobName}-node${cleanVer}`,
                  overrides: { docker: { image: `node:${cleanVer}` } }, // 仅覆盖镜像
                });
              });
            } else {
              // 非矩阵：直接复用模板（模板里已经包含 docker 或没有 docker）
              branches[defaultBranch][eventKey].push({
                alias: jobName,
                name: `${eventKey}-${jobName}`,
              });
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
            Object.entries(githubWorkflow.jobs).forEach(([jobName, jobConfig]) => {
              const nodeVers = jobConfig?.strategy?.matrix?.['node-version'];
              if (nodeVers) {
                const versions = Array.isArray(nodeVers) ? nodeVers : [nodeVers];
                versions.forEach(ver => {
                  const cleanVer = this.normalizeNodeVer(ver);
                  branches[defaultBranch][cronKey].push({
                    alias: jobName,
                    name: `crontab-${jobName}-node${cleanVer}`,
                    overrides: { docker: { image: `node:${cleanVer}` } },
                  });
                });
              } else {
                branches[defaultBranch][cronKey].push({
                  alias: jobName,
                  name: `crontab-${jobName}`,
                });
              }
            });
          }
        });
      }

      // 7) 输出 YAML
      if (useYamlAnchors) {
        // (A) 使用锚点与别名，构造正确的 <<: *alias 语法，并在实例级合并 overrides（仅镜像）
        return yamlMerger.buildYamlWithAnchors(templates, branches);
      } else {
        // (B) 先生成锚点版本，然后展开锚点为完整内容
        const anchoredYaml = yamlMerger.buildYamlWithAnchors(templates, branches);
        return yamlMerger.expandAnchorsToFullYaml(anchoredYaml);
      }
    } catch (err) {
      throw new Error(`Error converting workflow: ${err.message}`);
    }
  }


  /**
   * 构建依赖关系图
   * @param {Object} jobs - GitHub Actions jobs 对象
   * @returns {Object} - 依赖关系图 { jobName: { needs: [...], dependents: [...] } }
   */
  buildDependencyGraph(jobs) {
    const graph = {};
    
    // 初始化图节点
    Object.keys(jobs).forEach(jobName => {
      graph[jobName] = { needs: [], dependents: [] };
    });

    // 构建依赖关系
    Object.entries(jobs).forEach(([jobName, jobConfig]) => {
      const needs = jobConfig.needs || [];
      const needsList = Array.isArray(needs) ? needs : [needs];
      
      needsList.forEach(dependency => {
        if (typeof dependency === 'string' && graph[dependency]) {
          graph[jobName].needs.push(dependency);
          graph[dependency].dependents.push(jobName);
        }
      });
    });

    return graph;
  }

  // Helper: 创建模板 Pipeline（符合 CNB 语法：pipeline.docker/env/stages）
  // 仅生成 stages，不再生成 jobs 级别
  createPipelineFromJob(jobName, jobConfig, globalEnv = {}, dependencyGraph = {}, options = {}) {
    const { stripDocker = false } = options;

    const pipeline = {
      env: Object.keys(globalEnv).length ? { ...globalEnv } : undefined,
      docker: undefined,
      stages: []
    };

    // 1) 解析 runs-on -> docker.image（注意 GH 用的是 "runs-on"）
    const runsOn = jobConfig?.runsOn || jobConfig?.['runs-on'];
    const mappedImage = this.mapRunnerToDockerImage(runsOn);

    // 2) 添加依赖等待 stages（cnb:await）
    const stages = [];
    const jobDependencies = dependencyGraph[jobName]?.needs || [];
    
    jobDependencies.forEach(dependency => {
      stages.push({
        name: `wait for ${dependency}`,
        type: 'cnb:await',
        options: {
          key: dependency
        }
      });
    });

    // 3) 将 steps 转换为多个 Stage（每个 step = 一个 stage，直接含 script，不再嵌套 jobs）
    // job 级 env（stage 级生效：每个 stage 继承 job env，再叠加 step env）
    const jobLevelEnv = (jobConfig && jobConfig.env && Object.keys(jobConfig.env).length > 0)
      ? { ...jobConfig.env }
      : undefined;

    let imageFromSetupNode = undefined;

    if (Array.isArray(jobConfig?.steps)) {
      jobConfig.steps.forEach((step, index) => {
        const taskName = step.name || `step-${index + 1}`;
        const stepEnv = step.env && Object.keys(step.env).length > 0 ? { ...step.env } : undefined;

        // 新建一个 stage 对应这个 step（直接包含 script，不再嵌套 jobs）
        const stage = { name: taskName };

        if (jobLevelEnv) {
          stage.env = { ...jobLevelEnv };
        }
        if (stepEnv) {
          stage.env = { ...(stage.env || {}), ...stepEnv };
        }

        if (step.uses) {
          if (String(step.uses).startsWith('actions/checkout@')) {
            return; // 跳过
          }
          if (String(step.uses).startsWith('actions/setup-node@')) {
            // 统一处理 node-version：去掉前导 v 与末尾 .x，最终镜像如 node:18
            const ver = step.with?.['node-version'] || step.with?.['node-version-file'] || '20';
            imageFromSetupNode = `node:${this.normalizeNodeVer(ver)}`;
            return; // 只用于推断镜像，不产生 stage
          }
          // 其他 uses：提示手动替换
          stage.script = `# 使用 GitHub Action: ${step.uses}\n# 请手动替换为等效 CNB 插件或脚本`;
          stages.push(stage);
          return;
        }

        if (step.run) {
          stage.script = String(step.run);
        } else if (!stage.script) {
          stage.script = '# no-op';
        }

        stages.push(stage);
      });
    }

    // 4) 添加完成信号 stage（cnb:resolve）
    // 只有当有其他 job 依赖于当前 job 时才添加 resolve stage
    const hasDependents = dependencyGraph[jobName]?.dependents?.length > 0;
    if (hasDependents) {
      stages.push({
        name: `resolve for ${jobName}`,
        type: 'cnb:resolve',
        options: {
          key: jobName
        }
      });
    }

    // 如果 stripDocker=true（矩阵），则**不**在模板写 docker，留给实例覆盖；否则写入推断的镜像
    const finalImage = imageFromSetupNode || mappedImage;
    if (!stripDocker && finalImage) {
      pipeline.docker = { image: finalImage };
    }

    // 没有 steps 的空任务，给个占位 stage 避免语法错误
    if (!stages.length) {
      stages.push({ name: 'noop', script: 'echo "noop"' });
    }

    pipeline.stages.push(...stages);

    // 清理 undefined
    if (!pipeline.env) delete pipeline.env;
    if (!pipeline.docker) delete pipeline.docker;

    return pipeline;
  }

  // 统一标准化 Node 版本：去前导 v、去末尾 .x（如 v18.x -> 18）
  normalizeNodeVer(ver) {
    let v = String(ver).trim();
    if (v.startsWith('v')) v = v.slice(1);
    if (v.endsWith('.x')) v = v.slice(0, -2);
    return v;
  }

  // GH Runner 到 CNB docker.image 的简单映射
  mapRunnerToDockerImage(runsOn) {
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
  }

}

// 创建单例实例并导出
const converter = new WorkflowConverter();

export default converter;