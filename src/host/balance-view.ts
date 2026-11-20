/**
 * 底部余额条：把「查询余额」这件事从「给 dsh-pet 的 wire 形状」里解耦出来。
 *
 * 与 ./balance.ts 的分工：
 *   - `balance.ts` 负责**认站点**（三档探测链 + 各站响应形状），产出 `QuotaReading`；
 *   - 这里负责**认自定义模板**（与 CCswitch 的「用量查询通用模板」同构），
 *     并把两种来源统一成 `BalanceView`（金额 / 额度 / 已用百分比），供客户端直接排版。
 *
 * 取值优先级：**配了模板就先试模板**（用户显式指定，说明内置链认不出该站），
 * 模板失败再回落内置三档；两边都失败时把两条错误都带上 —— 不伪造 0 余额。
 *
 * 模板能力与 CCswitch 等价（`url` + `headers` + `extract(data)`），
 * 区别是 `extract` 只做**取值**，不做网络请求：请求参数由 `url/method/headers/body` 声明，
 * 这样同一份模板在面板里能显示成人能读懂的字段，而不是一坨代码。
 */
import { asRecord, optNum, readQuota, requestJsonWith, type QuotaReading } from './balance';
import type { BalanceView } from '../shared/types';

/* ------------------------------ 模板定义 ------------------------------ */

/**
 * 一条自定义查询模板。
 *
 * 两种取值方式二选一（都填时 `script` 优先）：
 *   - `path`：点号路径，如 `data.total_available`、`wallets[0].total`；
 *   - `script`：函数体，形参是 `(data, helpers)`，须 `return { balance, currency }`
 *     或直接 `return 数字`。与 CCswitch 的 `extract(data)` 写法兼容。
 */
export interface BalanceTemplate {
  /** 完整地址，或相对路径（自动拼到站点根上）。支持 `{baseURL}` 占位。 */
  url?: string;
  /** 默认 GET */
  method?: string;
  /** 额外请求头；值里可用 `{apiKey}` 占位。未写 Authorization 时自动注入 Bearer。 */
  headers?: Record<string, string>;
  /** 请求体（仅非 GET 生效），原样发送 */
  body?: string;
  /** 取值路径 */
  path?: string;
  /** 固定币种，如 `$` / `USD` / `CNY` */
  currency?: string;
  /** 取值脚本（函数体） */
  script?: string;
}

/** 缓存键：同一站点换了模板要分开算，否则改完模板仍读到旧值。 */
export function cacheKeyFor(baseURL: string, template: BalanceTemplate | null | undefined): string {
  const tail = template ? JSON.stringify(template) : '';
  return baseURL + '|' + tail;
}

/* ------------------------------ 取值 ------------------------------ */

/** 点号路径取值：`a.b[0].c`。任一段缺失返回 undefined，不抛错。 */
export function readPath(root: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((segment) => segment.length > 0);
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

/** 模板脚本可用的工具函数（只给纯函数，不给 fetch —— 取值不该再发请求）。 */
const SCRIPT_HELPERS = {
  /** 任意值转数字；转不出返回 undefined */
  num(value: unknown): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  },
  /** 等价于 readPath */
  pick: readPath,
};

interface Extracted {
  balance: number;
  currency?: string;
}

/**
 * 跑模板脚本。
 *
 * 用 `new Function` 而不是沙箱：这是**用户自己写的本地配置**，与 CCswitch 同一信任级别
 * （它也是在页面里直接 eval 模板）。为了把风险说清楚，脚本只拿到 `data` 与纯函数
 * `helpers`，不注入 fetch/require —— 但 JS 本身的能力边界仍由运行环境决定，文档里写明。
 */
function runScript(body: unknown, script: string, fallbackCurrency?: string): Extracted {
  let fn: (data: unknown, helpers: typeof SCRIPT_HELPERS) => unknown;
  try {
    fn = new Function('data', 'helpers', script) as typeof fn;
  } catch (error) {
    throw new Error('模板脚本语法错误：' + describe(error));
  }
  let out: unknown;
  try {
    out = fn(body, SCRIPT_HELPERS);
  } catch (error) {
    throw new Error('模板脚本执行失败：' + describe(error));
  }
  return normalizeExtracted(out, fallbackCurrency);
}

