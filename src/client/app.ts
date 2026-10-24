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
     * 侧栏图标 = 中转站官方 logo 的**线稿**（不是实心轮廓）。
     *
     * 为什么是线稿：logo 的辨识度来自「粗深色描边 + 白色主体 + 蓝色斜带」三层，
     * 把整个外形填成单色，18px 下就只剩一团实心黑（144/324 格全墨），细节全丢。
     * 只取深色描边后墨量降到 22%，圆头、内部两笔、底部开衩、拱洞都还能看出。
     *
     * 路径来源：站点 /logo-icon.png 的深色像素（R,G,B 均 < 130）做 Moore 邻域
     * 闭合轮廓追踪 + Douglas-Peucker 简化，含内部孔洞（evenodd）。
     * 与原描边掩码在 256px 下比对 IoU 89.5%；差异主要来自抗锯齿边缘的取舍。
     */
    const RELAY_ICON_PATH =
      'M11.06 3L12.38 3L12.47 3.09L13.22 3.19L14.25 3.75L15 4.5L16.5 7.31L16.5 7.5L18.19 10.78L18.19 10.97L17.34 11.34L17.25 11.25L16.97 10.69L16.97 10.5L16.59 9.94L16.59 9.75L14.34 5.34L14.16 5.06L13.31 4.31L12.38 3.94L11.06 3.94L10.5 4.13L9.84 4.5L9.19 5.16L8.72 5.91L5.91 11.72L5.91 11.91L5.16 13.5L4.69 14.91L4.59 15L3.56 15L3.66 14.63L4.78 12L4.88 11.53L5.25 10.88L5.25 10.69L7.97 5.16L8.34 4.59L9.09 3.84L10.03 3.28L10.59 3.09L10.97 3.09Z M12.94 8.53L13.41 8.53L13.59 8.63L13.69 8.81L13.78 9.56L13.88 9.66L13.88 10.22L13.69 10.41L13.59 10.5L13.13 10.5L12.84 10.13L12.84 9.66L12.66 9Z M9.94 9.19L10.31 9.19L10.5 9.28L10.69 9.56L10.69 10.97L10.5 11.16L9.94 11.16L9.75 10.97L9.66 9.47Z M19.03 12.94L19.22 13.03L19.22 13.22L19.69 14.16L19.69 14.34L20.44 16.03L20.53 16.5L20.72 16.78L20.91 17.44L20.91 18.38L20.72 19.03L20.34 19.69L19.59 20.34L18.66 20.72L17.06 20.81L16.97 20.72L16.13 20.63L15.38 20.25L14.53 19.5L14.06 18.75L13.69 17.81L13.22 17.16L12.28 17.34L12.19 17.44L11.81 17.44L10.97 17.72L10.13 17.81L9.84 18.09L9.19 19.41L8.53 20.06L7.78 20.44L7.13 20.63L5.63 20.63L4.41 20.25L3.28 19.22L3 18.66L2.81 17.81L2.81 17.25L2.91 17.16L3.84 17.16L3.84 18L3.94 18.28L4.13 18.66L4.78 19.31L5.91 19.69L6.84 19.69L7.69 19.41L8.34 18.84L9.09 17.34L9.47 16.97L13.59 16.13L13.78 16.22L13.97 16.59L14.25 16.78L15.19 18.66L15.75 19.31L16.41 19.69L16.69 19.69L16.78 19.78L17.25 19.78L17.34 19.88L18.38 19.78L19.31 19.31L19.69 18.84L19.88 18.28L19.88 17.53L19.59 16.69L19.41 16.41L18.47 13.88L18.19 13.41L18.19 13.31Z';

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
