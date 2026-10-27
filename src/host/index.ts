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

import { createProviderMount, normalizeBaseURLForApi, sameModels, type ProviderMount } from './provider';
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
import { DEFAULT_REASONING_EFFORT } from '../shared/model-profile';
import { FALLBACK_CONTEXT_WINDOW, FALLBACK_MAX_TOKENS, resolveModels } from './capacity';
import { removeProviderViaSettings, setDefaultReasoningEffort, writeProviderViaSettings } from './registry';
import { CatalogStore } from './state';
import { describeError, readState, switchGroup, type RouteDeps } from './routes';
import type { RelayModel } from '../shared/types';

// 供测试与调试：从适配器模块里挑出可挂载的 cordis 插件
export { pickPlugin } from './provider';
// 容量解析：单测直接断言取值链（站点声明 → 官方目录 → 兜底）与压缩夹取规则
export {
  FALLBACK_CONTEXT_WINDOW,
  FALLBACK_MAX_TOKENS,
  clampMaxTokens,
  officialCapacity,
  resolveCapacity,
  resolveModels,
  sameCapacity,
} from './capacity';

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
  /** 默认为模型声明图片输入（面板有开关，落盘到 profiles.json）*/
  imageInput?: boolean;
  /**
   * 刷新目录后探测模型可达性（默认关闭）。
   * 开一次目录会多打 N 条 max_tokens:1 的请求，适合站点模型不多、且经常
   * 出现「目录里有但调用报 model not found」的情况。
   */
  probeModels?: boolean;
  providerAdapter?: string;
  /** 仅调试用：直接内联密钥（不落盘、不推荐）*/
  apiKey?: string;
  /**
   * 现有 @deepseek-ai/dsh-llm-pi-ai 条目的 id。
   * 有这条时把 provider 写进它的配置（推荐），而不是自己再挂一个 pi-ai 实例。
   */
  settingsNs?: string;
}

const DEFAULT_KEY_REF = 'ONEHUB_API_KEY';
/** DSH profile 里官方 pi-ai 条目的默认 id（cordis.patch.yml 里的 - id: llm-pi-ai）。 */
const DEFAULT_SETTINGS_NS = 'llm-pi-ai';
const DEFAULT_ROUTE = 'onehub';
/**
 * provider 级兜底。注意它只是 pi-ai 的解析 fallback，**不会上报给 DSH**
 * （上报的是逐模型 entry.maxTokens）。真正生效的默认值在 ./capacity.ts，
 * 这里保持一致只是为了让配置文件读起来不矛盾。
 */
const DEFAULT_CONTEXT_WINDOW = FALLBACK_CONTEXT_WINDOW;
const DEFAULT_MAX_TOKENS = FALLBACK_MAX_TOKENS;

/**
 * 插件配置来自 cordis 传给 apply() 的第二个参数。
 * 不能读 ctx.config：cordis 的 context 代理对未 inject 的属性直接抛
 * 「cannot get property config without inject」，会把每条路由都打成 500。
 */
