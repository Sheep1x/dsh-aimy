/**
 * 输入框下方统计行里的两颗胶囊：
 *   ① 分组胶囊「分组：DeepSeek-自部署 ▾」—— 点开就地切组
 *   ② 余额胶囊「Aimy余额：$93.45」—— 点一下立即刷新
 *
 * 为什么并排放在同一处注册：dock 是 `display:flex; gap:12px`，两颗各自注册能拿到
 * 同样的间距，但会各自发一次 `/balance`；宿主虽有 60 秒缓存，冷启动仍会打两次站点。
 * 这里一次请求拿全（响应里的 `group` + `view`），两颗胶囊永远同步 —— 切组之后余额
 * 跟着变，不会出现「分组已经是新的、钱还是旧的」。
 *
 * 设计取舍：
 *   - **只显示、不算账**：金额/额度/百分比都由 host 算好（`BalanceView`），
 *     这里只做排版 —— 换算口径能跑单测，界面不该有第二套算法。
 *   - **长得像原生统计项**：dock 里的东西是 pill（inline-flex、padding 1px 8px、
 *     tertiary 文字色、tabular-nums），插件自己造一条横栏只会显得外挂。
 *   - **失败不消失**：查不到时降级成灰字「余额不可用」，否则用户会以为插件没装。
 *   - **轮询克制**：默认 5 分钟一轮，页面不可见（`document.hidden`）时跳过；
 *     host 侧还有 60 秒缓存兜底，切页不会重复打站点。
 */
import type { BalanceGroup, BalanceResponse, TokenGroupState } from '../shared/types';

export interface BalanceBarDeps {
  h: (type: any, props: any, ...children: any[]) => any;
  useState: any;
  useEffect: any;
  useCallback: any;
  request: (path: string, init?: RequestInit) => Promise<any>;
}

/** 常见币种符号；认不出的币种原样显示（如 `credits`）。 */
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  USDT: '$',
  CNY: '¥',
  RMB: '¥',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

function symbolOf(currency?: string): string {
  if (!currency) return '';
  const key = currency.trim().toUpperCase();
  if (key === 'USD' || key === 'CNY' || key === 'EUR' || key === 'GBP' || key === 'JPY') {
    return CURRENCY_SYMBOL[key] ?? '';
  }
  return currency.trim();
}

/** 金额两位小数；没有币种就不加符号（站点没说是美元时，套 `$` 是在编数据）。 */
export function formatMoney(amount: number, currency?: string): string {
  const text = Math.abs(amount).toFixed(2);
  const symbol = symbolOf(currency);
  if (!symbol) return text;
  // 单字符符号（$ ¥ €）贴在数字前；ISO 代码 / 自定义单位（USDT、credits）跟在后面
  return symbol.length === 1 ? symbol + text : text + ' ' + symbol;
}

/** `2026-11-20T20:12:00.000Z` → 本地 `20:12`。 */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => (n < 10 ? '0' + n : String(n));
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/** 一句话摘要：`$93.79 / $390.53 · 剩 24%`。抽成纯函数好单测。 */
export function summarize(view: BalanceResponse['view']): string {
  if (!view) return '';
  const parts: string[] = [formatMoney(view.amount, view.currency)];
  if (view.limit !== undefined && view.limit > 0) {
    parts[0] += ' / ' + formatMoney(view.limit, view.currency);
  }
  if (view.usedPercent !== undefined) {
    parts.push('剩 ' + Math.max(0, Math.round(100 - view.usedPercent)) + '%');
  }
  return parts.join(' · ');
}

/**
 * 胶囊里的标签：`Aimy余额：$93.45`。
 *
 * 站名取 `displayName` 的第一段（`Aimy-艾米` → `Aimy`）—— 那一行跟 tok/s、缓存命中
 * 并排，全名会把整行挤歪；认不出分隔符时退回全名，不硬猜。
 * 额度与剩余百分比留在 tooltip：正文只回答「还有多少钱」。
 */
export function shortName(displayName?: string): string {
  const full = (displayName ?? '').trim();
  if (!full) return '中转站';
  const head = full.split(/[-–—_·|\s]+/).filter(Boolean)[0];
  return head || full;
}

