/** /dsh-aimy-relay/* 的业务实现：纯函数式编排，便于脱离 Cordis 单测。 */
import { RelayError, fetchModels, fetchTokenGroup, probeModels, switchTokenGroup, type RelayOptions } from './relay';
import { resolveModels } from './capacity';
import type { ProviderMount } from './provider';
import type { CatalogStore } from './state';
import {
  emptyState,
  type CredentialStatus,
  type ModelSelection,
  type PluginState,
  type RelayApi,
  type SwitchResult,
} from '../shared/types';

export interface RouteDeps {
  baseURL: string;
  /** 本档案的 pi-ai 路由名（挂载失败时用来说明是哪条路由）*/
  routeName?: string;
  group: string;
  apiKey: string;
  /** 线路协议：探测请求据此选端点，必须与真实调用一致 */
  api?: RelayApi;
  store: CatalogStore;
  /** 已挂载的模型路由（可选：未挂载时状态里 provider 为 null）*/
  provider?: ProviderMount;
  /** 密钥存储状态（由入口注入，routes 不直接依赖凭据服务）*/
  credential?: CredentialStatus | null;
  /** 当前默认模型选择（由入口从 agentDefaultModel 读取）*/
  selection?: ModelSelection | null;
  /** 切组专用：强制重挂（不复用模型集合短路），确保目录与新分组一致 */
  remountProvider?: (models: import('../shared/types').RelayModel[]) => Promise<{ ok: boolean; error?: string }>;
  /** 目录变化后同步给 provider（挂载或重挂载）；失败只记录不抛 */
  syncProvider?: (models: import('../shared/types').RelayModel[]) => Promise<{ ok: boolean; error?: string }>;
  /** 是否在刷新目录后探测模型可达性（成本极低，但会多打几条请求）*/
  probeModels?: boolean;
  fetchImpl?: typeof fetch;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

function opts(deps: RouteDeps): RelayOptions {
  return { baseURL: deps.baseURL, apiKey: deps.apiKey, api: deps.api, fetchImpl: deps.fetchImpl };
}

/** 把「当前选择」与目录做一致性检查：只标记，不改选，避免静默更换计费对象。 */
function applySelection(state: PluginState, deps: RouteDeps): void {
  state.selection = deps.selection ?? null;
  const routeName = deps.provider?.routeName;
  if (!deps.selection || !routeName) {
    state.staleModel = false;
    return;
  }
  if (deps.selection.provider !== routeName) {
    // 选择指向别的路由：与本插件无关
    state.staleModel = false;
    return;
  }
  if (state.models.length === 0) {
    state.staleModel = false;
    return;
  }
  state.staleModel = !state.models.some((m) => m.id === deps.selection?.model);
}

function providerState(
  deps: RouteDeps,
  error?: string,
  fallbackRoute?: string,
): PluginState['provider'] {
  if (!deps.provider) {
    // 还没有挂载句柄，但同步已经明确失败：也要把错误暴露出去，
    // 否则「挂载失败」在界面上会显示成「未挂载」，看不出原因。
    if (!error) return null;
    return { routeName: fallbackRoute ?? '', mounted: false, modelCount: 0, error };
  }
  return {
    routeName: deps.provider.routeName,
    mounted: deps.provider.mounted,
    modelCount: deps.provider.modelCount,
    error,
  };
}

/** 读取当前状态：模型目录是必需的，分组信息是可选能力。
 *
 * 第三方站点（new-api / sub2api 等）没有 /v1/token/group：
 * 这种 404 只把 supportsSwitch 置 false 并继续拉模型，绝不整体失败。
 */
export async function readState(deps: RouteDeps, refresh = false): Promise<PluginState> {
  const state = emptyState(deps.baseURL);
  state.credential = deps.credential ?? null;
  applySelection(state, deps);

  if (!deps.apiKey) {
    state.error = '未配置 API Key：请在下方填写并保存';
    state.provider = providerState(deps);
    return state;
  }

  // 1) 分组信息（可选）
  try {
    state.token = await fetchTokenGroup(opts(deps));
    state.supportsSwitch = true;
  } catch (error) {
    const missingApi = error instanceof RelayError && error.kind === 'not-found';
    if (!missingApi) {
      return applyError(state, error);
    }
    state.supportsSwitch = false;
  }

  // 2) 模型目录（必需）
  const groupKey = state.token?.group ?? '';
  const cached = deps.store.get(deps.baseURL, groupKey);
  if (!refresh && cached) {
    // 老缓存（升级前落盘的）没有容量字段：这里补算一次。
    // resolveModels 幂等，已定稿的条目原样返回。
    const cachedModels = resolveModels(cached.models);
    state.models = cachedModels;
    state.modelsFetchedAt = cached.fetchedAt;
    state.connected = true;
    // 缓存命中也要同步 provider：进程刚起来 / 面板没开过时，模型路由还没挂，
    // 只有挂上去模型才会出现在 DSH 的模型选择器里。
    const synced = await deps.syncProvider?.(cachedModels);
    state.provider = providerState(deps, synced && !synced.ok ? synced.error : undefined, deps.routeName);
    applySelection(state, deps);
    return state;
  }

  try {
    // 解析容量后再落缓存：缓存里存的必须是「已定稿」的条目，
    // 否则冷启动预热会拿一份缺容量的目录去挂载（模型选择器里显示成兜底值）。
    const models = resolveModels(await fetchModels(opts(deps)));
    const fetchedAt = Date.now();
    deps.store.set({ baseURL: deps.baseURL, group: groupKey, models, fetchedAt });
    state.models = models;
    state.modelsFetchedAt = fetchedAt;
    state.connected = true;

    // 探测放在挂载之前：先把「上游到底认不认这个 id」弄清楚，
    // 但**不因此裁剪目录** —— 判死的只是标注，挂载仍按完整目录来，
    // 否则一次探测抖动会让模型从选择器里消失。
    if (deps.probeModels) {
      state.reachability = await probeModels(opts(deps), models);
    }

    const synced = await deps.syncProvider?.(models);
    state.provider = providerState(deps, synced && !synced.ok ? synced.error : undefined, deps.routeName);
    applySelection(state, deps);
    return state;
  } catch (error) {
    state.connected = false;
    state.provider = providerState(deps);
    return applyError(state, error);
  }
}

/** 切换分组：成功后再刷新目录；目录刷新失败不回滚分组，只给出 warning。 */
export async function switchGroup(deps: RouteDeps, group: string): Promise<RouteResult> {
  if (!deps.apiKey) {
    return { status: 400, body: { success: false, message: '缺少 API Key' } };
  }
  if (!group) {
    return { status: 400, body: { success: false, message: '分组不能为空' } };
  }

  let token;
  try {
    token = await switchTokenGroup(opts(deps), group);
  } catch (error) {
    const status = error instanceof RelayError ? mapStatus(error) : 500;
    return { status, body: { success: false, message: describeError(error) } };
  }

  const state = emptyState(deps.baseURL);
  state.token = token;
  state.connected = true;
  state.supportsSwitch = true;

  let warning: string | undefined;
  try {
    const models = resolveModels(await fetchModels(opts(deps)));
    const fetchedAt = Date.now();
    deps.store.set({ baseURL: deps.baseURL, group: token.group, models, fetchedAt });
    state.models = models;
    state.modelsFetchedAt = fetchedAt;

    // 切组后模型集合可能整体换掉，必须强制重挂：syncProvider 会用模型集合
    // 相同来短路，而这里需要的是「把旧目录彻底换掉」。
    const synced = deps.remountProvider
      ? await deps.remountProvider(models)
      : await deps.syncProvider?.(models);
    if (synced && !synced.ok) {
      warning = '分组已切换，但模型路由更新失败：' + (synced.error ?? '未知错误');
    }
  } catch (error) {
    warning = '分组已切换，但模型列表刷新失败：' + describeError(error);
    const cached = deps.store.get(deps.baseURL, token.group);
    if (cached) {
      state.models = cached.models;
      state.modelsFetchedAt = cached.fetchedAt;
    }
  }

  state.provider = providerState(deps, warning);
  applySelection(state, deps);
  const result: SwitchResult = { state, warning };
  return { status: 200, body: { success: true, message: '', data: result } };
}

function applyError(state: PluginState, error: unknown): PluginState {
  state.connected = false;
  state.error = describeError(error);
  return state;
}

function mapStatus(error: RelayError): number {
  if (error.kind === 'network') return 502;
  if (error.status >= 400 && error.status < 600) return error.status;
  return 500;
}

export function describeError(error: unknown): string {
  if (error instanceof RelayError) {
    switch (error.kind) {
      case 'auth':
        return 'API Key 无效或已过期';
      case 'forbidden':
        return error.message || '该操作被中转站拒绝（请检查令牌是否开启「允许客户端切换分组」）';
      case 'not-found':
        return '中转站版本过低，缺少 /v1/token/group 接口';
      case 'network':
        return error.message;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
