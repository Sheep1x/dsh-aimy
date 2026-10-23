// host 半侧集成测试：假中转站 + 真路由，验证 state / switch / 降级三条路径。
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * 最小的 cordis ctx 替身：effect / get / plugin / webServer。
 *
 * 故意做成严格代理：cordis 的 context 代理对「既不在上下文里、也没 inject」
 * 的属性直接抛 cannot get property "x" without inject。替身必须同样抛错，
 * 否则 ctx.config 这类越界读取会静默通过测试、上线才 500（已踩过一次）。
 */
function makeCtx(options = {}) {
  const disposers = [];
  const childDisposers = [];
  let registered = null;

  const base = {
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
      return () => {};
    },
    get(name, fallback) {
      if (name === 'credentials') return options.credentials ?? fallback;
      if (name === 'agentDefaultModel') return options.agentDefaultModel ?? fallback;
      if (name === 'llm') return options.llm ?? fallback;
      if (name === 'settings') return options.settings ?? fallback;
      return fallback;
    },
    plugin(plugin, pluginConfig) {
      // 和 cordis 一致：配置走 apply 的第二个参数，不改写 ctx
      const dispose = plugin.apply?.(ctx, pluginConfig);
      if (typeof dispose === 'function') childDisposers.push(dispose);
      return { dispose: async () => { if (typeof dispose === 'function') await dispose(); } };
    },
    webServer: {
      register(request) {
        registered = request;
        return () => {};
      },
    },
  };

  const ctx = new Proxy(base, {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop);
      const name = String(prop);
      // cordis 的 isSpecialProperty：then / 下划线 / 数字索引 一律放行
      if (name === 'then' || name.startsWith('_') || parseInt(name, 10).toString() === name) {
        return Reflect.get(target, prop);
      }
      if (Reflect.has(target, prop)) return Reflect.get(target, prop);
      throw new Error('cannot get property "' + name + '" without inject');
    },
  });

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
  const { ctx, getRegistered } = makeCtx({
    credentials: options.credentials,
    agentDefaultModel: options.agentDefaultModel,
    llm: options.llm,
    settings: options.settings,
  });

  // 和 cordis 一致：配置作为 apply 的第二个参数传入
  plugin.apply(ctx, {
    baseURL,
    apiKeyRef: 'ONEHUB_API_KEY',
    providerAdapter: adapterUrl,
  });
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

  it('Aimy 预设：preset=true，地址只读展示', async () => {
    const { body } = await json(plugin.base + '/state');
    assert.equal(body.data.profile, 'aimy');
    assert.equal(body.data.preset, true);
    assert.equal(body.data.displayName, 'Aimy-艾米');
    assert.match(body.data.baseURL, /^http:\/\/127\.0\.0\.1:\d+/u, '预设档案的地址应只读展示给前端');
    assert.equal(body.data.api, 'openai-responses', '默认协议应是 OpenAI Responses');
  });

  it('模型路由被挂载：providers 里只有本路由且模型齐全', async () => {
    const adapter = await import('./fake-adapter.mjs');
    const mount = adapter.mounts.find((m) => m && m.onehub);
    assert.ok(mount, '适配器没有被挂载');
    const profile = mount.onehub;
    assert.equal(profile.api, 'openai-responses', '挂载时默认协议应是 OpenAI Responses');
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

  it('OpenAI Responses：没填 /v1 时自动补', async () => {
    const profile = await profileFor(relayBase, 'openai-responses');
    assert.equal(profile.baseURL, relayBase + '/v1');
    assert.equal(profile.api, 'openai-responses', '协议必须原样透传给 pi-ai');
  });

  it('OpenAI Responses：已填 /v1 时不重复拼接', async () => {
    const profile = await profileFor(relayBase + '/v1', 'openai-responses');
    assert.equal(profile.baseURL, relayBase + '/v1');
  });

  it('OpenAI Responses：误填完整端点会被剥回到 /v1', async () => {
    const profile = await profileFor(relayBase + '/v1/responses', 'openai-responses');
    assert.equal(profile.baseURL, relayBase + '/v1');
  });

  it('三种协议都能挂载，api 原样透传', async () => {
    for (const api of ['openai-responses', 'openai-completions', 'anthropic-messages']) {
      const profile = await profileFor(relayBase, api);
      assert.equal(profile.api, api, api + ' 应原样透传');
      // anthropic 不带 /v1，两个 OpenAI 系都带
      assert.equal(profile.baseURL, api === 'anthropic-messages' ? relayBase : relayBase + '/v1', api + ' 的 baseURL 归整错误');
    }
  });
});


