/**
 * 把 provider 路由挂进 DSH 模型选择器的两条路。
 *
 * 首选：**写进现有 @deepseek-ai/dsh-llm-pi-ai 实例的配置**（settings 服务的 volatile 通道）。
 * 兜底：自己 `ctx.plugin(PiAi) {` 一个实例。
 *
 * 为什么首选 settings 而不是自己挂：
 * pi-ai 的 apply() 会先 `ctx.llm.registerConfigurableProviders(entries)`，
 * 其 entries 除了自己的 provider 还包含**整张内置目录**（anthropic / openai / deepseek … 42 条）。
 * 这个注册是全有或全无：只要有一条已被别的实例注册过，就整体抛错，
 * apply 直接失败（fiber.state = 3），后面的 `registerAdapter(['onehub'])` 根本不会执行。
 * profile 里已经有 llm-pi-ai 条目时，我们再挂第二个实例必然踩这条 —— 实测 providers 里
 * 永远看不到 onehub，而 llm 服务本身是好的。
 *
 * 写 settings 则完全避开重复注册：provider 进入的是**同一个** pi-ai 实例的 profiles()，
 * 由它自己调 registerAdapter；也顺带获得 Models 设置页的可编辑能力。
 */
import {
  DEFAULT_REASONING_EFFORT,
  MODEL_INPUT_TEXT,
  MODEL_INPUT_TEXT_IMAGE,
  modelEntry,
} from '../shared/model-profile';
import type { RelayApi, RelayModel } from '../shared/types';

export interface RegistryTarget {
  /** settings/profile 里 pi-ai 条目的 id，默认 llm-pi-ai */
  settingsNs: string;
  /** pi-ai 路由名（也是 provider id）*/
  routeName: string;
  displayName: string;
  baseURL: string;
  apiKeyRef: string;
  api: RelayApi;
  models: RelayModel[];
  defaultContextWindow: number;
  defaultMaxTokens: number;
  /** 是否声明图片输入（默认开）。关掉后模型只声明 text。 */
  imageInput?: boolean;
}

/** 默认模型选择所在的 profile 条目 id（DSH 内置插件）。 */
const DEFAULT_MODEL_NS = 'agent-default-model';

export type RegistryOutcome =
  | { kind: 'settings'; ns: string }
  | { kind: 'self-mounted' }
  | { kind: 'skipped'; reason: string };

/** settings 服务是否具备写 volatile 字段的能力。 */
function settingsWriter(ctx: any): any | undefined {
  const settings = typeof ctx?.get === 'function' ? ctx.get('settings', false) : undefined;
  if (!settings) return undefined;
  if (typeof settings.update !== 'function') return undefined;
  return settings;
}

/**
 * 判断现有 pi-ai 条目是否可写：settings.describe() 里能查到该命名空间。
 * @returns 该命名空间的表单描述，或 undefined
 */
function describeNamespace(settings: any, ns: string): any | undefined {
  try {
    const rows = settings.describe({ redactSecrets: true });
    if (!Array.isArray(rows)) return undefined;
    return rows.find((row: any) => row?.ns === ns);
  } catch {
    return undefined;
  }
}

/**
 * 把 provider 写进现有 pi-ai 条目的 providers.<routeName>。
 *
 * 只提交**我们这一条** provider：settings.update 是深合并（mergeLayers），
 * 不会碰别人的 aimy / aimy-gpt 等路由。
 *
 * @returns 写入结果；settings 不可用或条目不存在时返回 undefined 让调用方走兜底
 */
export async function writeProviderViaSettings(
  ctx: any,
  target: RegistryTarget,
): Promise<RegistryOutcome | undefined> {
  const settings = settingsWriter(ctx);
  if (!settings) return undefined;
  if (!describeNamespace(settings, target.settingsNs)) return undefined;

  const imageInput = target.imageInput !== false;
  const provider = {
    displayName: target.displayName,
    api: target.api,
    baseURL: target.baseURL,
    apiKeyEnv: target.apiKeyRef,
    defaultContextWindow: target.defaultContextWindow,
    defaultMaxTokens: target.defaultMaxTokens,
    // provider 级兜底：逐模型已经声明了 input，这里再兜一层，
    // 免得哪天某个模型条目的 input 被写成空数组（declaredInput 对空数组返回
    // undefined，会直接回落到这里）。
    defaultInput: [...(imageInput ? MODEL_INPUT_TEXT_IMAGE : MODEL_INPUT_TEXT)],
    // 必须带 cost 与 reasoningEfforts：少了后者，pi-ai 会认为该模型不支持思考，
    // 模型选择器里就没有档位可选（resolveModelReasoning 未声明时回退 reasoning:false）。
    // 逐模型 maxTokens 也必须带：provider 级的 defaultMaxTokens 不上报给 DSH。
    models: target.models.map((m) => modelEntry(m, imageInput)),
  };

  try {
    await settings.update(target.settingsNs, {
      providers: { [target.routeName]: provider },
    });
    return { kind: 'settings', ns: target.settingsNs };
  } catch (error) {
    // 写失败（非 volatile 字段 / 条目被删 / 版本冲突）→ 交给调用方走兜底
    return undefined;
  }
}

/**
 * 把默认思考档位设为 high。
 *
 * 为什么需要这一步：模型声明了 reasoningEfforts 只是让**档位可选**，
 * 实际下发什么档位由 agent-default-model 的 reasoningEffort 决定。
 * 不设的话走模型/线路默认，用户看到的是「没档位」的观感。
 *
 * 只在当前默认选择确实指向本插件路由时才写，避免抢别的 provider 的设置。
 *
 * @returns 写入结果；不需要写或写不进去时返回 false
 */
export async function setDefaultReasoningEffort(
  ctx: any,
  target: Pick<RegistryTarget, 'settingsNs' | 'routeName'>,
  effort: string = DEFAULT_REASONING_EFFORT,
): Promise<boolean> {
  const settings = settingsWriter(ctx);
  if (!settings || typeof settings.update !== 'function') return false;

  // 先确认默认选择指向我们的路由，否则不动
  try {
    const model = typeof ctx?.get === 'function' ? ctx.get('agentDefaultModel', false) : undefined;
    const current = model && typeof model.currentSelection === 'function' ? model.currentSelection() : undefined;
    if (!current || current.provider !== target.routeName) return false;
  } catch {
    return false;
  }

  try {
    // agent-default-model 是独立的 profile 条目，ns 就是它的插件 id
    await settings.update(DEFAULT_MODEL_NS, { reasoningEffort: effort });
    return true;
  } catch {
    return false;
  }
}

/** 把 provider 从现有 pi-ai 条目里移除（清除密钥或切换档案时用）。
 * 用 unset 语义删除字段：settings.mutate 的 op.path 指向 providers.<routeName>。
 */
export async function removeProviderViaSettings(
  ctx: any,
  target: Pick<RegistryTarget, 'settingsNs' | 'routeName'>,
): Promise<boolean> {
  const settings = settingsWriter(ctx);
  if (!settings) return false;
  if (typeof settings.mutate !== 'function') return false;
  if (!describeNamespace(settings, target.settingsNs)) return false;
  try {
    await settings.mutate(target.settingsNs, [
      { op: 'unset', path: ['providers', target.routeName] },
    ]);
    return true;
  } catch {
    return false;
  }
}
