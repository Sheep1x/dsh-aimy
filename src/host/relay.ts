/** 中转站 HTTP 客户端：只做「请求 + 反序列化 + 错误归一」，不做业务编排。 */
import type { ReachabilityMap, RelayModel, TokenGroupState } from '../shared/types';

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
  /** 测试时注入；生产使用全局 fetch */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * 中转站 API 根：去掉尾部斜杠，并容忍用户把 `/v1` 一起填进来。
 * 本文件所有路径都以 `/v1/...` 开头，若不剥掉会拼成 `/v1/v1/models`。
 */
export function apiRoot(baseURL: string): string {
  let trimmed = baseURL.trim().replace(/\/+$/, '');
  // 先剥掉用户可能整段粘贴的端点路径
  trimmed = trimmed
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/v1\/responses$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/v1\/messages$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/completions$/i, '');
  // 再剥掉 API 版本段（本文件所有路径自带 /v1）
  return trimmed.replace(/\/v1$/i, '').replace(/\/+$/, '');
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
  try {
    const res = await doFetch(normalizeBase(opts.baseURL) + pathname, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + opts.apiKey,
        'Content-Type': 'application/json',
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
  const body = await request<{ data?: unknown }>(opts, '/v1/models');
  const list = Array.isArray(body.data) ? body.data : [];
  const seen = new Set<string>();
  const models: RelayModel[] = [];
  for (const item of list) {
    const id = typeof item === 'string' ? item : String((item as Record<string, unknown>)?.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, name: id });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
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
 * 探测模型可达性。
 *
 * 用一次最小成本的生成请求判断上游到底认不认这个 id：`max_tokens: 1` +
 * 固定单字输入，成本可以忽略。不做流式，只要能拿到状态码即可。
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
        await request<unknown>(opts, '/v1/chat/completions', {
          method: 'POST',
          body: JSON.stringify({
            model: next.id,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false,
          }),
        });
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
