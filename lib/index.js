// src/shared/model-profile.ts
var REASONING_EFFORTS = {
  off: null,
  low: "low",
  medium: "medium",
  high: "high"
};
var DEFAULT_REASONING_EFFORT = "high";
var MODEL_CONTEXT_WINDOW = 1e6;
var MODEL_DEFAULT_MAX_TOKENS = 128e3;
var MODEL_INPUT_TEXT = ["text"];
var MODEL_INPUT_TEXT_IMAGE = ["text", "image"];
var ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
function modelEntry(model, imageInput = true) {
  const { id, name: name2 } = model;
  return {
    id,
    ...name2 === void 0 ? {} : { name: name2 },
    // 逐模型声明是唯一会被 DSH 采纳的路径（见 MODEL_DEFAULT_MAX_TOKENS 的说明）。
    contextWindow: positiveOr(model.contextWindow, MODEL_CONTEXT_WINDOW),
    maxTokens: positiveOr(model.maxTokens, MODEL_DEFAULT_MAX_TOKENS),
    input: [...imageInput ? MODEL_INPUT_TEXT_IMAGE : MODEL_INPUT_TEXT],
    cost: { ...ZERO_COST },
    reasoningEfforts: { ...REASONING_EFFORTS }
  };
}
function positiveOr(value, fallback) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

