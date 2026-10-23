/**
 * 「中转站」设置分区：两个 Tab
 *   - Aimy-艾米：内置预设，地址不展示、不可编辑；支持真实切分组
 *   - 兼容模式：用户自填 URL + 协议（new-api / sub2api / 任意 OpenAI 兼容网关）
 *
 * 样式只用 CSS 变量 --dsw-alias-*（主题跟随亮/暗），不依赖 UI 组件库。
 */
import type { PluginState, ProfileId } from '../shared/types';

export interface SectionDeps {
  h: (type: any, props: any, ...children: any[]) => any;
  useState: any;
  useEffect: any;
  useCallback: any;
  request: (path: string, init?: RequestInit) => Promise<any>;
}

const S = {
  wrap: { maxWidth: 720, display: 'flex', flexDirection: 'column' as const, gap: 12 },
  tabs: { display: 'flex', gap: 6, borderBottom: '1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35))' },
  tab: {
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer',
    background: 'transparent',
    color: 'inherit',
    border: 'none',
    borderBottom: '2px solid transparent',
    opacity: 0.7,
  },
  tabActive: { borderBottom: '2px solid var(--dsw-alias-text-link, #4a7dff)', opacity: 1, fontWeight: 600 },
  card: {
    border: '1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35))',
    borderRadius: 8,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  label: { fontSize: 12, opacity: 0.7, minWidth: 64 },
  title: { fontSize: 14, fontWeight: 600 },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 },
  hint: { fontSize: 12, opacity: 0.7, lineHeight: 1.5 },
  err: { fontSize: 12, color: 'var(--dsw-alias-text-danger, #d9534f)' },
  ok: { fontSize: 12, color: 'var(--dsw-alias-text-success, #2e9e5b)' },
  field: {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35))',
    background: 'var(--dsw-alias-bg-primary, transparent)',
    color: 'inherit',
    fontSize: 13,
    flex: 1,
    minWidth: 200,
  },
  button: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35))',
    background: 'var(--dsw-alias-bg-secondary, transparent)',
    color: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
  },
};

function ratioText(ratio: number): string {
  return '×' + (Number.isFinite(ratio) ? ratio : 1).toFixed(2);
}

