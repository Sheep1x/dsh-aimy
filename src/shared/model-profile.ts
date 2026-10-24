/**
 * 模型能力声明：cost、思考档位等。
 *
 * 为什么必须显式声明 reasoningEfforts：
 * pi-ai 的 resolveModelReasoning() 里，未声明时走
 * `reasoning: base?.reasoning ?? false` —— 即**没有思考档位可选**。
 * 中转站的模型普遍支持 thinking，所以这里显式给出四档，
 * 否则模型选择器里看不到档位下拉。
 *
 * 档位取值必须是 pi-ai 的 THINKING_LEVELS 之一：
 * off / minimal / low / medium / high / xhigh / max。
 * 只有 off 可以留空（null = 不发该参数），其余必须有 wire 值。
 */

/** 思考档位 → 下发给线路的值。off 留空表示不发送思考参数。 */
export const REASONING_EFFORTS = {
  off: null,
  low: 'low',
  medium: 'medium',
  high: 'high',
} as const;

/** 插件默认的思考档位。 */
export const DEFAULT_REASONING_EFFORT = 'high';

/**
 * 用量计价表。
 *
 * pi-ai 的 calculateCost() 会读 model.cost.tiers，缺失时虽会回退 NO_COST，
 * 但显式声明更稳：全 0 表示「不掌握上游定价、不参与计费估算」，
 * 不是声称免费。
 */
export const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

/** 把一个模型条目补全成 pi-ai 可用的 profile entry。 */
export function modelEntry(id: string, name?: string): Record<string, unknown> {
  return {
    id,
    ...(name === undefined ? {} : { name }),
    cost: { ...ZERO_COST },
    reasoningEfforts: { ...REASONING_EFFORTS },
  };
}
