/**
 * client 半侧装配层：注入 react → 组装设置分区与侧栏面板 → 注册进 DSH 插槽。
 * 页面本身在 section.ts，这里只做装配。
 */
import { BRAND_ICON_PATH } from '../shared/brand';
import { needsDiagnostics } from '../shared/types';
import { makeBalanceBar, formatMoney, summarize, pillLabel, shortName } from './balance-bar';
import { makeSection } from './section';
import type * as ReactNS from 'react';

/** 左侧栏面板 id / main 面板 key，两者必须一致（sidebar 点图标时用它定位页面）。 */
const PANEL_ID = 'dsh-aimy';
/** 侧栏图标与面板标题的显示名。 */
const PANEL_LABEL = 'Aimy-艾米';
/** 余额胶囊在 composer.dock 里的 id（list 槽，同 id 重复注册会顶掉自己）。 */
const BALANCE_BAR_ID = 'dsh-aimy-balance';

/** 返回 DSH 插件 factory：参数是 require，返回值是 module。 */
export function makeFactory(): (require: (mod: string) => any) => any {
  return (require) => {
    const module = { exports: {} as Record<string, unknown> };

    const react: typeof ReactNS = require('react');
    // 注意：必须用 createElement 而不是 react/jsx-runtime 的 jsx —— jsx(type, props, key)
    // 没有可变 children 参数，section.ts 里的 h(type, props, ...children) 用法会丢子节点。
    const { createElement: h, useCallback, useEffect, useState } = react;

    const name = 'onehub';
    // main / sidebar.panellist 由 @deepseek-ai/dsh-client-ui-layout、-ui-sidebar 声明
    const inject = ['slots'];

    async function request(path: string, init?: RequestInit): Promise<any> {
      const res = await fetch('/dsh-aimy-relay' + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      });
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        return { success: false, message: '响应解析失败' };
      }
    }

    /** 侧栏图标 = 中转站官方 logo 的加粗线稿，数据在 shared/brand.ts。 */
    function RelayIcon(props: any): any {
      const size = props && typeof props.size === 'number' ? props.size : 18;
      const active = Boolean(props && props.active);
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'currentColor',
          style: { display: 'block', opacity: active ? 1 : 0.8 },
          'aria-hidden': 'true',
        },
        h('path', { d: BRAND_ICON_PATH, fillRule: 'evenodd', clipRule: 'evenodd' }),
      );
    }

    function apply(ctx: any): void {
      const deps = { h, useState, useEffect, useCallback, request };
      // 只保留首页左侧栏面板这一个入口。
      // 不再注册 settings.section：宿主设置页左侧 nav 的图标按分区 id 硬编码
      // （只认 account/models/agent-presets/plugins/archived-sessions，其余一律齿轮），
      // 插槽也不消费 icon 字段，插件无法覆盖 —— 与其留一个齿轮行，不如只留侧栏入口。
      const Panel = makeSection(deps, { variant: 'panel' });

      // 主区面板：sidebar 点图标后 layout 会把 activePanelId 设为 PANEL_ID，
      // 这里按 key 命中渲染我们的页面
      ctx.slots.inject('main', function* () {
        yield ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel);
      });

      // 首页左侧栏图标
      ctx.slots.inject('sidebar.panellist', function* () {
        yield ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 30,
            label: () => PANEL_LABEL,
          },
          RelayIcon,
        );
      });

      // 余额胶囊：挂在输入框下方那一行统计栏（「143 tok/s · 缓存命中 96% · 7%」）。
      // 该行是 dsh-client-ui-chat 注册的 `conversation.composer.dock`（kind:list），
      // 里面已有 id `activity`(order 0) 与 `usage`(order 1)；我们用 order 10 排在它们
      // 右侧，样式与它们一致（pill：tertiary 色、小一号字号、tabular-nums）。
      // 关掉开关时组件自身返回 null，那行不留空位。
      const BalancePill = makeBalanceBar(deps);
      ctx.slots.inject('conversation.composer.dock', function* () {
        yield ctx.slots.register(
          { name: 'conversation.composer.dock', id: BALANCE_BAR_ID, order: 10 },
          BalancePill,
        );
      });
    }

    // needsDiagnostics / summarize / formatMoney 一并导出：都是纯函数，
    // 供单测直接验证「什么状态才值得拉诊断」与「余额文案怎么拼」。
    // DSH 只用 apply / inject / name，多导出不影响契约。
    module.exports = { apply, inject, name, needsDiagnostics, summarize, formatMoney, pillLabel, shortName };
    return module.exports;
  };
}