export function makeSection(deps: SectionDeps) {
  const { h, useState, useEffect, useCallback, request } = deps;

  return function OneHubSection() {
    const [tab, setTab] = useState<ProfileId>('aimy');
    const [states, setStates] = useState<Record<string, PluginState | null>>({});
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [pendingGroup, setPendingGroup] = useState('');
    const [keyInput, setKeyInput] = useState('');
    const [compatURL, setCompatURL] = useState('');
    const [compatApi, setCompatApi] = useState<'openai-completions' | 'anthropic-messages'>('openai-completions');

    const state = (states[tab] ?? null) as PluginState | null;

    const putState = useCallback((id: string, next: PluginState | null) => {
      setStates((prev: Record<string, PluginState | null>) => ({ ...prev, [id]: next }));
    }, []);

    const load = useCallback(
      async (id: ProfileId, refresh?: boolean) => {
        setBusy(true);
        try {
          const path = (refresh ? '/refresh' : '/state') + '?profile=' + id;
          const res = await request(path, refresh ? { method: 'POST' } : undefined);
          if (res && res.data) {
            putState(id, res.data as PluginState);
            if (!pendingGroup && res.data.token && res.data.token.group) setPendingGroup(res.data.token.group);
            setMessage(res.data.error ? { kind: 'err', text: String(res.data.error) } : null);
          } else {
            setMessage({ kind: 'err', text: (res && res.message) || '读取状态失败' });
          }
        } catch (error) {
          setMessage({ kind: 'err', text: error instanceof Error ? error.message : String(error) });
        } finally {
          setBusy(false);
        }
      },
      [pendingGroup, putState, request],
    );

    useEffect(() => {
      void load(tab, false);
    }, [tab]);

    const saveKey = useCallback(async () => {
      const value = keyInput.trim();
      if (!value) {
        setMessage({ kind: 'err', text: '请先填写 API Key' });
        return;
      }
      setBusy(true);
      setMessage(null);
      try {
        const res = await request('/credentials?profile=' + tab, {
          method: 'POST',
          body: JSON.stringify({ apiKey: value }),
        });
        if (res && res.success === false) {
          setMessage({ kind: 'err', text: res.message || '保存失败' });
          return;
        }
        setKeyInput('');
        if (res && res.data) putState(tab, res.data as PluginState);
        setMessage({ kind: 'ok', text: '密钥已保存' });
      } catch (error) {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    }, [keyInput, putState, request, tab]);

    const clearKey = useCallback(async () => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await request('/credentials?profile=' + tab, { method: 'DELETE' });
        if (res && res.success === false) {
          setMessage({ kind: 'err', text: res.message || '清除失败' });
          return;
        }
        if (res && res.data) putState(tab, res.data as PluginState);
        setMessage({ kind: 'ok', text: '密钥已清除' });
      } catch (error) {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    }, [putState, request, tab]);

    const saveCompat = useCallback(async () => {
      const url = compatURL.trim();
      if (!url) {
        setMessage({ kind: 'err', text: '请填写兼容模式的地址' });
        return;
      }
      setBusy(true);
      setMessage(null);
      try {
        const res = await request('/config?profile=compat', {
          method: 'POST',
          body: JSON.stringify({ baseURL: url, api: compatApi }),
        });
        if (res && res.success === false) {
          setMessage({ kind: 'err', text: res.message || '保存失败' });
          return;
        }
        if (res && res.data) putState('compat', res.data as PluginState);
        setMessage({ kind: 'ok', text: '地址已保存' });
      } catch (error) {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    }, [compatApi, compatURL, putState, request]);

    const clearCompat = useCallback(async () => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await request('/config?profile=compat', { method: 'DELETE' });
        if (res && res.success === false) {
          setMessage({ kind: 'err', text: res.message || '清除失败' });
          return;
        }
        if (res && res.data) putState('compat', res.data as PluginState);
        setCompatURL('');
        setMessage({ kind: 'ok', text: '兼容模式已清除' });
      } catch (error) {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    }, [putState, request]);

    const doSwitch = useCallback(async () => {
      if (!pendingGroup) return;
      setBusy(true);
      setMessage(null);
      try {
        const res = await request('/switch?profile=' + tab, {
          method: 'POST',
          body: JSON.stringify({ group: pendingGroup }),
        });
        if (res && res.success === false) {
          setMessage({ kind: 'err', text: res.message || '切换失败' });
          return;
        }
        const next = res && res.data && res.data.state ? (res.data.state as PluginState) : null;
        if (next) putState(tab, next);
        const warning = res && res.data ? res.data.warning : undefined;
        setMessage(
          warning
            ? { kind: 'err', text: String(warning) }
            : { kind: 'ok', text: '已切换到分组 ' + ((next && next.token && next.token.group) || pendingGroup) },
        );
      } catch (error) {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy(false);
      }
    }, [pendingGroup, putState, request, tab]);

    const token = state && state.token ? state.token : null;
    const groups = token && token.groups ? token.groups : [];
    const current = token ? token.group : '';
    const canSwitch = Boolean(state && state.supportsSwitch && groups.length > 0);

    const optionChildren = groups.length
      ? groups.map((g: any) =>
          h('option', { key: g.symbol, value: g.symbol }, g.name + '（' + ratioText(g.ratio) + '）'),
        )
      : [h('option', { key: 'none', value: '' }, '（无可选分组）')];

    const tabButton = (id: ProfileId, text: string) =>
      h(
        'button',
        {
          key: id,
          style: { ...S.tab, ...(tab === id ? S.tabActive : {}) },
          onClick: () => {
            setTab(id);
            setMessage(null);
            setPendingGroup('');
          },
        },
        text,
      );

    /* ---- 头部：标题 + Tab ---- */
    const header = [
      h('div', { key: 'title', style: S.title }, '中转站'),
      h(
        'div',
        { key: 'hint', style: S.hint },
        '用中转站的模型，并在设置里切换分组（切换后模型列表、候选渠道与计费倍率同时变化）。',
      ),
      h('div', { key: 'tabs', style: S.tabs }, tabButton('aimy', 'Aimy-艾米'), tabButton('compat', '兼容模式')),
    ];

    /* ---- 连接状态卡片 ---- */
    const statusCard = h(
      'div',
      { style: S.card },
      state && state.preset
        ? null
        : h(
            'div',
            { style: S.row },
            h('span', { style: S.label }, '地址'),
            h('span', { style: S.mono }, state && state.baseURL ? state.baseURL : '未配置'),
          ),
      h(
        'div',
        { style: S.row },
        h('span', { style: S.label }, '状态'),
        h(
          'span',
          { style: state && state.connected ? S.ok : S.err },
          state && state.connected ? '已连接' : state && state.error ? '未连接' : '读取中…',
        ),
        state ? h('span', { style: S.hint }, '协议 ' + state.api) : null,
      ),
      state && !state.preset
        ? null
        : h(
            'div',
            { style: S.row },
            h('span', { style: S.label }, '当前分组'),
            h(
              'span',
              { style: S.mono },
              current ? current + '（' + ratioText(token ? token.ratio : 1) + '）' : '—',
            ),
            h('span', { style: S.hint }, state ? '模型 ' + state.models.length + ' 个' : ''),
          ),
      h(
        'div',
        { style: S.row },
        h('span', { style: S.label }, '模型路由'),
        h(
          'span',
          { style: state && state.provider && state.provider.mounted ? S.ok : S.err },
          state && state.provider
            ? state.provider.mounted
              ? '已挂载（' + state.provider.routeName + ' · ' + state.provider.modelCount + ' 个模型）'
              : '未挂载'
            : '—',
        ),
      ),
      state && state.provider && state.provider.error
        ? h('div', { style: S.err }, state.provider.error)
        : null,
      state && state.error ? h('div', { style: S.err }, state.error) : null,
    );

    /* ---- 兼容模式：地址与协议 ---- */
    const compatCard =
      tab === 'compat'
        ? h(
            'div',
            { style: S.card },
            h('div', { style: S.row }, h('span', { style: S.label }, '地址')),
            h(
              'div',
              { style: S.row },
              h('input', {
                style: S.field,
                placeholder: 'https://your-gateway.example.com（/v1 可填可不填）',
                value: compatURL,
                onChange: (e: any) => setCompatURL(e.target.value),
              }),
            ),
            h(
              'div',
              { style: S.row },
              h('span', { style: S.label }, '协议'),
              h(
                'select',
                {
                  style: { ...S.field, flex: '0 0 200px', minWidth: 160 },
                  value: compatApi,
                  onChange: (e: any) => setCompatApi(e.target.value),
                },
                h('option', { value: 'openai-completions' }, 'OpenAI 兼容'),
                h('option', { value: 'anthropic-messages' }, 'Anthropic 兼容'),
              ),
              h('button', { style: S.button, disabled: busy, onClick: () => void saveCompat() }, '保存地址'),
              h('button', { style: S.button, disabled: busy, onClick: () => void clearCompat() }, '清除'),
            ),
            h(
              'div',
              { style: S.hint },
              '适配 new-api / sub2api / 任意 OpenAI 兼容网关。地址填到域名即可：OpenAI 协议会自动补 /v1，Anthropic 协议不会带 /v1（两者都会剥离你误填的完整端点路径）。这类站点通常没有 /v1/token/group，分组切换会自动降级为只读。',
            ),
          )
        : null;

    /* ---- 密钥卡片 ---- */
    const keyCard = h(
      'div',
      { style: S.card },
      h(
        'div',
        { style: S.row },
        h('span', { style: S.label }, 'API Key'),
        h(
          'span',
          { style: state && state.credential && state.credential.configured ? S.ok : S.err },
          state && state.credential
            ? state.credential.configured
              ? '已保存' + (state.credential.source ? '（来源：' + state.credential.source + '）' : '')
              : '未保存'
            : '凭据服务不可用',
        ),
      ),
      h(
        'div',
        { style: S.row },
        h('input', {
          style: S.field,
          type: 'password',
          autoComplete: 'new-password',
          placeholder: '粘贴中转站的 sk- 令牌，保存后写入凭据库',
          value: keyInput,
          onChange: (e: any) => setKeyInput(e.target.value),
        }),
        h('button', { style: S.button, disabled: busy || !keyInput.trim(), onClick: () => void saveKey() }, '保存'),
        h('button', { style: S.button, disabled: busy, onClick: () => void clearKey() }, '清除'),
      ),
      h('div', { style: S.hint }, '密钥写入 DSH 凭据库（write-only，不回显、不进配置文件）。保存后立即探测并挂载模型。'),
    );

    /* ---- 分组卡片（仅当站点支持切组） ---- */
    const groupCard =
      tab === 'aimy' || (state && state.supportsSwitch)
        ? h(
            'div',
            { style: S.card },
            h(
              'div',
              { style: S.row },
              h('span', { style: S.label }, '切换到分组'),
              h(
                'select',
                {
                  style: { ...S.field, flex: '0 0 220px', minWidth: 180 },
                  value: pendingGroup,
                  disabled: busy || !canSwitch,
                  onChange: (e: any) => setPendingGroup(e.target.value),
                },
                ...optionChildren,
              ),
              h(
                'button',
                {
                  style: S.button,
                  disabled: busy || !pendingGroup || pendingGroup === current || !canSwitch,
                  onClick: () => void doSwitch(),
                },
                busy ? '处理中…' : '切换分组',
              ),
              h('button', { style: S.button, disabled: busy, onClick: () => void load(tab, true) }, '刷新'),
            ),
            h(
              'div',
              { style: S.hint },
              state && state.supportsSwitch === false
                ? '当前站点不支持切换分组（缺少 /v1/token/group），仅支持查看与调用。'
                : '切换会同时影响使用同一把密钥的其它客户端；建议给 DSH 单独建一个令牌，并开启「允许客户端切换分组」。',
            ),
            state && state.staleModel
              ? h(
                  'div',
                  { style: S.err },
                  '当前选中的模型 ' +
                    (state.selection ? state.selection.model : '') +
                    ' 不在本分组里，请到模型选择器重新选择（不会自动改选，避免悄悄切换计费对象）。',
                )
              : null,
            message ? h('div', { style: message.kind === 'ok' ? S.ok : S.err }, message.text) : null,
          )
        : h(
            'div',
            { style: S.card },
            h('div', { style: S.hint }, '该站点不支持分组切换，只提供模型调用。'),
            h('div', { style: S.row }, h('button', { style: S.button, disabled: busy, onClick: () => void load(tab, true) }, '刷新')),
            message ? h('div', { style: message.kind === 'ok' ? S.ok : S.err }, message.text) : null,
          );

    return h('div', { style: S.wrap }, ...header, statusCard, compatCard, keyCard, groupCard);
  };
}