export function pillLabel(view: BalanceResponse['view'], displayName?: string): string {
  return shortName(displayName) + '余额：' + formatMoney(view?.amount ?? 0, view?.currency);
}

/**
 * 分组胶囊正文：`分组：DeepSeek-自部署`。
 *
 * 三种「没有名字」的情况分开说，否则用户分不清是没加载完、站点没这能力，还是
 * 站点有接口但没报当前分组：
 *   - `group` 缺失（还没拿到响应）→ `分组：…`
 *   - 站点不支持 / 有接口但没报   → `分组：—`（tooltip 里说清楚是哪一种）
 */
export function groupText(group?: BalanceGroup | null): string {
  if (group === undefined) return '分组：…';
  if (group === null) return '分组：—';
  if (group.name) return '分组：' + group.name;
  return group.allowSwitch ? '分组：未设置' : '分组：—';
}

/** 分组倍率：`0.25x`；没有倍率就不显示（站点没给就别编）。 */
/**
 * `TokenGroupState` → 胶囊要的 `BalanceGroup`。
 *
 * 与宿主 `readGroup()` 的映射规则一致；用途是**宿主版本落后**时兜底 ——
 * 旧宿主的 `/balance` 不带 `group`，但 `/state` 里一直有 `token`。
 */
export function groupFromToken(token: TokenGroupState | null | undefined): BalanceGroup | null {
  if (!token) return null;
  const groups = Array.isArray(token.groups) ? token.groups : [];
  return {
    name: typeof token.group === 'string' ? token.group : '',
    ratio: typeof token.ratio === 'number' ? token.ratio : undefined,
    allowSwitch: token.allowGroupSwitch === true && groups.length > 0,
    groups: groups.map((item) => ({
      name: String(item && item.name ? item.name : item && item.symbol ? item.symbol : ''),
      symbol: item ? item.symbol : undefined,
      ratio: item ? item.ratio : undefined,
    })),
  };
}

export function ratioText(ratio?: number): string {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '';
  return ratio + 'x';
}

/** 钱包图标，14px，跟原生统计项一样 `currentColor` 描边。 */
function walletIcon(h: BalanceBarDeps['h']): any {
  return h(
    'svg',
    {
      width: 14,
      height: 14,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      style: { flex: 'none' },
    },
    h('path', { key: 'a', d: 'M2.2 5.4h11.6v7.4a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1z' }),
    h('path', { key: 'b', d: 'M2.2 5.4V4.1a1 1 0 0 1 1-1h8.1' }),
    h('circle', { key: 'c', cx: 11.1, cy: 9.2, r: 0.95, fill: 'currentColor', stroke: 'none' }),
  );
}

/** 分组图标：三层叠片，跟钱包一样 14px 线稿。 */
function layersIcon(h: BalanceBarDeps['h']): any {
  return h(
    'svg',
    {
      width: 14,
      height: 14,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      style: { flex: 'none' },
    },
    h('path', { key: 'a', d: 'M8 2.1 13.9 5.2 8 8.3 2.1 5.2z' }),
    h('path', { key: 'b', d: 'M2.5 7.9 8 10.7 13.5 7.9' }),
    h('path', { key: 'c', d: 'M2.5 10.6 8 13.4 13.5 10.6' }),
  );
}