function normalizeExtracted(out: unknown, fallbackCurrency?: string): Extracted {
  if (typeof out === 'number') {
    if (!Number.isFinite(out)) throw new Error('模板脚本返回了非数字');
    return { balance: out, ...(fallbackCurrency ? { currency: fallbackCurrency } : {}) };
  }
  const record = asRecord(out);
  if (!record) throw new Error('模板脚本须返回数字或 {balance, currency}');
  const raw = record.balance ?? record.amount ?? record.remaining;
  const balance = optNum(raw);
  if (balance === undefined) throw new Error('模板脚本没有返回可用的 balance');
  const currency = typeof record.currency === 'string' && record.currency ? record.currency : fallbackCurrency;
  return { balance, ...(currency ? { currency } : {}) };
}

/** 从响应体里按模板取值。 */
export function extractAmount(body: unknown, template: BalanceTemplate): Extracted {
  if (template.script && template.script.trim()) return runScript(body, template.script, template.currency);
  if (template.path && template.path.trim()) {
    const value = readPath(body, template.path.trim());
    const balance = optNum(value);
    if (balance === undefined) throw new Error('模板路径 ' + template.path + ' 没有取到数字');
    return { balance, ...(template.currency ? { currency: template.currency } : {}) };
  }
  throw new Error('模板缺少 path 或 script，不知道从响应里取哪个字段');
}

/* ------------------------------ 请求 ------------------------------ */

/**
 * 拼出模板的请求地址。
 *
 * 支持两个占位符：`{baseURL}`（站点根）与 `{apiKey}`（密钥）——
 * 后者是因为不少站的余额接口把 token 放在 query 里（`/api/usage?token=xxx`）。
 * 密钥进了 URL 就会进错误文案，所以 `describe()` 负责把它打码。
 */
function resolveUrl(raw: string, root: string, key: string): string {
  const url = raw
    .replace(/\{baseURL\}/gi, root)
    .replace(/\{apiKey\}/gi, key);
  if (/^https?:\/\//i.test(url)) return url;
  return root + (url.startsWith('/') ? '' : '/') + url;
}

function expandHeaders(headers: Record<string, string> | undefined, key: string): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = String(value).replace(/\{apiKey\}/g, key);
  }
  return out;
}

/** 模板里没写 Authorization 时补一个 Bearer（多数中转站都要）。 */
function withAuth(headers: Record<string, string>, key: string): Record<string, string> {
  const hasAuth = Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
  if (hasAuth || !key) return headers;
  return { ...headers, Authorization: 'Bearer ' + key };
}

/**
 * 按模板查一次。失败一律抛错（由 `readBalanceView` 收集后回落内置链）。
 *
 * 重试次数为 0：模板是显式配置，失败基本是配置写错，重试只会让面板多等 800ms。
 */
async function applyTemplate(
  template: BalanceTemplate,
  root: string,
  key: string,
  doFetch: typeof fetch,
): Promise<Extracted> {
  const rawUrl = (template.url ?? '').trim();
  if (!rawUrl) throw new Error('模板缺少 url');
  const url = resolveUrl(rawUrl, root, key);
  const headers = withAuth(expandHeaders(template.headers, key), key);
  const method = (template.method ?? 'GET').toUpperCase();
  const { body } = await requestJsonWith(url, key, doFetch, {
    method,
    headers,
    ...(template.body === undefined ? {} : { body: template.body }),
    retries: 0,
  });
  return extractAmount(body, template);
}