// src/shared/capacity-table.ts
var OFFICIAL_CAPACITY = { "@cf/deepseek-ai/deepseek-v4-flash-0731": [1048576, 1048576], "@cf/deepseek-ai/deepseek-v4-pro-0813": [1048576, 1048576], "@cf/deepseek-ai/deepseek-v4.1-flash-1017": [1048576, 1048576], "@cf/google/gemma-4-26b-a4b-it": [256e3, 16384], "@cf/ibm-granite/granite-4.0-h-micro": [131e3, 131e3], "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [24e3, 24e3], "@cf/meta/llama-4-scout-17b-16e-instruct": [131e3, 16384], "@cf/mistralai/mistral-small-3.1-24b-instruct": [128e3, 128e3], "@cf/moonshotai/kimi-k2.6": [262144, 256e3], "@cf/moonshotai/kimi-k2.7-code": [262144, 262144], "@cf/nvidia/nemotron-3-120b-a12b": [256e3, 256e3], "@cf/openai/gpt-oss-120b": [128e3, 16384], "@cf/openai/gpt-oss-20b": [128e3, 16384], "@cf/qwen/qwen3-30b-a3b-fp8": [32768, 32768], "@cf/qwen/qwen3.8-27b": [262144, 262144], "@cf/zai-org/glm-4.7-flash": [131072, 131072], "@cf/zai-org/glm-5.2": [262144, 256e3], "@cf/zai-org/glm-5.3": [1048576, 1048576], "@cf/zai-org/glm-5.3-flash": [1048576, 1048576], "Ling-2.6-1T": [262144, 65536], "Ling-2.6-flash": [262144, 65536], "MiniMax-M2.5": [196608, 32768], "MiniMax-M2.7": [204800, 131072], "MiniMax-M2.7-highspeed": [204800, 131072], "MiniMax-M3": [1e6, 524288], "MiniMax-M3.1-Flash": [1e6, 524288], "MiniMaxAI/MiniMax-M1-80k": [1e6, 8e4], "MiniMaxAI/MiniMax-M2": [204800, 131072], "MiniMaxAI/MiniMax-M2.1": [204800, 131072], "MiniMaxAI/MiniMax-M2.5": [204800, 131072], "MiniMaxAI/MiniMax-M2.7": [204800, 131072], "MiniMaxAI/MiniMax-M3": [524288, 512e3], "Qwen/Qwen2.5-Coder-32B-Instruct": [131072, 8192], "Qwen/Qwen3-235B-A22B": [40960, 16384], "Qwen/Qwen3-235B-A22B-Instruct-2507": [262144, 16384], "Qwen/Qwen3-235B-A22B-Thinking-2507": [262144, 81920], "Qwen/Qwen3-30B-A3B": [40960, 16384], "Qwen/Qwen3-32B": [131072, 16384], "Qwen/Qwen3-8B": [40960, 32768], "Qwen/Qwen3-Coder-30B-A3B-Instruct": [262144, 65536], "Qwen/Qwen3-Coder-480B-A35B-Instruct": [262144, 65536], "Qwen/Qwen3-Coder-Next": [262144, 65536], "Qwen/Qwen3-Next-80B-A3B-Instruct": [262144, 32768], "Qwen/Qwen3-Next-80B-A3B-Thinking": [262144, 32768], "Qwen/Qwen3-VL-235B-A22B-Instruct": [131072, 32768], "Qwen/Qwen3-VL-235B-A22B-Thinking": [131072, 32768], "Qwen/Qwen3-VL-30B-A3B-Instruct": [131072, 32768], "Qwen/Qwen3.5-122B-A10B": [262144, 65536], "Qwen/Qwen3.5-27B": [262144, 65536], "Qwen/Qwen3.5-35B-A3B": [262144, 65536], "Qwen/Qwen3.5-397B-A17B": [262144, 32768], "Qwen/Qwen3.5-9B": [262144, 65536], "Qwen/Qwen3.6-27B": [262144, 65536], "Qwen/Qwen3.6-35B-A3B": [262144, 65536], "Qwen/Qwen3.6-Plus": [1e6, 65536], "Qwen/Qwen3.7-Max": [1e6, 131072], "Qwen/Qwen3.8-2.4T-A95B": [262144, 131072], "Qwen/Qwen3.8-27B": [262144, 32768], "Ring-2.6-1T": [262144, 65536], "XiaomiMiMo/MiMo-V2-Flash": [262144, 4096], "XiaomiMiMo/MiMo-V2.5": [262144, 131072], "XiaomiMiMo/MiMo-V2.5-Pro": [1048576, 131072], "accounts/fireworks/models/deepseek-v4p1-flash": [1e6, 384e3], "accounts/fireworks/models/deepseek-v4p1-flash-1017": [1e6, 384e3], "accounts/fireworks/models/ember-1": [1048576, 131072], "accounts/fireworks/models/glm-5p3": [1048573, 262144], "accounts/fireworks/models/glm-5p3-flash": [1048573, 131072], "accounts/fireworks/models/gpt-oss-120b": [131072, 32768], "accounts/fireworks/models/inkling": [1048576, 1048576], "accounts/fireworks/models/kimi-k3": [1048576, 131072], "accounts/fireworks/models/minimax-m3": [512e3, 512e3], "accounts/fireworks/models/muse-spark-open": [1048576, 131072], "accounts/fireworks/models/nemotron-3-ultra-nvfp4": [262144, 128e3], "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b": [262144, 262144], "accounts/fireworks/models/qwen3p8-2p4t-a95b": [262144, 131072], "accounts/fireworks/models/qwen3p8-max": [262144, 131072], "accounts/fireworks/routers/deepseek-flash-latest": [1e6, 384e3], "accounts/fireworks/routers/glm-5p3-fast": [1048572, 262144], "accounts/fireworks/routers/glm-fast-latest": [1048572, 262144], "accounts/fireworks/routers/glm-flash-latest": [1048573, 131072], "accounts/fireworks/routers/glm-latest": [1048573, 262144], "accounts/fireworks/routers/kimi-fast-latest": [1048576, 131072], "accounts/fireworks/routers/kimi-k3-fast": [1048576, 131072], "accounts/fireworks/routers/kimi-latest": [1048576, 131072], "accounts/fireworks/routers/minimax-latest": [512e3, 512e3], "accounts/fireworks/routers/qwen-max-latest": [262144, 131072], "aion-labs/aion-2.0": [131072, 32768], "aion-labs/aion-3.0": [131072, 32768], "aion-labs/aion-3.0-mini": [131072, 32768], "aion-labs/aion-3.5": [262144, 32768], "aion-labs/aion-3.5-mini": [262144, 32768], "alibaba/qwen-3-14b": [40960, 16384], "alibaba/qwen-3-235b": [262144, 16384], "alibaba/qwen-3-30b": [40960, 16384], "alibaba/qwen-3-32b": [128e3, 8192], "alibaba/qwen3-coder": [262144, 32768], "alibaba/qwen3-coder-30b-a3b": [262144, 8192], "alibaba/qwen3-coder-next": [256e3, 256e3], "alibaba/qwen3-max-thinking": [256e3, 65536], "alibaba/qwen3-next-80b-a3b-instruct": [262114, 262114], "alibaba/qwen3-next-80b-a3b-thinking": [262144, 262144], "alibaba/qwen3-vl-instruct": [262144, 262144], "alibaba/qwen3.5-flash": [1e6, 64e3], "alibaba/qwen3.5-plus": [1e6, 64e3], "alibaba/qwen3.6-27b": [256e3, 256e3], "alibaba/qwen3.6-plus": [1e6, 64e3], "alibaba/qwen3.7-flash": [991e3, 64e3], "alibaba/qwen3.7-max": [991e3, 64e3], "alibaba/qwen3.7-plus": [1e6, 64e3], "alibaba/qwen3.8-2.4t-a95b": [262144, 128e3], "alibaba/qwen3.8-27b": [1e6, 131072], "alibaba/qwen3.8-flash": [991e3, 128e3], "alibaba/qwen3.8-max": [262144, 128e3], "alibaba/qwen3.8-max-0902": [991e3, 128e3], "alibaba/qwen3.8-max-prime": [1e6, 131072], "alibaba/qwen3.8-omni-flash": [1e6, 131072], "amazon.nova-2-lite-v1:0": [1e6, 65535], "amazon.nova-lite-v1:0": [3e5, 1e4], "amazon.nova-micro-v1:0": [128e3, 1e4], "amazon.nova-pro-v1:0": [3e5, 1e4], "amazon/nova-2-lite": [1e6, 1e6], "amazon/nova-2-lite-v1": [1e6, 65535], "amazon/nova-lite": [3e5, 8192], "amazon/nova-lite-v1": [3e5, 5120], "amazon/nova-micro": [128e3, 8192], "amazon/nova-micro-v1": [128e3, 5120], "amazon/nova-premier-v1": [1e6, 32e3], "amazon/nova-pro": [3e5, 8192], "amazon/nova-pro-v1": [3e5, 5120], "anthropic.claude-fable-5": [1e6, 128e3], "anthropic.claude-fable-5-1": [1e6, 128e3], "anthropic.claude-haiku-4-5-20251001-v1:0": [2e5, 64e3], "anthropic.claude-haiku-5-5": [1e6, 128e3], "anthropic.claude-opus-4-1-20250805-v1:0": [2e5, 32e3], "anthropic.claude-opus-4-5-20251101-v1:0": [2e5, 64e3], "anthropic.claude-opus-4-6-v1": [1e6, 128e3], "anthropic.claude-opus-4-7": [1e6, 128e3], "anthropic.claude-opus-4-8": [1e6, 128e3], "anthropic.claude-opus-5-5": [1e6, 128e3], "anthropic.claude-sonnet-4-5-20250929-v1:0": [2e5, 64e3], "anthropic.claude-sonnet-4-6": [1e6, 128e3], "anthropic.claude-sonnet-5": [1e6, 128e3], "anthropic.claude-sonnet-5-5": [1e6, 128e3], "anthropic/claude-fable-5": [1e6, 128e3], "anthropic/claude-fable-5-batch": [1e6, 128e3], "anthropic/claude-fable-5.1": [1e6, 128e3], "anthropic/claude-fable-5.1-batch": [1e6, 128e3], "anthropic/claude-fable-5.1:batch": [1e6, 128e3], "anthropic/claude-fable-5:batch": [1e6, 128e3], "anthropic/claude-haiku-4.5": [2e5, 64e3], "anthropic/claude-haiku-4.5-batch": [2e5, 64e3], "anthropic/claude-haiku-4.5:batch": [2e5, 64e3], "anthropic/claude-haiku-5.5": [1e6, 128e3], "anthropic/claude-haiku-5.5-batch": [1e6, 128e3], "anthropic/claude-haiku-5.5:batch": [1e6, 128e3], "anthropic/claude-opus-4.1": [2e5, 32e3], "anthropic/claude-opus-4.1:batch": [2e5, 32e3], "anthropic/claude-opus-4.5": [2e5, 64e3], "anthropic/claude-opus-4.5-batch": [2e5, 64e3], "anthropic/claude-opus-4.5:batch": [2e5, 64e3], "anthropic/claude-opus-4.6": [1e6, 128e3], "anthropic/claude-opus-4.6-batch": [1e6, 128e3], "anthropic/claude-opus-4.6:batch": [1e6, 128e3], "anthropic/claude-opus-4.7": [1e6, 128e3], "anthropic/claude-opus-4.7-batch": [1e6, 128e3], "anthropic/claude-opus-4.7:batch": [1e6, 128e3], "anthropic/claude-opus-4.8": [1e6, 128e3], "anthropic/claude-opus-4.8-batch": [1e6, 128e3], "anthropic/claude-opus-4.8-fast": [1e6, 128e3], "anthropic/claude-opus-4.8:batch": [1e6, 128e3], "anthropic/claude-opus-5": [1e6, 128e3], "anthropic/claude-opus-5-batch": [1e6, 128e3], "anthropic/claude-opus-5-fast": [1e6, 128e3], "anthropic/claude-opus-5.5": [1e6, 128e3], "anthropic/claude-opus-5.5-batch": [1e6, 128e3], "anthropic/claude-opus-5.5-fast": [1e6, 128e3], "anthropic/claude-opus-5.5:batch": [1e6, 128e3], "anthropic/claude-opus-5:batch": [1e6, 128e3], "anthropic/claude-sonnet-4.5": [1e6, 64e3], "anthropic/claude-sonnet-4.5-batch": [1e6, 64e3], "anthropic/claude-sonnet-4.5:batch": [1e6, 64e3], "anthropic/claude-sonnet-4.6": [1e6, 128e3], "anthropic/claude-sonnet-4.6-batch": [1e6, 128e3], "anthropic/claude-sonnet-4.6:batch": [1e6, 128e3], "anthropic/claude-sonnet-5": [1e6, 128e3], "anthropic/claude-sonnet-5-batch": [1e6, 128e3], "anthropic/claude-sonnet-5.5": [1e6, 128e3], "anthropic/claude-sonnet-5.5-batch": [1e6, 128e3], "anthropic/claude-sonnet-5.5:batch": [1e6, 128e3], "anthropic/claude-sonnet-5:batch": [1e6, 128e3], "apac.amazon.nova-lite-v1:0": [3e5, 1e4], "apac.amazon.nova-micro-v1:0": [128e3, 1e4], "apac.amazon.nova-pro-v1:0": [3e5, 1e4], "apac.anthropic.claude-sonnet-4-20250514-v1:0": [2e5, 64e3], "arcee-ai/trinity-large-thinking": [262100, 8e4], "au.anthropic.claude-haiku-4-5-20251001-v1:0": [2e5, 64e3], "au.anthropic.claude-haiku-5-5": [1e6, 128e3], "au.anthropic.claude-opus-4-6-v1": [1e6, 128e3], "au.anthropic.claude-opus-4-7": [1e6, 128e3], "au.anthropic.claude-opus-4-8": [1e6, 128e3], "au.anthropic.claude-opus-5": [1e6, 128e3], "au.anthropic.claude-opus-5-5": [1e6, 128e3], "au.anthropic.claude-sonnet-4-5-20250929-v1:0": [2e5, 64e3], "au.anthropic.claude-sonnet-4-6": [1e6, 128e3], "au.anthropic.claude-sonnet-5": [1e6, 128e3], "auto": [2e6, 3e4], "balanced": [1048576, 131072], "beam-free": [1048576, 131072], "big-pickle": [2e5, 32e3], "bytedance-seed/seed-1.6": [262144, 32768], "bytedance-seed/seed-1.6-flash": [262144, 32768], "bytedance-seed/seed-2-1-turbo": [262144, 235929], "bytedance-seed/seed-2.0-code": [262144, 131072], "bytedance-seed/seed-2.0-lite": [262144, 131072], "bytedance-seed/seed-2.0-mini": [262144, 131072], "bytedance/seed-1.6": [256e3, 32e3], "bytedance/seed-1.8": [256e3, 64e3], "bytedance/seed-2.1-turbo": [262144, 262144], "ca.amazon.nova-lite-v1:0": [3e5, 1e4], "callstack/apex": [262144, 131072], "cheap": [1e6, 32768], "claude-fable-5": [1e6, 128e3], "claude-fable-5-1": [1e6, 128e3], "claude-fable-5.1": [1e6, 128e3], "claude-haiku-4-5": [2e5, 64e3], "claude-haiku-4-5-20251001": [2e5, 64e3], "claude-haiku-4.5": [2e5, 64e3], "claude-haiku-5-5": [1e6, 128e3], "claude-haiku-5.5": [1e6, 128e3], "claude-opus-4-5": [2e5, 64e3], "claude-opus-4-5-20251101": [2e5, 64e3], "claude-opus-4-6": [1e6, 128e3], "claude-opus-4-7": [1e6, 128e3], "claude-opus-4-8": [1e6, 128e3], "claude-opus-4.8": [1e6, 64e3], "claude-opus-5": [1e6, 128e3], "claude-opus-5-5": [1e6, 128e3], "claude-opus-5.5": [1e6, 128e3], "claude-sonnet-4-5": [2e5, 64e3], "claude-sonnet-4-5-20250929": [2e5, 64e3], "claude-sonnet-4-6": [1e6, 128e3], "claude-sonnet-4.6": [1e6, 32e3], "claude-sonnet-5": [1e6, 128e3], "claude-sonnet-5-5": [1e6, 128e3], "claude-sonnet-5.5": [1e6, 128e3], "codestral-2508": [256e3, 8192], "codestral-latest": [256e3, 4096], "cohere/command-a": [256e3, 8e3], "cohere/command-a-plus": [192e3, 64e3], "cohere/command-r-08-2024": [128e3, 4e3], "cohere/command-r-plus-08-2024": [128e3, 4e3], "cohere/north-mini-code:free": [256e3, 64e3], "deep-research-max-preview-04-2026": [131072, 65536], "deep-research-preview-04-2026": [131072, 65536], "deepseek-ai/DeepSeek-R1": [64e3, 32768], "deepseek-ai/DeepSeek-R1-0528": [163840, 32768], "deepseek-ai/DeepSeek-V3": [64e3, 8192], "deepseek-ai/DeepSeek-V3-0324": [163840, 163840], "deepseek-ai/DeepSeek-V3.1": [131072, 8192], "deepseek-ai/DeepSeek-V3.2": [163840, 65536], "deepseek-ai/DeepSeek-V4-Flash": [1048576, 384e3], "deepseek-ai/DeepSeek-V4-Flash-0731": [1048576, 384e3], "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp": [1048576, 384e3], "deepseek-ai/DeepSeek-V4-Pro": [1048576, 393216], "deepseek-ai/DeepSeek-V4-Pro-0813": [1e6, 384e3], "deepseek-ai/DeepSeek-V4.1-Flash": [1048576, 384e3], "deepseek-ai/DeepSeek-V4.1-Flash-1017": [1048576, 262144], "deepseek-ai/DeepSeek-V4.1-Flash-1017-Fast": [1048576, 262144], "deepseek-ai/DeepSeek-V4.1-Flash-Fast": [1048576, 32768], "deepseek-ai/deepseek-v4.1-flash": [1e6, 384e3], "deepseek-flash": [1e6, 384e3], "deepseek-v3.2": [131072, 65536], "deepseek-v4-flash": [1e6, 384e3], "deepseek-v4-flash-0731": [1e6, 384e3], "deepseek-v4-pro": [1e6, 384e3], "deepseek-v4-pro-0813": [1e6, 384e3], "deepseek-v4.1-flash": [1e6, 384e3], "deepseek-v4.1-flash-1017": [1e6, 384e3], "deepseek-v4.1-flash-free": [2e5, 32e3], "deepseek.v3-v1:0": [163840, 81920], "deepseek.v3.2": [163840, 81920], "deepseek/deepseek-chat": [128e3, 16e3], "deepseek/deepseek-chat-v3-0324": [128e3, 115200], "deepseek/deepseek-chat-v3.1": [163840, 32768], "deepseek/deepseek-r1": [128e3, 8192], "deepseek/deepseek-r1-0528": [163840, 32768], "deepseek/deepseek-v3.1": [163840, 128e3], "deepseek/deepseek-v3.1-terminus": [163840, 147456], "deepseek/deepseek-v3.2": [128e3, 8e3], "deepseek/deepseek-v3.2-exp": [163840, 147456], "deepseek/deepseek-v3.2-thinking": [128e3, 8e3], "deepseek/deepseek-v4-flash": [1e6, 384e3], "deepseek/deepseek-v4-flash-0731": [1e6, 384e3], "deepseek/deepseek-v4-flash-vision-exp": [1048576, 262144], "deepseek/deepseek-v4-pro": [1e6, 384e3], "deepseek/deepseek-v4-pro-0813": [1e6, 384e3], "deepseek/deepseek-v4.1-flash": [1048576, 32768], "deepseek/deepseek-v4.1-flash-1017": [1048576, 393216], "deepseek/deepseek-v4.1-flash-1017-fast": [1048576, 262144], "deepseek/deepseek-v4.1-flash-fast": [1048576, 32768], "deepseek/deepseek-v4.1-flash:batch": [1048576, 384e3], "devstral-2512": [262144, 262144], "devstral-latest": [262144, 262144], "devstral-medium-2507": [128e3, 128e3], "devstral-medium-latest": [262144, 262144], "devstral-small-2505": [128e3, 128e3], "devstral-small-2507": [128e3, 128e3], "dots-studio/dots-3-note-preview:free": [512e3, 460800], "elorian/glimpse": [262144, 256e3], "eu.amazon.nova-2-lite-v1:0": [1e6, 65535], "eu.amazon.nova-lite-v1:0": [3e5, 1e4], "eu.amazon.nova-micro-v1:0": [128e3, 1e4], "eu.amazon.nova-pro-v1:0": [3e5, 1e4], "eu.anthropic.claude-fable-5": [1e6, 128e3], "eu.anthropic.claude-haiku-4-5-20251001-v1:0": [2e5, 64e3], "eu.anthropic.claude-haiku-5-5": [1e6, 128e3], "eu.anthropic.claude-opus-4-5-20251101-v1:0": [2e5, 64e3], "eu.anthropic.claude-opus-4-6-v1": [1e6, 128e3], "eu.anthropic.claude-opus-4-7": [1e6, 128e3], "eu.anthropic.claude-opus-4-8": [1e6, 128e3], "eu.anthropic.claude-opus-5": [1e6, 128e3], "eu.anthropic.claude-opus-5-5": [1e6, 128e3], "eu.anthropic.claude-sonnet-4-20250514-v1:0": [2e5, 64e3], "eu.anthropic.claude-sonnet-4-5-20250929-v1:0": [2e5, 64e3], "eu.anthropic.claude-sonnet-4-6": [1e6, 128e3], "eu.anthropic.claude-sonnet-5": [1e6, 128e3], "eu.anthropic.claude-sonnet-5-5": [1e6, 128e3], "eu.mistral.pixtral-large-2502-v1:0": [128e3, 8192], "fireworks/ember-1": [1048576, 943718], "flint-40b-free": [262144, 65536], "gemini-2.5-computer-use-preview-10-2025": [128e3, 64e3], "gemini-2.5-flash": [1048576, 65536], "gemini-2.5-flash-lite": [1048576, 65536], "gemini-2.5-pro": [1048576, 65536], "gemini-3-flash": [1048576, 65536], "gemini-3-flash-preview": [1048576, 65536], "gemini-3.1-flash-lite": [1048576, 65536], "gemini-3.1-flash-lite-image": [65536, 4096], "gemini-3.1-flash-lite-preview": [1048576, 65536], "gemini-3.1-flash-live-preview": [131072, 65536], "gemini-3.1-pro": [1048576, 65536], "gemini-3.1-pro-preview": [1048576, 65536], "gemini-3.1-pro-preview-customtools": [1048576, 65536], "gemini-3.5-flash": [1048576, 65536], "gemini-3.5-flash-lite": [1048576, 65536], "gemini-3.6-flash": [1048576, 65536], "gemini-3.7-flash": [1048576, 65536], "gemini-3.8-flash": [1048576, 65536], "gemini-4-argon": [1048576, 65536], "gemini-4-argon-contributor": [1048576, 65536], "gemini-flash-latest": [1048576, 65536], "gemini-flash-lite-latest": [1048576, 65536], "gemini-pro-latest": [1048576, 65536], "gemma-4-26b-a4b-it": [262144, 32768], "gemma-4-31b-it": [262144, 32768], "glm-4.6v": [128e3, 32768], "glm-4.7": [204800, 131072], "glm-5": [202752, 16384], "glm-5-2": [1048576, 131072], "glm-5-turbo": [2e5, 131072], "glm-5.1": [202752, 128e3], "glm-5.2": [1e6, 131072], "glm-5.2-highspeed": [1e6, 131072], "glm-5.3": [1e6, 131072], "glm-5.3-flash": [1e6, 131072], "glm-5.3-flash-free": [2e5, 32e3], "glm-5.3-highspeed": [1e6, 131072], "global.amazon.nova-2-lite-v1:0": [1e6, 65535], "global.anthropic.claude-fable-5": [1e6, 128e3], "global.anthropic.claude-fable-5-1": [1e6, 128e3], "global.anthropic.claude-haiku-4-5-20251001-v1:0": [2e5, 64e3], "global.anthropic.claude-haiku-5-5": [1e6, 128e3], "global.anthropic.claude-opus-4-5-20251101-v1:0": [2e5, 64e3], "global.anthropic.claude-opus-4-6-v1": [1e6, 128e3], "global.anthropic.claude-opus-4-7": [1e6, 128e3], "global.anthropic.claude-opus-4-8": [1e6, 128e3], "global.anthropic.claude-opus-5": [1e6, 128e3], "global.anthropic.claude-opus-5-5": [1e6, 128e3], "global.anthropic.claude-sonnet-4-20250514-v1:0": [2e5, 64e3], "global.anthropic.claude-sonnet-4-5-20250929-v1:0": [2e5, 64e3], "global.anthropic.claude-sonnet-4-6": [1e6, 128e3], "global.anthropic.claude-sonnet-5": [1e6, 128e3], "global.anthropic.claude-sonnet-5-5": [1e6, 128e3], "global.moonshotai.kimi-k3": [1048576, 128e3], "global.openai.gpt-5.6-luna": [105e4, 128e3], "global.openai.gpt-5.6-sol": [105e4, 128e3], "global.openai.gpt-5.6-terra": [105e4, 128e3], "global.openai.gpt-6-astra": [105e4, 128e3], "global.openai.gpt-6-luna": [105e4, 128e3], "global.openai.gpt-6-sol": [105e4, 128e3], "global.openai.gpt-6.1-sol": [105e4, 128e3], "global.xai.grok-4.6": [5e5, 5e5], "global.xai.grok-4.7": [5e5, 5e5], "global.zai.glm-5.3": [1e6, 128e3], "google.gemma-4-26b-a4b": [262144, 32768], "google.gemma-4-31b": [262144, 32768], "google.gemma-4-e2b": [131072, 8192], "google/diffusiongemma-26b-a4b-it": [25e4, 32768], "google/gemini-2.5-flash": [1e6, 65535], "google/gemini-2.5-flash-batch": [1e6, 64e3], "google/gemini-2.5-flash-lite": [1048576, 65535], "google/gemini-2.5-flash-lite-batch": [1048576, 65535], "google/gemini-2.5-pro": [1048576, 65535], "google/gemini-2.5-pro-batch": [1048576, 65535], "google/gemini-2.5-pro-preview": [1048576, 65536], "google/gemini-3-flash": [1e6, 65e3], "google/gemini-3-flash-batch": [1e6, 64e3], "google/gemini-3-flash-preview": [1048576, 65536], "google/gemini-3-flash-preview:batch": [1048576, 65536], "google/gemini-3-pro-image": [65536, 32768], "google/gemini-3.1-flash-lite": [1e6, 65e3], "google/gemini-3.1-flash-lite-batch": [1e6, 65e3], "google/gemini-3.1-flash-lite-preview": [1048576, 65536], "google/gemini-3.1-flash-lite:batch": [1048576, 65536], "google/gemini-3.1-pro-preview": [1e6, 64e3], "google/gemini-3.1-pro-preview-batch": [1e6, 64e3], "google/gemini-3.1-pro-preview-customtools": [1048576, 65536], "google/gemini-3.1-pro-preview:batch": [1048576, 65536], "google/gemini-3.5-flash": [1e6, 64e3], "google/gemini-3.5-flash-batch": [1e6, 64e3], "google/gemini-3.5-flash-lite": [1e6, 65e3], "google/gemini-3.5-flash-lite-batch": [1e6, 65e3], "google/gemini-3.5-flash-lite:batch": [1048576, 65536], "google/gemini-3.5-flash:batch": [1048576, 65536], "google/gemini-3.6-flash": [1e6, 64e3], "google/gemini-3.6-flash-batch": [1e6, 64e3], "google/gemini-3.6-flash:batch": [1048576, 65536], "google/gemini-3.7-flash": [1e6, 65535], "google/gemini-3.7-flash-batch": [1e6, 65535], "google/gemini-3.7-flash:batch": [1048576, 65536], "google/gemini-3.8-flash": [1e6, 65535], "google/gemini-3.8-flash:batch": [1048576, 65536], "google/gemini-4-argon": [1e6, 1e6], "google/gemini-4-argon:batch": [1048576, 943718], "google/gemini-nano-banana-2.1": [65536, 58982], "google/gemma-3-12b-it": [131072, 16384], "google/gemma-3-27b-it": [131072, 117964], "google/gemma-3-4b-it": [131072, 16384], "google/gemma-4-26B-A4B-it": [262144, 32768], "google/gemma-4-26b-a4b-it": [262144, 131072], "google/gemma-4-26b-a4b-it:free": [262144, 32768], "google/gemma-4-31B-it": [262144, 32768], "google/gemma-4-31b-it": [262144, 16384], "google/gemma-4-31b-it:free": [262144, 32768], "gpt-4": [8192, 8192], "gpt-4-turbo": [128e3, 4096], "gpt-4.1": [1047576, 32768], "gpt-4.1-mini": [1047576, 32768], "gpt-4.1-nano": [1047576, 32768], "gpt-4o": [128e3, 16384], "gpt-4o-2024-05-13": [128e3, 4096], "gpt-4o-2024-08-06": [128e3, 16384], "gpt-4o-2024-11-20": [128e3, 16384], "gpt-4o-mini": [128e3, 16384], "gpt-5": [4e5, 128e3], "gpt-5-chat-latest": [128e3, 16384], "gpt-5-codex": [4e5, 128e3], "gpt-5-mini": [4e5, 128e3], "gpt-5-nano": [4e5, 128e3], "gpt-5-pro": [4e5, 128e3], "gpt-5.1": [4e5, 128e3], "gpt-5.1-codex": [4e5, 128e3], "gpt-5.1-codex-max": [4e5, 128e3], "gpt-5.1-codex-mini": [4e5, 128e3], "gpt-5.2": [4e5, 128e3], "gpt-5.2-codex": [4e5, 128e3], "gpt-5.2-pro": [4e5, 128e3], "gpt-5.3-codex": [4e5, 128e3], "gpt-5.3-codex-spark": [128e3, 32e3], "gpt-5.4": [272e3, 128e3], "gpt-5.4-mini": [4e5, 128e3], "gpt-5.4-nano": [4e5, 128e3], "gpt-5.4-pro": [105e4, 128e3], "gpt-5.5": [272e3, 128e3], "gpt-5.5-pro": [105e4, 128e3], "gpt-5.6-luna": [105e4, 128e3], "gpt-5.6-sol": [105e4, 128e3], "gpt-5.6-terra": [105e4, 128e3], "gpt-6-astra": [272e3, 128e3], "gpt-6-luna": [105e4, 128e3], "gpt-6-sol": [272e3, 128e3], "gpt-6.1-sol": [272e3, 128e3], "gpt-daybreak-blue-latest": [105e4, 128e3], "gpt-daybreak-red-latest": [4e5, 128e3], "gpt-oss-120b": [131072, 40960], "gpt-realtime-2.1": [128e3, 32e3], "grok-4.3": [1e6, 3e4], "grok-4.5": [5e5, 5e5], "grok-4.6": [5e5, 5e5], "grok-4.7": [5e5, 5e5], "grok-build-0.1": [256e3, 256e3], "hy3": [256e3, 128e3], "hy4-preview": [1024e3, 64e3], "ibm-granite/granite-4.2-8b": [131072, 117964], "in.anthropic.claude-haiku-4-5-20251001-v1:0": [2e5, 64e3], "in.anthropic.claude-opus-5": [1e6, 128e3], "in.anthropic.claude-sonnet-5": [1e6, 128e3], "in.openai.gpt-5.6-luna": [105e4, 128e3], "in.openai.gpt-5.6-terra": [105e4, 128e3], "inception/mercury-2": [128e3, 5e4], "inception/mercury-2.5": [26e4, 65536], "inception/mercury-3": [1e6, 131072], "inception/mercury-coder-small": [32e3, 16384], "inclusionai/ling-3.0-flash": [256e3, 32e3], "inclusionai/ling-3.0-flash-fin": [256e3, 32e3], "inclusionai/ling-3.0-flash-sante": [256e3, 32e3], "inclusionai/ling-3.0-flash-vl": [131072, 32768], "inclusionai/ling-3.1-flash": [262144, 32768], "interfaze/interfaze-beta": [1e6, 32e3], "jp.amazon.nova-2-lite-v1:0": [1e6, 65535], "jp.anthropic.claude-haiku-4-5-20251001-v1:0": [2e5, 64e3], "jp.anthropic.claude-haiku-5-5": [1e6, 128e3], "jp.anthropic.claude-opus-4-7": [1e6, 128e3], "jp.anthropic.claude-opus-4-8": [1e6, 128e3], "jp.anthropic.claude-opus-5": [1e6, 128e3], "jp.anthropic.claude-opus-5-5": [1e6, 128e3], "jp.anthropic.claude-sonnet-4-5-20250929-v1:0": [2e5, 64e3], "jp.anthropic.claude-sonnet-4-6": [1e6, 128e3], "jp.anthropic.claude-sonnet-5": [1e6, 128e3], "k3": [1048576, 131072], "k3-256k": [262144, 131072], "kimi-for-coding": [1048576, 32768], "kimi-for-coding-highspeed": [262144, 32768], "kimi-k2.5": [262144, 98304], "kimi-k2.6": [262144, 262144], "kimi-k2.7-code": [262144, 262144], "kimi-k2.7-code-highspeed": [262144, 262144], "kimi-k3": [1048576, 131072], "labs-devstral-small-2512": [256e3, 256e3], "labs-leanstral-1-5-1": [262144, 128e3], "liquid/lfm-2.5-2.6b:free": [65536, 8192], "liquid/lfm-2.5-24b-a2b": [128e3, 8192], "liquid/lfm2.5-24b-a2b": [128e3, 8200], "llama-3.1-8b-instant": [131072, 131072], "llama-3.3-70b-versatile": [131072, 32768], "longcat-2.0": [1e6, 131072], "longcat-2.5-preview-free": [1e6, 131072], "magistral-medium-latest": [262144, 16384], "mai-code-1.1-flash": [256e3, 128e3], "meituan/longcat-2.0": [1048756, 262144], "meituan/longcat-2.5-preview": [1048576, 131072], "meta-llama/Llama-3.1-8B-Instruct": [131072, 4096], "meta-llama/Llama-3.3-70B-Instruct": [131072, 4096], "meta-llama/llama-3.1-70b-instruct": [131072, 16384], "meta-llama/llama-3.1-8b-instruct": [131072, 117964], "meta-llama/llama-3.3-70b-instruct": [131072, 16384], "meta-llama/llama-4-maverick": [128e3, 16384], "meta-llama/llama-4-scout": [327680, 16384], "meta-models/Muse-Spark-Open-816B-A42B": [1048576, 131072], "meta.llama3-1-70b-instruct-v1:0": [128e3, 4096], "meta.llama3-1-8b-instruct-v1:0": [128e3, 4096], "meta.llama3-3-70b-instruct-v1:0": [128e3, 4096], "meta.llama4-maverick-17b-instruct-v1:0": [1e6, 8192], "meta.llama4-scout-17b-instruct-v1:0": [1e7, 8192], "meta/llama-3.1-70b": [128e3, 8192], "meta/llama-3.1-8b": [128e3, 8192], "meta/llama-3.2-11b-vision-instruct": [128e3, 4096], "meta/llama-3.2-90b-vision-instruct": [128e3, 8192], "meta/llama-3.3-70b": [128e3, 8192], "meta/llama-4-maverick": [128e3, 8192], "meta/llama-4-scout": [128e3, 8192], "meta/muse-glimmer-30b": [131072, 131072], "meta/muse-spark-1.1": [1048576, 943718], "meta/muse-spark-1.2": [1048576, 943718], "meta/muse-spark-1.2-contributor": [1048576, 943718], "meta/muse-spark-1.3": [1048576, 943718], "meta/muse-spark-1.3-contributor": [1048576, 943718], "meta/muse-spark-open": [1048576, 943718], "meta/muse-wonder": [1048576, 943718], "meta/muse-wonder-1.0": [1048576, 1048576], "mimo-v2.5": [1e6, 128e3], "mimo-v2.5-pro": [1048576, 128e3], "mimo-v2.6-flash": [1048576, 131072], "mimo-v2.6-flash-free": [2e5, 32e3], "mimo-v2.6-pro": [1048576, 131072], "mimo-v2.6-pro-ultraspeed": [1048576, 131072], "minimax-m2.5": [204800, 131072], "minimax-m2.7": [204800, 131072], "minimax-m3": [512e3, 128e3], "minimax-m3.1-flash": [1e6, 524288], "minimax-m3.1-flash-free": [1e6, 512e3], "minimax.minimax-m2": [204608, 128e3], "minimax.minimax-m2.1": [196608, 131072], "minimax.minimax-m2.5": [196608, 98304], "minimax/minimax-m1": [1e6, 4e4], "minimax/minimax-m2": [204800, 131072], "minimax/minimax-m2.1": [204800, 131072], "minimax/minimax-m2.1-lightning": [204800, 131072], "minimax/minimax-m2.5": [198e3, 32768], "minimax/minimax-m2.5-highspeed": [204800, 131e3], "minimax/minimax-m2.7": [204800, 131e3], "minimax/minimax-m2.7-highspeed": [204800, 131100], "minimax/minimax-m3": [512e3, 512e3], "minimax/minimax-m3.1-flash": [1e6, 524288], "minimax/minimax-m3.1-flash:free": [1e6, 524288], "ministral-14b-2512": [262144, 262144], "ministral-3b-2512": [131072, 262144], "ministral-3b-latest": [131072, 128e3], "ministral-8b-2512": [262144, 262144], "ministral-8b-latest": [262144, 128e3], "mistral-large-2411": [131072, 16384], "mistral-large-2512": [262144, 262144], "mistral-large-4": [524288, 262144], "mistral-large-latest": [262144, 262144], "mistral-medium-2505": [131072, 131072], "mistral-medium-2508": [262144, 262144], "mistral-medium-2604": [262144, 262144], "mistral-medium-3.5": [262144, 262144], "mistral-medium-latest": [262144, 262144], "mistral-nemo": [128e3, 128e3], "mistral-small-2506": [128e3, 16384], "mistral-small-2603": [262144, 256e3], "mistral-small-latest": [262144, 256e3], "mistral.devstral-2-123b": [262144, 8192], "mistral.magistral-small-2509": [128e3, 4e4], "mistral.ministral-3-14b-instruct": [128e3, 4096], "mistral.ministral-3-3b-instruct": [256e3, 8192], "mistral.ministral-3-8b-instruct": [128e3, 4096], "mistral.mistral-large-3-675b-instruct": [262144, 8192], "mistral.pixtral-large-2502-v1:0": [128e3, 8192], "mistral.voxtral-mini-3b-2507": [32768, 4096], "mistral.voxtral-small-24b-2507": [32768, 8192], "mistral/codestral": [128e3, 4e3], "mistral/ministral-14b": [262144, 256e3], "mistral/ministral-3b": [131072, 4e3], "mistral/ministral-8b": [262144, 4e3], "mistral/mistral-large-3": [262144, 256e3], "mistral/mistral-large-4": [524288, 262144], "mistral/mistral-medium-3.5": [262144, 256e3], "mistral/mistral-nemo": [131072, 131072], "mistral/mistral-small": [262144, 4e3], "mistralai/codestral-2508": [256e3, 204800], "mistralai/codestral-2508:batch": [256e3, 204800], "mistralai/devstral-2512": [262144, 209715], "mistralai/ministral-14b-2512": [262144, 209715], "mistralai/ministral-3b-2512": [131072, 104857], "mistralai/ministral-8b-2512": [262144, 209715], "mistralai/ministral-8b-2512:batch": [262144, 209715], "mistralai/mistral-7b-instruct-v0.3": [65536, 65536], "mistralai/mistral-large": [128e3, 102400], "mistralai/mistral-large-2407": [131072, 104857], "mistralai/mistral-large-2512": [262144, 209715], "mistralai/mistral-large-2512:batch": [262144, 209715], "mistralai/mistral-large-4-0": [1048576, 262144], "mistralai/mistral-medium-3": [131072, 104857], "mistralai/mistral-medium-3-5": [262144, 209715], "mistralai/mistral-medium-3-5:batch": [262144, 209715], "mistralai/mistral-medium-3.1": [131072, 104857], "mistralai/mistral-medium-3.1:batch": [131072, 104857], "mistralai/mistral-nemo": [131072, 16384], "mistralai/mistral-saba": [32768, 26214], "mistralai/mistral-small-2603": [262144, 209715], "mistralai/mistral-small-2603:batch": [262144, 209715], "mistralai/mistral-small-3.1-24b-instruct": [128e3, 102400], "mistralai/mistral-small-3.2-24b-instruct": [256e3, 16384], "mistralai/mixtral-8x22b-instruct": [65536, 52428], "mistralai/voxtral-small-24b-2507": [32768, 26214], "mixedbread/toast-1": [131e3, 4e3], "moonshot.kimi-k2-thinking": [262144, 16e3], "moonshotai.kimi-k2.5": [262144, 16384], "moonshotai/Kimi-K2-Instruct": [131072, 16384], "moonshotai/Kimi-K2-Instruct-0905": [262144, 16384], "moonshotai/Kimi-K2-Thinking": [262144, 262144], "moonshotai/Kimi-K2.5": [262144, 262144], "moonshotai/Kimi-K2.6": [262144, 262144], "moonshotai/Kimi-K2.7-Code": [262144, 262144], "moonshotai/Kimi-K3": [1e6, 131072], "moonshotai/kimi-k2": [131072, 98304], "moonshotai/kimi-k2-0905": [262144, 98304], "moonshotai/kimi-k2-thinking": [262144, 98304], "moonshotai/kimi-k2.5": [256e3, 256e3], "moonshotai/kimi-k2.6": [262e3, 262e3], "moonshotai/kimi-k2.7-code": [256e3, 32768], "moonshotai/kimi-k2.7-code-highspeed": [262144, 32768], "moonshotai/kimi-k3": [1e6, 131072], "moonshotai/kimi-k3-fast": [1e6, 131072], "moonshotai/kimi-k3:batch": [1048576, 16384], "muse-spark-1.1": [1048576, 131072], "muse-spark-1.2": [1048576, 131072], "muse-spark-1.2-contributor": [1048576, 131072], "muse-spark-1.3": [1048576, 131072], "muse-spark-1.3-contributor": [1048576, 131072], "muse-wonder-1.0": [1048576, 131072], "nemotron-3-ultra-free": [1e6, 128e3], "nemotron-3.5-lightning-free": [262144, 262144], "nemotron-3.5-super-vl-free": [1048576, 131072], "nex-agi/nex-n2.5-pro": [262144, 235929], "nvidia.nemotron-nano-12b-v2": [131072, 8192], "nvidia.nemotron-nano-3-30b": [262144, 8192], "nvidia.nemotron-nano-9b-v2": [131072, 8192], "nvidia.nemotron-super-3-120b": [262144, 131072], "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B": [202800, 202800], "nvidia/NVIDIA-Nemotron-3.5-Super-VL": [262144, 262144], "nvidia/cosmos-reason2-8b": [131072, 16384], "nvidia/llama-3.1-nemotron-70b-instruct": [128e3, 8192], "nvidia/llama-3.1-nemotron-ultra-253b-v1": [128e3, 16384], "nvidia/nemotron-3-nano-30b-a3b": [262144, 235929], "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": [256e3, 65536], "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": [256e3, 65536], "nvidia/nemotron-3-super-120b-a12b": [256e3, 32e3], "nvidia/nemotron-3-super-120b-a12b:free": [262144, 235929], "nvidia/nemotron-3-ultra-550b-a55b": [202800, 182520], "nvidia/nemotron-3-ultra-550b-a55b:free": [1e6, 65536], "nvidia/nemotron-3.5-lightning": [262144, 131072], "nvidia/nemotron-3.5-lightning-30b-a3b": [262144, 262144], "nvidia/nemotron-3.5-lightning-free": [1e6, 65e3], "nvidia/nemotron-3.5-lightning:free": [1e6, 65536], "nvidia/nemotron-3.5-super-vl": [262144, 235929], "nvidia/nemotron-3.5-super-vl-120b-a12b": [1048576, 8192], "nvidia/nemotron-3.5-super-vl:free": [1e6, 131072], "nvidia/nemotron-nano-12b-v2-vl": [131072, 131072], "nvidia/nemotron-nano-9b-v2": [131072, 131072], "o1": [2e5, 1e5], "o1-pro": [2e5, 1e5], "o3": [2e5, 1e5], "o3-mini": [2e5, 1e5], "o3-pro": [2e5, 1e5], "o4-mini": [2e5, 1e5], "open-mistral-nemo": [128e3, 128e3], "openai.gpt-5.4": [1e6, 128e3], "openai.gpt-5.5": [1e6, 128e3], "openai.gpt-5.6-luna": [105e4, 128e3], "openai.gpt-5.6-sol": [105e4, 128e3], "openai.gpt-5.6-terra": [105e4, 128e3], "openai.gpt-6-astra": [105e4, 128e3], "openai.gpt-6-luna": [105e4, 128e3], "openai.gpt-6-sol": [105e4, 128e3], "openai.gpt-6.1-sol": [105e4, 128e3], "openai.gpt-oss-120b": [131072, 131072], "openai.gpt-oss-120b-1:0": [131072, 128e3], "openai.gpt-oss-20b": [131072, 131072], "openai.gpt-oss-20b-1:0": [131072, 128e3], "openai.gpt-oss-safeguard-120b": [128e3, 16384], "openai.gpt-oss-safeguard-20b": [128e3, 16384], "openai/gpt-3.5-turbo": [16385, 4096], "openai/gpt-3.5-turbo-0613": [4095, 3685], "openai/gpt-3.5-turbo-16k": [16385, 4096], "openai/gpt-3.5-turbo:batch": [16385, 4096], "openai/gpt-4": [8191, 4096], "openai/gpt-4-turbo": [128e3, 4096], "openai/gpt-4-turbo:batch": [128e3, 4096], "openai/gpt-4.1": [1047576, 32768], "openai/gpt-4.1-batch": [1047576, 32768], "openai/gpt-4.1-fast": [1047576, 32768], "openai/gpt-4.1-mini": [1047576, 32768], "openai/gpt-4.1-mini-batch": [1047576, 32768], "openai/gpt-4.1-mini-fast": [1047576, 32768], "openai/gpt-4.1-mini:batch": [1047576, 32768], "openai/gpt-4.1-nano": [1047576, 32768], "openai/gpt-4.1-nano-batch": [1047576, 32768], "openai/gpt-4.1-nano-fast": [1047576, 32768], "openai/gpt-4.1-nano:batch": [1047576, 32768], "openai/gpt-4.1:batch": [1047576, 32768], "openai/gpt-4o": [128e3, 16384], "openai/gpt-4o-2024-05-13": [128e3, 4096], "openai/gpt-4o-2024-08-06": [128e3, 16384], "openai/gpt-4o-2024-11-20": [128e3, 16384], "openai/gpt-4o-batch": [128e3, 16384], "openai/gpt-4o-fast": [128e3, 16384], "openai/gpt-4o-mini": [128e3, 16384], "openai/gpt-4o-mini-2024-07-18": [128e3, 16384], "openai/gpt-4o-mini-batch": [128e3, 16384], "openai/gpt-4o-mini-fast": [128e3, 16384], "openai/gpt-4o-mini:batch": [128e3, 16384], "openai/gpt-4o:batch": [128e3, 16384], "openai/gpt-5": [4e5, 128e3], "openai/gpt-5-batch": [4e5, 128e3], "openai/gpt-5-codex": [4e5, 128e3], "openai/gpt-5-fast": [4e5, 128e3], "openai/gpt-5-mini": [4e5, 128e3], "openai/gpt-5-mini-batch": [4e5, 128e3], "openai/gpt-5-mini-fast": [4e5, 128e3], "openai/gpt-5-mini:batch": [4e5, 128e3], "openai/gpt-5-nano": [4e5, 128e3], "openai/gpt-5-nano-batch": [4e5, 128e3], "openai/gpt-5-nano:batch": [4e5, 128e3], "openai/gpt-5-pro": [4e5, 128e3], "openai/gpt-5-pro-batch": [4e5, 272e3], "openai/gpt-5-pro:batch": [4e5, 128e3], "openai/gpt-5.1": [4e5, 128e3], "openai/gpt-5.1-codex": [4e5, 128e3], "openai/gpt-5.1-codex-max": [4e5, 128e3], "openai/gpt-5.1-codex-mini": [4e5, 128e3], "openai/gpt-5.1-thinking": [4e5, 128e3], "openai/gpt-5.1-thinking-fast": [4e5, 128e3], "openai/gpt-5.1:batch": [4e5, 128e3], "openai/gpt-5.2": [4e5, 128e3], "openai/gpt-5.2-batch": [4e5, 128e3], "openai/gpt-5.2-chat": [128e3, 32e3], "openai/gpt-5.2-codex": [4e5, 128e3], "openai/gpt-5.2-fast": [4e5, 128e3], "openai/gpt-5.2-pro": [4e5, 128e3], "openai/gpt-5.2-pro:batch": [4e5, 128e3], "openai/gpt-5.2:batch": [4e5, 128e3], "openai/gpt-5.3-codex": [4e5, 128e3], "openai/gpt-5.3-codex-fast": [4e5, 128e3], "openai/gpt-5.4": [105e4, 128e3], "openai/gpt-5.4-batch": [105e4, 128e3], "openai/gpt-5.4-fast": [105e4, 128e3], "openai/gpt-5.4-mini": [4e5, 128e3], "openai/gpt-5.4-mini-batch": [4e5, 128e3], "openai/gpt-5.4-mini-fast": [4e5, 128e3], "openai/gpt-5.4-mini:batch": [4e5, 128e3], "openai/gpt-5.4-nano": [4e5, 128e3], "openai/gpt-5.4-nano-batch": [4e5, 128e3], "openai/gpt-5.4-nano:batch": [4e5, 128e3], "openai/gpt-5.4-pro": [105e4, 128e3], "openai/gpt-5.4-pro:batch": [105e4, 128e3], "openai/gpt-5.4:batch": [105e4, 128e3], "openai/gpt-5.5": [1e6, 128e3], "openai/gpt-5.5-batch": [1e6, 128e3], "openai/gpt-5.5-fast": [1e6, 128e3], "openai/gpt-5.5-pro": [1e6, 128e3], "openai/gpt-5.5-pro-batch": [1e6, 128e3], "openai/gpt-5.5-pro:batch": [105e4, 128e3], "openai/gpt-5.5:batch": [105e4, 128e3], "openai/gpt-5.6-luna": [105e4, 128e3], "openai/gpt-5.6-luna-batch": [105e4, 128e3], "openai/gpt-5.6-luna-fast": [105e4, 128e3], "openai/gpt-5.6-luna-pro": [105e4, 128e3], "openai/gpt-5.6-luna-pro:batch": [105e4, 128e3], "openai/gpt-5.6-luna:batch": [105e4, 128e3], "openai/gpt-5.6-sol": [105e4, 128e3], "openai/gpt-5.6-sol-batch": [105e4, 128e3], "openai/gpt-5.6-sol-fast": [105e4, 128e3], "openai/gpt-5.6-sol-pro": [105e4, 128e3], "openai/gpt-5.6-sol-pro:batch": [105e4, 128e3], "openai/gpt-5.6-sol:batch": [105e4, 128e3], "openai/gpt-5.6-terra": [105e4, 128e3], "openai/gpt-5.6-terra-batch": [105e4, 128e3], "openai/gpt-5.6-terra-fast": [105e4, 128e3], "openai/gpt-5.6-terra-pro": [105e4, 128e3], "openai/gpt-5.6-terra-pro:batch": [105e4, 128e3], "openai/gpt-5.6-terra:batch": [105e4, 128e3], "openai/gpt-5:batch": [4e5, 128e3], "openai/gpt-6-astra": [105e4, 128e3], "openai/gpt-6-astra-batch": [105e4, 128e3], "openai/gpt-6-astra-fast": [105e4, 128e3], "openai/gpt-6-astra-pro": [105e4, 128e3], "openai/gpt-6-astra-pro:batch": [105e4, 128e3], "openai/gpt-6-astra:batch": [105e4, 128e3], "openai/gpt-6-luna": [105e4, 128e3], "openai/gpt-6-luna-batch": [105e4, 128e3], "openai/gpt-6-luna-fast": [105e4, 128e3], "openai/gpt-6-luna-pro": [105e4, 128e3], "openai/gpt-6-luna-pro:batch": [105e4, 128e3], "openai/gpt-6-luna:batch": [105e4, 128e3], "openai/gpt-6-sol": [105e4, 128e3], "openai/gpt-6-sol-batch": [105e4, 128e3], "openai/gpt-6-sol-fast": [105e4, 128e3], "openai/gpt-6-sol-pro": [105e4, 128e3], "openai/gpt-6-sol-pro:batch": [105e4, 128e3], "openai/gpt-6-sol:batch": [105e4, 128e3], "openai/gpt-6.1-sol": [105e4, 128e3], "openai/gpt-6.1-sol-batch": [105e4, 128e3], "openai/gpt-6.1-sol-fast": [105e4, 128e3], "openai/gpt-6.1-sol-pro": [105e4, 128e3], "openai/gpt-6.1-sol-pro:batch": [105e4, 128e3], "openai/gpt-6.1-sol:batch": [105e4, 128e3], "openai/gpt-audio": [128e3, 16384], "openai/gpt-audio-mini": [128e3, 16384], "openai/gpt-chat-latest": [4e5, 128e3], "openai/gpt-oss-120b": [131072, 65536], "openai/gpt-oss-120b:batch": [131072, 117964], "openai/gpt-oss-20b": [131072, 32768], "openai/gpt-oss-20b:batch": [131072, 117964], "openai/gpt-oss-safeguard-120b": [128e3, 16e3], "openai/gpt-oss-safeguard-20b": [131072, 65536], "openai/o1": [2e5, 1e5], "openai/o3": [2e5, 1e5], "openai/o3-fast": [2e5, 1e5], "openai/o3-mini": [2e5, 1e5], "openai/o3-mini-high": [2e5, 1e5], "openai/o3-mini:batch": [2e5, 1e5], "openai/o3-pro": [2e5, 1e5], "openai/o3:batch": [2e5, 1e5], "openai/o4-mini": [2e5, 1e5], "openai/o4-mini-fast": [2e5, 1e5], "openai/o4-mini-high": [2e5, 1e5], "openai/o4-mini:batch": [2e5, 1e5], "openrouter/auto": [2e6, 4096], "openrouter/auto-beta": [2e6, 4096], "openrouter/free": [2e5, 4096], "openrouter/fusion": [1e6, 3e4], "openrouter/pareto-code": [2e6, 4096], "perceptron/perceptron-mk1.5": [36864, 8192], "pixtral-12b": [128e3, 128e3], "pixtral-large-latest": [128e3, 128e3], "poolside/laguna-s-2.1": [1e6, 131072], "poolside/laguna-s-2.1-free": [256e3, 32768], "poolside/laguna-s-2.1:free": [262144, 32768], "poolside/laguna-xs-2.1": [262144, 16384], "poolside/laguna-xs-2.1:free": [262144, 32768], "precise": [272e3, 128e3], "prism-ml/ternary-bonsai-2-27b": [262144, 32768], "quiverai/arrow-2": [131072, 131072], "quiverai/arrow-2-telos": [131072, 131072], "qwen-3.8-27b": [131072, 40960], "qwen.qwen3-235b-a22b-2507-v1:0": [262144, 131072], "qwen.qwen3-32b-v1:0": [32768, 16384], "qwen.qwen3-coder-30b-a3b-v1:0": [262144, 131072], "qwen.qwen3-coder-480b-a35b-v1:0": [131072, 65536], "qwen.qwen3-coder-next": [262144, 65536], "qwen.qwen3-next-80b-a3b": [262144, 262e3], "qwen.qwen3-vl-235b-a22b": [262144, 262e3], "qwen/qwen-2.5-72b-instruct": [32768, 16384], "qwen/qwen-2.5-7b-instruct": [32768, 29491], "qwen/qwen-plus": [1e6, 32768], "qwen/qwen3-14b": [40960, 16384], "qwen/qwen3-235b-a22b-2507": [262144, 16384], "qwen/qwen3-235b-a22b-thinking-2507": [128e3, 16384], "qwen/qwen3-30b-a3b": [40960, 16384], "qwen/qwen3-30b-a3b-instruct-2507": [262144, 235929], "qwen/qwen3-32b": [40960, 16384], "qwen/qwen3-coder": [262144, 65536], "qwen/qwen3-coder-30b-a3b-instruct": [262144, 235929], "qwen/qwen3-coder-flash": [1e6, 65536], "qwen/qwen3-coder-next": [262144, 235929], "qwen/qwen3-next-80b-a3b-instruct": [262144, 16384], "qwen/qwen3-next-80b-a3b-thinking": [262144, 235929], "qwen/qwen3-vl-235b-a22b-instruct": [131072, 32768], "qwen/qwen3-vl-30b-a3b-instruct": [262144, 16384], "qwen/qwen3-vl-30b-a3b-thinking": [262144, 235929], "qwen/qwen3-vl-8b-instruct": [262144, 235929], "qwen/qwen3.5-122b-a10b": [262144, 65536], "qwen/qwen3.5-27b": [262144, 65536], "qwen/qwen3.5-35b-a3b": [262144, 81920], "qwen/qwen3.5-397b-a17b": [262144, 65536], "qwen/qwen3.5-9b": [262144, 65536], "qwen/qwen3.5-flash-02-23": [1e6, 65536], "qwen/qwen3.5-plus-02-15": [1e6, 65536], "qwen/qwen3.5-plus-20260420": [1e6, 65536], "qwen/qwen3.6-27b": [131072, 16384], "qwen/qwen3.6-35b-a3b": [262144, 235929], "qwen/qwen3.6-flash": [1e6, 65536], "qwen/qwen3.6-plus": [1e6, 65536], "qwen/qwen3.7-flash": [1e6, 65536], "qwen/qwen3.7-max": [1e6, 131072], "qwen/qwen3.7-plus": [1e6, 131072], "qwen/qwen3.7-plus:batch": [262144, 131072], "qwen/qwen3.8-2.4t-a95b": [101e4, 909e3], "qwen/qwen3.8-27b": [131072, 16384], "qwen/qwen3.8-flash": [1e6, 131072], "qwen/qwen3.8-max-0902": [1e6, 131072], "qwen/qwen3.8-max-prime": [1e6, 131072], "qwen/qwen3.8-omni-flash": [1e6, 131072], "qwen3.5-plus": [262144, 65536], "qwen3.6-flash": [1e6, 65536], "qwen3.6-plus": [1e6, 65536], "qwen3.7-max": [1e6, 131072], "qwen3.7-plus": [1e6, 65536], "qwen3.8-flash": [1e6, 131072], "qwen3.8-max": [1e6, 131072], "recursive/flint": [262144, 65536], "recursive/flint-v1.0:free": [262144, 235929], "reflection/Beam-1.0-501B-A23B": [1048576, 131072], "reflection/beam": [1048576, 131072], "reflection/beam-1.0-501b-a23b": [1048576, 943718], "reflection/beam-free": [1048576, 131072], "rekaai/reka-edge": [16384, 14745], "relace/relace-search": [256e3, 128e3], "sakana/fugu-max": [1e6, 128e3], "sakana/fugu-ultra": [1e6, 128e3], "sakana/fugu-ultra-v2": [1e6, 128e3], "sakana/namazu": [256e3, 256e3], "sakana/sakana-namazu": [262144, 65536], "spacexai/grok-4.1-fast-non-reasoning": [1e6, 1e6], "spacexai/grok-4.1-fast-reasoning": [1e6, 1e6], "spacexai/grok-4.20-multi-agent": [2e6, 2e6], "spacexai/grok-4.20-multi-agent-batch": [2e6, 2e6], "spacexai/grok-4.20-multi-agent-beta": [2e6, 2e6], "spacexai/grok-4.20-non-reasoning": [2e6, 2e6], "spacexai/grok-4.20-non-reasoning-batch": [2e6, 2e6], "spacexai/grok-4.20-non-reasoning-beta": [2e6, 2e6], "spacexai/grok-4.20-reasoning": [2e6, 2e6], "spacexai/grok-4.20-reasoning-batch": [2e6, 2e6], "spacexai/grok-4.20-reasoning-beta": [2e6, 2e6], "spacexai/grok-4.3": [1e6, 1e6], "spacexai/grok-4.3-batch": [1e6, 1e6], "spacexai/grok-4.5": [5e5, 5e5], "spacexai/grok-4.6": [5e5, 5e5], "spacexai/grok-4.7": [5e5, 5e5], "spacexai/grok-build-0.1": [256e3, 256e3], "stealth/glyph-cluster": [256e3, 256e3], "step-5-preview": [1e6, 65536], "stepfun-ai/Step-3.5-Flash": [262144, 256e3], "stepfun-ai/Step-3.7-Flash": [262144, 256e3], "stepfun-ai/step-5-preview": [1048576, 1048576], "stepfun/step-3.5-flash": [262144, 65536], "stepfun/step-3.7-flash": [256e3, 230400], "stepfun/step-5-preview": [1e6, 64e3], "tencent/Hy3": [262144, 128e3], "tencent/Hy4-preview": [1e6, 64e3], "tencent/hy3": [262144, 128e3], "tencent/hy3-preview": [262144, 235929], "tencent/hy4-preview": [1024e3, 64e3], "thinkingmachines/Inkling": [524288, 131072], "thinkingmachines/Inkling-Small": [524288, 1048576], "thinkingmachines/inkling": [256e3, 256e3], "thinkingmachines/inkling-small": [524288, 262144], "thinkingmachines/inkling-small:free": [1048576, 262144], "thinkingmachines/inkling:free": [1048576, 262144], "typesafe/jev-router": [1e6, 4096], "unbiased/pareto-26.10": [1048576, 131072], "unbiased/pareto-26.9": [262144, 131072], "upstage/solar-mini4": [524288, 131072], "upstage/solar-pro-3": [131072, 117964], "upstage/solar-pro4": [524288, 131072], "us-gov.openai.gpt-oss-120b-1:0": [128e3, 16384], "us-gov.openai.gpt-oss-20b-1:0": [128e3, 16384], "us.amazon.nova-2-lite-v1:0": [1e6, 65535], "us.amazon.nova-lite-v1:0": [3e5, 1e4], "us.amazon.nova-micro-v1:0": [128e3, 1e4], "us.amazon.nova-premier-v1:0": [1e6, 1e4], "us.amazon.nova-pro-v1:0": [3e5, 1e4], "us.anthropic.claude-fable-5": [1e6, 128e3], "us.anthropic.claude-fable-5-1": [1e6, 128e3], "us.anthropic.claude-haiku-4-5-20251001-v1:0": [2e5, 64e3], "us.anthropic.claude-haiku-5-5": [1e6, 128e3], "us.anthropic.claude-opus-4-1-20250805-v1:0": [2e5, 32e3], "us.anthropic.claude-opus-4-5-20251101-v1:0": [2e5, 64e3], "us.anthropic.claude-opus-4-6-v1": [1e6, 128e3], "us.anthropic.claude-opus-4-7": [1e6, 128e3], "us.anthropic.claude-opus-4-8": [1e6, 128e3], "us.anthropic.claude-opus-5": [1e6, 128e3], "us.anthropic.claude-opus-5-5": [1e6, 128e3], "us.anthropic.claude-sonnet-4-20250514-v1:0": [2e5, 64e3], "us.anthropic.claude-sonnet-4-5-20250929-v1:0": [2e5, 64e3], "us.anthropic.claude-sonnet-4-6": [1e6, 128e3], "us.anthropic.claude-sonnet-5": [1e6, 128e3], "us.anthropic.claude-sonnet-5-5": [1e6, 128e3], "us.meta.llama3-1-70b-instruct-v1:0": [128e3, 4096], "us.meta.llama3-1-8b-instruct-v1:0": [128e3, 4096], "us.meta.llama3-3-70b-instruct-v1:0": [128e3, 4096], "us.meta.llama4-maverick-17b-instruct-v1:0": [1e6, 8192], "us.meta.llama4-scout-17b-instruct-v1:0": [1e7, 8192], "us.mistral.pixtral-large-2502-v1:0": [128e3, 8192], "us.moonshotai.kimi-k3": [1048576, 128e3], "us.openai.gpt-5.6-luna": [105e4, 128e3], "us.openai.gpt-5.6-sol": [105e4, 128e3], "us.openai.gpt-5.6-terra": [105e4, 128e3], "us.openai.gpt-6-astra": [105e4, 128e3], "us.openai.gpt-6-luna": [105e4, 128e3], "us.openai.gpt-6-sol": [105e4, 128e3], "us.openai.gpt-6.1-sol": [105e4, 128e3], "us.writer.palmyra-x4-v1:0": [122880, 8192], "us.writer.palmyra-x5-v1:0": [104e4, 8192], "us.xai.grok-4.6": [5e5, 5e5], "us.xai.grok-4.7": [5e5, 5e5], "us.zai.glm-5.3": [1e6, 128e3], "voxtral-small-2507": [32768, 32e3], "voxtral-small-latest": [32768, 32e3], "workers-ai/@cf/deepseek-ai/deepseek-v4-flash-0731": [1048576, 1048576], "workers-ai/@cf/deepseek-ai/deepseek-v4-pro-0813": [1048576, 1048576], "workers-ai/@cf/deepseek-ai/deepseek-v4.1-flash-1017": [1048576, 1048576], "workers-ai/@cf/google/gemma-4-26b-a4b-it": [256e3, 16384], "workers-ai/@cf/ibm-granite/granite-4.0-h-micro": [131e3, 131e3], "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast": [24e3, 24e3], "workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct": [131e3, 16384], "workers-ai/@cf/mistralai/mistral-small-3.1-24b-instruct": [128e3, 128e3], "workers-ai/@cf/moonshotai/kimi-k2.6": [262144, 256e3], "workers-ai/@cf/moonshotai/kimi-k2.7-code": [262144, 262144], "workers-ai/@cf/nvidia/nemotron-3-120b-a12b": [256e3, 256e3], "workers-ai/@cf/openai/gpt-oss-120b": [128e3, 16384], "workers-ai/@cf/openai/gpt-oss-20b": [128e3, 16384], "workers-ai/@cf/qwen/qwen3-30b-a3b-fp8": [32768, 32768], "workers-ai/@cf/qwen/qwen3.8-27b": [262144, 262144], "workers-ai/@cf/zai-org/glm-4.7-flash": [131072, 131072], "workers-ai/@cf/zai-org/glm-5.2": [262144, 256e3], "workers-ai/@cf/zai-org/glm-5.3": [1048576, 1048576], "workers-ai/@cf/zai-org/glm-5.3-flash": [1048576, 1048576], "writer.palmyra-x4-v1:0": [122880, 8192], "writer.palmyra-x5-v1:0": [104e4, 8192], "x-ai/grok-4.20": [2e6, 18e5], "x-ai/grok-4.3": [1e6, 9e5], "x-ai/grok-4.3:batch": [1e6, 9e5], "x-ai/grok-4.5": [5e5, 45e4], "x-ai/grok-4.6": [5e5, 45e4], "x-ai/grok-4.7": [5e5, 45e4], "x-ai/grok-build-0.1": [256e3, 230400], "xai.grok-4.3": [1e6, 131072], "xai.grok-4.6": [5e5, 5e5], "xiaomi/mimo-v2.5": [105e4, 131100], "xiaomi/mimo-v2.5-pro": [105e4, 131e3], "xiaomi/mimo-v2.6-flash": [1048576, 131072], "xiaomi/mimo-v2.6-pro": [1048576, 131072], "xiaomi/mimo-v2.6-pro-ultraspeed": [1048576, 131072], "xingchen-agi/xing4.0-29b-a4b:free": [262144, 235929], "z-ai/glm-4.5": [131072, 98304], "z-ai/glm-4.5-air": [131072, 98304], "z-ai/glm-4.5v": [65536, 16384], "z-ai/glm-4.6": [204800, 131072], "z-ai/glm-4.6v": [131072, 32768], "z-ai/glm-4.7": [204800, 131072], "z-ai/glm-4.7-flash": [131072, 117964], "z-ai/glm-5": [202752, 131072], "z-ai/glm-5-turbo": [202752, 131072], "z-ai/glm-5.1": [202752, 131072], "z-ai/glm-5.2": [1048576, 943718], "z-ai/glm-5.3": [1e6, 131072], "z-ai/glm-5.3-flash": [1e6, 131072], "z-ai/glm-5.3-flash:batch": [1048576, 131072], "z-ai/glm-5.3-flashx": [1048576, 131072], "z-ai/glm-5.3-prime": [1e6, 131072], "z-ai/glm-5.3:batch": [1048576, 131072], "z-ai/glm-5v-turbo": [202752, 131072], "zai-glm-5-2": [1048576, 131072], "zai-glm-5-3": [1048576, 131072], "zai-org/GLM-4.5": [131072, 98304], "zai-org/GLM-4.5-Air": [131072, 98304], "zai-org/GLM-4.5V": [65536, 16384], "zai-org/GLM-4.6": [204800, 131072], "zai-org/GLM-4.6V-Flash": [131072, 32768], "zai-org/GLM-4.7": [204800, 131072], "zai-org/GLM-4.7-Flash": [2e5, 128e3], "zai-org/GLM-5": [202752, 131072], "zai-org/GLM-5.1": [202752, 131072], "zai-org/GLM-5.2": [262144, 131072], "zai-org/GLM-5.2-Fast": [1048576, 262144], "zai-org/GLM-5.3": [1048575, 262144], "zai-org/GLM-5.3-Fast": [1048576, 262144], "zai-org/GLM-5.3-Flash": [1048576, 131072], "zai.glm-4.7": [202752, 131072], "zai.glm-4.7-flash": [202752, 131072], "zai.glm-5": [202752, 131072], "zai/glm-4.5": [128e3, 96e3], "zai/glm-4.5-air": [128e3, 96e3], "zai/glm-4.5v": [66e3, 16e3], "zai/glm-4.6": [2e5, 96e3], "zai/glm-4.7": [2e5, 12e4], "zai/glm-4.7-flash": [2e5, 131e3], "zai/glm-4.7-flashx": [2e5, 128e3], "zai/glm-5": [202800, 131100], "zai/glm-5-turbo": [202800, 131100], "zai/glm-5.1": [202800, 64e3], "zai/glm-5.2": [1e6, 128e3], "zai/glm-5.2-fast": [1e6, 128e3], "zai/glm-5.3": [1e6, 1e6], "zai/glm-5.3-fast": [1048576, 262144], "zai/glm-5.3-flash": [1e6, 131e3], "zai/glm-5.3-flashx": [1e6, 131072], "zai/glm-5v-turbo": [2e5, 128e3], "~anthropic/claude-fable-latest": [1e6, 128e3], "~anthropic/claude-haiku-latest": [1e6, 128e3], "~anthropic/claude-opus-latest": [1e6, 128e3], "~anthropic/claude-sonnet-latest": [1e6, 128e3], "~deepseek/deepseek-flash-latest": [1048576, 943718], "~deepseek/deepseek-pro-latest": [1048576, 393216], "~deepseek/deepseek-v4-flash-latest": [1048576, 943718], "~google/gemini-flash-latest": [1048576, 65536], "~google/gemini-pro-latest": [1048576, 943718], "~moonshotai/kimi-latest": [1048576, 131072], "~openai/gpt-astra-latest": [105e4, 128e3], "~openai/gpt-luna-latest": [105e4, 128e3], "~openai/gpt-mini-latest": [4e5, 128e3], "~openai/gpt-sol-latest": [105e4, 128e3], "~openai/gpt-terra-latest": [105e4, 128e3], "~unbiased/pareto-latest": [1048576, 131072], "~x-ai/grok-latest": [5e5, 45e4], "~z-ai/glm-flash-latest": [1048576, 131072], "~z-ai/glm-latest": [1048576, 943718] };

// src/host/capacity.ts
var FALLBACK_CONTEXT_WINDOW = 1e6;
var FALLBACK_MAX_TOKENS = 128e3;
var COMPACTION_HEADROOM_TOKENS = 65536;
var MIN_OUTPUT_TOKENS = 1024;
function lookupCandidates(id) {
  const raw = id.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const tail = lower.split("/").pop() ?? lower;
  const out = [raw, lower, tail];
  for (const base of [lower, tail]) {
    out.push(base.replace(/(\d)-(?=\d)/gu, "$1."));
    out.push(base.replace(/(\d)\.(?=\d)/gu, "$1-"));
  }
  return [...new Set(out)];
}
function officialCapacity(id) {
  for (const key of lookupCandidates(id)) {
    const hit = OFFICIAL_CAPACITY[key];
    if (hit) return { contextWindow: hit[0], maxTokens: hit[1] };
  }
  return void 0;
}
function clampMaxTokens(contextWindow, maxTokens) {
  const room = contextWindow - COMPACTION_HEADROOM_TOKENS;
  if (room < MIN_OUTPUT_TOKENS) return maxTokens;
  return Math.min(maxTokens, room);
}
function usable(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function resolveCapacity(model) {
  const official = officialCapacity(model.id);
  const relayCtx = usable(model.contextWindow) ? model.contextWindow : void 0;
  const relayMax = usable(model.maxTokens) ? model.maxTokens : void 0;
  let contextWindow;
  let maxTokens;
  let source;
  if (relayCtx !== void 0 || relayMax !== void 0) {
    contextWindow = relayCtx ?? official?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
    maxTokens = relayMax ?? official?.maxTokens ?? FALLBACK_MAX_TOKENS;
    source = "relay";
  } else if (official) {
    contextWindow = official.contextWindow;
    maxTokens = official.maxTokens;
    source = "official";
  } else {
    contextWindow = FALLBACK_CONTEXT_WINDOW;
    maxTokens = FALLBACK_MAX_TOKENS;
    source = "default";
  }
  return { contextWindow, maxTokens: clampMaxTokens(contextWindow, maxTokens), source };
}
function resolveModels(models) {
  return models.map((model) => {
    if (model.capacitySource !== void 0 && usable(model.contextWindow) && usable(model.maxTokens)) {
      return model;
    }
    const capacity = resolveCapacity(model);
    return {
      ...model,
      contextWindow: capacity.contextWindow,
      maxTokens: capacity.maxTokens,
      capacitySource: capacity.source
    };
  });
}
function sameCapacity(a, b) {
  return a.contextWindow === b.contextWindow && a.maxTokens === b.maxTokens;
}

// src/shared/types.ts
var DEFAULT_API = "openai-responses";
function emptyState(baseURL, overrides = {}) {
  return {
    profile: "aimy",
    displayName: "",
    preset: false,
    api: DEFAULT_API,
    imageInput: true,
    configured: true,
    ...overrides,
    baseURL,
    connected: false,
    supportsSwitch: false,
    token: null,
    models: [],
    modelsFetchedAt: 0,
    provider: null,
    credential: null,
    selection: null,
    staleModel: false
  };
}

// src/host/provider.ts
var DEFAULT_ADAPTER = "@deepseek-ai/dsh-llm-pi-ai";
function pickPlugin(adapter, specifier = DEFAULT_ADAPTER) {
  if (adapter === void 0 || adapter === null) {
    throw new Error("适配器模块为空：" + specifier);
  }
  if (typeof adapter.apply === "function") return adapter;
  if (typeof adapter === "function" && !adapter.prototype) return adapter;
  const fallback = adapter.default;
  if (fallback && typeof fallback.apply === "function") return fallback;
  if (typeof fallback === "function" && !fallback.prototype) return fallback;
  throw new Error(
    "适配器模块没有导出可挂载的 cordis 插件（需要 name/inject/apply）：" + specifier + "，实际导出：" + Object.keys(adapter).join(", ")
  );
}
function normalizeBaseURLForApi(baseURL, api = DEFAULT_API) {
  let trimmed = baseURL.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (api === "anthropic-messages") {
    trimmed = trimmed.replace(/\/v1\/messages$/i, "").replace(/\/messages$/i, "");
    return trimmed.replace(/\/v1$/i, "");
  }
  trimmed = trimmed.replace(/\/v1\/chat\/completions$/i, "").replace(/\/v1\/responses$/i, "").replace(/\/chat\/completions$/i, "").replace(/\/responses$/i, "").replace(/\/completions$/i, "");
  return /\/v1$/i.test(trimmed) ? trimmed : trimmed + "/v1";
}
function buildProfile(opts2) {
  const imageInput = opts2.imageInput !== false;
  return {
    displayName: opts2.displayName,
    api: opts2.api ?? DEFAULT_API,
    baseURL: normalizeBaseURLForApi(opts2.baseURL, opts2.api ?? DEFAULT_API),
    apiKeyEnv: opts2.apiKeyRef,
    defaultContextWindow: opts2.defaultContextWindow,
    defaultMaxTokens: opts2.defaultMaxTokens,
    // provider 级兜底（逐模型已声明 input；空数组会回落到这里）
    defaultInput: [...imageInput ? MODEL_INPUT_TEXT_IMAGE : MODEL_INPUT_TEXT],
    // 与 settings 路径共用同一份能力声明：contextWindow + maxTokens + 输入模态
    // + cost + 思考档位。少了 reasoningEfforts，pi-ai 会回退 reasoning:false，
    // 模型就没有档位可选；少了逐模型 maxTokens，DSH 拿不到输出上限（见 capacity.ts）。
    models: opts2.models.map((m) => modelEntry(m, imageInput))
  };
}
function sameModels(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === void 0 || right === void 0) return false;
    if (left.id !== right.id) return false;
    if (!sameCapacity(left, right)) return false;
  }
  return true;
}
async function createProviderMount(ctx, opts2, loadAdapter = (s) => import(s)) {
  const specifier = opts2.adapterModule ?? DEFAULT_ADAPTER;
  const adapter = await loadAdapter(specifier);
  const plugin = pickPlugin(adapter, specifier);
  let fiber;
  let models = opts2.models;
  let verification = null;
  const mountWith = (next) => {
    const config = { providers: { [opts2.routeName]: buildProfile({ ...opts2, models: next }) } };
    fiber = ctx.plugin(plugin, config);
    models = next;
    verification = null;
  };
  const verify = async () => {
    if (verification) return verification;
    try {
      const llm = typeof ctx?.get === "function" ? ctx.get("llm", false) : void 0;
      if (!llm || typeof llm.listProviders !== "function") {
        verification = { present: null, listedModels: null, detail: "llm 服务不可用（无法自检）" };
        return verification;
      }
      const fiberState = fiber && typeof fiber.state === "number" ? fiber.state : void 0;
      if (fiberState !== void 0 && fiberState !== 2) {
        verification = {
          present: false,
          listedModels: null,
          detail: "pi-ai 子插件未激活（fiber.state=" + fiberState + "）。常见原因：profile 里已有 @deepseek-ai/dsh-llm-pi-ai 条目，同一个 pi-ai 不能挂两次（内置 provider 目录会重复注册而整体失败）"
        };
        return verification;
      }
      const present = llm.listProviders().some((p) => p?.id === opts2.routeName);
      let listedModels = null;
      if (present && typeof llm.listModels === "function") {
        try {
          const listed = await llm.listModels(opts2.routeName);
          listedModels = Array.isArray(listed) ? listed.length : 0;
        } catch (error) {
          verification = { present, listedModels: null, detail: "listModels 抛错：" + (error instanceof Error ? error.message : String(error)) };
          return verification;
        }
      }
      verification = {
        present,
        listedModels,
        ...present && listedModels === 0 ? { detail: "路由已注册但模型为空（通常是 apiKeyEnv 解析不到凭据）" } : {},
        ...!present ? { detail: "ctx.plugin 未把路由注册进 llm（fiber 可能停在 pending）" } : {}
      };
      return verification;
    } catch (error) {
      verification = { present: false, listedModels: null, detail: "自检抛错：" + (error instanceof Error ? error.message : String(error)) };
      return verification;
    }
  };
  mountWith(opts2.models);
  return {
    managedBy: "fiber",
    get api() {
      return opts2.api ?? DEFAULT_API;
    },
    get mounted() {
      return Boolean(fiber);
    },
    get modelCount() {
      return models.length;
    },
    routeName: opts2.routeName,
    verify,
    async update(next) {
      if (sameModels(models, next)) return;
      if (fiber && typeof fiber.dispose === "function") {
        await fiber.dispose();
        fiber = void 0;
      }
      mountWith(next);
    },
    async dispose() {
      if (fiber && typeof fiber.dispose === "function") {
        await fiber.dispose();
      }
      fiber = void 0;
      models = [];
    }
  };
}

