/**
 * 余额桥（host 半侧）：把本插件挂的两条路由（`onehub` / `onehub-compat`）登记进
 * dsh-pet 的余额注册表 —— `ctx.provide('petApi7340').balance.register`。
 *
 * 为什么放在这里而不是 dsh-pet：
 *   1. 余额按「provider id」寻址，而 id 是**挂路由的人**起的（`onehub` / `onehub-compat`）；
 *   2. 中转站的地址与密钥只在本插件手里 —— dsh-pet 的第三方契约刻意**不给** key
 *      （`PluginProvider.fetch` 只收到 `{ provider }`）。
 *
 * 三个站点的接口各不相同，所以这里是一张**探测链**而不是一个解析器：
 *   ① `GET /v1/usage`                        —— one-hub 自有（本站），sub2api 也有但语义不同
 *   ② `GET /v1/dashboard/billing/subscription` + `/usage` —— one-hub 与 new-api 都支持
 *   ③ `GET /api/usage/token/`                —— new-api 令牌级明细（最完整）
 * 任一步成功即返回；全失败一律 `throw`（dsh-pet 统一落成 fetch-error，**绝不伪造 0 余额**）。
 *
 * 三站的差异（都已按源码核对，改这里前请先看）：
 *   - `/v1/usage` **同名不同构**：one-hub 是扁平 `{is_active, remaining, unit}`；
 *     sub2api 是 `{mode: 'quota_limited'|'unrestricted', remaining, quota?, subscription?, rate_limits?}`
 *     三种模式，并且 `remaining === -1` 表示「无额度限制」。
 *   - 计价单位：one-hub 是 USD / 原始 quota 二态；new-api 受站点 `QuotaDisplayType` 控制
 *     **USD / CNY / TOKENS 三态**（字段名还叫 `*_usd`，不能当美元用）；sub2api 稳定 USD。
 *   - one-hub 与 new-api 常有「HTTP 200 + `{success:false}`」的错误形态，只看 `res.ok` 会漏判。
 */
import { apiRoot } from './relay';

/** 与 dsh-pet 的 wire 契约同构。不 import 它的类型：那会给本包加一条可选依赖。 */
export interface BalanceWire {
  ok: true;
  provider: string;
  shape: 'windows' | 'money' | 'points';
  data: Record<string, unknown>;
}

/** 一条要登记给 dsh-pet 的路由。 */
export interface BalanceTarget {
  /** 必须与 pi-ai 里挂的路由名一致（`agentDefaultModel` 报的就是它） */
  id: string;
  baseURL: string;
  apiKeyRef: string;
}

/** dsh-pet 暴露的那半个服务：`ctx.provide('petApi7340', { balance: { register, list } })`。 */
interface PetService {
  balance?: {
    register(def: { id: string; fetch(ctx: { provider: string }): Promise<BalanceWire> }): () => void;
    list?(): { builtin: string[]; external: string[] };
  };
}

const FETCH_TIMEOUT_MS = 15_000;
/** 境外/高延迟站点的偶发超时：重试 1 次足够（dsh-pet 自己 30 分钟一轮，堆太多会互相等） */
const RETRIES = 1;

/* ------------------------------- HTTP ------------------------------- */

async function requestJson(
  url: string,
  key: string,
  doFetch: typeof fetch,
): Promise<{ body: unknown; status: number }> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await doFetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: 'Bearer ' + key,
          Accept: 'application/json',
          'User-Agent': 'dsh-aimy-balance',
        },
      });
      const text = await res.text();
      const body = text ? safeJson(text) : {};
      // 404/405 是「该站没有这个端点」：交给上层的探测链继续往下一档，不做重试
      if (res.status === 404 || res.status === 405) return { body, status: res.status };
      if (!res.ok) throw new Error(pathnameOf(url) + ' HTTP ' + res.status);
      // one-hub / new-api 的经典坑：HTTP 200 里塞 {success:false, message}
      assertNotSoftError(body, url);
      return { body, status: res.status };
    } catch (error) {
      last = error;
      if (attempt < RETRIES) await sleep(800);
    } finally {
      clearTimeout(timer);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `{success:false}` / `{code:false}` / `{error:{message}}` 三种软失败形态统一抛错。 */
function assertNotSoftError(body: unknown, url: string): void {
  if (!body || typeof body !== 'object') return;
  const record = body as Record<string, unknown>;
  if (record.success === false) {
    throw new Error(softMessage(record) ?? pathnameOf(url) + ' 返回失败');
  }
  if (record.code === false) {
    throw new Error(softMessage(record) ?? pathnameOf(url) + ' 返回失败');
  }
  const error = record.error;
  // OpenAI 兼容错误体：{error:{message,type}}；个别站点把 error 直接写成字符串
  if (typeof error === 'string' && error) throw new Error(error);
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message) throw new Error(message);
  }
}

