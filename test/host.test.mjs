// host 半侧集成测试：假中转站 + 真路由，验证 state / switch / 降级三条路径。
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEY = 'sk-test-key';

/** 假中转站：支持切组与不支持切组两种形态。 */
function makeRelay({ supportsSwitch }) {
  const state = { group: 'default', log: [] };
  const groups = [
    { symbol: 'default', name: '默认', ratio: 1, public: true },
    { symbol: 'vip', name: 'VIP', ratio: 0.5, public: true },
  ];
  const modelsByGroup = {
    default: ['model-a', 'model-b'],
    vip: ['model-b', 'model-c'],
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const auth = req.headers.authorization ?? '';
    if (auth !== 'Bearer ' + KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '无效的令牌' }));
      return;
    }

    if (url.pathname === '/v1/token/group') {
      if (!supportsSwitch) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'not found' }));
        return;
      }
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: {
          group: state.group, backup_group: '', ratio: groups.find((g) => g.symbol === state.group).ratio,
          allow_group_switch: true, groups,
        } }));
        return;
      }
      if (req.method === 'PUT') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const target = JSON.parse(body || '{}').group;
          const known = groups.some((g) => g.symbol === target);
          if (!known) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: '无效的用户组' }));
            return;
          }
          state.log.push({ from: state.group, to: target });
          state.group = target;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: {
            group: state.group, backup_group: '', ratio: groups.find((g) => g.symbol === state.group).ratio,
            allow_group_switch: true, groups,
          } }));
        });
        return;
      }
    }

    if (url.pathname === '/v1/models') {
      const list = modelsByGroup[state.group] ?? [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: list.map((id) => ({ id, object: 'model' })) }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'not found' }));
  });

  return { server, state };
}

/** 假凭据服务：内存 Map，行为对齐 dsh-credentials 的 describe/resolve/set/unset。 */
function makeFakeCredentials() {
  const store = new Map();
  return {
    store,
    async set(ref, value) {
      store.set(String(ref), value);
    },
    async unset(ref) {
      store.delete(String(ref));
    },
    async resolve(ref) {
      const value = store.get(String(ref));
      return value ? { value, source: 'stored' } : undefined;
    },
    async describe(ref) {
      const value = store.get(String(ref));
      return { configured: Boolean(value), source: value ? 'stored' : undefined, writable: true };
    },
  };
}

/** 最小的 cordis ctx 替身：effect / get / plugin / webServer。 */
function makeCtx(config, options = {}) {
  const disposers = [];
  const childDisposers = [];
  let registered = null;
  const ctx = {
    config,
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
      return () => {};
    },
    get(name, fallback) {
      if (name === 'credentials') return options.credentials ?? fallback;
      if (name === 'agentDefaultModel') return options.agentDefaultModel ?? fallback;
      return fallback;
    },
    plugin(plugin, pluginConfig) {
      const childCtx = { ...ctx, config: pluginConfig };
      const dispose = plugin.apply?.(childCtx, pluginConfig);
      if (typeof dispose === 'function') childDisposers.push(dispose);
      return { dispose: async () => { if (typeof dispose === 'function') await dispose(); } };
    },
    webServer: {
      register(options) {
        registered = options;
        return () => {};
      },
    },
  };
  return {
    ctx,
    getRegistered: () => registered,
    disposeAll: () => [...disposers, ...childDisposers].forEach((d) => d()),
  };
}

