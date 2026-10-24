// client 半侧测试：走真实浏览器加载契约（window.__ModuleLoader__.load）。
// 组件里的 hooks 来自 factory 的 require('react')，所以这里给一个
// 「真 createElement + 假 hooks」的替身：元素树是真实 React 元素，
// 状态/副作用用最小 hook 运行时模拟，不需要 react-dom。
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  imageInput: true,
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

  it('只注册两处：侧栏图标 + 主区面板（不再注册设置页分区）', () => {
    assert.ok(registry.entries.has('sidebar.panellist:dsh-aimy'), '缺侧栏图标');
    assert.ok(registry.entries.has('main:dsh-aimy'), '缺主区面板');
    // 设置页分区已移除：宿主 nav 图标按 section id 硬编码，插件无法覆盖，
    // 留一行齿轮不如只保留侧栏入口。
    assert.equal(registry.entries.has('settings.section:onehub-relay'), false, '不应再注册设置页分区');

    const panel = registry.entries.get('sidebar.panellist:dsh-aimy').options;
    const main = registry.entries.get('main:dsh-aimy').options;
    assert.equal(panel.label(), 'Aimy-艾米');
    assert.equal(panel.id, main.key, '侧栏 id 必须等于 main 的 key，否则点图标打不开面板');
  });

  it('侧栏图标是中转站 logo 的矢量路径，跟随 size / active / 主题色', () => {
    const Icon = registry.entries.get('sidebar.panellist:dsh-aimy').component;
    const tree = Icon({ size: 18, active: true });

    assert.equal(tree.type, 'svg');
    assert.equal(tree.props.width, 18);
    assert.equal(tree.props.height, 18);
    // 单色路径：用 currentColor，才能跟随亮/暗主题
    assert.equal(tree.props.fill, 'currentColor');

    const paths = elements(tree).filter((el) => el.type === 'path');
    assert.equal(paths.length, 1, '应是一条闭合轮廓');
    const d = String(paths[0].props.d ?? '');
    assert.ok(d.length > 200, '路径应有实际轮廓数据，实际长度：' + d.length);
    assert.match(d, /^M[\d.]/u, '路径应以 M 起笔');
    // 多段子路径（外轮廓 + 孔洞）拼接，每段都必须闭合
    // 段之间用空格分隔，先按 M/m 切段再去掉首尾空白
    const subpaths = (d.match(/[Mm][^Mm]*/gu) ?? []).map((seg) => seg.trim());
    assert.ok(subpaths.length >= 1, '应至少有一段子路径');
    for (const seg of subpaths) {
      assert.match(seg, /[Zz]$/u, '每段子路径都必须闭合，实际段落：' + seg.slice(-20));
    }
    assert.ok(!/NaN|undefined|null/u.test(d), '路径数据不得含非法值');
    // 轮廓来自位图追踪：点数应足够表达 logo 细节
    const segments = (d.match(/[Ll]/gu) ?? []).length;
    assert.ok(segments >= 30, '轮廓点数过少会丢失 logo 形状，实际：' + segments);

    // active 状态影响不透明度
    const inactive = Icon({ size: 18, active: false });
    assert.notEqual(inactive.props.style.opacity, tree.props.style.opacity);
  });

  it('面板头部带品牌图标', async () => {
    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);

    const svgs = elements(tree).filter((el) => el.type === 'svg');
    assert.ok(svgs.length >= 1, '分区内容里应有品牌图标');

    const brand = svgs.find((el) => {
      const paths = elements(el).filter((p) => p.type === 'path');
      return paths.some((p) => String(p.props.d ?? '').includes('M') && String(p.props.d ?? '').length > 200);
    });
    assert.ok(brand, '品牌图标的 path 数据应存在');
    assert.equal(brand.props.fill, 'currentColor', '应跟随主题色');
    assert.equal(brand.props.viewBox, '0 0 24 24');
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

  it('下拉框适配暗色模式：select 与每个 option 都带主题变量', async () => {
    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);

    const selects = elements(tree).filter((el) => el.type === 'select');
    assert.ok(selects.length >= 1, '应有下拉框');

    for (const select of selects) {
      const bg = String(select.props.style?.background ?? '');
      const color = String(select.props.style?.color ?? '');
      // 必须是真实存在的主题变量，而不是写死的浅色
      assert.match(bg, /--dsw-alias-bg-(layer|base)/u, 'select 背景应走主题变量，实际：' + bg);
      assert.match(color, /--dsw-alias-label-/u, 'select 文字色应走主题变量，实际：' + color);
      // colorScheme 必须显式给出，原生弹层才会按主题绘制；
      // 具体值随 DSH 主题（body[data-ds-dark-theme]）变化，见下面的暗色用例
      assert.match(String(select.props.style?.colorScheme ?? ''), /^(light|dark)$/u, 'select 应声明 colorScheme 以跟随主题');

      // 原生弹层的每个选项也必须显式配色，否则暗色下是白底深字
      const options = elements(select).filter((el) => el.type === 'option');
      assert.ok(options.length > 0);
      for (const option of options) {
        const optBg = String(option.props.style?.background ?? '');
        const optColor = String(option.props.style?.color ?? '');
        assert.match(optBg, /--dsw-alias-bg-(layer|base)/u, 'option 背景应走主题变量，实际：' + optBg);
        assert.match(optColor, /--dsw-alias-label-/u, 'option 文字色应走主题变量，实际：' + optColor);
      }
    }
  });

  it('body 带暗色标记时，下拉的 colorScheme 切到 dark', async () => {
    // 造一个最小 document，让 useDarkTheme 读到暗色标记
    const attrs = new Set(['data-ds-dark-theme']);
    let observerCallback = null;
    globalThis.document = {
      body: {
        hasAttribute: (name) => attrs.has(name),
      },
      createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, select() {} }),
      execCommand: () => true,
    };
    globalThis.MutationObserver = class {
      constructor(cb) { observerCallback = cb; }
      observe() {}
      disconnect() {}
    };

    try {
      const Panel = registry.entries.get('main:dsh-aimy').component;
      const tree = await mount(Panel);
      const selects = elements(tree).filter((el) => el.type === 'select');
      assert.ok(selects.length >= 1);
      for (const select of selects) {
        assert.equal(select.props.style?.colorScheme, 'dark', '暗色主题下 colorScheme 应为 dark');
      }
      assert.ok(observerCallback, '应当用 MutationObserver 跟随主题切换');
    } finally {
      delete globalThis.document;
      delete globalThis.MutationObserver;
    }
  });

  it('所有用到的主题变量都真实存在（防止写错名字静默失效）', async () => {
    const source = readFileSync(new URL('../src/client/section.ts', import.meta.url), 'utf8');
    const used = [...new Set([...source.matchAll(/--dsw-alias-[a-z0-9-]+/g)].map((m) => m[0]))];
    assert.ok(used.length > 0, '应当用主题变量而不是全部硬编码');

    // DSH 实际定义的变量白名单（从 ui 包里取到的真实名字）
    const known = new Set([
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-1',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-bg-layer-3',
      '--dsw-alias-bg-layer-4',
      '--dsw-alias-border-l1',
      '--dsw-alias-border-l2',
      '--dsw-alias-border-l3',
      '--dsw-alias-border-l4',
      '--dsw-alias-label-primary',
      '--dsw-alias-label-secondary',
      '--dsw-alias-label-tertiary',
      '--dsw-alias-state-error-primary',
      '--dsw-alias-state-error-secondary',
      '--dsw-alias-state-success-primary',
      '--dsw-alias-interactive-bg-hover',
      '--dsw-alias-fill-tertiary',
    ]);
    const unknown = used.filter((v) => !known.has(v));
    assert.deepEqual(unknown, [], '用了不存在的主题变量（会静默回退到硬编码颜色）：' + unknown.join(', '));
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

  it('图片输入开关：默认勾上，取消后 POST 保存', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ?? null });
      return { text: async () => JSON.stringify({ success: true, data: stateBody }) };
    };

    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);
    const box = elements(tree)
      .filter((el) => el.type === 'input' && el.props?.type === 'checkbox')
      .find((el) => typeof el.props?.onChange === 'function');

    assert.ok(box, '面板里应有图片输入开关');
    assert.equal(box.props.checked, true, '图片输入默认应勾上');

    box.props.onChange({ target: { checked: false } });
    await settle();

    const save = calls.find((c) => c.method === 'POST' && c.url.includes('/config?profile=aimy'));
    assert.ok(save, '切开关应 POST /config?profile=aimy');
    assert.deepEqual(JSON.parse(save.body), { imageInput: false }, '只提交开关，不夹带协议/地址');
  });

  it('图片输入开关关闭时复选框不勾选', async () => {
    globalThis.fetch = async () => ({
      text: async () => JSON.stringify({ success: true, data: { ...stateBody, imageInput: false } }),
    });

    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);
    const box = elements(tree)
      .filter((el) => el.type === 'input' && el.props?.type === 'checkbox')
      .find((el) => typeof el.props?.onChange === 'function');

    assert.ok(box, '面板里应有图片输入开关');
    assert.equal(box.props.checked, false, '服务端说关了，复选框就不该勾选');
    assert.ok(textOf(tree).includes('已关闭'), '应提示当前是关闭状态');
  });
});
