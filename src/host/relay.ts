/** 中转站 HTTP 客户端：只做「请求 + 反序列化 + 错误归一」，不做业务编排。 */
import { DEFAULT_API, type ReachabilityMap, type RelayApi, type RelayModel, type TokenGroupState } from '../shared/types';

export class RelayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'auth' | 'forbidden' | 'bad-request' | 'not-found' | 'network' | 'unknown',
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

export interface RelayOptions {
  baseURL: string;
  apiKey: string;
  /**
   * 线路协议。探测请求必须按协议选端点：同一个中转站在 responses 与
   * completions 下是两套线路，用错端点会得到与真实调用不一致的结论
   * （例如把只支持 responses 的模型误判为不可用）。缺省按 Responses。
   */
  api?: RelayApi;
  /** 测试时注入；生产使用全局 fetch */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * 中转站 API 根：去掉尾部斜杠，并容忍用户把 `/v1` 或 `/v1beta` 一起填进来。
 * 本文件所有路径都以版本段开头（`/v1/...` 或 Gemini 的 `/v1beta/...`），
 * 若不剥掉会拼成 `/v1/v1/models`。
 */
export function apiRoot(baseURL: string): string {
  let trimmed = baseURL.trim().replace(/\/+$/, '');
  // 先剥掉用户可能整段粘贴的端点路径
  trimmed = trimmed
    .replace(/\/v1beta\/models\/[^/]+(?::[a-zA-Z]+)?$/i, '')
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/v1\/responses$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/v1\/messages$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/completions$/i, '');
  // 再剥掉 API 版本段（本文件所有路径自带版本段）
  return trimmed.replace(/\/v1(beta)?$/i, '').replace(/\/+$/, '');
}

function normalizeBase(baseURL: string): string {
  return apiRoot(baseURL);
}

function kindOf(status: number): RelayError['kind'] {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status >= 400 && status < 500) return 'bad-request';
  return 'unknown';
}

async function request<T>(opts: RelayOptions, pathname: string, init: RequestInit = {}): Promise<T> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  /*
   * Gemini 协议的官方鉴权是 `x-goog-api-key`（或 `?key=`），不认 Bearer。
   * 但 one-hub 系中转站两种都收（实测 Bearer 也能过）。所以这里在 Gemini 下
   * **两个头都发**：真 Google 端点靠 x-goog-api-key，中转站靠 Bearer，互不干扰。
   */
  const googleAuth: Record<string, string> =
    opts.api === 'google-generative-ai' ? { 'x-goog-api-key': opts.apiKey } : {};
  try {
    const res = await doFetch(normalizeBase(opts.baseURL) + pathname, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + opts.apiKey,
        'Content-Type': 'application/json',
        ...googleAuth,
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const message = extractMessage(body) ?? 'HTTP ' + res.status;
      throw new RelayError(message, res.status, kindOf(res.status));
    }
    return body as T;
  } catch (error) {
    if (error instanceof RelayError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new RelayError('无法连接中转站：' + message, 0, 'network');
  } finally {
    clearTimeout(timer);
  }
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message) return record.message;
    if (typeof record.error === 'string' && record.error) return record.error;
    const err = record.error;
    if (err && typeof err === 'object' && typeof (err as Record<string, unknown>).message === 'string') {
      return (err as Record<string, string>).message;
    }
  }
  return undefined;
}

/** GET /v1/token/group */
export async function fetchTokenGroup(opts: RelayOptions): Promise<TokenGroupState> {
  const body = await request<{ data?: Record<string, unknown> }>(opts, '/v1/token/group');
  const data = body.data ?? {};

  /**
   * 第三方站点（new-api / sub2api 等）常有「接口存在但没实现」的形态：
   * 返回 200 + {"success":true} 但 data 里既没有 group 也没有 groups。
   * 这种站点的分组能力应当视为**不可用**，否则界面会显示一个点了没反应的
   * 「切换分组」按钮。有 group 或 groups 任一才算真的支持。
   */
  const hasGroup = typeof data.group === 'string' && data.group.length > 0;
  const hasGroups = Array.isArray(data.groups) && (data.groups as unknown[]).length > 0;
  if (!hasGroup && !hasGroups) {
    throw new RelayError('该站点未提供分组接口（/v1/token/group 无有效数据）', 404, 'not-found');
  }
  return {
    group: String(data.group ?? ''),
    backupGroup: String(data.backup_group ?? ''),
    ratio: Number(data.ratio ?? 1),
    allowGroupSwitch: Boolean(data.allow_group_switch),
    groups: Array.isArray(data.groups)
      ? (data.groups as Array<Record<string, unknown>>).map((g) => ({
          symbol: String(g.symbol ?? ''),
          name: String(g.name ?? g.symbol ?? ''),
          ratio: Number(g.ratio ?? 1),
          public: Boolean(g.public),
        }))
      : [],
  };
}

