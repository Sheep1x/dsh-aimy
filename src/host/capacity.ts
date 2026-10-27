/**
 * 逐模型容量解析：上下文窗口 + 最大输出。
 *
 * 为什么需要三层取值链：
 *   中转站的 `/v1/models` 通常只返回 id（本站实测如此），不提供任何窗口/输出信息。
 *   但「输出上限」不是装饰——pi-ai 只把**逐模型** `entry.maxTokens` 上报为
 *   `info.defaultMaxTokens`，DSH 的 `resolveCallWithInfo()` 用它填请求的默认
 *   `config.maxTokens`，`dsh-compaction-basic` 的 `reservedCompletionTokens()` 也读它。
 *   provider 级的 `defaultMaxTokens` 只是解析 fallback，**不会上报**。
 *   所以只改 provider 级默认值等于没改，必须逐模型声明。
 *
 * 取值链（先到先得）：
 *   1. 站点 /v1/models 自己声明的容量字段 —— 网关说自己的能力，最可信
 *   2. pi-ai 内置目录快照（见 ../shared/capacity-table.ts，官方值）
 *   3. 插件兜底：1M 上下文 / 128K 输出
 *
 * 为什么官方值优先于兜底、且更小也照用：
 *   兜底 1M/128K 只是「不知道时的假设」。官方值若更小（如 hy4-preview 输出 64K），
 *   按 128K 下发会被上游 400；官方若更大（如 deepseek-v4.1-flash 输出 384K），
 *   按 128K 就白丢能力。两边都不该猜，官方说了就听官方的。
 */
import { OFFICIAL_CAPACITY } from '../shared/capacity-table';
import type { RelayModel } from '../shared/types';

/** 插件兜底：上下文窗口。 */
export const FALLBACK_CONTEXT_WINDOW = 1_000_000;
/** 插件兜底：最大输出。 */
export const FALLBACK_MAX_TOKENS = 128_000;

/**
 * 压缩引擎的默认 headroom（@deepseek-ai/dsh-compaction-basic 的 `headroomTokens`）。
 *
 * 它要求 `contextWindow > maxTokens + headroom`，否则 `resolveCompactSpec()`
 * 直接抛 TargetPressureConfigError，那一轮对话就废了。所以声明输出上限时
 * 必须给 headroom 留位置：官方表里确实存在 `contextWindow === maxTokens`
 * 的条目（如某些 128K/128K 的网关条目），照搬会当场炸。
 */
const COMPACTION_HEADROOM_TOKENS = 65_536;

/** 声明过的最小输出上限：低于它就没有实用价值，不如不声明。 */
const MIN_OUTPUT_TOKENS = 1_024;

export type CapacitySource = 'relay' | 'official' | 'default';

export interface Capacity {
  contextWindow: number;
  maxTokens: number;
  source: CapacitySource;
}

/**
 * 把候选 id 归一成查表用的键。
 *
 * 中转站给的 id 常常带厂商前缀或大小写变体：
 *   `deepseek-ai/DeepSeek-V4.1-Flash` → `deepseek-v4.1-flash`
 *   `zai-org/GLM-5.3`                 → `glm-5.3`
 * 官方目录里的键则是扁平的小写 id。逐个候选试，先精确后逐级放宽，
 * 命不中就继续下一条规则，绝不「模糊匹配猜一个」。
 */
function lookupCandidates(id: string): string[] {
  const raw = id.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const tail = lower.split('/').pop() ?? lower;
  const out = [raw, lower, tail];
  // `v4-1` 与 `v4.1` 在官方目录里两种写法都有
  for (const base of [lower, tail]) {
    out.push(base.replace(/(\d)-(?=\d)/gu, '$1.'));
    out.push(base.replace(/(\d)\.(?=\d)/gu, '$1-'));
  }
  return [...new Set(out)];
}

/** 查官方目录快照；查不到返回 undefined（不猜）。 */
export function officialCapacity(id: string): { contextWindow: number; maxTokens: number } | undefined {
  for (const key of lookupCandidates(id)) {
    const hit = OFFICIAL_CAPACITY[key];
    if (hit) return { contextWindow: hit[0], maxTokens: hit[1] };
  }
  return undefined;
}

/**
 * 夹住输出上限，保证压缩引擎仍能解析出正的 pressure budget。
 *
 * 只做**下调**：官方声明本来就更小时不动它；只在「窗口装不下这么大的输出」时
 * 把输出压到 `窗口 - headroom`。窗口小于 headroom 的极端模型（例如 32K 窗口）
 * 无论怎么声明都过不了压缩门槛，那种情况保持原值——那是模型本身的限制，
 * 不该由插件假装解决。
 */
export function clampMaxTokens(contextWindow: number, maxTokens: number): number {
  const room = contextWindow - COMPACTION_HEADROOM_TOKENS;
  if (room < MIN_OUTPUT_TOKENS) return maxTokens;
  return Math.min(maxTokens, room);
}

/** 是否为可用的容量值（正整数）。 */
function usable(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * 解析单个模型的容量。
 *
 * @param model 中转站目录里的条目（可能已带站点声明的容量）
 * @returns 上下文窗口、最大输出与来源标注（来源会显示在面板上）
 */
export function resolveCapacity(model: RelayModel): Capacity {
  const official = officialCapacity(model.id);
  const relayCtx = usable(model.contextWindow) ? model.contextWindow : undefined;
  const relayMax = usable(model.maxTokens) ? model.maxTokens : undefined;

  let contextWindow: number;
  let maxTokens: number;
  let source: CapacitySource;

  if (relayCtx !== undefined || relayMax !== undefined) {
    // 站点只声明了其中一项时，另一项按下一层补齐（不因半份信息整体丢弃）
    contextWindow = relayCtx ?? official?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
    maxTokens = relayMax ?? official?.maxTokens ?? FALLBACK_MAX_TOKENS;
    source = 'relay';
  } else if (official) {
    contextWindow = official.contextWindow;
    maxTokens = official.maxTokens;
    source = 'official';
  } else {
    contextWindow = FALLBACK_CONTEXT_WINDOW;
    maxTokens = FALLBACK_MAX_TOKENS;
    source = 'default';
  }

  return { contextWindow, maxTokens: clampMaxTokens(contextWindow, maxTokens), source };
}

/** 批量解析：返回填好容量的新数组（不修改入参）。
 *
 * 幂等：已经解析过的条目（带 capacitySource）原样返回。否则从缓存读出来的
 * 条目会被再算一遍，站点没声明的模型会被标成 relay —— 来源标注就骗人了。
 */
export function resolveModels(models: RelayModel[]): RelayModel[] {
  return models.map((model) => {
    if (model.capacitySource !== undefined && usable(model.contextWindow) && usable(model.maxTokens)) {
      return model;
    }
    const capacity = resolveCapacity(model);
    return {
      ...model,
      contextWindow: capacity.contextWindow,
      maxTokens: capacity.maxTokens,
      capacitySource: capacity.source,
    };
  });
}

/** 两个目录条目的容量是否一致（挂载时判断要不要重挂）。 */
export function sameCapacity(a: RelayModel, b: RelayModel): boolean {
  return a.contextWindow === b.contextWindow && a.maxTokens === b.maxTokens;
}
