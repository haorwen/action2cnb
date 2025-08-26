---
title: 从 GitHub Actions 迁移到 CNB
permalink: https://docs.cnb.cool/zh/build/migrate-to-cnb/migrate-from-github-actions.html
summary: 该文本是CNB（云原生构建）的官方迁移指南，详细对比了GitHub Actions与CNB在CI/CD工作流配置上的差异，包括语法结构、触发规则、运行环境、缓存策略、制品管理等核心功能，帮助用户从GitHub Actions平滑迁移到CNB平台。
---

## 简介

GitHub Actions 和 CNB 都允许您创建能自动构建、测试、发布、发行和部署代码的工作流。 CNB 和 GitHub Actions 的工作流配置有一些相似之处：

- 工作流配置文件以 YAML 编写并存储在代码仓库中。（在 CNB 中，工作流称为流水线 Pipeline）
- 工作流包括一项或多项任务。（在 CNB 中，任务对应的是阶段 Stage）
- 任务包括一个或多个步骤或单个命令。(在 CNB 中，步骤对应的是任务 Job , 每个任务可以执行一系列命令或者插件)

本指南将重点说明两者差异，以便您将 GitHub Actions 迁移到 CNB。

## 工作流配置

- GitHub Actions 是每个工作流配置为一个单独的 YAML 文件，存放在`.github/workflows`目录。

