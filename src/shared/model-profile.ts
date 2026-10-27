/**
 * 模型能力声明：上下文窗口、输入模态、cost、思考档位等。
 *
 * 为什么每一项都必须显式声明：
 *   - reasoningEfforts：pi-ai 的 resolveModelReasoning() 里，未声明时走
 *     `reasoning: base?.reasoning ?? false` —— 即**没有思考档位可选**，
 *     模型选择器里看不到档位下拉。中转站的模型普遍支持 thinking，这里给四档。
 *   - contextWindow：解析顺序是 `entry.contextWindow ?? 目录值 ?? defaultContextWindow`。
 *     不逐模型声明时，provider 级的 defaultContextWindow 会顶上来，
 *     于是「1M 上下文」的模型在选择器/用量表里被显示成 128K，
 *     压缩阈值、压力百分比也全都按小窗口算。
 *   - input：`declaredInput()` 对「缺省」和「空数组」都返回 undefined（回落到
 *     provider 的 defaultInput = ['text']），所以只能逐模型写非空数组。
 *     不声明就默认「纯文本」，贴图会被当场拒绝。
 *
 * 取值约束（对齐 @deepseek-ai/dsh-llm-pi-ai）：
 *   - MODALITIES = text | image
 *   - THINKING_LEVELS = off / minimal / low / medium / high / xhigh / max
 *     只有 off 可以留空（null = 不发该参数），其余必须有 wire 值。
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
 * 上下文窗口的兜底值（1M）。
 *
 * 中转站 /v1/models 只返回 id、站点也没声明容量时用这个数。
 * 注意这不是纯装饰：dsh-compaction-basic 的 thresholdTokens、
 * 溢出判定和用量压力百分比都是拿这个数算的。
 *
 * 实际取值由 ../host/capacity.ts 决定（站点声明 ?? 官方目录 ?? 这个兜底），
 * 别再把它当所有模型的统一值。
 */
export const MODEL_CONTEXT_WINDOW = 1_000_000;

/**
 * 最大输出 token 的兜底值（128K）。
 *
 * 必须**逐模型**写进 entry 的 `maxTokens`：pi-ai 只把 entry 级的 maxTokens
 * 上报成 `info.defaultMaxTokens`，provider 级的 `defaultMaxTokens` 只是解析
 * fallback、不会上报。DSH 的 `resolveCallWithInfo()` 与压缩预算都只读前者，
 * 所以只改 provider 级默认值等于没改（详见 ../host/capacity.ts）。
 */
export const MODEL_DEFAULT_MAX_TOKENS = 128_000;

/** 输入模态。顺序固定，pi-ai 的 MODALITIES 就是 text / image。 */
export const MODEL_INPUT_TEXT = ['text'] as const;
export const MODEL_INPUT_TEXT_IMAGE = ['text', 'image'] as const;

/**
 * 用量计价表。
 *
 * pi-ai 的 calculateCost() 会读 model.cost.tiers，缺失时虽会回退 NO_COST，
 * 但显式声明更稳：全 0 表示「不掌握上游定价、不参与计费估算」，
 * 不是声称免费。
 */
export const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

/**
 * 把一个模型条目补全成 pi-ai 可用的 profile entry。
 *
 * @param model 目录条目；`contextWindow` / `maxTokens` 由 ../host/capacity.ts
 *   解析好之后填进来（站点声明 ?? 官方目录 ?? 兜底）。缺失时退回兜底值，
 *   保证 entry 永远带合法的正整数——pi-ai 的 schema 对两者都要求 min(1)。
 * @param imageInput 是否声明图片输入（面板上的开关，默认开）。
 *   关掉之后只声明 text：pi-ai 会在贴图阶段就拒绝，
 *   比让上游在整轮中途报错要干净。
 */
export function modelEntry(
  model: { id: string; name?: string; contextWindow?: number; maxTokens?: number },
  imageInput = true,
): Record<string, unknown> {
  const { id, name } = model;
  return {
    id,
    ...(name === undefined ? {} : { name }),
    // 逐模型声明是唯一会被 DSH 采纳的路径（见 MODEL_DEFAULT_MAX_TOKENS 的说明）。
    contextWindow: positiveOr(model.contextWindow, MODEL_CONTEXT_WINDOW),
    maxTokens: positiveOr(model.maxTokens, MODEL_DEFAULT_MAX_TOKENS),
    input: [...(imageInput ? MODEL_INPUT_TEXT_IMAGE : MODEL_INPUT_TEXT)],
    cost: { ...ZERO_COST },
    reasoningEfforts: { ...REASONING_EFFORTS },
  };
}

/** 取一个合法的正整数容量值；缺失或非法时用兜底。 */
function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}
