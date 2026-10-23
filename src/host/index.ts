/**
 * dsh-aimy 宿主半侧。
 *
 * 两个配置档案（见 ./profiles）：
 *   - aimy   本站中转站预设：地址固化、界面不展示；支持真实切分组
 *   - compat 兼容模式：用户自填 URL + 协议（new-api / sub2api / 其它 OpenAI 兼容网关）
 *
 * 职责：
 *   1. 解析档案配置与密钥（凭据库优先，环境变量兜底）
 *   2. 为每个已配置的档案挂载 @deepseek-ai/dsh-llm-pi-ai 路由
 *   3. 提供 /dsh-aimy-relay/* 路由（?profile=aimy|compat）
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createProviderMount, type ProviderMount } from './provider';
import {
  AIMY_DEFAULT_BASE_URL,
  AIMY_DEFAULT_DISPLAY_NAME,
  COMPAT_KEY_REF,
  ProfileSettingsStore,
  isProfileId,
  normalizeApi,
  normalizeBaseURL,
  resolveProfile,
  type ProfileConfig,
  type ProfileId,
  type RelayApi,
} from './profiles';
import { CatalogStore } from './state';
import { describeError, readState, switchGroup, type RouteDeps } from './routes';
import type { RelayModel } from '../shared/types';

const ROUTE_PREFIX = '/dsh-aimy-relay';

export const name = 'dsh-aimy';

/** webServer 必需；llm 由挂载的适配器自己 inject；credentials/agentDefaultModel 可选。 */
export const inject = ['webServer'];

export interface Config {
  /** Aimy 预设 */
  baseURL?: string;
  apiKeyRef?: string;
  routeName?: string;
  displayName?: string;
  api?: string;
  /** 兼容模式（地址与协议也可由设置页写入 profiles.json）*/
  compatBaseURL?: string;
  compatApi?: string;
  /** 通用 */
  defaultContextWindow?: number;
  defaultMaxTokens?: number;
  providerAdapter?: string;
  /** 仅调试用：直接内联密钥（不落盘、不推荐）*/
  apiKey?: string;
}

const DEFAULT_KEY_REF = 'ONEHUB_API_KEY';
const DEFAULT_ROUTE = 'onehub';
const DEFAULT_CONTEXT_WINDOW = 131072;
const DEFAULT_MAX_TOKENS = 8192;

function readConfig(ctx: any, config?: Config): Config {
  const fromCtx = typeof ctx?.config === 'object' && ctx.config !== null ? (ctx.config as Config) : {};
  return { ...fromCtx, ...(config ?? {}) };
}

/* ------------------------------ 凭据 / 选择 ------------------------------ */

function getCredentials(ctx: any): any | undefined {
  return typeof ctx?.get === 'function' ? ctx.get('credentials', false) : undefined;
}

export function isValidCredentialRef(ref: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref);
}

function pickCredentialValue(resolved: unknown): string {
  if (resolved && typeof resolved === 'object' && typeof (resolved as Record<string, unknown>).value === 'string') {
    return String((resolved as Record<string, string>).value).trim();
  }
  if (typeof resolved === 'string') return resolved;
  if (resolved && typeof resolved === 'object') {
    const record = resolved as Record<string, unknown>;
    for (const key of ['key', 'apiKey', 'secret']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate) return candidate;
    }
  }
  return '';
}

async function resolveApiKey(ctx: any, ref: string, inline?: string): Promise<string> {
  if (inline && inline.trim()) return inline.trim();
  if (!ref) return '';
  try {
    const credentials = getCredentials(ctx);
    if (credentials && typeof credentials.resolve === 'function') {
      const value = pickCredentialValue(await credentials.resolve(ref));
      if (value) return value;
    }
  } catch {
    // 凭据服务不可用：走环境变量
  }
  const fromEnv = process.env[ref];
  return typeof fromEnv === 'string' ? fromEnv.trim() : '';
}

async function describeCredential(ctx: any, ref: string): Promise<{ configured: boolean; source?: string; writable: boolean } | null> {
  try {
    const credentials = getCredentials(ctx);
    if (!credentials || typeof credentials.describe !== 'function') return null;
    const info = await credentials.describe(ref);
    return {
      configured: Boolean(info?.configured),
      source: typeof info?.source === 'string' ? info.source : undefined,
      writable: Boolean(info?.writable),
    };
  } catch {
    return null;
  }
}

async function setCredential(ctx: any, ref: string, value: string): Promise<void> {
  const credentials = getCredentials(ctx);
  if (!credentials || typeof credentials.set !== 'function') {
    throw new Error('凭据服务不可用：无法保存密钥，请改用环境变量 ' + ref);
  }
  await credentials.set(ref, value);
}

async function unsetCredential(ctx: any, ref: string): Promise<void> {
  const credentials = getCredentials(ctx);
  if (!credentials || typeof credentials.unset !== 'function') {
    throw new Error('凭据服务不可用：无法清除密钥');
  }
  await credentials.unset(ref);
}

