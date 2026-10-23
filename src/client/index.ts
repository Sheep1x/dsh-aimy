// client 半侧 bundle 外壳：必须是「普通副作用脚本」，加载时调用 __ModuleLoader__.load。
// 不能有顶层 ESM export/import —— react 由 factory 的 require 取得。
import { makeFactory } from './app';

declare const window: {
  __ModuleLoader__: {
    load(info: { id: string; factory: (require: (m: string) => any) => any }): void;
  };
};

window.__ModuleLoader__.load({
  id: 'dsh-aimy',
  factory: makeFactory(),
});
