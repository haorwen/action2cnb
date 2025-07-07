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
      // Parse the GitHub Actions workflow YAML
      const githubWorkflow = yaml.load(githubYaml);
      
      // Start creating the CNB workflow
      const cnbWorkflow = {};
      
      // Extract default branch from triggers
      let defaultBranch = 'main';
      if (githubWorkflow.on && githubWorkflow.on.push && githubWorkflow.on.push.branches) {
        defaultBranch = Array.isArray(githubWorkflow.on.push.branches) 
          ? githubWorkflow.on.push.branches[0] 
          : githubWorkflow.on.push.branches;
      }
      
      // Initialize the branch structure
      cnbWorkflow[defaultBranch] = {};
      
      // Process triggers and jobs
      if (githubWorkflow.on) {
        // Handle different trigger types
        const triggerTypes = typeof githubWorkflow.on === 'string' 
          ? [githubWorkflow.on] 
          : Array.isArray(githubWorkflow.on) 
            ? githubWorkflow.on 
            : Object.keys(githubWorkflow.on);
        
        // If using YAML anchors, create common pipeline templates
        if (useYamlAnchors && githubWorkflow.jobs) {
          // Create common job templates using YAML anchors
          const commonPipelines = {};
          
          // For each job, create a template
          Object.entries(githubWorkflow.jobs).forEach(([jobName, jobConfig]) => {
            const pipeline = createPipelineFromJob(jobName, jobConfig);
            commonPipelines[jobName] = pipeline;
          });
          
          // Add the templates as anchors at the beginning of the YAML
          cnbWorkflow['.templates'] = commonPipelines;
        }
        
        triggerTypes.forEach(triggerType => {
          // Initialize the trigger array in the CNB structure
          cnbWorkflow[defaultBranch][triggerType] = [];
          
          // Create a pipeline for each job in GitHub workflow
          if (githubWorkflow.jobs) {
            if (useYamlAnchors) {
              // Use references to the templates
              Object.keys(githubWorkflow.jobs).forEach(jobName => {
                cnbWorkflow[defaultBranch][triggerType].push({
                  name: `${triggerType}-${jobName}`,
                  '<<': `*${jobName}`
                });
              });
            } else {
              // Create full pipeline definitions
              Object.entries(githubWorkflow.jobs).forEach(([jobName, jobConfig]) => {
                const pipeline = {
                  name: `${triggerType}-${jobName}`,
                  stages: []
                };
                
                // Create a stage from the job
                const stage = {
                  name: jobName,
                  tasks: []
                };
                
                // Handle runner/environment
                if (jobConfig.runs_on) {
                  stage.runtime = {
                    type: "DOCKER",
                    image: mapRunnerToImage(jobConfig.runs_on)
                  };
                }
                
                // Convert steps to tasks
                if (jobConfig.steps) {
                  const tasks = jobConfig.steps.map((step, index) => {
                    const taskName = step.name || `task-${index + 1}`;
                    let script = '';
                    
                    // Handle different step types
                    if (step.uses) {
                      // It's an action
                      script = `# This would use GitHub Action: ${step.uses}\n# CNB equivalent command:\necho "Converting ${step.uses} action to CNB format"`;
                      
                      // Handle common GitHub Actions
                      if (step.uses.startsWith('actions/checkout@')) {
                        script = `git clone $REPO_URL ./\ngit checkout $COMMIT_ID`;
                      } else if (step.uses.startsWith('actions/setup-node@')) {
                        script = `# Setup Node.js environment\ncurl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash\nexport NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"\nnvm install ${step.with?.['node-version'] || 'lts/*'}\nnvm use ${step.with?.['node-version'] || 'lts/*'}`;
                      }
                    } else if (step.run) {
                      // It's a shell command
                      script = step.run;
                    }
                    
                    return {
                      name: taskName,
                      script: script
                    };
                  });
                  
                  stage.tasks = tasks;
                }
                
                pipeline.stages.push(stage);
                cnbWorkflow[defaultBranch][triggerType].push(pipeline);
              });
            }
          }
        });
      }
      
      // If using YAML anchors, add the anchor definitions
      if (useYamlAnchors) {
        // Add YAML anchors to the templates
        let yamlText = '';
        
        // Define templates with anchors
        if (cnbWorkflow['.templates']) {
          Object.entries(cnbWorkflow['.templates']).forEach(([name, template]) => {
            yamlText += `.${name}: &${name}\n`;
            yamlText += yaml.dump(template);
            yamlText += '\n';
          });
          
          // Remove the templates property
          delete cnbWorkflow['.templates'];
        }
        
        // Add the rest of the YAML
        yamlText += yaml.dump(cnbWorkflow);
        setCnbYaml(yamlText);
      } else {
        // Convert the CNB workflow to YAML without anchors
        const cnbYamlResult = yaml.dump(cnbWorkflow);
        setCnbYaml(cnbYamlResult);
      }
    } catch (err) {
      setError(`Error converting workflow: ${err.message}`);
      console.error(err);
    }
  };
  
  // Helper function to create a pipeline from a GitHub Actions job
  const createPipelineFromJob = (jobName, jobConfig) => {
    const pipeline = {
      stages: []
    };
    
    // Create a stage from the job
    const stage = {
      name: jobName,
      tasks: []
    };
    
    // Handle runner/environment
    if (jobConfig.runs_on) {
      stage.runtime = {
        type: "DOCKER",
        image: mapRunnerToImage(jobConfig.runs_on)
      };
    }
    
    // Convert steps to tasks
    if (jobConfig.steps) {
      const tasks = jobConfig.steps.map((step, index) => {
        const taskName = step.name || `task-${index + 1}`;
        let script = '';
        
        // Handle different step types
        if (step.uses) {
          // It's an action
          script = `# This would use GitHub Action: ${step.uses}\n# CNB equivalent command:\necho "Converting ${step.uses} action to CNB format"`;
          
          // Handle common GitHub Actions
          if (step.uses.startsWith('actions/checkout@')) {
            script = `git clone $REPO_URL ./\ngit checkout $COMMIT_ID`;
          } else if (step.uses.startsWith('actions/setup-node@')) {
            script = `# Setup Node.js environment\ncurl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash\nexport NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"\nnvm install ${step.with?.['node-version'] || 'lts/*'}\nnvm use ${step.with?.['node-version'] || 'lts/*'}`;
          }
        } else if (step.run) {
          // It's a shell command
          script = step.run;
        }
        
        return {
          name: taskName,
          script: script
        };
      });
      
      stage.tasks = tasks;
    }
    
    pipeline.stages.push(stage);
    return pipeline;
  };
  
  // Helper function to map GitHub Actions runner to CNB image
  const mapRunnerToImage = (runsOn) => {
    if (Array.isArray(runsOn)) {
      runsOn = runsOn[0]; // Take the first option
    }
    
    switch (runsOn) {
      case 'ubuntu-latest':
      case 'ubuntu-22.04':
        return 'ubuntu:22.04';
      case 'ubuntu-20.04':
        return 'ubuntu:20.04';
      case 'windows-latest':
        return 'mcr.microsoft.com/windows/servercore:ltsc2022';
      case 'macos-latest':
        return 'alpine:latest'; // CNB might not support macOS runners directly
      default:
        return 'ubuntu:latest';
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>GitHub Actions to CNB Converter</h1>
        <p>Upload a GitHub Actions workflow file (.yml) to convert it to CNB format</p>
      </header>
      <div className="early-stage-note">
        该项目目前处于早期开发阶段，如果您遇到任何问题，请提交issue反馈。
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
                download="cnb.yml"
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
{`.pipeline: &pipeline  # 定义锚点
  docker:
    image: node:22
  stages:
    - name: install
      script: npm install
    - name: test
      script: npm test

main:
  pull_request:
    - <<: *pipeline  # 使用别名引用
  push:
    - <<: *pipeline  # 使用别名引用`}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
