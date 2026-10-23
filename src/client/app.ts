/**
 * client 半侧装配层：注入 react → 组装设置分区 → 注册进 DSH 插槽。
 * 页面本身在 section.ts，这里只做装配。
 */
import { makeSection } from './section';
import type * as ReactNS from 'react';

/** 返回 DSH 插件 factory：参数是 require，返回值是 module。 */
export function makeFactory(): (require: (mod: string) => any) => any {
  return (require) => {
    const module = { exports: {} as Record<string, unknown> };

    const react: typeof ReactNS = require('react');
    const { useCallback, useEffect, useState } = react;
    const { jsx: h } = require('react/jsx-runtime');

    const name = 'onehub';
    // 设置分区插槽由 @deepseek-ai/dsh-client-ui-settings 声明
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

    function apply(ctx: any): void {
      const Section = makeSection({ h, useState, useEffect, useCallback, request });

      ctx.slots.inject('settings.section', function* () {
        yield ctx.slots.register(
          {
            name: 'settings.section',
            id: 'onehub-relay',
            order: 40,
            label: () => '中转站',
          },
          Section,
        );
      });
    }

    module.exports = { apply, inject, name };
    return module.exports;
  };
}