describe('适配器插件形状', () => {
  it('pickPlugin 挑模块命名空间（apply），而不是 PiAiAdapter 类', async () => {
    const { pickPlugin } = await import('../lib/index.js');
    const adapter = await import('./fake-adapter.mjs');

    const picked = pickPlugin(adapter, 'fake');
    assert.equal(typeof picked.apply, 'function', '应挑出带 apply 的插件');
    assert.equal(picked.name, 'llm-pi-ai');
    assert.notEqual(picked, adapter.PiAiAdapter, 'PiAiAdapter 是类，不是插件');

    // 只有类、没有 apply 的模块必须报错，而不是静默挂空
    assert.throws(
      () => pickPlugin({ PiAiAdapter: adapter.PiAiAdapter }, 'only-class'),
      /没有导出可挂载的 cordis 插件/u,
    );
  });
});

describe('启动预热（不点面板也要有模型）', () => {
  let relay;
  let plugin;
  let dshHome;

  before(async () => {
    dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-warm-'));
    relay = makeRelay({ supportsSwitch: true });
    await new Promise((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    const { port } = relay.server.address();
    const baseURL = 'http://127.0.0.1:' + port;

    // 预置磁盘目录缓存：模拟「上次运行拉过模型目录」
    mkdirSync(join(dshHome, 'dsh-aimy'), { recursive: true });
    writeFileSync(join(dshHome, 'dsh-aimy', 'state.json'), JSON.stringify({
      version: 1,
      catalogs: [{ baseURL, group: 'vip', models: [{ id: 'cached-a' }, { id: 'cached-b' }], fetchedAt: 1 }],
    }));

    plugin = await startPlugin(baseURL, dshHome);
  });

  after(async () => {
    await new Promise((resolve) => plugin.server.close(resolve));
    await new Promise((resolve) => relay.server.close(resolve));
    rmSync(dshHome, { recursive: true, force: true });
  });

  it('apply() 之后无需任何 HTTP 请求就挂载了模型路由', async () => {
    const adapter = await import('./fake-adapter.mjs');
    // warmStart 是异步的，等它跑完
    for (let i = 0; i < 20; i += 1) {
      if (adapter.mounts.some((m) => m && m.onehub)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const mount = adapter.mounts.filter((m) => m && m.onehub).pop();
    assert.ok(mount, '启动时没有用缓存目录挂载模型路由（模型选择器会是空的）');
    assert.deepEqual(mount.onehub.models.map((m) => m.id), ['cached-a', 'cached-b']);
  });
});


describe('挂载后自检', () => {
  it('fiber 建了但注册表里没有路由 → verify() 判失败并写进 provider.error', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-verify-'));
    try {
      const baseURL = 'https://verify.example.com';
      // 预置缓存，让 warmStart 直接走挂载路径
      mkdirSync(join(dshHome, 'dsh-aimy'), { recursive: true });
      writeFileSync(join(dshHome, 'dsh-aimy', 'state.json'), JSON.stringify({
        version: 1,
        catalogs: [{ baseURL, group: '', models: [{ id: 'm1' }], fetchedAt: 1 }],
      }));

      // llm 注册表永远为空（模拟 fiber 停在 pending / 注册被拒）
      const emptyLlm = {
        listProviders: () => [],
        listModels: async () => [],
      };

      const plugin = await startPlugin(baseURL, dshHome, { llm: emptyLlm });
      const { body } = await json(plugin.base + '/state');
      await new Promise((r) => plugin.server.close(r));

      assert.equal(body.data.provider.mounted, true, 'fiber 仍然存在');
      assert.ok(body.data.provider.error, '必须报错，不能静默通过');
      assert.match(body.data.provider.error, /没有注册进 llm/u);
    } finally {
      rmSync(dshHome, { recursive: true, force: true });
    }
  });
});


describe('自检不误报', () => {
  it('测试替身没有 llm 服务时不报错（只是无法自检）', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-noverify-'));
    try {
      const relay = makeRelay({ supportsSwitch: true });
      await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
      const { port } = relay.server.address();
      const plugin = await startPlugin('http://127.0.0.1:' + port, dshHome);
      const { body } = await json(plugin.base + '/state');
      await new Promise((r) => plugin.server.close(r));
      await new Promise((r) => relay.server.close(r));

      assert.equal(body.data.provider.mounted, true);
      assert.equal(body.data.provider.error, undefined, '没有 llm 服务时不应误判为注册失败');
    } finally {
      rmSync(dshHome, { recursive: true, force: true });
    }
  });
});


describe('写进现有 pi-ai 配置（首选路径）', () => {
  /** 假 settings 服务：记录 update/mutate 调用，模拟 pi-ai 条目的 volatile 通道。 */
  function makeSettings({ ns = 'llm-pi-ai', holders = ['aimy', 'aimy-gpt'] } = {}) {
    const written = [];
    const removed = [];
    let current = Object.fromEntries(holders.map((h) => [h, { displayName: h }]));
    return {
      written, removed,
      get current() { return current; },
      describe() { return [{ ns, revision: 1 }]; },
      async update(target, patch) {
        written.push({ ns: target, patch });
        current = { ...current, ...(patch.providers ?? {}) };
      },
      async mutate(target, ops) {
        for (const op of ops) {
          removed.push({ ns: target, path: op.path });
          if (op.op === 'unset' && op.path[0] === 'providers') delete current[op.path[1]];
        }
      },
    };
  }

  it('provider 被写进 llm-pi-ai 的 providers，且不动别人的路由', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-settings-'));
    const relay = makeRelay({ supportsSwitch: true });
    await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
    const { port } = relay.server.address();
    const baseURL = 'http://127.0.0.1:' + port;

    const settings = makeSettings();
    const llm = { listProviders: () => [{ id: 'onehub' }], listModels: async () => [{ id: 'model-a' }] };
    try {
      const plugin = await startPlugin(baseURL, dshHome, { settings, llm });
      const { body } = await json(plugin.base + '/refresh', { method: 'POST' });
      await new Promise((r) => plugin.server.close(r));

      assert.equal(body.data.provider.mounted !== undefined, true);
      assert.equal(settings.written.length > 0, true, '应当写入 settings，而不是自己挂第二个实例');

      const write = settings.written.find((w) => w.patch?.providers?.onehub);
      assert.ok(write, '没有写入 providers.onehub');
      assert.equal(write.ns, 'llm-pi-ai');
      const profile = write.patch.providers.onehub;
      assert.equal(profile.apiKeyEnv, 'ONEHUB_API_KEY');
      assert.match(profile.baseURL, /\/v1$/u, 'OpenAI 协议应补 /v1');
      assert.deepEqual(profile.models.map((m) => m.id), ['model-a', 'model-b']);

      // 别人的路由必须还在
      assert.deepEqual(Object.keys(settings.current).sort(), ['aimy', 'aimy-gpt', 'onehub']);
    } finally {
      await new Promise((r) => relay.server.close(r));
      rmSync(dshHome, { recursive: true, force: true });
    }
  });

  it('清除兼容模式会从 settings 里摘掉 onehub-compat', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-unset-'));
    const settings = makeSettings();
    const llm = { listProviders: () => [], listModels: async () => [] };
    try {
      const plugin = await startPlugin('http://127.0.0.1:1', dshHome, { settings, llm });
      const { body } = await json(plugin.base + '/config?profile=compat', { method: 'DELETE' });
      await new Promise((r) => plugin.server.close(r));

      assert.equal(body.success, true);
      assert.ok(
        settings.removed.some((r) => r.path.join('.') === 'providers.onehub-compat'),
        '清除兼容模式时应摘掉 settings 里的 provider',
      );
    } finally {
      rmSync(dshHome, { recursive: true, force: true });
    }
  });
});