// src/host/profiles.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";

// src/host/state.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  return join(homedir(), ".dsh");
}
var CatalogStore = class {
  constructor(filePath = join(resolveDshHome(), "dsh-aimy", "state.json")) {
    this.filePath = filePath;
  }
  data = { version: 1, catalogs: [] };
  load() {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.catalogs)) {
        this.data = { version: 1, catalogs: parsed.catalogs.filter(isCatalog) };
      }
    } catch {
      this.data = { version: 1, catalogs: [] };
    }
  }
  get(baseURL, group) {
    return this.data.catalogs.find((c) => c.baseURL === baseURL && c.group === group);
  }
  /**
   * 该站点最近一次的目录（不区分分组）。
   *
   * 冷启动时还不知道当前分组（分组要打网络才知道），但模型路由需要在启动时就挂上，
   * 否则模型选择器在整个「用户点开面板之前」都是空的。用最近的目录做预热即可，
   * 面板刷新后会用真实分组目录重挂。
   */
  latest(baseURL) {
    let newest;
    for (const catalog of this.data.catalogs) {
      if (catalog.baseURL !== baseURL) continue;
      if (!newest || catalog.fetchedAt > newest.fetchedAt) newest = catalog;
    }
    return newest;
  }
  set(catalog) {
    this.data.catalogs = this.data.catalogs.filter(
      (c) => !(c.baseURL === catalog.baseURL && c.group === catalog.group)
    );
    this.data.catalogs.push(catalog);
    this.flush();
  }
  flush() {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
    } catch {
    }
  }
};
function isCatalog(value) {
  if (!value || typeof value !== "object") return false;
  const c = value;
  return typeof c.baseURL === "string" && typeof c.group === "string" && Array.isArray(c.models);
}
var GROUP_CACHE_TTL_MS = 5 * 6e4;
var GroupCache = class {
  constructor(now = () => Date.now()) {
    this.now = now;
  }
  entries = /* @__PURE__ */ new Map();
  /** 正在后台刷新的 key，避免同一站点并发打多次。 */
  refreshing = /* @__PURE__ */ new Set();
  /** 不支持分组接口的站点（404）：记住结论，别每次打开面板都撞一遍。 */
  unsupported = /* @__PURE__ */ new Set();
  /** 读取缓存，不触发任何网络。 */
  peek(baseURL) {
    return this.entries.get(baseURL);
  }
  /** 缓存是否仍在新鲜期内。 */
  fresh(baseURL) {
    const hit = this.entries.get(baseURL);
    return hit !== void 0 && this.now() - hit.fetchedAt < GROUP_CACHE_TTL_MS;
  }
  /** 该站点已确认没有分组接口。 */
  knownUnsupported(baseURL) {
    return this.unsupported.has(baseURL);
  }
  /** 记住「该站点没有分组接口」这个结论。 */
  markUnsupported(baseURL) {
    this.unsupported.add(baseURL);
    this.entries.delete(baseURL);
  }
  set(baseURL, state) {
    this.entries.set(baseURL, { state, fetchedAt: this.now() });
    this.unsupported.delete(baseURL);
  }
  /** 切组成功后直接更新，省掉一次后台刷新（切组响应里已带最新分组信息）。 */
  apply(baseURL, state) {
    this.set(baseURL, state);
  }
  /** 占位：返回 false 表示已有刷新在跑，调用方不必重复发起。 */
  beginRefresh(baseURL) {
    if (this.refreshing.has(baseURL)) return false;
    this.refreshing.add(baseURL);
    return true;
  }
  endRefresh(baseURL) {
    this.refreshing.delete(baseURL);
  }
  /** 仅供测试：清空全部状态。 */
  clear() {
    this.entries.clear();
    this.unsupported.clear();
    this.refreshing.clear();
  }
};

