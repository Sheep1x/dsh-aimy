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

    /**
     * 侧栏图标 = 中转站官方 logo 的矢量轮廓。
     *
     * 路径数据不是手画的，而是把站点 /logo-icon.png 的 alpha 通道
     * 用 Moore 邻域追踪出闭合轮廓、再经 Douglas-Peucker 简化（60 点）得到，
     * 与原图 256px 栅格相比 IoU 98.5%。描边式单色路径，跟随 currentColor，
     * 亮/暗主题都自适应；视框 24×24 与侧栏图标惯例一致。
     */
    const RELAY_ICON_PATH =
      'M11.06 3l1.32 0l0.84 0.19l0.75 0.37l0.75 0.57l0.47 0.65l1.4 2.72l1.5 -0.28l0.75 0l0.1 -0.09l2.15 0l1.32 0.28l0.65 0.37l0.38 0.47l0.09 0.75l-0.37 0.84l-1.03 1.04l-0.66 0.46l-2.44 1.32l1.41 3.37l0.47 1.41l0 0.94l-0.38 1.03l-0.65 0.75l-0.66 0.37l-1.13 0.28l-1.03 0l-0.93 -0.18l-0.75 -0.38l-0.85 -0.75l-0.47 -0.75l-0.37 -0.94l-0.28 -0.47l-0.28 -0.18l-3.1 0.75l-0.84 1.5l-0.66 0.65l-0.75 0.38l-0.65 0.19l-1.6 0l-1.12 -0.38l-1.13 -1.03l-0.47 -1.22l0 -0.84l0.1 -0.1l-0.1 -0.18l-1.12 -0.1l-0.56 -0.19l-0.47 -0.28l-0.28 -0.47l0 -0.46l0.18 -0.38l1.13 -1.22l1.22 -0.84l1.87 -1.03l1.03 -2.44l2.25 -4.5l0.28 -0.38l0.75 -0.75l0.57 -0.37z';

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
          style: { display: 'block', opacity: active ? 1 : 0.85 },
          'aria-hidden': 'true',
        },
        h('path', { d: RELAY_ICON_PATH, fillRule: 'evenodd', clipRule: 'evenodd' }),
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
