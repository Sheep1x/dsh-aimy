// 底部余额条 host 侧单测：模板取值 / 优先级回落 / 缓存策略。
//
// 全部喂真实报文形状 + 假 fetch，不打网络。重点验证三件容易写错的事：
//   1. 配了模板就只用模板（失败也不静默回落到内置链而假装成功）；
//   2. 模板取值支持 path 与 script 两种写法，且错误能说清是哪种错；
//   3. 缓存失败时保留旧读数（底部条常驻，不能因为一次抖动变空白）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  BALANCE_CACHE_TTL_MS,
  BalanceCache,
  cacheKeyFor,
  extractAmount,
  readBalanceView,
  readPath,
  viewFromReading,
} = await import('../lib/index.js');

const ROOT = 'https://relay.example.com';
const KEY = 'sk-test-0123456789abcdef';

/** 造一个按 URL 应答的假 fetch；未列出的路径一律 404。 */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
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

describe('余额模板取值', () => {
  it('readPath 支持点号与下标，缺失段返回 undefined 而不抛错', () => {
    const body = { data: { wallets: [{ total: 7.5 }] }, nested: { a: { b: 1 } } };
    assert.equal(readPath(body, 'data.wallets[0].total'), 7.5);
    assert.equal(readPath(body, 'data.wallets.0.total'), 7.5);
    assert.equal(readPath(body, 'nested.a.b'), 1);
    assert.equal(readPath(body, 'nested.missing.deep'), undefined);
    assert.equal(readPath(body, ''), body);
    assert.equal(readPath(null, 'a.b'), undefined);
  });

  it('path 取到字符串数字也认（站点常把金额写成字符串）', () => {
    const out = extractAmount({ data: { balance: '12.34' } }, { path: 'data.balance', currency: 'USD' });
    assert.deepEqual(out, { balance: 12.34, currency: 'USD' });
  });

  it('script 写法与 CCswitch 的 extract(data) 等价，可返回数字或对象', () => {
    const asNumber = extractAmount({ quota: 500000 }, { script: 'return data.quota / 500000;' });
    assert.equal(asNumber.balance, 1);

    const asObject = extractAmount(
      { remaining: 3, unit: 'CNY' },
      { script: 'return { balance: helpers.num(data.remaining), currency: data.unit };' },
    );
    assert.deepEqual(asObject, { balance: 3, currency: 'CNY' });

    // helpers.pick 就是 readPath
    const viaPick = extractAmount({ a: { b: 9 } }, { script: 'return helpers.pick(data, "a.b");' });
    assert.equal(viaPick.balance, 9);
  });

  it('script 优先于 path（两个都写时）', () => {
    const out = extractAmount({ x: 1, y: 2 }, { path: 'x', script: 'return data.y;' });
    assert.equal(out.balance, 2);
  });

  it('取值失败时错误文案指出是哪种写法出的问题', () => {
    assert.throws(() => extractAmount({}, {}), /缺少 path 或 script/);
    assert.throws(() => extractAmount({ a: 1 }, { path: 'b.c' }), /模板路径 b\.c 没有取到数字/);
    assert.throws(() => extractAmount({}, { script: 'return nope();' }), /模板脚本执行失败/);
    assert.throws(() => extractAmount({}, { script: 'return (' }), /模板脚本语法错误/);
    assert.throws(() => extractAmount({}, { script: 'return "abc";' }), /须返回数字或 \{balance, currency\}/);
  });
});

describe('余额读数：模板优先，失败回落内置链', () => {
  it('模板成功时只打模板那一个地址，不再碰内置三档', async () => {
    const doFetch = fakeFetch({
      '/custom/balance': { data: { credit: 42.5, currency: 'USD' } },
    });
    const result = await readBalanceView(
      ROOT,
      KEY,
      doFetch,
      { url: '/custom/balance', path: 'data.credit', currency: 'USD' },
    );
    assert.equal(result.ok, true);
    assert.equal(result.view.amount, 42.5);
    assert.equal(result.view.currency, 'USD');
    assert.equal(result.view.source, 'template');
    assert.equal(doFetch.calls.length, 1);
    assert.equal(doFetch.calls[0].headers.Authorization, 'Bearer ' + KEY);
  });

  it('模板相对路径自动拼到站点根；{baseURL} 占位也支持', async () => {
    const doFetch = fakeFetch({ '/x/y': { total: 1 } });
    await readBalanceView(ROOT, KEY, doFetch, { url: 'x/y', path: 'total' });
    assert.equal(doFetch.calls[0].url, ROOT + '/x/y');
  });

  it('模板里的 {apiKey} 占位会被替换，且没写 Authorization 时自动补 Bearer', async () => {
    const doFetch = fakeFetch({ '/q': { ok: 1 } });
    await readBalanceView(ROOT, KEY, doFetch, { url: '/q?k={apiKey}', path: 'ok' });
    assert.match(doFetch.calls[0].url, /k=sk-test-0123456789abcdef/);
    assert.equal(doFetch.calls[0].headers.Authorization, 'Bearer ' + KEY);
  });

  it('模板自带 Authorization 时不被 Bearer 覆盖', async () => {
    const doFetch = fakeFetch({ '/q': { ok: 1 } });
    await readBalanceView(ROOT, KEY, doFetch, {
      url: '/q',
      headers: { authorization: 'Token abc' },
      path: 'ok',
    });
    const sent = doFetch.calls[0].headers;
    const authNames = Object.keys(sent).filter((n) => n.toLowerCase() === 'authorization');
    assert.equal(sent[authNames[0]], 'Token abc');
  });

  it('模板失败时回落到内置链，并真的读到了站点的 /v1/usage', async () => {
    const doFetch = fakeFetch({
      '/custom/balance': () => new Response('boom', { status: 500 }),
      '/v1/usage': { is_active: true, remaining: 12.5, unit: 'USD' },
    });
    const result = await readBalanceView(ROOT, KEY, doFetch, { url: '/custom/balance', path: 'data' });
    assert.equal(result.ok, true);
    assert.equal(result.view.amount, 12.5);
    assert.equal(result.view.source, 'usage');
  });

  it('两边都失败时把两条原因都写出来，不伪造 0 余额', async () => {
    const doFetch = fakeFetch({ '/custom/balance': () => new Response('boom', { status: 500 }) });
    const result = await readBalanceView(ROOT, KEY, doFetch, { url: '/custom/balance', path: 'data' });
    assert.equal(result.ok, false);
    assert.match(result.error, /模板：/);
    assert.match(result.error, /内置探测：/);
  });

  it('错误文案里出现密钥时打码', async () => {
    const doFetch = async (url) => {
      throw new Error('failed to fetch ' + String(url));
    };
    const result = await readBalanceView(ROOT, KEY, doFetch, { url: '/q?k={apiKey}', path: 'ok' });
    assert.equal(result.ok, false);
    assert.equal(result.error.includes(KEY), false);
    assert.match(result.error, /\*\*\*/);
  });
});