describe('协议可切换（下拉框）', () => {
  it('预设档案：改协议会重挂载并落盘，地址仍不可改', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-api-switch-'));
    const relay = makeRelay({ supportsSwitch: false });
    await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
    const { port } = relay.server.address();
    const baseURL = 'http://127.0.0.1:' + port;
    const adapter = await import('./fake-adapter.mjs');
    try {
      const plugin = await startPlugin(baseURL, dshHome);
      const before = adapter.mounts.length;

      // 默认应是 Responses
      const initial = await json(plugin.base + '/state');
      assert.equal(initial.body.data.api, 'openai-responses');

      // 切到 Chat Completions
      const switched = await json(plugin.base + '/config?profile=aimy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api: 'openai-completions' }),
      });
      assert.equal(switched.status, 200, '预设档案应允许改协议');
      assert.equal(switched.body.data.api, 'openai-completions');

      // 重挂载：应当出现新的 onehub 挂载，且 api 变了
      const after = adapter.mounts.slice(before).filter((m) => m && m.onehub);
      assert.ok(after.length > 0, '协议变更后应重新挂载模型路由');
      assert.equal(after[after.length - 1].onehub.api, 'openai-completions');
      // OpenAI 系都补 /v1
      assert.match(after[after.length - 1].onehub.baseURL, /\/v1$/u);

      // 落盘：profiles.json 里记着覆盖值
      const saved = JSON.parse(readFileSync(join(dshHome, 'dsh-aimy', 'profiles.json'), 'utf8'));
      assert.equal(saved.aimy.api, 'openai-completions');

      // 地址仍然不可改
      const addr = await json(plugin.base + '/config?profile=aimy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL: 'https://evil.example.com' }),
      });
      assert.equal(addr.status, 403, '预设档案的地址必须仍被拒绝');

      // 切到 Anthropic：不补 /v1
      const anthropic = await json(plugin.base + '/config?profile=aimy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api: 'anthropic-messages' }),
      });
      assert.equal(anthropic.status, 200);
      const last = adapter.mounts.filter((m) => m && m.onehub).pop();
      assert.equal(last.onehub.api, 'anthropic-messages');
      assert.equal(last.onehub.baseURL, baseURL, 'anthropic 不应带 /v1');

      await new Promise((r) => plugin.server.close(r));
    } finally {
      await new Promise((r) => relay.server.close(r));
      rmSync(dshHome, { recursive: true, force: true });
    }
  });

  it('兼容模式：只传 api 时保留原地址', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-api-compat-'));
    const relay = makeRelay({ supportsSwitch: false });
    await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
    const { port } = relay.server.address();
    const relayBase = 'http://127.0.0.1:' + port;
    try {
      const credentials = makeFakeCredentials();
      const plugin = await startPlugin(relayBase, dshHome, { credentials });
      await json(plugin.base + '/credentials?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: KEY }),
      });
      await json(plugin.base + '/config?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL: relayBase, api: 'openai-responses' }),
      });

      // 只改协议
      const res = await json(plugin.base + '/config?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api: 'anthropic-messages' }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.api, 'anthropic-messages');
      assert.equal(res.body.data.connected, true, '地址应保留并仍能拉到目录');

      const saved = JSON.parse(readFileSync(join(dshHome, 'dsh-aimy', 'profiles.json'), 'utf8'));
      assert.equal(saved.compat.baseURL, relayBase, '只改协议不应清空地址');
      assert.equal(saved.compat.api, 'anthropic-messages');

      await new Promise((r) => plugin.server.close(r));
    } finally {
      await new Promise((r) => relay.server.close(r));
      rmSync(dshHome, { recursive: true, force: true });
    }
  });

  it('清除兼容模式不会顺手删掉预设档案的协议覆盖', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-clear-keep-'));
    const relay = makeRelay({ supportsSwitch: false });
    await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
    const { port } = relay.server.address();
    const relayBase = 'http://127.0.0.1:' + port;
    try {
      const plugin = await startPlugin(relayBase, dshHome);
      await json(plugin.base + '/config?profile=aimy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api: 'openai-completions' }),
      });
      const credentials = makeFakeCredentials();
      await json(plugin.base + '/credentials?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: KEY }),
      });
      await json(plugin.base + '/config?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL: relayBase, api: 'openai-responses' }),
      });

      await json(plugin.base + '/config?profile=compat', { method: 'DELETE' });

      const saved = JSON.parse(readFileSync(join(dshHome, 'dsh-aimy', 'profiles.json'), 'utf8'));
      assert.equal(saved.compat, undefined, '兼容模式应被清除');
      assert.equal(saved.aimy.api, 'openai-completions', '预设档案的协议覆盖必须保留');

      await new Promise((r) => plugin.server.close(r));
    } finally {
      await new Promise((r) => relay.server.close(r));
      rmSync(dshHome, { recursive: true, force: true });
    }
  });
});


