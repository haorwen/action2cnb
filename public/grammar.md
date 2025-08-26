---
title: 流水线语法
permalink: https://docs.cnb.cool/zh/build/grammar.html
summary: 该文本详细介绍了流水线语法，包括基本概念如 Pipeline、Stage 和 Job，以及它们的配置方法。文本解释了如何定义不同类型的任务，如脚本任务、内置任务和插件任务，并提供了环境变量、锁机制和条件执行的配置选项。通过示例代码，文本展示了在不同触发事件下如何配置和运行流水线。
redirectFrom:
  - /zh/grammar.html
  - /zh/grammar/pipeline.html
  - /zh/grammar/stage.html
  - /zh/grammar/job.html
  - /zh/grammar/include.html
  - /zh/grammar/reference.html
---
## 基本概念

- `Pipeline`： 表示一个流水线，包含一个或者多个阶段 `Stage`，每个 `Stage` 依次执行。
- `Stage`： 表示一个构建阶段，可以由一个或者多个任务 `Job` 组成。
- `Job`： 最基本的任务执行单元。

```yaml
main: # 触发分支
  push: # 触发事件，对应一个构建，可以包含多条 Pipeline。即可以是数组，也可以是对象。
    - name: pipeline-1 # Pipeline 结构体
      stages:
        - name: stage-1 # Stage 结构体
          jobs:
            - name: job-1 # Job 结构体
              script: echo
```

```yaml
main: # 触发分支
  push: # 触发事件，对应一个构建，通过对象指定流水线
    pipeline-key:
      stages:
        - name: stage-1 # Stage 结构体
          jobs:
            - name: job-1 # Job 结构体
              script: echo
```

## Pipeline

`Pipeline` 表示一个流水线，包含一个或者多个阶段 `Stage`，每个 `Stage` 依次执行。

一个 `Pipeline` 的基本配置如下：

```yaml
name: 流水线名字
docker:
  image: node
  build: dev/Dockerfile
  volumes:
    - /root/.npm:copy-on-write
git:
  enable: true
  submodules: true
  lfs: true
services:
  - docker
env:
  TEST_KEY: TEST_VALUE
imports:
  - https://cnb.cool/<your-repo-slug>/-/blob/main/xxx/envs.yml
  - ./env.txt
label:
  type: MASTER
  class: MAIN
stages:
  - name: stage 1
    script: echo "stage 1"
  - name: stage 2
    script: echo "stage 2"
  - name: stage 3
    script: echo "stage 3"
failStages:
  - name: fail stage 1
    script: echo "fail stage 1"
  - name: fail stage 2
    script: echo "fail stage 2"
endStages:
  - name: end stage 1
    script: echo "end stage 1"
  - name: end stage 2
    script: echo "end stage 2"
ifModify:
  - a.txt
  - "src/**/*"
retry: 3
allowFailure: false
```

### name {#pipeline-name}

- type: `String`

指定流水线名，默认为 `pipeline`。当有多条并行流水线时，
默认流水线名为 `pipeline`、`pipeline-1`、`pipeline-2` 依此类推，
可定义 `name` 指定流水线名来区分不同流水线。

### runner

- type: `Object`

指定构建节点相关参数。

- `tags`: 可选，指定使用具备哪些标签的构建节点
- `cpus`: 可选，指定构建需使用的 cpu 核数

#### tags

- type: `String` ｜ `Array<String>`
- default: `cnb:arch:default`

指定使用具备哪些标签的构建节点。详见[构建节点](/zh/build/saas/build-node.md)。

示例：

```yaml
main:
  push:
    - runner:
        tags: cnb:arch:amd64
      stages:
        - name: uname
          script: uname -a
```

#### cpus

- type: `Number`

指定构建需使用的最大 cpu 核数（memory = cpu 核数 * 2 G），
其中 cpu 和 memory 不超过 runner 机器实际大小。

未配置，则最大可用 cpu 核数由分配到的 runner 机器配置来指定。

示例：

```yaml
# cpus = 1，memory = 2G
main:
  push:
    - runner:
        cpus: 1
      stages:
        - name: echo
          script: echo "hello world"
```

### docker

- type: `Object`

指定 `docker` 相关的参数。详情见[构建环境](./build-env.md)

- `image`: 当前 `Pipeline`  的环境镜像，在当前 `Pipeline` 下的所有任务都将在这个镜像环境中执行。
- `build`: 指定一个 `Dockerfile`，构建一个临时镜像，做为 `image` 的值使用。
- `volumes`: 声明数据卷，用于缓存场景。

#### image {#pipeline-image}

- type: `Object` | `String`

指定当前 `Pipeline`  的环境镜像，在当前 `Pipeline` 下的所有任务都将在这个镜像环境中执行，支持引用环境变量。

- `image.name`: `String` 镜像名，如 `node:20`。
- `image.dockerUser`: `String` 指定 Docker 用户名，用于拉取指定的镜像。
- `image.dockerPassword`: `String` 指定 Docker 用户密码，用于拉取指定的镜像。

如果指定 `image` 为字符串，则等同于指定了 `image.name`。

示例一，使用公开镜像：

```yaml
main:
  push:
    - docker:
        # 取 docker 官方镜像仓库中的 node:20 镜像作为构建容器
        image: node:20
      stages:
        - name: show version
          script: node -v
```

示例二，使用 CNB 制品库私有镜像：