/** PUT /v1/token/group */
export async function switchTokenGroup(opts: RelayOptions, group: string): Promise<TokenGroupState> {
  const body = await request<{ data?: Record<string, unknown> }>(opts, '/v1/token/group', {
    method: 'PUT',
    body: JSON.stringify({ group }),
  });
  const data = body.data ?? {};
  return {
    group: String(data.group ?? group),
    backupGroup: String(data.backup_group ?? ''),
    ratio: Number(data.ratio ?? 1),
    allowGroupSwitch: Boolean(data.allow_group_switch),
    groups: Array.isArray(data.groups)
      ? (data.groups as Array<Record<string, unknown>>).map((g) => ({
          symbol: String(g.symbol ?? ''),
          name: String(g.name ?? g.symbol ?? ''),
          ratio: Number(g.ratio ?? 1),
          public: Boolean(g.public),
        }))
      : [],
  };
}

/** GET /v1/models —— 返回当前分组可用的模型 id。 */
export async function fetchModels(opts: RelayOptions): Promise<RelayModel[]> {
  /*
   * Gemini 协议的站点目录在 `/v1beta/models`，返回的是
   * `{models:[{name:'models/gemini-2.5-flash', displayName, inputTokenLimit, outputTokenLimit}]}`
   * —— 与 OpenAI 的 `{data:[{id}]}` 完全是两套形状。
   *
   * 但 Gemini 站点（尤其 one-hub 系中转站）通常也保留 OpenAI 兼容的
   * `/v1/models`，而 `/v1beta/models` 可能因为「当前分组没有 Gemini 渠道」
   * 返回空数组。所以这里**先按协议取原生目录，拿不到非空结果再回落 /v1/models**，
   * 避免因为协议一换就把整个模型选择器清空。
   */
  if ((opts.api ?? DEFAULT_API) === 'google-generative-ai') {
    const native = await fetchGoogleModels(opts);
    if (native.length > 0) return native;
  }

  const body = await request<{ data?: unknown }>(opts, '/v1/models');
  const list = Array.isArray(body.data) ? body.data : [];
  const seen = new Set<string>();
  const models: RelayModel[] = [];
  for (const item of list) {
    const id = typeof item === 'string' ? item : String((item as Record<string, unknown>)?.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const capacity = typeof item === 'string' ? {} : declaredCapacity(item as Record<string, unknown>);
    models.push({ id, name: id, ...capacity });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

/**
 * GET /v1beta/models —— Gemini 原生目录。
 *
 * 失败一律返回空数组（由调用方回落到 /v1/models）：目录拉取失败本身由
 * 回落路径去报错，这里再抛一次只会把错误说成「Gemini 目录不可用」。
 */
async function fetchGoogleModels(opts: RelayOptions): Promise<RelayModel[]> {
  let body: { models?: unknown };
  try {
    body = await request<{ models?: unknown }>(opts, '/v1beta/models');
  } catch {
    return [];
  }
  const list = Array.isArray(body.models) ? body.models : [];
  const seen = new Set<string>();
  const models: RelayModel[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    // name 形如 `models/gemini-2.5-flash`，路由里要用不带前缀的裸 id
    const raw = String(entry.name ?? '');
    const id = raw.replace(/^models\//i, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const contextWindow = firstPositive(entry.inputTokenLimit, entry.contextWindow);
    const maxTokens = firstPositive(entry.outputTokenLimit, entry.maxTokens);
    models.push({
      id,
      name: String(entry.displayName ?? id),
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

/**
 * 从 /v1/models 的一个条目里读出站点声明的容量。
 *
 * 字段名各种网关不一样，这里把 pi-ai 自己的发现逻辑（它认的那些键）对齐过来：
 *   上下文：context_length | max_input_tokens | context_window | limit.context
 *   输出  ：max_output_tokens | max_completion_tokens | max_tokens | top_provider.max_completion_tokens
 *
 * 只接受正整数。**读不到就不填**——由 ../host/capacity.ts 往下一层回落，
 * 绝不拿 0 或 NaN 占位（那会让 pi-ai 的 schema（min(1)）直接拒绝整个 provider）。
 */
function declaredCapacity(entry: Record<string, unknown>): { contextWindow?: number; maxTokens?: number } {
  const limit = entry.limit as Record<string, unknown> | undefined;
  const topProvider = entry.top_provider as Record<string, unknown> | undefined;
  const contextWindow = firstPositive(
    entry.context_length,
    entry.max_input_tokens,
    entry.context_window,
    entry.contextWindow,
    limit?.context,
  );
  const maxTokens = firstPositive(
    entry.max_output_tokens,
    entry.max_completion_tokens,
    entry.max_completionTokens,
    entry.max_tokens,
    entry.maxTokens,
    limit?.output,
    topProvider?.max_completion_tokens,
  );
  return {
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
  };
}

/** 取第一个为正整数的候选（字符串数字也收，网关常把数字写成字符串）。 */
function firstPositive(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (typeof numeric === 'number' && Number.isInteger(numeric) && numeric > 0) return numeric;
  }
  return undefined;
}

/**
 * 判断一次探测失败是否等于「这个模型不存在」。
 *
 * 上游对「不路由这个 id」的表述不统一：OpenAI 系常见 404 + `model_not_found`，
 * new-api / one-hub 会把上游原话透传成 `Model is unavailable`，也见过
 * 400 + `invalid model`。这些都属于**对模型的否定**。
 *
 * 反过来，401/403（凭据问题）、429（限流）、5xx（网关故障）、超时与断网
 * 都是**对链路的状态描述**，换个时间重试可能就好了 —— 一律不判死。
 */
function deniesModel(error: RelayError): boolean {
  if (error.kind === 'not-found') return true;
  if (error.status === 400) {
    return /model.*(not|un)?(found|available)|invalid model|no such model|unknown model/i.test(error.message);
  }
  return false;
}

/**
 * 按协议给出一次「最小生成」探测的端点与请求体。
 *
 * 四种协议的探测载荷不同，必须各自匹配，否则上游会按「请求格式错误」返回 400，
 * 而 400 里带 model 字样时还会被 deniesModel 误判成「模型不可用」：
 *
 *   openai-responses   : POST /v1/responses    { input, max_output_tokens }
 *   openai-completions : POST /v1/chat/completions { messages, max_tokens }
 *   anthropic-messages : POST /v1/messages     { messages, max_tokens }
 *   google-generative-ai: POST /v1beta/models/{id}:generateContent { contents, generationConfig }
 *
 * Anthropic 协议必须带 anthropic-version 头，否则上游直接拒绝。
 * Gemini 协议把模型 id 放在**路径里**（而不是请求体），且路径自带版本段 `/v1beta`。
 */
function probeRequest(api: RelayApi, modelId: string): { pathname: string; init: RequestInit } {
  const base = { method: 'POST' as const };

  if (api === 'openai-responses') {
    return {
      pathname: '/v1/responses',
      init: {
        ...base,
        body: JSON.stringify({ model: modelId, input: 'ping', max_output_tokens: 1, stream: false }),
      },
    };
  }

  if (api === 'anthropic-messages') {
    return {
      pathname: '/v1/messages',
      init: {
        ...base,
        headers: { 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
      },
    };
  }

  if (api === 'google-generative-ai') {
    return {
      pathname: '/v1beta/models/' + encodeURIComponent(modelId) + ':generateContent',
      init: {
        ...base,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      },
    };
  }

  return {
    pathname: '/v1/chat/completions',
    init: {
      ...base,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    },
  };
}

/**
 * 探测模型可达性。
 *
 * 用一次最小成本的生成请求判断上游到底认不认这个 id：`max_tokens: 1` +
 * 固定单字输入，成本可以忽略。不做流式，只要能拿到状态码即可。
 *
 * **端点必须跟随协议**（见 probeRequest）：responses 协议下用 chat 端点探测，
 * 会因为线路不同得出错误结论。
 *
 * 并发度刻意压得很低（默认 4）：中转站通常有速率限制，探测本身不该把
 * 用户当轮的正常调用挤掉。
 *
 * 探测失败**绝不抛出**——它只是给目录加一层标注，任何异常都退化成 `unknown`。
 */
export async function probeModels(
  opts: RelayOptions,
  models: RelayModel[],
  concurrency = 4,
): Promise<ReachabilityMap> {
  const result: ReachabilityMap = {};
  const queue = [...models];

  const worker = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        const { pathname, init } = probeRequest(opts.api ?? DEFAULT_API, next.id);
        await request<unknown>(opts, pathname, init);
        result[next.id] = 'ok';
      } catch (error) {
        if (error instanceof RelayError && deniesModel(error)) {
          result[next.id] = 'unavailable';
        } else {
          result[next.id] = 'unknown';
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, models.length) }, worker));
  return result;
}
