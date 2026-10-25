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
 * 三种线路协议，取值与 @deepseek-ai/dsh-llm-pi-ai 的 supportedProtocols() 完全一致，
 * 顺序也与它相同（它把「手写网关最常说的协议」放在最前，配置界面应据此决定默认值）。
 */
export type RelayApi = 'openai-responses' | 'openai-completions' | 'anthropic-messages';

/** 默认协议：目标站点主推 Responses。 */
export const DEFAULT_API: RelayApi = 'openai-responses';

/** 界面里的协议下拉项。 */
export const API_OPTIONS: ReadonlyArray<{ value: RelayApi; label: string }> = [
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'openai-completions', label: 'OpenAI Chat Completions' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
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
