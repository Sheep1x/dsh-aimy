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
  /** 路由由谁管理：本插件自挂的 fiber，还是写进了宿主已有的 pi-ai 配置 */
  readonly managedBy: 'fiber' | 'settings';
  /** 回读宿主 llm 注册表：路由是否真的注册上、模型数是否非零 */
  verify(): Promise<{ present: boolean | null; listedModels: number | null; detail?: string }>;
  readonly modelCount: number;
  readonly routeName: string;
  update(models: RelayModel[]): Promise<void>;
  dispose(): Promise<void>;
}

const DEFAULT_ADAPTER = '@deepseek-ai/dsh-llm-pi-ai';

/**
 * 从适配器模块里挑出**可以交给 ctx.plugin() 的插件**。
 *
 * 坑：@deepseek-ai/dsh-llm-pi-ai 导出的 `PiAiAdapter` 是**适配器实现类**
 * （`class extends LlmAdapter`，只有 constructor 和几个方法），不是 cordis 插件。
 * 真正的插件是模块命名空间本身：`{ name: 'llm-pi-ai', inject: ['llm'], apply(ctx, config), Config }`。
 * 把类传给 ctx.plugin() 不会报错，但也不会注册任何 provider ——
 * 表现就是「插件面板正常、模型选择器里一个模型都没有」。
 *
 * 所以这里按「有 apply 的对象 / 函数插件」优先，最后才退回同名导出（兼容别的适配器包）。
 */
export function pickPlugin(adapter: any, specifier = DEFAULT_ADAPTER): any {
  if (adapter === undefined || adapter === null) {
    throw new Error('适配器模块为空：' + specifier);
  }
  // 1) 模块命名空间（ESM import 的结果）或带 apply 的对象
  if (typeof adapter.apply === 'function') return adapter;
  // 2) 函数式插件（cordis 允许直接传函数）
  if (typeof adapter === 'function' && !adapter.prototype) return adapter;
  // 3) default 导出
  const fallback = adapter.default;
  if (fallback && typeof fallback.apply === 'function') return fallback;
  if (typeof fallback === 'function' && !fallback.prototype) return fallback;
  throw new Error(
    '适配器模块没有导出可挂载的 cordis 插件（需要 name/inject/apply）：' +
      specifier +
      '，实际导出：' +
      Object.keys(adapter).join(', '),
  );
}

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
  const plugin = pickPlugin(adapter, specifier);

  let fiber: any;
  let models = opts.models;

  /** 最近一次挂载后的自检结果：注册表里到底有没有这条路由。 */
  let verification: { present: boolean | null; listedModels: number | null; detail?: string } | null = null;

  const mountWith = (next: RelayModel[]) => {
    const config = { providers: { [opts.routeName]: buildProfile({ ...opts, models: next }) } };
    fiber = ctx.plugin(plugin, config);
    models = next;
    verification = null;
  };

  /**
   * 挂载后自检：直接问宿主的 llm 注册表。
   *
   * 只信 ctx.plugin() 的返回值是不够的 —— fiber 存在不代表注册成功（inject 未满足时
   * 会停在 pending，pi-ai 的 listModels 解析不到凭据时又会返回空数组）。
   * 这两种情况都会让模型选择器里什么都不显示，所以必须回读注册表确认。
   */
  const verify = async (): Promise<{ present: boolean | null; listedModels: number | null; detail?: string }> => {
    if (verification) return verification;
    try {
      const llm = typeof ctx?.get === 'function' ? ctx.get('llm', false) : undefined;
      if (!llm || typeof llm.listProviders !== 'function') {
        // 无法自检（例如测试替身里没有 llm）：不当成失败，避免误报
        verification = { present: null, listedModels: null, detail: 'llm 服务不可用（无法自检）' };
        return verification;
      }
      const fiberState = fiber && typeof fiber.state === 'number' ? fiber.state : undefined;
      if (fiberState !== undefined && fiberState !== 2) {
        verification = {
          present: false,
          listedModels: null,
          detail:
            'pi-ai 子插件未激活（fiber.state=' + fiberState + '）。' +
            '常见原因：profile 里已有 @deepseek-ai/dsh-llm-pi-ai 条目，同一个 pi-ai 不能挂两次' +
            '（内置 provider 目录会重复注册而整体失败）',
        };
        return verification;
      }
      const present = llm.listProviders().some((p: any) => p?.id === opts.routeName);
      let listedModels: number | null = null;
      if (present && typeof llm.listModels === 'function') {
        try {
          const listed = await llm.listModels(opts.routeName);
          listedModels = Array.isArray(listed) ? listed.length : 0;
        } catch (error) {
          verification = { present, listedModels: null, detail: 'listModels 抛错：' + (error instanceof Error ? error.message : String(error)) };
          return verification;
        }
      }
      verification = {
        present,
        listedModels,
        ...(present && listedModels === 0
          ? { detail: '路由已注册但模型为空（通常是 apiKeyEnv 解析不到凭据）' }
          : {}),
        ...(!present ? { detail: 'ctx.plugin 未把路由注册进 llm（fiber 可能停在 pending）' } : {}),
      };
      return verification;
    } catch (error) {
      verification = { present: false, listedModels: null, detail: '自检抛错：' + (error instanceof Error ? error.message : String(error)) };
      return verification;
    }
  };

  mountWith(opts.models);

  return {
    managedBy: 'fiber' as const,
    get mounted() {
      return Boolean(fiber);
    },
    get modelCount() {
      return models.length;
    },
    routeName: opts.routeName,
    verify,
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
