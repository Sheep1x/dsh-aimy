// src/shared/types.ts
var DEFAULT_API = "openai-responses";
function emptyState(baseURL, overrides = {}) {
  return {
    profile: "aimy",
    displayName: "",
    preset: false,
    api: DEFAULT_API,
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
    staleModel: false
  };
}

// src/host/provider.ts
var DEFAULT_ADAPTER = "@deepseek-ai/dsh-llm-pi-ai";
function pickPlugin(adapter, specifier = DEFAULT_ADAPTER) {
  if (adapter === void 0 || adapter === null) {
    throw new Error("适配器模块为空：" + specifier);
  }
  if (typeof adapter.apply === "function") return adapter;
  if (typeof adapter === "function" && !adapter.prototype) return adapter;
  const fallback = adapter.default;
  if (fallback && typeof fallback.apply === "function") return fallback;
  if (typeof fallback === "function" && !fallback.prototype) return fallback;
  throw new Error(
    "适配器模块没有导出可挂载的 cordis 插件（需要 name/inject/apply）：" + specifier + "，实际导出：" + Object.keys(adapter).join(", ")
  );
}
function normalizeBaseURLForApi(baseURL, api = DEFAULT_API) {
  let trimmed = baseURL.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (api === "anthropic-messages") {
    trimmed = trimmed.replace(/\/v1\/messages$/i, "").replace(/\/messages$/i, "");
    return trimmed.replace(/\/v1$/i, "");
  }
  trimmed = trimmed.replace(/\/v1\/chat\/completions$/i, "").replace(/\/v1\/responses$/i, "").replace(/\/chat\/completions$/i, "").replace(/\/responses$/i, "").replace(/\/completions$/i, "");
  return /\/v1$/i.test(trimmed) ? trimmed : trimmed + "/v1";
}
function buildProfile(opts2) {
  return {
    displayName: opts2.displayName,
    api: opts2.api ?? DEFAULT_API,
    baseURL: normalizeBaseURLForApi(opts2.baseURL, opts2.api ?? DEFAULT_API),
    apiKeyEnv: opts2.apiKeyRef,
    defaultContextWindow: opts2.defaultContextWindow,
    defaultMaxTokens: opts2.defaultMaxTokens,
    // 模型能力不猜：只声明 id，其余交给路由级默认值兜底
    models: opts2.models.map((m) => ({ id: m.id }))
  };
}
function sameModels(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}
async function createProviderMount(ctx, opts2, loadAdapter = (s) => import(s)) {
  const specifier = opts2.adapterModule ?? DEFAULT_ADAPTER;
  const adapter = await loadAdapter(specifier);
  const plugin = pickPlugin(adapter, specifier);
  let fiber;
  let models = opts2.models;
  let verification = null;
  const mountWith = (next) => {
    const config = { providers: { [opts2.routeName]: buildProfile({ ...opts2, models: next }) } };
    fiber = ctx.plugin(plugin, config);
    models = next;
    verification = null;
  };
  const verify = async () => {
    if (verification) return verification;
    try {
      const llm = typeof ctx?.get === "function" ? ctx.get("llm", false) : void 0;
      if (!llm || typeof llm.listProviders !== "function") {
        verification = { present: null, listedModels: null, detail: "llm 服务不可用（无法自检）" };
        return verification;
      }
      const fiberState = fiber && typeof fiber.state === "number" ? fiber.state : void 0;
      if (fiberState !== void 0 && fiberState !== 2) {
        verification = {
          present: false,
          listedModels: null,
          detail: "pi-ai 子插件未激活（fiber.state=" + fiberState + "）。常见原因：profile 里已有 @deepseek-ai/dsh-llm-pi-ai 条目，同一个 pi-ai 不能挂两次（内置 provider 目录会重复注册而整体失败）"
        };
        return verification;
      }
      const present = llm.listProviders().some((p) => p?.id === opts2.routeName);
      let listedModels = null;
      if (present && typeof llm.listModels === "function") {
        try {
          const listed = await llm.listModels(opts2.routeName);
          listedModels = Array.isArray(listed) ? listed.length : 0;
        } catch (error) {
          verification = { present, listedModels: null, detail: "listModels 抛错：" + (error instanceof Error ? error.message : String(error)) };
          return verification;
        }
      }
      verification = {
        present,
        listedModels,
        ...present && listedModels === 0 ? { detail: "路由已注册但模型为空（通常是 apiKeyEnv 解析不到凭据）" } : {},
        ...!present ? { detail: "ctx.plugin 未把路由注册进 llm（fiber 可能停在 pending）" } : {}
      };
      return verification;
    } catch (error) {
      verification = { present: false, listedModels: null, detail: "自检抛错：" + (error instanceof Error ? error.message : String(error)) };
      return verification;
    }
  };
  mountWith(opts2.models);
  return {
    managedBy: "fiber",
    get mounted() {
      return Boolean(fiber);
    },
    get modelCount() {
      return models.length;
    },
    routeName: opts2.routeName,
    verify,
    async update(next) {
      if (sameModels(models, next)) return;
      if (fiber && typeof fiber.dispose === "function") {
        await fiber.dispose();
        fiber = void 0;
      }
      mountWith(next);
    },
    async dispose() {
      if (fiber && typeof fiber.dispose === "function") {
        await fiber.dispose();
      }
      fiber = void 0;
      models = [];
    }
  };
}

