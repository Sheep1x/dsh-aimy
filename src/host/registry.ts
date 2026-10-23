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
}

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

  const provider = {
    displayName: target.displayName,
    api: target.api,
    baseURL: target.baseURL,
    apiKeyEnv: target.apiKeyRef,
    defaultContextWindow: target.defaultContextWindow,
    defaultMaxTokens: target.defaultMaxTokens,
    models: target.models.map((m) => ({ id: m.id })),
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
 * 把 provider 从现有 pi-ai 条目里移除（清除密钥或切换档案时用）。
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
