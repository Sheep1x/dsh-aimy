/**
 * 配置档案（profile）层。
 *
 * 两个档案：
 *   - aimy：内置预设（本站中转站）。URL 固化在代码/配置里，界面上不展示、不可编辑。
 *   - compat：兼容模式，用户自己填 URL + 协议（new-api / sub2api / 任意 OpenAI 兼容网关）。
 *
 * 协议支持三种（与 pi-ai 的 supportedProtocols() 一致）：
 *   openai-responses（默认）/ openai-completions / anthropic-messages。
 *
 * 密钥都走 DSH 凭据库，按档案各用各的引用名，互不覆盖。
 * 兼容模式只把「非密钥」的地址与协议落盘（profiles.json）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DEFAULT_API, type RelayApi } from '../shared/types';
import { resolveDshHome } from './state';

export type ProfileId = 'aimy' | 'compat';

export interface ProfileConfig {
  id: ProfileId;
  displayName: string;
  /** 空串表示「未配置」 */
  baseURL: string;
  apiKeyRef: string;
  routeName: string;
  api: RelayApi;
  /** 预设档案：界面上不展示、不可编辑地址 */
  preset: boolean;
  defaultContextWindow: number;
  defaultMaxTokens: number;
}

export const AIMY_DEFAULT_BASE_URL = 'https://aimy.sheep1x.top';
export const AIMY_DEFAULT_DISPLAY_NAME = 'Aimy-艾米';
export const COMPAT_DISPLAY_NAME = '兼容模式';
export const COMPAT_KEY_REF = 'ONEHUB_COMPAT_API_KEY';

export interface CompatSettings {
  baseURL: string;
  api: RelayApi;
}

interface ProfileFile {
  version: 1;
  compat?: CompatSettings;
}

function profilesPath(): string {
  return join(resolveDshHome(), 'dsh-aimy', 'profiles.json');
}

/** 兼容模式的可编辑设置（地址 + 协议），不含密钥。 */
export class ProfileSettingsStore {
  private data: ProfileFile = { version: 1 };

  constructor(private readonly filePath: string = profilesPath()) {}

  load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as ProfileFile;
      if (parsed && parsed.version === 1 && parsed.compat && typeof parsed.compat.baseURL === 'string') {
        this.data = {
          version: 1,
          compat: { baseURL: parsed.compat.baseURL, api: normalizeApi(parsed.compat.api) },
        };
      }
    } catch {
      this.data = { version: 1 };
    }
  }

  compat(): CompatSettings | undefined {
    return this.data.compat;
  }

  setCompat(settings: CompatSettings): void {
    this.data = { version: 1, compat: { baseURL: settings.baseURL, api: normalizeApi(settings.api) } };
    this.persist();
  }

  clearCompat(): void {
    this.data = { version: 1 };
    this.persist();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {
      // 落盘失败只影响下次冷启动，不影响当前会话
    }
  }
}

/**
 * 把任意输入归到三种受支持协议之一。
 *
 * 取值必须与 @deepseek-ai/dsh-llm-pi-ai 的 supportedProtocols() 完全一致，
 * 否则 pi-ai 的 Config 校验会报 "names api ..., which this build cannot serve"。
 * 未识别时退回 DEFAULT_API（Responses），而不是旧实现那样一律塞进 completions。
 */
export function normalizeApi(value: unknown): RelayApi {
  if (value === 'openai-responses' || value === 'openai-completions' || value === 'anthropic-messages') {
    return value;
  }
  // 兼容旧写法 / 常见别名
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'responses' || v === 'openai-response' || v === 'openai_responses') return 'openai-responses';
    if (v === 'completions' || v === 'chat-completions' || v === 'openai' || v === 'openai-chat') return 'openai-completions';
    if (v === 'anthropic' || v === 'messages' || v === 'claude') return 'anthropic-messages';
  }
  return DEFAULT_API;
}

export function isProfileId(value: unknown): value is ProfileId {
  return value === 'aimy' || value === 'compat';
}

/** 规整用户填的地址：去尾斜杠；兼容模式允许带不带 /v1。 */
export function normalizeBaseURL(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export interface ResolveProfileInput {
  id: ProfileId;
  settings: ProfileSettingsStore;
  defaults: {
    baseURL: string;
    apiKeyRef: string;
    routeName: string;
    displayName: string;
    api: RelayApi;
    defaultContextWindow: number;
    defaultMaxTokens: number;
  };
}

/** 解析出某档案的生效配置。 */
export function resolveProfile(input: ResolveProfileInput): ProfileConfig {
  const { id, settings, defaults } = input;
  if (id === 'aimy') {
    return {
      id,
      displayName: defaults.displayName,
      baseURL: normalizeBaseURL(defaults.baseURL),
      apiKeyRef: defaults.apiKeyRef,
      routeName: defaults.routeName,
      api: defaults.api,
      preset: true,
      defaultContextWindow: defaults.defaultContextWindow,
      defaultMaxTokens: defaults.defaultMaxTokens,
    };
  }

  const compat = settings.compat();
  return {
    id,
    displayName: COMPAT_DISPLAY_NAME,
    baseURL: compat ? normalizeBaseURL(compat.baseURL) : '',
    apiKeyRef: COMPAT_KEY_REF,
    routeName: 'onehub-compat',
    api: compat ? normalizeApi(compat.api) : DEFAULT_API,
    preset: false,
    defaultContextWindow: defaults.defaultContextWindow,
    defaultMaxTokens: defaults.defaultMaxTokens,
  };
}
