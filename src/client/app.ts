/**
 * client 半侧装配层：注入 react → 组装设置分区与侧栏面板 → 注册进 DSH 插槽。
 * 页面本身在 section.ts，这里只做装配。
 */
import { makeSection } from './section';
import type * as ReactNS from 'react';

/** 设置页分区 id / 左侧栏面板 id / main 面板 key，三者必须一致。 */
const PANEL_ID = 'dsh-aimy';
/** 设置页分区名与侧栏面板名。 */
const PANEL_LABEL = 'Aimy-艾米';

/** 返回 DSH 插件 factory：参数是 require，返回值是 module。 */
export function makeFactory(): (require: (mod: string) => any) => any {
  return (require) => {
    const module = { exports: {} as Record<string, unknown> };

    const react: typeof ReactNS = require('react');
    // 注意：必须用 createElement 而不是 react/jsx-runtime 的 jsx —— jsx(type, props, key)
    // 没有可变 children 参数，section.ts 里的 h(type, props, ...children) 用法会丢子节点。
    const { createElement: h, useCallback, useEffect, useState } = react;

    const name = 'onehub';
    // 设置分区插槽由 @deepseek-ai/dsh-client-ui-settings 声明，
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

    /** 侧栏图标：中转站（中心节点 + 三个卫星节点），跟随 currentColor 与主题。 */
    function RelayIcon(props: any): any {
      const size = props && typeof props.size === 'number' ? props.size : 18;
      const active = Boolean(props && props.active);
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 2 : 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { display: 'block', opacity: active ? 1 : 0.9 },
          'aria-hidden': 'true',
        },
        h('circle', { key: 'c', cx: 12, cy: 12, r: 2.4 }),
        h('circle', { key: 't', cx: 12, cy: 4.2, r: 1.9 }),
        h('circle', { key: 'r', cx: 19, cy: 16.4, r: 1.9 }),
        h('circle', { key: 'l', cx: 5, cy: 16.4, r: 1.9 }),
        h('path', { key: 'lt', d: 'M12 9.6V6.1' }),
        h('path', { key: 'lr', d: 'M14.2 13.2l3.1 1.8' }),
        h('path', { key: 'll', d: 'M9.8 13.2l-3.1 1.8' }),
      );
    }

    function apply(ctx: any): void {
      const deps = { h, useState, useEffect, useCallback, request };
      // 设置页分区：紧凑版
      const Section = makeSection(deps, { variant: 'settings' });
      // 左侧栏面板页：占满主区、自带滚动
      const Panel = makeSection(deps, { variant: 'panel' });

      ctx.slots.inject('settings.section', function* () {
        yield ctx.slots.register(
          {
            name: 'settings.section',
            id: 'onehub-relay',
            order: 40,
            label: () => PANEL_LABEL,
          },
          Section,
        );
      });

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
    }

    module.exports = { apply, inject, name };
    return module.exports;
  };
}
