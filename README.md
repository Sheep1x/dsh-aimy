<img src="assets/icon-180.png" width="72" align="right" alt="dsh-Aimy">

# dsh-Aimy

DSH（DeepSeek Harness）插件 **dsh-Aimy**：把本站中转站（one-hub）作为模型来源，并且**在插件里切换分组时真实切换中转站的分组**——模型列表、候选渠道、计费倍率同时变化。

配合的中转站接口：`GET/PUT /v1/token/group`（见 [../docs/dsh-aimy.md](../docs/dsh-aimy.md)）。

## 两个入口

| 入口 | 插槽 | 说明 |
|---|---|---|
| 设置页「**Aimy-艾米**」分区 | `settings.section`（order 40） | 紧凑版，限宽 720 |
| 首页左侧栏图标 + 主区面板「**Aimy-艾米**」 | `sidebar.panellist`（order 30）+ `main`（key `dsh-aimy`） | 整页面板，撑满主区、自带滚动 |

- 两处共用同一个 `makeSection()`，只是 `variant` 不同（`settings` / `panel`）。
- 侧栏图标是内联 SVG（`RelayIcon`），走 `currentColor`，跟随主题与选中态，不依赖 UI 组件库。
- 面板 id、`main` 的 key、包名一致，都是 `dsh-aimy`；sidebar 点图标时把 `activePanelId` 设成该 id，`main` 据此命中。
- 三条注册都在 `src/client/app.ts` 的 `apply()` 里，`inject = ['slots']`。
- client 侧必须用 `react.createElement`（可变 children）；`react/jsx-runtime` 的 `jsx(type, props, key)` 第三参是 key，会把 `h(type, props, ...children)` 的子节点全部丢掉。

## 状态

- ✅ P1：包骨架、host 路由、设置页分区、分组读取与切换、旧版降级
- ✅ P2：复用 `@deepseek-ai/dsh-llm-pi-ai` 挂载模型路由，切组后重挂载刷新模型目录
- ✅ P4-1：设置页直接填密钥（写 DSH 凭据库，write-only），保存后立即探测并挂载模型
- ✅ P4-2：「当前选中模型不在新分组」提示（只提示，不自动改选）
- ✅ 双档案：Aimy-艾米（地址隐藏的预设）+ 兼容模式（自填 URL/协议，适配 new-api / sub2api）
- ⏳ 可选：插件市场打包（index 格式 + submission 校验）

## 安装

### 方式一：npm 直接从 GitHub 安装（推荐，无需发布到 registry）

```bash
cd ~/.dsh/profiles/desktop
pnpm add github:Sheep1x/dsh-aimy      # 或 npm i github:Sheep1x/dsh-aimy
```

然后在 profile 的 `package.json` 里把 `dsh-aimy` 加进 `dsh.profile.bundles`。

> **前置条件**：本机要有 `git`（pnpm 的 `github:` 依赖靠它取包），且能访问 GitHub。
>
> 仓库**提交了构建产物 `lib/`**，所以源码安装（`dsh plugin add` / `pnpm add github:…` / `file:`）拿到的就是可直接加载的包，
> 不依赖 `prepare` 在装机时构建（`file:` 与 `dsh plugin add` 都不会跑 `prepare`）。
> 改完源码请 `node build.mjs` 并**一起提交 `lib/`**，否则用户装到的是旧代码。

### 方式二：本地路径

先把源码构建出 `lib/`，再装：

```bash
pnpm add file:D:/openwork/dsh-aimy
```

```bash
git clone https://github.com/Sheep1x/dsh-aimy.git
cd dsh-aimy
npm install        # 装 esbuild 等构建依赖
npm run build      # 产出 lib/index.js 与 lib/client.js
npm test           # 31 项测试（host 27 + client 4）
```

然后在 DSH profile 里装本地目录，并把 `dsh-aimy` 加进 `dsh.profile.bundles`（`~/.dsh/profiles/<profile>/package.json`）。

```bash
cd ~/.dsh/profiles/desktop
pnpm add link:D:/openwork/dsh-aimy      # 软链：build 完重启即生效
# 或 pnpm add file:D:/openwork/dsh-aimy  # 快照：改完要 pnpm install --force
```

> `link:` 只在 `node_modules/dsh-aimy` 建一条软链；`file:` 会按 `files` 字段打快照，源码变动 pnpm 未必自动刷新。
> 两种方式下 peer（`@deepseek-ai/*`）都由 DSH 的 profile 解析器按包名路由，不依赖本目录的 `node_modules`。