// src/host/profiles.ts
var AIMY_DEFAULT_BASE_URL = "https://aimy.sheep1x.top";
var AIMY_DEFAULT_DISPLAY_NAME = "Aimy-艾米";
var COMPAT_DISPLAY_NAME = "兼容模式";
var COMPAT_KEY_REF = "ONEHUB_COMPAT_API_KEY";
var DEFAULT_IMAGE_INPUT = true;
function profilesPath() {
  return join2(resolveDshHome(), "dsh-aimy", "profiles.json");
}
var ProfileSettingsStore = class {
  constructor(filePath = profilesPath()) {
    this.filePath = filePath;
  }
  data = { version: 1 };
  load() {
    try {
      const parsed = JSON.parse(readFileSync2(this.filePath, "utf8"));
      if (parsed && parsed.version === 1) {
        const next = { version: 1 };
        if (parsed.aimy && typeof parsed.aimy === "object") {
          const imageInput = normalizeImageInput(parsed.aimy.imageInput);
          const api = parsed.aimy.api;
          next.aimy = {
            ...api === void 0 ? {} : { api: normalizeApi(api) },
            ...imageInput === void 0 ? {} : { imageInput }
          };
        }
        if (parsed.compat && typeof parsed.compat.baseURL === "string") {
          const imageInput = normalizeImageInput(parsed.compat.imageInput);
          next.compat = {
            baseURL: parsed.compat.baseURL,
            api: normalizeApi(parsed.compat.api),
            ...imageInput === void 0 ? {} : { imageInput }
          };
        }
        this.data = next;
      }
    } catch {
      this.data = { version: 1 };
    }
  }
  compat() {
    return this.data.compat;
  }
  /** 预设档案的协议覆盖；未设置时返回 undefined，由调用方回退到配置默认值。 */
  aimyApi() {
    return this.data.aimy?.api;
  }
  /** 预设档案的图片开关覆盖；未设置时返回 undefined，由调用方回退到默认值。 */
  aimyImageInput() {
    return this.data.aimy?.imageInput;
  }
  /**
   * 更新预设档案的可写字段（协议 / 图片开关）。
   * 只覆盖传入的字段，未传的保留原值 —— 面板上一个开关不该顺手把协议改回去。
   */
  setAimy(patch) {
    const prev = this.data.aimy;
    const api = normalizeApi(patch.api ?? prev?.api);
    const imageInput = normalizeImageInput(patch.imageInput) ?? prev?.imageInput;
    this.data = {
      ...this.data,
      version: 1,
      aimy: { api, ...imageInput === void 0 ? {} : { imageInput } }
    };
    this.persist();
  }
  setAimyApi(api) {
    this.setAimy({ api });
  }
  clearAimyApi() {
    const { api: _drop, ...rest } = this.data.aimy ?? {};
    if (rest.imageInput === void 0) {
      const { aimy: _dropAll, ...others } = this.data;
      this.data = { ...others, version: 1 };
    } else {
      this.data = { ...this.data, version: 1, aimy: rest };
    }
    this.persist();
  }
  /** 更新兼容模式的可写字段；未传的保留原值。 */
  setCompat(settings) {
    const prev = this.data.compat;
    const baseURL = settings.baseURL ?? prev?.baseURL ?? "";
    const api = normalizeApi(settings.api ?? prev?.api);
    const imageInput = normalizeImageInput(settings.imageInput) ?? prev?.imageInput;
    this.data = {
      ...this.data,
      version: 1,
      compat: { baseURL, api, ...imageInput === void 0 ? {} : { imageInput } }
    };
    this.persist();
  }
  clearCompat() {
    const { compat: _drop, ...rest } = this.data;
    this.data = { ...rest, version: 1 };
    this.persist();
  }
  persist() {
    try {
      mkdirSync2(dirname2(this.filePath), { recursive: true });
      writeFileSync2(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
    } catch {
    }
  }
};
function normalizeImageInput(value) {
  return typeof value === "boolean" ? value : void 0;
}
function normalizeApi(value) {
  if (value === "openai-responses" || value === "openai-completions" || value === "anthropic-messages") {
    return value;
  }
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "responses" || v === "openai-response" || v === "openai_responses") return "openai-responses";
    if (v === "completions" || v === "chat-completions" || v === "openai" || v === "openai-chat") return "openai-completions";
    if (v === "anthropic" || v === "messages" || v === "claude") return "anthropic-messages";
  }
  return DEFAULT_API;
}
function isProfileId(value) {
  return value === "aimy" || value === "compat";
}
function normalizeBaseURL(value) {
  return value.trim().replace(/\/+$/, "");
}
function resolveProfile(input) {
  const { id, settings, defaults } = input;
  const fallbackImageInput = defaults.imageInput ?? DEFAULT_IMAGE_INPUT;
  if (id === "aimy") {
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
      imageInput: settings.aimyImageInput() ?? fallbackImageInput
    };
  }
  const compat = settings.compat();
  return {
    id,
    displayName: COMPAT_DISPLAY_NAME,
    baseURL: compat ? normalizeBaseURL(compat.baseURL) : "",
    apiKeyRef: COMPAT_KEY_REF,
    routeName: "onehub-compat",
    api: compat ? normalizeApi(compat.api) : DEFAULT_API,
    preset: false,
    defaultContextWindow: defaults.defaultContextWindow,
    defaultMaxTokens: defaults.defaultMaxTokens,
    imageInput: compat?.imageInput ?? fallbackImageInput
  };
}