describe('读数换算成界面形状', () => {
  it('有 monthly 窗口时直接用它的百分比', () => {
    const view = viewFromReading(
      { remaining: 12.5, currency: 'USD', limit: 50, windows: { monthly: { percent: 75 } }, source: 'usage' },
      '2026-11-20T00:00:00.000Z',
    );
    assert.equal(view.amount, 12.5);
    assert.equal(view.limit, 50);
    assert.equal(view.usedPercent, 75);
    assert.equal(view.source, 'usage');
  });

  it('没有窗口时按 (limit - remaining) / limit 反算已用', () => {
    const view = viewFromReading({ remaining: 25, limit: 100, source: 'billing' }, '2026-11-20T00:00:00.000Z');
    assert.equal(view.usedPercent, 75);
  });

  it('没有 limit 时不编造百分比', () => {
    const view = viewFromReading({ remaining: 9, source: 'usage' }, '2026-11-20T00:00:00.000Z');
    assert.equal(view.usedPercent, undefined);
    assert.equal(view.limit, undefined);
    assert.equal(view.currency, undefined);
  });

  it('剩余多于额度时百分比夹在 0（不出现负数）', () => {
    const view = viewFromReading({ remaining: 120, limit: 100, source: 'billing' }, '2026-11-20T00:00:00.000Z');
    assert.equal(view.usedPercent, 0);
  });
});

describe('余额缓存', () => {
  it('新鲜期内不重复打站点', () => {
    let now = 1_000_000;
    const cache = new BalanceCache(() => now);
    const view = { amount: 1, source: 'usage', fetchedAt: 'now' };
    cache.set('k', view);
    assert.equal(cache.fresh('k').view, view);
    now += BALANCE_CACHE_TTL_MS - 1;
    assert.equal(cache.fresh('k').view, view);
    now += 2;
    assert.equal(cache.fresh('k'), undefined);
  });

  it('失败保留上次成功读数，只挂错误（并有 viewAt 记录旧数字的时间）', () => {
    let now = 5_000;
    const cache = new BalanceCache(() => now);
    cache.set('k', { amount: 8, source: 'usage', fetchedAt: 'old' });
    now += 10;
    cache.fail('k', '站点 502');
    const entry = cache.peek('k');
    assert.equal(entry.view.amount, 8);
    assert.equal(entry.error, '站点 502');
    assert.equal(entry.viewAt, 5_000);
    // 有错误时不算新鲜：下一次要真的重试
    assert.equal(cache.fresh('k'), undefined);
  });

  it('从没成功过的键失败后 view 为 null', () => {
    const cache = new BalanceCache(() => 1);
    cache.fail('k', '挂了');
    assert.equal(cache.peek('k').view, null);
    assert.equal(cache.peek('k').viewAt, undefined);
  });

  it('后台刷新去重：同一键同时只允许一个在跑', () => {
    const cache = new BalanceCache(() => 1);
    assert.equal(cache.beginRefresh('k'), true);
    assert.equal(cache.beginRefresh('k'), false);
    cache.endRefresh('k');
    assert.equal(cache.beginRefresh('k'), true);
  });

  it('缓存键带上模板：改完模板不会读到旧值', () => {
    assert.notEqual(cacheKeyFor(ROOT, null), cacheKeyFor(ROOT, { url: '/a', path: 'x' }));
    assert.equal(cacheKeyFor(ROOT, { url: '/a' }), cacheKeyFor(ROOT, { url: '/a' }));
  });
});
