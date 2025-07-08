# GitHub Actions to CNB Converter

这个应用程序可以将 GitHub Actions 工作流文件转换为 CNB (Cloud Native Build) 格式。
你可以进入[action2cnb.haorwen.top](https://action2cnb.haorwen.top/)直接在线使用

> [!NOTE]
> 该项目目前处于早期开发阶段，如果您遇到任何问题，请提交issue反馈。

## 什么是 CNB?
[CNB](https://docs.cnb.cool/)是一个腾讯云推出，为国内开源项目提供全新的远程协作方式和算力支持，基于 Docker 生态的生产力工具，致力通过技术创新与高效资源利用，为开源社区注入新活力。

这个工具可以帮助你将工作流从 GitHub Actions 迁移到 CNB并自动转换语法。

## 功能特点

- 上传 GitHub Actions 工作流文件 (.yml 或 .yaml)
- 直接粘贴 GitHub Actions 工作流 YAML
- 一键转换为 CNB 格式
- 下载转换后的 CNB 工作流文件

## 如何使用

1. 上传 GitHub Actions 工作流文件或在左侧编辑器中粘贴 YAML 内容
2. 点击 "转换为cnb.yml"
3. 在右侧编辑器中查看生成的 CNB 工作流
4. 下载 CNB 工作流文件

## 格式转换详情

### GitHub Actions 格式
```yaml
name: Node.js CI/CD

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Run tests
      run: npm test
```

### CNB 格式
```yaml
main:
  push:
    - name: push-build
      stages:
        - name: build
          runtime:
            type: DOCKER
            image: ubuntu:22.04
          tasks:
            - name: Checkout code
              script: git clone $REPO_URL ./
            - name: Run tests
              script: npm test
```

### 转换说明

转换器处理：

- 将 GitHub Actions 的 jobs 转换为 CNB 的 stages
- 将 GitHub Actions 的 runners 映射到适当的 CNB Docker 镜像
- 将 steps 转换为 CNB tasks
- 处理常见的 GitHub Actions，如 checkout 和 setup-node
- 映射工作流触发器


## 本地运行应用程序
先克隆仓库到本地，然后执行命令：
```bash
# 安装依赖
npm install

# 启动开发服务器
npm start
```

然后在浏览器中打开 [http://localhost:3000](http://localhost:3000)。


## 使用的技术

- React.js
- js-yaml 用于 YAML 解析和生成

## 许可证

MIT