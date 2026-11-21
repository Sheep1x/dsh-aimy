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
    /** 清空状态槽：需要「从零开始渲染」的用例用它，避免继承前面用例的状态。 */
    resetState() { stateSlots.length = 0; cursor = 0; pending = []; effects = []; },
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
  // 12 而不是 5：分组兜底那条链要多走两跳（/balance → /state → setState），
  // 5 跳时更新还没落进 state 槽，mount 就以为「没东西可应用」提前退出了。
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
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

  it('只注册三处：侧栏图标 + 主区面板 + 余额胶囊（不再注册设置页分区）', () => {
    assert.ok(registry.entries.has('sidebar.panellist:dsh-aimy'), '缺侧栏图标');
    assert.ok(registry.entries.has('main:dsh-aimy'), '缺主区面板');
    assert.ok(registry.entries.has('conversation.composer.dock:dsh-aimy-balance'), '缺余额胶囊');
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

  it('协议下拉框：四个选项齐全，默认选中 Responses', async () => {
    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);

    // 找协议下拉：它的 onChange 会 POST /config，且选项是四种协议
    const selects = elements(tree).filter((el) => el.type === 'select');
    const protoSelect = selects.find((el) =>
      elements(el).some((o) => o.type === 'option' && o.props.value === 'openai-responses'),
    );
    assert.ok(protoSelect, '面板里应有协议下拉框');

    const options = elements(protoSelect)
      .filter((el) => el.type === 'option')
      .map((el) => ({ value: el.props.value, text: textOf(el) }));
    assert.deepEqual(options.map((o) => o.value), [
      'openai-responses',
      'openai-completions',
      'anthropic-messages',
      'google-generative-ai',
    ]);
    assert.deepEqual(options.map((o) => o.text), [
      'OpenAI Responses',
      'OpenAI Chat Completions',
      'Anthropic Messages',
      'Google Gemini (v1beta)',
    ]);

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

  it('能力声明标注来源：面板说明上下文/输出是按三层取值链推出来的', async () => {
    globalThis.fetch = async () => ({
      text: async () => JSON.stringify({ success: true, data: stateBody }),
    });

    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);
    const text = textOf(tree);

    // 取值链是「站点声明 → 官方目录 → 兜底」，不是站点确认过的能力。
    // 不写明来源的话，用户会以为猜出来的窗口是上游承诺，撞墙时不知道该怀疑谁。
    assert.ok(
      text.includes('容量声明来源') && text.includes('官方目录'),
      '应说明容量取值链，实际文本：' + text.slice(0, 700),
    );
    assert.ok(text.includes('1M'), '应提到 1M 上下文');
    assert.ok(text.includes('128K'), '应提到 128K 输出上限');
  });

  it('有探测结果时显示不可用模型计数', async () => {
    globalThis.fetch = async () => ({
      text: async () => JSON.stringify({
        success: true,
        data: {
          ...stateBody,
          connected: true,
          models: [{ id: 'model-a' }, { id: 'model-gone' }, { id: 'model-5xx' }],
          reachability: { 'model-a': 'ok', 'model-gone': 'unavailable', 'model-5xx': 'unknown' },
        },
      }),
    });

    const Panel = registry.entries.get('main:dsh-aimy').component;
    const tree = await mount(Panel);
    const text = textOf(tree);

    assert.ok(text.includes('1 个不可用') || text.includes('1 个未确认不可用'), '应报出不可用计数，实际：' + text.slice(0, 600));
    // 暂时性故障不能算进不可用
    assert.ok(!text.includes('2 个不可用'), '5xx/429 不该被算成不可用');
  });

  it('正常状态不拉诊断信息（每次进面板省掉一次 370–580ms 的请求）', async () => {
    // 从干净状态开始：前面的用例会把状态槽填满，残留一个未连接状态会误触发诊断
    runtime.resetState();
    const urls = [];
    const healthy = {
      ...stateBody,
      connected: true,
      configured: true,
      credential: { configured: true, writable: true },
      provider: { routeName: 'onehub', mounted: true, modelCount: 2 },
    };
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      return { text: async () => JSON.stringify({ success: true, data: healthy }) };
    };

    const Panel = registry.entries.get('main:dsh-aimy').component;
    await mount(Panel);

    assert.ok(
      urls.some((u) => u.includes('/state')),
      '至少要拉一次 /state，实际：' + urls.join(', '),
    );
    assert.ok(
      !urls.some((u) => u.includes('/diagnostics')),
      '正常状态不该拉诊断，实际请求：' + urls.join(', '),
    );
  });

  describe('needsDiagnostics：什么状态才值得拉诊断', () => {
    /** 一个完全正常的状态：已连接、密钥已配、路由已挂载、无错误。 */
    const healthy = {
      ...stateBody,
      connected: true,
      configured: true,
      credential: { configured: true, writable: true },
      provider: { routeName: 'onehub', mounted: true, modelCount: 2 },
    };

    it('完全正常时返回 false', () => {
      assert.equal(module.needsDiagnostics(healthy), false);
    });

    it('还没有状态时返回 false（等 /state 回来再说）', () => {
      assert.equal(module.needsDiagnostics(null), false);
    });

    for (const [label, patch] of [
      ['有错误', { error: '挂载失败' }],
      ['未连接', { connected: false }],
      ['未配置密钥', { credential: { configured: false, writable: true } }],
      ['密钥缺失', { credential: null }],
      ['未挂载', { provider: null }],
      ['路由未挂上', { provider: { routeName: 'onehub', mounted: false, modelCount: 0 } }],
      ['挂载报错', { provider: { routeName: 'onehub', mounted: true, modelCount: 0, error: 'boom' } }],
      ['地址未配置', { configured: false }],
    ]) {
      it(label + '时返回 true', () => {
        assert.equal(module.needsDiagnostics({ ...healthy, ...patch }), true, label + ' 应触发诊断');
      });
    }
  });
  describe('余额胶囊（conversation.composer.dock）', () => {
    const barEntry = () => registry.entries.get('conversation.composer.dock:dsh-aimy-balance');

    /** 只在这一次调用里替换全局 fetch，跑完还原（别的用例还要用它拿 /state）。 */
    const withFetch = async (handler, fn) => {
      const previous = globalThis.fetch;
      globalThis.fetch = handler;
      try {
        return await fn();
      } finally {
        globalThis.fetch = previous;
      }
    };

    const balanceView = {
      amount: 93.787276,
      currency: 'USD',
      limit: 390.53,
      usedPercent: 76,
      source: 'usage',
      fetchedAt: '2026-11-20T12:00:00.000Z',
    };

    const respond = (data) => async () => ({ text: async () => JSON.stringify({ success: true, data }) });
    const balanceBody = (extra) => ({ ok: true, profile: 'aimy', displayName: 'Aimy-艾米', refreshSeconds: 300, ...extra });

    /** 这一处注册的是一行（分组胶囊 + 余额胶囊），按 data-composer-stat 取各自那颗。 */
    const pillOf = (tree, kind) => {
      // 分组胶囊裹在 position:relative 的锚点里（菜单要相对它绝对定位），所以递归找
      return elements(tree).find((el) => el.props && el.props['data-composer-stat'] === kind) || null;
    };

    const realGroups = {
      name: 'DeepSeek-自部署',
      ratio: 0.25,
      allowSwitch: true,
      groups: [
        { name: 'DeepSeek-官方正版', symbol: 'DeepSeek-官方正版', ratio: 0.7 },
        { name: 'DeepSeek-自部署', symbol: 'DeepSeek-自部署', ratio: 0.25 },
      ],
    };

    it('注册在输入框下方的统计行（composer.dock），排在 tok/s 与缓存命中右侧', () => {
      const entry = barEntry();
      assert.ok(entry, '没有注册余额胶囊');
      assert.equal(entry.options.name, 'conversation.composer.dock');
      // 该行已有 chat 注册的 activity(order 0) 与 usage(order 1)，我们必须排在后面
      assert.equal(entry.options.order, 10);
    });

    it('摘要：金额 / 额度 · 剩余百分比', () => {
      assert.equal(module.summarize(balanceView), '$93.79 / $390.53 · 剩 24%');
    });

    it('没有额度时不编造分母，也不编百分比', () => {
      assert.equal(module.summarize({ ...balanceView, limit: undefined, usedPercent: undefined }), '$93.79');
    });

    it('认不出的币种用代码后缀，没有币种就不加符号', () => {
      assert.equal(module.formatMoney(12, 'CNY'), '¥12.00');
      assert.equal(module.formatMoney(12, 'USDT'), '12.00 USDT');
      assert.equal(module.formatMoney(12), '12.00');
    });

    it('胶囊正文是「站名余额：金额」，额度与剩余百分比进 tooltip', async () => {
      runtime.resetState();
      await withFetch(respond(balanceBody({ view: balanceView })), async () => {
        const tree = await mount(barEntry().component);
        const text = textOf(tree);
        // 那一行跟 tok/s 并排，撑宽了会把整行挤歪，所以正文只要站名 + 金额
        assert.ok(text.includes('Aimy余额：$93.79'), '应显示「Aimy余额：$93.79」，实际：' + text);
        assert.equal(text.includes('$390.53'), false, '额度不该占正文，实际：' + text);
        const title = pillOf(tree, 'balance').props.title;
        assert.ok(title.includes('Aimy-艾米'), 'tooltip 要说是哪个站，实际：' + title);
        assert.ok(title.includes('$93.79 / $390.53'), 'tooltip 要有额度，实际：' + title);
        assert.ok(title.includes('剩 24%'), 'tooltip 要有剩余百分比，实际：' + title);
      });
    });

    it('站名取第一段：Aimy-艾米 → Aimy；认不出分隔符时退回全名', () => {
      assert.equal(module.shortName('Aimy-艾米'), 'Aimy');
      assert.equal(module.shortName('兼容模式'), '兼容模式');
      assert.equal(module.shortName(''), '中转站');
      assert.equal(module.pillLabel(balanceView, 'Aimy-艾米'), 'Aimy余额：$93.79');
      assert.equal(module.pillLabel(balanceView, undefined), '中转站余额：$93.79');
    });

    it('关掉开关时整颗不渲染（dock 那行不留空位）', async () => {
      runtime.resetState();
      await withFetch(respond(balanceBody({ ok: false, view: null, disabled: true })), async () => {
        const tree = await mount(barEntry().component);
        assert.equal(tree, null);
      });
    });

    it('查询失败时降级成灰字而不是消失', async () => {
      runtime.resetState();
      await withFetch(respond(balanceBody({ ok: false, view: null, error: '站点 502' })), async () => {
        const tree = await mount(barEntry().component);
        const text = textOf(tree);
        assert.ok(text.includes('Aimy余额：不可用'), '失败要说清楚，实际：' + text);
        assert.ok(pillOf(tree, 'balance').props.title.includes('Aimy-艾米'), 'tooltip 仍要显示是哪个站');
      });
    });

    it('有旧读数时保留数字并标注（旧）', async () => {
      runtime.resetState();
      await withFetch(respond(balanceBody({ ok: false, view: balanceView, error: '站点 502' })), async () => {
        const tree = await mount(barEntry().component);
        const text = textOf(tree);
        assert.ok(text.includes('$93.79'), '旧数字比空白有用，实际：' + text);
        assert.ok(text.includes('（旧）'), '必须标出这是旧值，实际：' + text);
      });
    });

    it('点击触发强制刷新（带 refresh=1）', async () => {
      runtime.resetState();
      const urls = [];
      await withFetch(async (url) => {
        urls.push(String(url));
        return { text: async () => JSON.stringify({ success: true, data: balanceBody({ view: balanceView }) }) };
      }, async () => {
        const tree = await mount(barEntry().component);
        const hits = () => urls.filter((u) => u.includes('/balance'));
        assert.equal(hits().length, 1, '首屏拉一次，实际：' + urls.join(' | '));
        assert.match(hits()[0], /\/balance$/);
        pillOf(tree, 'balance').props.onClick();
        await settle();
        assert.equal(hits().length, 2, '点击应再拉一次，实际：' + urls.join(' | '));
        assert.match(hits()[1], /\/balance\?refresh=1$/, '点击必须绕过缓存');
      });
    });

    it('分组胶囊显示当前分组，倍率与「点击切换」进 tooltip', async () => {
      runtime.resetState();
      await withFetch(respond(balanceBody({ view: balanceView, group: realGroups })), async () => {
        const tree = await mount(barEntry().component);
        const text = textOf(tree);
        assert.ok(text.includes('分组：DeepSeek-自部署'), '要显示当前分组，实际：' + text);
        const title = pillOf(tree, 'group').props.title;
        assert.ok(title.includes('0.25x'), 'tooltip 要有倍率，实际：' + title);
        assert.ok(title.includes('点击切换'), '要提示可以点，实际：' + title);
      });
    });

    it('站点不支持切换时只读：没有箭头、点不动', async () => {
      runtime.resetState();
      const readOnly = { name: 'DeepSeek-自部署', ratio: 0.25, allowSwitch: false, groups: [] };
      await withFetch(respond(balanceBody({ view: balanceView, group: readOnly })), async () => {
        const tree = await mount(barEntry().component);
        assert.equal(pillOf(tree, 'group').props.onClick, undefined, '不支持切换就不该有点击行为');
        assert.equal(textOf(tree).includes('▾'), false, '没有箭头才对，实际：' + textOf(tree));
      });
    });

    it('点开菜单列出全部分组，点一项就走 /switch', async () => {
      runtime.resetState();
      const calls = [];
      const handler = async (url, init) => {
        const target = String(url);
        calls.push({ url: target, method: (init && init.method) || 'GET', body: init && init.body });
        if (target.includes('/switch')) {
          return { text: async () => JSON.stringify({ success: true, data: { state: { token: { group: 'DeepSeek-官方正版' } } } }) };
        }
        return { text: async () => JSON.stringify({ success: true, data: balanceBody({ view: balanceView, group: realGroups }) }) };
      };
      await withFetch(handler, async () => {
        const comp = barEntry().component;
        const tree = await mount(comp);
        pillOf(tree, 'group').props.onClick({
          currentTarget: { getBoundingClientRect: () => ({ left: 12, top: 500, width: 220 }) },
        });
        await settle();
        const opened = await mount(comp);
        const menu = elements(opened).find((el) => el.props['data-aimy-group-menu'] !== undefined);
        assert.ok(menu, '点一下应该弹菜单');
        const items = elements(menu).filter((el) => el.type === 'button');
        assert.equal(items.length, 2, '两个分组就该有两项，实际：' + items.length);
        const pick = items.find((el) => textOf(el).includes('DeepSeek-官方正版'));
        assert.ok(pick, '菜单里没有目标分组');
        pick.props.onClick();
        await settle();
        const sent = calls.filter((call) => call.url.includes('/switch'));
        assert.equal(sent.length, 1, '应该发一次 /switch，实际：' + sent.length);
        assert.equal(sent[0].method, 'POST');
        assert.equal(JSON.parse(sent[0].body).group, 'DeepSeek-官方正版');
      });
    });

    it('菜单绝对定位在分组胶囊正上方（不依赖视口坐标）', async () => {
      runtime.resetState();
      await withFetch(respond(balanceBody({ view: balanceView, group: realGroups })), async () => {
        const comp = barEntry().component;
        const tree = await mount(comp);
        pillOf(tree, 'group').props.onClick({});
        await settle();
        const opened = await mount(comp);
        const menu = elements(opened).find((el) => el.props['data-aimy-group-menu'] !== undefined);
        assert.ok(menu, '点一下应该弹菜单');
        const style = menu.props.style;
        // 相对胶囊定位：不再用 fixed + 视口坐标（宿主有祖先建立包含块，会把视口坐标整体平移，
        // 结果菜单跑到右边余额胶囊头上）
        assert.equal(style.position, 'absolute', '菜单应相对锚点绝对定位，实际：' + style.position);
        assert.equal(style.left, 0, '菜单左边缘应与分组胶囊对齐，实际：' + style.left);
        assert.equal(style.bottom, 'calc(100% + 6px)', '菜单应贴在胶囊上沿，实际：' + style.bottom);
        assert.equal(style.width, 'max-content');
        // 菜单必须是分组胶囊的兄弟节点，父级 position:relative 才是它的锚
        const anchor = elements(opened).find((el) => el.props['data-aimy-group-anchor'] !== undefined);
        assert.ok(anchor, '没找到菜单锚点');
        assert.equal(anchor.props.style.position, 'relative', '锚点必须 position:relative');
        const anchorKids = elements(anchor);
        assert.ok(anchorKids.includes(menu), '菜单应该挂在锚点里');
        const groupPillEl = anchorKids.find((el) => el.props['data-composer-stat'] === 'group');
        assert.ok(groupPillEl, '锚点里应该有分组胶囊');
        // 菜单在 DOM 顺序上跟在胶囊后面，但视觉上在它上方
        assert.ok(anchorKids.indexOf(menu) > anchorKids.indexOf(groupPillEl), '菜单应排在分组胶囊之后');
      });
    });

    it('分组文案：未加载 / 读不到 / 有名字 / 有接口但没报当前分组', () => {
      assert.equal(module.groupText(undefined), '分组：…');
      assert.equal(module.groupText(null), '分组：—');
      assert.equal(module.groupText({ name: 'DeepSeek-自部署', allowSwitch: true, groups: [] }), '分组：DeepSeek-自部署');
      assert.equal(module.groupText({ name: '', allowSwitch: true, groups: [] }), '分组：未设置');
      assert.equal(module.groupText({ name: '', allowSwitch: false, groups: [] }), '分组：—');
      assert.equal(module.ratioText(0.25), '0.25x');
      assert.equal(module.ratioText(undefined), '');
    });

    it('宿主没在 /balance 里给分组时，用 /state 的 token 兜底', async () => {
      runtime.resetState();
      const urls = [];
      const handler = async (url) => {
        const target = String(url);
        urls.push(target);
        if (target.includes('/state')) {
          return {
            text: async () =>
              JSON.stringify({
                success: true,
                data: {
                  ...stateBody,
                  token: {
                    group: 'DeepSeek-自部署',
                    backupGroup: '',
                    ratio: 0.25,
                    allowGroupSwitch: true,
                    groups: realGroups.groups,
                  },
                },
              }),
          };
        }
        return { text: async () => JSON.stringify({ success: true, data: balanceBody({ view: balanceView }) }) };
      };
      await withFetch(handler, async () => {
        const tree = await mount(barEntry().component);
        const text = textOf(tree);
        assert.ok(urls.some((u) => u.includes('/state')), '应该补拉一次 /state，实际：' + urls.join(', '));
        assert.ok(text.includes('分组：DeepSeek-自部署'), '兜底后要显示分组名，实际：' + text);
      });
    });

    it('groupFromToken：与宿主 readGroup() 同一套映射', () => {
      assert.equal(module.groupFromToken(null), null);
      const mapped = module.groupFromToken({
        group: 'DeepSeek-自部署',
        backupGroup: '',
        ratio: 0.25,
        allowGroupSwitch: true,
        groups: [{ name: 'A', symbol: 'a', ratio: 1, public: true }],
      });
      assert.equal(mapped.name, 'DeepSeek-自部署');
      assert.equal(mapped.ratio, 0.25);
      assert.equal(mapped.allowSwitch, true);
      assert.deepEqual(mapped.groups, [{ name: 'A', symbol: 'a', ratio: 1 }]);
      // 没报名字但有 symbol 时用 symbol；不允许切换时 allowSwitch 为 false
      const noName = module.groupFromToken({
        group: '',
        backupGroup: '',
        ratio: undefined,
        allowGroupSwitch: false,
        groups: [{ symbol: 'only-symbol', name: '', ratio: 2, public: true }],
      });
      assert.equal(noName.name, '');
      assert.equal(noName.allowSwitch, false);
      assert.equal(noName.groups[0].name, 'only-symbol');
    });
  });

});
