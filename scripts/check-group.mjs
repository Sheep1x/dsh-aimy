#!/usr/bin/env node
/**
 * 用真实站点跑一遍「分组胶囊」拿到的数据，检查它长什么样、会不会把胶囊撑爆。
 *
 *   node scripts/check-group.mjs [baseURL]
 *
 * 密钥从 ~/.dsh/.credentials.yaml 的 ONEHUB_API_KEY 读，只打印前后缀。
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'https://aimy.sheep1x.top').replace(/\/+$/, '');

function readKey(name) {
  const file = join(homedir(), '.dsh', '.credentials.yaml');
  const text = readFileSync(file, 'utf8');
  const line = text.split(/\r?\n/).find((row) => row.trim().startsWith(name + ':'));
  if (!line) throw new Error('凭据里没有 ' + name);
  return line.slice(line.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '');
}

const key = readKey('ONEHUB_API_KEY');
console.log('密钥：' + key.slice(0, 6) + '…' + key.slice(-4) + '（' + key.length + ' 字符）');
console.log('站点：' + BASE);

const started = Date.now();
const res = await fetch(BASE + '/v1/token/group', {
  headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
});
const elapsed = Date.now() - started;
if (!res.ok) {
  console.log('HTTP ' + res.status + ' / ' + elapsed + 'ms → 站点没有分组接口，胶囊会显示「分组：—」');
  process.exit(0);
}

const payload = await res.json();
const data = payload?.data ?? payload;
const groups = Array.isArray(data?.groups) ? data.groups : [];

// 与 src/host/index.ts 的 readGroup() 同一套映射
const shape = {
  name: typeof data?.group === 'string' ? data.group : '',
  ratio: typeof data?.ratio === 'number' ? data.ratio : undefined,
  allowSwitch: data?.allow_group_switch === true && groups.length > 0,
  groups: groups.map((g) => ({
    name: String(g?.name ?? g?.symbol ?? ''),
    symbol: typeof g?.symbol === 'string' ? g.symbol : undefined,
    ratio: typeof g?.ratio === 'number' ? g.ratio : undefined,
  })),
};

console.log('耗时：' + elapsed + 'ms');
console.log('原始字段：' + Object.keys(data ?? {}).join(', '));
console.log('\n映射结果：');
console.log(JSON.stringify(shape, null, 2));

const longest = shape.groups.reduce((a, b) => (b.name.length > a.length ? b.name : a), '');
console.log('\n胶囊会显示：分组：' + (shape.name || (shape.allowSwitch ? '未设置' : '—')));
console.log('可切换：' + (shape.allowSwitch ? '是（有 ▾）' : '否（只读）'));
console.log('分组数：' + shape.groups.length);
console.log('最长的分组名：' + longest + '（' + [...longest].length + ' 字）');
console.log(
  '标签上限 180px、约 11.5px 字号 → 超过 ' +
    Math.floor(180 / 11.5) +
    ' 个全角字就会省略，tooltip 里给完整名称。',
);