function softMessage(record: Record<string, unknown>): string | undefined {
  const message = record.message;
  return typeof message === 'string' && message ? message : undefined;
}

/* --------------------------- 形状识别（纯函数） --------------------------- */

/** 一个用量/余额窗口。`percent` 一律是**已用**百分比（0 = 未消耗，100 = 耗尽）。 */
export interface UsedWindow {
  percent: number;
  /** 窗口满额度（USD）。缺省 = 该站没给，不参与绝对口径比较 */
  capUsd?: number;
  resetsAt?: string;
}

/** `/v1/usage` 的已知形态。认不出就抛错，绝不猜一个。 */
export type UsageShape =
  | { kind: 'onehub'; remaining: number; unit: string }
  | { kind: 'sub2api-quota'; remaining: number; limit?: number }
  | { kind: 'sub2api-wallet'; remaining: number }
  | { kind: 'sub2api-subscription'; remaining: number; windows: SubscriptionWindows };

/** sub2api 订阅模式的三窗口（日/周/月），可缺省 —— 缺省 = 该周期没设限额。 */
export interface SubscriptionWindows {
  daily?: UsedWindow;
  weekly?: UsedWindow;
  monthly?: UsedWindow;
}

/** 数值校验：非法一律抛错（数据异常要显式暴露，不静默当 0）。 */
function num(value: unknown, what: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('余额数据非法字段 ' + what);
  return n;
}