```yaml
main:
  push:
    - docker:
        # 取非公开镜像作为构建容器，需传入 docker 用户名和密码
        image:
          name: docker.cnb.cool/images/pipeline-env:1.0
          # 使用 CI 构建时默认注入的环境变量
          dockerUser: $CNB_TOKEN_USER_NAME
          dockerPassword: $CNB_TOKEN
      stages:
        - name: echo
          script: echo "hello world"
```

示例三，使用 docker 官方镜像源私有镜像：

```yaml
main:
  push:
    - imports: https://cnb.cool/<your-repo-slug>/-/blob/main/xxx/docker.yml
      docker:
        # 取非公开镜像作为构建容器，需传入 docker 用户名和密码
        image:
          name: images/pipeline-env:1.0
          # docker.yml 中导入的环境变量
          dockerUser: $DOCKER_USER
          dockerPassword: $DOCKER_PASSWORD
      stages:
        - name: echo
          script: echo "hello world"
```

docker.yml

```yaml
DOCKER_USER: user
DOCKER_PASSWORD: password
```

#### build

- type: `Object` | `String`

指定一个 `Dockerfile`，构建一个临时镜像，做为 `image` 的值使用，支持引用环境变量。

使用 `build` 声明构建环境的完整示例可参考[docker-build-with-by](https://cnb.cool/examples/ecosystem/docker-build-with-by)。

以下是 `build` 下各参数的说明：

- `build.dockerfile`:
  - type: `String`
  
  `Dockerfile`路径。

- `build.target`:
  - type: `String`
  
  对应 docker build 中的 --target 参数，可以选择性地构建 Dockerfile 中的特定阶段，而不是构建整个 Dockerfile。

- `build.by`:
  - type: `Array<String>` | `String`

  用来声明缓存构建过程中依赖的文件列表。
  
  **注意：未出现在 `by` 列表中的文件，除了 Dockerfile，其他在构建镜像过程中，都当不存在处理。**

  `String` 类型时，多个文件可用英文逗号分隔。

- `build.versionBy`:
  - type: `Array<String>` | `String`

  用来进行版本控制，所指向的文件内容发生变化，我们就会认为是一个新的版本，
  具体的计算逻辑见这个表达式：sha1(dockerfile + versionBy + buildArgs)。

  `String`类型时，多个文件可用英文逗号分隔。  

- `build.buildArgs`:
  - type: `Object`
  
  在 build 时插入额外的构建参数 (--build-arg $key=$value),
  value 值为 null 时只加入 key (--build-arg $key)。

- `build.ignoreBuildArgsInVersion`:
  - type: `Boolean`

  版本计算是否忽略buildArgs。详见 `versionBy`。

- `build.sync`:
  - type: `String`

  是否等待 `docker push` 成功后才继续。默认为`false`。

如果指定`build`为字符串，则等同于指定了`build.dockerfile`。

**Dockerfile 用法：**

```yaml
main:
  push:
    - docker:
        # 通过 Dockerfile 指定构建环境
        build: ./image/Dockerfile
      stages:
        - stage1
        - stage2
        - stage3
```

```yaml
main:
  push:
    - docker:
        # 通过 Dockerfile 指定构建环境
        build:
          dockerfile: ./image/Dockerfile
          dockerImageName: cnb.cool/project/images/pipeline-env
          dockerUser: $DOCKER_USER
          dockerPassword: $DOCKER_PASSWORD
      stages:
        - stage1
        - stage2
        - stage3
```

```yaml
main:
  push:
    - docker:
        # 通过 Dockerfile 指定构建环境
        build:
          dockerfile: ./image/Dockerfile
          # 只构建 builder，而不是整个Dockerfile
          target: builder
      stages:
        - stage1
        - stage2
        - stage3
```

**Dockerfile versionBy 用法：**

示例：将 pnpm 缓存到环境镜像中，加速后续pnpm i过程

```yaml
main:
  push:
    # 通过 Dockerfile 指定构建环境
    - docker:
        build:
          dockerfile: ./Dockerfile
          versionBy:
            - package-lock.json
      stages:
        - name: pnpm i
          script: pnpm i
        - stage1
        - stage2
        - stage3
```

```dockerfile
FROM node:20

#替换真实的源
RUN npm config set registry https://xxx.com/npm/ \
  && npm i -g pnpm \
  && pnpm config set store-dir /lib/pnpm

WORKDIR /data/orange-ci/workspace

COPY package.json package-lock.json ./

RUN pnpm i
```

```text
[pnpm i] Progress: resolved 445, reused 444, downloaded 0, added 100
[pnpm i] Progress: resolved 445, reused 444, downloaded 0, added 141
[pnpm i] Progress: resolved 445, reused 444, downloaded 0, added 272
[pnpm i] Progress: resolved 445, reused 444, downloaded 0, added 444, done
[pnpm i] 
[pnpm i] dependencies:
[pnpm i] + mocha 8.4.0 (10.0.0 is available)
[pnpm i] 
[pnpm i] devDependencies:
[pnpm i] + babel-eslint 9.0.0 (10.1.0 is available)
[pnpm i] + eslint 5.16.0 (8.23.0 is available)
[pnpm i] + jest 27.5.1 (29.0.2 is available)
[pnpm i] 
[pnpm i] 
[pnpm i] Job finished, duration: 6.8s
```

#### volumes

- type: `Array<String>` | `String`

声明数据卷，多个数据卷可用通过数组或者用`,`号做分割符传入，可引用环境变量，支持的格式有：

1. `<group>:<path>:<type>`
2. `<path>:<type>`
3. `<path>`

各项含义：

- `group`: 可选，数据卷分组，不同组间相互隔离
- `path`: 必填，数据卷挂载绝对路径，支持绝对路径（`/` 开头） 或 相对路径（`./` 开头），相对于工作区
- `type`: 可选，数据卷类型，**缺省值为 `copy-on-write`**，支持以下类型：
  - `read-write` 或 `rw` : 读写，并发写冲突需自行处理，适用于串行构建场景
  - `read-only` 或 `ro` : 只读，写操作抛出异常
  - `copy-on-write` 或 `cow` : 读写，变更（新增、修改、删除）在 **流水线成功** 后被合并，适用于并发构建场景
  - `copy-on-write-read-only` : 只读，变更（新增、删除、修改）在流水线结束后丢弃
  - `data` : 创建一个临时数据卷，该数据卷在流水线结束时会自动清理

##### copy-on-write

用于缓存场景，支持并发

`copy-on-write` 技术允许系统在需要修改数据之前共享相同的数据副本，从而实现高效的缓存复制。
在并发环境中，这种方法避免了缓存的读写冲突，因为只有在实际需要修改数据时，才会创建数据的私有副本。
这样，只有写操作会导致数据复制，而读操作可以安全地并行进行，无需担心数据一致性问题。
这种机制显著提高了性能，尤其是在读多写少的缓存场景中。

##### data

用于共享数据，将容器中的指定目录，共享给其他容器中使用。

通过创建数据卷，然后 mount 到各容器中。
与直接将构建节点上目录 mount 到容器中方式不同的是：当指定的目录在容器中已经存在，
会先把容器中内容自动复制到数据卷，而不是将数据卷内容直接覆盖容器中目录。

##### volumes 示例

示例1 : 挂载构建节点上目录到容器中，实现本地缓存效果

```yaml
main:
  push:
    - docker:
        image: node:20
        # 声明数据卷
        volumes:
          - /data/config:read-only
          - /data/mydata:read-write

          # 使用缓存，同时更新
          - /root/.npm

          # 使用 main 缓存，同时更新
          - main:/root/.gradle:copy-on-write

      stages:
        - stage1
        - stage2
        - stage3
  pull_request:
    - docker:
        image: node:20

        # 声明数据卷
        volumes:
          - /data/config:read-only
          - /data/mydata:read-write

          # 使用 copy-on-write 缓存
          - /root/.npm
          - node_modules

          # pr 使用 main 缓存，但不更新
          - main:/root/.gradle:copy-on-write-read-only

      stages:
        - stage1
        - stage2
        - stage3
```

示例2：将打包在容器中的文件，共享到其他容器中使用

```yaml
# .cnb.yml
main:
  push:
    - docker:
        image: go-app-cli # 假设有个go应用在镜像的/go-app/cli路径下
        # 声明数据卷
        volumes:
          # 此路径在go-app-cli镜像存在，所以执行环境镜像时，会将此路径内容复制到临时数据卷中，可共享给其他任务容器里使用
          - /go-app
      stages:
        - name: show /go-app-cli in job container
          image: alpine
          script: ls /go-app
```

### git

- type: `Object`

提供 Git 仓库相关配置。

#### git.enable

- type: `Boolean`
- default: `true`

指定是否拉取代码。

`branch.delete` 事件，默认值为 `false`。其他事件，默认值为 `true`。

#### git.submodules

- type: `Object` | `Boolean`
- default:
  - enable: `true`
  - remote: `false`

指定是否要拉取子项目（submodules）。

当值为 `Boolean` 类型时，相当于指定 `git.submodules.enable` 为 `git.submodules` 的值，`git.submodules.remote` 为默认值 `false`。

##### git.submodules.enable

- type: `Boolean`
- default: `true`

是否指定是否要拉取子项目 `submodules`。

##### git.submodules.remote

- type: `Boolean`
- default: `false`

执行 `git submodule update` 时是否添加 `--remote` 参数，用于每次拉取 `submodule` 最新的代码

**基本用法：**

```yaml
main:
  push:
    - git:
        enable: true
        submodules: true
      stages:
        - name: echo
          script: echo "hello world"
    - git:
        enable: true
        submodules:
          enable: true
          remote: true
      stages:
        - name: echo
          script: echo "hello world"
```

#### git.lfs

- type: `Object` | `Boolean`
- default: `true`

指定是否要拉取 LFS 文件。

支持 `Object` 形式指定具体参数，字段缺省时，默认值为：

```json
{
  "enable": true
}
```

**基本用法：**

```yaml
main:
  push:
    - git:
        enable: true
        lfs: true
      stages:
        - name: echo
          script: echo "hello world"
    - git:
        enable: true
        lfs:
          enable: true
      stages:
        - name: echo
          script: echo "hello world"
```

##### git.lfs.enable

是否指定是否要拉取 LFS 文件。

### services

- type: `Array<String>`

用于声明构建时需要的服务，格式：`name:[version]`, `version` 是可选的。

目前支持的服务有：

- docker
- vscode

#### service:docker

用于开启 `dind` 服务，

当构建过程中需要使用 `docker build`，`docker login` 等操作时声明，
会自动在环境注入 `docker daemon` 和 `docker cli`。

示例：

```yaml
main:
  push:
    - services:
        - docker
      docker:
        image: alpine
      stages:
        - name: docker info
          script:
            - docker info
            - docker ps
```

该服务会自动 `docker login` 到 CNB Docker 制品库的镜像源(docker.cnb.cool)，
在后续任务中可直接 `docker push` 到当前仓库 Docker 制品库。

示例：

```yaml
main:
  push:
    - services:
        - docker
      stages:
        - name: build and push
          script: |
            # 根目录存在 Dockerfile 文件
            docker build -t ${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:latest .
            docker push ${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:latest
```

#### service:vscode

需要远程开发时声明。

示例：

```yaml
$:
  vscode:
    - services:
        - vscode
        - docker
      docker:
        image: alpine
      stages:
        - name: uname
          script: uname -a
```

### env {#pipeline-env}

- type: `Object`

指定环境变量。可以定义一组环境变量，在任务执行中使用。对当前 `Pipeline` 内的非插件任务均有效。

### imports {#pipeline-imports}

- type: `Array<String>` | `String`

指定 CNB Git 仓库文件路径（文件相对路径或 http 地址），可以读取此文件作为环境变量来源。

本地相对路径如 `./env.yml` 会被拼接成远端 http 文件地址进行加载。

**`云原生构建` 现支持[密钥仓库](../repo//secret.md)，安全性更高，支持文件引用审计，**
**一般使用一个密钥仓库来存放诸如 `npm` 、 `docker` 等账号密码。**

示例：

```yaml
#env.yml
DOCKER_USER: "username"
DOCKER_TOKEN: "token"
DOCKER_REGISTRY: "https://xxx/xxx"
```

```yaml
#.cnb.yml
main:
  push:
    - services:
        - docker
      imports:
        - https://cnb.cool/<your-repo-slug>/-/blob/main/xxx/env.yml
      stages:
        - name: docker push
          script: |
            docker login -u ${DOCKER_USER} -p "${DOCKER_TOKEN}" ${CNB_DOCKER_REGISTRY}
            docker build -t ${DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:latest .
            docker push ${DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:latest
```

>注意：对插件任务无效

支持的文件格式列表：

- `yaml`：解析文件后缀为 `.yml` 或 `.yaml`。
- `json`: 解析文件后缀为 `.json`。
- `plain`: 每行格式为 `key=value`，除了以上涉及的后缀都以此方式解析。**（不推荐）**

同名 key 优先级：

- 当配置 imports 为数组时，如遇到参数重复的情况，后面的配置会覆盖前面的。
- 如果和 `env` 参数中重复，那么 `env` 中的参数会覆盖掉 `imports` 文件中的。

变量赋值

`imports` 文件路径可读取环境变量。若是数组，下面的文件路径可读取上面文件中的变量。

```javascript
// env.json
{
    FILE: "https://cnb.cool/<your-repo-slug>/-/blob/main/xxx/env2.yml"
}
```

```yaml
# env2.yml
TEST_TOKEN: some token
```

```yaml
main:
  push:
    - imports:
        - ./env1.json
        - $FILE
      stages:
        - name: echo
          script: echo $TEST_TOKEN
```

被引用文件可声明可被访问范围，参考 [配置文件引用鉴权](./file-reference.md#权限检查)。

示例：

`team_name/project_name/*`，匹配一个项目下面的所有仓库：

```yaml
key: value

allow_slugs:
  - team_name/project_name/*
```

允许被所有仓库引用

```yaml
key: value

allow_slugs:
  - "**"
```

大部份场景配置文件是简单的单层对象，比如：

```javascript
// env.json
{
  "token": "private token",
  "password": "private password"
}
```

为了应对复杂的配置文件和场景，`imports` 支持对象嵌套！若引入的文件解析后的对象包含深层属性（第一层不能为数组），会平铺成单层对象，规则是：

1. 属性名保留，属性值会转成字符串
2. 属性值若为对象（包括数组），则会递归平铺，属性路径以 `_` 连接

```javascript
// env.json
{
  "key1": [
    "value1",
    "value2"
  ],
  "key2": {
    "subkey1": [
      "value3",
      "value4"
    ],
    "subkey2": "value5"
  },
  "key3": [
    "value6",
    {
      "subsubkey1": "value7"
    }
  ],
  "key4": "value8"
}
```

会平铺成

```javascript
{
      // 原属性值转成字符串
      "key1": "value1,value2",
      // 属性值若为对象，则额外进行递归平铺操作增加属性
      "key1_0": "value1",
      "key1_1": "value2",
      "key2": "[object Object]",
      "key2_subkey1": "value3,value4",
      "key2_subkey1_0": "value3",
      "key2_subkey1_1": "value4",
      "key2_subkey2": "value5",
      "key3": "value6,[object Object]",
      "key3_0": "value6",
      "key3_1": "[object Object]",
      "key3_1_subsubkey1": "value7",
      "key4": "value8"
    }
```

```yaml
main:
  push:
    - imports:
        - ./env.json
      stages:
        - name: echo
          script: echo $key3_1_subsubkey1
```

### label

- type: `Object`

为流水线指定标签。每个标签的值可以是一个字符串，也可以是一个字符串数组。该标签可用于后续流水线记录筛选等功能。

这里举一种工作流的例子：**main 分支合并即发布预发布环境，打 tag 后发布正式环境**。

```yaml
main:
  push:
    - label:
        # Master 分支的常规流水线
        type:
          - MASTER
          - PREVIEW
      stages:
        - name: install
          script: npm install
        - name: CCK-lint
          script: npm run lint
        - name: BVT-build
          script: npm run build
        - name: UT-test
          script: npm run test
        - name: pre release
          script: ./pre-release.sh

$:
  tag_push:
    - label:
        # 产品发布分支的常规流水线
        type: RELEASE
      stages:
        - name: install
          script: npm install
        - name: build
          script: npm run build
        - name: DELIVERY-release
          script: ./release.sh
```

### stages

- type: `Array<Stage|Job>`

定义一组阶段任务，每个阶段串行运行。

### failStages

- type: `Array<Stage|Job>`

定义一组失败阶段任务。当正常流程失败，会依次执行此阶段任务。

### endStages

- type: `Array<Stage|Job>`

定义流水线结束阶段执行的一组任务。当流水线 stages/failStages 执行完，流水线结束前，会依次执行此阶段任务。

当流水线 prepare 阶段成功，无论 stages 是否成功，endStages 都将执行。
且 endStages 是否成功不影响流水线状态（即 endStages 失败，流水线状态也可能是成功）。

### ifNewBranch {#pipeline-ifnewbranch}

- type: `Boolean`
- default: `false`

为 `true` 表示当前分支属于新分支（即 `CNB_IS_NEW_BRANCH` 为 `true`）时，才执行此 `Pipeline`。

> 当同时存在 `ifNewBranch` / `ifModify` 时，其中有一个条件满足，此 `Pipeline` 就会执行。

### ifModify {#pipeline-ifmodify}

- type: `Array<String>` | `String`

指定只有相应文件变动时，才执行此 `Pipeline`。
是一个 `glob` 表达式字符串或字符串数组。

示例1：

当修改文件列表中包含 `a.js` 或者 `b.js`，会执行此 `Pipeline`。

```yaml
ifModify:
  - a.js
  - b.js
```

示例2：

当修改文件列表中包含有 `js` 后缀的文件时，会执行此 `Pipeline`。
其中 `**/*.js` 表示匹配所有子目录中的 `js` 后缀文件，`*.js` 表示所有根目录中的 `js` 后缀文件。

```yaml
ifModify:
  - "**/*.js"
  - "*.js"
```

示例3：

反向匹配，排除目录 legacy 和排除所有 Markdown 文件，有其他文件变更时触发

```yaml
ifModify:
  - "**"
  - "!(legacy/**)"
  - "!(**/*.md)"
  - "!*.md"
```

示例4：

反向匹配，src 目录并且除目录 src/legacy 以外有变更时触发

```yaml
ifModify:
  - "src/**"
  - "!(src/legacy/**)"
```

#### 支持事件

- 非新建分支的 `push` 事件，会对比 `before` 和 `after` 统计变更文件。
- 非新建分支的 `push` 事件流水线中通过 `cnb:apply` 触发的事件，变更文件统计规则同上。
- `PR` 触发的事件，统计 `PR` 中的变更文件。
- `PR` 触发的事件通过 `cnb:apply` 触发的事件，统计 `PR` 中的变更文件。

因为文件变更可能非常多，变更文件的统计限制为最多300个。

### breakIfModify {#pipeline-breakifmodify}

- type: `Boolean`
- default: `false`

`Job` 执行前，如果源分支已更新，则终止构建。

### retry {#pipeline-retry}

- type: `Number`
- default: `0`

失败重试次数， `0` 表示不重试。

### allowFailure {#pipeline-allowfailure}

- type: `Boolean`
- default: `false`

是否允许当前流水线 失败。

当此参数设置为 `true` 时，流水线的失败的状态不会上报到 CNB 上。

### lock {#pipeline-lock}

- type: `Object` | `Boolean`

给 `pipeline` 设置锁，`pipeline` 执行完后自动释放锁，锁不能跨仓库使用。

表现： 流水线 A 获取到锁后，流水线 B 再申请锁，可以终止A或等待A执行完释放锁后，获取到锁再继续执行任务。

- key:
  - type: `String`
  
  自定义锁名，默认为 `分支名-流水线名`，既锁范围默认为当前 `pipeline`

- expires:
  - type: `Number`
  - default: `3600`(一小时)
  
  锁过期时间，过期后自动释放锁，单位“秒”。

- timeout:
  - type: `Number`
  - default: `3600`(一小时)
  
  超时时间，用于等待锁的场景下，单位“秒”。

- cancel-in-progress:
  - type: `Boolean`
  - default: `false`
  
  是否终止占用锁或等待锁的流水线，让当前流水线获取锁并执行

- wait:
  - type: `Boolean`
  - default: `false`

  锁被占用是否等待（不占用流水线资源和耗时），为 false 则直接报错，不能与 `cancel-in-progress` 同时使用

- cancel-in-wait:
  - type: `Boolean`
  - default: `false`
  
  是否终止正在等待锁的流水线，让当前流水线加入等待锁队列。需配合`wait`属性使用。

若 `lock` 为 true，则 `key`、 `expires`、 `timeout`、 `cancel-in-progress`、 `wait`、 `cancel-in-wait`为各自默认值。

例1: lock 是 Boolean 格式

```yaml
main:
  push:
    - lock: true
      stages:
        - name: stage1
          script: echo "stage1"
```

例2: lock 是 Object 格式

```yaml
main:
  push:
    - lock:
        key: key
        expires: 600 # 10分钟
        wait: true
        timeout: 60 # 最多等待 1分钟
      stages:
        - name: stage1
          script: echo "stage1"
```

例3: 停止 pull_request 下上一条正在进行的流水线

```yaml
main:
  pull_request:
    - lock:
        key: pr
        cancel-in-progress: true
      stages:
        - name: echo hello
          script: echo "stage1"
```

## Stage

- type: `Job` | `Object<name: Job>`

`Stage` 表示一个构建阶段，可以由一个或者多个 `Job` 组成，见 [Job 介绍](#job)。

### 单个 Job

如果一个 `Stage` 只有一个 `Job`，那么可以省掉 `Stage` 直接书写这个 `Job`。

```yaml
stages:
  - name: stage1
    jobs:
      - name: job A
        script: echo hello
```

可以简化为以下写法:

```yaml
- stages:
    - name: job A
      script: echo hello
```

**当 `Job` 为字符串时，可以视作脚本任务，name 和 script 取该字符串，可以继续简化为：**

```yaml
- stages:
    - echo hello
```

#### 串行 Job

当值为数组（有序）时，那么这组 `Job` 会串行执行。

```yaml
# 串行
stages:
  - name: install
    jobs:
      - name: job1
        script: echo "job1"
      - name: job2
        script: echo "job2"
```

#### 并行 Job

当值为对象（无序）时，那么这组 `Job` 会并行执行。

```yaml
# 并行
stages:
  - name: install
    jobs:
      job1:
        script: echo "job1"
      job2:
        script: echo "job2"
```

多个 `Job` 串行、并行可灵活组织。
先串行后并行的示例：

```yaml
main:
  push:
    - stages:
        - name: serial first
          script: echo "serial"
        - name: parallel
          jobs:
            parallel job 1:
              script: echo "1"
            parallel job 2:
              script: echo "2"
        - name: serial next
          script: echo "serial next"
```

### name {#Stage-name}

- type: `String`

`Stage` 名称。

### ifNewBranch {#stage-ifnewbranch}

- type: `Boolean`
- default: `false`

为 `true` 表示只有当前分支属于新分支（即 `CNB_IS_NEW_BRANCH` 为 `true`）时，才执行此 `Stage`。

> 当同时存在 `ifNewBranch` / `ifModify` / `if` 有一个条件满足，此 `Stage` 就会执行

### ifModify {#stage-ifmodify}

- type: `Array<String>` | `String`

指定只有相应文件变动时，才执行此 `Stage`。
是一个 `glob` 匹配表达式字符串或字符串数组。

### if {#stage-if}

- type: `Array<String>` | `String`

一个或者多个 Shell 脚本，根据脚本执行的退出程序码（exit code）来判断是否执行此 `Stage`。
当退出程序码为 `0` 时，表示需要执行本步骤。

示例1：判断某个变量的值

[shell表达式语法](https://linux.die.net/man/1/test)

```yaml
main:
  push:
    - env:
        IS_NEW: true
      stages:
        - name: is new
          if: |
            [ "$IS_NEW" = "true" ]
          script: echo is new
        - name: is not new
          if: |
            [ "$IS_NEW" != "true" ]
          script: echo not new
```

示例2： 判断任务执行的输出

```yaml
main:
  push:
    - stages:
        - name: make info
          script: echo 'haha'
          exports:
            info: RESULT
        - name: run if RESULT is haha
          if: |
            [ "$RESULT" = "haha" ]
          script: echo $RESULT
```

### env {#stage-env}

- type: `Object`

同 [Pipeline env](#pipeline-env)，只对当前 `Stage` 生效。

`Stage env` 优先级比 `Pipeline env` 高。

### imports {#stage-imports}

- type: `Array<String>` | `String`

同 [Pipeline imports](#pipeline-imports)，只对当前 `Stage` 生效1。

### retry {#stage-retry}

- type: `Number`
- default: `0`

失败重试次数，`0` 表示不重试。

### lock {#stage-lock}

- type: `Boolean` ｜`Object`

给 `Stage` 设置锁，`Stage` 执行完后自动释放锁，锁不能跨仓库使用。

表现： 任务 A 获取到锁后，任务 B 再申请锁，将等待锁释放后，才能获取到锁继续执行任务。

- lock.key

  - type: `String`

  自定义锁名,默认值为 `分支名-流水线名-stage下标`

- lock.expires

  - type: `Number`
  - default: `3600`(一小时)

锁过期时间，过期后自动释放锁，单位“秒”。

- lock.wait

  - type: `Boolean`
  - default: `false`

锁被占用是否等待。

- lock.timeout

  - type: `Number`
  - default: `3600`(一小时)

指定等待锁的超时时间，单位“秒”。

若 `lock` 为 true，则 `key`、 `expires`、 `timeout`、 `cancel-in-progress`、 `wait`、 `cancel-in-wait`为各自默认值。

例1: `lock` 是 `Boolean` 格式

```yaml
main:
  push:
    - stages:
        - name: stage1
          lock: true
          jobs:
            - name: job1
              script: echo "job1"
```

例2: `lock` 是 `Object` 格式

```yaml
main:
  push:
    - stages:
        - name: stage1
          lock:
            key: key
            expires: 600 # 10分钟
            wait: true
            timeout: 60 # 最多等待 1分钟
          jobs:
            - name: job1
              script: echo "job1"
```

### image {#Stage-image}

- type: `Object` | `String`

指定当前 `Stage` 的环境镜像，在当前 `Stage` 下的所有任务默认都将在这个镜像环境中执行。

- `image.name`: `String` 镜像名，如 `node:20`。
- `image.dockerUser`: `String` 指定 Docker 用户名，用于拉取指定的镜像。
- `image.dockerPassword`: `String` 指定 Docker 用户密码，用于拉取指定的镜像。

如果指定 `image` 为字符串，则等同于指定了 `image.name`。

### jobs

- type: `Array<Job>` | `Object<name,Job>`

定义一组任务，每个任务串行/并行运行。

- 当值为数组（有序）时，那么这组 `Job` 会串行执行。
- 当值为对象（无序）时，那么这组 `Job` 会并行执行。

## Job

`Job` 是最基本的任务执行单元，可以分为三类：

### 内置任务

- type:
  - type: `String`

  指定该步骤所要执行的 [内置任务](./internal-steps/)。

- options:
  - type: `Object`

  指定内置任务的相应参数。

- optionsFrom:
  - `Array<String>` | `String`

  指定本地或 Git 仓库文件路径，加载为内置任务参数。与 `imports` 参数类似，配置 `optionsFrom` 为数组时，如遇到参数重复的情况，后面的配置会覆盖前面的。

`options` 中同名字段优先级高于 `optionsFrom`。

引用配置文件权限控制参考 [配置文件引用鉴权](./file-reference.md#权限检查)。

示例：

```yaml
name: install
type: INTERNAL_JOB_NAME
optionsFrom: ./options.json
options:
  key1: value1
  key2: value2
```

```json
// ./options.json
{
  "key1": "value1",
  "key2": "value2"
}
```

### 脚本任务

```yaml
- name: install
  script: npm install
```

- script:
  - type: `Array<String>` | `String`

  指定该步骤所要执行的 `shell` 脚本。数组会默认使用 `&&` 连接。

  如果希望 `script` 拥有自己的运行环境，而不是在 pipeline 所在环境执行，可以通过 `image` 属性指定运行环境。

- image:
  - type: `String`
  
  指定脚本运行环境。

示例：

```yaml
- name: install
  image: node:20
  script: npm install
```

**脚本任务可以简化为字符串，此时 script 取该字符串，name 取该字符串第一行：**

```yaml
- echo hello
```

相当于：

```yaml
- name: echo hello
  script: echo hello
```

### 插件任务

插件即 Docker 镜像，也可称为镜像任务。

不同于以上两类任务，`插件任务` 具有执行环境更自由的特点。
而且更易在团队、公司内外分享，甚至可以跨 CI 复用。

`插件任务` 通过向 `ENTRYPOINT` 传递环境变量的方式，来达到隐藏内部实现的目的。

>注意：通过 imports、env 等参数设置的自定义环境变量不会传递给插件，但可以用在 settings、args中的变量替换。CNB 系统环境变量依然会传递给插件

- name:
  - type: `String`

  指定 `Job` 名称。

- image:
  - type: `String`

  镜像的完整路径。

- settings:
  - type: `Object`
  
  指定该插件任务参数。按照镜像提供方的文档填写即可。也可以通过 `$VAR` 或者 `${VAR}` 取到环境变量。
  
- settingsFrom:

  - type: `Array<String>` | `String`

    指定本地或 Git 仓库文件路径，加载为插件任务参数。

    优先级：

    - 如遇到参数重复的情况，后面的配置会覆盖前面的。
    - `settings` 中同名字段优先级高于 `settingsFrom`。

引用配置文件权限控制参考 [配置文件引用鉴权](./file-reference.md#权限检查)。

示例：

同时限制 `images` 和 `slugs`：

```yaml
allow_slugs:
  - a/b
allow_images:
  - a/b
```

仅限制 `images`，不限制 `slug`：

```yaml
allow_images:
  - a/b
```

`settingsFrom` 可以写在 `Dockerfile` 中：

```dockerfile
FROM node:20

LABEL cnb.cool/settings-from="https://cnb.cool/<your-repo-slug>/-/blob/main/xxx/settings.json"
```

#### 示例

with imports：

```yaml
- name: npm publish
  image: plugins/npm
  imports: https://cnb.cool/<your-repo-slug>/-/blob/main/xxx/npm.json
  settings:
    username: $NPM_USER
    password: $NPM_PASS
    email: $NPM_EMAIL
    registry: https://mirrors.xxx.com/npm/
    folder: ./
```

```json
{
  "username": "xxx",
  "password": "xxx",
  "email": "xxx@emai.com",
  "allow_slugs": ["cnb/**/**"],
  "allow_images": ["plugins/npm"]
}
```

with settingsFrom：

```yaml
- name: npm publish
  image: plugins/npm
  settingsFrom: https://cnb.cool/<your-repo-slug>/-/blob/main/xxx/npm-settings.json
  settings:
    # username: $NPM_USER
    # password: $NPM_PASS
    # email: $NPM_EMAIL
    registry: https://mirrors.xxx.com/npm/
    folder: ./
```

```json
{
  "username": "xxx",
  "password": "xxx",
  "email": "xxx@emai.com",
  "allow_slugs": ["cnb/cnb"],
  "allow_images": ["plugins/npm"]
}
```

### name {#job-name}

- type: `String`

指定 `Job` 名称。

### ifModify {#job-ifmodify}

- type: `Array<String>` | `String`

同 [Stage ifModify](#stage-ifmodify)。只对当前 `Job` 生效。

### ifNewBranch {#job-ifnewbranch}

- type: `Boolean`
- default: `false`

同 [Stage ifNewBranch](#stage-ifnewbranch)。只对当前 `Job` 生效。

### if {#job-if}

- type: `Array<String>` | `String`

同 [Stage if](#stage-if)。只对当前 `Job` 生效。

### breakIfModify {#job-breakifmodify}

- type: `Boolean`
- default: `false`

同 [Pipeline breakIfModify](#pipeline-breakifmodify)。不同点在于只对当前 `Job` 生效。

### skipIfModify {#job-skipifmodify}

- type: `Boolean`
- default: `false`

`Job` 执行前，如果源分支已更新，则跳过当前 `Job`。

### env {#job-env}

- type: `Object`

同 [Stage env](#stage-env)，只对当前 `Job` 生效。

`Job env` 优先级比 `Pipeline env`、`Stage env` 高。

### imports {#job-imports}

- type: `Array<String>` | `String`

同 [Stage imports](#stage-imports)，只对当前 `Job` 生效。

### exports {#job-exports}

- type: `Object`

`Job` 执行结束后，有一个 `result` 对象，可通过 `exports` 将 `result` 中的属性导出到环境变量，生命周期为当前 `Pipeline`。

详情请见 [环境变量](./env.md#导出环境变量)

### timeout

- type: `Number` | `String`

设置单个任务的超时时间，默认为 1 小时，最大不能超过 12 小时。

对 `script-job` 和 `image-job` 有效。

同时支持以下单位：

- `ms`: 毫秒(默认)
- `s` : 秒
- `m` : 分钟
- `h` : 小时

```yaml
name: timeout job
script: sleep 1d
timeout: 100s #任务将在100秒后超时退出
```

详见 [超时策略](./timeout.md)

### allowFailure {#job-allowfailure}

- type: `Boolean` | `String`
- default: `false`

为 `true` 表示本步骤如果失败，也不会影响接下来流程的执行，并且不会影响最后的结果。

值为 `String` 类型时可以读取环境变量

### lock {#job-lock}

- type: `Object` | `Boolean`

给 `Job` 设置锁，`Job` 执行完后自动释放锁，锁不能跨仓库使用。

表现： 任务 A 获取到锁后，任务 B 再申请锁，将等待锁释放后，才能获取到锁继续执行任务。

- lock.key

  - type: `String`

自定义锁名，默认为 `分支名-流水线名-stage下标-job名`

- lock.expires

  - type: `Number`
  - default: `3600`(一小时)

锁过期时间，过期后自动释放锁，单位“秒”。

- lock.wait

  - type: `Boolean`
  - default: `false`

锁被占用是否等待。

- lock.timeout

  - type: `Number`
  - default: `3600`(一小时)

指定等待锁的超时时间，单位“秒”。

若 `lock` 为 true，则 `key`、 `expires`、 `timeout`、 `cancel-in-progress`、 `wait`、 `cancel-in-wait`为各自默认值。

例1: lock 是 Boolean 格式

```yaml
name: 锁
lock: true
script: echo 'job 锁'
```

例2: lock 是 Object 格式

```yaml
name: 锁
lock:
  key: key
  expires: 10
  wait: true
script: echo 'job 锁'
```

### retry {#job-retry}

- type: `Number`
- default: `0`

失败重试次数，`0` 表示不重试。

### type

- type: `String`

指定该步骤所要执行的 [内置任务](./internal-steps/)。

### options

- type: `Object`

指定内置任务参数。

### optionsFrom

- type: `Array<String>` | `String`

指定本地或 Git 仓库文件路径，加载为内置任务参数。与 `imports` 参数类似，配置 `optionsFrom` 为数组时，如遇到参数重复的情况，后面的配置会覆盖前面的。

`options` 同名字段优先级高于 `optionsFrom`。

### script

- type: `Array<String>` | `String`

指定任务要执行的脚本。为数组时会自动使用 ` && ` 拼接。执行脚本的进程退出码会作为这个 `Job` 的退出码。

**注意： 流水线使用的基础镜像的默认命令行解释器是 `sh`，指定不同的 image 作为执行环境，命令行解释器可能有所不同**

### commands

- type: `Array<String>` | `String`

作用同 `script` 参数, 优先级比 `script` 高。主要为了兼容 `Drone CI` 语法。

### image {#job-image}

- type: `Object` | `String`

指定用哪个 Image 作为当前 `Job` 执行环境, 用于 `docker image as env` 或 `docker image as plugins`

- `image.name`: `String` 镜像名，如 `node:20`。
- `image.dockerUser`: `String` 指定 Docker 用户名，用于拉取指定的镜像。
- `image.dockerPassword`: `String` 指定 Docker 用户密码，用于拉取指定的镜像。

如果指定 `image` 为字符串，则等同于指定了 `image.name`。

### settings

- type: `Object`

指定该插件任务执行所需的参数。详细[插件任务介绍](#插件任务)

### settingsFrom

- `Array<String>` | `String`

指定本地或 Git 仓库文件路径，加载为插件任务参数。与 `imports` 参数类似，配置 `settingsFrom` 为数组时，如遇到参数重复的情况，后面的配置会覆盖前面的。

详细[插件任务介绍](#插件任务)

### args

- `Array<String>`

指定执行镜像时传递的参数，内容将会追加到 `ENTRYPOINT` 中，仅支持数组。

```yaml
- name: npm publish
  image: plugins/npm
  args:
    - ls
```

将执行

```bash
docker run plugins/npm ls
```

### 任务退出码

- 0: 任务成功, 继续执行。
- 78: 任务成功，但中断当前 `Pipeline` 的执行。可在自定义脚本中主动执行 `exit 78` ，达到中断流水线效果。
- other: `Number`，任务失败，同时中断当前 `Pipeline` 的执行。
