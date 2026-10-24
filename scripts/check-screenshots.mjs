// 校验 screenshots.json 是否满足收录与市场的双重规则。
// 用法：node scripts/check-screenshots.mjs
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const declPath = join(root, 'screenshots.json');

if (!existsSync(declPath)) {
  console.log('未声明 screenshots.json（市场会回退到从 README 自动抽取，属于正常选择）');
  process.exit(0);
}

let data;
try {
  data = JSON.parse(readFileSync(declPath, 'utf8'));
} catch (error) {
  console.error('screenshots.json 不是合法 JSON：' + error.message);
  process.exit(1);
}

const list = Array.isArray(data) ? data : data?.screenshots;
if (!Array.isArray(list)) {
  console.error('screenshots.json 必须是数组，或 { "screenshots": [...] }');
  process.exit(1);
}
if (list.length === 0) {
  console.error('空数组会让市场认为「已声明但无图」，从而屏蔽 README 回退；要么删掉文件，要么至少放 1 张');
  process.exit(1);
}
if (list.length > 8) {
  console.error('收录上限 8 张，当前 ' + list.length);
  process.exit(1);
}

// dshmarket 只渲染前 6 张，且只接受 GitHub 托管的 https 绝对 URL
const HOSTS = new Set([
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'camo.githubusercontent.com',
  'github.com',
]);

let failed = 0;
list.forEach((item, index) => {
  const label = '#' + (index + 1) + ' ' + item;
  if (typeof item !== 'string' || item.length === 0) {
    console.error(label + ' → 必须是字符串');
    failed++;
    return;
  }
  const isUrl = /^[a-z][a-z\d+.-]*:/i.test(item);
  if (isUrl) {
    let parsed;
    try { parsed = new URL(item); } catch { console.error(label + ' → 无法解析的 URL'); failed++; return; }
    if (parsed.protocol !== 'https:') { console.error(label + ' → 必须是 https'); failed++; return; }
    if (!HOSTS.has(parsed.hostname)) {
      console.error(label + ' → 主机不在 GitHub 白名单（' + parsed.hostname + '），dshmarket 会拒绝渲染');
      failed++;
      return;
    }
    console.log(label + ' → OK（GitHub https）');
    return;
  }
  // 相对路径：交给 awesome-lint 的规则，相对本文件、不得越界、文件必须存在
  if (isAbsolute(item) || item.startsWith('/') || item.includes('..')) {
    console.error(label + ' → 相对路径不能是绝对路径或用 .. 跳出插件目录');
    failed++;
    return;
  }
  const target = join(root, item);
  if (!existsSync(target)) {
    console.error(label + ' → 文件不存在：' + relative(root, target));
    failed++;
    return;
  }
  const size = statSync(target).size;
  if (size < 5 * 1024) console.error(label + ' → 文件过小（' + size + 'B），可能不是有效截图');
  console.log(label + ' → OK（相对路径，' + Math.round(size / 1024) + 'KB）');
  if (index >= 6) console.log('   注意：dshmarket 只展示前 6 张，这张排在展示之外');
});

if (failed > 0) {
  console.error('\n有 ' + failed + ' 条不合规');
  process.exit(1);
}
console.log('\n全部合规（' + list.length + ' 张）');