/** 可选数值：缺省/空/非法 → undefined（可选字段用）。 */
function optNum(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** 已用百分比：夹到 [0,100]，负数（透支）按 100 处理。 */
function usedPercent(used: number, cap: number): number {
  if (!(cap > 0)) throw new Error('余额数据的额度必须为正数');
  return Math.max(0, Math.min(100, (used / cap) * 100));
}

/**
 * 解析 `GET /v1/usage`。
 *
 * 三种形态按**存在哪个判别字段**区分，不做模糊匹配：
 *   - 有 `mode` → sub2api（`quota_limited` / `unrestricted`，后者再按有无 `subscription` 分支）
 *   - 有 `is_active` 或（无 `mode` 的）`remaining` → one-hub
 *   - 都不像 → 抛错（交给探测链的下一档）
 *
 * `remaining === -1`（sub2api 的「无限制」哨兵）直接抛错：那不是一个金额。
 */
export function parseUsageBody(body: unknown): UsageShape {
  const record = asRecord(body);
  if (!record) throw new Error('/v1/usage 响应不是对象');

  if (typeof record.mode === 'string') {
    const remaining = num(record.remaining, 'remaining');
    if (remaining === -1) throw new Error('该令牌没有额度限制');
    if (record.mode === 'quota_limited') {
      const quota = asRecord(record.quota);
      const limit = quota ? optNum(quota.limit) : undefined;
      return { kind: 'sub2api-quota', remaining, ...(limit === undefined ? {} : { limit }) };
    }
    const subscription = asRecord(record.subscription);
    if (subscription) {
      return { kind: 'sub2api-subscription', remaining, windows: subscriptionWindows(subscription) };
    }
    return { kind: 'sub2api-wallet', remaining };
  }

  if ('is_active' in record || 'remaining' in record) {
    if (record.is_active === false) throw new Error('令牌已停用');
    const remaining = num(record.remaining, 'remaining');
    const unit = typeof record.unit === 'string' && record.unit ? record.unit : 'USD';
    return { kind: 'onehub', remaining, unit };
  }

  throw new Error('/v1/usage 响应形态无法识别');
}

/** sub2api 订阅限额：daily/weekly/monthly 各自 `{used, cap}`，缺限额的周期视为不存在。 */
function subscriptionWindows(subscription: Record<string, unknown>): SubscriptionWindows {
  const windows: SubscriptionWindows = {};
  const pairs: [keyof SubscriptionWindows, string, string][] = [
    ['daily', 'daily_usage_usd', 'daily_limit_usd'],
    ['weekly', 'weekly_usage_usd', 'weekly_limit_usd'],
    ['monthly', 'monthly_usage_usd', 'monthly_limit_usd'],
  ];
  for (const [slot, usedKey, capKey] of pairs) {
    const used = optNum(subscription[usedKey]);
    const cap = optNum(subscription[capKey]);
    // 两个都在才算一个窗口：只有已用没有额度、或反过来，都说明该周期不限（不是 0 额度）
    if (used === undefined || cap === undefined || cap <= 0) continue;
    const resetsAt = typeof subscription.expires_at === 'string' ? subscription.expires_at : undefined;
    windows[slot] = {
      percent: usedPercent(used, cap),
      capUsd: cap,
      ...(resetsAt === undefined ? {} : { resetsAt }),
    };
  }
  return windows;
}

/**
 * 解析 `GET /v1/dashboard/billing/subscription` + `/usage`（one-hub 与 new-api 共用的老接口）。
 *
 * 语义：`hard_limit_usd` 是**总额**（剩余 + 已用），`total_usage` 是**已用但单位是美分** ——
 * 两个站都是 `amount * 100` 吐出来的（见 one-hub `controller/billing.go` 的 `GetUsage`）。
 * 所以 `remaining = hard - total_usage / 100`。
 *
 * new-api 的 `QuotaDisplayType` 可能是 CNY 或 TOKENS：字段名仍是 `*_usd`，值是换算后的数。
 * 相减仍然自洽（同一套单位），但**不是美元** —— 因此这里只用它算百分比与金额，不标币种谎报。
 */
export function parseBillingPair(subscription: unknown, usage: unknown): { remaining: number; limit?: number } {
  const sub = asRecord(subscription);
  if (!sub) throw new Error('billing subscription 响应不是对象');
  const limit = optNum(sub.hard_limit_usd) ?? optNum(sub.soft_limit_usd);
  if (limit === undefined) throw new Error('billing subscription 缺少 hard_limit_usd');
  const usedBody = asRecord(usage);
  const usedCents = usedBody ? optNum(usedBody.total_usage) : undefined;
  const remaining = usedCents === undefined ? limit : limit - usedCents / 100;
  return { remaining, limit };
}

/**
 * 解析 `GET /api/usage/token/`（new-api 令牌级明细）。
 *
 * 响应：`{code:true, data:{total_granted, total_used, total_available, unlimited_quota, ...}}`。
 * `unlimited_quota:true` 时 `total_granted` 是 0（额度无穷），没有百分比语义 → 抛错。
 */
export function parseNewApiTokenUsage(body: unknown): { remaining: number; limit?: number } {
  const record = asRecord(body);
  if (!record) throw new Error('/api/usage/token 响应不是对象');
  const data = asRecord(record.data);
  if (!data) throw new Error('/api/usage/token 缺少 data');
  if (data.unlimited_quota === true) throw new Error('该令牌没有额度限制');
  const remaining = num(data.total_available, 'total_available');
  const limit = optNum(data.total_granted);
  return { remaining, ...(limit !== undefined && limit > 0 ? { limit } : {}) };
}

/* ------------------------------ 取数编排 ------------------------------ */

/** 探测链的最后一档结果：直接给出「已用百分比 + 金额」这一层。 */
interface QuotaReading {
  remaining: number;
  /** 总额；缺省 = 拿不到基准（气泡只剩金额，不播档位动画） */
  limit?: number;
  /** 币种；`undefined` = 站点没明确，按 USD 渲染（金额是站点自己的展示口径） */
  currency?: string;
  /** 订阅窗口（只有 sub2api 订阅模式有） */
  windows?: SubscriptionWindows;
}

/**
 * 依次试三档端点，返回第一个成功且能认出的读数。
 *
 * 每一档的失败都记进 `reasons`，全失败时合并成一条错误 —— 排障时能直接看出「哪几档都没通」，
 * 而不是只看到最后一档的报错。
 */
export async function readQuota(root: string, key: string, doFetch: typeof fetch): Promise<QuotaReading> {
  const reasons: string[] = [];

  // ① /v1/usage
  try {
    const { body, status } = await requestJson(root + '/v1/usage', key, doFetch);
    if (status !== 404 && status !== 405) {
      const reading = readingFromUsageShape(parseUsageBody(body));
      return await withLimitIfMissing(reading, root, key, doFetch);
    }
    reasons.push('/v1/usage 不存在');
  } catch (error) {
    reasons.push('/v1/usage: ' + describe(error));
  }

  // ② billing 双接口（one-hub / new-api）
  try {
    const sub = await requestJson(root + '/v1/dashboard/billing/subscription', key, doFetch);
    if (sub.status !== 404 && sub.status !== 405) {
      const usage = await requestJson(root + '/v1/dashboard/billing/usage', key, doFetch);
      const parsed = parseBillingPair(sub.body, usage.body);
      return { remaining: parsed.remaining, ...(parsed.limit === undefined ? {} : { limit: parsed.limit }) };
    }
    reasons.push('billing 接口不存在');
  } catch (error) {
    reasons.push('billing: ' + describe(error));
  }

  // ③ /api/usage/token/（new-api）
  try {
    const { body, status } = await requestJson(root + '/api/usage/token/', key, doFetch);
    if (status !== 404 && status !== 405) {
      const parsed = parseNewApiTokenUsage(body);
      return { remaining: parsed.remaining, ...(parsed.limit === undefined ? {} : { limit: parsed.limit }) };
    }
    reasons.push('/api/usage/token 不存在');
  } catch (error) {
    reasons.push('/api/usage/token: ' + describe(error));
  }

  throw new Error('该站点未提供可用的余额接口（' + reasons.join('；') + '）');
}

/**
 * `/v1/usage` 只给「剩余」，不给「总额」—— 而 dsh-pet 的 money 档位要靠 `fullBalance` 折算
 * 已用百分比。one-hub 与 new-api 的 `hard_limit_usd` 恰好就是总额（剩余 + 已用），所以补一次。
 *
 * **失败不致命**：拿不到总额就当作「没有基准」，气泡仍显示金额（只是不播档位动画、自动轮询不弹）。
 * 订阅窗口（sub2api）本身带 cap，不需要这一步。
 */
async function withLimitIfMissing(
  reading: QuotaReading,
  root: string,
  key: string,
  doFetch: typeof fetch,
): Promise<QuotaReading> {
  if (reading.limit !== undefined) return reading;
  if (reading.windows) return reading; // 窗口自带 cap
  try {
    const sub = await requestJson(root + '/v1/dashboard/billing/subscription', key, doFetch);
    if (sub.status === 404 || sub.status === 405) return reading;
    const limit = optNum(asRecord(sub.body)?.hard_limit_usd) ?? optNum(asRecord(sub.body)?.soft_limit_usd);
    return limit === undefined || limit <= 0 ? reading : { ...reading, limit };
  } catch {
    return reading;
  }
}

function readingFromUsageShape(shape: UsageShape): QuotaReading {
  switch (shape.kind) {
    case 'onehub':
      return {
        remaining: shape.remaining,
        // unit 为 'quota' 表示站点关掉了「以货币显示」：数值是原始额度，不能标成美元
        ...(shape.unit === 'USD' ? { currency: 'USD' } : {}),
      };
    case 'sub2api-quota':
      return {
        remaining: shape.remaining,
        currency: 'USD',
        ...(shape.limit === undefined ? {} : { limit: shape.limit }),
      };
    case 'sub2api-wallet':
      return { remaining: shape.remaining, currency: 'USD' };
    case 'sub2api-subscription':
      return {
        remaining: shape.remaining,
        currency: 'USD',
        windows: shape.windows,
      };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------ wire 形状 ------------------------------ */

/**
 * 读数 → dsh-pet 的三种 wire 形状之一。
 *
 * - **windows**：只有拿到「日/周/月」三窗口齐全的订阅读数才走（sub2api 订阅模式）。
 *   `monthly` 是 dsh-pet 的硬性底线，缺一个就不能走这个形态 —— 硬凑一个 0 会让百分比算错。
 * - **money**：有币种（USD）时走。**必须带 `fullBalance`**，否则 dsh-pet 算不出已用百分比，
 *   自动轮询就不会弹气泡（手动「查看余额」仍会弹，因为 manual 无条件放行）。
 * - **points**：站点未以货币显示（one-hub `unit:'quota'`）时走 —— 原样显示数字，不套货币符号。
 *
 * `granted` / `toppedUp` 刻意不填：这三家都不区分充值/赠送，编一个就是在 wire 上写假数据。
 */
export function buildBalance(provider: string, reading: QuotaReading): BalanceWire {
  const windows = reading.windows;
  if (windows && windows.daily && windows.weekly && windows.monthly) {
    return {
      ok: true,
      provider,
      shape: 'windows',
      data: {
        // sub2api 的「滚动窗」就是日窗：时长由数据带出，展示层不写死
        rolling: windows.daily.percent,
        weekly: windows.weekly.percent,
        monthly: windows.monthly.percent,
        rollingLabel: '1d',
        rollingCapUsd: windows.daily.capUsd,
        weeklyCapUsd: windows.weekly.capUsd,
        monthlyCapUsd: windows.monthly.capUsd,
        ...(windows.daily.resetsAt === undefined ? {} : { rollingResetsAt: windows.daily.resetsAt }),
        ...(windows.weekly.resetsAt === undefined ? {} : { weeklyResetsAt: windows.weekly.resetsAt }),
        ...(windows.monthly.resetsAt === undefined ? {} : { monthlyResetsAt: windows.monthly.resetsAt }),
      },
    };
  }

  if (reading.currency !== 'USD') {
    return {
      ok: true,
      provider,
      shape: 'points',
      data: {
        unit: '额度',
        total: formatAmount(reading.remaining),
        ...(reading.limit === undefined ? {} : { full: formatAmount(reading.limit) }),
      },
    };
  }

  return {
    ok: true,
    provider,
    shape: 'money',
    data: {
      wallets: [
        {
          currency: 'USD',
          total: formatAmount(reading.remaining),
          ...(reading.limit === undefined ? {} : { fullBalance: formatAmount(reading.limit) }),
        },
      ],
    },
  };
}

/** 金额统一两位小数：站点给的是长精度串（如 `9.9902690000000000`），直接显示会很难看。 */
function formatAmount(value: number): string {
  return value.toFixed(2);
}

/* ------------------------------ 对外入口 ------------------------------ */

/** 完整一次查询：解析地址与密钥 → 探测链 → wire 形状。 */
export async function fetchBalance(
  provider: string,
  target: BalanceTarget,
  key: string,
  doFetch: typeof fetch = fetch,
): Promise<BalanceWire> {
  if (!target.baseURL) throw new Error('该档案还没有配置地址（' + target.id + '）');
  if (!key) throw new Error('缺少凭证 ' + target.apiKeyRef);
  return buildBalance(provider, await readQuota(apiRoot(target.baseURL), key, doFetch));
}

/**
 * 把余额桥挂到 dsh-pet 上。
 *
 * dsh-pet 是**独立插件**：服务不在场就静默跳过，绝不让本插件因为「没装宠物」而挂载失败。
 *
 * 时机：bundle 层里 dsh-pet 排在本插件之前，通常 apply() 时它已 provide；但层序 ≠ 激活顺序，
 * 所以再挂一条 `ctx.inject(['petApi7340'])` 局部等待兜底 —— 与 dsh-whale-widget 处理 webServer
 * 的写法同源，且不阻塞 apply() 的其余部分。
 *
 * 幂等：两条路径都命中时只挂一次（重复 register 会抛「该服务商 id 已被注册」）。
 *
 * @returns 注销函数（供 ctx.effect 在插件卸载时清理）
 */
export function bindPetBalance(
  ctx: any,
  targets: () => BalanceTarget[],
  resolveKey: (ref: string) => Promise<string>,
  doFetch: typeof fetch = fetch,
): () => void {
  let dispose: (() => void) | undefined;

  const attach = (service: unknown): void => {
    if (dispose) return;
    // 服务形状是 `{ balance: { register, list } }` —— 注册表挂在下层，不是服务本身
    const pet = service as PetService | undefined;
    const registry = pet?.balance;
    if (!registry || typeof registry.register !== 'function') return;
    try {
      const disposers = targets().map((target) =>
        registry.register({
          id: target.id,
          // key 每次调用现取：用户刚在面板里换了密钥，下一次「查看余额」就该用新的。
          fetch: async ({ provider }) => fetchBalance(provider, target, await resolveKey(target.apiKeyRef), doFetch),
        }),
      );
      dispose = () => {
        for (const d of disposers) {
          try {
            d();
          } catch {
            // 注销失败不影响其余：dsh-pet 侧已按 id 清理
          }
        }
      };
    } catch {
      // 服务商 id 冲突等：说明已经挂过，保持现状
    }
  };

  try {
    attach(typeof ctx?.get === 'function' ? ctx.get('petApi7340', false) : undefined);
  } catch {
    // 宿主没有该服务：走下面的局部等待
  }

  // 兜底：服务晚于本插件激活时，局部等待一次。
  // `ctx.inject` 与 `ctx.get` 一样可能不在场（老宿主 / 严格的 ctx 代理直接抛），所以整段包 try。
  if (!dispose) {
    try {
      const inject = typeof ctx?.inject === 'function' ? ctx.inject.bind(ctx) : undefined;
      if (inject) {
        inject(['petApi7340'], (child: any) => {
          attach(child.get('petApi7340', false));
        });
      }
    } catch {
      // 宿主没有 ctx.inject：余额桥静默缺席，其余功能不受影响
    }
  }

  return () => {
    dispose?.();
    dispose = undefined;
  };
}