// src/host/registry.ts
var DEFAULT_MODEL_NS = "agent-default-model";
function settingsWriter(ctx) {
  const settings = typeof ctx?.get === "function" ? ctx.get("settings", false) : void 0;
  if (!settings) return void 0;
  if (typeof settings.update !== "function") return void 0;
  return settings;
}
function describeNamespace(settings, ns) {
  try {
    const rows = settings.describe({ redactSecrets: true });
    if (!Array.isArray(rows)) return void 0;
    return rows.find((row) => row?.ns === ns);
  } catch {
    return void 0;
  }
}
async function writeProviderViaSettings(ctx, target) {
  const settings = settingsWriter(ctx);
  if (!settings) return void 0;
  if (!describeNamespace(settings, target.settingsNs)) return void 0;
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
    defaultInput: [...imageInput ? MODEL_INPUT_TEXT_IMAGE : MODEL_INPUT_TEXT],
    // 必须带 cost 与 reasoningEfforts：少了后者，pi-ai 会认为该模型不支持思考，
    // 模型选择器里就没有档位可选（resolveModelReasoning 未声明时回退 reasoning:false）。
    // 逐模型 maxTokens 也必须带：provider 级的 defaultMaxTokens 不上报给 DSH。
    models: target.models.map((m) => modelEntry(m, imageInput))
  };
  try {
    await settings.update(target.settingsNs, {
      providers: { [target.routeName]: provider }
    });
    return { kind: "settings", ns: target.settingsNs };
  } catch (error) {
    return void 0;
  }
}
async function setDefaultReasoningEffort(ctx, target, effort = DEFAULT_REASONING_EFFORT) {
  const settings = settingsWriter(ctx);
  if (!settings || typeof settings.update !== "function") return false;
  try {
    const model = typeof ctx?.get === "function" ? ctx.get("agentDefaultModel", false) : void 0;
    const current = model && typeof model.currentSelection === "function" ? model.currentSelection() : void 0;
    if (!current || current.provider !== target.routeName) return false;
  } catch {
    return false;
  }
  try {
    await settings.update(DEFAULT_MODEL_NS, { reasoningEffort: effort });
    return true;
  } catch {
    return false;
  }
}
async function removeProviderViaSettings(ctx, target) {
  const settings = settingsWriter(ctx);
  if (!settings) return false;
  if (typeof settings.mutate !== "function") return false;
  if (!describeNamespace(settings, target.settingsNs)) return false;
  try {
    await settings.mutate(target.settingsNs, [
      { op: "unset", path: ["providers", target.routeName] }
    ]);
    return true;
  } catch {
    return false;
  }
}