- CNB 是所有工作流配置文件都存储在仓库根目录名为 [.cnb.yml](https://docs.cnb.cool/zh/build/quick-start.md) 的文件中（也可以通过 [include](https://docs.cnb.cool/zh/build/configuration.md#include) 关键字在文件中导入其他配置文件）。

以下是两者语法的主要差异：

GitHub Actions 格式

```yaml
name: Node.js CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: npm test
```

CNB 格式

```yaml
main:
  push: &build
    - name: Node.js CI/CD
      stages:
        - name: build
          image: ubuntu:latest
          jobs:
            - name: Run tests
              script: npm test
  pull_request: *build
```

::: tip
注： `&`，`*` 是 `YAML` 的语法，用与配置复用，详见 [YAML高级语法](https://docs.cnb.cool/zh/build/simplify-configuration.md#yaml-gao-ji-yu-fa)
:::

## 构建触发规则

在 GitHub Actions 中，通过指定 `on` 字段定义工作流触发的规则。 在 CNB 中，您可以通过编写`触发分支`、`触发事件`来定义构建流水线被触发的规则。详见 [构建触发规则](https://docs.cnb.cool/zh/build/trigger-rule.md)。

GitHub Actions 格式

```yaml
name: Node.js CI/CD

on:
  push:
    branches: [main]

jobs:
  build:
    steps:
      - name: echo
        run: echo "do some job"
```

CNB 格式

```yaml
# .cnb.yml
main: # 触发分支
  push: # 触发事件，对应一个构建，可以包含多条 Pipeline。即可以是数组，也可以是对象。
    - stages: # 流水线1
        - name: echo
          script: echo "do some job"
```

## Runners

- 在 GitHub Actions 中, Runner指的是执行任务的一个虚拟机，比如`macOS`、`Windows` `Linux`等。
- 在 CNB 中，Runner指的是一个构建节点（默认是一个运行docker容器的节点），目前CNB提供的官方托管的构建节点，仅支持Linux系统的docker容器作为Runner。而CNB的企业版（私有化版本）, 可以自行接入不同的机器(`macOS`、`Windows`、`Linux`)。具体详见 [构建集群](https://docs.cnb.cool/zh/build/saas/build-node.html)。

GitHub Actions 使用`runs-on`字段指定 Runner，而 CNB 使用 `runner` 字段指定构建节点的架构（`amd64`或`arm64`等）和`cpu`及`内存`配置。

GitHub Actions 格式

```yaml
linux_job:
  runs-on: ubuntu-latest
  steps:
    - run: echo "Hello, $USER!"
```

CNB 格式

```yaml
main:
  push:
    - runner:
        tags: cnb:arch:amd64 # 指定在 amd64 架构构建集群上执行
        cpus: 16 # 指定分配的CPU数为16核（内存数自动分配为 核数*2 GiB ）
      docker:
        image: ubuntu:latest # 指定使用 ubuntu:latest 镜像作为流水线运行环境
      stages:
        - name: echo
          script: echo "Hello, $USER!"
```

## 构建环境

- 在 GitHub Actions 中，工作流是运行在一个虚拟机环境，因此构建环境中的需要的任何软件要么是预先安装在虚拟机上的，要么必须手动安装。
- 在 CNB 中，工作流是运行在一个或多个可以指定 docker 镜像的 docker 容器中。在构建过程中，只需要在配置文件中指定所需镜像或 Dockerfile 文件，即可完成构建环境的安装。具体详见 [构建环境](https://docs.cnb.cool/zh/build/build-env.md)。

GitHub Actions 格式

```yaml
linux_job:
  runs-on: ubuntu-latest
  steps:
    - name: Use Node.js 21
      uses: actions/setup-node@v4
      with:
        node-version: 21
    - run: npm ci
    - run: npm run build --if-present
    - run: npm test
```

CNB 格式

```yaml
main:
  push:
    - docker:
        image: node:21 # 使用 node:21 作为流水线运行环境
      stages:
        - name: npm ci
          script: npm ci
        - name: build
          script: npm run build --if-present
        - name: npm test
          script: npm test
```

## 仓库代码准备

- 在 GitHub Actions 中，工作流使用 `actions/checkout` 拉取仓库代码
- 在 CNB 中，工作流默认就会拉取仓库代码，无需显示声明。详细配置方式见 [流水线语法-仓库配置](https://docs.cnb.cool/zh/build/grammar.md#git)。

GitHub Actions 格式

```yaml
linux_job:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: ls -al .
```

CNB 格式

```yaml
main:
  push:
    - stages:
        - name: ls
          script: ls -al .
```

## 条件触发

- 在 GitHub Actions 中，工作流使用`if`字段设置步骤执行条件。
- 在 CNB 中，工作流使用`if`,`ifModify`,`ifNewBranch`等字段设置步骤执行条件。详见 [流水线语法-if](https://docs.cnb.cool/zh/build/grammar.md#stage-if)。

GitHub Actions 格式

```yaml
jobs:
  deploy_prod:
    if: contains( github.ref, 'master')
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploy to production server"
```

CNB 格式

```yaml
$:
  push:
    - if: echo "$CNB_BRANCH" | grep -q 'master'
      stages:
        - name: Deploy to production server
          script: echo "Deploy to production server"
```

## 任务依赖

- 在 GitHub Actions 中，工作流使用`needs`字段定义工作流依赖关系。
- 在 CNB 中，工作流使用`cnb:await`,`cnb:resolve`两个内置任务，来定义工作流依赖关系和传递变量。详见 [await-resolve内置任务](https://docs.cnb.cool/zh/build/internal-steps/#cnb-await-resolve)

GitHub Actions 格式

```yaml
jobs:
  build_a:
    runs-on: ubuntu-latest
    steps:
      - run: echo "This job will be run first."

  build_b:
    runs-on: ubuntu-latest
    steps:
      - run: echo "This job will be run first, in parallel with build_a"

  test_ab:
    runs-on: ubuntu-latest
    needs: [build_a, build_b]
    steps:
      - run: echo "This job will run after build_a and build_b have finished"

  deploy_ab:
    runs-on: ubuntu-latest
    needs: [test_ab]
    steps:
      - run: echo "This job will run after test_ab is complete"
```

CNB 格式

```yaml
main:
  push:
    - name: build_a
      docker:
        image: ubuntu:latest
      stages:
        - name: build_a
          script: echo "This job will be run first."
        - name: resolve for test_ab
          type: cnb:resolve
          options:
            key: build_a
    - name: build_b
      docker:
        image: ubuntu:latest
      stages:
        - name: build_b
          script: echo "This job will be run first, in parallel with build_a"
        - name: resolve for test_ab
          type: cnb:resolve
          options:
            key: build_b
    - name: test_ab
      docker:
        image: ubuntu:latest
      stages:
        - name: wait for build_a
          type: cnb:await
          options:
            key: build_a
        - name: wait for build_b
          type: cnb:await
          options:
            key: build_b
        - name: build_a
          script: echo "This job will run after build_a and build_b have finished"
        - name: resolve for test_ab
          type: cnb:resolve
          options:
            key: test_ab
    - name: deploy_ab
      docker:
        image: ubuntu:latest
      stages:
        - name: wait for test_ab
          type: cnb:await
          options:
            key: test_ab
        - name: deploy_ab
          script: echo "This job will run after test_ab is complete"
```

## 变量和密钥

- 在 GitHub Actions 中，工作流使用`env`字段指定变量，使用`secrets`变量来引用密钥。
- 在 CNB 中，工作流使用`env`字段指定变量，用`imports`字段来引用外部仓库或密钥仓库文件作为环境变量。详见 [引用变量](https://docs.cnb.cool/zh/build/grammar.md#pipeline-imports) 和 [密钥仓库](https://docs.cnb.cool/zh/repo/secret.md)。

GitHub Actions 格式

```yaml
jobs:
  deploy_prod:
    runs-on: ubuntu-latest
    env:
      DEPLOYMENT_ENV: production
    steps:
      - run: echo "This job will deploy to the $DEPLOYMENT_ENV server"
```

CNB 格式

```yaml
#env.yml
DEPLOYMENT_ENV: "production"
```

```yaml
#.cnb.yml
main:
  push:
    - imports:
        - __ENV__CNB_HOST/<your-repo-slug>/-/blob/main/xxx/env.yml
      stages:
        - name: Deploy to the $DEPLOYMENT_ENV server
          script: echo "This job will deploy to the $DEPLOYMENT_ENV server"
```

## 矩阵策略

- 在 GitHUb Actions 中，工作流可以使用矩阵策略，在单个作业定义中使用变量自动创建基于变量组合的多个作业运行。
- 在 CNB 中，工作流不支持这种策略。但可以使用YAML的锚点功能，模拟矩阵策略。参考 [YAML高级语法](https://docs.cnb.cool/zh/build/simplify-configuration.md#yaml-gao-ji-yu-fa)

GitHub Actions 格式

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [15.x, 16.x]
    steps:
      - uses: actions/checkout@v3
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      - name: Install node modules
        run: npm install
      - name: Run a one-line script
        run: npm run build
      - name: Run a multi-line script
        run: npm run test
```

CNB 格式

```yaml
main:
  push:
    - docker:
        image: node:14
      stages: &BVT-tesing-stages
        - name: Install node modules
          script: npm install
        - name: Run a one-line script
          script: npm run build
        - name: Run a multi-line script
          script: npm run test
    - docker:
        image: node:16
      stages: *BVT-tesing-stages
```

## 缓存

- 在 GitHub Actions 中，工作流使用缓存策略，将构建过程中产生的中间产物暂存到缓存区，方便下次构建时使用。
- 在 CNB 中，工作流使用`pipeline.runner.volumes`声明`节点本地缓存`或者使用`docker:cache`内置任务来声明`远端docker镜像缓存`，来存放构建过程中的依赖缓存或中间产物。详见 [流水线缓存](https://docs.cnb.cool/zh/build/pipeline-cache.md)

GitHub Actions 格式

```yaml
jobs:
  deploy_prod:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v2
      - name: Cache node modules
        uses: actions/cache@v2
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-
      - name: Build project
        run: npm ci && npm run build
```

CNB 格式

```yaml
# 使用`pipeline.runner.volumes`声明`节点本地缓存`
main:
  push:
    - docker:
        image: node:14
        volumes:
          - /root/.npm # 声明本地的缓存目录
      stages:
        - name: Build project
          script: npm ci && npm run build
```

```yaml
# 使用`docker:cache`内置任务来声明`远端docker镜像缓存`
main:
  push:
    - docker:
        image: node:14
      stages:
        - name: build cache image
          type: docker:cache
          options:
            dockerfile: cache.dockerfile
            # by 支持以下两种形式：数组、字符串
            by:
              - package.json
              - package-lock.json
            # versionBy: package-lock.json
            versionBy:
              - package-lock.json
          exports:
            name: DOCKER_CACHE_IMAGE_NAME
        - name: use cache
          image: $DOCKER_CACHE_IMAGE_NAME
          # 将 cache 中的文件拷贝过来使用
          commands:
            - cp -r "$NODE_PATH" ./node_modules
        - name: Build project
          script: npm ci && npm run build
```

其中 cache.dockerfile 是一个用于构建缓存镜像的 Dockerfile，示例：

```dockerfile
# 选择一个 Base 镜像
FROM node:14

# 设置工作目录
WORKDIR /space

# 将 by 中的文件列表 COPY 过来
COPY . .

# 根据 COPY 过来的文件进行依赖的安装
RUN npm ci

# 设置好需要的环境变量
ENV NODE_PATH=/space/node_modules
```

## 制品

- 在 Github Actions 中，工作流使用`actions/upload-artifact`动作上传制品
- 在 CNB 中，工作流使用`cnbcool/attachments:latest`插件上传制品，详见 [附件插件](https://docs.cnb.cool/zh/plugin/#public/cnbcool/attachments)

GitHub Actions 格式

```yaml
jobs:
  deploy_prod:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v2
      - name: Upload a Build Artifact
        uses: actions/upload-artifact@v2
        with:
          name: my-artifact
          path: /path/to/artifact
```

CNB 格式

```yaml
main:
  push:
    - docker:
        image: ubuntu:latest
      stages:
        - name: Upload a Build Artifact
          image: cnbcool/attachments:latest
          settings:
            attachments:
              - /path/to/artifact
```

## 数据库及服务容器

- 在 GitHub Actions 中，工作流使用 `services` 字段，来编排数据库及服务容器。
- 在 CNB 中，工作流可以通过声明 `docker` 服务, 直接使用在任务里执行 `docker` 或`docker compose`命令，来启动数据库及服务容器。详见 [docker服务](https://docs.cnb.cool/zh/build/grammar.md#service-docker)

GitHub Actions 格式

```yaml
jobs:
  container-job:
    runs-on: ubuntu-latest
    container: node:20-bookworm-slim

    services:
      postgres:
        image: postgres
        env:
          POSTGRES_PASSWORD: postgres

    steps:
      - name: Check out repository code
        uses: actions/checkout@v4

      # Performs a clean installation of all dependencies
      # in the `package.json` file
      - name: Install dependencies
        run: npm ci

      - name: Connect to PostgreSQL
        # Runs a script that creates a PostgreSQL client,
        # populates the client with data, and retrieves data
        run: node client.js
        env:
          # The hostname used to communicate with the
          # PostgreSQL service container
          POSTGRES_HOST: postgres
          # The default PostgreSQL port
          POSTGRES_PORT: 5432
```

CNB 格式

```yaml
# 直接在任务中使用`docker compose`命令，来编排数据库及服务容器
main:
  push:
    - docker:
        image: ubuntu:latest
      services:
        - docker # 声明后，流水线容器会自动启动dind服务且主动注入docker cli工具
      stages:
        - name: Start database and service
          script: docker-compose up -d
        - name: Runs a script that creates a PostgreSQL client, populates the client with data, and retrieves data
          script: node client.js
          env:
            POSTGRES_HOST: 127.0.0.1
            POSTGRES_PORT: 5432
```
