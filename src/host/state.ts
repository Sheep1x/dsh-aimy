/** 运行态缓存：当前分组 + 最近一次模型目录，落盘到 $DSH_HOME/dsh-aimy/state.json。
 *
 * 只缓存**非密钥**信息。密钥来自 Credentials 服务，永不落盘。
 * 缓存按 baseURL + group 作键，换站点或换组都不会串味。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { RelayModel, TokenGroupState } from '../shared/types';

export interface CachedCatalog {
  baseURL: string;
  group: string;
  models: RelayModel[];
  fetchedAt: number;
}

interface StateFile {
  version: 1;
  catalogs: CachedCatalog[];
}

export function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  return join(homedir(), '.dsh');
}

export class CatalogStore {
  private data: StateFile = { version: 1, catalogs: [] };

  constructor(private readonly filePath: string = join(resolveDshHome(), 'dsh-aimy', 'state.json')) {}

  load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as StateFile;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.catalogs)) {
        this.data = { version: 1, catalogs: parsed.catalogs.filter(isCatalog) };
      }
    } catch {
      // 文件缺失或损坏：按空状态启动，下一次写入自然重建
      this.data = { version: 1, catalogs: [] };
    }
  }

  get(baseURL: string, group: string): CachedCatalog | undefined {
    return this.data.catalogs.find((c) => c.baseURL === baseURL && c.group === group);
  }

  /**
   * 该站点最近一次的目录（不区分分组）。
   *
   * 冷启动时还不知道当前分组（分组要打网络才知道），但模型路由需要在启动时就挂上，
   * 否则模型选择器在整个「用户点开面板之前」都是空的。用最近的目录做预热即可，
   * 面板刷新后会用真实分组目录重挂。
   */
  latest(baseURL: string): CachedCatalog | undefined {
    let newest: CachedCatalog | undefined;
    for (const catalog of this.data.catalogs) {
      if (catalog.baseURL !== baseURL) continue;
      if (!newest || catalog.fetchedAt > newest.fetchedAt) newest = catalog;
    }
    return newest;
  }

  set(catalog: CachedCatalog): void {
    this.data.catalogs = this.data.catalogs.filter(
      (c) => !(c.baseURL === catalog.baseURL && c.group === catalog.group),
    );
    this.data.catalogs.push(catalog);
    this.flush();
  }

  private flush(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {
      // 落盘失败只影响下次冷启动的预热，不影响本次会话
    }
  }
}

function isCatalog(value: unknown): value is CachedCatalog {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return typeof c.baseURL === 'string' && typeof c.group === 'string' && Array.isArray(c.models);
}

/**
 * 面板加载耗时的主因：分组信息每次都要联网。
 *
 * `/v1/token/group` 实测长尾很难看（12 次里最高 2158ms，中位数约 38ms），
 * 而面板每次打开都会等它——可它只影响「切换分组」那一块 UI，与模型目录、
 * 密钥状态、挂载状态都无关。分组信息又是长期稳定的（一天可能都不变），
 * 每次都重新问一遍纯属白等。
 *
 * 缓存策略：TTL 内直接用；过期后**先返回旧值，再后台异步刷新**
 * （stale-while-revalidate）。用户永远不为这个请求排队，代价是分组信息
 * 最多陈旧 5 分钟——而分组变化本来就不是需要秒级感知的东西。
 *
 * 只放内存，不落盘：倍率与可选分组属于易变信息，跨进程复用意义不大。
 */
export interface CachedGroup {
  state: TokenGroupState;
  fetchedAt: number;
}

/** 分组信息的新鲜期（毫秒）。 */
export const GROUP_CACHE_TTL_MS = 5 * 60_000;

export class GroupCache {
  private readonly entries = new Map<string, CachedGroup>();
  /** 正在后台刷新的 key，避免同一站点并发打多次。 */
  private readonly refreshing = new Set<string>();
  /** 不支持分组接口的站点（404）：记住结论，别每次打开面板都撞一遍。 */
  private readonly unsupported = new Set<string>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** 读取缓存，不触发任何网络。 */
  peek(baseURL: string): CachedGroup | undefined {
    return this.entries.get(baseURL);
  }

  /** 缓存是否仍在新鲜期内。 */
  fresh(baseURL: string): boolean {
    const hit = this.entries.get(baseURL);
    return hit !== undefined && this.now() - hit.fetchedAt < GROUP_CACHE_TTL_MS;
  }

  /** 该站点已确认没有分组接口。 */
  knownUnsupported(baseURL: string): boolean {
    return this.unsupported.has(baseURL);
  }

  /** 记住「该站点没有分组接口」这个结论。 */
  markUnsupported(baseURL: string): void {
    this.unsupported.add(baseURL);
    this.entries.delete(baseURL);
  }

  set(baseURL: string, state: TokenGroupState): void {
    this.entries.set(baseURL, { state, fetchedAt: this.now() });
    this.unsupported.delete(baseURL);
  }

  /** 切组成功后直接更新，省掉一次后台刷新（切组响应里已带最新分组信息）。 */
  apply(baseURL: string, state: TokenGroupState): void {
    this.set(baseURL, state);
  }

  /** 占位：返回 false 表示已有刷新在跑，调用方不必重复发起。 */
  beginRefresh(baseURL: string): boolean {
    if (this.refreshing.has(baseURL)) return false;
    this.refreshing.add(baseURL);
    return true;
  }

  endRefresh(baseURL: string): void {
    this.refreshing.delete(baseURL);
  }

  /** 仅供测试：清空全部状态。 */
  clear(): void {
    this.entries.clear();
    this.unsupported.clear();
    this.refreshing.clear();
  }
}
