<img src="assets/icon-180.png" width="72" align="right" alt="dsh-Aimy">

# dsh-Aimy

DSH（DeepSeek Harness）插件 **dsh-Aimy**：解决中转站多分组多倍率不方便管理的问题——把中转站作为模型来源接入 DSH，**支持就地切换中转站分组**，同步刷新模型列表与计费倍率。

配合的中转站接口：`GET/PUT /v1/token/group`（见 [../docs/dsh-aimy.md](../docs/dsh-aimy.md)）。

## 入口

| 入口 | 插槽 | 说明 |
|---|---|---|
| 首页左侧栏图标 + 主区面板「**Aimy-艾米**」 | `sidebar.panellist`（order 30）+ `main`（key `dsh-aimy`） | 整页面板，撑满主区、自带滚动 |

- 面板 id、`main` 的 key、包名一致，都是 `dsh-aimy`；sidebar 点图标时把 `activePanelId` 设成该 id，`main` 据此命中。
- 两处注册都在 `src/client/app.ts` 的 `apply()` 里，`inject = ['slots']`。
- client 侧必须用 `react.createElement`（可变 children）；`react/jsx-runtime` 的 `jsx(type, props, key)` 第三参是 key，会把 `h(type, props, ...children)` 的子节点全部丢掉。
- 面板头部与侧栏图标共用 `src/shared/brand.ts` 里的品牌路径。

> **为什么不放设置页**：宿主 `dsh-client-ui-settings-general` 的 `navIcon(id)` 按分区 id
> 硬编码图标，只认 `account` / `models` / `agent-presets` / `plugins` / `archived-sessions`，
> 其余一律回落到齿轮；`settings.section` 插槽也只消费 `id`/`order`/`label`，从不读 `icon`，
> 插件侧无法覆盖。借用已知 id 同样不可行——它们已被内置分区占用，重复 id 会让
> `renderSlot(only: active)` 同时渲染两个分区。所以只保留侧栏入口，避免设置页出现一行齿轮。

## 截图（市场详情页）

市场（dsh-market）详情页会展示插件截图。**在你自己的仓库里声明**，改图无需再提 PR：

```json
// screenshots.json（与 package.json 同级）
["assets/screenshots/01-panel.png", "assets/screenshots/02-group.png"]
```

- 放图目录：`assets/screenshots/`（见该目录下的 README）
- 1–8 张；dsh-market 只展示**前 6 张**
- 支持相对路径（不得以 `/` 开头、不得含 `..`），或 **GitHub 托管的 https 绝对 URL**
  （`raw.githubusercontent.com` / `user-images.githubusercontent.com` /
  `camo.githubusercontent.com` / `github.com`）。第三方图床会被拒——截图 URL 会带上访问者 IP
- 未声明时市场会从本 README 自动抽取图片（回退行为）

自检：`npm run check:screenshots`（校验格式、数量、主机白名单、文件是否存在）

> 当前未声明 `screenshots.json`：保留「从 README 自动抽取」的回退。
> 想显示真实面板截图时，把图放进 `assets/screenshots/` 再声明即可。

## 状态

- ✅ P1：包骨架、host 路由、侧栏面板、分组读取与切换、旧版降级
- ✅ P2：复用 `@deepseek-ai/dsh-llm-pi-ai` 挂载模型路由，切组后重挂载刷新模型目录
- ✅ P4-1：面板里直接填密钥（写 DSH 凭据库，write-only），保存后立即探测并挂载模型
- ✅ P4-2：「当前选中模型不在新分组」提示（只提示，不自动改选）
- ✅ 双档案：Aimy-艾米（地址隐藏的预设）+ 兼容模式（自填 URL/协议，适配 new-api / sub2api）
- ✅ 模型能力声明：逐模型解析真实容量（站点声明 → 官方目录 → 兜底 1M/128K），面板可开关图片
- ✅ 余额桥：装 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 时，宠物的「查看余额」直接读本站额度
- ✅ 分组信息缓存（TTL 5 分钟 + stale-while-revalidate），面板热路径 1–8ms
- ✅ 已发布 npm：`dsh-aimy`

## 安装

### 一条命令（npm，推荐）

```bash
dsh plugin --profile desktop add dsh-aimy
```

发到 npm 的是**预构建包**（`lib/` 已在包内），安装时不跑构建脚本，**不会**停在
`ERR_PNPM_IGNORED_BUILDS` / `allowBuilds` 授权那一步。

### 一条命令（GitHub 源码）

```bash
dsh plugin --profile desktop add github:Sheep1x/dsh-aimy
```

