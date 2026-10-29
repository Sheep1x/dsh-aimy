// 面板加载耗时剖析：启动真实插件，对 /state 计时，并逐段拆解。
// 用法：node ./scripts/profile-panel.mjs
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';

const raw = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8');
const key = (raw.match(/^\s+ONEHUB_API_KEY:\s*(\S+)$/mu) || [])[1];
if (!key) {
  console.error('读不到 ONEHUB_API_KEY');
  process.exit(1);
}
process.env.ONEHUB_API_KEY = key;

const dshHome = mkdtempSync(join(tmpdir(), 'dsh-aimy-prof-'));
process.env.DSH_HOME = dshHome;

const plugin = await import('../lib/index.js');

const disposers = [];
let registered = null;
const base = {
  effect(fn) {
    const d = fn();
    if (typeof d === 'function') disposers.push(d);
    return () => {};
  },
  get(name, fallback) {
    return fallback;
  },
  plugin() {
    return { dispose: async () => {} };
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
    const n = String(prop);
    if (n === 'then' || n.startsWith('_') || Number.isInteger(Number(n))) return Reflect.get(target, prop);
    if (Reflect.has(target, prop)) return Reflect.get(target, prop);
    return undefined;
  },
});

plugin.apply(ctx, {
  baseURL: 'https://aimy.sheep1x.top',
  apiKeyRef: 'ONEHUB_API_KEY',
  routeName: 'onehub',
});

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (!url.startsWith(registered.path)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  void registered.handler(req, res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

async function timed(path, init) {
  const t = Date.now();
  const res = await fetch('http://127.0.0.1:' + port + registered.path + path, init);
  const body = await res.json();
  const ms = Date.now() - t;
  return { ms, body };
}

console.log('--- GET /state（面板每次打开都走这条）---');
for (let i = 0; i < 5; i += 1) {
  const { ms, body } = await timed('/state?profile=aimy');
  const d = body.data ?? {};
  console.log(
    `  第 ${i + 1} 次: ${String(ms).padStart(5)}ms  模型 ${d.models?.length ?? 0} 个  ` +
      `connected=${d.connected}  error=${d.error ?? '无'}`,
  );
}

console.log('--- POST /refresh（点「刷新」时）---');
for (let i = 0; i < 3; i += 1) {
  const { ms } = await timed('/refresh?profile=aimy', { method: 'POST' });
  console.log(`  第 ${i + 1} 次: ${String(ms).padStart(5)}ms`);
}

console.log('--- 直连中转站基准（同一时刻）---');
for (const path of ['/v1/token/group', '/v1/models']) {
  const t = Date.now();
  try {
    const r = await fetch('https://aimy.sheep1x.top' + path, { headers: { Authorization: 'Bearer ' + key } });
    await r.text();
    console.log(`  ${path.padEnd(18)} ${String(Date.now() - t).padStart(5)}ms (HTTP ${r.status})`);
  } catch (error) {
    console.log(`  ${path.padEnd(18)} 失败: ${String(error).slice(0, 60)}`);
  }
}

await new Promise((r) => server.close(r));
rmSync(dshHome, { recursive: true, force: true });
