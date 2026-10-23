// 假 pi-ai 适配器：记录每一次挂载的 providers 配置，供集成测试断言。
export const mounts = [];

export const PiAiAdapter = {
  name: 'llm-pi-ai',
  inject: ['llm'],
  apply(ctx) {
    mounts.push(JSON.parse(JSON.stringify(ctx.config?.providers ?? {})));
    return () => {
      // 卸载标记：重挂载时应先 dispose 旧 fiber
      mounts.push({ disposed: true });
    };
  },
};

export const Config = { providers: {} };
export default { PiAiAdapter, Config };
