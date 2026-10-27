// 余额桥单测：三站形态识别 + 探测链 + 三种 wire 形状 + 注册幂等。
//
// 全部喂**真实报文形状**（照 one-hub / new-api / sub2api 的控制器源码抄的），
// 不打网络：fetch 一律注入假实现。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  bindPetBalance,
  buildBalance,
  fetchBalance,
  parseBillingPair,
  parseNewApiTokenUsage,
  parseUsageBody,
  readQuota,
} = await import('../lib/index.js');

/** 造一个按 URL 应答的假 fetch；未列出的路径一律 404。 */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), auth: init.headers?.Authorization });
    const path = new URL(String(url)).pathname;
    const hit = routes[path];
    if (hit === undefined) {
      return new Response(JSON.stringify({ error: { message: 'not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (typeof hit === 'function') return hit();
    return new Response(JSON.stringify(hit), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  impl.calls = calls;
  return impl;
}

const ROOT = 'https://relay.example.com';
const TARGET = { id: 'onehub', baseURL: ROOT, apiKeyRef: 'ONEHUB_API_KEY' };

/** sub2api 订阅模式的一份真实形状 */
const SUB2API_SUBSCRIPTION = {
  mode: 'unrestricted',
  isValid: true,
  planName: 'Pro',
  unit: 'USD',
  remaining: 12.5,
  subscription: {
    daily_usage_usd: 2,
    weekly_usage_usd: 10,
    monthly_usage_usd: 40,
    daily_limit_usd: 5,
    weekly_limit_usd: 20,
    monthly_limit_usd: 50,
    weekly_window_start: '2026-10-20T00:00:00Z',
    expires_at: '2026-11-20T00:00:00Z',
  },
};

describe('parseUsageBody：/v1/usage 的三种形态', () => {
  it('one-hub 扁平形态：USD', () => {
    const shape = parseUsageBody({ is_active: true, remaining: 150.054336, unit: 'USD' });
    assert.deepEqual(shape, { kind: 'onehub', remaining: 150.054336, unit: 'USD' });
  });

  it('one-hub 关掉货币显示：unit=quota 原样保留', () => {
    const shape = parseUsageBody({ is_active: true, remaining: 750000, unit: 'quota' });
    assert.equal(shape.kind, 'onehub');
    assert.equal(shape.unit, 'quota');
  });

  it('one-hub 令牌停用 → 抛错', () => {
    assert.throws(() => parseUsageBody({ is_active: false, remaining: 1, unit: 'USD' }), /令牌已停用/);
  });

  it('one-hub 缺 remaining → 抛错（不静默当 0）', () => {
    assert.throws(() => parseUsageBody({ is_active: true, unit: 'USD' }), /非法字段 remaining/);
  });

  it('sub2api quota_limited：带总额度', () => {
    const shape = parseUsageBody({
      mode: 'quota_limited',
      isValid: true,
      status: 'active',
      quota: { limit: 100, used: 40, remaining: 60, unit: 'USD' },
      remaining: 60,
      unit: 'USD',
    });
    assert.deepEqual(shape, { kind: 'sub2api-quota', remaining: 60, limit: 100 });
  });

  it('sub2api quota_limited：没有 quota 块时不给 limit', () => {
    const shape = parseUsageBody({ mode: 'quota_limited', remaining: 5 });
    assert.deepEqual(shape, { kind: 'sub2api-quota', remaining: 5 });
  });

  it('sub2api 钱包模式', () => {
    const shape = parseUsageBody({
      mode: 'unrestricted',
      isValid: true,
      planName: '钱包余额',
      remaining: 30.5,
      unit: 'USD',
      balance: 30.5,
    });
    assert.deepEqual(shape, { kind: 'sub2api-wallet', remaining: 30.5 });
  });

  it('sub2api 订阅模式：日/周/月三窗折算成已用百分比', () => {
    const shape = parseUsageBody(SUB2API_SUBSCRIPTION);
    assert.equal(shape.kind, 'sub2api-subscription');
    assert.equal(shape.windows.daily.percent, 40); // 2/5
    assert.equal(shape.windows.weekly.percent, 50); // 10/20
    assert.equal(shape.windows.monthly.percent, 80); // 40/50
    assert.equal(shape.windows.monthly.capUsd, 50);
    assert.equal(shape.windows.monthly.resetsAt, '2026-11-20T00:00:00Z');
  });

  it('sub2api 订阅模式：只配月限额时只出一个窗口', () => {
    const shape = parseUsageBody({
      mode: 'unrestricted',
      remaining: 3,
      subscription: { monthly_usage_usd: 1, monthly_limit_usd: 4 },
    });
    assert.equal(shape.kind, 'sub2api-subscription');
    assert.deepEqual(Object.keys(shape.windows), ['monthly']);
    assert.equal(shape.windows.monthly.percent, 25);
  });

  it('sub2api 的无限制哨兵 -1 → 抛错（那不是金额）', () => {
    assert.throws(() => parseUsageBody({ mode: 'unrestricted', remaining: -1 }), /没有额度限制/);
  });

  it('认不出的形态 → 抛错，交给探测链下一档', () => {
    assert.throws(() => parseUsageBody({ hello: 'world' }), /形态无法识别/);
    assert.throws(() => parseUsageBody(null), /不是对象/);
  });
});

describe('parseBillingPair：one-hub / new-api 的 dashboard 双接口', () => {
  it('总额 - 已用（美分）= 剩余', () => {
    const parsed = parseBillingPair({ hard_limit_usd: 402.53 }, { total_usage: 25247.5664 });
    assert.equal(parsed.limit, 402.53);
    assert.ok(Math.abs(parsed.remaining - (402.53 - 252.475664)) < 1e-9);
  });

  it('usage 缺失时退化为「全额未消耗」', () => {
    const parsed = parseBillingPair({ hard_limit_usd: 10 }, undefined);
    assert.equal(parsed.remaining, 10);
  });

  it('缺 hard_limit_usd 时回落 soft_limit_usd', () => {
    assert.equal(parseBillingPair({ soft_limit_usd: 7 }, { total_usage: 0 }).limit, 7);
  });

  it('两个额度字段都没有 → 抛错', () => {
    assert.throws(() => parseBillingPair({ object: 'billing_subscription' }, {}), /缺少 hard_limit_usd/);
  });
});

describe('parseNewApiTokenUsage：/api/usage/token/', () => {
  it('令牌级明细', () => {
    const parsed = parseNewApiTokenUsage({
      code: true,
      message: 'ok',
      data: { total_granted: 500000, total_used: 120000, total_available: 380000, unlimited_quota: false },
    });
    assert.equal(parsed.remaining, 380000);
    assert.equal(parsed.limit, 500000);
  });

  it('unlimited_quota → 抛错（没有百分比语义）', () => {
    assert.throws(
      () => parseNewApiTokenUsage({ code: true, data: { total_available: 0, unlimited_quota: true } }),
      /没有额度限制/,
    );
  });

  it('缺 data → 抛错', () => {
    assert.throws(() => parseNewApiTokenUsage({ code: true }), /缺少 data/);
  });
});

describe('readQuota：探测链', () => {
  it('① /v1/usage 命中后仍补取 hard_limit_usd（否则档位动画不播）', async () => {
    const f = fakeFetch({
      '/v1/usage': { is_active: true, remaining: 149.6, unit: 'USD' },
      '/v1/dashboard/billing/subscription': { hard_limit_usd: 402.53 },
    });
    const reading = await readQuota(ROOT, 'sk-1', f);
    assert.equal(reading.remaining, 149.6);
    assert.equal(reading.currency, 'USD');
    assert.equal(reading.limit, 402.53);
    // 只补 subscription，不必再打 usage（总额已在 subscription 里）
    assert.deepEqual(
      f.calls.map((c) => new URL(c.url).pathname),
      ['/v1/usage', '/v1/dashboard/billing/subscription'],
    );
  });

  it('① 命中但站点没有 billing 接口 → 仍然成功，只是没有基准', async () => {
    const f = fakeFetch({ '/v1/usage': { is_active: true, remaining: 9, unit: 'USD' } });
    const reading = await readQuota(ROOT, 'sk-1', f);
    assert.equal(reading.remaining, 9);
    assert.equal(reading.limit, undefined);
  });

  it('/v1/usage 404 → ② 用 billing 双接口', async () => {
    const f = fakeFetch({
      '/v1/dashboard/billing/subscription': { hard_limit_usd: 20 },
      '/v1/dashboard/billing/usage': { total_usage: 500 },
    });
    const reading = await readQuota(ROOT, 'sk-1', f);
    assert.equal(reading.remaining, 15);
    assert.equal(reading.limit, 20);
  });

  it('前两档都没有 → ③ /api/usage/token/', async () => {
    const f = fakeFetch({
      '/api/usage/token/': {
        code: true,
        data: { total_granted: 100, total_used: 25, total_available: 75, unlimited_quota: false },
      },
    });
    const reading = await readQuota(ROOT, 'sk-1', f);
    assert.equal(reading.remaining, 75);
    assert.equal(reading.limit, 100);
  });

  it('三档全失败 → 抛错且带上每一档的原因', async () => {
    const f = fakeFetch({});
    await assert.rejects(readQuota(ROOT, 'sk-1', f), (error) => {
      assert.match(error.message, /未提供可用的余额接口/);
      assert.match(error.message, /\/v1\/usage 不存在/);
      assert.match(error.message, /billing 接口不存在/);
      assert.match(error.message, /\/api\/usage\/token 不存在/);
      return true;
    });
  });

  it('one-hub 的 HTTP 200 + success:false 会被识别成失败并落到下一档', async () => {
    const f = fakeFetch({
      '/v1/usage': { success: false, message: '令牌不存在' },
      '/v1/dashboard/billing/subscription': { hard_limit_usd: 10 },
      '/v1/dashboard/billing/usage': { total_usage: 100 },
    });
    const reading = await readQuota(ROOT, 'sk-1', f);
    assert.equal(reading.remaining, 9);
  });
});

describe('buildBalance：三种 wire 形状', () => {
  it('USD 金额 → money，且必须带 fullBalance', () => {
    const wire = buildBalance('onehub', { remaining: 150.054336, limit: 402.53, currency: 'USD' });
    assert.equal(wire.shape, 'money');
    assert.equal(wire.provider, 'onehub');
    assert.deepEqual(wire.data.wallets, [{ currency: 'USD', total: '150.05', fullBalance: '402.53' }]);
  });

  it('拿不到总额 → 仍然 money，但没有 fullBalance（不播档位，也不猜）', () => {
    const wire = buildBalance('onehub', { remaining: 8, currency: 'USD' });
    assert.equal(wire.shape, 'money');
    assert.equal('fullBalance' in wire.data.wallets[0], false);
  });

  it('unit=quota → points（不套货币符号）', () => {
    const wire = buildBalance('onehub', { remaining: 750000 });
    assert.equal(wire.shape, 'points');
    assert.deepEqual(wire.data, { unit: '额度', total: '750000.00' });
  });

  it('日/周/月齐全 → windows', () => {
    const wire = buildBalance('onehub-compat', {
      remaining: 12.5,
      currency: 'USD',
      windows: {
        daily: { percent: 40, capUsd: 5 },
        weekly: { percent: 50, capUsd: 20 },
        monthly: { percent: 80, capUsd: 50, resetsAt: '2026-11-20T00:00:00Z' },
      },
    });
    assert.equal(wire.shape, 'windows');
    assert.equal(wire.data.rolling, 40);
    assert.equal(wire.data.weekly, 50);
    assert.equal(wire.data.monthly, 80);
    assert.equal(wire.data.rollingLabel, '1d');
    assert.equal(wire.data.monthlyResetsAt, '2026-11-20T00:00:00Z');
    // 缺 reset 的窗口不写该键（undefined 键会污染严格比对）
    assert.equal('rollingResetsAt' in wire.data, false);
  });

  it('只有一个窗口 → 不走 windows（月窗是底线，缺了会算错百分比）', () => {
    const wire = buildBalance('onehub-compat', {
      remaining: 3,
      currency: 'USD',
      windows: { monthly: { percent: 25, capUsd: 4 } },
    });
    assert.equal(wire.shape, 'money');
  });
});

describe('fetchBalance：端到端（假 fetch）', () => {
  it('用档案地址发起、带 Bearer 鉴权、末尾斜杠被规整', async () => {
    const f = fakeFetch({ '/v1/usage': { is_active: true, remaining: 1.5, unit: 'USD' } });
    const wire = await fetchBalance('onehub', { ...TARGET, baseURL: ROOT + '/' }, 'sk-abc', f);
    assert.equal(wire.shape, 'money');
    assert.equal(f.calls[0].url, ROOT + '/v1/usage');
    assert.equal(f.calls[0].auth, 'Bearer sk-abc');
  });

  it('地址里误填 /v1 也不会拼成 /v1/v1/usage', async () => {
    const f = fakeFetch({ '/v1/usage': { is_active: true, remaining: 1, unit: 'USD' } });
    await fetchBalance('onehub', { ...TARGET, baseURL: ROOT + '/v1' }, 'sk-abc', f);
    assert.equal(f.calls[0].url, ROOT + '/v1/usage');
  });

  it('没配地址 / 没配密钥 → 明确报错，不发请求', async () => {
    const f = fakeFetch({});
    await assert.rejects(fetchBalance('onehub', { ...TARGET, baseURL: '' }, 'sk-abc', f), /还没有配置地址/);
    await assert.rejects(fetchBalance('onehub', TARGET, '', f), /缺少凭证 ONEHUB_API_KEY/);
    assert.equal(f.calls.length, 0);
  });
});

describe('bindPetBalance：注册与幂等', () => {
  /** 假 dsh-pet：只实现用得到的 register */
  function fakePet() {
    const registered = new Map();
    return {
      api: {
        balance: {
          register(def) {
            if (registered.has(def.id)) throw new Error('该服务商 id 已被注册: ' + def.id);
            registered.set(def.id, def);
            return () => registered.delete(def.id);
          },
          list: () => ({ builtin: [], external: [...registered.keys()] }),
        },
      },
      registered,
    };
  }

  const targets = () => [
    { id: 'onehub', baseURL: ROOT, apiKeyRef: 'ONEHUB_API_KEY' },
    { id: 'onehub-compat', baseURL: ROOT, apiKeyRef: 'ONEHUB_COMPAT_API_KEY' },
  ];
  const resolveKey = async (ref) => (ref === 'ONEHUB_API_KEY' ? 'sk-main' : 'sk-compat');

  it('两条路由都登记，注销后清空', () => {
    const pet = fakePet();
    const ctx = { get: (name) => (name === 'petApi7340' ? pet.api : undefined) };
    const dispose = bindPetBalance(ctx, targets, resolveKey);
    assert.deepEqual([...pet.registered.keys()], ['onehub', 'onehub-compat']);
    dispose();
    assert.equal(pet.registered.size, 0);
  });

  it('注册进去的 fetch 用「自己那条路由」的 id 回填 provider', async () => {
    const pet = fakePet();
    const ctx = { get: () => pet.api };
    const f = fakeFetch({ '/v1/usage': { is_active: true, remaining: 42, unit: 'USD' } });
    const dispose = bindPetBalance(ctx, targets, resolveKey, f);
    try {
      const wire = await pet.registered.get('onehub-compat').fetch({ provider: 'onehub-compat' });
      assert.equal(wire.provider, 'onehub-compat');
      assert.equal(wire.data.wallets[0].total, '42.00');
      // 用的是该档案自己的密钥引用：compat → ONEHUB_COMPAT_API_KEY
      assert.equal(f.calls[0].auth, 'Bearer sk-compat');
    } finally {
      dispose();
    }
  });

  it('没有宠物服务 → 静默跳过，不抛', () => {
    const ctx = { get: () => undefined };
    assert.doesNotThrow(() => bindPetBalance(ctx, targets, resolveKey)());
  });

  it('服务晚到 → 走 ctx.inject 局部等待补挂', () => {
    const pet = fakePet();
    let pending;
    const ctx = {
      get: () => undefined,
      inject(deps, callback) {
        assert.deepEqual(deps, ['petApi7340']);
        pending = callback;
      },
    };
    bindPetBalance(ctx, targets, resolveKey);
    assert.equal(pet.registered.size, 0);
    pending({ get: () => pet.api });
    assert.deepEqual([...pet.registered.keys()], ['onehub', 'onehub-compat']);
  });

  it('重复 attach 只挂一次（否则 dsh-pet 会抛 id 冲突）', () => {
    const pet = fakePet();
    const ctx = {
      get: () => pet.api,
      inject(deps, callback) {
        // 服务已在场 → 不该再走这条兜底
        callback({ get: () => pet.api });
      },
    };
    bindPetBalance(ctx, targets, resolveKey);
    assert.equal(pet.registered.size, 2);
  });
});