// src/host/profiles.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";

// src/host/state.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  return join(homedir(), ".dsh");
}
var CatalogStore = class {
  constructor(filePath = join(resolveDshHome(), "dsh-aimy", "state.json")) {
    this.filePath = filePath;
  }
  data = { version: 1, catalogs: [] };
  load() {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.catalogs)) {
        this.data = { version: 1, catalogs: parsed.catalogs.filter(isCatalog) };
      }
    } catch {
      this.data = { version: 1, catalogs: [] };
    }
  }
  get(baseURL, group) {
    return this.data.catalogs.find((c) => c.baseURL === baseURL && c.group === group);
  }
  /**
   * 该站点最近一次的目录（不区分分组）。
   *
   * 冷启动时还不知道当前分组（分组要打网络才知道），但模型路由需要在启动时就挂上，
   * 否则模型选择器在整个「用户点开面板之前」都是空的。用最近的目录做预热即可，
   * 面板刷新后会用真实分组目录重挂。
   */
  latest(baseURL) {
    let newest;
    for (const catalog of this.data.catalogs) {
      if (catalog.baseURL !== baseURL) continue;
      if (!newest || catalog.fetchedAt > newest.fetchedAt) newest = catalog;
    }
    return newest;
  }
  set(catalog) {
    this.data.catalogs = this.data.catalogs.filter(
      (c) => !(c.baseURL === catalog.baseURL && c.group === catalog.group)
    );
    this.data.catalogs.push(catalog);
    this.flush();
  }
  flush() {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
    } catch {
    }
  }
};
function isCatalog(value) {
  if (!value || typeof value !== "object") return false;
  const c = value;
  return typeof c.baseURL === "string" && typeof c.group === "string" && Array.isArray(c.models);
}

// src/host/profiles.ts
var AIMY_DEFAULT_BASE_URL = "https://aimy.sheep1x.top";
var AIMY_DEFAULT_DISPLAY_NAME = "Aimy-艾米";
var COMPAT_DISPLAY_NAME = "兼容模式";
var COMPAT_KEY_REF = "ONEHUB_COMPAT_API_KEY";
function profilesPath() {
  return join2(resolveDshHome(), "dsh-aimy", "profiles.json");
}
var ProfileSettingsStore = class {
  constructor(filePath = profilesPath()) {
    this.filePath = filePath;
  }
  data = { version: 1 };
  load() {
    try {
      const parsed = JSON.parse(readFileSync2(this.filePath, "utf8"));
      if (parsed && parsed.version === 1 && parsed.compat && typeof parsed.compat.baseURL === "string") {
        this.data = {
          version: 1,
          compat: { baseURL: parsed.compat.baseURL, api: normalizeApi(parsed.compat.api) }
        };
      }
    } catch {
      this.data = { version: 1 };
    }
  }
  compat() {
    return this.data.compat;
  }
  setCompat(settings) {
    this.data = { version: 1, compat: { baseURL: settings.baseURL, api: normalizeApi(settings.api) } };
    this.persist();
  }
  clearCompat() {
    this.data = { version: 1 };
    this.persist();
  }
  persist() {
    try {
      mkdirSync2(dirname2(this.filePath), { recursive: true });
      writeFileSync2(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
    } catch {
    }
  }
};
function normalizeApi(value) {
  if (value === "openai-responses" || value === "openai-completions" || value === "anthropic-messages") {
    return value;
  }
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "responses" || v === "openai-response" || v === "openai_responses") return "openai-responses";
    if (v === "completions" || v === "chat-completions" || v === "openai" || v === "openai-chat") return "openai-completions";
    if (v === "anthropic" || v === "messages" || v === "claude") return "anthropic-messages";
  }
  return DEFAULT_API;
}
function isProfileId(value) {
  return value === "aimy" || value === "compat";
}
function normalizeBaseURL(value) {
  return value.trim().replace(/\/+$/, "");
}
function resolveProfile(input) {
  const { id, settings, defaults } = input;
  if (id === "aimy") {
    return {
      id,
      displayName: defaults.displayName,
      baseURL: normalizeBaseURL(defaults.baseURL),
      apiKeyRef: defaults.apiKeyRef,
      routeName: defaults.routeName,
      api: defaults.api,
      preset: true,
      defaultContextWindow: defaults.defaultContextWindow,
      defaultMaxTokens: defaults.defaultMaxTokens
    };
  }
  const compat = settings.compat();
  return {
    id,
    displayName: COMPAT_DISPLAY_NAME,
    baseURL: compat ? normalizeBaseURL(compat.baseURL) : "",
    apiKeyRef: COMPAT_KEY_REF,
    routeName: "onehub-compat",
    api: compat ? normalizeApi(compat.api) : DEFAULT_API,
    preset: false,
    defaultContextWindow: defaults.defaultContextWindow,
    defaultMaxTokens: defaults.defaultMaxTokens
  };
}

