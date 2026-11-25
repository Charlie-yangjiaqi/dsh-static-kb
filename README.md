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
  - 上传 PDF / HTML / Markdown / TXT / EPUB / Word（docx、doc）/ Excel（xlsx、xls）/ PPT（pptx、ppt）/ 图片（PDF ≤ 50 MB，其他 ≤ 32 MB）；
  - 拖拽到导入框，或选中资料库后直接拖到右侧文件区（松开即导入并自动转化）；
  - 粘贴网页正文或笔记；
  - 填网址抓取公网页面（http/https，单页 ≤ 8 MB，拒绝内网/回环地址）。
- **模型转化**：把原文整理为结构化 Markdown（保留章节、生成一句话摘要与 3–6 个标签）；长文按 16k 字符分块连续转化。
- **可单独配置转化模型**：面板左上角齿轮打开「转化设置」，可填任意 OpenAI 兼容服务（服务地址 / 文本模型 / 视觉模型 / API Key），用更便宜的模型做转化；API Key 存在 DSH 凭据里，不写入配置文件。
- **视觉兜底与复核（全自动）**：抽不出文字或文字质量差时，自动整篇改用视觉模型逐页转写，不需要再点任何按钮；转化后自动抽样复核，发现问题会带着复核意见自动重转并再复核（轮数可配）。
- **全量转化**：资料库名称右边的小按钮会把整个资料库里「未转化 / 只转了一部分」的文档一次跑完（已转完的跳过），标题栏显示整体进度，可取消。
- **手动操作可选**：默认隐藏「继续转化 / 全量转化 / 视觉提取 / 视觉重建 / 修复」按钮，全部交给自动化；需要人工介入时在「转化设置 → 自动化」里打开「显示手动操作按钮」。
- **自动化开关**：设置里可分别开关「提取失败自动视觉提取」「复核问题自动修复」，并设定自动修复最多重转轮数。
- **转化进度**：转化时文档行显示进度条、当前阶段（渲染页面 / 模型转化 / 视觉转写 / 复核）、百分比与已用时间；资料库标题栏显示「转化中 N 篇」。
- **策略可调**：并行请求数（默认 3）与页面渲染精度（默认 1.5）都在「转化设置」里；并发越高越快，但更容易触发服务商限流。
- **页数进度与继续转化**：视觉只读了前 N 页时，文档行会写明「视觉仅读取前 N / 共 M 页」，并给出两个按钮：**继续转化**（再跑一批）和**全量转化**（把剩余所有页面一次跑完）。文本转化被分块上限截断时同理。
- **打开转化文件**：可检索文档可一键查看 LLM 实际检索读到的 Markdown（可复制），转化文件在磁盘上按「标题（原文件名）.md」命名，可直接在文件管理器里认出。
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
   `https://raw.githubusercontent.com/Charlie-yangjiaqi/dsh-static-kb/main/market/index.json`
   （备用：`https://cdn.jsdelivr.net/gh/Charlie-yangjiaqi/dsh-static-kb@main/market/index.json`，jsDelivr 有缓存，可能滞后几小时）
3. 搜索 `dsh-static-kb` → 安装。

DSH 没有官方集中市场：任何符合 format 1 的索引 JSON 都可以作为发现源，详见 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

**方式二：npm（已发布）**

```bash
dsh plugin --profile desktop add dsh-static-kb
# 或钉版本：dsh plugin --profile desktop add dsh-static-kb@0.11.0
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

### 转化设置（可选）

面板左上角齿轮 → 「转化设置」：

- **服务地址**：OpenAI 兼容接口，例如 `https://api.deepseek.com/v1`、`https://api.openai.com/v1`；
- **文本模型**：用于普通文本转化，例如 `deepseek-chat`；
- **视觉模型**：用于扫描件/乱码兜底与复核，留空则复用文本模型；
- **API Key**：只保存在 DSH 的 credentials 里，接口返回永远只给掩码；
- **视觉开关 / 复核开关 / 最多读取页数**：单次视觉转化的页数上限（默认 8，最大 20）；超过总页数时可以点「继续转化」按页续读。
- **并行请求数**（默认 3，1–6）与**页面渲染精度**（默认 1.5，1–2.5）：并发越高越快，但更容易触发服务商限流；精度越低图片越小、视觉 token 越省。