describe('第三方站点兼容（new-api / sub2api 的真实响应形态）', () => {
  /**
   * 这些站点没有 /v1/token/group，但返回方式不止 404 一种：
   *   - 404 + HTML（网关兜底）
   *   - 404 + {"success":false}
   *   - 200 + {"success":false}（部分实现用 200 报错）
   *   - 200 + {"data":{}}（字段缺失）
   * 关键要求：都不能影响模型目录与调用。
   */
  function makeThirdPartyRelay(groupResponse) {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/v1/token/group') {
        res.writeHead(groupResponse.status, { 'Content-Type': groupResponse.type });
        res.end(groupResponse.body);
        return;
      }
      if (url.pathname === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'tp-model' }] }));
        return;
      }
      res.writeHead(404); res.end('{}');
    });
    return server;
  }

  async function stateFor(groupResponse) {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-3p-'));
    const relay = makeThirdPartyRelay(groupResponse);
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const baseURL = 'http://127.0.0.1:' + relay.address().port;
    const credentials = makeFakeCredentials();
    try {
      const plugin = await startPlugin(baseURL, dshHome, { credentials });
      await json(plugin.base + '/credentials?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: KEY }),
      });
      await json(plugin.base + '/config?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL, api: 'openai-completions' }),
      });
      const { body } = await json(plugin.base + '/state?profile=compat');
      await new Promise((r) => plugin.server.close(r));
      return body.data;
    } finally {
      await new Promise((r) => relay.close(r));
      rmSync(dshHome, { recursive: true, force: true });
    }
  }

  it('404 + HTML 兜底页：模型仍可用，只是不能切组', async () => {
    const data = await stateFor({ status: 404, type: 'text/html', body: '<html>not found</html>' });
    assert.equal(data.supportsSwitch, false);
    assert.equal(data.connected, true, '不能因为分组接口缺失而整体失败');
    assert.deepEqual(data.models.map((m) => m.id), ['tp-model']);
  });

  it('404 + JSON success:false：同样降级', async () => {
    const data = await stateFor({ status: 404, type: 'application/json', body: JSON.stringify({ success: false, message: 'invalid url' }) });
    assert.equal(data.supportsSwitch, false);
    assert.equal(data.connected, true);
    assert.deepEqual(data.models.map((m) => m.id), ['tp-model']);
  });

  it('200 但 data 为空对象：不能崩，模型仍可用', async () => {
    const data = await stateFor({ status: 200, type: 'application/json', body: JSON.stringify({ data: {} }) });
    assert.equal(data.connected, true);
    assert.deepEqual(data.models.map((m) => m.id), ['tp-model']);
    // 分组信息缺失时不该被当成可切组
    assert.ok(data.token === null || data.supportsSwitch === false, '空分组信息不应声称支持切组');
  });

  it('200 但 success:false：不能崩，模型仍可用', async () => {
    const data = await stateFor({ status: 200, type: 'application/json', body: JSON.stringify({ success: false, message: 'unsupported' }) });
    assert.equal(data.connected, true);
    assert.deepEqual(data.models.map((m) => m.id), ['tp-model']);
  });
});


