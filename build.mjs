// 用 esbuild 打包两个入口：
//   src/host/index.ts   → lib/index.js   (ESM，供 Node 侧 Cordis 加载)
//   src/client/index.ts → lib/client.js  (IIFE，供浏览器 __ModuleLoader__ 加载)
//
// esbuild 是本仓 devDependency：先 npm install，再 npm run build。
// 若忘记装依赖，会给出明确提示而不是抛一个难懂的模块解析错误。
let esbuild;
try {
  esbuild = await import('esbuild');
} catch (error) {
  console.error('缺少构建依赖 esbuild：请先在本目录执行 npm install');
  throw error;
}
const { build } = esbuild;

const shared = {
  bundle: true,
  sourcemap: false,
  logLevel: 'info',
  // 中文原样输出（默认 ascii 会转成 \uXXXX，难读且体积更大）
  charset: 'utf8',
  target: ['node20'],
  external: ['@deepseek-ai/*', 'react', 'react-dom', 'react/jsx-runtime'],
  define: { 'process.env.NODE_ENV': '"production"' },
};

await build({ ...shared, entryPoints: ['src/host/index.ts'], outfile: 'lib/index.js', format: 'esm', platform: 'node' });
await build({ ...shared, entryPoints: ['src/client/index.ts'], outfile: 'lib/client.js', format: 'iife', platform: 'browser', target: ['chrome110'] });