不填时使用 DSH 当前默认模型（原行为）。「测试连接」会发一次极小的请求验证地址、模型与 Key。

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
<kbId>/docs/标题（原文件名）.md  模型转化后的 Markdown（正式检索内容；标题由模型总结得出）
```

- 插件本身**不上传、不联网**；只有你填网址导入时，Host 才会抓取那个公网页面。
- 「AI 转化」会把该文档的文本发送给你当前配置的模型服务商——这是转化本身的必要通信。配置了单独 API Key 时，文本/页面图片只发往你填的那个服务地址。
- API Key 存在 DSH 凭据服务（credentials）里，`settings.json` 只保存服务地址、模型名等非敏感项。
- 原始文件按扩展名返回：HTML/SVG 一律作为附件下载并加 `nosniff`/`CSP: sandbox`，避免抓来的页面在 DSH 同源执行脚本。

### 兼容性与开发

- 已在 DSH `0.2.2-rc.3`（Windows 桌面版，Web GUI）验证。
- 插件由 Host 半边（`index.js` + `lib/`）和浏览器半边（`client.js`）组成，无构建步骤；运行时依赖为 `pdf-to-png-converter`、`pdfjs-dist`（整页渲染扫描件、读取页数）、`xlsx`（旧版 .xls）、`word-extractor`（旧版 .doc）；.xlsx / .pptx / .ppt 由插件自带的 OOXML 与 OLE2 解析器处理。
- 测试：`npm test`（62 项：存储/检索、格式抽取、PDF/CID/图片、续读、ZIP、路由、工具 schema、URL 抓取、转化设置、OpenAI 客户端、入口装配、客户端 bundle 契约）。

```bash
npm test
npm run build:market   # 重新生成 market/index.json
```

### 已知边界

- **扫描版（纯图片）PDF** 需要 OCR 或视觉模型：配置视觉模型后会自动整页渲染并转写；矢量 PDF 若既没有文字层也没有页面图，仍需对话内读图或外部 OCR。
- **视觉转化按页计费**：默认一次最多 20 页，超出后文档会标注「仅读取前 N 页」，「继续转化」按批续读；可关掉视觉或只在必要时用。
- **大文档转化较慢**：走当前默认模型，十几万字可能要几分钟；转化在后台跑，可以关掉面板，进度与失败原因会在文档行上显示。
- 自动转化依赖当前默认模型；模型不可用或调用失败时，文档保留原文并提示改走对话内转化。
- 检索是本地词频 + 中文二元组评分，**不做向量检索**；适合几万到几十万字的分类资料库。
- 图片只做预览，不提取文字。
- MOBI/AZW3、DJVU 等格式不解析，保留原件等待模型读取。

### 开发历史

项目从 2026-11-13 起跑，到 11-17 的 0.9.0 为止共 40 余次提交，大致分三段：先把「资料库 + 转化 + 检索 + 绑定」跑通；再把转化过程做成可诊断、可运营（进度、续转、全量、复核修复）；最后补健壮性（取消、看门狗、旧数据自愈）与格式覆盖。

| 版本 | 日期 | 里程碑 |
| --- | --- | --- |
| 0.1.0 | 11-13 | MVP：自定义资料库、导入/粘贴/URL、模型转化、全文检索、7 个 Agent 工具、会话绑定、侧边栏面板 |
| 0.2.0 | 11-16 | 右侧文件区拖拽导入 |
| 0.2.1 | 11-16 | 自研 PDF 解析（Type0/Identity-H/ToUnicode），修复中文 PDF 乱码；推理模型空结果自动重试 |
| 0.3.0 | 11-16 | 独立的转化模型与 API Key（走 DSH credentials）；视觉兜底与视觉复核 |
| 0.4.0 | 11-16 | 页数进度与「继续转化」；「打开转化文件」；PDF 整页栅格化；网关 `x-opencode-session` 修复 |
| 0.4.1 | 11-16 | 转化文件窗口改为「打开文件所在位置」 |
| 0.4.2 | 11-16 | 转化文件按「模型标题（原文件名）.md」落盘，旧哈希名自动迁移 |
| 0.5.0 | 11-16 | 转化进度可视化（进度条/阶段/耗时）；并行转化；渲染精度可调 |
| 0.6.0 | 11-16 | 单篇「全量转化」，按窗口一次跑完剩余页面 |
| 0.7.0 | 11-16 | 视觉复核失败可「修复」；文本太差可主动「视觉提取 / 视觉重建」 |
| 0.8.0 | 11-16 | 资料库级「全量转化」；修复长文末尾截断（分段与输出上限调整） |
| 0.8.1 | 11-16 | 「视觉全量转化」：疑似 OCR 残缺时整篇重做并覆盖 |
| 0.8.2 | 11-16 | 进度口径按转化方式区分（页/字符），旧 `partial` 自愈 |
| 0.8.3 | 11-16 | 修复「视觉全量」返回幽灵任务导致的「任务不存在」 |
| 0.8.4 | 11-17 | 任务看门狗（20 分钟无进度自动停）；级联取消；视觉批次降到 2 页 |
| 0.8.5 | 11-17 | 取消立即生效且不再写盘；资料库全量覆盖未转化文档 |
| 0.8.6 | 11-17 | 原文件预览也改为「打开文件所在位置」 |
| 0.9.0 | 11-17 | Office 全格式：xlsx/pptx 自研解析，xls/doc 接第三方，ppt 自研 OLE2 + 记录遍历 |

几个一路坚持下来的设计取舍：

- **Host / Client 两半边，零构建步骤**：Host 负责存储、检索、转化与 API，Client 只通过同源 `/dsh-kb/api/*` 调用，改前端不用打包。
- **能用自研就不用原生二进制**：PDF（含 CID/ToUnicode）、OOXML（docx/xlsx/pptx）、OLE2（ppt）都是自带解析；只有旧版 xls/doc 借助 `xlsx` 与 `word-extractor`。
- **检索只认转化完成的文档**：抽取失败或质量差就停在「待转化」，宁可不检索，也不把乱码写进知识库。
- **所有耗时操作都是可观测任务**：统一任务表 + 进度 + 取消 + 看门狗，面板关掉再打开还能接着看。

### 贡献

欢迎 issue / PR。提交前请跑 `npm test`，并保持「数据是可读普通文件」和「只有转化完成的文档进入检索」这两条不变量。

### License

[MIT](LICENSE) © 2026 Charlie

更新记录见 [CHANGELOG.md](CHANGELOG.md)。

如果这个插件对你有用，欢迎在 [GitHub 仓库](https://github.com/Charlie-yangjiaqi/dsh-static-kb) 点一个 ⭐ **Star**，这是最直接的支持。

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
- Import: PDF, HTML, Markdown, TXT, EPUB, Word, Excel, PPT, images (PDF ≤ 50 MB, others ≤ 32 MB); drag files onto the import dialog or directly onto the right-hand document pane of a selected library (drop imports and converts); paste text; fetch a public page by URL (http/https, ≤ 8 MB, private and loopback hosts rejected).
- Model conversion into structured Markdown (sections preserved, one-line summary, 3–6 tags); long documents are converted in 16k-character chunks.
- **Separate conversion model**: the gear in the panel header configures any OpenAI-compatible endpoint (base URL, text model, vision model, API key) so conversion can use a cheaper model. The key lives in DSH credentials, never in config files.
- **Vision fallback and check (fully automatic)**: when no usable text can be extracted, the whole document is transcribed page by page with the vision model — no button to click; after conversion it samples pages to check, and a failing check re-transcribes with the findings as guidance and checks again (rounds configurable).
- **Library-wide "Convert all"**: the small button beside the library name converts every pending or partially converted document in one run (finished ones are skipped) and shows overall progress.
- **Manual actions are opt-in**: the Continue / Convert all / Use vision / Rebuild / Repair buttons are hidden by default; turn on "Show manual action buttons" under conversion settings → Automation when you want to intervene.
- **Automation switches**: extraction-failure vision fallback and auto-repair can each be toggled, with a configurable maximum number of repair rounds.
- **Page progress and continue**: when vision read only the first N pages, the row says so and offers **Continue** (one more batch) and **Convert all** (every remaining page in one run); the same applies to text conversions cut off by the chunk limit.
- **Conversion progress**: converting rows show a progress bar, the current phase, percentage and elapsed time; the library header shows "N converting".
- **Tunable throughput**: parallel requests (default 3) and page render scale (default 1.5) live in conversion settings; higher concurrency is faster but more likely to hit provider rate limits.
- **Open converted file**: one click shows the exact Markdown the model reads (with a copy button); on disk the file is named `Title（original-file）.md` so it is recognizable in a file manager.
- Local full-text search (term frequency + CJK bigrams) exposed to the agent as `kb_search` / `kb_read`.
- Per-conversation binding through a control in the session header; small ambiguities follow the library, strong factual conflicts trigger `ask_user_question` instead of a silent choice.
- Dedicated sidebar panel: libraries on the left, file-type tabs with counts on top-right, documents in the main area; double-click previews PDFs inline, HTML in a sandbox, and text/images directly.

### Install (DSH ≥ 0.2.2-rc.3)

DSH has no central marketplace — Discover reads any format-1 index source a user adds.

1. Settings → Plugins → enable **Custom plugin index** (experimental).
2. Discover → Add index source:
   `https://raw.githubusercontent.com/Charlie-yangjiaqi/dsh-static-kb/main/market/index.json`
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

Everything lives under `$DSH_HOME/knowledge-base/` as plain files (`library.json`, `bindings.json`, `settings.json`, and per-library `raw/`, `text/`, `docs/`). The plugin never uploads or fetches on its own; only a URL import fetches the page you provide. Converting a document sends its text (and page images when vision is used) to your configured model provider — that is the conversion itself. A separately configured API key is stored in DSH credentials, not in `settings.json`.

### Development

No build step. Runtime dependencies: `pdf-to-png-converter` and `pdfjs-dist` for rendering PDF pages (scanned documents and page counts), `xlsx` for legacy .xls and `word-extractor` for legacy .doc; .xlsx, .pptx and .ppt are parsed by the bundled OOXML/OLE2 readers. `npm test` runs 68 tests.

### Development history

Built in five days: 40-odd commits from the first `chore: init repository` on 2026-11-13 to 0.9.0 on 11-17. Three phases: make the core loop work (library → convert → search → bind), make conversion observable and operable (progress, continue, convert-all, repair), then harden it (cancel, watchdogs, self-healing metadata) and widen format coverage.

| Version | Date | Milestone |
| --- | --- | --- |
| 0.1.0 | 11-13 | MVP: custom libraries, import/paste/URL, model conversion, full-text search, 7 agent tools, session binding, sidebar panel |
| 0.2.0 | 11-16 | Drag-and-drop import onto the file pane |
| 0.2.1 | 11-16 | Native PDF parser (Type0/Identity-H/ToUnicode) fixing Chinese PDFs; retry on empty reasoning-model output |
| 0.3.0 | 11-16 | Separate conversion model and API key (stored in DSH credentials); vision fallback and vision check |
| 0.4.0 | 11-16 | Page progress and Continue; Open converted file; full-page PDF rasterization; gateway session header fix |
| 0.4.1 | 11-16 | Converted-file dialog now reveals the file in the OS file manager |
| 0.4.2 | 11-16 | Converted files named `Title (original name).md`, legacy hash names migrated |
| 0.5.0 | 11-16 | Progress bar with phases and elapsed time; parallel conversion; adjustable raster scale |
| 0.6.0 | 11-16 | Per-document Convert all: finish every remaining page in one job |
| 0.7.0 | 11-16 | Repair a failed vision check; force vision extraction/rebuild for bad text |
| 0.8.0 | 11-16 | Library-wide Convert all; fix truncated tails of long text documents |
| 0.8.1 | 11-16 | Full vision conversion for OCR-fragment documents (replace, not append) |
| 0.8.2 | 11-16 | Progress measured per mode (pages vs characters); heal stale `partial` flags |
| 0.8.3 | 11-16 | Fix phantom job returned by full vision conversion |
| 0.8.4 | 11-17 | Job watchdog (auto-stop after 20 min without progress); cascading cancel; 2-page vision batches |
| 0.8.5 | 11-17 | Immediate cancel that never saves afterwards; library-wide conversion covers un-converted docs |
| 0.8.6 | 11-17 | Original-file preview also reveals the file location |
| 0.9.0 | 11-17 | Office formats: native xlsx/pptx parsing, xls/doc via libraries, ppt via native OLE2 + record walk |

Design choices kept throughout:

- **Host/client split with no build step** — the host owns storage, search, conversion and the API; the client only calls same-origin `/dsh-kb/api/*`.
- **Native parsers over external binaries** — PDF (CID/ToUnicode), OOXML (docx/xlsx/pptx) and OLE2 (ppt) are bundled; only legacy xls/doc use `xlsx` and `word-extractor`.
- **Only converted documents are searchable** — poor extraction parks a document at "pending" instead of putting mojibake into the knowledge base.
- **Every long operation is an observable job** — one registry with progress, cancel and a watchdog, and progress survives closing the panel.

### Limits

Scanned (image-only) PDFs need OCR or a vision model; with a vision model configured the plugin tries automatically, while vector-only PDFs with no embedded page image still need OCR or an in-chat read. Vision calls cost extra (batch image transcription plus a sampled check) and can be disabled in settings. Large documents take minutes to convert on the default model; the job runs in the background and progress/failures appear on the document row. Search is lexical (no embeddings), best for libraries of tens to hundreds of thousands of characters. Images are preview-only; MOBI/AZW3/DJVU are kept as originals.

### License

[MIT](LICENSE) © 2026 Charlie

See [CHANGELOG.md](CHANGELOG.md) for release notes.

If this plugin saves you time, a ⭐ **star** on [GitHub](https://github.com/Charlie-yangjiaqi/dsh-static-kb) is the simplest way to support it.
