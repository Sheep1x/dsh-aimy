// 一次性实测：用仓库构建产物直接对真实中转站查一次余额，打印底部条会显示什么。
// 只在本地手工运行（不参与 npm test）：node scripts/check-balance.mjs
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const file = join(homedir(), '.dsh', '.credentials.yaml');
const text = readFileSync(file, 'utf8');
const match = /^\s*ONEHUB_API_KEY:\s*['"]?([^'"\s]+)/m.exec(text);
if (!match) {
  console.log('没有找到 ONEHUB_API_KEY');
  process.exit(1);
}
const key = match[1];
console.log('key:', key.slice(0, 6) + '...' + key.slice(-4));

const baseURL = process.argv[2] ?? 'https://aimy.sheep1x.top';
const mod = await import('../lib/index.js');

const started = Date.now();
const result = await mod.readBalanceView(baseURL, key, fetch);
console.log('耗时', Date.now() - started, 'ms');
console.log(JSON.stringify(result, null, 2));

if (result.ok) {
  const symbols = { USD: '$', CNY: '¥', EUR: '€', GBP: '£' };
  const symbol = symbols[String(result.view.currency ?? '').toUpperCase()] ?? '';
  const money = (n) => (symbol ? symbol + n.toFixed(2) : n.toFixed(2));
  const parts = [money(result.view.amount)];
  if (result.view.limit !== undefined) parts[0] += ' / ' + money(result.view.limit);
  if (result.view.usedPercent !== undefined) {
    parts.push('剩 ' + Math.max(0, Math.round(100 - result.view.usedPercent)) + '%');
  }
  console.log('底部条将显示：Aimy-艾米 · ' + parts.join(' · '));
}
