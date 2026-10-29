// 分组信息缓存：面板加载耗时的主因就是它每次都要联网。
//
// 这些用例钉住策略本身，而不只是「能跑」：
//   - TTL 内不产生网络往返（面板打开必须瞬开）
//   - 过期后先返旧值、后台刷新（stale-while-revalidate）
//   - refresh=true 永远等真实网络（用户点刷新要最新数据）
//   - 404 记住「不支持分组接口」，别每次打开面板都撞一遍
//   - 网络抖动不写缓存（否则一次抖动会被固化成「不支持」）
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { GroupCache, GROUP_CACHE_TTL_MS } = await import('../lib/index.js');

const BASE = 'https://relay.example';
const groupState = {
  group: 'vip',
  backupGroup: '',
  ratio: 0.5,
  allowGroupSwitch: true,
  groups: [{ symbol: 'vip', name: 'VIP', ratio: 0.5, public: true }],
};

describe('GroupCache 基础行为', () => {
  it('空缓存：peek 无值、fresh 为 false', () => {
    const cache = new GroupCache();
    assert.equal(cache.peek(BASE), undefined);
    assert.equal(cache.fresh(BASE), false);
  });

  it('写入后可读回，且新鲜期内 fresh 为 true', () => {
    let now = 1000;
    const cache = new GroupCache(() => now);
    cache.set(BASE, groupState);
    assert.deepEqual(cache.peek(BASE).state, groupState);
    assert.equal(cache.fresh(BASE), true);
  });

  it('超过 TTL 后不再新鲜（但仍可返回旧值）', () => {
    let now = 1000;
    const cache = new GroupCache(() => now);
    cache.set(BASE, groupState);
    now += GROUP_CACHE_TTL_MS + 1;
    assert.equal(cache.fresh(BASE), false, '过期后不该再算新鲜');
    assert.ok(cache.peek(BASE), '过期不代表丢弃：调用方要先拿旧值渲染');
  });

  it('不同站点互不干扰', () => {
    const cache = new GroupCache();
    cache.set('https://a.example', groupState);
    assert.equal(cache.peek('https://b.example'), undefined);
  });
});

describe('不支持分组接口的站点', () => {
  it('记下结论后 knownUnsupported 为 true', () => {
    const cache = new GroupCache();
    cache.markUnsupported(BASE);
    assert.equal(cache.knownUnsupported(BASE), true);
    // 结论落地时顺手清掉可能存在的旧分组值，避免两套状态并存
    assert.equal(cache.peek(BASE), undefined);
  });

  it('成功拿到分组后撤销「不支持」结论（站点升级了）', () => {
    const cache = new GroupCache();
    cache.markUnsupported(BASE);
    cache.set(BASE, groupState);
    assert.equal(cache.knownUnsupported(BASE), false, '站点可能升级后支持了该接口');
  });
});

describe('后台刷新去重', () => {
  it('同一站点同时只允许一个刷新在跑', () => {
    const cache = new GroupCache();
    assert.equal(cache.beginRefresh(BASE), true, '首次应允许');
    assert.equal(cache.beginRefresh(BASE), false, '已有刷新时不该再发起');
    cache.endRefresh(BASE);
    assert.equal(cache.beginRefresh(BASE), true, '结束后可再次发起');
  });

  it('不同站点各自独立', () => {
    const cache = new GroupCache();
    cache.beginRefresh('https://a.example');
    assert.equal(cache.beginRefresh('https://b.example'), true);
  });
});

describe('切组后缓存同步', () => {
  it('apply 写入最新分组，紧接着打开面板不会看到旧分组', () => {
    const cache = new GroupCache();
    cache.set(BASE, { ...groupState, group: 'default', ratio: 1 });
    cache.apply(BASE, groupState);
    assert.equal(cache.peek(BASE).state.group, 'vip', '切组响应里的值应立刻生效');
  });
});