export function makeBalanceBar(deps: BalanceBarDeps, options: { refreshSeconds?: number } = {}) {
  const { h, useState, useEffect, useCallback, request } = deps;
  const initialSeconds = Math.max(30, Math.round(options.refreshSeconds ?? 300));

  return function AimyBalancePill() {
    // 注意：deps 里的 useState 是 any（宿主注入的 react），带类型参数调用会触发
    // TS2347「Untyped function calls may not accept type arguments」，所以用 as 断言。
    const [data, setData] = useState(null as BalanceResponse | null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    /**
     * 轮询间隔由宿主配置决定（客户端拿不到插件 config）。
     * 先用默认值，拿到响应后再对齐；用函数式 set 避免把 refreshSeconds 塞进
     * load 的依赖里 —— 否则改间隔会重建回调、又触发一次拉取，来回打转。
     */
    const [refreshSeconds, setRefreshSeconds] = useState(initialSeconds);
    /** 分组菜单是否展开。 */
    const [menu, setMenu] = useState(false);
    /** 正在切换的目标分组名；空串 = 空闲。 */
    const [switching, setSwitching] = useState('');
    const [switchError, setSwitchError] = useState('');
    /**
     * `/balance` 没带 `group` 时从 `/state` 补来的分组。
     * 单独一个槽而不是就地改 `data`：两者是两条并行请求，谁先回来不定；
     * 对 `data` 做函数式更新时 prev 可能还是 null，会把余额一起抹掉。
     */
    const [fallbackGroup, setFallbackGroup] = useState(null as BalanceGroup | null);

    /** `/balance` 没带 group 时，用 `/state` 的 token 补一次；失败就保持原样。 */
    const loadGroupFallback = useCallback(
      async (profile?: string) => {
        try {
          const res = await request('/state' + (profile ? '?profile=' + profile : ''));
          const group = groupFromToken(res && res.data ? res.data.token : null);
          if (group) setFallbackGroup(group);
        } catch {
          // 兜底失败不影响余额显示，下一轮轮询再试
        }
      },
      [request],
    );

    const load = useCallback(
      async (force: boolean) => {
        if (force) setBusy(true);
        try {
          const res = await request('/balance' + (force ? '?refresh=1' : ''));
          if (res && res.data) {
            setData(res.data as BalanceResponse);
            setError(res.data.error ? String(res.data.error) : '');
            // 宿主比客户端旧（或这一版没带 group）时，胶囊会一直停在「分组：…」。
            // /state 里本来就有 token，拿它补一次，省得整条看起来「没读全」。
            if (res.data.group === undefined) void loadGroupFallback(res.data.profile);
            const next = Number(res.data.refreshSeconds);
            if (Number.isFinite(next) && next >= 30) {
              setRefreshSeconds((prev: number) => (Math.round(next) === prev ? prev : Math.round(next)));
            }
          } else {
            setError((res && res.message) || '读取余额失败');
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          if (force) setBusy(false);
        }
      },
      [request, loadGroupFallback],
    );

    // 首屏拉一次 + 定时轮询。页面不可见时跳过 —— 后台标签页不该继续打站点。
    // 没有 document 就不是浏览器环境（单测里跑组件），此时不排定时器，
    // 否则一个 5 分钟的 interval 会让测试进程迟迟不退出。
    useEffect(() => {
      void load(false);
      if (typeof document === 'undefined') return undefined;
      const timer = setInterval(() => {
        if (document.hidden) return;
        void load(false);
      }, refreshSeconds * 1000);
      return () => clearInterval(timer);
    }, [load, refreshSeconds]);

    // 从后台切回来时补一次：回来看到的应该是最新数字，而不是半小时前的
    useEffect(() => {
      if (typeof document === 'undefined') return undefined;
      const onVisible = (): void => {
        if (!document.hidden) void load(false);
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }, [load]);

    const closeMenu = useCallback(() => setMenu(false), []);

    // 菜单开着时：点外面关掉、按 Esc 关掉。点胶囊自身不算「外面」—— 那是开关。
    useEffect(() => {
      if (!menu || typeof document === 'undefined') return undefined;
      const onDown = (event: any): void => {
        const target = event && event.target;
        if (target && typeof target.closest === 'function') {
          if (target.closest('[data-aimy-group-menu]')) return;
          if (target.closest('[data-composer-stat="group"]')) return;
        }
        setMenu(false);
      };
      const onKey = (event: any): void => {
        if (event && event.key === 'Escape') setMenu(false);
      };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('keydown', onKey);
      };
    }, [menu]);

    const choose = useCallback(
      async (group: string) => {
        if (!group || switching) return;
        setSwitching(group);
        setSwitchError('');
        try {
          const profile = (data && data.profile) || 'aimy';
          const res = await request('/switch?profile=' + profile, {
            method: 'POST',
            body: JSON.stringify({ group }),
          });
          if (res && res.success === false) {
            setSwitchError(String(res.message || '切换失败'));
            return;
          }
          const warning = res && res.data ? res.data.warning : undefined;
          // 立刻把胶囊改成新分组，不等下一轮轮询 —— 用户刚点的东西要有反馈
          setData((prev: BalanceResponse | null) =>
            prev ? { ...prev, group: prev.group ? { ...prev.group, name: group } : prev.group } : prev,
          );
          setMenu(false);
          // 换了分组倍率就变了，花费胶囊的倍率缓存必须作废，否则还按旧折扣算钱
          if (warning) setSwitchError(String(warning));
          // 倍率变了，余额口径也跟着变：拉一次新读数（绕过缓存）
          void load(true);
        } catch (cause) {
          setSwitchError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setSwitching('');
        }
      },
      [data, load, request, switching],
    );

    // 配置里关掉了：整条不渲染，dock 该行不留空位
    if (data && data.disabled) return null;

    const view = data?.view ?? null;
    const label = data?.displayName || '中转站';
    // 宿主没给 group（版本落后 / 站点没接）时用兜底槽，给了就以后者为准
    const group = data ? (data.group === undefined ? (fallbackGroup ?? undefined) : data.group) : undefined;
    const currentGroup = (group && group.name) || '';
    const canSwitch = Boolean(group && group.allowSwitch && group.groups.length > 0);
    const minutes = Math.max(1, Math.round(refreshSeconds / 60));
    const title = error
      ? label + ' 余额查询失败：' + error
      : [
          label,
          summarize(view),
          formatClock(view?.fetchedAt ?? '') ? formatClock(view!.fetchedAt) + ' 更新' : '',
          '点击立即刷新（每 ' + minutes + ' 分钟自动刷新）',
        ]
          .filter(Boolean)
          .join(' · ');

    // 与 StatsPills 的 .pill 对齐：字号比正文小 1px、tertiary 色、等宽数字
    const pill = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      boxSizing: 'border-box' as const,
      padding: '1px 8px',
      border: 'none',
      borderRadius: 'var(--dsw-radius-sm, 4px)',
      background: 'transparent',
      color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,.75))',
      fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
      lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap' as const,
      cursor: 'pointer',
      userSelect: 'none' as const,
      opacity: busy ? 0.55 : 1,
    };

    const ellipsis = {
      display: 'inline-block' as const,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    };

    const text = !view
      ? shortName(label) + '余额：' + (error ? '不可用' : '…')
      : pillLabel(view, label) + (error ? '（旧）' : '');

    const groupTitle = !group
      ? '分组：还没读到站点的分组信息'
      : group.allowSwitch
        ? '当前分组 ' + (currentGroup || '未设置') +
          (ratioText(group.ratio) ? '（倍率 ' + ratioText(group.ratio) + '）' : '') +
          ' · 点击切换'
        : currentGroup
          ? '当前分组 ' + currentGroup + ' · 该站点不支持切换'
          : '该站点没有 /v1/token/group，分组只读';

    const groupPill = h(
      'span',
      {
        // flex 不收缩：dock 那行挤的时候，宁可整行溢出也别把分组名压成「分组：…」
        style: { ...pill, cursor: canSwitch ? 'pointer' : 'default', flex: '0 0 auto', maxWidth: 'min(360px, 44vw)' },
        title: groupTitle,
        'data-composer-stat': 'group',
        role: canSwitch ? 'button' : undefined,
        tabIndex: canSwitch ? 0 : undefined,
        onClick: canSwitch ? () => setMenu(!menu) : undefined,
        onKeyDown: (event: any) => {
          if (!canSwitch || !event) return;
          if (event.key === 'Enter' || event.key === ' ') {
            setMenu(!menu);
          }
        },
      },
      layersIcon(h),
      h('span', { key: 'label', style: { ...ellipsis, maxWidth: 'min(320px, 40vw)' } }, groupText(group)),
      canSwitch ? h('span', { key: 'caret', style: { flex: 'none', opacity: 0.65, fontSize: '0.9em' } }, menu ? '▴' : '▾') : null,
    );

    const balancePill = h(
      'span',
      {
        style: { ...pill, flex: '0 0 auto' },
        title,
        'data-composer-stat': 'balance',
        role: 'button',
        tabIndex: 0,
        onClick: () => void load(true),
        onKeyDown: (event: any) => {
          if (event && (event.key === 'Enter' || event.key === ' ')) void load(true);
        },
      },
      walletIcon(h),
      h('span', { key: 'label', style: { ...ellipsis, maxWidth: 220 } }, text),
    );

    /**
     * 分组菜单：**绝对定位在分组胶囊正上方**。
     *
     * 曾经用 `position: fixed` + boundingClientRect 算视口坐标，结果菜单跑到右边
     * 余额胶囊头上 —— 宿主里有个祖先建立了包含块（transform 之类），视口坐标被整体
     * 平移，再叠加右侧回收的 clamp，就固定在右边了。改成「相对胶囊定位」：
     * 外层 span 是 position:relative 的锚，菜单 `left:0; bottom:calc(100% + 6px)`，
     * 天然贴在分组胶囊上沿，跟视口坐标系和包含块都无关。
     */
    const menuNode = !menu
      ? null
      : h(
          'div',
          {
            'data-aimy-group-menu': '',
            style: {
              position: 'absolute' as const,
              left: 0,
              bottom: 'calc(100% + 6px)',
              // 跟着胶囊宽度走（100% = 胶囊宽），长名字再往上放到 400
              minWidth: 'max(220px, 100%)',
              maxWidth: 'min(400px, 70vw)',
              width: 'max-content',
              maxHeight: 320,
              overflowY: 'auto' as const,
              zIndex: 2000,
              padding: 4,
              background: 'var(--dsw-alias-bg-layer-1, Canvas)',
              border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3))',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
              color: 'var(--dsw-alias-label-primary, CanvasText)',
              fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
            },
          },
          h(
            'div',
            {
              key: 'head',
              style: {
                padding: '3px 8px 5px',
                opacity: 0.6,
                fontSize: '0.92em',
                borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2))',
                marginBottom: 3,
              },
            },
            switching ? '正在切换到 ' + switching + '…' : '切换分组（当前 ' + (currentGroup || '未设置') + '）',
          ),
          ...(group ? group.groups : []).map((option: any) =>
            h(
              'button',
              {
                key: option.name,
                type: 'button',
                disabled: Boolean(switching),
                onClick: () => void choose(option.name),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '5px 8px',
                  border: 'none',
                  borderRadius: 4,
                  background:
                    option.name === currentGroup
                      ? 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,.12))'
                      : 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  textAlign: 'left' as const,
                  cursor: switching ? 'default' : 'pointer',
                  fontWeight: option.name === currentGroup ? 600 : 400,
                  opacity: switching && switching !== option.name ? 0.6 : 1,
                },
              },
              h('span', { key: 'name', style: { flex: '1 1 auto', ...ellipsis } }, option.name),
              ratioText(option.ratio)
                ? h(
                    'span',
                    {
                      key: 'ratio',
                      style: { flex: 'none', opacity: 0.6, fontVariantNumeric: 'tabular-nums' },
                    },
                    ratioText(option.ratio),
                  )
                : null,
              option.name === currentGroup
                ? h('span', { key: 'check', style: { flex: 'none' } }, '✓')
                : null,
            ),
          ),
          switchError
            ? h(
                'div',
                {
                  key: 'err',
                  style: {
                    padding: '4px 8px 2px',
                    color: 'var(--dsw-alias-state-error-primary, #d9534f)',
                    whiteSpace: 'normal' as const,
                  },
                },
                switchError,
              )
            : null,
        );

    // 菜单的锚：紧贴分组胶囊、position:relative，菜单绝对定位在它上沿
    const groupAnchor = h(
      'span',
      {
        'data-aimy-group-anchor': '',
        style: { position: 'relative' as const, display: 'inline-flex', alignItems: 'center', minWidth: 0 },
      },
      groupPill,
      menuNode,
    );

    return h(
      'span',
      { style: { display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 0 }, 'data-aimy-composer-row': '' },
      groupAnchor,
      balancePill,
    );
  };
}