// src/host/relay.ts
var RelayError = class extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.name = "RelayError";
  }
};
function apiRoot(baseURL) {
  let trimmed = baseURL.trim().replace(/\/+$/, "");
  trimmed = trimmed.replace(/\/v1\/chat\/completions$/i, "").replace(/\/v1\/responses$/i, "").replace(/\/chat\/completions$/i, "").replace(/\/responses$/i, "").replace(/\/v1\/messages$/i, "").replace(/\/messages$/i, "").replace(/\/completions$/i, "");
  return trimmed.replace(/\/v1$/i, "").replace(/\/+$/, "");
}
function normalizeBase(baseURL) {
  return apiRoot(baseURL);
}
function kindOf(status) {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status >= 400 && status < 500) return "bad-request";
  return "unknown";
}
async function request(opts2, pathname, init = {}) {
  const doFetch = opts2.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts2.timeoutMs ?? 15e3);
  try {
    const res = await doFetch(normalizeBase(opts2.baseURL) + pathname, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + opts2.apiKey,
        "Content-Type": "application/json",
        ...init.headers ?? {}
      }
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const message = extractMessage(body) ?? "HTTP " + res.status;
      throw new RelayError(message, res.status, kindOf(res.status));
    }
    return body;
  } catch (error) {
    if (error instanceof RelayError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new RelayError("无法连接中转站：" + message, 0, "network");
  } finally {
    clearTimeout(timer);
  }
}
function extractMessage(body) {
  if (body && typeof body === "object") {
    const record = body;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error === "string" && record.error) return record.error;
    const err = record.error;
    if (err && typeof err === "object" && typeof err.message === "string") {
      return err.message;
    }
  }
  return void 0;
}
async function fetchTokenGroup(opts2) {
  const body = await request(opts2, "/v1/token/group");
  const data = body.data ?? {};
  const hasGroup = typeof data.group === "string" && data.group.length > 0;
  const hasGroups = Array.isArray(data.groups) && data.groups.length > 0;
  if (!hasGroup && !hasGroups) {
    throw new RelayError("该站点未提供分组接口（/v1/token/group 无有效数据）", 404, "not-found");
  }
  return {
    group: String(data.group ?? ""),
    backupGroup: String(data.backup_group ?? ""),
    ratio: Number(data.ratio ?? 1),
    allowGroupSwitch: Boolean(data.allow_group_switch),
    groups: Array.isArray(data.groups) ? data.groups.map((g) => ({
      symbol: String(g.symbol ?? ""),
      name: String(g.name ?? g.symbol ?? ""),
      ratio: Number(g.ratio ?? 1),
      public: Boolean(g.public)
    })) : []
  };
}
async function switchTokenGroup(opts2, group) {
  const body = await request(opts2, "/v1/token/group", {
    method: "PUT",
    body: JSON.stringify({ group })
  });
  const data = body.data ?? {};
  return {
    group: String(data.group ?? group),
    backupGroup: String(data.backup_group ?? ""),
    ratio: Number(data.ratio ?? 1),
    allowGroupSwitch: Boolean(data.allow_group_switch),
    groups: Array.isArray(data.groups) ? data.groups.map((g) => ({
      symbol: String(g.symbol ?? ""),
      name: String(g.name ?? g.symbol ?? ""),
      ratio: Number(g.ratio ?? 1),
      public: Boolean(g.public)
    })) : []
  };
}
async function fetchModels(opts2) {
  const body = await request(opts2, "/v1/models");
  const list = Array.isArray(body.data) ? body.data : [];
  const seen = /* @__PURE__ */ new Set();
  const models = [];
  for (const item of list) {
    const id = typeof item === "string" ? item : String(item?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const capacity = typeof item === "string" ? {} : declaredCapacity(item);
    models.push({ id, name: id, ...capacity });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}
function declaredCapacity(entry) {
  const limit = entry.limit;
  const topProvider = entry.top_provider;
  const contextWindow = firstPositive(
    entry.context_length,
    entry.max_input_tokens,
    entry.context_window,
    entry.contextWindow,
    limit?.context
  );
  const maxTokens = firstPositive(
    entry.max_output_tokens,
    entry.max_completion_tokens,
    entry.max_completionTokens,
    entry.max_tokens,
    entry.maxTokens,
    limit?.output,
    topProvider?.max_completion_tokens
  );
  return {
    ...contextWindow === void 0 ? {} : { contextWindow },
    ...maxTokens === void 0 ? {} : { maxTokens }
  };
}
function firstPositive(...values) {
  for (const value of values) {
    const numeric = typeof value === "string" ? Number(value) : value;
    if (typeof numeric === "number" && Number.isInteger(numeric) && numeric > 0) return numeric;
  }
  return void 0;
}
function deniesModel(error) {
  if (error.kind === "not-found") return true;
  if (error.status === 400) {
    return /model.*(not|un)?(found|available)|invalid model|no such model|unknown model/i.test(error.message);
  }
  return false;
}
function probeRequest(api, modelId) {
  const base = { method: "POST" };
  if (api === "openai-responses") {
    return {
      pathname: "/v1/responses",
      init: {
        ...base,
        body: JSON.stringify({ model: modelId, input: "ping", max_output_tokens: 1, stream: false })
      }
    };
  }
  if (api === "anthropic-messages") {
    return {
      pathname: "/v1/messages",
      init: {
        ...base,
        headers: { "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false
        })
      }
    };
  }
  return {
    pathname: "/v1/chat/completions",
    init: {
      ...base,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false
      })
    }
  };
}
async function probeModels(opts2, models, concurrency = 4) {
  const result = {};
  const queue = [...models];
  const worker = async () => {
    for (; ; ) {
      const next = queue.shift();
      if (!next) return;
      try {
        const { pathname, init } = probeRequest(opts2.api ?? DEFAULT_API, next.id);
        await request(opts2, pathname, init);
        result[next.id] = "ok";
      } catch (error) {
        if (error instanceof RelayError && deniesModel(error)) {
          result[next.id] = "unavailable";
        } else {
          result[next.id] = "unknown";
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, models.length) }, worker));
  return result;
}

