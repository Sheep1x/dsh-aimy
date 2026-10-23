/**
 * 把 @deepseek-ai/dsh-llm-pi-ai 挂进本插件的 fiber，让 DSH 模型选择器出现中转站的模型。
 *
 * 为什么是「重挂载」而不是「原地改配置」：
 *   pi-ai 的 Config 里 providers 是 volatile 字段，但 createVolatile 返回的是
 *   **冻结快照**，写入通道是内部 symbol（只有 Loader 能提交），插件侧拿不到。
 *   所以模型目录变化时只能 dispose 旧 fiber、用新配置再挂一次。
 *   路由注册本身是原子的，失败时旧路由集合仍然可用。
 */
import type { RelayModel } from '../shared/types';

export type RelayApi = 'openai-completions' | 'anthropic-messages';

export interface ProviderOptions {
  /** pi-ai 路由名（GenerateOptions.provider）*/
  routeName: string;
  /** 模型选择器里的显示名 */
  displayName: string;
  /** 中转站根地址（本模块负责拼 /v1）*/
  baseURL: string;
  /** 凭据引用名，交给 pi-ai 走 harness 凭据链解析 */
  apiKeyRef: string;
  /** 协议：OpenAI 兼容（new-api / sub2api 等）或 Anthropic 兼容 */
  api?: RelayApi;
  models: RelayModel[];
  defaultContextWindow: number;
  defaultMaxTokens: number;
  /** 模块说明符，默认官方适配器；测试可指向假实现 */
  adapterModule?: string;
}

/** 一次挂载的句柄：可以在目录变化时重挂，也可以整体卸载。 */
export interface ProviderMount {
  readonly mounted: boolean;
  readonly modelCount: number;
  readonly routeName: string;
  update(models: RelayModel[]): Promise<void>;
  dispose(): Promise<void>;
}

const DEFAULT_ADAPTER = '@deepseek-ai/dsh-llm-pi-ai';

/**
 * 按协议归整 baseURL —— 两种 SDK 的路径拼接口径不同：
 *
 *   openai-completions : SDK 自己拼 `/chat/completions`  → baseURL 必须以 `/v1` 结尾
 *   anthropic-messages : SDK 自己拼 `/v1/messages`       → baseURL 不能带 `/v1`
 *
 * 因此这里统一处理「用户怎么填都能用」：
 *   - 用户填了完整端点（…/chat/completions、…/v1/messages）→ 先剥掉
 *   - OpenAI 协议：缺 `/v1` 自动补，已有则不重复补
 *   - Anthropic 协议：多余的 `/v1` 自动剥掉
 */
export function normalizeBaseURLForApi(baseURL: string, api: RelayApi = 'openai-completions'): string {
  let trimmed = baseURL.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  if (api === 'anthropic-messages') {
    trimmed = trimmed.replace(/\/v1\/messages$/i, '').replace(/\/messages$/i, '');
    return trimmed.replace(/\/v1$/i, '');
  }

  trimmed = trimmed
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/completions$/i, '');
  return /\/v1$/i.test(trimmed) ? trimmed : trimmed + '/v1';
}

/** @deprecated 保留旧名，等价于 OpenAI 协议的归整。 */
export function completionsBaseURL(baseURL: string): string {
  return normalizeBaseURLForApi(baseURL, 'openai-completions');
}

/** 组装一个 provider profile；导出便于单测断言字段映射。 */
export function buildProfile(opts: ProviderOptions): Record<string, unknown> {
  return {
    displayName: opts.displayName,
    api: opts.api ?? 'openai-completions',
    baseURL: normalizeBaseURLForApi(opts.baseURL, opts.api ?? 'openai-completions'),
    apiKeyEnv: opts.apiKeyRef,
    defaultContextWindow: opts.defaultContextWindow,
    defaultMaxTokens: opts.defaultMaxTokens,
    // 模型能力不猜：只声明 id，其余交给路由级默认值兜底
    models: opts.models.map((m) => ({ id: m.id })),
  };
}

/** 模型集合是否相同（用于跳过无意义的重挂载）。 */
export function sameModels(a: RelayModel[], b: RelayModel[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

export async function createProviderMount(
  ctx: any,
  opts: ProviderOptions,
  loadAdapter: (specifier: string) => Promise<any> = (s) => import(s),
): Promise<ProviderMount> {
  const specifier = opts.adapterModule ?? DEFAULT_ADAPTER;
  const adapter = await loadAdapter(specifier);
  const plugin = adapter?.PiAiAdapter ?? adapter?.default ?? adapter;
  if (!plugin) {
    throw new Error('适配器模块没有导出可挂载的插件：' + specifier);
  }

  let fiber: any;
  let models = opts.models;

  const mountWith = (next: RelayModel[]) => {
    const config = { providers: { [opts.routeName]: buildProfile({ ...opts, models: next }) } };
    fiber = ctx.plugin(plugin, config);
    models = next;
  };

  mountWith(opts.models);

  return {
    get mounted() {
      return Boolean(fiber);
    },
    get modelCount() {
      return models.length;
    },
    routeName: opts.routeName,
    async update(next: RelayModel[]) {
      if (sameModels(models, next)) return;
      if (fiber && typeof fiber.dispose === 'function') {
        await fiber.dispose();
        fiber = undefined;
      }
      mountWith(next);
    },
    async dispose() {
      if (fiber && typeof fiber.dispose === 'function') {
        await fiber.dispose();
      }
      fiber = undefined;
      models = [];
    },
  };
}
