/**
 * 余额胶囊：注册进 `conversation.composer.dock` —— 也就是输入框下方那一行
 * 「143 tok/s · 缓存命中 96% · 7%」右侧，跟它们同一排、同一套字号与颜色。
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
import type { BalanceResponse } from '../shared/types';

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

    const load = useCallback(
      async (force: boolean) => {
        if (force) setBusy(true);
        try {
          const res = await request('/balance' + (force ? '?refresh=1' : ''));
          if (res && res.data) {
            setData(res.data as BalanceResponse);
            setError(res.data.error ? String(res.data.error) : '');
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
      [request],
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

    // 配置里关掉了：整颗不渲染，dock 该行不留空位
    if (data && data.disabled) return null;

    const view = data?.view ?? null;
    const label = data?.displayName || '中转站';
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

    const text = !view
      ? shortName(label) + '余额：' + (error ? '不可用' : '…')
      : pillLabel(view, label) + (error ? '（旧）' : '');

    return h(
      'span',
      {
        style: pill,
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
      h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, text),
    );
  };
}
