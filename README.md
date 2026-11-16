# dsh-static-kb

**DeepSeek Harness 的静态知识库插件**：自定义分区、导入资料、由模型转化为可检索的 Markdown，按对话绑定并「资料库优先」回答。

[中文](#中文) · [English](#english) · [MIT License](LICENSE)

![license](https://img.shields.io/badge/license-MIT-blue.svg)
![npm](https://img.shields.io/npm/v/dsh-static-kb)
![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.2.2--rc.3-4b6cf6)

---

## 中文

### 这是什么

一个**静态**知识库：资料由你自行整理、分区存放（例如「毛泽东选集资料库」「公司制度库」），插件负责把网页、PDF、TXT、电子书等原文变成模型可读、可检索的 Markdown，并在对话里按「资料库优先」的规则使用。

和常见 RAG 插件的区别：

- **分区由你定**：一个资料库就是一类书，左栏一行一个，随时新建/改名/删除。
- **先转化、再检索**：原文先抽成纯文本，再由当前默认模型整理成带摘要、标签、章节的 Markdown；只有转化完成的文档才进入检索，避免把乱码或半成品喂给模型。
- **绑定属于对话**：绑定写在会话上，不改资料库；同一个人可以在这个对话查毛选、在那个对话查制度。
- **静态**：不会后台抓取、同步、重建索引；你放什么就是什么，数据是可读的普通文件。

### 功能

- **资料库管理**：新建、改名、删除；文档数、可检索数、待转化数实时显示。
- **多种导入方式**：
  - 上传 PDF / HTML / Markdown / TXT / EPUB / DOCX / 图片（单文件 ≤ 32 MB）；
  - 拖拽到导入框，或选中资料库后直接拖到右侧文件区（松开即导入并自动转化）；
  - 粘贴网页正文或笔记；
  - 填网址抓取公网页面（http/https，单页 ≤ 8 MB，拒绝内网/回环地址）。
- **模型转化**：把原文整理为结构化 Markdown（保留章节、生成一句话摘要与 3–6 个标签）；长文按 16k 字符分块连续转化。
- **全文检索**：本地词频 + 中文二元组评分，返回命中片段；`kb_search` / `kb_read` 供模型取证。
- **会话级绑定**：每个对话标题栏都有资料库控件；绑定后系统提示词注入优先级规则。
- **冲突处理**：小歧义以资料库为准；关键事实强冲突时立即用 `ask_user_question` 询问你，不自行取舍。
- **文件面板**：侧边栏「资料库」是独立主面板——左栏资料库、右上方按文件类型分页并计数、正区文件列表；双击在 Harness 内预览（PDF 内嵌、HTML 沙箱渲染、文本/图片直读）。

### 界面

```
┌ 资料库 ──────────────┬ 毛泽东选集资料库 ──────────────────────┐
│ 毛泽东选集资料库  ●  │ 实践是检验真理的唯一标准……              │
│   12 篇 · 2 待转化    │                                          │
│ 公司制度库           │ [全部 12] [PDF 8] [HTML 2] [Markdown 2]  │
│   36 篇               │ ┌──────────────────────────────────────┐ │
│                       │ │ PDF  实践论.pdf   可检索   AI 转化 预览 │ │
│ + 新建                │ │ PDF  矛盾论.pdf   待转化   AI 转化 预览 │ │
│                       │ └──────────────────────────────────────┘ │
│ 数据目录：~/.dsh/…    │                                          │
└───────────────────────┴──────────────────────────────────────────┘
```

对话标题栏：`📖 绑定`（未绑定）／`📖 毛泽东选集资料库 ●`（已绑定），点开就地选择、解绑或进入管理面板。

### 安装

> 要求 DeepSeek Harness **≥ 0.2.2-rc.3**（Web / 桌面版均可）。

**方式一：插件市场索引（推荐，发布后可用）**

1. 设置 → 插件 → 打开「自定义插件索引」（实验性）；
2. 发现 → 添加索引源，粘贴：
   `https://cdn.jsdelivr.net/gh/Charlie-yangjiaqi/dsh-static-kb@main/market/index.json`
   （备用：`https://raw.githubusercontent.com/Charlie-yangjiaqi/dsh-static-kb/main/market/index.json`）
3. 搜索 `dsh-static-kb` → 安装。

DSH 没有官方集中市场：任何符合 format 1 的索引 JSON 都可以作为发现源，详见 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

**方式二：npm（已发布）**

```bash
dsh plugin --profile desktop add dsh-static-kb
# 或钉版本：dsh plugin --profile desktop add dsh-static-kb@0.1.0
```

包主页：<https://www.npmjs.com/package/dsh-static-kb>

**方式三：本地目录（开发/自用）**

插件页 → 添加插件 → 本地目录 → 选择本仓库目录；或：

```bash
plugin_manager install_bundle target=D:\dsh-kb
```

### 使用

1. 侧边栏点「资料库」→ 新建资料库（如「毛泽东选集资料库」）。
2. 点「导入文件 / 导入网页 / 粘贴文本」，等待状态从「待转化」变成「可检索」；也可点行内「AI 转化」立即处理。
3. 回到任意对话，标题栏点「绑定」→ 选中该资料库（不离开对话）。
4. 直接提问。模型会先 `kb_search` 取证、必要时 `kb_read` 读原文，引用时标注【资料库·文档名】。

### 绑定后的回答规则

绑定时注入系统提示词：

1. 与资料库主题相关的问题，先检索资料库，资料库是**主要依据**；
2. 网络搜索与自身知识只作补充；
3. 轻微歧义/细节不一致：以资料库为准，可在末尾一句话说明差异；
4. 关键事实、数字、结论**强烈冲突**：立即停止作答，用 `ask_user_question` 说明冲突双方并请你裁决；工具不可用就直接停下提问；
5. 资料库检索不到时，明确说「资料库中没有相关记载」，再给库外补充并注明。

### Agent 工具

| 工具 | 作用 |
| --- | --- |
| `kb_list` | 列出资料库与文档概况，确认当前绑定 |
| `kb_search` | 检索（默认当前绑定库），返回标题、标签、摘要与命中片段 |
| `kb_read` | 读取一篇文档正文，按字符分页 |
| `kb_pending` | 列出待转化资料与原文片段 |
| `kb_convert` | 用当前默认模型把原文转化为可检索 Markdown（每次最多 3 篇） |
| `kb_write_doc` | 把整理好的 Markdown 写入/覆盖资料库（供模型自己读 PDF 后写回） |
| `kb_status` | 绑定与统计信息，只读 |

### 数据与隐私

数据默认在 `$DSH_HOME/knowledge-base/`（Windows：`C:\Users\<you>\.dsh\knowledge-base`），全部是可读文件：

```
library.json                  资料库与文档元数据
bindings.json                 会话 → 资料库 绑定
<kbId>/raw/<docId>.<ext>      你上传的原始文件
<kbId>/text/<docId>.txt       抽取出的纯文本
<kbId>/docs/<docId>.md        模型转化后的 Markdown（正式检索内容）
```

- 插件本身**不上传、不联网**；只有你填网址导入时，Host 才会抓取那个公网页面。
- 「AI 转化」会把该文档的文本发送给你当前配置的模型服务商——这是转化本身的必要通信。
- 原始文件按扩展名返回：HTML/SVG 一律作为附件下载并加 `nosniff`/`CSP: sandbox`，避免抓来的页面在 DSH 同源执行脚本。

### 兼容性与开发

- 已在 DSH `0.2.2-rc.3`（Windows 桌面版，Web GUI）验证。
- 插件由 Host 半边（`index.js` + `lib/`）和浏览器半边（`client.js`）组成，无构建步骤，无第三方运行时依赖。
- 测试：`npm test`（26 项：存储/检索、格式抽取、ZIP、路由、工具 schema、URL 抓取、入口装配、客户端 bundle 契约）。

```bash
npm test
npm run build:market   # 重新生成 market/index.json
```

### 已知边界

- **扫描版 / CID 字体 PDF** 抽不出可信文字，会停在「待转化」；在对话里让模型用 PDF 阅读工具读入后 `kb_write_doc` 写回。
- 自动转化依赖当前默认模型；模型不可用或调用失败时，文档保留原文并提示改走对话内转化。
- 检索是本地词频 + 中文二元组评分，**不做向量检索**；适合几万到几十万字的分类资料库。
- 图片只做预览，不提取文字。
- MOBI/AZW3、DJVU 等格式不解析，保留原件等待模型读取。

### 贡献

欢迎 issue / PR。提交前请跑 `npm test`，并保持「数据是可读普通文件」和「只有转化完成的文档进入检索」这两条不变量。

### License

[MIT](LICENSE) © 2026 Charlie

---

<a id="english"></a>

## English

**A static knowledge base plugin for DeepSeek Harness.** Curate your own libraries (one per subject), import PDFs, web pages, text and ebooks, let the model convert them into searchable Markdown, bind a library to a conversation, and answer from it first.

### Why "static"

- **You own the partitions**: one library per subject; create, rename, delete — no hidden folders.
- **Convert first, retrieve later**: sources are extracted to text, then the current default model turns them into structured Markdown with a summary, tags and section headings. Only converted documents become searchable, so OCR noise never reaches the model.
- **Binding lives on the conversation**, not on the library: the same machine can ask about one library in this chat and another in the next.
- **No background crawling or syncing**: what you put in is what you get, stored as ordinary readable files.

### Features

- Library management with live counts (documents / searchable / pending).
- Import: PDF, HTML, Markdown, TXT, EPUB, DOCX, images (≤ 32 MB each); drag files onto the import dialog or directly onto the right-hand document pane of a selected library (drop imports and converts); paste text; fetch a public page by URL (http/https, ≤ 8 MB, private and loopback hosts rejected).
- Model conversion into structured Markdown (sections preserved, one-line summary, 3–6 tags); long documents are converted in 16k-character chunks.
- Local full-text search (term frequency + CJK bigrams) exposed to the agent as `kb_search` / `kb_read`.
- Per-conversation binding through a control in the session header; small ambiguities follow the library, strong factual conflicts trigger `ask_user_question` instead of a silent choice.
- Dedicated sidebar panel: libraries on the left, file-type tabs with counts on top-right, documents in the main area; double-click previews PDFs inline, HTML in a sandbox, and text/images directly.

### Install (DSH ≥ 0.2.2-rc.3)

DSH has no central marketplace — Discover reads any format-1 index source a user adds.

1. Settings → Plugins → enable **Custom plugin index** (experimental).
2. Discover → Add index source:
   `https://cdn.jsdelivr.net/gh/Charlie-yangjiaqi/dsh-static-kb@main/market/index.json`
3. Search `dsh-static-kb` and install.

Or from npm:

```bash
dsh plugin --profile desktop add dsh-static-kb
```

Or install this directory as a local bundle from the Plugins page.

### Usage

1. Sidebar → **Library** → create a library.
2. Import files, paste text, or fetch a page; wait for **Searchable** (or press **Convert** on a row).
3. In any conversation, click the library control in the header and pick the library.
4. Ask. The model searches the library first, cites【Library · Document】, and follows the conflict rules below.

### Answer policy when bound

1. Retrieve from the library first; it is the primary source.
2. Web search and the model's own knowledge only supplement it.
3. Minor ambiguity: follow the library, mention the difference in one line.
4. Strong conflict on key facts/numbers/conclusions: stop and ask the user with `ask_user_question` (or a plain question when that tool is unavailable).
5. Not covered: say "no relevant record in the library", then supplement and label it as such.

### Tools

`kb_list`, `kb_search`, `kb_read`, `kb_pending`, `kb_convert`, `kb_write_doc`, `kb_status` — see the Chinese table above for details.

### Data & privacy

Everything lives under `$DSH_HOME/knowledge-base/` as plain files (`library.json`, `bindings.json`, and per-library `raw/`, `text/`, `docs/`). The plugin never uploads or fetches on its own; only a URL import fetches the page you provide. Converting a document sends its text to your configured model provider — that is the conversion itself.

### Development

No build step, no third-party runtime dependencies. `npm test` runs 26 tests (storage/search, extractors, zip, routes, tool schema, URL fetch, entry wiring, client bundle contract). `npm run build:market` regenerates `market/index.json`.

### Limits

Scanned/CID PDFs stay pending until the model reads them with a PDF tool and writes the result back through `kb_write_doc`. Conversion depends on the default model. Search is lexical (no embeddings), best for libraries of tens to hundreds of thousands of characters. Images are preview-only; MOBI/AZW3/DJVU are kept as originals.

### License

[MIT](LICENSE) © 2026 Charlie
