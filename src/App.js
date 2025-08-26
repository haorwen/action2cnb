import React, { useState, useRef } from 'react';
import './App.css';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-yaml';
import 'prismjs/themes/prism.css'; // Example theme
import converter from './converter';
import { optimizeWithAI } from './ai-optimizer';

function App() {
  const [githubYaml, setGithubYaml] = useState('');
  const [cnbYaml, setCnbYaml] = useState('');
  const [error, setError] = useState('');
  const [useYamlAnchors, setUseYamlAnchors] = useState(true);
  const [optimizedYaml, setOptimizedYaml] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState('');
  const [hasOptimized, setHasOptimized] = useState(false);
  const [lastOptimizedWorkflow, setLastOptimizedWorkflow] = useState(null);

  const githubEditorRef = useRef(null);
  const cnbEditorRef = useRef(null);

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
    setOptimizeError('');

    try {
      const result = converter.convertToCNB(githubYaml, useYamlAnchors);

      // Only clear the optimization if the underlying cnb.yml has actually changed.
      // This preserves the optimized result if the conversion is idempotent.
      if (result !== cnbYaml) {
        setOptimizedYaml('');
        setHasOptimized(false);
        setLastOptimizedWorkflow(null);
      }

      setCnbYaml(result);
    } catch (err) {
      setError(err.message);
      console.error(err);
    }
  };

  const handleAiOptimize = async () => {
    setOptimizeError('');
    setOptimizedYaml('');
    setIsOptimizing(true);
    let finalContent = '';
  
    try {
      const stream = await optimizeWithAI(githubYaml, cnbYaml);
      // console.log("Stream started...");
      for await (const chunk of stream) {
        // console.log("Received chunk:", chunk); // Log each received chunk
        const token = chunk.choices[0]?.delta?.content || '';
        finalContent += token;
        setOptimizedYaml(finalContent);
      }
      console.log("Stream finished.");
    } catch (err) {
      setOptimizeError(err.message);
      console.error(err);
    } finally {
      // Extract content from the markdown code block after stream ends
      const match = finalContent.match(/```(?:yaml\n)?([\s\S]*?)```/);
      if (match && match[1]) {
        const optimizedContent = match[1].trim();
        setOptimizedYaml(optimizedContent);
        if (optimizedContent) {
          setHasOptimized(true);
          setLastOptimizedWorkflow(githubYaml); // Store the workflow that was just optimized
        }
      }
      setIsOptimizing(false);
    }
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
              <div
                ref={githubEditorRef}
                className="code-editor"
                onClick={() => githubEditorRef.current?.querySelector('textarea')?.focus()}
              >
                <Editor
                  value={githubYaml}
                  onValueChange={code => {
                    setGithubYaml(code);
                    // When source changes, all derived data is invalid
                    setCnbYaml('');
                    setOptimizedYaml('');
                    setHasOptimized(false);
                    setLastOptimizedWorkflow(null);
                  }}
                  highlight={code => highlight(code, languages.yaml, 'yaml')}
                  padding={10}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                  placeholder="上传你的github workflow文件或者直接在这里粘贴"
                />
              </div>
            </div>

            <div className="editor-container">
              <h3>CNB Workflow</h3>
              <div
                ref={cnbEditorRef}
                className="code-editor"
                onClick={() => cnbEditorRef.current?.querySelector('textarea')?.focus()}
              >
                <Editor
                  value={cnbYaml}
                  onValueChange={code => setCnbYaml(code)}
                  highlight={code => highlight(code, languages.yaml, 'yaml')}
                  padding={10}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                  placeholder="转换完的CNB流水线会在这里展示"
                />
              </div>
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
              <button onClick={handleAiOptimize} className="optimize-button" disabled={!cnbYaml || isOptimizing || (hasOptimized && githubYaml === lastOptimizedWorkflow)}>
                {isOptimizing ? '正在优化...' : (hasOptimized && githubYaml === lastOptimizedWorkflow) ? '已优化' : 'AI 优化 (Beta)'}
              </button>
            </div>
          )}

          {optimizeError && <div className="error-message">{optimizeError}</div>}
          {isOptimizing && <div className="loading-message">AI 正在思考中，请稍候...</div>}

          {optimizedYaml && (
            <div className="editor-container optimized-container">
              <h3>AI 优化后的 CNB Workflow</h3>
              <div className="code-editor">
                <Editor
                  value={optimizedYaml}
                  onValueChange={code => setOptimizedYaml(code)}
                  highlight={code => highlight(code, languages.yaml, 'yaml')}
                  padding={10}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 12,
                    lineHeight: 1.5,
                    backgroundColor: '#f0f8ff'
                  }}
                  readOnly
                />
              </div>
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