## 安装（本地开发）

```bash
cd dsh-aimy
"C:/Program Files/nodejs/node.exe" build.mjs      # 构建 lib/index.js + lib/client.js
```

然后在 DSH profile（`~/.dsh/profiles/<profile>/package.json`）里加依赖并加入 bundles：

```bash
cd ~/.dsh/profiles/desktop
pnpm add file:D:/openwork/one-hub/dsh-aimy
```

```json
{
  "dsh": { "profile": { "bundles": [ "...", "dsh-aimy" ] } }
}
```

重启 DSH 后，设置页出现「中转站」分区。

## 两个 Tab / 两个档案

| Tab | 地址 | 密钥引用 | 路由名 | 显示名 | 能力 |
|---|---|---|---|---|---|
| **Aimy-艾米**（默认） | 内置 `https://aimy.sheep1x.top`，**界面只读展示、不可编辑** | `ONEHUB_API_KEY` | `onehub` | Aimy-艾米 | 读模型 + 真实切分组 |
| **兼容模式** | 用户自填（写入 `$DSH_HOME/dsh-aimy/profiles.json`） | `ONEHUB_COMPAT_API_KEY` | `onehub-compat` | 兼容模式 | 读模型 + 调用；分组接口缺失时自动只读 |

- 两个档案**互相独立**：各自挂各自的 pi-ai 路由，模型选择器里按显示名区分，切 Tab 只是切配置页。
- 兼容模式适配 new-api / sub2api / 任意 OpenAI 兼容网关，可选 `anthropic-messages` 协议。
- **分组接口是可选能力**：`/v1/token/group` 返回 404 时只把 `supportsSwitch` 置 false，模型照常拉取与调用。

## 配置

插件配置在 profile 的 `cordis.patch.yml`（bundle 自带默认值，按需覆盖）：

```yaml
- id: dsh-aimy
  name: dsh-aimy
  config:
    baseURL: https://aimy.sheep1x.top   # 中转站根地址（不要带 /v1）
    apiKeyRef: ONEHUB_API_KEY           # 凭据引用名
    group: ''                            # 期望分组（空 = 跟随令牌）
```

密钥**不写进配置文件**：优先级是

1. 设置页「API Key → 保存」写入的凭据库值（`ctx.credentials.set(apiKeyRef, …)`，write-only）
2. DSH 凭据库里已有的同名值
3. 同名环境变量

保存后插件会立刻用它探测一次中转站，成功即挂载模型路由。点「清除」会 `unset` 该引用，
环境变量兜底重新生效。

## 前置条件（中转站侧）

1. 站点已升级到包含 `/v1/token/group` 的版本。
2. 给 DSH 单独建一个令牌，并勾选 **允许客户端切换分组**。
3. 该令牌的分组必须是「公开分组」或你自己账号所在的分组。

> 切组是令牌级状态：同一把 key 上其它客户端也会跟着换组，所以建议专用令牌。

## 路由

