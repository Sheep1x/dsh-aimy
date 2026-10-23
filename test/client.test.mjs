// client 半侧测试：走真实浏览器加载契约（window.__ModuleLoader__.load）。
// 组件里的 hooks 来自 factory 的 require('react')，所以这里给一个
// 「真 createElement + 假 hooks」的替身：元素树是真实 React 元素，
// 状态/副作用用最小 hook 运行时模拟，不需要 react-dom。
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');

const RELAY_URL = 'https://aimy.sheep1x.top';

/** 最小 hook 运行时：状态跨「重渲染」保留，useEffect 只在首帧执行。 */
function createHookRuntime() {
  const stateSlots = [];
  let cursor = 0;
  let pending = [];
  let effects = [];

  const useState = (initial) => {
    const index = cursor++;
    if (index >= stateSlots.length) stateSlots[index] = typeof initial === 'function' ? initial() : initial;
    const set = (next) => {
      pending.push([index, typeof next === 'function' ? next(stateSlots[index]) : next]);
    };
    return [stateSlots[index], set];
  };
  const useCallback = (fn) => { cursor++; return fn; };
  const useEffect = (fn) => { cursor++; effects.push(fn); };
  const useMemo = (fn) => { cursor++; return fn(); };

  return {
    hooks: { useState, useCallback, useEffect, useMemo },
    reset() { cursor = 0; effects = []; },
    takeEffects() { const taken = effects; effects = []; return taken; },
    applyPending() {
      const had = pending.length > 0;
      for (const [index, value] of pending) stateSlots[index] = value;
      pending = [];
      return had;
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** 递归收集 React 元素树里的所有元素。 */
/**
 * 递归收集元素树。函数组件按渲染器的做法展开（调用 type(props)），
 * 这样 `h(AddressValue, {...})` 这类子组件的内容也能被断言到。
 */
function elements(node, out = []) {
  if (node === null || node === undefined || node === false) return out;
  if (Array.isArray(node)) { for (const child of node) elements(child, out); return out; }
  if (typeof node === 'object' && node.props !== undefined) {
    if (typeof node.type === 'function') return elements(node.type(node.props), out);
    out.push(node);
    elements(node.props.children, out);
  }
  return out;
}

const textOf = (node) => elements(node).map((el) => {
  const { children } = el.props;
  return typeof children === 'string' || typeof children === 'number' ? String(children) : '';
}).join('');

/** 用真实 lib/client.js 的 factory 拿到 client 模块（走 __ModuleLoader__ 契约）。 */
async function loadClientModule(runtime) {
  let loaded = null;
  globalThis.window = {
    __ModuleLoader__: {
      load(info) { loaded = info; },
    },
  };
  await import('../lib/client.js');
  assert.ok(loaded, 'client.js 没有调用 window.__ModuleLoader__.load');
  assert.equal(loaded.id, 'dsh-aimy');
  const module = loaded.factory((name) => {
    if (name === 'react') return { createElement: React.createElement, Fragment: React.Fragment, ...runtime.hooks };
    if (name === 'react/jsx-runtime') {
      return { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment };
    }
    throw new Error('未预期的模块依赖：' + name);
  });
  return module;
}

/** 假 slots 服务：收集注册，并立刻执行 inject 生成器。 */
function makeSlots() {
  const entries = new Map();
  return {
    entries,
    slots: {
      inject(slot, generator) {
        const iterator = generator();
        while (!iterator.next().done) { /* 跑完生成器 */ }
        return () => {};
      },
      register(options, component) {
        entries.set(options.name + ':' + (options.id ?? options.key ?? ''), { options, component });
        return () => {};
      },
    },
  };
}

const stateBody = {
  profile: 'aimy',
  displayName: 'Aimy-艾米',
  preset: true,
  baseURL: RELAY_URL,
  api: 'openai-responses',
  configured: true,
  connected: false,
  supportsSwitch: false,
  token: null,
  models: [],
  modelsFetchedAt: 0,
  provider: null,
  credential: { configured: false, writable: true },
  selection: null,
  staleModel: false,
};

describe('dsh-aimy client', () => {
  let module;
  let registry;
  const runtime = createHookRuntime();

  before(async () => {
    module = await loadClientModule(runtime);
    const made = makeSlots();
    registry = made;
    globalThis.fetch = async () => ({ text: async () => JSON.stringify({ success: true, data: stateBody }) });
    module.apply({ slots: made.slots });
  });

  /** 渲染组件直到状态稳定。 */
  const mount = async (Component) => {
    let tree;
    let first = true;
    for (let pass = 0; pass < 8; pass += 1) {
      runtime.reset();
      tree = Component({});
      const effects = runtime.takeEffects();
      if (first) { first = false; for (const effect of effects) effect(); }
      await settle();
      if (!runtime.applyPending()) break;
    }
    return tree;
  };

  it('注册三处：设置分区 / 侧栏图标 / 主区面板', () => {
    assert.ok(registry.entries.has('settings.section:onehub-relay'), '缺设置分区');
    assert.ok(registry.entries.has('sidebar.panellist:dsh-aimy'), '缺侧栏图标');
    assert.ok(registry.entries.has('main:dsh-aimy'), '缺主区面板');

    const section = registry.entries.get('settings.section:onehub-relay').options;
    const panel = registry.entries.get('sidebar.panellist:dsh-aimy').options;
    const main = registry.entries.get('main:dsh-aimy').options;
    assert.equal(section.label(), 'Aimy-艾米');
    assert.equal(panel.label(), 'Aimy-艾米');
    assert.equal(panel.id, main.key, '侧栏 id 必须等于 main 的 key，否则点图标打不开面板');
  });

  it('侧栏图标渲染成 svg，并跟随 size / active', () => {
    const Icon = registry.entries.get('sidebar.panellist:dsh-aimy').component;
    const tree = Icon({ size: 18, active: true });
    assert.equal(tree.type, 'svg');
    assert.equal(tree.props.width, 18);
    assert.ok(elements(tree).some((el) => el.type === 'circle'), '图标里应有节点圆');
  });

  it('地址显示为默认中转站地址', async () => {
    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);
    assert.ok(textOf(tree).includes(RELAY_URL), '面板应显示默认地址');
    assert.ok(textOf(tree).includes('预设地址（不可修改）'), '预设地址应标注只读');
  });

  it('地址可点复制：点一下写入剪贴板并提示已复制', async () => {
    const written = [];
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: async (text) => { written.push(text); } } },
      configurable: true,
    });

    const Panel = registry.entries.get('main:dsh-aimy').component;
    let tree = await mount(Panel);

    const copyButton = elements(tree).find((el) => el.type === 'button' && el.props.title === '点击复制地址');
    assert.ok(copyButton, '地址没有渲染成可点击复制');
    assert.ok(textOf(copyButton).includes(RELAY_URL), '按钮上应显示地址');

    copyButton.props.onClick();
    await settle();
    tree = await mount(Panel);

    assert.deepEqual(written, [RELAY_URL], '点击后应把地址写进剪贴板');
    assert.ok(textOf(tree).includes('已复制'), '点击后应提示已复制');
  });

  it('协议下拉框：三个选项齐全，默认选中 Responses', async () => {
    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);

    // 找协议下拉：它的 onChange 会 POST /config，且选项是三种协议
    const selects = elements(tree).filter((el) => el.type === 'select');
    const protoSelect = selects.find((el) =>
      elements(el).some((o) => o.type === 'option' && o.props.value === 'openai-responses'),
    );
    assert.ok(protoSelect, '面板里应有协议下拉框');

    const options = elements(protoSelect)
      .filter((el) => el.type === 'option')
      .map((el) => ({ value: el.props.value, text: textOf(el) }));
    assert.deepEqual(options.map((o) => o.value), ['openai-responses', 'openai-completions', 'anthropic-messages']);
    assert.deepEqual(options.map((o) => o.text), ['OpenAI Responses', 'OpenAI Chat Completions', 'Anthropic Messages']);

    // 当前值应是 Responses（默认）
    assert.equal(protoSelect.props.value, 'openai-responses');
  });

  it('协议下拉切换会请求保存接口', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ?? null });
      return { text: async () => JSON.stringify({ success: true, data: stateBody }) };
    };

    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);
    const protoSelect = elements(tree)
      .filter((el) => el.type === 'select')
      .find((el) => elements(el).some((o) => o.type === 'option' && o.props.value === 'openai-completions'));

    assert.ok(protoSelect, '找不到协议下拉');
    protoSelect.props.onChange({ target: { value: 'openai-completions' } });
    await settle();

    const save = calls.find((c) => c.method === 'POST' && c.url.includes('/config?profile=aimy'));
    assert.ok(save, '切换协议应 POST /config?profile=aimy，实际请求：' + JSON.stringify(calls.map((c) => c.url)));
    assert.deepEqual(JSON.parse(save.body), { api: 'openai-completions' });
  });
});
