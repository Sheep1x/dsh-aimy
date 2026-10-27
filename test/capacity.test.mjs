// 容量解析单测：三层取值链、夹取、幂等、来源标注。
//
// 这些规则直接决定「请求下发多大的 max_tokens」和「压缩阈值」
// —— 猜错的后果是上游 400 或者压缩引擎抛 TargetPressureConfigError，
// 所以每条规则都得有独立用例钉住。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  FALLBACK_CONTEXT_WINDOW,
  FALLBACK_MAX_TOKENS,
  officialCapacity,
  clampMaxTokens,
  resolveCapacity,
  resolveModels,
  sameCapacity,
} = await import('../lib/index.js');

describe('官方容量目录查询', () => {
  it('精确命中：deepseek-v4.1-flash = 1M / 384K', () => {
    const hit = officialCapacity('deepseek-v4.1-flash');
    assert.ok(hit, '应能在官方目录里查到');
    assert.equal(hit.contextWindow, 1000000);
    assert.equal(hit.maxTokens, 384000);
  });

  it('带厂商前缀与大小写变体也能命中', () => {
    // 中转站常把 id 写成 deepseek-ai/DeepSeek-V4.1-Flash 这种形态。
    // 官方目录里它在多个 provider 下都有条目（1M 与 1.048M 两种窗口写法），
    // 所以这里只钉住真正重要的一点：输出上限必须是 384K，不能被兜底 128K 盖掉。
    const hit = officialCapacity('deepseek-ai/DeepSeek-V4.1-Flash');
    assert.ok(hit, '应能剥掉厂商前缀并归一大小写后命中');
    assert.equal(hit.maxTokens, 384000);
    assert.ok(hit.contextWindow >= 1000000, '上下文窗口应至少 1M，实际：' + hit.contextWindow);
  });

  it('大小写与未知前缀都能归一到官方 id', () => {
    // 中转站常把 id 写成 DeepSeek-V4.1-Flash 或 openrouter/glm-5.3 这种形态
    const upper = officialCapacity('DeepSeek-V4.1-Flash');
    assert.ok(upper, '应能归一大小写后命中');
    assert.equal(upper.contextWindow, 1000000);
    assert.equal(upper.maxTokens, 384000);

    const prefixed = officialCapacity('openrouter/glm-5.3');
    assert.ok(prefixed, '未知前缀应剥掉后命中');
    assert.equal(prefixed.contextWindow, 1000000);
    assert.equal(prefixed.maxTokens, 131072);
  });

  it('官方目录里真实存在的带前缀条目优先精确命中，不剥前缀', () => {
    // zai-org/GLM-5.3 在官方目录里是独立条目（1048575/262144），
    // 与扁平的 glm-5.3（1000000/131072）不同。精确命中优先，
    // 否则站点明确写出的 id 会被改写成另一个模型的值。
    const exact = officialCapacity('zai-org/GLM-5.3');
    assert.ok(exact);
    assert.equal(exact.contextWindow, 1048575);
    assert.equal(exact.maxTokens, 262144);
  });

  it('未收录的 id 返回 undefined，绝不猜', () => {
    assert.equal(officialCapacity('kimi-k3-1'), undefined);
    assert.equal(officialCapacity('step-5-preview-nonexistent'), undefined);
    assert.equal(officialCapacity(''), undefined);
  });
});

describe('输出上限夹取（压缩引擎的硬约束）', () => {
  it('窗口装得下就不动输出上限', () => {
    assert.equal(clampMaxTokens(1000000, 384000), 384000);
  });

  it('窗口装不下时压到 窗口 - 65536', () => {
    // dsh-compaction-basic 要求 contextWindow > maxTokens + headroomTokens(默认 65536)
    // 不夹的话 resolveCompactSpec() 直接抛 TargetPressureConfigError，整轮对话作废。
    assert.equal(clampMaxTokens(128000, 128000), 128000 - 65536);
    assert.equal(clampMaxTokens(200000, 190000), 200000 - 65536);
  });

  it('窗口小于 headroom 的极端模型保持原值（不假装解决）', () => {
    // 32K 窗口怎么声明都过不了压缩门槛，那是模型本身的限制
    assert.equal(clampMaxTokens(32768, 32768), 32768);
  });
});