/* ------------------------------ 对外读数 ------------------------------ */

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** `QuotaReading` → 客户端排版用的 `BalanceView`。 */
export function viewFromReading(reading: QuotaReading, fetchedAt: string): BalanceView {
  const monthly = reading.windows?.monthly;
  const limit = monthly?.capUsd ?? reading.limit;
  let usedPercent: number | undefined;
  if (monthly) {
    usedPercent = round1(monthly.percent);
  } else if (limit !== undefined && limit > 0) {
    usedPercent = round1(Math.max(0, Math.min(100, ((limit - reading.remaining) / limit) * 100)));
  }
  return {
    amount: reading.remaining,
    ...(reading.currency ? { currency: reading.currency } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(usedPercent !== undefined ? { usedPercent } : {}),
    source: reading.source ?? 'usage',
    fetchedAt,
  };
}

export type BalanceViewResult = { ok: true; view: BalanceView } | { ok: false; error: string };

/**
 * 取一次余额：模板优先，失败回落内置三档。
 *
 * @param root 站点 API 根（已去掉 `/v1`），用 ./relay 的 `apiRoot()` 得到
 */
export async function readBalanceView(
  root: string,
  key: string,
  doFetch: typeof fetch,
  template?: BalanceTemplate | null,
): Promise<BalanceViewResult> {
  const fetchedAt = new Date().toISOString();
  const reasons: string[] = [];

  if (template && (template.url ?? '').trim()) {
    try {
      const extracted = await applyTemplate(template, root, key, doFetch);
      return {
        ok: true,
        view: {
          amount: extracted.balance,
          ...(extracted.currency ? { currency: extracted.currency } : {}),
          source: 'template',
          fetchedAt,
        },
      };
    } catch (error) {
      reasons.push('模板：' + describe(error, key));
    }
  }

  try {
    const reading = await readQuota(root, key, doFetch);
    return { ok: true, view: viewFromReading(reading, fetchedAt) };
  } catch (error) {
    reasons.push('内置探测：' + describe(error, key));
  }

  return { ok: false, error: reasons.join('；') };
}

/** 错误文案里若带上了密钥（模板把 key 拼进 URL 时会这样），一律打码。 */
function describe(error: unknown, key?: string): string {
  const text = error instanceof Error ? error.message : String(error);
  return key && key.length >= 8 ? text.split(key).join('***') : text;
}

/* ------------------------------ 缓存 ------------------------------ */

/** 新鲜期：60 秒内重复请求（切页面、多标签）不再打站点。 */
export const BALANCE_CACHE_TTL_MS = 60_000;

export interface CachedBalance {
  /** 上次成功读数；失败不清空 —— 旧数字比空白有用 */
  view: BalanceView | null;
  /** 上次失败原因（成功后清空） */
  error?: string;
  /** 上次尝试时间 */
  at: number;
  /** 上次成功时间 */
  viewAt?: number;
}

/**
 * 余额缓存：与 `GroupCache` 同款 stale-while-revalidate。
 *
 * 余额查询要打第三方站点（实测 40–400ms，偶发数秒），而底部条是**常驻**的：
 * 每次切页都同步等一次不可接受。所以新鲜期内直接返回，过期后先返回旧值、
 * 后台刷新，下一次轮询再拿新数字。
 */
export class BalanceCache {
  private entries = new Map<string, CachedBalance>();
  private refreshing = new Set<string>();
  private now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  peek(key: string): CachedBalance | undefined {
    return this.entries.get(key);
  }

  /** 新鲜且没有待处理的错误：可以直接用。 */
  fresh(key: string): CachedBalance | undefined {
    const entry = this.entries.get(key);
    if (!entry || !entry.view || entry.error) return undefined;
    return this.now() - entry.at < BALANCE_CACHE_TTL_MS ? entry : undefined;
  }

  set(key: string, view: BalanceView): void {
    const at = this.now();
    this.entries.set(key, { view, at, viewAt: at });
  }

  /** 记录失败：保留上次成功的读数，只挂错误。 */
  fail(key: string, error: string): void {
    const previous = this.entries.get(key);
    this.entries.set(key, {
      view: previous?.view ?? null,
      error,
      at: this.now(),
      ...(previous?.viewAt === undefined ? {} : { viewAt: previous.viewAt }),
    });
  }

  /** 抢占一次后台刷新；已在刷新中返回 false（避免并发打站点）。 */
  beginRefresh(key: string): boolean {
    if (this.refreshing.has(key)) return false;
    this.refreshing.add(key);
    return true;
  }

  endRefresh(key: string): void {
    this.refreshing.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.refreshing.clear();
  }
}