/** 读当前默认模型选择；服务缺失或抛错时返回 null。 */
function readSelection(ctx: any): { provider: string; model: string } | null {
  try {
    const service = typeof ctx?.get === 'function' ? ctx.get('agentDefaultModel', false) : undefined;
    if (!service || typeof service.currentSelection !== 'function') return null;
    const selection = service.currentSelection();
    if (!selection || typeof selection !== 'object') return null;
    const provider = String((selection as Record<string, unknown>).provider ?? '');
    const model = String((selection as Record<string, unknown>).model ?? '');
    if (!provider || !model) return null;
    return { provider, model };
  } catch {
    return null;
  }
}

/* --------------------------------- HTTP --------------------------------- */

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function parseJson(raw: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/* --------------------------------- 插件 --------------------------------- */

export function apply(ctx: any, config?: Config): void {
  const catalogs = new CatalogStore();
  catalogs.load();
  const settings = new ProfileSettingsStore();
  settings.load();

  const mounts = new Map<ProfileId, ProviderMount>();
  const mountErrors = new Map<ProfileId, string>();

  const resolve = (id: ProfileId): ProfileConfig => {
    const cfg = readConfig(ctx, config);
    return resolveProfile({
      id,
      settings,
      defaults: {
        baseURL: cfg.baseURL ?? AIMY_DEFAULT_BASE_URL,
        apiKeyRef: cfg.apiKeyRef ?? DEFAULT_KEY_REF,
        routeName: cfg.routeName ?? DEFAULT_ROUTE,
        displayName: cfg.displayName ?? AIMY_DEFAULT_DISPLAY_NAME,
        api: normalizeApi(cfg.api),
        defaultContextWindow: cfg.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
        defaultMaxTokens: cfg.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
      },
    });
  };

  /** 目录变化 → 首次挂载 / 重挂载该档案的模型路由。失败只记录。 */
  const syncProvider = async (profile: ProfileConfig, models: RelayModel[]): Promise<{ ok: boolean; error?: string }> => {
    if (!profile.baseURL) {
      return { ok: false, error: '该档案还没配置地址' };
    }
    if (models.length === 0) {
      return { ok: false, error: '当前分组没有可用模型，未挂载模型路由' };
    }
    const cfg = readConfig(ctx, config);
    try {
      const existing = mounts.get(profile.id);
      if (!existing) {
        const created = await createProviderMount(ctx, {
          routeName: profile.routeName,
          displayName: profile.displayName,
          baseURL: profile.baseURL,
          apiKeyRef: profile.apiKeyRef,
          api: profile.api,
          models,
          defaultContextWindow: profile.defaultContextWindow,
          defaultMaxTokens: profile.defaultMaxTokens,
          adapterModule: cfg.providerAdapter,
        });
        mounts.set(profile.id, created);
      } else {
        await existing.update(models);
      }
      mountErrors.delete(profile.id);
      return { ok: true };
    } catch (error) {
      const message = describeError(error);
      mountErrors.set(profile.id, message);
      return { ok: false, error: message };
    }
  };

  const buildDeps = async (profile: ProfileConfig): Promise<RouteDeps> => {
    const cfg = readConfig(ctx, config);
    const inline = profile.preset ? cfg.apiKey : undefined;
    return {
      baseURL: profile.baseURL,
      group: '',
      apiKey: await resolveApiKey(ctx, profile.apiKeyRef, inline),
      store: catalogs,
      provider: mounts.get(profile.id),
      syncProvider: (models) => syncProvider(profile, models),
      credential: await describeCredential(ctx, profile.apiKeyRef),
      selection: readSelection(ctx),
    };
  };

  /** 取某档案的状态：地址缺失时返回「待配置」空状态，绝不发网络请求。 */
  const stateFor = async (profile: ProfileConfig, refresh = false) => {
    if (!profile.baseURL) {
      return {
        ...readStateEmpty(''),
        error: '兼容模式还没配置：请填写地址与密钥后保存',
      } as any;
    }
    const deps = await buildDeps(profile);
    return readState(deps, refresh);
  };

  /** 给状态补上档案身份；预设档案不暴露地址。 */
  const decorate = <T extends Record<string, any>>(state: T, profile: ProfileConfig): T => {
    state.profile = profile.id;
    state.displayName = profile.displayName;
    state.preset = profile.preset;
    state.api = profile.api;
    state.configured = Boolean(profile.baseURL);
    if (profile.preset) state.baseURL = '';
    return state;
  };

  /** 用最新挂载句柄回填状态（deps 里的 provider 是构建时快照）。 */
  const withProvider = <T extends Record<string, any>>(state: T, profile: ProfileConfig): T => {
    const mount = mounts.get(profile.id);
    if (mount) {
      state.provider = {
        routeName: mount.routeName,
        mounted: mount.mounted,
        modelCount: mount.modelCount,
        ...(mountErrors.has(profile.id) ? { error: mountErrors.get(profile.id) } : {}),
      };
    }
    return state;
  };

  ctx.effect(() => () => {
    for (const mount of mounts.values()) void mount.dispose();
    mounts.clear();
  }, 'dsh-aimy: dispose providers');

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const pathname = url.pathname;
          const method = (req.method ?? 'GET').toUpperCase();
          const route = pathname.slice(ROUTE_PREFIX.length) || '/';
          const rawProfile = url.searchParams.get('profile') ?? 'aimy';
          const profileId: ProfileId = isProfileId(rawProfile) ? rawProfile : 'aimy';

          try {
            const profile = resolve(profileId);

            // 地址缺失只拦「要联网」的路由；/credentials 与 /config 必须能独立保存，
            // 否则用户永远没法先填密钥再填地址。
            const needsNetwork = route === '/state' || route === '/refresh' || route === '/switch';
            if (!profile.baseURL && needsNetwork) {
              const state = decorate(
                {
                  ...readStateEmpty(profile.baseURL),
                  error: '兼容模式还没配置：请填写地址与密钥后保存',
                } as any,
                profile,
              );
              sendJson(res, 200, { success: true, data: withProvider(state, profile) });
              return;
            }

            const deps = await buildDeps(profile);

            if (method === 'GET' && route === '/state') {
              const state = withProvider(decorate(await readState(deps), profile), profile);
              sendJson(res, 200, { success: true, data: state });
              return;
            }

            if (method === 'POST' && route === '/refresh') {
              const state = withProvider(decorate(await readState(deps, true), profile), profile);
              sendJson(res, 200, { success: true, data: state });
              return;
            }

            if (method === 'POST' && route === '/credentials') {
              const payload = parseJson(await readBody(req));
              const apiKey = String(payload?.apiKey ?? '').trim();
              if (!apiKey) {
                sendJson(res, 400, { success: false, message: '密钥不能为空' });
                return;
              }
              if (!isValidCredentialRef(profile.apiKeyRef)) {
                sendJson(res, 400, { success: false, message: '密钥名不合法：' + profile.apiKeyRef });
                return;
              }
              await setCredential(ctx, profile.apiKeyRef, apiKey);
              const state = withProvider(
                decorate(await stateFor(profile), profile),
                profile,
              );
              sendJson(res, 200, { success: true, message: '已保存', data: state });
              return;
            }

            if (method === 'DELETE' && route === '/credentials') {
              await unsetCredential(ctx, profile.apiKeyRef);
              const state = withProvider(decorate(await stateFor(profile), profile), profile);
              sendJson(res, 200, { success: true, message: '已清除', data: state });
              return;
            }

            // 兼容模式：保存地址与协议（预设档案不可改）
            if (method === 'POST' && route === '/config') {
              if (profile.preset) {
                sendJson(res, 403, { success: false, message: '预设档案的地址不可修改' });
                return;
              }
              const payload = parseJson(await readBody(req));
              const baseURL = normalizeBaseURL(String(payload?.baseURL ?? ''));
              const api: RelayApi = normalizeApi(payload?.api);
              if (!/^https?:\/\//i.test(baseURL)) {
                sendJson(res, 400, { success: false, message: '请填写完整的 http(s) 地址' });
                return;
              }
              settings.setCompat({ baseURL, api });
              const saved = resolve(profileId);
              const state = withProvider(decorate(await stateFor(saved, true), saved), saved);
              sendJson(res, 200, { success: true, message: '已保存', data: state });
              return;
            }

            if (method === 'DELETE' && route === '/config') {
              if (profile.preset) {
                sendJson(res, 403, { success: false, message: '预设档案不可清除' });
                return;
              }
              const mount = mounts.get(profileId);
              if (mount) {
                await mount.dispose();
                mounts.delete(profileId);
              }
              settings.clearCompat();
              const cleared = resolve(profileId);
              const state = withProvider(
                decorate({ ...readStateEmpty(''), error: '兼容模式还没配置：请填写地址与密钥后保存' } as any, cleared),
                cleared,
              );
              sendJson(res, 200, { success: true, message: '已清除', data: state });
              return;
            }

            if (method === 'POST' && route === '/switch') {
              const payload = parseJson(await readBody(req));
              const group = String(payload?.group ?? '');
              const result = await switchGroup(deps, group);
              const body = result.body as {
                data?: { state?: Record<string, any>; warning?: string };
              };
              if (body?.data?.state) {
                withProvider(decorate(body.data.state, profile), profile);
                if (body.data.state.staleModel) {
                  const kept = body.data.state.selection?.model ?? '当前模型';
                  const stale = '分组已切换，但当前选中的模型 ' + kept + ' 不在新分组里，请重新选择模型';
                  body.data.warning = body.data.warning ? body.data.warning + '；' + stale : stale;
                }
              }
              sendJson(res, result.status, result.body);
              return;
            }

            sendJson(res, 404, { success: false, message: 'unknown route: ' + route });
          } catch (error) {
            sendJson(res, 500, { success: false, message: describeError(error) });
          }
        },
      }),
    'dsh-aimy: relay routes',
  );
}

/** 未打网络时的空状态（保持字段形状一致）。 */
function readStateEmpty(baseURL: string) {
  return {
    baseURL,
    connected: false,
    supportsSwitch: false,
    token: null,
    models: [] as RelayModel[],
    modelsFetchedAt: 0,
    provider: null,
    credential: null,
    selection: null,
    staleModel: false,
  };
}