host 半侧在 `/dsh-aimy-relay` 前缀下暴露（仅供本插件的浏览器半侧调用）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/state` | 当前分组、倍率、可选分组、模型目录（命中缓存时不打网络） |
| POST | `/refresh` | 强制重新拉取分组与模型目录 |
| POST | `/switch` | `{ "group": "vip" }` 真实切组，随后刷新目录 |
| POST | `/credentials` | `{ "apiKey": "sk-…" }` 写入凭据库并立即探测/挂载 |
| DELETE | `/credentials` | 清除凭据库中的密钥 |

## 测试

```bash
"C:/Program Files/nodejs/node.exe" --test test/*.test.mjs
```


- `test/host.test.mjs`：host 路由与挂载（假中转站 + 假 cordis ctx）
- `test/client.test.mjs`：client 半侧（走 `window.__ModuleLoader__` 契约，假 hooks 渲染真 React 元素树）
  - 三条注册齐全、侧栏 id 必须等于 `main` 的 key
  - 侧栏图标是 svg 且跟随 `size`/`active`
  - 面板展示默认地址并标注「预设地址（不可修改）」
  - 点地址 → 写剪贴板 → 提示「已复制」

host 覆盖（27 项）：正常读取 / 真实切组 / 模型路由挂载 / 切组后重挂载 / 同分组不重挂载 / 中转站报错透传 /
空分组拦截 / 旧版站点降级 / 未配置密钥 / 保存密钥后自动挂载 / 空密钥拒绝 / 清除密钥 /
模型失效判定（在目录内 / 切走后失效 / 切回恢复 / 指向别的路由不误报）。

## 结构

```text
src/
  shared/types.ts     两侧共用类型
  host/relay.ts       中转站 HTTP 客户端（错误归一）
  host/state.ts       模型目录缓存（$DSH_HOME/dsh-aimy/state.json，仅非密钥）
  host/routes.ts      /dsh-aimy-relay/* 的纯函数编排
  host/index.ts       Cordis 插件入口（name / inject / apply）
  client/index.ts     __ModuleLoader__ 外壳
  client/app.ts       装配层：注册 settings.section
  client/section.ts   「中转站」设置分区 UI
```

## 地址怎么填（/v1 可填可不填）

两种协议的 SDK 自己拼接口路径，口径相反，所以插件按协议归整：

| 协议 | SDK 自动拼的路径 | 归整结果 |
|---|---|---|
| `openai-completions` | `…/chat/completions` | baseURL **必须**以 `/v1` 结尾 → 没填自动补，已填不重复 |
| `anthropic-messages` | `…/v1/messages` | baseURL **不能**带 `/v1` → 填了自动剥掉 |

容错（两种协议都适用）：用户若整段粘贴了端点路径（`…/v1/chat/completions`、`…/v1/messages`），
会先被剥回根地址；我们自己的模型/分组拉取也会用 `apiRoot()` 做同样归整，
所以不会出现 `/v1/v1/models`。

因此设置页里填 `https://gateway.example.com` 或 `https://gateway.example.com/v1` 都能用。

## 切组后模型失效怎么处理

切组会改变可用模型集合。若当前默认模型（`ctx.agentDefaultModel.currentSelection()`）指向本插件的路由、
但已不在新分组的目录里，插件会：

- 状态里置 `staleModel: true`，并附一条 warning：「当前选中的模型 xxx 不在新分组里，请重新选择模型」
- 设置页显示红色提示行

**绝不自动改选模型**——静默替换会让用户在不知情的情况下换了计费对象。

若选择指向其它路由（不是本插件的 `routeName`），不算失效。

## 模型怎么进入 DSH 的模型选择器

挂载 = 把官方 `@deepseek-ai/dsh-llm-pi-ai` 作为**子插件**注册进本插件 fiber，它会调用 `ctx.llm`
把 `{ routeName, displayName, models }` 声明成一个 provider 路由；模型选择器读的就是这份声明。

两个关键点（都踩过坑）：

1. **挂的是模块命名空间，不是 `PiAiAdapter` 类。**
   真包导出 `export { Config, PiAiAdapter, apply, inject, name, … }`，其中 `PiAiAdapter`
   是 `class extends LlmAdapter` 的**适配器实现类**，没有 `apply`。把它传给 `ctx.plugin()`
   不会报错，但什么 provider 都不会注册 → 面板一切正常、模型选择器里一个模型都没有。
   `pickPlugin()` 因此优先挑「带 `apply` 的对象/函数插件」，只给类时直接抛错。

2. **启动就要挂，不能等面板被打开。**
   之前只有 `/state`、`/refresh` 里才 `syncProvider`，所以模型要等用户点开「中转站」面板才出现。
   现在 `apply()` 结束时用 `$DSH_HOME/dsh-aimy/state.json` 里缓存的目录做一次 `warmStart()`：
   冷启动立刻挂上（分组信息要联网才知道，预热用最近一次目录即可，面板刷新后按真实分组重挂）。
   缓存命中的 `/state` 分支也会补一次 `syncProvider`，避免「进程起来了但路由没挂」。

## 模型路由怎么挂上的

插件把官方 `@deepseek-ai/dsh-llm-pi-ai` 挂进自己的 fiber：

```ts
ctx.plugin(PiAiAdapter, {
  providers: {
    onehub: {
      api: 'openai-completions',
      baseURL: 'https://你的站点/v1',
      apiKeyEnv: 'ONEHUB_API_KEY',
      defaultContextWindow: 131072,
      defaultMaxTokens: 8192,
      models: [{ id: 'deepseek-v4.1-flash' }, ...],   // 来自 GET /v1/models
    },
  },
})
```

**为什么切组要重挂载**：pi-ai 的 `providers` 是 schemastery 的 volatile 字段，但
`createVolatile()` 返回的是**冻结快照**，写入通道是内部 symbol（只有 Loader 能提交），
插件侧无法原地修改。所以目录变化时 dispose 旧 fiber、用新配置再挂一次；
模型集合未变时短路跳过（避免无意义抖动）。