describe('兼容性边界（README 与投稿描述所作的承诺）', () => {
  it('缺少分组接口的站点，三条承诺同时成立：能拉模型、能挂载、supportsSwitch=false', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-boundary-'));
    const relay = makeRelay({ supportsSwitch: false }); // /v1/token/group → 404
    await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
    const baseURL = 'http://127.0.0.1:' + relay.server.address().port;
    const credentials = makeFakeCredentials();
    try {
      const plugin = await startPlugin(baseURL, dshHome, { credentials });
      await json(plugin.base + '/credentials?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: KEY }),
      });
      const saved = await json(plugin.base + '/config?profile=compat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL, api: 'openai-completions' }),
      });

      // 承诺 1：模型目录能拉到
      assert.deepEqual(saved.body.data.models.map((m) => m.id), ['model-a', 'model-b']);
      // 承诺 2：路由被挂载（模型能出现在选择器里）
      assert.equal(saved.body.data.provider.mounted, true);
      // 承诺 3：明确告知不支持切组，而不是给一个点了没反应的按钮
      assert.equal(saved.body.data.supportsSwitch, false);

      await new Promise((r) => plugin.server.close(r));
    } finally {
      await new Promise((r) => relay.server.close(r));
      rmSync(dshHome, { recursive: true, force: true });
    }
  });

  it('支持分组接口的站点，supportsSwitch=true 且能拿到分组与倍率', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-boundary2-'));
    const relay = makeRelay({ supportsSwitch: true });
    await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
    const baseURL = 'http://127.0.0.1:' + relay.server.address().port;
    try {
      const plugin = await startPlugin(baseURL, dshHome);
      const { body } = await json(plugin.base + '/state');
      assert.equal(body.data.supportsSwitch, true);
      assert.equal(body.data.token.group, 'default');
      assert.equal(body.data.token.ratio, 1);
      assert.ok(body.data.token.groups.length >= 2, '应返回可选分组');
      await new Promise((r) => plugin.server.close(r));
    } finally {
      await new Promise((r) => relay.server.close(r));
      rmSync(dshHome, { recursive: true, force: true });
    }
  });
});
