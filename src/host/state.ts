/** 运行态缓存：当前分组 + 最近一次模型目录，落盘到 $DSH_HOME/dsh-aimy/state.json。
 *
 * 只缓存**非密钥**信息。密钥来自 Credentials 服务，永不落盘。
 * 缓存按 baseURL + group 作键，换站点或换组都不会串味。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { RelayModel } from '../shared/types';

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
