/** 中转站 HTTP 客户端：只做「请求 + 反序列化 + 错误归一」，不做业务编排。 */
import type { RelayModel, TokenGroupState } from '../shared/types';

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
    .replace(/\/chat\/completions$/i, '')
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