describe('三层取值链', () => {
  it('站点声明优先于官方目录', () => {
    const capacity = resolveCapacity({
      id: 'deepseek-v4.1-flash',
      contextWindow: 512000,
      maxTokens: 64000,
    });
    assert.equal(capacity.source, 'relay');
    assert.equal(capacity.contextWindow, 512000);
    assert.equal(capacity.maxTokens, 64000);
  });

  it('站点只声明一项时，另一项按官方目录补齐', () => {
    const capacity = resolveCapacity({ id: 'deepseek-v4.1-flash', maxTokens: 64000 });
    assert.equal(capacity.source, 'relay');
    assert.equal(capacity.maxTokens, 64000, '站点声明的输出要保留');
    assert.equal(capacity.contextWindow, 1000000, '上下文按官方目录补齐');
  });

  it('站点什么都没说 → 官方目录', () => {
    const capacity = resolveCapacity({ id: 'hy4-preview' });
    assert.equal(capacity.source, 'official');
    assert.equal(capacity.contextWindow, 1024000);
    assert.equal(capacity.maxTokens, 64000, '官方更小就用官方的');
  });

  it('官方目录也没收录 → 兜底 1M / 128K', () => {
    const capacity = resolveCapacity({ id: '某个只有中转站才有的模型' });
    assert.equal(capacity.source, 'default');
    assert.equal(capacity.contextWindow, FALLBACK_CONTEXT_WINDOW);
    assert.equal(capacity.maxTokens, FALLBACK_MAX_TOKENS);
  });

  it('官方输出上限大于 128K 时用官方的（deepseek-v4.1-flash = 384K）', () => {
    // 这正是本次需求的核心：默认 128K，官方更大就用官方
    const capacity = resolveCapacity({ id: 'deepseek-v4.1-flash' });
    assert.equal(capacity.maxTokens, 384000);
  });

  it('非法容量值（0 / 负数 / 小数）当作没声明', () => {
    const capacity = resolveCapacity({ id: 'deepseek-v4.1-flash', contextWindow: 0, maxTokens: 1.5 });
    assert.equal(capacity.source, 'official', '非法值不该被当成站点声明');
  });
});

describe('批量解析与幂等', () => {
  it('resolveModels 不修改入参，返回带容量的新数组', () => {
    const input = [{ id: 'deepseek-v4.1-flash' }];
    const output = resolveModels(input);
    assert.equal(input[0].contextWindow, undefined, '入参不能被就地改写');
    assert.equal(output[0].contextWindow, 1000000);
    assert.equal(output[0].maxTokens, 384000);
    assert.equal(output[0].capacitySource, 'official');
  });

  it('已定稿的条目原样返回（来源标注不被改写）', () => {
    // 缓存读回来的条目已经解析过；再算一遍会把它错标成 relay，来源就骗人了
    const settled = [{ id: 'unknown-model', contextWindow: 1, maxTokens: 2, capacitySource: 'default' }];
    const output = resolveModels(settled);
    assert.equal(output[0].contextWindow, 1);
    assert.equal(output[0].maxTokens, 2);
    assert.equal(output[0].capacitySource, 'default');
  });
});

describe('sameCapacity（决定要不要重挂载）', () => {
  it('容量变化要算不同，否则模型选择器里一直显示旧值', () => {
    assert.equal(
      sameCapacity({ id: 'x', contextWindow: 1000, maxTokens: 100 }, { id: 'x', contextWindow: 2000, maxTokens: 100 }),
      false,
    );
    assert.equal(
      sameCapacity({ id: 'x', contextWindow: 1000, maxTokens: 100 }, { id: 'x', contextWindow: 1000, maxTokens: 200 }),
      false,
    );
    assert.equal(
      sameCapacity({ id: 'x', contextWindow: 1000, maxTokens: 100 }, { id: 'x', contextWindow: 1000, maxTokens: 100 }),
      true,
    );
  });
});
