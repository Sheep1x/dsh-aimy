# 截图素材

市场详情页按 `screenshots.json` 声明的顺序展示这里的图片。

## 当前已有

| 文件 | 内容 | 尺寸 |
|---|---|---|
| `01-panel.png` | 面板全貌：地址（可复制）、协议下拉、状态、当前分组与倍率、模型路由、诊断行、API Key、切组卡片 | 953×621 |

想补第二张（例如切组生效前后对比）时，把图放进本目录并在仓库根
`screenshots.json` 里追加一行即可 —— **不需要再提 PR**。

## 换图流程

1. 把新图放进本目录（建议命名 `01-…`、`02-…`，数字控制顺序）
2. 在仓库根 `screenshots.json` 里按顺序列出
3. `npm run check:screenshots` 自检
4. commit + push —— 市场下次构建自动读取

## 规格与限制

- 1–8 张（dsh-market 只展示**前 6 张**）
- 相对路径：相对 `screenshots.json`，不得以 `/` 开头、不得含 `..`
- 绝对 URL：仅限 GitHub 托管的 https（`raw.githubusercontent.com` /
  `user-images.githubusercontent.com` / `camo.githubusercontent.com` / `github.com`）；
  第三方图床会被拒——截图 URL 会带上访问者 IP
- 建议宽 1200–1600px；当前这张 953px，缩小展示仍清晰
- **截图不随 npm 包分发**（`files` 白名单只列了图标），市场从仓库读取

## 截图注意

- API Key 输入框保持为空（插件 write-only 本就不回显）
- 状态行尽量是「已连接」「已保存」这类正常态，别把报错截进去
- 不要露出其它插件的密钥或会话内容
