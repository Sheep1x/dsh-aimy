#!/usr/bin/env node
/**
 * 从已安装的 @earendil-works/pi-ai 目录生成「官方容量快照」。
 *
 * 为什么要快照而不是运行时读：
 *   插件运行在 DSH 宿主里，profile 的 node_modules 顶层没有 @earendil-works/pi-ai
 *   （它是 @deepseek-ai/dsh-llm-pi-ai 的依赖）。动态 import 会解析失败，整体退化成
 *   「所有模型都用兜底值」——那样「官方更大就用官方」这条根本不生效。直接打包又是
 *   5.5MB。所以构建期抽一张最小表，随 lib/ 一起提交。
 *
 * 收敛规则（同 id 在不同官方 provider 下可能给出不同值）：
 *   1. 取众数（出现最多的那组 [contextWindow, maxTokens]）
 *   2. 票数相同时取较小值 —— 宁可早压缩，也不要撞墙
 *   3. 只收录 contextWindow 与 maxTokens 都为正整数的条目
 *
 * 刷新时机：升级 DSH / pi-ai 之后跑 `npm run gen:capacity`，再 `npm run build`。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

const catalog = await import('@earendil-works/pi-ai/providers/all');
// pi-ai 的 exports 没有暴露 ./package.json，只能按安装位置直接读
const piAiVersion = JSON.parse(
  readFileSync(join(repo, 'node_modules', '@earendil-works', 'pi-ai', 'package.json'), 'utf8'),
).version;

/** id → 各 provider 给出的 [contextWindow, maxTokens] 候选 */
const candidates = new Map();
for (const provider of catalog.builtinProviders()) {
  for (const model of catalog.getAllBuiltinModels(provider.id)) {
    const ctx = model?.contextWindow;
    const max = model?.maxTokens;
    if (!Number.isInteger(ctx) || ctx <= 0) continue;
    if (!Number.isInteger(max) || max <= 0) continue;
    const id = model?.id;
    if (typeof id !== 'string' || id.length === 0) continue;
    const list = candidates.get(id) ?? [];
    list.push([ctx, max]);
    candidates.set(id, list);
  }
}

/** 众数；票数相同取较小（按 contextWindow 再按 maxTokens 比较）。 */
function collapse(values) {
  const tally = new Map();
  for (const [ctx, max] of values) {
    const key = ctx + '/' + max;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let bestKey;
  let bestVotes = -1;
  for (const [key, votes] of tally) {
    if (votes > bestVotes) {
      bestKey = key;
      bestVotes = votes;
      continue;
    }
    if (votes === bestVotes) {
      const [ctx, max] = key.split('/').map(Number);
      const [bestCtx, bestMax] = bestKey.split('/').map(Number);
      if (ctx < bestCtx || (ctx === bestCtx && max < bestMax)) bestKey = key;
    }
  }
  return bestKey.split('/').map(Number);
}

const table = {};
for (const id of [...candidates.keys()].sort()) {
  table[id] = collapse(candidates.get(id));
}

const body = JSON.stringify(table);
const out = `/**
 * 官方容量快照（自动生成，请勿手改）。
 *
 * 生成命令：npm run gen:capacity
 * 来源：@earendil-works/pi-ai@${piAiVersion} 的内置模型目录
 * 生成日期：${new Date().toISOString().slice(0, 10)}
 * 模型数：${Object.keys(table).length}
 *
 * 每项为 [contextWindow, maxTokens]，已按「众数，票数相同取较小」收敛。
 * 这只是**参考值**：插件优先采用中转站 /v1/models 自己声明的容量，
 * 站点没说时才回落到这里，最后才是插件兜底值。
 */
export const OFFICIAL_CAPACITY: Record<string, readonly [number, number]> = ${body};
`;

writeFileSync(join(repo, 'src', 'shared', 'capacity-table.ts'), out, 'utf8');
console.log(
  '已生成 src/shared/capacity-table.ts：' +
    Object.keys(table).length +
    ' 个模型，' +
    body.length +
    ' 字节（pi-ai ' +
    piAiVersion +
    '）',
);