// src/host/registry.ts
function settingsWriter(ctx) {
  const settings = typeof ctx?.get === "function" ? ctx.get("settings", false) : void 0;
  if (!settings) return void 0;
  if (typeof settings.update !== "function") return void 0;
  return settings;
}
function describeNamespace(settings, ns) {
  try {
    const rows = settings.describe({ redactSecrets: true });
    if (!Array.isArray(rows)) return void 0;
    return rows.find((row) => row?.ns === ns);
  } catch {
    return void 0;
  }
}
async function writeProviderViaSettings(ctx, target) {
  const settings = settingsWriter(ctx);
  if (!settings) return void 0;
  if (!describeNamespace(settings, target.settingsNs)) return void 0;
  const provider = {
    displayName: target.displayName,
    api: target.api,
    baseURL: target.baseURL,
    apiKeyEnv: target.apiKeyRef,
    defaultContextWindow: target.defaultContextWindow,
    defaultMaxTokens: target.defaultMaxTokens,
    models: target.models.map((m) => ({ id: m.id }))
  };
  try {
    await settings.update(target.settingsNs, {
      providers: { [target.routeName]: provider }
    });
    return { kind: "settings", ns: target.settingsNs };
  } catch (error) {
    return void 0;
  }
}
async function removeProviderViaSettings(ctx, target) {
  const settings = settingsWriter(ctx);
  if (!settings) return false;
  if (typeof settings.mutate !== "function") return false;
  if (!describeNamespace(settings, target.settingsNs)) return false;
  try {
    await settings.mutate(target.settingsNs, [
      { op: "unset", path: ["providers", target.routeName] }
    ]);
    return true;
  } catch {
    return false;
  }
}