/** 用 lib/index.js 的 apply() 挂到本地 HTTP 服务上，模拟 DSH webServer。 */
async function startPlugin(baseURL, dshHome, options = {}) {
  process.env.DSH_HOME = dshHome;
  // 凭据测试：不设环境变量，密钥必须来自凭据库
  if (options.credentials) delete process.env.ONEHUB_API_KEY;
  else process.env.ONEHUB_API_KEY = KEY;
  const plugin = await import('../lib/index.js');

  const adapterUrl = new URL('./fake-adapter.mjs', import.meta.url).href;
  const { ctx, getRegistered } = makeCtx(
    {
      baseURL,
      apiKeyRef: 'ONEHUB_API_KEY',
      providerAdapter: adapterUrl,
    },
    { credentials: options.credentials, agentDefaultModel: options.agentDefaultModel },
  );

  plugin.apply(ctx, ctx.config);
  const registered = getRegistered();
  assert.ok(registered, 'webServer.register 未被调用');

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (!url.startsWith(registered.path)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    void registered.handler(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { base: 'http://127.0.0.1:' + port + registered.path, server };
}

async function json(url, init) {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.json() };
}

describe('dsh-aimy host routes', () => {
  let relay;
  let plugin;
  let dshHome;

  before(async () => {
    dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-'));
    relay = makeRelay({ supportsSwitch: true });
    await new Promise((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    const { port } = relay.server.address();
    plugin = await startPlugin('http://127.0.0.1:' + port, dshHome);
  });

  after(async () => {
    await new Promise((resolve) => plugin.server.close(resolve));
    await new Promise((resolve) => relay.server.close(resolve));
    rmSync(dshHome, { recursive: true, force: true });
  });

  it('GET /state 返回分组与模型目录', async () => {
    const { status, body } = await json(plugin.base + '/state');
    assert.equal(status, 200);
    assert.equal(body.data.connected, true);
    assert.equal(body.data.supportsSwitch, true);
    assert.equal(body.data.token.group, 'default');
    assert.deepEqual(body.data.models.map((m) => m.id), ['model-a', 'model-b']);
  });

  it('POST /switch 真实切组并刷新目录', async () => {
    const { status, body } = await json(plugin.base + '/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'vip' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.state.token.group, 'vip');
    assert.equal(body.data.state.token.ratio, 0.5);
    assert.deepEqual(body.data.state.models.map((m) => m.id), ['model-b', 'model-c']);
    assert.deepEqual(relay.state.log, [{ from: 'default', to: 'vip' }]);
  });

  it('Aimy 预设：preset=true 且不返回地址', async () => {
    const { body } = await json(plugin.base + '/state');
    assert.equal(body.data.profile, 'aimy');
    assert.equal(body.data.preset, true);
    assert.equal(body.data.displayName, 'Aimy-艾米');
    assert.equal(body.data.baseURL, '', '预设档案不应把地址暴露给前端');
    assert.equal(body.data.api, 'openai-completions');
  });

  it('模型路由被挂载：providers 里只有本路由且模型齐全', async () => {
    const adapter = await import('./fake-adapter.mjs');
    const mount = adapter.mounts.find((m) => m && m.onehub);
    assert.ok(mount, '适配器没有被挂载');
    const profile = mount.onehub;
    assert.equal(profile.api, 'openai-completions');
    assert.match(profile.baseURL, /\/v1$/);
    assert.equal(profile.apiKeyEnv, 'ONEHUB_API_KEY');
    assert.deepEqual(profile.models.map((m) => m.id), ['model-a', 'model-b']);
    assert.equal(profile.defaultContextWindow, 131072);
    assert.equal(profile.defaultMaxTokens, 8192);
  });

  it('切组后模型路由被重挂载（先 dispose 再挂新目录）', async () => {
    // 上一个用例已切到 vip；这里切回 default，验证模型不同 → 重挂载
    const adapter = await import('./fake-adapter.mjs');
    const before = adapter.mounts.length;
    const { status, body } = await json(plugin.base + '/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'default' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.state.provider.mounted, true);
    assert.equal(body.data.state.provider.modelCount, 2);

    const after = adapter.mounts.slice(before);
    assert.ok(after.some((m) => m && m.disposed === true), '重挂载前应 dispose 旧 fiber');
    const remount = after.filter((m) => m && m.onehub).pop();
    assert.ok(remount, '没有重挂载');
    assert.deepEqual(remount.onehub.models.map((m) => m.id), ['model-a', 'model-b']);
  });

  it('切到同一分组不触发重挂载（sameModels 短路）', async () => {
    const adapter = await import('./fake-adapter.mjs');
    const before = adapter.mounts.length;
    const { status } = await json(plugin.base + '/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'default' }),
    });
    assert.equal(status, 200);
    assert.equal(adapter.mounts.length, before, '同分组不应重挂载');
  });

  it('切到不存在的分组返回中转站错误', async () => {
    const { status, body } = await json(plugin.base + '/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'nope' }),
    });
    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /无效的用户组/);
  });

  it('空分组被本地拦下', async () => {
    const { status } = await json(plugin.base + '/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: '' }),
    });
    assert.equal(status, 400);
  });
});

describe('旧版中转站（无切组接口）', () => {
  let relay;
  let plugin;
  let dshHome;

  before(async () => {
    dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-old-'));
    relay = makeRelay({ supportsSwitch: false });
    await new Promise((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    const { port } = relay.server.address();
    plugin = await startPlugin('http://127.0.0.1:' + port, dshHome);
  });

  after(async () => {
    await new Promise((resolve) => plugin.server.close(resolve));
    await new Promise((resolve) => relay.server.close(resolve));
    rmSync(dshHome, { recursive: true, force: true });
  });

  it('分组接口缺失时降级为只读，但模型仍可用', async () => {
    const { body } = await json(plugin.base + '/state');
    assert.equal(body.data.supportsSwitch, false);
    assert.equal(body.data.connected, true);
    assert.equal(body.data.token, null);
    assert.deepEqual(body.data.models.map((m) => m.id), ['model-a', 'model-b']);
    assert.equal(body.data.provider.mounted, true);
  });
});

describe('设置页写入密钥（凭据库）', () => {
  let relay;
  let plugin;
  let credentials;
  let dshHome;

  before(async () => {
    dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-cred-'));
    credentials = makeFakeCredentials();
    relay = makeRelay({ supportsSwitch: true });
    await new Promise((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    const { port } = relay.server.address();
    plugin = await startPlugin('http://127.0.0.1:' + port, dshHome, { credentials });
  });

  after(async () => {
    await new Promise((resolve) => plugin.server.close(resolve));
    await new Promise((resolve) => relay.server.close(resolve));
    rmSync(dshHome, { recursive: true, force: true });
  });

  it('未保存密钥时报「未配置」且未挂载路由', async () => {
    const { body } = await json(plugin.base + '/state');
    assert.equal(body.data.credential.configured, false);
    assert.equal(body.data.connected, false);
    assert.equal(body.data.provider, null);
    assert.match(String(body.data.error), /未配置 API Key/);
  });

  it('POST /credentials 保存密钥后立即挂载模型路由', async () => {
    const { status, body } = await json(plugin.base + '/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: KEY }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.credential.configured, true);
    assert.equal(body.data.credential.source, 'stored');
    assert.equal(body.data.connected, true);
    assert.equal(body.data.provider.mounted, true);
    assert.deepEqual(body.data.models.map((m) => m.id), ['model-a', 'model-b']);
    assert.equal(credentials.store.get('ONEHUB_API_KEY'), KEY);
  });

  it('空密钥被拒绝', async () => {
    const { status } = await json(plugin.base + '/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '   ' }),
    });
    assert.equal(status, 400);
  });

  it('DELETE /credentials 清除密钥后回到未配置', async () => {
    const { status, body } = await json(plugin.base + '/credentials', { method: 'DELETE' });
    assert.equal(status, 200);
    assert.equal(body.data.credential.configured, false);
    assert.equal(credentials.store.has('ONEHUB_API_KEY'), false);
  });
});

describe('切组后模型失效提示', () => {
  let relay;
  let plugin;
  let dshHome;
  let currentSelection;

  before(async () => {
    dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-stale-'));
    currentSelection = { provider: 'onehub', model: 'model-a' };
    relay = makeRelay({ supportsSwitch: true });
    await new Promise((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    const { port } = relay.server.address();
    plugin = await startPlugin('http://127.0.0.1:' + port, dshHome, {
      agentDefaultModel: { currentSelection: () => ({ ...currentSelection }) },
    });
  });

  after(async () => {
    await new Promise((resolve) => plugin.server.close(resolve));
    await new Promise((resolve) => relay.server.close(resolve));
    rmSync(dshHome, { recursive: true, force: true });
  });

  it('选中模型在新目录里时 staleModel=false', async () => {
    const { body } = await json(plugin.base + '/state');
    assert.equal(body.data.selection.model, 'model-a');
    assert.equal(body.data.staleModel, false);
  });

  it('切到不含该模型的分组 → staleModel=true 且给出提示', async () => {
    const { body } = await json(plugin.base + '/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'vip' }),
    });
    assert.equal(body.data.state.staleModel, true);
    assert.match(String(body.data.warning), /不在新分组里/);
    // 只提示，不改选
    assert.equal(body.data.state.selection.model, 'model-a');
  });

  it('切回包含该模型的分组 → staleModel=false', async () => {
    const { body } = await json(plugin.base + '/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'default' }),
    });
    assert.equal(body.data.state.staleModel, false);
  });

  it('选择指向别的路由时不算失效', async () => {
    currentSelection = { provider: 'some-other-route', model: 'whatever' };
    const { body } = await json(plugin.base + '/state');
    assert.equal(body.data.staleModel, false);
  });
});

describe('兼容模式（new-api / sub2api 这类站点）', () => {
  let relay;
  let plugin;
  let credentials;
  let dshHome;

  before(async () => {
    dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-compat-'));
    credentials = makeFakeCredentials();
    // 第三方站点：没有 /v1/token/group
    relay = makeRelay({ supportsSwitch: false });
    await new Promise((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    const { port } = relay.server.address();
    plugin = await startPlugin('http://127.0.0.1:' + port, dshHome, { credentials });
  });

  after(async () => {
    await new Promise((resolve) => plugin.server.close(resolve));
    await new Promise((resolve) => relay.server.close(resolve));
    rmSync(dshHome, { recursive: true, force: true });
  });

  it('未填地址时提示待配置', async () => {
    const { body } = await json(plugin.base + '/state?profile=compat');
    assert.equal(body.data.profile, 'compat');
    assert.equal(body.data.preset, false);
    assert.equal(body.data.configured, false);
    assert.match(String(body.data.error), /还没配置/);
  });

  it('预设档案不允许改地址', async () => {
    const { status } = await json(plugin.base + '/config?profile=aimy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: 'https://evil.example.com' }),
    });
    assert.equal(status, 403);
  });

  it('非法地址被拒绝', async () => {
    const { status } = await json(plugin.base + '/config?profile=compat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: 'not-a-url' }),
    });
    assert.equal(status, 400);
  });

  it('保存地址后：只读站点也能拉模型并挂载独立路由', async () => {
    const baseURL = 'http://127.0.0.1:' + relay.server.address().port;
    const saved = await json(plugin.base + '/config?profile=compat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL, api: 'anthropic-messages' }),
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.configured, true);
    assert.equal(saved.body.data.api, 'anthropic-messages');
    // 地址是用户自己填的，允许回显
    assert.equal(saved.body.data.baseURL, baseURL);
    // 没有分组接口 → 只读
    assert.equal(saved.body.data.supportsSwitch, false);

    const withKey = await json(plugin.base + '/credentials?profile=compat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: KEY }),
    });
    assert.equal(withKey.status, 200);
    assert.equal(withKey.body.data.provider.mounted, true);
    assert.equal(withKey.body.data.provider.routeName, 'onehub-compat');

    const adapter = await import('./fake-adapter.mjs');
    const mount = adapter.mounts.filter((m) => m && m['onehub-compat']).pop();
    assert.ok(mount, '兼容模式路由没挂上');
    assert.equal(mount['onehub-compat'].api, 'anthropic-messages');
    assert.equal(mount['onehub-compat'].displayName, '兼容模式');
    // 独立凭据引用，不覆盖 Aimy 的密钥
    assert.equal(credentials.store.get('ONEHUB_COMPAT_API_KEY'), KEY);
  });

  it('清除兼容模式会卸载其路由', async () => {
    const adapter = await import('./fake-adapter.mjs');
    const before = adapter.mounts.length;
    const { status, body } = await json(plugin.base + '/config?profile=compat', { method: 'DELETE' });
    assert.equal(status, 200);
    assert.equal(body.data.configured, false);
    assert.ok(adapter.mounts.slice(before).some((m) => m && m.disposed === true), '应卸载旧路由');
  });
});

describe('baseURL 归整（OpenAI 补 /v1，Anthropic 不带 /v1）', () => {
  let relay;
  let relayBase;

  before(async () => {
    relay = makeRelay({ supportsSwitch: false });
    await new Promise((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    relayBase = 'http://127.0.0.1:' + relay.server.address().port;
  });

  after(async () => {
    await new Promise((resolve) => relay.server.close(resolve));
  });

  /** 起一个全新插件实例，保存给定地址与协议，返回它挂上的 provider profile。 */
  async function profileFor(savedURL, api) {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-url-'));
    const credentials = makeFakeCredentials();
    const plugin = await startPlugin(relayBase, dshHome, { credentials });
    try {
      // 先存密钥，避免「未配置 API Key」提前返回
      await json(plugin.base + '/credentials?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: KEY }),
      });

      const saved = await json(plugin.base + '/config?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL: savedURL, api }),
      });
      assert.equal(saved.status, 200, '保存地址应成功');
      // 我们的模型拉取同样要能容忍 /v1：能拉到模型说明 apiRoot() 没拼出 /v1/v1/models
      assert.equal(saved.body.data.connected, true, '模型目录应拉取成功，实际：' + JSON.stringify(saved.body.data.error));

      const adapter = await import('./fake-adapter.mjs');
      const mount = adapter.mounts.filter((m) => m && m['onehub-compat']).pop();
      assert.ok(mount, '兼容模式路由没挂上');
      return mount['onehub-compat'];
    } finally {
      await new Promise((resolve) => plugin.server.close(resolve));
      rmSync(dshHome, { recursive: true, force: true });
    }
  }

  it('OpenAI 协议：没填 /v1 时自动补', async () => {
    const profile = await profileFor(relayBase, 'openai-completions');
    assert.equal(profile.baseURL, relayBase + '/v1');
  });

  it('OpenAI 协议：已填 /v1 时不重复拼接', async () => {
    const profile = await profileFor(relayBase + '/v1', 'openai-completions');
    assert.equal(profile.baseURL, relayBase + '/v1');
  });

  it('OpenAI 协议：误填完整端点会被剥回到 /v1', async () => {
    const profile = await profileFor(relayBase + '/v1/chat/completions', 'openai-completions');
    assert.equal(profile.baseURL, relayBase + '/v1');
  });

  it('Anthropic 协议：不带 /v1（填了也剥掉）', async () => {
    const profile = await profileFor(relayBase + '/v1', 'anthropic-messages');
    assert.equal(profile.baseURL, relayBase);
    assert.equal(profile.api, 'anthropic-messages');
  });

  it('Anthropic 协议：域名原样保留', async () => {
    const profile = await profileFor(relayBase, 'anthropic-messages');
    assert.equal(profile.baseURL, relayBase);
  });
});
