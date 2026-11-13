# @local/dsh-knowledge-base

DeepSeek Harness 的**静态资料库**插件：自定义分区、导入文件/文本、由模型转化为可检索的 Markdown、按对话绑定并「资料库优先」回答。

## 功能

- **分区资料库**：一个资料库就是一类书（如「毛泽东选集资料库」）。左侧列表一行一个，可新建、改名、删除。
- **导入 → 转化 → 检索**：上传 PDF / HTML / Markdown / TXT / EPUB / DOCX / 图片，粘贴网页正文，或填网址抓取公网页面；先抽取原文，再由当前默认模型整理为结构化 Markdown（保留章节、生成摘要与标签）。只有转化完成的文档才会进入检索。
- **会话级绑定**：每个对话标题栏都有资料库控件（未绑定显示「绑定」，点开是就地弹出的小列表，不离开对话；已绑定显示库名与可检索篇数）。绑定后，系统提示词注入「资料库优先」规则：先 `kb_search` 取证，资料库为主、网络与自身知识为辅；轻微歧义以资料库为准，强烈冲突时用 `ask_user_question` 立即询问用户。
- **面板 UI**：侧边栏导航里的「资料库」是独立主面板（和「上下文洞察」「邮件」同级）。左栏选资料库，右上方按文件类型（PDF / HTML / Markdown / 文本 / EPUB / Word / 图片 / 其他）切换，正区列出文件；双击文件在 Harness 内预览（PDF 内嵌、HTML 沙箱渲染、文本/图片直读）。

## 数据布局

数据目录默认 `$DSH_HOME/knowledge-base`（可用配置项 `dataDir` 覆盖），全部是普通文件：

```
library.json                 元数据（资料库、文档、状态、摘要、标签）
bindings.json                会话 → 资料库 绑定
<kbId>/raw/<docId>.<ext>     用户原始文件
<kbId>/text/<docId>.txt      抽取出的纯文本（预览 / 转化输入）
<kbId>/docs/<docId>.md       模型转化后的 Markdown（正式可检索内容）
```

## 组件

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 入口：装配 runtime、提示词、工具、路由 |
| `lib/store.js` | 元数据 + 文件 + 检索（CJK 二元组）+ 绑定 |
| `lib/extract.js` | 各格式原文抽取，带质量门禁（PDF 乱码不落库） |
| `lib/zip.js` | 无依赖 ZIP 读取（EPUB/DOCX 容器） |
| `lib/llm.js` | 调用 `ctx.llm` 把原文整理成 Markdown（长文分块） |
| `lib/runtime.js` | 转化任务（可轮询）、同步快照（供系统提示词） |
| `lib/routes.js` | 面板使用的同源 API `/dsh-kb/api/*` |
| `lib/tools.js` | `kb_list` / `kb_search` / `kb_read` / `kb_pending` / `kb_convert` / `kb_write_doc` / `kb_status` |
| `lib/prompt.js` | 绑定后注入「资料库优先」规则与目录 |
| `client.js` | 浏览器侧：输入框状态条、侧边栏入口、资料库面板、预览 |

## API（面板内部使用）

`POST /dsh-kb/api/<method>`，JSON `{ ok, value | error }`；同源 + loopback/受信主机校验。

`overview`、`kb.create`、`kb.update`、`kb.delete`、`docs.list`、`doc.import`（base64）、`doc.paste`、`doc.url`（抓取公网页面）、`doc.preview`、`doc.rawtext`、`doc.delete`、`doc.convert`、`job.get`、`job.cancel`、`bind.set`、`binding.get`；
`GET /dsh-kb/api/raw?kbId=&docId=` 输出原始文件，`GET /dsh-kb/api/health` 自检。

## 开发

```bash
node --test test/*.test.mjs   # 单元 + 集成测试（16 项）
```

安装：在 DSH 的**插件**页用「添加插件 → 本地目录」选择本目录，或用 `plugin_manager install_bundle`。安装后在新会话中验证。

## 已知边界

- 扫描版 / CID 字体 PDF 抽不出可信文字，会停在「待转化」；在对话中用 `kb_pending` + `kb_read`/文件阅读工具读入，再 `kb_write_doc` 写回。
- 自动转化依赖当前默认模型；模型不可用时工具会提示改走对话内转化。
- 检索是本地词频 + CJK 二元组评分，不做向量检索；适合几万到几十万字的分区资料库。
