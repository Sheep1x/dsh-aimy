/** 两侧共用的类型：host 与 client 都只依赖这里的纯类型。 */

export interface RelayGroup {
  symbol: string;
  name: string;
  ratio: number;
  public: boolean;
}

export interface RelayModel {
  id: string;
  name?: string;
  /**
   * 站点在 /v1/models 里自己声明的上下文窗口。
   *
   * 绝大多数中转站只返回 id（本站实测如此），但 new-api / sub2api 的一些
   * 版本会带 `context_length` / `max_input_tokens` 之类字段。有则用：
   * 那是网关对自己能力的声明，比目录快照与兜底假设都可信。
   */
  contextWindow?: number;
  /** 站点声明的最大输出（`max_output_tokens` / `max_tokens` 等）。 */
  maxTokens?: number;
  /** 容量来源标注：仅用于面板展示与排障，不参与下发。 */
  capacitySource?: 'relay' | 'official' | 'default';
}

/**
 * 单个模型的可达性判定。
 *
 * 与「可用/不可用」二分不同，这里刻意保留 `unknown`：网关 5xx、限流 429、
 * 超时、断网都**不能**说明模型不存在，把它们判成不可用会让用户在一场网络
 * 抖动后丢掉整个模型目录。只有上游明确否定（404 / Model is unavailable）
 * 才判成 `unavailable`。
 */
export type ModelReachability = 'ok' | 'unavailable' | 'unknown';

/** 模型 id → 可达性。只在开启探测时出现。 */
export type ReachabilityMap = Record<string, ModelReachability>;

/** 中转站令牌分组状态：对应 GET /v1/token/group 的 data。 */
export interface TokenGroupState {
  group: string;
  backupGroup: string;
  ratio: number;
  allowGroupSwitch: boolean;
  groups: RelayGroup[];
}

/**
 * 四种线路协议，取值与 @deepseek-ai/dsh-llm-pi-ai 的 supportedProtocols() 完全一致，
 * 顺序也与它相同（它把「手写网关最常说的协议」放在最前，配置界面应据此决定默认值）。
 *
 * google-generative-ai 是这个 DSH 构建里也支持的第四种：pi-ai 用 @google/genai
 * 发 `{baseURL}/models/{id}:generateContent`，且它把 apiVersion 置空 —— 也就是
 * **版本段必须由 baseURL 自己带上（`/v1beta`）**，SDK 不会再补。这与 OpenAI 系
 * 要 `/v1`、Anthropic 不要版本段都不一样，见 host/provider.ts 的归整函数。
 */
export type RelayApi = 'openai-responses' | 'openai-completions' | 'anthropic-messages' | 'google-generative-ai';

/** 默认协议：目标站点主推 Responses。 */
export const DEFAULT_API: RelayApi = 'openai-responses';

/** 界面里的协议下拉项。 */
export const API_OPTIONS: ReadonlyArray<{ value: RelayApi; label: string }> = [
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'openai-completions', label: 'OpenAI Chat Completions' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Gemini (v1beta)' },
];

/** 密钥的存储状态（描述，从不包含密钥值）。 */
export interface CredentialStatus {
  configured: boolean;
  source?: string;
  writable: boolean;
}

/** 模型路由（pi-ai 挂载）的当前状态。 */
export interface ProviderState {
  routeName: string;
  mounted: boolean;
  modelCount: number;
  error?: string;
  /** /state 附带的自检结果（仅 host 侧填充，供面板排障）*/
  diagnostics?: {
    routeName: string;
    apiKeyRef: string;
    llmService?: string;
    providers?: string[];
    registryPresent?: boolean;
    registryModels?: number | string;
    credentialResolve?: string;
    settingsChannel?: string;
    settingsNs?: string;
  };
}

/** 当前默认模型选择（来自 agentDefaultModel 服务）。 */
export interface ModelSelection {
  provider: string;
  model: string;
}

export type ProfileId = 'aimy' | 'compat';

/** 插件对客户端暴露的完整状态。 */
export interface PluginState {
  profile: ProfileId;
  displayName: string;
  /** 档案的地址；预设档案返回内置默认地址（界面只读展示）*/
  baseURL: string;
  /** true 表示该档案是内置预设，地址只读（不可编辑）*/
  preset: boolean;
  /** 与 @deepseek-ai/dsh-llm-pi-ai 的 supportedProtocols() 一致 */
  api: RelayApi;
  /** 是否给模型声明图片输入（面板开关，默认开）*/
  imageInput: boolean;
  /** 兼容模式是否已填地址 */
  configured: boolean;
  connected: boolean;
  /** 中转站不支持切组接口（404）时为 false，界面应降级为只读 */
  supportsSwitch: boolean;
  token: TokenGroupState | null;
  models: RelayModel[];
  modelsFetchedAt: number;
  /**
   * 模型可达性（仅在开启 `probeModels` 时出现）。
   * `unavailable` 的模型仍在 `models` 里，但界面会标注并排除在选择之外。
   */
  reachability?: ReachabilityMap;
  provider: ProviderState | null;
  credential: CredentialStatus | null;
  /** 当前默认模型选择 */
  selection: ModelSelection | null;
  /** 选中模型不在本路由当前目录里（切组后常见）——只提示，不自动改选 */
  staleModel: boolean;
  error?: string;
}