- `--profile` **不能省**：DSH 的 `plugin` 子命令要求显式指定 profile（省略会报 `--profile <name> is required`）。
- 这条命令把参数原样转发给 profile 目录下的 pnpm，装完仍需把 `dsh-aimy` 加进 `dsh.profile.bundles`（见下）。
- 仓库提交了 `lib/`，安装即得可加载的包。但 **GitHub 来源仍可能触发 pnpm 的构建授权检查**，
  若停在 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`，把提示的键名加进该 profile 的
  `pnpm-workspace.yaml` 的 `allowBuilds` 后重试；改用上面的 npm 命令可完全避开这一步。

### 方式一：pnpm 从 GitHub 安装（无需走 registry）

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
>
> 想锁定版本可以用 `github:Sheep1x/dsh-aimy#<commit-sha>`。

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
npm test           # 136 项测试（host + capacity + group-cache + client）
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

重启 DSH 后，首页左侧栏出现「Aimy-艾米」图标，点开是整页面板。

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
    probeModels: false                   # 刷新目录后探测可达性（见下）
```

### 模型可达性探测（默认关闭）

中转站偶尔会「目录里有、调用报 model not found」。开启 `probeModels` 后，每次刷新目录会为
每个模型发一条最小生成请求（`max_tokens: 1`），把结果写进状态里的 `reachability`。

**探测端点跟随该档案的线路协议**，与真实调用同一套口径：`openai-responses` → `POST /v1/responses`
（`{ input, max_output_tokens }`）、`openai-completions` → `POST /v1/chat/completions`
（`{ messages, max_tokens }`）、`anthropic-messages` → `POST /v1/messages`
（`{ messages, max_tokens }` + `anthropic-version` 头）。早先的实现固定打 chat/completions，
在 responses 线路下会把只支持 Responses 的中转站误判成模型不可用。

| 判定 | 触发条件 | 含义 |
| --- | --- | --- |
| `ok` | 请求成功 | 上游认这个 id |
| `unavailable` | 404 / `Model is unavailable` / `invalid model` | 上游明确否定，选择器里不该出现 |
| `unknown` | 401、403、429、5xx、超时、断网 | **对链路的状态描述，不是对模型的否定** |

`unknown` 单独记账是关键：把 5xx 或限流也算成「不可用」，会让用户在一场网络抖动后
丢掉整个模型目录。面板上两者分开显示（「N 个不可用」「N 个未确认」），悬停可看说明。

**探测不裁剪目录**——`models` 始终是完整列表，判死只是标注。是否真的移除模型交给
DSH 的选择器策略，本插件不代替用户做这个决定。

代价：N 个模型 = N 条请求（默认并发 4）。站点模型多或配额紧时保持关闭。


密钥**不写进配置文件**：优先级是

1. 面板「API Key → 保存」写入的凭据库值（`ctx.credentials.set(apiKeyRef, …)`，write-only）
2. DSH 凭据库里已有的同名值
3. 同名环境变量

保存后插件会立刻用它探测一次中转站，成功即挂载模型路由。点「清除」会 `unset` 该引用，
环境变量兜底重新生效。

## 兼容范围（重要）

| 站点能力 | 支持情况 |
|---|---|
| `GET /v1/models`（标准 OpenAI 格式） | ✅ 必需。**绝大多数中转站都有**，new-api / sub2api / one-hub 均满足 |
| 调用模型 | ✅ 三种协议任选（Responses / Chat Completions / Anthropic） |
| `GET/PUT /v1/token/group`（分组切换） | ⚠️ **可选能力**。有则支持就地切组；没有则自动降级为只读 |

**分组接口是可选扩展，不是所有站点都有。** new-api / sub2api 属于通用 OpenAI 兼容网关，
该接口是各站点自行加的，多数部署并没有实现。插件对此的处理是**降级而非报错**：

- 接口返回 404、返回 `200` 但 `data` 里既无 `group` 也无 `groups`、或返回 `success:false`
  → 一律视为「该站点不支持切换分组」，`supportsSwitch` 置 `false`；
- **模型目录与模型调用完全不受影响**，照常可用；
- 界面不会显示一个点了没反应的「切换分组」按钮。

因此：**在任何 OpenAI 兼容中转站上都能拉到模型并用**；**只有提供该接口的站点才能就地切组**。
本站（one-hub 系）实测 `GET /v1/token/group` 正常返回 `group` / `groups` / `ratio`。

## 前置条件（仅切换分组需要）

以下三条只在你想用**分组切换**时才需要；只拉模型用则无需满足：

1. 站点已升级到包含 `/v1/token/group` 的版本。
2. 给 DSH 单独建一个令牌，并勾选 **允许客户端切换分组**。
3. 该令牌的分组必须是「公开分组」或你自己账号所在的分组。

> 切组是令牌级状态：同一把 key 上其它客户端也会跟着换组，所以建议专用令牌。

## 路由

host 半侧在 `/dsh-aimy-relay` 前缀下暴露（仅供本插件的浏览器半侧调用）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/state` | 当前分组、倍率、可选分组、模型目录（分组 5 分钟内直读缓存，模型目录命中缓存时不打网络） |
| GET | `/diagnostics` | 排障用的注册表/凭据/设置通道自检；面板后台拉取，不参与 `/state` 渲染 |
| POST | `/refresh` | 强制重新拉取分组与模型目录 |
| POST | `/switch` | `{ "group": "vip" }` 真实切组，随后刷新目录 |
| POST | `/credentials` | `{ "apiKey": "sk-…" }` 写入凭据库并立即探测/挂载 |
| DELETE | `/credentials` | 清除凭据库中的密钥 |