// src/host/balance.ts
var FETCH_TIMEOUT_MS = 15e3;
var RETRIES = 1;
async function requestJson(url, key, doFetch) {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await doFetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + key,
          Accept: "application/json",
          "User-Agent": "dsh-aimy-balance"
        }
      });
      const text = await res.text();
      const body = text ? safeJson(text) : {};
      if (res.status === 404 || res.status === 405) return { body, status: res.status };
      if (!res.ok) throw new Error(pathnameOf(url) + " HTTP " + res.status);
      assertNotSoftError(body, url);
      return { body, status: res.status };
    } catch (error) {
      last = error;
      if (attempt < RETRIES) await sleep(800);
    } finally {
      clearTimeout(timer);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function assertNotSoftError(body, url) {
  if (!body || typeof body !== "object") return;
  const record = body;
  if (record.success === false) {
    throw new Error(softMessage(record) ?? pathnameOf(url) + " 返回失败");
  }
  if (record.code === false) {
    throw new Error(softMessage(record) ?? pathnameOf(url) + " 返回失败");
  }
  const error = record.error;
  if (typeof error === "string" && error) throw new Error(error);
  if (error && typeof error === "object") {
    const message = error.message;
    if (typeof message === "string" && message) throw new Error(message);
  }
}
function softMessage(record) {
  const message = record.message;
  return typeof message === "string" && message ? message : void 0;
}
function num(value, what) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("余额数据非法字段 " + what);
  return n;
}
function optNum(value) {
  if (value === void 0 || value === null || value === "") return void 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : void 0;
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function usedPercent(used, cap) {
  if (!(cap > 0)) throw new Error("余额数据的额度必须为正数");
  return Math.max(0, Math.min(100, used / cap * 100));
}
function parseUsageBody(body) {
  const record = asRecord(body);
  if (!record) throw new Error("/v1/usage 响应不是对象");
  if (typeof record.mode === "string") {
    const remaining = num(record.remaining, "remaining");
    if (remaining === -1) throw new Error("该令牌没有额度限制");
    if (record.mode === "quota_limited") {
      const quota = asRecord(record.quota);
      const limit = quota ? optNum(quota.limit) : void 0;
      return { kind: "sub2api-quota", remaining, ...limit === void 0 ? {} : { limit } };
    }
    const subscription = asRecord(record.subscription);
    if (subscription) {
      return { kind: "sub2api-subscription", remaining, windows: subscriptionWindows(subscription) };
    }
    return { kind: "sub2api-wallet", remaining };
  }
  if ("is_active" in record || "remaining" in record) {
    if (record.is_active === false) throw new Error("令牌已停用");
    const remaining = num(record.remaining, "remaining");
    const unit = typeof record.unit === "string" && record.unit ? record.unit : "USD";
    return { kind: "onehub", remaining, unit };
  }
  throw new Error("/v1/usage 响应形态无法识别");
}
function subscriptionWindows(subscription) {
  const windows = {};
  const pairs = [
    ["daily", "daily_usage_usd", "daily_limit_usd"],
    ["weekly", "weekly_usage_usd", "weekly_limit_usd"],
    ["monthly", "monthly_usage_usd", "monthly_limit_usd"]
  ];
  for (const [slot, usedKey, capKey] of pairs) {
    const used = optNum(subscription[usedKey]);
    const cap = optNum(subscription[capKey]);
    if (used === void 0 || cap === void 0 || cap <= 0) continue;
    const resetsAt = typeof subscription.expires_at === "string" ? subscription.expires_at : void 0;
    windows[slot] = {
      percent: usedPercent(used, cap),
      capUsd: cap,
      ...resetsAt === void 0 ? {} : { resetsAt }
    };
  }
  return windows;
}
function parseBillingPair(subscription, usage) {
  const sub = asRecord(subscription);
  if (!sub) throw new Error("billing subscription 响应不是对象");
  const limit = optNum(sub.hard_limit_usd) ?? optNum(sub.soft_limit_usd);
  if (limit === void 0) throw new Error("billing subscription 缺少 hard_limit_usd");
  const usedBody = asRecord(usage);
  const usedCents = usedBody ? optNum(usedBody.total_usage) : void 0;
  const remaining = usedCents === void 0 ? limit : limit - usedCents / 100;
  return { remaining, limit };
}
function parseNewApiTokenUsage(body) {
  const record = asRecord(body);
  if (!record) throw new Error("/api/usage/token 响应不是对象");
  const data = asRecord(record.data);
  if (!data) throw new Error("/api/usage/token 缺少 data");
  if (data.unlimited_quota === true) throw new Error("该令牌没有额度限制");
  const remaining = num(data.total_available, "total_available");
  const limit = optNum(data.total_granted);
  return { remaining, ...limit !== void 0 && limit > 0 ? { limit } : {} };
}
async function readQuota(root, key, doFetch) {
  const reasons = [];
  try {
    const { body, status } = await requestJson(root + "/v1/usage", key, doFetch);
    if (status !== 404 && status !== 405) {
      const reading = readingFromUsageShape(parseUsageBody(body));
      return await withLimitIfMissing(reading, root, key, doFetch);
    }
    reasons.push("/v1/usage 不存在");
  } catch (error) {
    reasons.push("/v1/usage: " + describe(error));
  }
  try {
    const sub = await requestJson(root + "/v1/dashboard/billing/subscription", key, doFetch);
    if (sub.status !== 404 && sub.status !== 405) {
      const usage = await requestJson(root + "/v1/dashboard/billing/usage", key, doFetch);
      const parsed = parseBillingPair(sub.body, usage.body);
      return { remaining: parsed.remaining, ...parsed.limit === void 0 ? {} : { limit: parsed.limit } };
    }
    reasons.push("billing 接口不存在");
  } catch (error) {
    reasons.push("billing: " + describe(error));
  }
  try {
    const { body, status } = await requestJson(root + "/api/usage/token/", key, doFetch);
    if (status !== 404 && status !== 405) {
      const parsed = parseNewApiTokenUsage(body);
      return { remaining: parsed.remaining, ...parsed.limit === void 0 ? {} : { limit: parsed.limit } };
    }
    reasons.push("/api/usage/token 不存在");
  } catch (error) {
    reasons.push("/api/usage/token: " + describe(error));
  }
  throw new Error("该站点未提供可用的余额接口（" + reasons.join("；") + "）");
}
async function withLimitIfMissing(reading, root, key, doFetch) {
  if (reading.limit !== void 0) return reading;
  if (reading.windows) return reading;
  try {
    const sub = await requestJson(root + "/v1/dashboard/billing/subscription", key, doFetch);
    if (sub.status === 404 || sub.status === 405) return reading;
    const limit = optNum(asRecord(sub.body)?.hard_limit_usd) ?? optNum(asRecord(sub.body)?.soft_limit_usd);
    return limit === void 0 || limit <= 0 ? reading : { ...reading, limit };
  } catch {
    return reading;
  }
}
function readingFromUsageShape(shape) {
  switch (shape.kind) {
    case "onehub":
      return {
        remaining: shape.remaining,
        // unit 为 'quota' 表示站点关掉了「以货币显示」：数值是原始额度，不能标成美元
        ...shape.unit === "USD" ? { currency: "USD" } : {}
      };
    case "sub2api-quota":
      return {
        remaining: shape.remaining,
        currency: "USD",
        ...shape.limit === void 0 ? {} : { limit: shape.limit }
      };
    case "sub2api-wallet":
      return { remaining: shape.remaining, currency: "USD" };
    case "sub2api-subscription":
      return {
        remaining: shape.remaining,
        currency: "USD",
        windows: shape.windows
      };
  }
}
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
function buildBalance(provider, reading) {
  const windows = reading.windows;
  if (windows && windows.daily && windows.weekly && windows.monthly) {
    return {
      ok: true,
      provider,
      shape: "windows",
      data: {
        // sub2api 的「滚动窗」就是日窗：时长由数据带出，展示层不写死
        rolling: windows.daily.percent,
        weekly: windows.weekly.percent,
        monthly: windows.monthly.percent,
        rollingLabel: "1d",
        rollingCapUsd: windows.daily.capUsd,
        weeklyCapUsd: windows.weekly.capUsd,
        monthlyCapUsd: windows.monthly.capUsd,
        ...windows.daily.resetsAt === void 0 ? {} : { rollingResetsAt: windows.daily.resetsAt },
        ...windows.weekly.resetsAt === void 0 ? {} : { weeklyResetsAt: windows.weekly.resetsAt },
        ...windows.monthly.resetsAt === void 0 ? {} : { monthlyResetsAt: windows.monthly.resetsAt }
      }
    };
  }
  if (reading.currency !== "USD") {
    return {
      ok: true,
      provider,
      shape: "points",
      data: {
        unit: "额度",
        total: formatAmount(reading.remaining),
        ...reading.limit === void 0 ? {} : { full: formatAmount(reading.limit) }
      }
    };
  }
  return {
    ok: true,
    provider,
    shape: "money",
    data: {
      wallets: [
        {
          currency: "USD",
          total: formatAmount(reading.remaining),
          ...reading.limit === void 0 ? {} : { fullBalance: formatAmount(reading.limit) }
        }
      ]
    }
  };
}
function formatAmount(value) {
  return value.toFixed(2);
}
async function fetchBalance(provider, target, key, doFetch = fetch) {
  if (!target.baseURL) throw new Error("该档案还没有配置地址（" + target.id + "）");
  if (!key) throw new Error("缺少凭证 " + target.apiKeyRef);
  return buildBalance(provider, await readQuota(apiRoot(target.baseURL), key, doFetch));
}
function bindPetBalance(ctx, targets, resolveKey, doFetch = fetch) {
  let dispose;
  const attach = (service) => {
    if (dispose) return;
    const pet = service;
    const registry = pet?.balance;
    if (!registry || typeof registry.register !== "function") return;
    try {
      const disposers = targets().map(
        (target) => registry.register({
          id: target.id,
          // key 每次调用现取：用户刚在面板里换了密钥，下一次「查看余额」就该用新的。
          fetch: async ({ provider }) => fetchBalance(provider, target, await resolveKey(target.apiKeyRef), doFetch)
        })
      );
      dispose = () => {
        for (const d of disposers) {
          try {
            d();
          } catch {
          }
        }
      };
    } catch {
    }
  };
  try {
    attach(typeof ctx?.get === "function" ? ctx.get("petApi7340", false) : void 0);
  } catch {
  }
  if (!dispose) {
    try {
      const inject2 = typeof ctx?.inject === "function" ? ctx.inject.bind(ctx) : void 0;
      if (inject2) {
        inject2(["petApi7340"], (child) => {
          attach(child.get("petApi7340", false));
        });
      }
    } catch {
    }
  }
  return () => {
    dispose?.();
    dispose = void 0;
  };
}

// src/host/routes.ts
function opts(deps) {
  return { baseURL: deps.baseURL, apiKey: deps.apiKey, api: deps.api, fetchImpl: deps.fetchImpl };
}
function applySelection(state, deps) {
  state.selection = deps.selection ?? null;
  const routeName = deps.provider?.routeName;
  if (!deps.selection || !routeName) {
    state.staleModel = false;
    return;
  }
  if (deps.selection.provider !== routeName) {
    state.staleModel = false;
    return;
  }
  if (state.models.length === 0) {
    state.staleModel = false;
    return;
  }
  state.staleModel = !state.models.some((m) => m.id === deps.selection?.model);
}
function providerState(deps, error, fallbackRoute) {
  if (!deps.provider) {
    if (!error) return null;
    return { routeName: fallbackRoute ?? "", mounted: false, modelCount: 0, error };
  }
  return {
    routeName: deps.provider.routeName,
    mounted: deps.provider.mounted,
    modelCount: deps.provider.modelCount,
    error
  };
}
async function resolveTokenGroup(deps, refresh) {
  const cache = deps.groupCache;
  const key = deps.baseURL;
  if (cache && cache.knownUnsupported(key)) {
    return { token: null, supported: false };
  }
  const hit = cache?.peek(key);
  if (hit && !refresh) {
    if (!cache.fresh(key) && cache.beginRefresh(key)) {
      void fetchTokenGroup(opts(deps)).then((token) => cache.apply(key, token)).catch((error) => {
        if (error instanceof RelayError && error.kind === "not-found") {
          cache.markUnsupported(key);
        }
      }).finally(() => cache.endRefresh(key));
    }
    return { token: hit.state, supported: true };
  }
  try {
    const token = await fetchTokenGroup(opts(deps));
    cache?.apply(key, token);
    return { token, supported: true };
  } catch (error) {
    const missingApi = error instanceof RelayError && error.kind === "not-found";
    if (!missingApi) throw error;
    cache?.markUnsupported(key);
    return { token: null, supported: false };
  }
}
async function readState(deps, refresh = false) {
  const state = emptyState(deps.baseURL);
  state.credential = deps.credential ?? null;
  applySelection(state, deps);
  if (!deps.apiKey) {
    state.error = "未配置 API Key：请在下方填写并保存";
    state.provider = providerState(deps);
    return state;
  }
  try {
    const group = await resolveTokenGroup(deps, refresh);
    state.token = group.token;
    state.supportsSwitch = group.supported;
  } catch (error) {
    return applyError(state, error);
  }
  const groupKey = state.token?.group ?? "";
  const cached = deps.store.get(deps.baseURL, groupKey);
  if (!refresh && cached) {
    const cachedModels = resolveModels(cached.models);
    state.models = cachedModels;
    state.modelsFetchedAt = cached.fetchedAt;
    state.connected = true;
    const synced = await deps.syncProvider?.(cachedModels);
    state.provider = providerState(deps, synced && !synced.ok ? synced.error : void 0, deps.routeName);
    applySelection(state, deps);
    return state;
  }
  try {
    const models = resolveModels(await fetchModels(opts(deps)));
    const fetchedAt = Date.now();
    deps.store.set({ baseURL: deps.baseURL, group: groupKey, models, fetchedAt });
    state.models = models;
    state.modelsFetchedAt = fetchedAt;
    state.connected = true;
    if (deps.probeModels) {
      state.reachability = await probeModels(opts(deps), models);
    }
    const synced = await deps.syncProvider?.(models);
    state.provider = providerState(deps, synced && !synced.ok ? synced.error : void 0, deps.routeName);
    applySelection(state, deps);
    return state;
  } catch (error) {
    state.connected = false;
    state.provider = providerState(deps);
    return applyError(state, error);
  }
}
async function switchGroup(deps, group) {
  if (!deps.apiKey) {
    return { status: 400, body: { success: false, message: "缺少 API Key" } };
  }
  if (!group) {
    return { status: 400, body: { success: false, message: "分组不能为空" } };
  }
  let token;
  try {
    token = await switchTokenGroup(opts(deps), group);
  } catch (error) {
    const status = error instanceof RelayError ? mapStatus(error) : 500;
    return { status, body: { success: false, message: describeError(error) } };
  }
  const state = emptyState(deps.baseURL);
  state.token = token;
  state.connected = true;
  state.supportsSwitch = true;
  deps.groupCache?.apply(deps.baseURL, token);
  let warning;
  try {
    const models = resolveModels(await fetchModels(opts(deps)));
    const fetchedAt = Date.now();
    deps.store.set({ baseURL: deps.baseURL, group: token.group, models, fetchedAt });
    state.models = models;
    state.modelsFetchedAt = fetchedAt;
    const synced = deps.remountProvider ? await deps.remountProvider(models) : await deps.syncProvider?.(models);
    if (synced && !synced.ok) {
      warning = "分组已切换，但模型路由更新失败：" + (synced.error ?? "未知错误");
    }
  } catch (error) {
    warning = "分组已切换，但模型列表刷新失败：" + describeError(error);
    const cached = deps.store.get(deps.baseURL, token.group);
    if (cached) {
      state.models = cached.models;
      state.modelsFetchedAt = cached.fetchedAt;
    }
  }
  state.provider = providerState(deps, warning);
  applySelection(state, deps);
  const result = { state, warning };
  return { status: 200, body: { success: true, message: "", data: result } };
}
function applyError(state, error) {
  state.connected = false;
  state.error = describeError(error);
  return state;
}
function mapStatus(error) {
  if (error.kind === "network") return 502;
  if (error.status >= 400 && error.status < 600) return error.status;
  return 500;
}
function describeError(error) {
  if (error instanceof RelayError) {
    switch (error.kind) {
      case "auth":
        return "API Key 无效或已过期";
      case "forbidden":
        return error.message || "该操作被中转站拒绝（请检查令牌是否开启「允许客户端切换分组」）";
      case "not-found":
        return "中转站版本过低，缺少 /v1/token/group 接口";
      case "network":
        return error.message;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

// src/host/index.ts
var ROUTE_PREFIX = "/dsh-aimy-relay";
var name = "dsh-aimy";
var inject = ["webServer"];
var DEFAULT_KEY_REF = "ONEHUB_API_KEY";
var DEFAULT_SETTINGS_NS = "llm-pi-ai";
var DEFAULT_ROUTE = "onehub";
var DEFAULT_CONTEXT_WINDOW = FALLBACK_CONTEXT_WINDOW;
var DEFAULT_MAX_TOKENS = FALLBACK_MAX_TOKENS;
function readConfig(config) {
  return { ...config ?? {} };
}
function getCredentials(ctx) {
  return typeof ctx?.get === "function" ? ctx.get("credentials", false) : void 0;
}
function isValidCredentialRef(ref) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref);
}
function pickCredentialValue(resolved) {
  if (resolved && typeof resolved === "object" && typeof resolved.value === "string") {
    return String(resolved.value).trim();
  }
  if (typeof resolved === "string") return resolved;
  if (resolved && typeof resolved === "object") {
    const record = resolved;
    for (const key of ["key", "apiKey", "secret"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate) return candidate;
    }
  }
  return "";
}
async function resolveApiKey(ctx, ref, inline) {
  if (inline && inline.trim()) return inline.trim();
  if (!ref) return "";
  try {
    const credentials = getCredentials(ctx);
    if (credentials && typeof credentials.resolve === "function") {
      const value = pickCredentialValue(await credentials.resolve(ref));
      if (value) return value;
    }
  } catch {
  }
  const fromEnv = process.env[ref];
  return typeof fromEnv === "string" ? fromEnv.trim() : "";
}
async function describeCredential(ctx, ref) {
  try {
    const credentials = getCredentials(ctx);
    if (!credentials || typeof credentials.describe !== "function") return null;
    const info = await credentials.describe(ref);
    return {
      configured: Boolean(info?.configured),
      source: typeof info?.source === "string" ? info.source : void 0,
      writable: Boolean(info?.writable)
    };
  } catch {
    return null;
  }
}
async function setCredential(ctx, ref, value) {
  const credentials = getCredentials(ctx);
  if (!credentials || typeof credentials.set !== "function") {
    throw new Error("凭据服务不可用：无法保存密钥，请改用环境变量 " + ref);
  }
  await credentials.set(ref, value);
}
async function unsetCredential(ctx, ref) {
  const credentials = getCredentials(ctx);
  if (!credentials || typeof credentials.unset !== "function") {
    throw new Error("凭据服务不可用：无法清除密钥");
  }
  await credentials.unset(ref);
}
async function readDiagnostics(ctx, routeName, apiKeyRef, settingsNs) {
  const report = { routeName, apiKeyRef, ...settingsNs ? { settingsNs } : {} };
  try {
    const llm = typeof ctx?.get === "function" ? ctx.get("llm", false) : void 0;
    if (!llm) {
      report.llmService = "unavailable";
      return report;
    }
    report.llmService = "ok";
    const providers = typeof llm.listProviders === "function" ? llm.listProviders() : [];
    report.providers = providers.map((p) => p.id);
    report.registryPresent = providers.some((p) => p.id === routeName);
    if (typeof llm.listModels === "function" && report.registryPresent) {
      try {
        const models = await llm.listModels(routeName);
        report.registryModels = models.length;
      } catch (error) {
        report.registryModels = "threw: " + describeError(error);
      }
    }
  } catch (error) {
    report.llmService = "threw: " + describeError(error);
  }
  try {
    const settings = typeof ctx?.get === "function" ? ctx.get("settings", false) : void 0;
    if (!settings || typeof settings.update !== "function") {
      report.settingsChannel = "unavailable";
    } else {
      let found = false;
      try {
        const rows = settings.describe({ redactSecrets: true });
        found = Array.isArray(rows) && rows.some((row) => row?.ns === (report.settingsNs ?? "llm-pi-ai"));
      } catch (error) {
        report.settingsChannel = "describe threw: " + describeError(error);
      }
      report.settingsChannel ??= found ? "ok" : "entry missing";
      report.settingsNs ??= "llm-pi-ai";
    }
  } catch (error) {
    report.settingsChannel = "threw: " + describeError(error);
  }
  try {
    const credentials = typeof ctx?.get === "function" ? ctx.get("credentials", false) : void 0;
    if (!credentials || typeof credentials.resolve !== "function") {
      report.credentialResolve = "unavailable";
    } else {
      const hit = await credentials.resolve(apiKeyRef);
      report.credentialResolve = hit && hit.value ? "resolved(" + (hit.source ?? "?") + ")" : "missing";
    }
  } catch (error) {
    report.credentialResolve = "threw: " + describeError(error);
  }
  return report;
}
async function verifyRoute(ctx, routeName) {
  try {
    const llm = typeof ctx?.get === "function" ? ctx.get("llm", false) : void 0;
    if (!llm || typeof llm.listProviders !== "function") {
      return { present: null, listedModels: null, detail: "llm 服务不可用（无法自检）" };
    }
    const present = llm.listProviders().some((p) => p?.id === routeName);
    if (!present) {
      return { present: false, listedModels: null, detail: "ctx.plugin 未把路由注册进 llm（fiber 可能停在 pending）" };
    }
    let listedModels = null;
    if (typeof llm.listModels === "function") {
      try {
        const listed = await llm.listModels(routeName);
        listedModels = Array.isArray(listed) ? listed.length : 0;
      } catch (error) {
        return { present: true, listedModels: null, detail: "listModels 抛错：" + describeError(error) };
      }
    }
    return listedModels === 0 ? { present: true, listedModels, detail: "路由已注册但模型为空（通常是 apiKeyEnv 解析不到凭据）" } : { present: true, listedModels };
  } catch (error) {
    return { present: null, listedModels: null, detail: "自检抛错：" + describeError(error) };
  }
}
function readSelection(ctx) {
  try {
    const service = typeof ctx?.get === "function" ? ctx.get("agentDefaultModel", false) : void 0;
    if (!service || typeof service.currentSelection !== "function") return null;
    const selection = service.currentSelection();
    if (!selection || typeof selection !== "object") return null;
    const provider = String(selection.provider ?? "");
    const model = String(selection.model ?? "");
    if (!provider || !model) return null;
    return { provider, model };
  } catch {
    return null;
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function sendJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}
function parseJson(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" ? value : void 0;
  } catch {
    return void 0;
  }
}
function apply(ctx, config) {
  const catalogs = new CatalogStore();
  catalogs.load();
  const groupCache = new GroupCache();
  const settings = new ProfileSettingsStore();
  settings.load();
  const mounts = /* @__PURE__ */ new Map();
  const settingsRoutes = /* @__PURE__ */ new Map();
  const settingsMountShim = (profileId) => {
    const entry = settingsRoutes.get(profileId);
    if (!entry) return void 0;
    return {
      routeName: entry.routeName,
      mounted: true,
      modelCount: entry.modelCount,
      managedBy: "settings",
      verify: async () => ({ present: null, listedModels: null }),
      update: async () => {
      },
      dispose: async () => {
      }
    };
  };
  const mountErrors = /* @__PURE__ */ new Map();
  const resolve = (id) => {
    const cfg = readConfig(config);
    return resolveProfile({
      id,
      settings,
      defaults: {
        baseURL: cfg.baseURL ?? AIMY_DEFAULT_BASE_URL,
        apiKeyRef: cfg.apiKeyRef ?? DEFAULT_KEY_REF,
        routeName: cfg.routeName ?? DEFAULT_ROUTE,
        displayName: cfg.displayName ?? AIMY_DEFAULT_DISPLAY_NAME,
        api: normalizeApi(cfg.api),
        defaultContextWindow: cfg.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
        defaultMaxTokens: cfg.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
        imageInput: cfg.imageInput
      }
    });
  };
  const forceRemount = async (profile) => {
    const mount = mounts.get(profile.id);
    if (mount) {
      await mount.dispose();
      mounts.delete(profile.id);
    }
    settingsRoutes.delete(profile.id);
    mountErrors.delete(profile.id);
  };
  const lastSyncedModels = /* @__PURE__ */ new Map();
  const syncProvider = async (profile, incoming) => {
    const models = resolveModels(incoming);
    lastSyncedModels.set(profile.id, models);
    if (!profile.baseURL) {
      return { ok: false, error: "该档案还没配置地址" };
    }
    if (models.length === 0) {
      return { ok: false, error: "当前分组没有可用模型，未挂载模型路由" };
    }
    const cfg = readConfig(config);
    const viaSettings = await writeProviderViaSettings(ctx, {
      settingsNs: cfg.settingsNs ?? DEFAULT_SETTINGS_NS,
      routeName: profile.routeName,
      displayName: profile.displayName,
      // 与 buildProfile 同一套归整：openai 补 /v1，anthropic 去掉 /v1
      baseURL: normalizeBaseURLForApi(profile.baseURL, profile.api),
      apiKeyRef: profile.apiKeyRef,
      api: profile.api,
      models,
      defaultContextWindow: profile.defaultContextWindow,
      defaultMaxTokens: profile.defaultMaxTokens,
      imageInput: profile.imageInput
    });
    if (viaSettings && viaSettings.kind === "settings") {
      const check = await verifyRoute(ctx, profile.routeName);
      settingsRoutes.set(profile.id, { routeName: profile.routeName, modelCount: models.length });
      await setDefaultReasoningEffort(ctx, {
        settingsNs: cfg.settingsNs ?? DEFAULT_SETTINGS_NS,
        routeName: profile.routeName
      });
      if (check.present === false) {
        const message = "已写入 " + viaSettings.ns + " 的 providers，但模型路由仍未出现在 llm 中";
        mountErrors.set(profile.id, message);
        return { ok: false, error: message };
      }
      mountErrors.delete(profile.id);
      return { ok: true };
    }
    try {
      const existing = mounts.get(profile.id);
      if (existing && existing.api !== void 0 && existing.api !== profile.api) {
        await existing.dispose();
        mounts.delete(profile.id);
      }
      const current = mounts.get(profile.id);
      if (!current) {
        const created = await createProviderMount(ctx, {
          routeName: profile.routeName,
          displayName: profile.displayName,
          baseURL: profile.baseURL,
          apiKeyRef: profile.apiKeyRef,
          api: profile.api,
          models,
          defaultContextWindow: profile.defaultContextWindow,
          defaultMaxTokens: profile.defaultMaxTokens,
          imageInput: profile.imageInput,
          adapterModule: cfg.providerAdapter
        });
        mounts.set(profile.id, created);
      } else {
        await current.update(models);
      }
      const mounted = mounts.get(profile.id);
      const check = await mounted.verify();
      if (check.present === false) {
        const message = "模型路由没有注册进 llm：" + (check.detail ?? "未知原因");
        mountErrors.set(profile.id, message);
        return { ok: false, error: message };
      }
      if (check.present === true && check.listedModels === 0) {
        const message = "路由已注册但模型为空：" + (check.detail ?? "未知原因");
        mountErrors.set(profile.id, message);
        return { ok: false, error: message };
      }
      mountErrors.delete(profile.id);
      return { ok: true };
    } catch (error) {
      const message = describeError(error);
      mountErrors.set(profile.id, message);
      return { ok: false, error: message };
    }
  };
  const remountProvider = async (profile, models) => {
    const previous = lastSyncedModels.get(profile.id);
    if (previous && sameModels(previous, models)) {
      return syncProvider(profile, models);
    }
    await removeProviderViaSettings(ctx, {
      settingsNs: readConfig(config).settingsNs ?? DEFAULT_SETTINGS_NS,
      routeName: profile.routeName
    });
    const existing = mounts.get(profile.id);
    if (existing) {
      try {
        await existing.dispose();
      } catch {
      }
      mounts.delete(profile.id);
    }
    return syncProvider(profile, models);
  };
  const buildDeps = async (profile) => {
    const cfg = readConfig(config);
    const inline = profile.preset ? cfg.apiKey : void 0;
    return {
      baseURL: profile.baseURL,
      routeName: profile.routeName,
      group: "",
      apiKey: await resolveApiKey(ctx, profile.apiKeyRef, inline),
      api: profile.api,
      store: catalogs,
      groupCache,
      provider: mounts.get(profile.id) ?? settingsMountShim(profile.id),
      syncProvider: (models) => syncProvider(profile, models),
      remountProvider: (models) => remountProvider(profile, models),
      probeModels: cfg.probeModels === true,
      credential: await describeCredential(ctx, profile.apiKeyRef),
      selection: readSelection(ctx)
    };
  };
  const stateFor = async (profile, refresh = false) => {
    if (!profile.baseURL) {
      return {
        ...readStateEmpty(""),
        error: "兼容模式还没配置：请填写地址与密钥后保存"
      };
    }
    const deps = await buildDeps(profile);
    return readState(deps, refresh);
  };
  const decorate = (state, profile) => {
    state.profile = profile.id;
    state.displayName = profile.displayName;
    state.preset = profile.preset;
    state.api = profile.api;
    state.imageInput = profile.imageInput;
    state.configured = Boolean(profile.baseURL);
    return state;
  };
  const withProvider = (state, profile) => {
    const viaSettings = settingsRoutes.get(profile.id);
    if (viaSettings) {
      state.provider = {
        routeName: viaSettings.routeName,
        mounted: true,
        modelCount: viaSettings.modelCount,
        managedBy: "settings",
        ...mountErrors.has(profile.id) ? { error: mountErrors.get(profile.id) } : {}
      };
      return state;
    }
    const mount = mounts.get(profile.id);
    if (mount) {
      state.provider = {
        routeName: mount.routeName,
        mounted: mount.mounted,
        modelCount: mount.modelCount,
        ...mountErrors.has(profile.id) ? { error: mountErrors.get(profile.id) } : {}
      };
    }
    return state;
  };
  const warmStart = async () => {
    for (const id of ["aimy", "compat"]) {
      try {
        const profile = resolve(id);
        if (!profile.baseURL) continue;
        const cached = catalogs.latest(profile.baseURL);
        if (!cached || cached.models.length === 0) continue;
        await syncProvider(profile, resolveModels(cached.models));
      } catch {
      }
    }
  };
  void warmStart();
  const disposeBalance = bindPetBalance(
    ctx,
    () => ["aimy", "compat"].map((id) => {
      const profile = resolve(id);
      return { id: profile.routeName, baseURL: profile.baseURL, apiKeyRef: profile.apiKeyRef };
    }),
    (ref) => resolveApiKey(ctx, ref)
  );
  ctx.effect(() => () => disposeBalance(), "dsh-aimy: dispose balance bridge");
  ctx.effect(() => () => {
    for (const mount of mounts.values()) void mount.dispose();
    mounts.clear();
  }, "dsh-aimy: dispose providers");
  ctx.effect(
    () => ctx.webServer.register({
      kind: "prefix",
      path: ROUTE_PREFIX,
      handler: async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname;
        const method = (req.method ?? "GET").toUpperCase();
        const route = pathname.slice(ROUTE_PREFIX.length) || "/";
        const rawProfile = url.searchParams.get("profile") ?? "aimy";
        const profileId = isProfileId(rawProfile) ? rawProfile : "aimy";
        try {
          const profile = resolve(profileId);
          const needsNetwork = route === "/state" || route === "/refresh" || route === "/switch";
          if (!profile.baseURL && needsNetwork) {
            const state = decorate(
              {
                ...readStateEmpty(profile.baseURL),
                error: "兼容模式还没配置：请填写地址与密钥后保存"
              },
              profile
            );
            sendJson(res, 200, { success: true, data: withProvider(state, profile) });
            return;
          }
          const deps = await buildDeps(profile);
          if (method === "GET" && route === "/state") {
            const state = withProvider(decorate(await readState(deps), profile), profile);
            sendJson(res, 200, { success: true, data: state });
            return;
          }
          if (method === "GET" && route === "/diagnostics") {
            const report = await readDiagnostics(
              ctx,
              profile.routeName,
              profile.apiKeyRef,
              readConfig(config).settingsNs ?? DEFAULT_SETTINGS_NS
            );
            sendJson(res, 200, { success: true, data: report });
            return;
          }
          if (method === "POST" && route === "/refresh") {
            const state = withProvider(decorate(await readState(deps, true), profile), profile);
            sendJson(res, 200, { success: true, data: state });
            return;
          }
          if (method === "POST" && route === "/credentials") {
            const payload = parseJson(await readBody(req));
            const apiKey = String(payload?.apiKey ?? "").trim();
            if (!apiKey) {
              sendJson(res, 400, { success: false, message: "密钥不能为空" });
              return;
            }
            if (!isValidCredentialRef(profile.apiKeyRef)) {
              sendJson(res, 400, { success: false, message: "密钥名不合法：" + profile.apiKeyRef });
              return;
            }
            await setCredential(ctx, profile.apiKeyRef, apiKey);
            const state = withProvider(
              decorate(await stateFor(profile), profile),
              profile
            );
            sendJson(res, 200, { success: true, message: "已保存", data: state });
            return;
          }
          if (method === "DELETE" && route === "/credentials") {
            await unsetCredential(ctx, profile.apiKeyRef);
            const state = withProvider(decorate(await stateFor(profile), profile), profile);
            sendJson(res, 200, { success: true, message: "已清除", data: state });
            return;
          }
          if (method === "POST" && route === "/config") {
            const payload = parseJson(await readBody(req));
            const hasBaseURL = typeof payload?.baseURL === "string" && payload.baseURL.trim().length > 0;
            const hasApi = payload?.api !== void 0;
            const hasImageInput = typeof payload?.imageInput === "boolean";
            if (!hasBaseURL && !hasApi && !hasImageInput) {
              sendJson(res, 400, { success: false, message: "没有可保存的字段" });
              return;
            }
            if (profile.preset) {
              if (hasBaseURL) {
                sendJson(res, 403, { success: false, message: "预设档案的地址不可修改" });
                return;
              }
              settings.setAimy({
                ...hasApi ? { api: normalizeApi(payload?.api) } : {},
                ...hasImageInput ? { imageInput: payload.imageInput } : {}
              });
            } else if (hasBaseURL) {
              const baseURL = normalizeBaseURL(String(payload?.baseURL ?? ""));
              if (!/^https?:\/\//i.test(baseURL)) {
                sendJson(res, 400, { success: false, message: "请填写完整的 http(s) 地址" });
                return;
              }
              settings.setCompat({
                baseURL,
                api: normalizeApi(payload?.api ?? profile.api),
                ...hasImageInput ? { imageInput: payload.imageInput } : {}
              });
            } else {
              if (!profile.baseURL) {
                sendJson(res, 400, { success: false, message: "请先填写地址" });
                return;
              }
              settings.setCompat({
                api: normalizeApi(payload?.api ?? profile.api),
                ...hasImageInput ? { imageInput: payload.imageInput } : {}
              });
            }
            const saved = resolve(profileId);
            await forceRemount(saved);
            const state = withProvider(decorate(await stateFor(saved, true), saved), saved);
            sendJson(res, 200, { success: true, message: "已保存", data: state });
            return;
          }
          if (method === "DELETE" && route === "/config") {
            if (profile.preset) {
              sendJson(res, 403, { success: false, message: "预设档案不可清除" });
              return;
            }
            const mount = mounts.get(profileId);
            if (mount) {
              await mount.dispose();
              mounts.delete(profileId);
            }
            const cfgNow = readConfig(config);
            await removeProviderViaSettings(ctx, {
              settingsNs: cfgNow.settingsNs ?? DEFAULT_SETTINGS_NS,
              routeName: "onehub-compat"
            });
            settings.clearCompat();
            const cleared = resolve(profileId);
            const state = withProvider(
              decorate({ ...readStateEmpty(""), error: "兼容模式还没配置：请填写地址与密钥后保存" }, cleared),
              cleared
            );
            sendJson(res, 200, { success: true, message: "已清除", data: state });
            return;
          }
          if (method === "POST" && route === "/switch") {
            const payload = parseJson(await readBody(req));
            const group = String(payload?.group ?? "");
            const switched = await switchGroup(deps, group);
            const body = switched.body;
            const warnings = [];
            if (body?.data?.warning) warnings.push(body.data.warning);
            if (body?.data?.state) {
              const state = body.data.state;
              withProvider(decorate(state, profile), profile);
              const mountedNow = Boolean(state.provider && state.provider.mounted !== false);
              const selModel = state.selection?.model;
              const staleNow = mountedNow && typeof selModel === "string" && Array.isArray(state.models) && state.models.length > 0 && !state.models.some((m) => m.id === selModel);
              state.staleModel = staleNow;
              if (staleNow) {
                const next = state.models[0].id;
                let switchedModel = false;
                try {
                  const agentDefault = typeof ctx.get === "function" ? ctx.get("agentDefaultModel", false) : void 0;
                  if (agentDefault && typeof agentDefault.saveSelection === "function") {
                    await agentDefault.saveSelection({
                      provider: profile.routeName,
                      model: next,
                      reasoningEffort: DEFAULT_REASONING_EFFORT
                    });
                    state.selection = { provider: profile.routeName, model: next };
                    state.staleModel = false;
                    switchedModel = true;
                  }
                } catch {
                  switchedModel = false;
                }
                warnings.push(
                  switchedModel ? "「" + selModel + "」不在新分组里，已切换到「" + next + "」" : "分组已切换，但「" + selModel + "」不在新分组里，请重新选择模型"
                );
              }
            }
            if (warnings.length > 0) {
              body.data.warning = warnings.join("；");
            }
            sendJson(res, switched.status, switched.body);
            return;
          }
          sendJson(res, 404, { success: false, message: "unknown route: " + route });
        } catch (error) {
          sendJson(res, 500, { success: false, message: describeError(error) });
        }
      }
    }),
    "dsh-aimy: relay routes"
  );
}
function readStateEmpty(baseURL) {
  return {
    baseURL,
    connected: false,
    supportsSwitch: false,
    token: null,
    models: [],
    modelsFetchedAt: 0,
    provider: null,
    credential: null,
    selection: null,
    staleModel: false
  };
}
export {
  FALLBACK_CONTEXT_WINDOW,
  FALLBACK_MAX_TOKENS,
  GROUP_CACHE_TTL_MS,
  GroupCache,
  apply,
  bindPetBalance,
  buildBalance,
  clampMaxTokens,
  fetchBalance,
  inject,
  isValidCredentialRef,
  name,
  officialCapacity,
  parseBillingPair,
  parseNewApiTokenUsage,
  parseUsageBody,
  pickPlugin,
  readQuota,
  resolveCapacity,
  resolveModels,
  sameCapacity
};