function readConfig(config?: Config): Config {
  return { ...(config ?? {}) };
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

/**
 * 诊断：直接问宿主自己的 llm 注册表与 credentials，回答「模型为什么没出现在选择器里」。
 *
 * 结论对应关系（都实测过）：
 *   - registryPresent=false  → registerAdapter 没生效（挂载失败 / 挂到了别的 fiber）
 *   - registryModels=0       → pi-ai 的 listModels 返回空：绝大多数是解析不到 API Key
 *                             （پی-ai 的 listModels 捕获 MISSING_CREDENTIAL 后直接 return []）
 *   - registryModels>0 但面板没显示 → 是浏览器侧目录缓存没刷新，与本插件无关
 */
async function readDiagnostics(ctx: any, routeName: string, apiKeyRef: string, settingsNs?: string) {
  const report: Record<string, unknown> = { routeName, apiKeyRef, ...(settingsNs ? { settingsNs } : {}) };
  try {
    const llm = typeof ctx?.get === 'function' ? ctx.get('llm', false) : undefined;
    if (!llm) {
      report.llmService = 'unavailable';
      return report;
    }
    report.llmService = 'ok';
    const providers = typeof llm.listProviders === 'function' ? llm.listProviders() : [];
    report.providers = providers.map((p: any) => p.id);
    report.registryPresent = providers.some((p: any) => p.id === routeName);
    if (typeof llm.listModels === 'function' && report.registryPresent) {
      try {
        const models = await llm.listModels(routeName);
        report.registryModels = models.length;
      } catch (error) {
        report.registryModels = 'threw: ' + describeError(error);
      }
    }
  } catch (error) {
    report.llmService = 'threw: ' + describeError(error);
  }
  try {
    const settings = typeof ctx?.get === 'function' ? ctx.get('settings', false) : undefined;
    if (!settings || typeof settings.update !== 'function') {
      report.settingsChannel = 'unavailable';
    } else {
      let found = false;
      try {
        const rows = settings.describe({ redactSecrets: true });
        found = Array.isArray(rows) && rows.some((row: any) => row?.ns === (report.settingsNs ?? 'llm-pi-ai'));
      } catch (error) {
        report.settingsChannel = 'describe threw: ' + describeError(error);
      }
      report.settingsChannel ??= found ? 'ok' : 'entry missing';
      report.settingsNs ??= 'llm-pi-ai';
    }
  } catch (error) {
    report.settingsChannel = 'threw: ' + describeError(error);
  }
  try {
    const credentials = typeof ctx?.get === 'function' ? ctx.get('credentials', false) : undefined;
    if (!credentials || typeof credentials.resolve !== 'function') {
      report.credentialResolve = 'unavailable';
    } else {
      const hit = await credentials.resolve(apiKeyRef);
      report.credentialResolve = hit && hit.value ? 'resolved(' + (hit.source ?? '?') + ')' : 'missing';
    }
  } catch (error) {
    report.credentialResolve = 'threw: ' + describeError(error);
  }
  return report;
}

/**
 * 回读 llm 注册表：某条路由是否真的注册上、模型是否非空。
 * `present === null` 表示无法自检（没有 llm 服务），不等同失败。
 */
async function verifyRoute(ctx: any, routeName: string): Promise<{ present: boolean | null; listedModels: number | null; detail?: string }> {
  try {
    const llm = typeof ctx?.get === 'function' ? ctx.get('llm', false) : undefined;
    if (!llm || typeof llm.listProviders !== 'function') {
      return { present: null, listedModels: null, detail: 'llm 服务不可用（无法自检）' };
    }
    const present = llm.listProviders().some((p: any) => p?.id === routeName);
    if (!present) {
      return { present: false, listedModels: null, detail: 'ctx.plugin 未把路由注册进 llm（fiber 可能停在 pending）' };
    }
    let listedModels: number | null = null;
    if (typeof llm.listModels === 'function') {
      try {
        const listed = await llm.listModels(routeName);
        listedModels = Array.isArray(listed) ? listed.length : 0;
      } catch (error) {
        return { present: true, listedModels: null, detail: 'listModels 抛错：' + describeError(error) };
      }
    }
    return listedModels === 0
      ? { present: true, listedModels, detail: '路由已注册但模型为空（通常是 apiKeyEnv 解析不到凭据）' }
      : { present: true, listedModels };
  } catch (error) {
    return { present: null, listedModels: null, detail: '自检抛错：' + describeError(error) };
  }
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
  /** 通过 settings 写进宿主 pi-ai 的路由（本插件不持有 fiber）。 */
  const settingsRoutes = new Map<ProfileId, { routeName: string; modelCount: number }>();

  /**
   * settings 路由没有 fiber 句柄，但 routes 只需要 routeName / mounted / modelCount。
   * 让 state.provider 与 staleModel 判断在两条路径下行为一致。
   */
  const settingsMountShim = (profileId: ProfileId): ProviderMount | undefined => {
    const entry = settingsRoutes.get(profileId);
    if (!entry) return undefined;
    return {
      routeName: entry.routeName,
      mounted: true,
      modelCount: entry.modelCount,
      managedBy: 'settings',
      verify: async () => ({ present: null, listedModels: null }),
      update: async () => {},
      dispose: async () => {},
    };
  };
  const mountErrors = new Map<ProfileId, string>();

  const resolve = (id: ProfileId): ProfileConfig => {
    const cfg = readConfig(config);
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
        imageInput: cfg.imageInput,
      },
    });
  };

  /**
   * 强制丢弃该档案当前的路由，让下一次 syncProvider 重新挂。
   * 协议改变时必须走这条：同一个模型集合在 completions / responses 下是两套线路，
   * syncProvider 的 sameModels() 短路会误判成「没变化」。
   */
  const forceRemount = async (profile: ProfileConfig): Promise<void> => {
    const mount = mounts.get(profile.id);
    if (mount) {
      await mount.dispose();
      mounts.delete(profile.id);
    }
    settingsRoutes.delete(profile.id);
    mountErrors.delete(profile.id);
  };

  /** 目录变化 → 首次挂载 / 重挂载该档案的模型路由。失败只记录。 */
  /** 每个档案最近一次成功同步的模型集合，供 remountProvider 判断是否真的需要重挂。 */
  const lastSyncedModels = new Map<string, RelayModel[]>();

  const syncProvider = async (profile: ProfileConfig, incoming: RelayModel[]): Promise<{ ok: boolean; error?: string }> => {
    // 幂等：已定稿的目录原样通过，未定稿的在这里补算容量。
    const models = resolveModels(incoming);
    lastSyncedModels.set(profile.id, models);
    if (!profile.baseURL) {
      return { ok: false, error: '该档案还没配置地址' };
    }
    if (models.length === 0) {
      return { ok: false, error: '当前分组没有可用模型，未挂载模型路由' };
    }
    const cfg = readConfig(config);

    // 首选：写进现有 pi-ai 条目的配置（避免重复注册内置 provider 目录）
    const viaSettings = await writeProviderViaSettings(ctx, {
      settingsNs: cfg.settingsNs ?? DEFAULT_SETTINGS_NS,
      routeName: profile.routeName,
      displayName: profile.displayName,
      // 与 buildProfile 同一套归整：openai 补 /v1，anthropic 去掉 /v1
      baseURL: normalizeBaseURLForApi(profile.baseURL, profile.api),
      apiKeyRef: profile.apiKeyRef,
      api: profile.api,
      models,
      defaultContextWindow: profile.defaultContextWindow,
      defaultMaxTokens: profile.defaultMaxTokens,
      imageInput: profile.imageInput,
    });
    if (viaSettings && viaSettings.kind === 'settings') {
      // 交给宿主那个 pi-ai 实例自己注册路由；本插件不再持有 fiber
      const check = await verifyRoute(ctx, profile.routeName);
      settingsRoutes.set(profile.id, { routeName: profile.routeName, modelCount: models.length });
      // 档位可选 ≠ 档位已选。模型声明 reasoningEfforts 只是提供选项，
      // 实际下发什么由 agent-default-model 决定，默认设 High。
      await setDefaultReasoningEffort(ctx, {
        settingsNs: cfg.settingsNs ?? DEFAULT_SETTINGS_NS,
        routeName: profile.routeName,
      });
      if (check.present === false) {
        const message = '已写入 ' + viaSettings.ns + ' 的 providers，但模型路由仍未出现在 llm 中';
        mountErrors.set(profile.id, message);
        return { ok: false, error: message };
      }
      mountErrors.delete(profile.id);
      return { ok: true };
    }

    try {
      const existing = mounts.get(profile.id);
      // 协议变了：旧 fiber 挂的是旧线路，必须重建（sameModels 只看模型，会漏掉这个）
      if (existing && (existing as any).api !== undefined && (existing as any).api !== profile.api) {
        await existing.dispose();
        mounts.delete(profile.id);
      }
      const current = mounts.get(profile.id);
      if (!current) {
        const created = await createProviderMount(ctx, {
          routeName: profile.routeName,
          displayName: profile.displayName,
          baseURL: profile.baseURL,
          apiKeyRef: profile.apiKeyRef,
          api: profile.api,
          models,
          defaultContextWindow: profile.defaultContextWindow,
          defaultMaxTokens: profile.defaultMaxTokens,
          imageInput: profile.imageInput,
          adapterModule: cfg.providerAdapter,
        });
        mounts.set(profile.id, created);
      } else {
        await current.update(models);
      }

      // 挂载后回读注册表：fiber 存在 ≠ 模型可见
      const mounted = mounts.get(profile.id)!;
      const check = await mounted.verify();
      if (check.present === false) {
        const message = '模型路由没有注册进 llm：' + (check.detail ?? '未知原因');
        mountErrors.set(profile.id, message);
        return { ok: false, error: message };
      }
      if (check.present === true && check.listedModels === 0) {
        const message = '路由已注册但模型为空：' + (check.detail ?? '未知原因');
        mountErrors.set(profile.id, message);
        return { ok: false, error: message };
      }

      mountErrors.delete(profile.id);
      return { ok: true };
    } catch (error) {
      const message = describeError(error);
      mountErrors.set(profile.id, message);
      return { ok: false, error: message };
    }
  };

  /**
   * 切组后的强制重挂：不复用 sameModels 短路。
   *
   * 为什么需要单独一条：切组只改站点的计费分组，模型集合可能整体换掉
   * （例如 DeepSeek 分组 ↔ GPT 分组），但插件挂的目录还是旧的，
   * 选择器里就会留着新分组里不存在的模型，调用必然失败。
   * 这里先卸掉已有挂载再按新目录重建，确保目录与分组一致。
   */
  const remountProvider = async (
    profile: ProfileConfig,
    models: RelayModel[],
  ): Promise<{ ok: boolean; error?: string }> => {
    // 模型集合没变就不动：无谓重挂会打断正在进行的对话。
    // 切到同一分组时走这条路，保持原有「短路」语义。
    const previous = lastSyncedModels.get(profile.id);
    if (previous && sameModels(previous, models)) {
      return syncProvider(profile, models);
    }
    // 集合变了：先删 settings 里的旧 provider，避免旧模型残留在目录里
    await removeProviderViaSettings(ctx, {
      settingsNs: readConfig(config).settingsNs ?? DEFAULT_SETTINGS_NS,
      routeName: profile.routeName,
    });
    const existing = mounts.get(profile.id);
    if (existing) {
      try { await existing.dispose(); } catch {}
      mounts.delete(profile.id);
    }
    return syncProvider(profile, models);
  };

  const buildDeps = async (profile: ProfileConfig): Promise<RouteDeps> => {
    const cfg = readConfig(config);
    const inline = profile.preset ? cfg.apiKey : undefined;
    return {
      baseURL: profile.baseURL,
      routeName: profile.routeName,
      group: '',
      apiKey: await resolveApiKey(ctx, profile.apiKeyRef, inline),
      api: profile.api,
      store: catalogs,
      provider: mounts.get(profile.id) ?? settingsMountShim(profile.id),
      syncProvider: (models) => syncProvider(profile, models),
      remountProvider: (models) => remountProvider(profile, models),
      probeModels: cfg.probeModels === true,
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

  /** 给状态补上档案身份；预设档案的地址只读展示（不再隐藏）。 */
  const decorate = <T extends Record<string, any>>(state: T, profile: ProfileConfig): T => {
    state.profile = profile.id;
    state.displayName = profile.displayName;
    state.preset = profile.preset;
    state.api = profile.api;
    state.imageInput = profile.imageInput;
    state.configured = Boolean(profile.baseURL);
    return state;
  };

  /** 用最新挂载句柄回填状态（deps 里的 provider 是构建时快照）。 */
  const withProvider = <T extends Record<string, any>>(state: T, profile: ProfileConfig): T => {
    const viaSettings = settingsRoutes.get(profile.id);
    if (viaSettings) {
      state.provider = {
        routeName: viaSettings.routeName,
        mounted: true,
        modelCount: viaSettings.modelCount,
        managedBy: 'settings',
        ...(mountErrors.has(profile.id) ? { error: mountErrors.get(profile.id) } : {}),
      };
      return state;
    }
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

  /**
   * 启动预热：用磁盘缓存里的模型目录先把路由挂上。
   *
   * 不预热的话，模型只有在用户点开「中转站」面板、/state 跑过一次之后才挂载，
   * DSH 的模型选择器在此之前就是一个空列表。缓存里没有目录（首次安装）时才留空，
   * 等面板首次刷新拿到目录后再挂。
   */
  const warmStart = async (): Promise<void> => {
    for (const id of ['aimy', 'compat'] as ProfileId[]) {
      try {
        const profile = resolve(id);
        if (!profile.baseURL) continue;
        const cached = catalogs.latest(profile.baseURL);
        if (!cached || cached.models.length === 0) continue;
        // 老缓存没有容量字段，安全起见再解析一次（幂等，已定稿的原样返回）。
        await syncProvider(profile, resolveModels(cached.models));
      } catch {
        // 预热失败不影响插件其余部分，面板里会显示原因
      }
    }
  };
  void warmStart();

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
              (state as any).diagnostics = await readDiagnostics(ctx, profile.routeName, profile.apiKeyRef, readConfig(config).settingsNs ?? DEFAULT_SETTINGS_NS);
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

            // 保存地址 / 协议 / 图片输入开关。
            //   预设档案：只能改协议与图片开关（地址固化在配置里，界面只读展示）
            //   兼容模式：地址与协议都可改；只传 api 时保留原地址
            if (method === 'POST' && route === '/config') {
              const payload = parseJson(await readBody(req));
              const hasBaseURL = typeof payload?.baseURL === 'string' && payload.baseURL.trim().length > 0;
              const hasApi = payload?.api !== undefined;
              const hasImageInput = typeof payload?.imageInput === 'boolean';

              if (!hasBaseURL && !hasApi && !hasImageInput) {
                sendJson(res, 400, { success: false, message: '没有可保存的字段' });
                return;
              }

              if (profile.preset) {
                if (hasBaseURL) {
                  sendJson(res, 403, { success: false, message: '预设档案的地址不可修改' });
                  return;
                }
                settings.setAimy({
                  ...(hasApi ? { api: normalizeApi(payload?.api) } : {}),
                  ...(hasImageInput ? { imageInput: payload.imageInput as boolean } : {}),
                });
              } else if (hasBaseURL) {
                const baseURL = normalizeBaseURL(String(payload?.baseURL ?? ''));
                if (!/^https?:\/\//i.test(baseURL)) {
                  sendJson(res, 400, { success: false, message: '请填写完整的 http(s) 地址' });
                  return;
                }
                settings.setCompat({
                  baseURL,
                  api: normalizeApi(payload?.api ?? profile.api),
                  ...(hasImageInput ? { imageInput: payload.imageInput as boolean } : {}),
                });
              } else {
                // 只改协议 / 开关：地址必须已经存在，否则这条档案本来就没法联网
                if (!profile.baseURL) {
                  sendJson(res, 400, { success: false, message: '请先填写地址' });
                  return;
                }
                settings.setCompat({
                  api: normalizeApi(payload?.api ?? profile.api),
                  ...(hasImageInput ? { imageInput: payload.imageInput as boolean } : {}),
                });
              }

              // 协议变了要重新挂载，这里用 refresh 强制重建
              const saved = resolve(profileId);
              await forceRemount(saved);
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
              // 写进 pi-ai 配置的那条也要摘掉，否则模型会残留在选择器里
              const cfgNow = readConfig(config);
              await removeProviderViaSettings(ctx, {
                settingsNs: cfgNow.settingsNs ?? DEFAULT_SETTINGS_NS,
                routeName: 'onehub-compat',
              });
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
              // 切组会把站点的模型集合整体换掉，必须先强制重挂、让目录与新分组对齐。
              const switched = await switchGroup(deps, group);
              const body = switched.body as {
                data?: { state?: Record<string, any>; warning?: string };
              };
              const warnings: string[] = [];
              if (body?.data?.warning) warnings.push(body.data.warning);

              if (body?.data?.state) {
                const state = body.data.state as Record<string, any>;
                // 先回填最新挂载句柄：state.provider 是 switchGroup 构建时的快照，
                // 此时可能还是 null，用它判断「是否挂载成功」会得到假值。
                withProvider(decorate(state, profile), profile);
                const mountedNow = Boolean(state.provider && state.provider.mounted !== false);

                // 当前选中的模型不在新分组目录里 —— 这正是「切组后无法对话」的原因：
                // 模型名对不上，请求必然被站点拒绝。用户主动切组时改选是预期行为，
                // 但必须明确告知改选结果。
                const selModel = state.selection?.model;
                const staleNow = mountedNow
                  && typeof selModel === 'string'
                  && Array.isArray(state.models)
                  && state.models.length > 0
                  && !state.models.some((m: any) => m.id === selModel);
                state.staleModel = staleNow;

                if (staleNow) {
                  const next = state.models[0].id as string;
                  let switchedModel = false;
                  try {
                    const agentDefault = typeof ctx.get === 'function'
                      ? (ctx.get('agentDefaultModel', false) as any)
                      : undefined;
                    if (agentDefault && typeof agentDefault.saveSelection === 'function') {
                      await agentDefault.saveSelection({
                        provider: profile.routeName,
                        model: next,
                        reasoningEffort: DEFAULT_REASONING_EFFORT,
                      });
                      state.selection = { provider: profile.routeName, model: next };
                      state.staleModel = false;
                      switchedModel = true;
                    }
                  } catch {
                    switchedModel = false;
                  }
                  warnings.push(
                    switchedModel
                      ? '「' + selModel + '」不在新分组里，已切换到「' + next + '」'
                      : '分组已切换，但「' + selModel + '」不在新分组里，请重新选择模型',
                  );
                }
              }
              if (warnings.length > 0) {
                (body.data as any).warning = warnings.join('；');
              }
              sendJson(res, switched.status, switched.body);
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