**为什么分组信息要缓存**：`/v1/token/group` 的长尾很差（实测 12 次里最高 2158ms，中位数约 38ms），
而它只影响「切换分组」那块 UI，与模型目录、密钥状态、挂载状态都无关。不缓存的话，面板每次
打开都要为它排一次队。策略是 **TTL 5 分钟 + stale-while-revalidate**：新鲜期内零网络；
过期后先返回旧值、后台异步刷新；用户点「刷新」时仍等真实网络。实测 `/state` 热路径
从 34–285ms 降到 1–8ms。

## 余额桥（可选，配合 dsh-pet）

装了 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 时，宠物右键菜单的「查看余额」与本插件联动：
本插件把自己挂的两条路由（`onehub` / `onehub-compat`）登记进 dsh-pet 的余额注册表
（`ctx.provide('petApi7340').balance.register`），于是宠物读的就是**本站额度**，而不是「当前服务商暂不支持余额查询」。

为什么放在本插件而不是 dsh-pet：余额按「provider id」寻址，id 是挂路由的人起的；
中转站的地址与密钥也只在本插件手里（dsh-pet 的第三方契约刻意不给 key）。

**探测链**（兼容模式可能填任何 OpenAI 兼容网关，所以按顺序试，第一个成功即返回）：

| 顺序 | 端点 | 适用站点 | 说明 |
|---|---|---|---|
| ① | `GET /v1/usage` | one-hub（本站）、sub2api | **同名不同构**：one-hub 是扁平 `{is_active, remaining, unit}`；sub2api 是 `{mode, remaining, quota?, subscription?, rate_limits?}` |
| ② | `GET /v1/dashboard/billing/subscription` + `/usage` | one-hub、new-api | `hard_limit_usd`（总额）− `total_usage`（美分）/100 = 剩余 |
| ③ | `GET /api/usage/token/` | new-api | 令牌级明细 `total_granted / total_used / total_available` |

三档全失败就报「该站点未提供可用的余额接口」并附每一档的原因 —— **绝不伪造 0 余额**。

展示形态按拿到的数据决定：

- `windows`：sub2api 订阅模式给了日/周/月三窗 → 宠物播档位 + 「X额度已用 N%」；
- `money`：拿到 USD 金额 + 总额基准 → 「余额（峰/谷）$x.xx」+ 档位动画；
- `points`：站点关掉「以货币显示」（`unit: 'quota'`）→ 原样显示数字，不套货币符号。

若 `fullBalance` 拿不到（站点没有 billing 接口），气泡只显示金额、不播档位动画 —— 不替站点猜一个基准。

没装 dsh-pet 时这一段静默跳过，插件其余功能不受影响。

## 测试

```bash
"C:/Program Files/nodejs/node.exe" --test test/*.test.mjs
```


- `test/host.test.mjs`：host 路由与挂载（假中转站 + 假 cordis ctx）
- `test/capacity.test.mjs`：容量取值链（站点声明 → 官方目录 → 兜底）、压缩 headroom 夹取、幂等
- `test/group-cache.test.mjs`：分组缓存（TTL / stale-while-revalidate / 刷新去重 / 404 记住 / 抖动不缓存）
- `test/balance.test.mjs`：余额桥（三站真实报文形状 + 探测链 + 三种 wire 形状 + 注册幂等）
- `test/client.test.mjs`：client 半侧（走 `window.__ModuleLoader__` 契约，假 hooks 渲染真 React 元素树）
  - 三条注册齐全、侧栏 id 必须等于 `main` 的 key
  - 侧栏图标是 svg 且跟随 `size`/`active`
  - 面板展示默认地址并标注「预设地址（不可修改）」
  - 点地址 → 写剪贴板 → 提示「已复制」
  - 协议下拉三选项齐全、暗色适配、切换会 POST 保存
  - 图片输入开关默认勾选、取消后只提交 `{imageInput}`