// src/host/relay.ts
var RelayError = class extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.name = "RelayError";
  }
};
function apiRoot(baseURL) {
  let trimmed = baseURL.trim().replace(/\/+$/, "");
  trimmed = trimmed.replace(/\/v1\/chat\/completions$/i, "").replace(/\/v1\/responses$/i, "").replace(/\/chat\/completions$/i, "").replace(/\/responses$/i, "").replace(/\/v1\/messages$/i, "").replace(/\/messages$/i, "").replace(/\/completions$/i, "");
  return trimmed.replace(/\/v1$/i, "").replace(/\/+$/, "");
}
function normalizeBase(baseURL) {
  return apiRoot(baseURL);
}
function kindOf(status) {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status >= 400 && status < 500) return "bad-request";
  return "unknown";
}
async function request(opts2, pathname, init = {}) {
  const doFetch = opts2.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts2.timeoutMs ?? 15e3);
  try {
    const res = await doFetch(normalizeBase(opts2.baseURL) + pathname, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + opts2.apiKey,
        "Content-Type": "application/json",
        ...init.headers ?? {}
      }
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const message = extractMessage(body) ?? "HTTP " + res.status;
      throw new RelayError(message, res.status, kindOf(res.status));
    }
    return body;
  } catch (error) {
    if (error instanceof RelayError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new RelayError("无法连接中转站：" + message, 0, "network");
  } finally {
    clearTimeout(timer);
  }
}
function extractMessage(body) {
  if (body && typeof body === "object") {
    const record = body;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error === "string" && record.error) return record.error;
    const err = record.error;
    if (err && typeof err === "object" && typeof err.message === "string") {
      return err.message;
    }
  }
  return void 0;
}
async function fetchTokenGroup(opts2) {
  const body = await request(opts2, "/v1/token/group");
  const data = body.data ?? {};
  return {
    group: String(data.group ?? ""),
    backupGroup: String(data.backup_group ?? ""),
    ratio: Number(data.ratio ?? 1),
    allowGroupSwitch: Boolean(data.allow_group_switch),
    groups: Array.isArray(data.groups) ? data.groups.map((g) => ({
      symbol: String(g.symbol ?? ""),
      name: String(g.name ?? g.symbol ?? ""),
      ratio: Number(g.ratio ?? 1),
      public: Boolean(g.public)
    })) : []
  };
}
async function switchTokenGroup(opts2, group) {
  const body = await request(opts2, "/v1/token/group", {
    method: "PUT",
    body: JSON.stringify({ group })
  });
  const data = body.data ?? {};
  return {
    group: String(data.group ?? group),
    backupGroup: String(data.backup_group ?? ""),
    ratio: Number(data.ratio ?? 1),
    allowGroupSwitch: Boolean(data.allow_group_switch),
    groups: Array.isArray(data.groups) ? data.groups.map((g) => ({
      symbol: String(g.symbol ?? ""),
      name: String(g.name ?? g.symbol ?? ""),
      ratio: Number(g.ratio ?? 1),
      public: Boolean(g.public)
    })) : []
  };
}
async function fetchModels(opts2) {
  const body = await request(opts2, "/v1/models");
  const list = Array.isArray(body.data) ? body.data : [];
  const seen = /* @__PURE__ */ new Set();
  const models = [];
  for (const item of list) {
    const id = typeof item === "string" ? item : String(item?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, name: id });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

// src/host/routes.ts
function opts(deps) {
  return { baseURL: deps.baseURL, apiKey: deps.apiKey, fetchImpl: deps.fetchImpl };
}
function applySelection(state, deps) {
  state.selection = deps.selection ?? null;
  const routeName = deps.provider?.routeName;
  if (!deps.selection || !routeName) {
    state.staleModel = false;
    return;
  }
  if (deps.selection.provider !== routeName) {
    state.staleModel = false;
    return;
  }
  if (state.models.length === 0) {
    state.staleModel = false;
    return;
  }
  state.staleModel = !state.models.some((m) => m.id === deps.selection?.model);
}
function providerState(deps, error, fallbackRoute) {
  if (!deps.provider) {
    if (!error) return null;
    return { routeName: fallbackRoute ?? "", mounted: false, modelCount: 0, error };
  }
  return {
    routeName: deps.provider.routeName,
    mounted: deps.provider.mounted,
    modelCount: deps.provider.modelCount,
    error
  };
}
async function readState(deps, refresh = false) {
  const state = emptyState(deps.baseURL);
  state.credential = deps.credential ?? null;
  applySelection(state, deps);
  if (!deps.apiKey) {
    state.error = "未配置 API Key：请在下方填写并保存";
    state.provider = providerState(deps);
    return state;
  }
  try {
    state.token = await fetchTokenGroup(opts(deps));
    state.supportsSwitch = true;
  } catch (error) {
    const missingApi = error instanceof RelayError && error.kind === "not-found";
    if (!missingApi) {
      return applyError(state, error);
    }
    state.supportsSwitch = false;
  }
  const groupKey = state.token?.group ?? "";
  const cached = deps.store.get(deps.baseURL, groupKey);
  if (!refresh && cached) {
    state.models = cached.models;
    state.modelsFetchedAt = cached.fetchedAt;
    state.connected = true;
    const synced = await deps.syncProvider?.(cached.models);
    state.provider = providerState(deps, synced && !synced.ok ? synced.error : void 0, deps.routeName);
    applySelection(state, deps);
    return state;
  }
  try {
    const models = await fetchModels(opts(deps));
    const fetchedAt = Date.now();
    deps.store.set({ baseURL: deps.baseURL, group: groupKey, models, fetchedAt });
    state.models = models;
    state.modelsFetchedAt = fetchedAt;
    state.connected = true;
    const synced = await deps.syncProvider?.(models);
    state.provider = providerState(deps, synced && !synced.ok ? synced.error : void 0, deps.routeName);
    applySelection(state, deps);
    return state;
  } catch (error) {
    state.connected = false;
    state.provider = providerState(deps);
    return applyError(state, error);
  }
}
async function switchGroup(deps, group) {
  if (!deps.apiKey) {
    return { status: 400, body: { success: false, message: "缺少 API Key" } };
  }
  if (!group) {
    return { status: 400, body: { success: false, message: "分组不能为空" } };
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
  let warning;
  try {
    const models = await fetchModels(opts(deps));
    const fetchedAt = Date.now();
    deps.store.set({ baseURL: deps.baseURL, group: token.group, models, fetchedAt });
    state.models = models;
    state.modelsFetchedAt = fetchedAt;
    const synced = await deps.syncProvider?.(models);
    if (synced && !synced.ok) {
      warning = "分组已切换，但模型路由更新失败：" + (synced.error ?? "未知错误");
    }
  } catch (error) {
    warning = "分组已切换，但模型列表刷新失败：" + describeError(error);
    const cached = deps.store.get(deps.baseURL, token.group);
    if (cached) {
      state.models = cached.models;
      state.modelsFetchedAt = cached.fetchedAt;
    }
  }
  state.provider = providerState(deps, warning);
  applySelection(state, deps);
  const result = { state, warning };
  return { status: 200, body: { success: true, message: "", data: result } };
}
function applyError(state, error) {
  state.connected = false;
  state.error = describeError(error);
  return state;
}
function mapStatus(error) {
  if (error.kind === "network") return 502;
  if (error.status >= 400 && error.status < 600) return error.status;
  return 500;
}
function describeError(error) {
  if (error instanceof RelayError) {
    switch (error.kind) {
      case "auth":
        return "API Key 无效或已过期";
      case "forbidden":
        return error.message || "该操作被中转站拒绝（请检查令牌是否开启「允许客户端切换分组」）";
      case "not-found":
        return "中转站版本过低，缺少 /v1/token/group 接口";
      case "network":
        return error.message;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

// src/host/index.ts
var ROUTE_PREFIX = "/dsh-aimy-relay";
var name = "dsh-aimy";
var inject = ["webServer"];
var DEFAULT_KEY_REF = "ONEHUB_API_KEY";
var DEFAULT_SETTINGS_NS = "llm-pi-ai";
var DEFAULT_ROUTE = "onehub";
var DEFAULT_CONTEXT_WINDOW = 131072;
var DEFAULT_MAX_TOKENS = 8192;
function readConfig(config) {
  return { ...config ?? {} };
}
function getCredentials(ctx) {
  return typeof ctx?.get === "function" ? ctx.get("credentials", false) : void 0;
}
function isValidCredentialRef(ref) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref);
}
function pickCredentialValue(resolved) {
  if (resolved && typeof resolved === "object" && typeof resolved.value === "string") {
    return String(resolved.value).trim();
  }
  if (typeof resolved === "string") return resolved;
  if (resolved && typeof resolved === "object") {
    const record = resolved;
    for (const key of ["key", "apiKey", "secret"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate) return candidate;
    }
  }
  return "";
}
async function resolveApiKey(ctx, ref, inline) {
  if (inline && inline.trim()) return inline.trim();
  if (!ref) return "";
  try {
    const credentials = getCredentials(ctx);
    if (credentials && typeof credentials.resolve === "function") {
      const value = pickCredentialValue(await credentials.resolve(ref));
      if (value) return value;
    }
  } catch {
  }
  const fromEnv = process.env[ref];
  return typeof fromEnv === "string" ? fromEnv.trim() : "";
}
async function describeCredential(ctx, ref) {
  try {
    const credentials = getCredentials(ctx);
    if (!credentials || typeof credentials.describe !== "function") return null;
    const info = await credentials.describe(ref);
    return {
      configured: Boolean(info?.configured),
      source: typeof info?.source === "string" ? info.source : void 0,
      writable: Boolean(info?.writable)
    };
  } catch {
    return null;
  }
}
async function setCredential(ctx, ref, value) {
  const credentials = getCredentials(ctx);
  if (!credentials || typeof credentials.set !== "function") {
    throw new Error("凭据服务不可用：无法保存密钥，请改用环境变量 " + ref);
  }
  await credentials.set(ref, value);
}
async function unsetCredential(ctx, ref) {
  const credentials = getCredentials(ctx);
  if (!credentials || typeof credentials.unset !== "function") {
    throw new Error("凭据服务不可用：无法清除密钥");
  }
  await credentials.unset(ref);
}
async function readDiagnostics(ctx, routeName, apiKeyRef, settingsNs) {
  const report = { routeName, apiKeyRef, ...settingsNs ? { settingsNs } : {} };
  try {
    const llm = typeof ctx?.get === "function" ? ctx.get("llm", false) : void 0;
    if (!llm) {
      report.llmService = "unavailable";
      return report;
    }
    report.llmService = "ok";
    const providers = typeof llm.listProviders === "function" ? llm.listProviders() : [];
    report.providers = providers.map((p) => p.id);
    report.registryPresent = providers.some((p) => p.id === routeName);
    if (typeof llm.listModels === "function" && report.registryPresent) {
      try {
        const models = await llm.listModels(routeName);
        report.registryModels = models.length;
      } catch (error) {
        report.registryModels = "threw: " + describeError(error);
      }
    }
  } catch (error) {
    report.llmService = "threw: " + describeError(error);
  }
  try {
    const settings = typeof ctx?.get === "function" ? ctx.get("settings", false) : void 0;
    if (!settings || typeof settings.update !== "function") {
      report.settingsChannel = "unavailable";
    } else {
      let found = false;
      try {
        const rows = settings.describe({ redactSecrets: true });
        found = Array.isArray(rows) && rows.some((row) => row?.ns === (report.settingsNs ?? "llm-pi-ai"));
      } catch (error) {
        report.settingsChannel = "describe threw: " + describeError(error);
      }
      report.settingsChannel ??= found ? "ok" : "entry missing";
      report.settingsNs ??= "llm-pi-ai";
    }
  } catch (error) {
    report.settingsChannel = "threw: " + describeError(error);
  }
  try {
    const credentials = typeof ctx?.get === "function" ? ctx.get("credentials", false) : void 0;
    if (!credentials || typeof credentials.resolve !== "function") {
      report.credentialResolve = "unavailable";
    } else {
      const hit = await credentials.resolve(apiKeyRef);
      report.credentialResolve = hit && hit.value ? "resolved(" + (hit.source ?? "?") + ")" : "missing";
    }
  } catch (error) {
    report.credentialResolve = "threw: " + describeError(error);
  }
  return report;
}
async function verifyRoute(ctx, routeName) {
  try {
    const llm = typeof ctx?.get === "function" ? ctx.get("llm", false) : void 0;
    if (!llm || typeof llm.listProviders !== "function") {
      return { present: null, listedModels: null, detail: "llm 服务不可用（无法自检）" };
    }
    const present = llm.listProviders().some((p) => p?.id === routeName);
    if (!present) {
      return { present: false, listedModels: null, detail: "ctx.plugin 未把路由注册进 llm（fiber 可能停在 pending）" };
    }
    let listedModels = null;
    if (typeof llm.listModels === "function") {
      try {
        const listed = await llm.listModels(routeName);
        listedModels = Array.isArray(listed) ? listed.length : 0;
      } catch (error) {
        return { present: true, listedModels: null, detail: "listModels 抛错：" + describeError(error) };
      }
    }
    return listedModels === 0 ? { present: true, listedModels, detail: "路由已注册但模型为空（通常是 apiKeyEnv 解析不到凭据）" } : { present: true, listedModels };
  } catch (error) {
    return { present: null, listedModels: null, detail: "自检抛错：" + describeError(error) };
  }
}
function readSelection(ctx) {
  try {
    const service = typeof ctx?.get === "function" ? ctx.get("agentDefaultModel", false) : void 0;
    if (!service || typeof service.currentSelection !== "function") return null;
    const selection = service.currentSelection();
    if (!selection || typeof selection !== "object") return null;
    const provider = String(selection.provider ?? "");
    const model = String(selection.model ?? "");
    if (!provider || !model) return null;
    return { provider, model };
  } catch {
    return null;
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function sendJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}
function parseJson(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" ? value : void 0;
  } catch {
    return void 0;
  }
}
function apply(ctx, config) {
  const catalogs = new CatalogStore();
  catalogs.load();
  const settings = new ProfileSettingsStore();
  settings.load();
  const mounts = /* @__PURE__ */ new Map();
  const settingsRoutes = /* @__PURE__ */ new Map();
  const settingsMountShim = (profileId) => {
    const entry = settingsRoutes.get(profileId);
    if (!entry) return void 0;
    return {
      routeName: entry.routeName,
      mounted: true,
      modelCount: entry.modelCount,
      managedBy: "settings",
      verify: async () => ({ present: null, listedModels: null }),
      update: async () => {
      },
      dispose: async () => {
      }
    };
  };
  const mountErrors = /* @__PURE__ */ new Map();
  const resolve = (id) => {
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
        defaultMaxTokens: cfg.defaultMaxTokens ?? DEFAULT_MAX_TOKENS
      }
    });
  };
  const syncProvider = async (profile, models) => {
    if (!profile.baseURL) {
      return { ok: false, error: "该档案还没配置地址" };
    }
    if (models.length === 0) {
      return { ok: false, error: "当前分组没有可用模型，未挂载模型路由" };
    }
    const cfg = readConfig(config);
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
      defaultMaxTokens: profile.defaultMaxTokens
    });
    if (viaSettings && viaSettings.kind === "settings") {
      const check = await verifyRoute(ctx, profile.routeName);
      settingsRoutes.set(profile.id, { routeName: profile.routeName, modelCount: models.length });
      if (check.present === false) {
        const message = "已写入 " + viaSettings.ns + " 的 providers，但模型路由仍未出现在 llm 中";
        mountErrors.set(profile.id, message);
        return { ok: false, error: message };
      }
      mountErrors.delete(profile.id);
      return { ok: true };
    }
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
          adapterModule: cfg.providerAdapter
        });
        mounts.set(profile.id, created);
      } else {
        await existing.update(models);
      }
      const mounted = mounts.get(profile.id);
      const check = await mounted.verify();
      if (check.present === false) {
        const message = "模型路由没有注册进 llm：" + (check.detail ?? "未知原因");
        mountErrors.set(profile.id, message);
        return { ok: false, error: message };
      }
      if (check.present === true && check.listedModels === 0) {
        const message = "路由已注册但模型为空：" + (check.detail ?? "未知原因");
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
  const buildDeps = async (profile) => {
    const cfg = readConfig(config);
    const inline = profile.preset ? cfg.apiKey : void 0;
    return {
      baseURL: profile.baseURL,
      routeName: profile.routeName,
      group: "",
      apiKey: await resolveApiKey(ctx, profile.apiKeyRef, inline),
      store: catalogs,
      provider: mounts.get(profile.id) ?? settingsMountShim(profile.id),
      syncProvider: (models) => syncProvider(profile, models),
      credential: await describeCredential(ctx, profile.apiKeyRef),
      selection: readSelection(ctx)
    };
  };
  const stateFor = async (profile, refresh = false) => {
    if (!profile.baseURL) {
      return {
        ...readStateEmpty(""),
        error: "兼容模式还没配置：请填写地址与密钥后保存"
      };
    }
    const deps = await buildDeps(profile);
    return readState(deps, refresh);
  };
  const decorate = (state, profile) => {
    state.profile = profile.id;
    state.displayName = profile.displayName;
    state.preset = profile.preset;
    state.api = profile.api;
    state.configured = Boolean(profile.baseURL);
    return state;
  };
  const withProvider = (state, profile) => {
    const viaSettings = settingsRoutes.get(profile.id);
    if (viaSettings) {
      state.provider = {
        routeName: viaSettings.routeName,
        mounted: true,
        modelCount: viaSettings.modelCount,
        managedBy: "settings",
        ...mountErrors.has(profile.id) ? { error: mountErrors.get(profile.id) } : {}
      };
      return state;
    }
    const mount = mounts.get(profile.id);
    if (mount) {
      state.provider = {
        routeName: mount.routeName,
        mounted: mount.mounted,
        modelCount: mount.modelCount,
        ...mountErrors.has(profile.id) ? { error: mountErrors.get(profile.id) } : {}
      };
    }
    return state;
  };
  const warmStart = async () => {
    for (const id of ["aimy", "compat"]) {
      try {
        const profile = resolve(id);
        if (!profile.baseURL) continue;
        const cached = catalogs.latest(profile.baseURL);
        if (!cached || cached.models.length === 0) continue;
        await syncProvider(profile, cached.models);
      } catch {
      }
    }
  };
  void warmStart();
  ctx.effect(() => () => {
    for (const mount of mounts.values()) void mount.dispose();
    mounts.clear();
  }, "dsh-aimy: dispose providers");
  ctx.effect(
    () => ctx.webServer.register({
      kind: "prefix",
      path: ROUTE_PREFIX,
      handler: async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname;
        const method = (req.method ?? "GET").toUpperCase();
        const route = pathname.slice(ROUTE_PREFIX.length) || "/";
        const rawProfile = url.searchParams.get("profile") ?? "aimy";
        const profileId = isProfileId(rawProfile) ? rawProfile : "aimy";
        try {
          const profile = resolve(profileId);
          const needsNetwork = route === "/state" || route === "/refresh" || route === "/switch";
          if (!profile.baseURL && needsNetwork) {
            const state = decorate(
              {
                ...readStateEmpty(profile.baseURL),
                error: "兼容模式还没配置：请填写地址与密钥后保存"
              },
              profile
            );
            sendJson(res, 200, { success: true, data: withProvider(state, profile) });
            return;
          }
          const deps = await buildDeps(profile);
          if (method === "GET" && route === "/state") {
            const state = withProvider(decorate(await readState(deps), profile), profile);
            state.diagnostics = await readDiagnostics(ctx, profile.routeName, profile.apiKeyRef, readConfig(config).settingsNs ?? DEFAULT_SETTINGS_NS);
            sendJson(res, 200, { success: true, data: state });
            return;
          }
          if (method === "POST" && route === "/refresh") {
            const state = withProvider(decorate(await readState(deps, true), profile), profile);
            sendJson(res, 200, { success: true, data: state });
            return;
          }
          if (method === "POST" && route === "/credentials") {
            const payload = parseJson(await readBody(req));
            const apiKey = String(payload?.apiKey ?? "").trim();
            if (!apiKey) {
              sendJson(res, 400, { success: false, message: "密钥不能为空" });
              return;
            }
            if (!isValidCredentialRef(profile.apiKeyRef)) {
              sendJson(res, 400, { success: false, message: "密钥名不合法：" + profile.apiKeyRef });
              return;
            }
            await setCredential(ctx, profile.apiKeyRef, apiKey);
            const state = withProvider(
              decorate(await stateFor(profile), profile),
              profile
            );
            sendJson(res, 200, { success: true, message: "已保存", data: state });
            return;
          }
          if (method === "DELETE" && route === "/credentials") {
            await unsetCredential(ctx, profile.apiKeyRef);
            const state = withProvider(decorate(await stateFor(profile), profile), profile);
            sendJson(res, 200, { success: true, message: "已清除", data: state });
            return;
          }
          if (method === "POST" && route === "/config") {
            if (profile.preset) {
              sendJson(res, 403, { success: false, message: "预设档案的地址不可修改" });
              return;
            }
            const payload = parseJson(await readBody(req));
            const baseURL = normalizeBaseURL(String(payload?.baseURL ?? ""));
            const api = normalizeApi(payload?.api);
            if (!/^https?:\/\//i.test(baseURL)) {
              sendJson(res, 400, { success: false, message: "请填写完整的 http(s) 地址" });
              return;
            }
            settings.setCompat({ baseURL, api });
            const saved = resolve(profileId);
            const state = withProvider(decorate(await stateFor(saved, true), saved), saved);
            sendJson(res, 200, { success: true, message: "已保存", data: state });
            return;
          }
          if (method === "DELETE" && route === "/config") {
            if (profile.preset) {
              sendJson(res, 403, { success: false, message: "预设档案不可清除" });
              return;
            }
            const mount = mounts.get(profileId);
            if (mount) {
              await mount.dispose();
              mounts.delete(profileId);
            }
            const cfgNow = readConfig(config);
            await removeProviderViaSettings(ctx, {
              settingsNs: cfgNow.settingsNs ?? DEFAULT_SETTINGS_NS,
              routeName: "onehub-compat"
            });
            settings.clearCompat();
            const cleared = resolve(profileId);
            const state = withProvider(
              decorate({ ...readStateEmpty(""), error: "兼容模式还没配置：请填写地址与密钥后保存" }, cleared),
              cleared
            );
            sendJson(res, 200, { success: true, message: "已清除", data: state });
            return;
          }
          if (method === "POST" && route === "/switch") {
            const payload = parseJson(await readBody(req));
            const group = String(payload?.group ?? "");
            const result = await switchGroup(deps, group);
            const body = result.body;
            if (body?.data?.state) {
              withProvider(decorate(body.data.state, profile), profile);
              if (body.data.state.staleModel) {
                const kept = body.data.state.selection?.model ?? "当前模型";
                const stale = "分组已切换，但当前选中的模型 " + kept + " 不在新分组里，请重新选择模型";
                body.data.warning = body.data.warning ? body.data.warning + "；" + stale : stale;
              }
            }
            sendJson(res, result.status, result.body);
            return;
          }
          sendJson(res, 404, { success: false, message: "unknown route: " + route });
        } catch (error) {
          sendJson(res, 500, { success: false, message: describeError(error) });
        }
      }
    }),
    "dsh-aimy: relay routes"
  );
}
function readStateEmpty(baseURL) {
  return {
    baseURL,
    connected: false,
    supportsSwitch: false,
    token: null,
    models: [],
    modelsFetchedAt: 0,
    provider: null,
    credential: null,
    selection: null,
    staleModel: false
  };
}
export {
  apply,
  inject,
  isValidCredentialRef,
  name,
  pickPlugin
};
