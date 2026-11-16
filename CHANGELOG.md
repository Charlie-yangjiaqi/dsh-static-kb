# Changelog

本项目遵循语义化版本。

## 0.3.0 — 2026-11-16

### 新增

- **可单独配置转化模型**：面板齿轮 →「转化设置」，支持任意 OpenAI 兼容服务（服务地址 / 文本模型 / 视觉模型 / API Key / 温度）；不配置时沿用 DSH 当前默认模型。API Key 存入 DSH credentials，`settings.json` 只存非敏感项。
- **视觉兜底**：抽取失败、文本质量差或图片文档时，自动抽取 PDF 内嵌页面图/图片交给视觉模型转写（按批处理）。
- **视觉复核**：转化完成后抽样页面图片与整理结果比对，问题列表显示在文档行；可关闭。
- 文档新增 `conversionMode` / `visionCheck` / `textQuality` 元数据与 UI 标识。
- 「测试连接」接口与设置弹窗；转换失败信息更具体。

### 变更

- `lib/pdf.js` 新增内嵌图片抽取（JPEG 直出、Flate 位图转 PNG）。
- 转化设置 API：`settings.get` / `settings.update` / `settings.test`。

## 0.2.1 — 2026-11-16

### 修复

- **中文 PDF 解析**：支持 Type0 + Identity-H 字体与 `/ToUnicode` CMap（含对象流里的字体），修复此前中文 PDF 抽取成乱码、文本为空、AI 转化直接失败的问题。新增 `lib/pdf.js`（无第三方依赖），能按页解析 Resources/Contents、bfchar/bfrange。
- **旧文档自愈**：转化前若发现没有抽取文本、但有原始文件，会先用新解析器重新抽取再转化，无需删除重导。
- **推理模型空结果**：按模型能力选择推理强度、提高输出上限，并在 `max-tokens` 截断时自动放大预算重试；错误信息会带上段落、推理长度、finish 原因与模型名，便于定位。
- 简单字体缺少 ToUnicode 时只保留 ASCII，双字节 CID 缺少 ToUnicode 时直接丢弃，避免把字形索引当正文写进检索内容。

### 新增

- PDF 抽取回归测试（简单 Type1、Identity-H/ToUnicode、bfrange、换行）。

## 0.2.0 — 2026-11-16

### 新增

- **右侧文件区拖拽导入**：选中资料库后，把文件拖到右侧文件列表即可导入；多文件逐个上传并自动转化，拖动中显示高亮遮罩，底部显示「正在导入/转化 i/n」进度，完成后 toast 并刷新列表与计数。
- 拖拽导入与导入对话框共用同一实现（`importFilesToLibrary`），两处行为不再分叉。

### 变更

- 文档：README / DETAIL 补充拖拽导入说明。

## 0.1.0 — 2026-11-13

### 新增

- 静态分区资料库：自定义分区、改名、删除。
- 导入 PDF / HTML / Markdown / TXT / EPUB / DOCX / 图片，粘贴文本，按 URL 抓取公网页面。
- 模型转化：把原文整理为带章节、摘要和标签的 Markdown；只有转化完成的文档进入检索。
- 本地全文检索（词频 + 中文二元组），Agent 工具 `kb_list` / `kb_search` / `kb_read` / `kb_pending` / `kb_convert` / `kb_write_doc` / `kb_status`。
- 会话级绑定：对话标题栏控件，绑定后就地解绑/换库；绑定后注入「资料库优先」规则与冲突处理策略。
- 侧边栏「资料库」主面板：左栏资料库、按文件类型分页、双击预览（PDF / HTML 沙箱 / 文本 / 图片）。
- MIT 开源；市场索引、索引生成与校验脚本。