host 覆盖（57 项）：正常读取 / 真实切组 / 模型路由挂载 / 切组后重挂载 / 同分组不重挂载 / 中转站报错透传 /
空分组拦截 / 旧版站点降级 / 未配置密钥 / 保存密钥后自动挂载 / 空密钥拒绝 / 清除密钥 /
模型失效判定（在目录内 / 切走后失效 / 切回恢复 / 指向别的路由不误报）/
模型能力声明（1M 上下文 + 文本/图片模态 + cost + 思考档位）/ 关掉图片开关后只声明 text 并落盘 /
探测端点跟随线路协议（responses / completions / anthropic 三条回归）/
余额桥（两条路由都登记、fetch 返回 wire 形状、没装 dsh-pet 时静默缺席）。

## 结构

```text
src/
  shared/types.ts     两侧共用类型
  shared/capacity-table.ts  官方容量快照（自动生成，npm run gen:capacity）
  host/relay.ts       中转站 HTTP 客户端（错误归一）
  host/capacity.ts    逐模型容量解析（站点声明 → 官方目录 → 兜底，含压缩 headroom 夹取）
  host/state.ts       模型目录缓存（state.json）+ 分组信息缓存（内存，TTL 5 分钟）
  host/routes.ts      /dsh-aimy-relay/* 的纯函数编排
  host/index.ts       Cordis 插件入口（name / inject / apply）
  client/index.ts     __ModuleLoader__ 外壳
  client/app.ts       装配层：注册 sidebar.panellist + main
  client/section.ts   「中转站」设置分区 UI
```

## 协议（三种，与 pi-ai 的 supportedProtocols() 一致）

`openai-responses`（默认）· `openai-completions` · `anthropic-messages`

**协议在界面上是下拉框，两个 Tab 都能改**：面板状态卡片里的「协议」一行，选中即保存
（`POST /config?profile=aimy|compat`，只传 `api`），改完服务端会按新协议重新挂载模型路由。
预设档案只开放协议这一项，地址仍固化在配置里、只读展示；兼容模式则地址与协议都可改，
只改协议时会保留已填地址。

协议变化必须触发重挂载：同一个模型集合在 completions / responses 下是两套线路，
`sameModels()` 只看模型会误判成「没变化」，所以 `forceRemount()` 会先丢掉旧路由
再重建（`ProviderMount.api` 记录当前线路用于比较）。

取值必须与 `@deepseek-ai/dsh-llm-pi-ai` 的 `supportedProtocols()` 完全一致，否则 pi-ai 的
Config 校验会报 *names api …, which this build cannot serve*。面板的协议下拉从
`shared/types.ts` 的 `API_OPTIONS` 生成，新增协议只需改那一处。

`normalizeApi()` 还接受常见别名（`responses` / `completions` / `anthropic` / `messages` /
`claude` …），未识别时回退到默认的 Responses。

## 地址怎么填（/v1 可填可不填）

OpenAI 系与 Anthropic 的 SDK 拼路径口径相反，所以插件按协议归整：

| 协议 | SDK 自动拼的路径 | 归整结果 |
|---|---|---|
| `openai-responses`（默认） | `…/responses` | baseURL **必须**以 `/v1` 结尾 → 没填自动补，已填不重复 |
| `openai-completions` | `…/chat/completions` | 同上 |
| `anthropic-messages` | `…/v1/messages` | baseURL **不能**带 `/v1` → 填了自动剥掉 |

容错（三种协议都适用）：用户若整段粘贴了端点路径（`…/v1/chat/completions`、`…/v1/messages`），
会先被剥回根地址；我们自己的模型/分组拉取也会用 `apiRoot()` 做同样归整，
所以不会出现 `/v1/v1/models`。

因此面板里填 `https://gateway.example.com` 或 `https://gateway.example.com/v1` 都能用。

## 切组后模型失效怎么处理

切组会改变可用模型集合。若当前默认模型（`ctx.agentDefaultModel.currentSelection()`）指向本插件的路由、
但已不在新分组的目录里，插件会：

