// 假 pi-ai 适配器，导出形状对齐 @deepseek-ai/dsh-llm-pi-ai：
//   - 插件本体：name / inject / apply / Config（挂在模块命名空间上）
//   - PiAiAdapter：适配器**实现类**，不是插件（真包里就是这样，挂错它会导致模型不出现）
export const mounts = [];

export const name = 'llm-pi-ai';
export const inject = ['llm'];
export const Config = { providers: {} };

export function apply(ctx, config) {
  mounts.push(JSON.parse(JSON.stringify(config?.providers ?? {})));
  return () => {
    // 卸载标记：重挂载时应先 dispose 旧 fiber
    mounts.push({ disposed: true });
  };
}

/** 与真包同名同形状：只是个类，没有 apply，不能交给 ctx.plugin()。 */
export class PiAiAdapter {
  constructor(config) {
    this.config = config;
  }
}

export default { name, inject, apply, Config, PiAiAdapter };
