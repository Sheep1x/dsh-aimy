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
  /** 是否给模型声明图片输入（面板开关，默认开）*/
  imageInput: boolean;
}

export const AIMY_DEFAULT_BASE_URL = 'https://aimy.sheep1x.top';
export const AIMY_DEFAULT_DISPLAY_NAME = 'Aimy-艾米';
export const COMPAT_DISPLAY_NAME = '兼容模式';
export const COMPAT_KEY_REF = 'ONEHUB_COMPAT_API_KEY';

/** 图片输入默认开关。中转站的模型普遍能吃图，默认打开。 */
export const DEFAULT_IMAGE_INPUT = true;

export interface CompatSettings {
  baseURL: string;
  api: RelayApi;
  /** 未落盘时视为默认值（defaults.imageInput）*/
  imageInput?: boolean;
}

interface ProfileFile {
  version: 1;
  compat?: CompatSettings;
  /** 预设档案只允许覆盖协议与图片开关（地址固化在配置里）*/
  aimy?: { api?: RelayApi; imageInput?: boolean };
}

function profilesPath(): string {
  return join(resolveDshHome(), 'dsh-aimy', 'profiles.json');
}

/** 兼容模式的可编辑设置（地址 + 协议 + 图片开关），不含密钥。 */
export class ProfileSettingsStore {
  private data: ProfileFile = { version: 1 };

  constructor(private readonly filePath: string = profilesPath()) {}

  load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as ProfileFile;
      if (parsed && parsed.version === 1) {
        const next: ProfileFile = { version: 1 };
        if (parsed.aimy && typeof parsed.aimy === 'object') {
          const imageInput = normalizeImageInput((parsed.aimy as { imageInput?: unknown }).imageInput);
          const api = (parsed.aimy as { api?: unknown }).api;
          next.aimy = {
            ...(api === undefined ? {} : { api: normalizeApi(api) }),
            ...(imageInput === undefined ? {} : { imageInput }),
          };
        }
        if (parsed.compat && typeof parsed.compat.baseURL === 'string') {
          const imageInput = normalizeImageInput(parsed.compat.imageInput);
          next.compat = {
            baseURL: parsed.compat.baseURL,
            api: normalizeApi(parsed.compat.api),
            ...(imageInput === undefined ? {} : { imageInput }),
          };
        }
        this.data = next;
      }
    } catch {
      this.data = { version: 1 };
    }
  }

  compat(): CompatSettings | undefined {
    return this.data.compat;
  }

  /** 预设档案的协议覆盖；未设置时返回 undefined，由调用方回退到配置默认值。 */
  aimyApi(): RelayApi | undefined {
    return this.data.aimy?.api;
  }

  /** 预设档案的图片开关覆盖；未设置时返回 undefined，由调用方回退到默认值。 */
  aimyImageInput(): boolean | undefined {
    return this.data.aimy?.imageInput;
  }

  /**
   * 更新预设档案的可写字段（协议 / 图片开关）。
   * 只覆盖传入的字段，未传的保留原值 —— 面板上一个开关不该顺手把协议改回去。
   */
  setAimy(patch: { api?: RelayApi; imageInput?: boolean }): void {
    const prev = this.data.aimy;
    const api = normalizeApi(patch.api ?? prev?.api);
    const imageInput = normalizeImageInput(patch.imageInput) ?? prev?.imageInput;
    this.data = {
      ...this.data,
      version: 1,
      aimy: { api, ...(imageInput === undefined ? {} : { imageInput }) },
    };
    this.persist();
  }

  setAimyApi(api: RelayApi): void {
    this.setAimy({ api });
  }

  clearAimyApi(): void {
    const { api: _drop, ...rest } = this.data.aimy ?? {};
    if (rest.imageInput === undefined) {
      const { aimy: _dropAll, ...others } = this.data;
      this.data = { ...others, version: 1 };
    } else {
      this.data = { ...this.data, version: 1, aimy: rest };
    }
    this.persist();
  }

  /** 更新兼容模式的可写字段；未传的保留原值。 */
  setCompat(settings: { baseURL?: string; api?: RelayApi; imageInput?: boolean }): void {
    const prev = this.data.compat;
    const baseURL = settings.baseURL ?? prev?.baseURL ?? '';
    const api = normalizeApi(settings.api ?? prev?.api);
    const imageInput = normalizeImageInput(settings.imageInput) ?? prev?.imageInput;
    this.data = {
      ...this.data,
      version: 1,
      compat: { baseURL, api, ...(imageInput === undefined ? {} : { imageInput }) },
    };
    this.persist();
  }

  clearCompat(): void {
    const { compat: _drop, ...rest } = this.data;
    this.data = { ...rest, version: 1 };
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

/** 图片开关落盘前的规整：只认布尔值，其它一律当作「没设」。 */
export function normalizeImageInput(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
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
    /** 未落盘覆盖时的图片开关默认值 */
    imageInput?: boolean;
  };
}

/** 解析出某档案的生效配置。 */
export function resolveProfile(input: ResolveProfileInput): ProfileConfig {
  const { id, settings, defaults } = input;
  const fallbackImageInput = defaults.imageInput ?? DEFAULT_IMAGE_INPUT;
  if (id === 'aimy') {
    return {
      id,
      displayName: defaults.displayName,
      baseURL: normalizeBaseURL(defaults.baseURL),
      apiKeyRef: defaults.apiKeyRef,
      routeName: defaults.routeName,
      api: settings.aimyApi() ?? normalizeApi(defaults.api),
      preset: true,
      defaultContextWindow: defaults.defaultContextWindow,
      defaultMaxTokens: defaults.defaultMaxTokens,
      imageInput: settings.aimyImageInput() ?? fallbackImageInput,
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
    imageInput: compat?.imageInput ?? fallbackImageInput,
  };
}