- 状态里置 `staleModel: true`，并附一条 warning：「当前选中的模型 xxx 不在新分组里，请重新选择模型」
- 面板显示红色提示行

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
      api: 'openai-responses',
      baseURL: 'https://你的站点/v1',
      apiKeyEnv: 'ONEHUB_API_KEY',
      defaultContextWindow: 1000000,
      defaultMaxTokens: 128000,
      models: [{ id: 'deepseek-v4.1-flash', contextWindow: 1000000, maxTokens: 384000, input: ['text', 'image'] }, ...],   // 来自 GET /v1/models
    },
  },
})
```

**为什么每个模型都要写明 `contextWindow`、`maxTokens` 与 `input`**：pi-ai 的解析顺序是
`entry.contextWindow ?? 目录值 ?? provider.defaultContextWindow`，`input` 则是
`declaredInput(entry.input) ?? provider.defaultInput`（`declaredInput` 对**缺省和空数组**都返回
undefined）。所以只写 provider 级默认值时，模型在选择器里会显示成默认的小窗口、模态退化成纯文本。
本插件逐模型声明三者，provider 级再兜一层 `defaultInput`。注意这不只是标签：`dsh-compaction-basic`
的压缩阈值、溢出判定、用量压力百分比都是拿 `contextWindow` 算的。

图片模态由面板上的「图片输入」开关控制（默认开），关掉后模型只声明 `text`，
贴图会在附件阶段就被拒绝，而不是等上游在整轮中途报错。

### 上下文窗口与输出上限怎么定（三层取值链）

**`maxTokens` 必须逐模型写，改 provider 级默认值没用。** pi-ai 只把 entry 级的 `maxTokens`
上报成 `info.defaultMaxTokens`；provider 级的 `defaultMaxTokens` 只是它自己的解析 fallback，
不会上报。DSH 的 `resolveCallWithInfo()` 用它填请求的默认 `config.maxTokens`，
`dsh-compaction-basic` 的 `reservedCompletionTokens()` 也读它——所以只改默认值等于没改。

每个模型的容量按以下顺序取，先到先得：

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | 站点 `/v1/models` 声明的字段 | 认 `context_length` / `max_input_tokens` / `context_window` / `limit.context` 与 `max_output_tokens` / `max_completion_tokens` / `max_tokens` / `top_provider.max_completion_tokens`；字符串数字也收。网关对自己能力的声明最可信 |
| 2 | pi-ai 官方目录快照 | `src/shared/capacity-table.ts`（自动生成，见下） |
| 3 | 插件兜底 | 上下文 **1M**、输出 **128K** |

**两边都比、都照用：** 官方值更大就用官方的（`deepseek-v4.1-flash` 输出 384K，不会被压成 128K）；
官方值更小也用官方的（`hy4-preview` 输出 64K，按 128K 下发会被上游 400）。

**输出上限会被再夹一次：** `dsh-compaction-basic` 要求
`contextWindow > maxTokens + headroomTokens`（headroom 默认 65536），否则
`resolveCompactSpec()` 直接抛 `TargetPressureConfigError`，那一轮对话就废了。
所以声明值超过 `窗口 - 65536` 时会压到那个上限（例如 128K/128K 的模型条目会被压成 128K 窗口 + 62464 输出）。

面板「容量声明来源」一行会写清本次目录里各来源的模型数，避免把猜出来的窗口当成上游承诺。

**刷新官方快照**（升级 DSH / pi-ai 之后）：

```bash
npm run gen:capacity    # 从已安装的 pi-ai 目录重新生成 src/shared/capacity-table.ts
npm run build           # 重新打包 lib/
```

生成规则：同 id 在多个官方 provider 下有不同值时取**众数，票数相同取较小**
（宁可早压缩，也不要撞墙）。为什么快照而不是运行时读：插件跑在 DSH 宿主里，
profile 的 `node_modules` 顶层没有 `@earendil-works/pi-ai`（它是 `dsh-llm-pi-ai` 的依赖），
动态 import 会解析失败并整体退化成兜底值；直接打包又是 5.5MB。

**为什么切组要重挂载**：pi-ai 的 `providers` 是 schemastery 的 volatile 字段，但
`createVolatile()` 返回的是**冻结快照**，写入通道是内部 symbol（只有 Loader 能提交），
插件侧无法原地修改。所以目录变化时 dispose 旧 fiber、用新配置再挂一次；
模型集合未变时短路跳过（避免无意义抖动）。

## License

[MIT](LICENSE) © Sheep1x

> 注意区分用词：本文档里的「协议」若出现在「三种协议 / 线路协议 / OpenAI Responses」
> 语境下，指的是**模型线路协议**（wire protocol）；**开源许可**一律写作「License」。
