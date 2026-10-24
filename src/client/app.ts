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
     * 侧栏图标 = 中转站官方 logo 的**加粗线稿**。
     *
     * 演进过程（每一步都由像素统计推动，不靠手感）：
     *   1) 一开始把整个外形填成单色 → 18px 下 144/324 格全墨，是一团黑；
     *      logo 的辨识度来自「深色描边 + 白主体 + 蓝斜带」三层，单色填充把层次丢了。
     *   2) 只取深色描边做线稿 → 墨量降到 70/324（22%），能看结构但线条偏细；
     *      原描边在 24 视框下仅约 0.2 单位宽，18px 渲染出来不到 1px。
     *   3) 对描边掩码做形态学膨胀（半径 8/256，等效线宽 +1.5 单位）再矢量化
     *      → 18px 下 124/324（38%），线条扎实且圆头、内部两笔、底部开衩、拱洞仍可辨。
     *
     * 路径来源：站点 /logo-icon.png 的深色像素（R,G,B 均 < 130）→ 形态学膨胀 →
     * Moore 邻域闭合轮廓追踪 → Douglas-Peucker 简化，含内部孔洞（evenodd）。
     * 与加粗掩码在 256px 下比对 IoU 95.3%。
     */
    const RELAY_ICON_PATH =
      'M11.06 2.25L12.38 2.25L12.47 2.34L12.84 2.34L13.5 2.53L14.72 3.19L15.56 4.03L16.22 5.34L16.41 5.53L17.16 7.03L17.16 7.22L18.84 10.5L18.94 10.78L18.84 11.25L18.66 11.53L17.34 12.09L16.88 11.91L16.69 11.72L16.31 10.97L16.31 10.78L16.03 10.41L15.94 10.03L13.78 5.81L13.13 5.06L12.66 4.78L12.38 4.69L11.06 4.69L10.59 4.88L9.75 5.63L9 6.94L7.03 10.97L7.03 11.16L6.56 12L6.09 13.31L5.81 13.78L5.34 15.19L5.06 15.56L4.59 15.75L3.56 15.75L3.09 15.56L2.81 15L3 14.34L3.38 13.59L3.47 13.13L4.13 11.72L4.22 11.25L5.16 9.38L5.16 9.19L7.41 4.69L7.78 4.13L8.63 3.28L9.19 2.91L9.75 2.63Z M12.94 7.78L13.41 7.78L14.06 8.06L14.53 9.09L14.53 9.56L14.63 9.66L14.53 10.5L14.06 11.06L13.69 11.16L13.59 11.25L13.13 11.25L12.66 11.06L12.38 10.78L12.09 10.13L12.09 9.66L11.91 9.09L12.09 8.44L12.47 7.97Z M9.94 8.44L10.31 8.44L10.97 8.72L11.16 8.91L11.44 9.56L11.44 10.97L11.34 11.25L10.97 11.72L10.5 11.91L9.94 11.91L9.47 11.72L9.09 11.25L9 10.59L8.91 10.5L8.91 9.47L9 9.19L9.47 8.63Z M19.03 12.19L19.41 12.28L19.78 12.56L20.72 14.81L20.72 15L20.91 15.28L20.91 15.47L21.09 15.75L21.66 17.44L21.66 18.38L21.38 19.31L21.09 19.88L20.44 20.63L19.5 21.19L18.66 21.47L18.19 21.47L18.09 21.56L17.06 21.56L16.97 21.47L16.5 21.47L15.84 21.28L14.63 20.63L13.97 19.97L13.5 19.22L13.13 18.28L12.84 18L12.19 18.19L11.81 18.19L10.97 18.47L10.59 18.47L10.31 18.75L9.75 19.88L9 20.63L8.06 21.09L7.13 21.38L5.63 21.38L3.94 20.81L2.72 19.69L2.34 18.94L2.34 18.75L2.06 18L2.06 17.25L2.25 16.78L2.44 16.59L2.91 16.41L3.84 16.41L4.31 16.59L4.59 17.16L4.59 18L5.25 18.75L5.91 18.94L6.84 18.94L6.94 18.84L7.22 18.84L7.78 18.38L8.53 16.88L9 16.41L9.84 16.13L10.22 16.13L10.31 16.03L10.69 16.03L11.16 15.84L11.53 15.84L12 15.66L13.59 15.38L14.25 15.66L14.81 16.31L15.75 18.19L16.22 18.75L16.5 18.94L17.25 19.03L17.34 19.13L18.38 19.03L19.03 18.47L19.13 18.28L19.13 17.53L17.44 13.31L17.72 12.75Z';

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