export interface SwitchResult {
  state: PluginState;
  /** 切换成功但模型目录刷新/重挂载失败时的提示 */
  warning?: string;
}

export function emptyState(baseURL: string, overrides: Partial<PluginState> = {}): PluginState {
  return {
    profile: 'aimy',
    displayName: '',
    preset: false,
    api: DEFAULT_API,
    imageInput: true,
    configured: true,
    ...overrides,
    baseURL,
    connected: false,
    supportsSwitch: false,
    token: null,
    models: [],
    modelsFetchedAt: 0,
    provider: null,
    credential: null,
    selection: null,
    staleModel: false,
  };
}

/**
 * 是否需要拉取诊断信息。
 *
 * 诊断内容（注册表是否注册、路由模型数、密钥解析、settings 通道）只是排障线索，
 * 正常状态下没有价值，但每次拉取要 `llm.listModels()` + `settings.describe()`，
 * 实测 370–580ms。所以只在**真出问题**时才拉：未连接、未配置密钥、未挂载、有错误。
 *
 * 放在 shared 而不是 client：这是纯判断，好单测，也避免把条件散落在 effect 里。
 */
/* ------------------------------ 底部余额条 ------------------------------ */

/**
 * 一次余额读数。host 侧算好金额/额度/百分比，客户端只负责排版 ——
 * 换算口径（剩余、总额、已用比例）留在能跑单测的那一侧。
 */
export interface BalanceView {
  /** 剩余金额（站点自己的展示口径，不换算汇率） */
  amount: number;
  /** 币种；缺省 = 站点没明说，按 USD 渲染 */
  currency?: string;
  /** 总额；缺省 = 拿不到基准，只显示金额 */
  limit?: number;
  /** 已用百分比 0–100；缺省 = 没有基准 */
  usedPercent?: number;
  /** 哪一档取到的（排障用）：模板 / 内置三档 */
  source: 'template' | 'usage' | 'billing' | 'token';
  /** 读数的 ISO 时间 */
  fetchedAt: string;
}

/**
 * 分组胶囊要的数据：当前分组 + 可切换列表。
 *
 * `name` 为空串 = 站点有分组接口但没报当前分组；`allowSwitch=false` 时胶囊只读
 * （站点没开 `allow_group_switch`，或者根本没有 `/v1/token/group`）。
 */
export interface BalanceGroup {
  name: string;
  /** 分组倍率（站点自己的口径，1 = 原价） */
  ratio?: number;
  allowSwitch: boolean;
  /** 可选项；只留渲染要用的三个字段，别把整份 token 报文透给前端 */
  groups: { name: string; symbol?: string; ratio?: number }[];
}

export interface BalanceResponse {
  ok: boolean;
  view: BalanceView | null;
  /** 当前分组；读不到（没凭证 / 站点没这接口 / 网络失败）时为 null */
  group?: BalanceGroup | null;
  /** 本次失败原因（可能同时带上一轮成功的 view） */
  error?: string;
  /** 配置里关掉了余额条：客户端整条不渲染 */
  disabled?: boolean;
  /** 这条读数来自缓存，后台正在刷新 */
  stale?: boolean;
  /** 读数归属的档案（宿主按当前默认模型选） */
  profile?: ProfileId;
  displayName?: string;
  /** 轮询间隔（秒），由配置决定；客户端据此设定定时器 */
  refreshSeconds?: number;
  /** 用户自定义单价（覆盖内置牌价表，给站点自造模型用） */
}

/** 余额条每分钟最多查一次；轮询间隔由配置决定。 */
export const DEFAULT_BALANCE_REFRESH_SECONDS = 300;

export function needsDiagnostics(state: PluginState | null): boolean {
  if (!state) return false; // 还没有状态：等 /state 回来再说
  if (state.error) return true;
  if (!state.configured) return true;
  if (!state.credential || !state.credential.configured) return true;
  if (!state.connected) return true;
  if (!state.provider || !state.provider.mounted) return true;
  if (state.provider.error) return true;
  return false;
}
