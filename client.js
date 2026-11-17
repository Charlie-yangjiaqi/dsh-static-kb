window.__ModuleLoader__.load({
  id: 'dsh-static-kb',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-knowledge-base';
    const API = '/dsh-kb/api';
    const PANEL_ID = 'dsh-kb';
    let pluginCtx = null;

    // ---------------------------------------------------------------- locale

    const zh = {
      'dock.unbound': '未绑定资料库',
      'dock.loadingShort': '资料库',
      'dock.loading': '正在读取资料库…',
      'dock.hint': '绑定后以资料库为主要依据',
      'dock.bound': '资料库',
      'dock.ready': '{count} 篇可检索',
      'dock.bind': '绑定',
      'dock.unbind': '取消绑定',
      'dock.manage': '管理资料库',
      'dock.change': '更换',
      'dock.open': '打开资料库',
      'panel.title': '资料库',
      'panel.subtitle': '静态资料分区，由你整理，模型转化为可检索文档',
      'panel.new': '新建',
      'panel.newPlaceholder': '新资料库名称，如「毛泽东选集资料库」',
      'panel.create': '创建资料库',
      'panel.cancel': '取消',
      'panel.empty': '还没有资料库。先创建一个，再导入 PDF、网页或 TXT。',
      'panel.emptyShort': '还没有资料库',
      'panel.emptyDocs': '这个资料库还是空的。导入文件或粘贴文本开始整理。',
      'panel.docs': '{count} 篇',
      'panel.pending': '{count} 待转化',
      'panel.boundHere': '当前对话已绑定',
      'panel.noSession': '打开一个对话后即可绑定资料库',
      'panel.import': '导入文件',
      'panel.paste': '粘贴文本',
      'panel.url': '导入网页',
      'panel.rename': '改名',
      'panel.deleteKb': '删除资料库',
      'panel.confirmDeleteKb': '确认删除整个资料库？（会解除相关对话的绑定）',
      'panel.confirmDeleteDoc': '确认删除？',
      'panel.dataDir': '数据目录：{dir}',
      'panel.convertAll': '全量转化',
      'panel.convertAllHint': '把「未转化」和「只转了一部分」的文档全部跑完；已全量转化的会跳过',
      'panel.convertAllNone': '这个资料库没有需要转化的文档',
      'panel.convertAllStarted': '已开始全量转化（{count} 篇）',
      'panel.convertAllDone': '全量转化完成：成功 {ok} 篇，失败 {fail} 篇',
      'panel.convertAllStopped': '全量转化已停止',
      'panel.batchChip': '全量转化 {done}/{total} · {percent}%',
      'panel.close': '关闭',
      'panel.loading': '读取中…',
      'tab.all': '全部',
      'tab.pdf': 'PDF',
      'tab.html': 'HTML',
      'tab.markdown': 'Markdown',
      'tab.text': '文本',
      'tab.epub': 'EPUB',
      'tab.docx': 'Word',
      'tab.image': '图片',
      'tab.other': '其他',
      'doc.ready': '可检索',
      'doc.imported': '待转化',
      'doc.pending': '仅原文',
      'doc.error': '转化失败',
      'doc.convert': 'AI 转化',
      'doc.converting': '转化中…',
      'doc.convertingProgress': '转化中 {done}/{total}',
      'doc.elapsed': '已用 {time}',
      'doc.runningCount': '转化中 {count} 篇',
      'phase.reading': '读取原文',
      'phase.extract': '抽取文本',
      'phase.images': '渲染页面',
      'phase.model': '模型转化',
      'phase.vision': '视觉转写',
      'phase.verify': '视觉复核',
      'phase.saved': '写入文件',
      'doc.cancel': '取消',
      'doc.cancelDone': '已取消转化',
      'doc.preview': '预览',
      'doc.delete': '删除',
      'doc.doubleClick': '双击预览',
      'doc.noDocs': '这个分类下没有文件',
      'import.title': '导入文件到「{kb}」',
      'import.hint': '支持 PDF、HTML、Markdown、TXT、EPUB、DOCX、图片；单文件上限 32 MB。',
      'import.drop': '把文件拖到这里，或点击选择',
      'import.selected': '已选 {count} 个文件',
      'import.auto': '导入后用当前模型自动转化',
      'import.start': '开始导入',
      'import.uploading': '正在上传 {index}/{total}：{name}',
      'import.converting': '正在转化：{name}',
      'import.done': '完成：{ok} 个导入，{fail} 个失败',
      'drop.title': '松开即可导入「{kb}」',
      'drop.hint': '支持 PDF / HTML / Markdown / TXT / EPUB / DOCX / 图片，单文件 ≤ 32 MB',
      'drop.importing': '正在导入 {index}/{total}：{name}',
      'drop.converting': '正在转化 {index}/{total}：{name}',
      'drop.done': '已导入 {ok} 个文件到「{name}」',
      'settings.title': '转化设置',
      'settings.hint': '默认使用 DSH 当前模型。填写后改用这里的 OpenAI 兼容服务（可配更便宜的模型）；API Key 存在 DSH 凭据里，不写入配置文件。',
      'settings.baseURL': '服务地址（如 https://api.deepseek.com/v1）',
      'settings.model': '文本模型（如 deepseek-chat）',
      'settings.visionModel': '视觉模型（留空则用上面的模型）',
      'settings.apiKey': 'API Key',
      'settings.keySaved': '已配置：{mask}（留空保持不变）',
      'settings.keyMissing': '尚未配置 API Key',
      'settings.clearKey': '清除 Key',
      'settings.vision': '扫描件/乱码时用视觉识别',
      'settings.verify': '转化后用视觉复核',
      'settings.maxImages': '视觉最多读取页数',
      'settings.concurrency': '并行请求数',
      'settings.rasterScale': '页面渲染精度',
      'settings.save': '保存',
      'settings.test': '测试连接',
      'settings.testing': '测试中…',
      'settings.testOk': '连接正常（{ms}ms · {model}）',
      'settings.testFail': '连接失败：{message}',
      'settings.saved': '已保存转化设置',
      'settings.keyCleared': '已清除 API Key',
      'doc.vision': '视觉',
      'doc.openConverted': '打开转化文件',
      'doc.continue': '继续转化',
      'doc.full': '全量转化',
      'doc.fullHint': '把剩余页面全部转化（共 {total} 页），一次跑完不用分批',
      'doc.fullStarted': '已开始全量转化（共 {pages} 页）',
      'doc.repair': '修复',
      'doc.repairHint': '按视觉复核意见重新转写这些页面，并重新复核',
      'doc.repairStarted': '已开始按复核意见修复',
      'doc.visionExtract': '用视觉提取',
      'doc.visionExtractHint': '文本抽取质量低或没有文字；改用视觉模型逐页识别',
      'doc.visionExtractStarted': '已开始用视觉提取',
      'doc.visionRebuild': '视觉重建',
      'doc.visionRebuildStarted': '已开始用视觉重建整篇内容',
      'doc.visionQualityLow': '文本抽取质量偏低（{percent}%），可能缺字或乱码；建议用视觉重建',
      'doc.visionFull': '视觉全量转化',
      'doc.visionFullHint': '这篇是文本转化的，内容可能残缺；用视觉模型把整份文档的每一页重新识别一遍并覆盖现有内容',
      'doc.visionFullStarted': '已开始视觉全量转化（共 {pages} 页）',
      'doc.visionFullNote': '检测到原文可能大量残缺（OCR 残片 / 摘要自述缺失）；建议整篇用视觉重做',
      'doc.continueNothing': '没有需要继续转化的内容',
      'doc.partialPages': '视觉仅读取前 {done} / 共 {total} 页',
      'doc.partialChars': '文本仅转化前 {done} / {total} 字符',
      'doc.legacyVision': '共 {total} 页；旧版本转化未记录页数，重新转化后会从第 1 页开始并支持继续转化',
      'doc.legacyText': '旧版本转化的文本，没有进度记录；要补齐内容请点「重新转化」',
      'doc.reconvert': '重新转化',
      'doc.convertNothing': '没有需要转化的内容',
      'doc.visionChecked': '视觉已复核',
      'doc.visionIssues': '视觉复核：{issues}',
      'paste.title': '粘贴文本到「{kb}」',
      'paste.docTitle': '标题',
      'paste.docTitlePlaceholder': '例如：实践论',
      'paste.sourceUrl': '来源网址（可选）',
      'paste.body': '正文',
      'paste.bodyPlaceholder': '粘贴网页正文、摘录或笔记…',
      'paste.submit': '保存并转化',
      'url.title': '从网址导入「{kb}」',
      'url.hint': '抓取公网 http/https 页面，保留原文并转化为可检索文档；单页上限 8 MB。',
      'url.placeholder': 'https://…',
      'url.docTitle': '标题（可选，留空用页面标题）',
      'url.submit': '抓取并转化',
      'preview.title': '预览',
      'preview.open': '在新窗口打开原文件',
      'preview.download': '下载原文件',
      'preview.source': '源码',
      'preview.rendered': '预览',
      'preview.note': '该格式没有内嵌预览，下面显示抽取出的文字。',
      'preview.loading': '载入中…',
      'preview.empty': '没有可显示的正文。可以在对话里让模型读取原文件并写回资料库。',
      'preview.pdfFallback': '当前窗口无法内嵌显示 PDF。',
      'preview.copy': '复制',
      'preview.copied': '已复制',
      'preview.truncated': '内容较长，已截断显示；完整文件在数据目录的 docs/ 下。',
      'preview.convertedTitle': '{title} · 转化文件',
      'preview.convertedMeta': 'LLM 检索读到的内容',
      'preview.reveal': '打开文件所在位置',
      'common.close': '关闭',
      'common.retry': '重试',
      'common.failed': '操作失败：{message}',
      'bind.done': '已绑定「{title}」',
      'bind.cleared': '已取消绑定',
    };

    const en = {
      'dock.unbound': 'No library bound',
      'dock.loadingShort': 'Library',
      'dock.loading': 'Loading libraries…',
      'dock.hint': 'Answers prefer the bound library',
      'dock.bound': 'Library',
      'dock.ready': '{count} searchable',
      'dock.bind': 'Bind',
      'dock.unbind': 'Unbind',
      'dock.manage': 'Manage library',
      'dock.change': 'Change',
      'dock.open': 'Open library',
      'panel.title': 'Knowledge base',
      'panel.subtitle': 'Static, user-curated libraries converted by the model into searchable docs',
      'panel.new': 'New',
      'panel.newPlaceholder': 'Library name, e.g. "Collected Works"',
      'panel.create': 'Create library',
      'panel.cancel': 'Cancel',
      'panel.empty': 'No libraries yet. Create one, then import PDFs, pages or text.',
      'panel.emptyShort': 'No libraries yet',
      'panel.emptyDocs': 'This library is empty. Import a file or paste text to begin.',
      'panel.docs': '{count} docs',
      'panel.pending': '{count} pending',
      'panel.boundHere': 'Bound to this conversation',
      'panel.noSession': 'Open a conversation to bind a library',
      'panel.import': 'Import files',
      'panel.paste': 'Paste text',
      'panel.url': 'Import page',
      'panel.rename': 'Rename',
      'panel.deleteKb': 'Delete library',
      'panel.confirmDeleteKb': 'Delete this entire library (and unbind its conversations)?',
      'panel.confirmDeleteDoc': 'Delete?',
      'panel.dataDir': 'Data directory: {dir}',
      'panel.convertAll': 'Convert all',
      'panel.convertAllHint': 'Convert every pending or partially converted document; fully converted ones are skipped',
      'panel.convertAllNone': 'Nothing to convert in this library',
      'panel.convertAllStarted': 'Full conversion started ({count} documents)',
      'panel.convertAllDone': 'Full conversion finished: {ok} succeeded, {fail} failed',
      'panel.convertAllStopped': 'Full conversion stopped',
      'panel.batchChip': 'Convert all {done}/{total} · {percent}%',
      'panel.close': 'Close',
      'panel.loading': 'Loading…',
      'tab.all': 'All',
      'tab.pdf': 'PDF',
      'tab.html': 'HTML',
      'tab.markdown': 'Markdown',
      'tab.text': 'Text',
      'tab.epub': 'EPUB',
      'tab.docx': 'Word',
      'tab.image': 'Images',
      'tab.other': 'Other',
      'doc.ready': 'Searchable',
      'doc.imported': 'Pending',
      'doc.pending': 'Raw only',
      'doc.error': 'Failed',
      'doc.convert': 'Convert',
      'doc.converting': 'Converting…',
      'doc.convertingProgress': 'Converting {done}/{total}',
      'doc.elapsed': '{time} elapsed',
      'doc.runningCount': '{count} converting',
      'phase.reading': 'Reading',
      'phase.extract': 'Extracting text',
      'phase.images': 'Rendering pages',
      'phase.model': 'Converting',
      'phase.vision': 'Vision transcription',
      'phase.verify': 'Vision check',
      'phase.saved': 'Writing file',
      'doc.cancel': 'Cancel',
      'doc.cancelDone': 'Conversion cancelled',
      'doc.preview': 'Preview',
      'doc.delete': 'Delete',
      'doc.doubleClick': 'Double-click to preview',
      'doc.noDocs': 'No files in this category',
      'import.title': 'Import into "{kb}"',
      'import.hint': 'PDF, HTML, Markdown, TXT, EPUB, DOCX and images; up to 32 MB each.',
      'import.drop': 'Drop files here, or click to choose',
      'import.selected': '{count} files selected',
      'import.auto': 'Convert with the current model after import',
      'import.start': 'Start import',
      'import.uploading': 'Uploading {index}/{total}: {name}',
      'import.converting': 'Converting: {name}',
      'import.done': 'Done: {ok} imported, {fail} failed',
      'drop.title': 'Drop to import into "{kb}"',
      'drop.hint': 'PDF / HTML / Markdown / TXT / EPUB / DOCX / images, up to 32 MB each',
      'drop.importing': 'Importing {index}/{total}: {name}',
      'drop.converting': 'Converting {index}/{total}: {name}',
      'drop.done': '{ok} file(s) imported into "{name}"',
      'settings.title': 'Conversion settings',
      'settings.hint': 'By default conversion uses the current DSH model. Fill this in to use an OpenAI-compatible endpoint instead (e.g. a cheaper model). The API key is stored in DSH credentials, never in config files.',
      'settings.baseURL': 'Base URL (e.g. https://api.deepseek.com/v1)',
      'settings.model': 'Text model (e.g. deepseek-chat)',
      'settings.visionModel': 'Vision model (blank = the text model)',
      'settings.apiKey': 'API key',
      'settings.keySaved': 'Configured: {mask} (leave blank to keep)',
      'settings.keyMissing': 'No API key configured',
      'settings.clearKey': 'Clear key',
      'settings.vision': 'Use vision for scans / garbled text',
      'settings.verify': 'Verify the conversion with vision',
      'settings.maxImages': 'Max pages for vision',
      'settings.concurrency': 'Parallel requests',
      'settings.rasterScale': 'Page render scale',
      'settings.save': 'Save',
      'settings.test': 'Test connection',
      'settings.testing': 'Testing…',
      'settings.testOk': 'Connected ({ms}ms · {model})',
      'settings.testFail': 'Connection failed: {message}',
      'settings.saved': 'Conversion settings saved',
      'settings.keyCleared': 'API key cleared',
      'doc.vision': 'Vision',
      'doc.openConverted': 'Open converted file',
      'doc.continue': 'Continue',
      'doc.full': 'Convert all',
      'doc.fullHint': 'Convert every remaining page (of {total}) in one run',
      'doc.fullStarted': 'Full conversion started ({pages} pages)',
      'doc.repair': 'Repair',
      'doc.repairHint': 'Re-transcribe these pages following the vision check findings, then check again',
      'doc.repairStarted': 'Repair started',
      'doc.visionExtract': 'Use vision',
      'doc.visionExtractHint': 'Extracted text is poor or empty; transcribe pages with the vision model instead',
      'doc.visionExtractStarted': 'Vision extraction started',
      'doc.visionRebuild': 'Rebuild with vision',
      'doc.visionRebuildStarted': 'Rebuilding the document with vision',
      'doc.visionQualityLow': 'Extracted text quality is low ({percent}%); consider rebuilding with vision',
      'doc.visionFull': 'Full vision conversion',
      'doc.visionFullHint': 'This document was converted from text and may be incomplete; re-read every page with the vision model and replace the content',
      'doc.visionFullStarted': 'Full vision conversion started ({pages} pages)',
      'doc.visionFullNote': 'The source looks heavily incomplete (OCR fragments / summary reports missing content); redo the whole document with vision',
      'doc.continueNothing': 'Nothing left to convert',
      'doc.partialPages': 'Vision read only the first {done} of {total} pages',
      'doc.partialChars': 'Text conversion covered the first {done} of {total} characters',
      'doc.legacyVision': '{total} pages; converted by an older version without page tracking — re-converting starts from page 1 and then supports continuing',
      'doc.legacyText': 'Converted by an older version without progress tracking; re-convert to refresh it',
      'doc.reconvert': 'Re-convert',
      'doc.convertNothing': 'Nothing to convert',
      'doc.visionChecked': 'Vision-checked',
      'doc.visionIssues': 'Vision check: {issues}',
      'paste.title': 'Paste text into "{kb}"',
      'paste.docTitle': 'Title',
      'paste.docTitlePlaceholder': 'e.g. On Practice',
      'paste.sourceUrl': 'Source URL (optional)',
      'paste.body': 'Text',
      'paste.bodyPlaceholder': 'Paste page text, excerpts or notes…',
      'paste.submit': 'Save and convert',
      'url.title': 'Import a page into "{kb}"',
      'url.hint': 'Fetches a public http/https page, keeps the original and converts it; 8 MB per page.',
      'url.placeholder': 'https://…',
      'url.docTitle': 'Title (optional; defaults to the page title)',
      'url.submit': 'Fetch and convert',
      'preview.title': 'Preview',
      'preview.open': 'Open the original in a new tab',
      'preview.download': 'Download the original',
      'preview.source': 'Source',
      'preview.rendered': 'Rendered',
      'preview.note': 'No inline preview for this format; extracted text is shown below.',
      'preview.loading': 'Loading…',
      'preview.empty': 'No displayable text. Ask the model in a conversation to read the original and write it back.',
      'preview.pdfFallback': 'This window cannot embed PDFs.',
      'preview.copy': 'Copy',
      'preview.copied': 'Copied',
      'preview.truncated': 'Truncated for display; the full file is under docs/ in the data directory.',
      'preview.convertedTitle': '{title} · converted file',
      'preview.convertedMeta': 'What the model reads',
      'preview.reveal': 'Show file location',
      'common.close': 'Close',
      'common.retry': 'Retry',
      'common.failed': 'Operation failed: {message}',
      'bind.done': 'Bound "{title}"',
      'bind.cleared': 'Binding cleared',
    };

    let translate = (key, params) => {
      const value = zh[key] !== undefined ? zh[key] : key;
      return String(value).replace(/\{(\w+)\}/g, (match, name) => (params && params[name] !== undefined ? String(params[name]) : match));
    };
    function t(key, params) {
      return translate(key, params);
    }

    // ------------------------------------------------------------------ icons

    const svg = (children, viewBox) =>
      h('svg', { viewBox: viewBox || '0 0 24 24', width: '100%', height: '100%', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, children);

    const IconBook = () => svg([h('path', { key: 'a', d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15.5H6.5A2.5 2.5 0 0 0 4 21z' }), h('path', { key: 'b', d: 'M4 18.5A2.5 2.5 0 0 1 6.5 16H19' })]);
    const IconPlus = () => svg([h('path', { key: 'a', d: 'M12 5v14M5 12h14' })]);
    const IconUpload = () => svg([h('path', { key: 'a', d: 'M12 16V4m0 0L7 9m5-5 5 5' }), h('path', { key: 'b', d: 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3' })]);
    const IconText = () => svg([h('path', { key: 'a', d: 'M5 5h14M5 9h14M5 13h10M5 17h7' })]);
    const IconClose = () => svg([h('path', { key: 'a', d: 'M6 6l12 12M18 6L6 18' })]);
    const IconTrash = () => svg([h('path', { key: 'a', d: 'M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13' })]);
    const IconSpark = () => svg([h('path', { key: 'a', d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' })]);
    const IconChevron = () => svg([h('path', { key: 'a', d: 'M7 10l5 5 5-5' })]);
    const IconRefresh = () => svg([h('path', { key: 'a', d: 'M20 12a8 8 0 1 1-2.3-5.7' }), h('path', { key: 'b', d: 'M20 4v5h-5' })]);
    const IconGlobe = () => svg([h('circle', { key: 'a', cx: 12, cy: 12, r: 8 }), h('path', { key: 'b', d: 'M4 12h16M12 4c2.2 2.2 3.3 5 3.3 8s-1.1 5.8-3.3 8c-2.2-2.2-3.3-5-3.3-8S9.8 6.2 12 4z' })]);
    const IconGear = () => svg([h('circle', { key: 'a', cx: 12, cy: 12, r: 3 }), h('path', { key: 'b', d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' })]);

    const KIND_ICON = {
      pdf: h('span', { className: 'dshkb-kind dshkb-kind-pdf' }, 'PDF'),
      html: h('span', { className: 'dshkb-kind dshkb-kind-html' }, 'HTML'),
      markdown: h('span', { className: 'dshkb-kind dshkb-kind-md' }, 'MD'),
      text: h('span', { className: 'dshkb-kind dshkb-kind-txt' }, 'TXT'),
      epub: h('span', { className: 'dshkb-kind dshkb-kind-eb' }, 'EPUB'),
      docx: h('span', { className: 'dshkb-kind dshkb-kind-doc' }, 'DOC'),
      image: h('span', { className: 'dshkb-kind dshkb-kind-img' }, 'IMG'),
      json: h('span', { className: 'dshkb-kind dshkb-kind-txt' }, 'JSON'),
      csv: h('span', { className: 'dshkb-kind dshkb-kind-txt' }, 'CSV'),
      other: h('span', { className: 'dshkb-kind dshkb-kind-other' }, 'FILE'),
    };

    // ------------------------------------------------------------------- store

    const listeners = new Set();
    const activeDocks = new Set();
    let state = {
      picker: null,
      sessionId: null,
      kbs: [],
      stats: null,
      binding: null,
      activeKbId: null,
      docs: [],
      docsKbId: null,
      activeKind: 'all',
      loading: false,
      loadedAt: 0,
      error: null,
      jobs: {},
      dialog: null,
      preview: null,
      toast: null,
      confirm: null,
      batch: null,
      editingTitle: false,
      draftTitle: '',
      revision: 0,
    };

    function getState() {
      return state;
    }

    function setState(patch) {
      state = { ...state, ...patch, revision: state.revision + 1 };
      for (const listener of [...listeners]) listener();
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    const useSyncExternalStore =
      React.useSyncExternalStore ||
      function fallback(subscribeFn, getSnapshot) {
        const [value, setValue] = React.useState(getSnapshot);
        React.useEffect(() => subscribeFn(() => setValue(getSnapshot())), [subscribeFn]);
        return value;
      };

    function useAppState() {
      return useSyncExternalStore(subscribe, getState);
    }

    let toastTimer = null;
    function toast(message, tone) {
      setState({ toast: { message, tone: tone || 'info' } });
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setState({ toast: null }), 4200);
    }

    // --------------------------------------------------------------------- api

    async function api(method, body) {
      const response = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body === undefined ? {} : body),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`接口 ${method} 返回了非 JSON 响应（HTTP ${response.status}）`);
      }
      if (payload === null || payload.ok !== true) {
        const message = payload && payload.error ? payload.error.message : `HTTP ${response.status}`;
        throw new Error(message);
      }
      return payload.value;
    }

    function rawUrl(kbId, docId) {
      return `${API}/raw?kbId=${encodeURIComponent(kbId)}&docId=${encodeURIComponent(docId)}`;
    }

    function bytesLabel(bytes) {
      const size = Number(bytes) || 0;
      if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
      if (size >= 1024) return `${Math.round(size / 1024)} KB`;
      return `${size} B`;
    }

    function timeLabel(iso) {
      if (typeof iso !== 'string' || iso === '') return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (value) => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    // --------------------------------------------------------------- data flow

    let overviewInFlight = null;
    let overviewAgain = false;
    let docsRequestId = 0;

    function refreshOverview(force) {
      if (overviewInFlight !== null) {
        if (force === true) overviewAgain = true;
        return overviewInFlight;
      }
      overviewInFlight = doRefreshOverview(force === true).finally(() => {
        overviewInFlight = null;
        if (overviewAgain) {
          overviewAgain = false;
          void refreshOverview(true);
        }
      });
      return overviewInFlight;
    }

    async function doRefreshOverview(force) {
      if (!force && state.loadedAt !== 0 && Date.now() - state.loadedAt < 2500) return;
      setState({ loading: true, error: null });
      try {
        const value = await api('overview', { sessionId: state.sessionId });
        let activeKbId = state.activeKbId;
        if (!value.kbs.some((kb) => kb.id === activeKbId)) {
          activeKbId = value.binding && value.binding.kbId ? value.binding.kbId : value.kbs.length > 0 ? value.kbs[0].id : null;
        }
        setState({
          kbs: value.kbs,
          stats: value.stats,
          binding: value.binding,
          activeKbId,
          loading: false,
          loadedAt: Date.now(),
        });
        // 面板可能在上次关闭时错过了任务开始；用 host 的 running 列表补种。
        const running = Array.isArray(value.running) ? value.running : [];
        for (const job of running) {
          const known = state.jobs[job.docId];
          if (known === undefined || known.status !== 'running') trackJob(job);
        }
        if (activeKbId !== null) await refreshDocs(activeKbId, true);
        else setState({ docs: [], docsKbId: null });
      } catch (error) {
        setState({ loading: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    async function refreshDocs(kbId, force) {
      if (kbId === undefined || kbId === null) return;
      if (!force && state.docsKbId === kbId) return;
      // 用请求令牌代替「比对旧 docsKbId」：切库时旧库回包必须丢弃，新库回包必须落地。
      const requestId = ++docsRequestId;
      try {
        const docs = await api('docs.list', { kbId });
        if (requestId !== docsRequestId) return;
        setState({ docs, docsKbId: kbId });
      } catch (error) {
        if (requestId === docsRequestId) toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    async function bindTo(kbId) {
      if (state.sessionId === null) {
        toast(t('panel.noSession'), 'warn');
        return;
      }
      try {
        const value = await api('bind.set', { sessionId: state.sessionId, kbId });
        setState({ binding: value && value.kbId ? { kbId: value.kbId, title: value.title } : null, loadedAt: 0 });
        toast(value && value.kbId ? t('bind.done', { title: value.title }) : t('bind.cleared'));
        await refreshOverview(true);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    function openLibrary() {
      setState({ dialog: null, confirm: null, picker: null });
      const layout =
        pluginCtx === null
          ? null
          : pluginCtx.layout !== undefined
            ? pluginCtx.layout
            : typeof pluginCtx.get === 'function'
              ? pluginCtx.get('layout')
              : null;
      if (layout !== null && layout !== undefined && typeof layout.selectPanel === 'function') {
        layout.selectPanel(PANEL_ID);
      }
    }

    function openPicker(event) {
      const rect = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null;
      const width = 288;
      const viewport = typeof window === 'undefined' ? 1280 : window.innerWidth;
      const left = rect === null ? 24 : Math.max(12, Math.min(rect.left, viewport - width - 12));
      const top = rect === null ? 64 : rect.bottom + 6;
      setState({ picker: { top, left } });
      void refreshOverview(false);
    }

    function closePicker() {
      setState({ picker: null });
    }

    // ------------------------------------------------------------ job polling

    const pollers = new Map();

    function trackJob(job) {
      if (job === null || job === undefined) return;
      setState({ jobs: { ...state.jobs, [job.docId]: job } });
      if (pollers.has(job.id)) return;
      const tick = async () => {
        try {
          const current = await api('job.get', { id: job.id });
          setState({ jobs: { ...state.jobs, [current.docId]: current } });
          if (current.status === 'running') {
            setTimeout(tick, 1200);
            return;
          }
          pollers.delete(job.id);
          if (current.status === 'done') {
            await refreshDocs(state.activeKbId, true);
            await refreshOverview(true);
          } else if (current.status === 'error') {
            toast(`${current.title || ''}：${current.error ? current.error.message : '转化失败'}`, 'error');
            await refreshDocs(state.activeKbId, true);
          } else if (current.status === 'cancelled') {
            await refreshDocs(state.activeKbId, true);
          }
        } catch (error) {
          pollers.delete(job.id);
          // 任务记录已过期（比如面板重开、进程重启）时不要报红色错误，刷新一下列表即可。
          if (state.activeKbId !== null) await refreshDocs(state.activeKbId, true);
          await refreshOverview(true);
          toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'warn');
        }
      };
      pollers.set(job.id, true);
      setTimeout(tick, 700);
    }

    async function convertDoc(doc, force) {
      if (doc === null) return;
      try {
        const job = await api('doc.convert', { kbId: doc.kbId, docId: doc.id, force: force === true });
        if (job.skipped === true) {
          toast(t('doc.convertNothing'));
          return;
        }
        trackJob(job);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    // -------------------------------------------------------------- components

    function StyleTag() {
      return h('style', null, CSS);
    }

    // 对话标题栏的资料库控件：每个对话最上方都能看到当前绑定并一键更换。
    function HeaderChip(props) {
      const app = useAppState();
      // 会话槽的 standardProps 里是 sessionId；ownerProps 里还有 session 快照，两者都兼容。
      const sessionId =
        (props && props.sessionId) ||
        (props && props.session && (props.session.id || props.session.sessionId)) ||
        null;

      React.useEffect(() => {
        if (sessionId !== null) {
          activeDocks.add(sessionId);
          if (state.sessionId !== sessionId) setState({ sessionId, binding: null, loadedAt: 0 });
          void refreshOverview(true);
        }
        return () => {
          if (sessionId !== null) activeDocks.delete(sessionId);
          const remaining = [...activeDocks];
          // 切到资料库主面板时会话视图会卸载；保留「最后所在会话」作为绑定目标。
          if (remaining.length > 0) setState({ sessionId: remaining[remaining.length - 1] });
        };
      }, [sessionId]);

      const bound = app.binding;
      const loading = app.loadedAt === 0 && app.loading;
      const label = loading ? t('dock.loadingShort') : bound ? bound.title : t('dock.bind');
      const title = loading
        ? t('dock.loadingShort')
        : bound
          ? `${t('dock.bound')}：${bound.title} · ${t('dock.ready', { count: countReady(app.kbs, bound.kbId) })}`
          : t('dock.unbound');

      return h(
        React.Fragment,
        null,
        h(StyleTag),
        h(
          'button',
          {
            type: 'button',
            className: 'dshkb-chip',
            'data-bound': bound ? 'true' : undefined,
            title,
            'aria-label': title,
            onClick: (event) => openPicker(event),
          },
          h('span', { className: 'dshkb-chip-icon' }, h(IconBook)),
          h('span', { className: 'dshkb-chip-label' }, label),
          bound ? h('span', { className: 'dshkb-chip-dot', 'aria-hidden': 'true' }) : null,
        ),
      );
    }

    function countReady(kbs, kbId) {
      const kb = (kbs || []).find((item) => item.id === kbId);
      return kb ? kb.readyCount : 0;
    }

    // 侧边栏「全局面板」图标：点击由宿主切到 main 槽里 key=PANEL_ID 的面板。
    function SidebarPanelIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20;
      return h('span', { className: 'dshkb-panel-icon', style: { width: size, height: size } }, h(IconBook));
    }

    function LibraryPage() {
      const app = useAppState();
      const [renaming, setRenaming] = React.useState(false);
      const [titleDraft, setTitleDraft] = React.useState('');

      React.useEffect(() => {
        void refreshOverview(false);
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          if (state.preview !== null) setState({ preview: null });
          else if (state.dialog !== null) setState({ dialog: null });
        };
        window.addEventListener('keydown', onKey);
        return () => {
          window.removeEventListener('keydown', onKey);
          // 离开主面板时收起模态，避免下次进来残留旧对话框。
          setState({ dialog: null, preview: null, confirm: null });
        };
      }, []);

      React.useEffect(() => {
        if (app.activeKbId !== null) void refreshDocs(app.activeKbId, false);
      }, [app.activeKbId]);

      const kb = app.kbs.find((item) => item.id === app.activeKbId) || null;
      // 切库时旧文档会短暂留在 state 里；只渲染确实属于当前资料库的那一份。
      const panelDocs = kb !== null && app.docsKbId === kb.id ? app.docs : [];
      const runningCount = panelDocs.filter((doc) => {
        const job = app.jobs[doc.id];
        return job !== undefined && job.status === 'running';
      }).length;
      const batchRunning = app.batch !== null && app.batch.status === 'running';

      // 右侧文件区直接接收拖拽：选中资料库后，文件拖进来就导入并转化。
      const [dragActive, setDragActive] = React.useState(false);
      const [dropProgress, setDropProgress] = React.useState(null);
      const dragDepth = React.useRef(0);
      const dragTimer = React.useRef(null);
      React.useEffect(
        () => () => {
          if (dragTimer.current !== null) clearTimeout(dragTimer.current);
        },
        [],
      );
      const hasFiles = (event) => Boolean(event.dataTransfer && Array.from(event.dataTransfer.types || []).indexOf('Files') >= 0);
      const clearDragTimer = () => {
        if (dragTimer.current !== null) {
          clearTimeout(dragTimer.current);
          dragTimer.current = null;
        }
      };
      const onDragEnter = (event) => {
        if (kb === null || !hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        clearDragTimer();
        dragDepth.current += 1;
        setDragActive(true);
      };
      const onDragOver = (event) => {
        if (kb === null || !hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
      };
      const onDragLeave = (event) => {
        if (!hasFiles(event)) return;
        event.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current > 0) return;
        // 子元素之间移动会连续触发 enter/leave，用短延时避免遮罩闪烁。
        clearDragTimer();
        dragTimer.current = setTimeout(() => {
          dragTimer.current = null;
          setDragActive(false);
        }, 150);
      };
      const onDrop = async (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        clearDragTimer();
        dragDepth.current = 0;
        setDragActive(false);
        if (kb === null) return;
        const files = Array.from(event.dataTransfer.files || []).filter((file) => file.size > 0);
        if (files.length === 0) return;
        setDropProgress(t('drop.importing', { index: 1, total: files.length, name: files[0].name }));
        const { ok, fail } = await importFilesToLibrary(kb, files, {
          autoConvert: true,
          onProgress: (state) => {
            setDropProgress(
              state.phase === 'upload'
                ? t('drop.importing', { index: state.index, total: state.total, name: state.name })
                : t('drop.converting', { index: state.index, total: state.total, name: state.name }),
            );
          },
        });
        setDropProgress(null);
        toast(fail > 0 ? t('import.done', { ok, fail }) : t('drop.done', { ok, name: kb.title }));
        await refreshDocs(kb.id, true);
        await refreshOverview(true);
      };

      return h(
        React.Fragment,
        null,
        h(StyleTag),
        h(
          'div',
          { className: 'dshkb-page' },
          h(
            'div',
            { className: 'dshkb-page-body' },
            // left column
            h(
              'aside',
              { className: 'dshkb-left' },
              h(
                'div',
                { className: 'dshkb-left-head' },
                h('div', { className: 'dshkb-left-title' }, h('span', { className: 'dshkb-left-icon' }, h(IconBook)), t('panel.title')),
                h(
                  'div',
                  { className: 'dshkb-left-tools' },
                  h('button', { type: 'button', className: 'dshkb-icon-btn', title: t('settings.title'), 'aria-label': t('settings.title'), onClick: () => setState({ dialog: 'settings' }) }, h(IconGear)),
                  h('button', { type: 'button', className: 'dshkb-icon-btn', title: t('panel.new'), 'aria-label': t('panel.new'), onClick: () => setState({ dialog: 'create-kb' }) }, h(IconPlus)),
                ),
              ),
              h(
                'div',
                { className: 'dshkb-kb-list' },
                app.kbs.length === 0 && !app.loading
                  ? h('div', { className: 'dshkb-empty-note' }, t('panel.emptyShort'))
                  : app.kbs.map((item) =>
                      h(
                        'button',
                        {
                          key: item.id,
                          type: 'button',
                          className: item.id === app.activeKbId ? 'dshkb-kb-row dshkb-kb-row-active' : 'dshkb-kb-row',
                          onClick: () => setState({ activeKbId: item.id, activeKind: 'all', confirm: null }),
                          title: item.title,
                        },
                        h('span', { className: 'dshkb-kb-name' }, item.title),
                        h(
                          'span',
                          { className: 'dshkb-kb-meta' },
                          t('panel.docs', { count: item.docCount }),
                          item.pendingCount > 0 ? h('span', { className: 'dshkb-kb-pending' }, t('panel.pending', { count: item.pendingCount })) : null,
                        ),
                        app.binding !== null && app.binding.kbId === item.id ? h('span', { className: 'dshkb-kb-dot', title: t('panel.boundHere') }) : null,
                      ),
                    ),
              ),
              h(
                'div',
                { className: 'dshkb-left-foot' },
                // 绑定只发生在对话标题栏；资料库页面只负责整理资料。
                app.stats ? h('div', { className: 'dshkb-datadir', title: app.stats.dataDir }, t('panel.dataDir', { dir: shortDir(app.stats.dataDir) })) : null,
              ),
            ),
            // right column
            h(
              'section',
              { className: 'dshkb-right', onDragEnter, onDragOver, onDragLeave, onDrop },
              h(
                'header',
                { className: 'dshkb-right-head' },
                h(
                  'div',
                  { className: 'dshkb-right-titles' },
                  renaming && kb !== null
                    ? h(
                        'form',
                        {
                          className: 'dshkb-rename-form',
                          onSubmit: (event) => {
                            event.preventDefault();
                            const next = titleDraft.trim();
                            if (next === '') return;
                            api('kb.update', { kbId: kb.id, title: next })
                              .then(() => {
                                setRenaming(false);
                                return refreshOverview(true);
                              })
                              .catch((error) => toast(t('common.failed', { message: error.message }), 'error'));
                          },
                        },
                        h('input', { className: 'dshkb-input', value: titleDraft, onChange: (event) => setTitleDraft(event.target.value), autoFocus: true, maxLength: 60 }),
                        h('button', { type: 'submit', className: 'dshkb-btn dshkb-btn-primary' }, 'OK'),
                        h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', onClick: () => setRenaming(false) }, t('panel.cancel')),
                      )
                    : h(
                        'div',
                        { className: 'dshkb-title-row' },
                        h(
                          'h2',
                          { className: 'dshkb-kb-title', onDoubleClick: () => { if (kb !== null) { setTitleDraft(kb.title); setRenaming(true); } }, title: t('panel.rename') },
                          kb === null ? t('panel.title') : kb.title,
                        ),
                        kb !== null
                          ? h(
                              'button',
                              {
                                type: 'button',
                                className: 'dshkb-title-action',
                                title: t('panel.convertAllHint'),
                                disabled: app.batch !== null && app.batch.status === 'running',
                                onClick: () => startLibraryFull(kb),
                              },
                              t('panel.convertAll'),
                            )
                          : null,
                      ),
                  h('p', { className: 'dshkb-kb-sub' }, kb === null ? t('panel.subtitle') : kb.description || t('panel.subtitle')),
                ),
                h(
                  'div',
                  { className: 'dshkb-head-actions' },
                  runningCount > 0 ? h('span', { className: 'dshkb-running-chip', role: 'status' }, t('doc.runningCount', { count: runningCount })) : null,
                  app.batch !== null
                    ? h(
                        'span',
                        { className: 'dshkb-running-chip', role: 'status' },
                        t('panel.batchChip', { done: app.batch.done, total: app.batch.total, percent: app.batch.percent }),
                        app.batch.status === 'running'
                          ? h('button', { type: 'button', className: 'dshkb-chip-cancel', onClick: cancelBatch }, t('doc.cancel'))
                          : null,
                      )
                    : null,
                  kb !== null
                    ? h(
                        React.Fragment,
                        null,
                        h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-primary', onClick: () => setState({ dialog: 'import' }) }, h('span', { className: 'dshkb-btn-icon' }, h(IconUpload)), t('panel.import')),
                        h('button', { type: 'button', className: 'dshkb-btn', onClick: () => setState({ dialog: 'url' }) }, h('span', { className: 'dshkb-btn-icon' }, h(IconGlobe)), t('panel.url')),
                        h('button', { type: 'button', className: 'dshkb-btn', onClick: () => setState({ dialog: 'paste' }) }, h('span', { className: 'dshkb-btn-icon' }, h(IconText)), t('panel.paste')),
                        h('button', { type: 'button', className: 'dshkb-icon-btn', title: t('panel.rename'), 'aria-label': t('panel.rename'), onClick: () => { setTitleDraft(kb.title); setRenaming(true); } }, h('span', { className: 'dshkb-pencil' }, '✎')),
                        app.confirm === `kb:${kb.id}`
                          ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-danger', onClick: () => deleteKb(kb) }, t('panel.confirmDeleteKb'))
                          : h('button', { type: 'button', className: 'dshkb-icon-btn dshkb-icon-danger', title: t('panel.deleteKb'), 'aria-label': t('panel.deleteKb'), onClick: () => setState({ confirm: `kb:${kb.id}` }) }, h(IconTrash)),
                      )
                    : null,
                ),
              ),
              kb === null
                ? h(
                    'div',
                    { className: 'dshkb-body-empty' },
                    h(
                      'div',
                      { className: 'dshkb-empty-card' },
                      h('div', { className: 'dshkb-empty-art' }, h(IconBook)),
                      h('p', null, t('panel.empty')),
                      h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-primary', onClick: () => setState({ dialog: 'create-kb' }) }, t('panel.create')),
                    ),
                  )
                : h(
                    React.Fragment,
                    null,
                    h(KindTabs, { docs: panelDocs, activeKind: app.activeKind, onChange: (kind) => setState({ activeKind: kind }) }),
                    h(DocList, { app, kb, docs: panelDocs }),
                  ),
              dragActive && kb !== null
                ? h(
                    'div',
                    { className: 'dshkb-drop-overlay', 'aria-hidden': 'true' },
                    h(
                      'div',
                      { className: 'dshkb-drop-overlay-card' },
                      h('span', { className: 'dshkb-drop-overlay-icon' }, h(IconUpload)),
                      h('strong', null, t('drop.title', { kb: kb.title })),
                      h('span', { className: 'dshkb-drop-overlay-hint' }, t('drop.hint')),
                    ),
                  )
                : null,
              dropProgress !== null ? h('div', { className: 'dshkb-drop-progress', role: 'status' }, dropProgress) : null,
              app.error !== null ? h('div', { className: 'dshkb-error-bar', role: 'alert' }, app.error, h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', onClick: () => refreshOverview(true) }, t('common.retry'))) : null,
            ),
          ),
          app.dialog === 'create-kb' ? h(CreateKbDialog, null) : null,
          app.dialog === 'settings' ? h(SettingsDialog, null) : null,
          app.dialog === 'import' ? h(ImportDialog, { kb }) : null,
          app.dialog === 'paste' ? h(PasteDialog, { kb }) : null,
          app.dialog === 'url' ? h(UrlDialog, { kb }) : null,
          app.preview !== null ? h(PreviewDialog, { preview: app.preview, kb }) : null,
        ),
      );
    }

    function ToastLayer() {
      const app = useAppState();
      if (app.toast === null) return null;
      return h(React.Fragment, null, h(StyleTag), h('div', { className: `dshkb-toast dshkb-toast-${app.toast.tone}`, role: 'status' }, app.toast.message));
    }

    // 标题栏点「绑定」时贴着按钮弹出的小选择器；不离开当前对话。
    function BindPicker() {
      const app = useAppState();

      React.useEffect(() => {
        if (app.picker === null) return;
        const onKey = (event) => {
          if (event.key === 'Escape') closePicker();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [app.picker]);

      if (app.picker === null) return null;
      const style = { top: `${app.picker.top}px`, left: `${app.picker.left}px` };

      return h(
        React.Fragment,
        null,
        h(StyleTag),
        h('div', { className: 'dshkb-picker-backdrop', onMouseDown: closePicker }),
        h(
          'div',
          { className: 'dshkb-picker', style, role: 'dialog', 'aria-label': t('dock.bound') },
          h('div', { className: 'dshkb-picker-title' }, t('dock.bound')),
          app.kbs.length === 0 && !app.loading
            ? h('div', { className: 'dshkb-picker-empty' }, t('panel.empty'))
            : app.kbs.map((kb) =>
                h(
                  'button',
                  {
                    key: kb.id,
                    type: 'button',
                    className: 'dshkb-picker-row',
                    onClick: () => {
                      void bindTo(kb.id).then(closePicker);
                    },
                  },
                  h('span', { className: 'dshkb-picker-name' }, kb.title),
                  h('span', { className: 'dshkb-picker-meta' }, t('dock.ready', { count: kb.readyCount })),
                  app.binding !== null && app.binding.kbId === kb.id ? h('span', { className: 'dshkb-picker-check', 'aria-hidden': 'true' }, '✓') : null,
                ),
              ),
          h(
            'div',
            { className: 'dshkb-picker-foot' },
            app.binding !== null
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshkb-btn dshkb-btn-quiet dshkb-btn-small',
                    onClick: () => {
                      void bindTo(null).then(closePicker);
                    },
                  },
                  t('dock.unbind'),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dshkb-btn dshkb-btn-quiet dshkb-btn-small',
                onClick: () => {
                  closePicker();
                  openLibrary();
                },
              },
              t('dock.manage'),
            ),
          ),
        ),
      );
    }

    function shortDir(dir) {
      const value = String(dir || '');
      if (value.length <= 42) return value;
      return `…${value.slice(value.length - 41)}`;
    }

    async function deleteKb(kb) {
      try {
        await api('kb.delete', { kbId: kb.id });
        setState({ activeKbId: null, confirm: null, docs: [] });
        await refreshOverview(true);
        toast(`已删除「${kb.title}」`);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    const KIND_ORDER = ['pdf', 'html', 'markdown', 'text', 'epub', 'docx', 'image', 'other'];
    const KIND_ALIAS = { json: 'text', csv: 'text' };

    function kindOf(doc) {
      return KIND_ALIAS[doc.kind] || doc.kind || 'other';
    }

    function KindTabs(props) {
      const counts = { all: props.docs.length };
      for (const doc of props.docs) {
        const kind = kindOf(doc);
        counts[kind] = (counts[kind] || 0) + 1;
      }
      const tabs = ['all', ...KIND_ORDER.filter((kind) => (counts[kind] || 0) > 0)];
      return h(
        'div',
        { className: 'dshkb-tabs', role: 'tablist' },
        tabs.map((kind) =>
          h(
            'button',
            {
              key: kind,
              type: 'button',
              role: 'tab',
              'aria-selected': props.activeKind === kind,
              className: props.activeKind === kind ? 'dshkb-tab dshkb-tab-active' : 'dshkb-tab',
              onClick: () => props.onChange(kind),
            },
            t(`tab.${kind}`),
            h('span', { className: 'dshkb-tab-count' }, counts[kind] || 0),
          ),
        ),
      );
    }

    function DocList({ app, kb, docs: sourceDocs }) {
      const docs = app.activeKind === 'all' ? sourceDocs : sourceDocs.filter((doc) => kindOf(doc) === app.activeKind);
      if (app.docsKbId !== kb.id) {
        return h('div', { className: 'dshkb-body-empty' }, h('p', { className: 'dshkb-muted' }, t('panel.loading')));
      }
      if (sourceDocs.length === 0) {
        return h('div', { className: 'dshkb-body-empty' }, h('div', { className: 'dshkb-empty-card' }, h('div', { className: 'dshkb-empty-art' }, h(IconUpload)), h('p', null, t('panel.emptyDocs'))));
      }
      if (docs.length === 0) return h('div', { className: 'dshkb-body-empty' }, h('p', { className: 'dshkb-muted' }, t('doc.noDocs')));
      return h(
        'div',
        { className: 'dshkb-doc-list' },
        docs.map((doc) => h(DocRow, { key: doc.id, doc, kb, app })),
      );
    }

    function formatThousands(value) {
      return Number(value || 0).toLocaleString('en-US');
    }

    function legacyVision(doc) {
      // 0.3.x 之前视觉转化没有记录页数；这类文档只能整体重新转化。
      return doc.status === 'ready' && doc.conversionMode === 'vision' && doc.totalPages > 0 && !doc.visionPages;
    }

    function partialLabel(doc) {
      if (doc.progressMode === 'vision') return t('doc.partialPages', { done: doc.visionPages || 0, total: doc.totalPages || 0 });
      const total = doc.sourceChars || doc.chars || 0;
      return t('doc.partialChars', { done: formatThousands(doc.textOffset), total: formatThousands(total) });
    }

    async function continueDoc(doc) {
      try {
        const job = await api('doc.continue', { kbId: doc.kbId, docId: doc.id });
        if (job.skipped === true) {
          toast(t('doc.continueNothing'));
          return;
        }
        trackJob(job);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    async function fullConvertDoc(doc) {
      try {
        const job = await api('doc.full', { kbId: doc.kbId, docId: doc.id });
        if (job.skipped === true) {
          toast(t('doc.continueNothing'));
          return;
        }
        toast(t('doc.fullStarted', { pages: doc.totalPages || 0 }));
        trackJob(job);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    // 整个资料库全量转化：一次把未转化 / 只转了一部分的文档跑完。
    async function startLibraryFull(kb) {
      try {
        const job = await api('kb.full', { kbId: kb.id });
        if (job.skipped === true) {
          toast(t('panel.convertAllNone'));
          return;
        }
        const total = job.progress?.total ?? 0;
        toast(t('panel.convertAllStarted', { count: total }));
        setState({ batch: { id: job.id, status: 'running', percent: job.percent ?? 0, done: 0, total } });
        trackBatchJob(job.id);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    function trackBatchJob(jobId) {
      const tick = async () => {
        try {
          const current = await api('job.get', { id: jobId });
          setState({
            batch: {
              id: jobId,
              status: current.status,
              percent: current.percent ?? 0,
              done: current.progress?.done ?? 0,
              total: current.progress?.total ?? 0,
            },
          });
          // 每轮刷新文档行，用户能看到逐篇完成。
          if (state.activeKbId !== null) await refreshDocs(state.activeKbId, true);
          if (current.status === 'running') {
            setTimeout(tick, 1500);
            return;
          }
          const failed = Array.isArray(current.result?.failed) ? current.result.failed.length : 0;
          toast(
            current.status === 'done'
              ? t('panel.convertAllDone', { ok: Math.max(0, (current.progress?.total ?? 0) - failed), fail: failed })
              : t('panel.convertAllStopped'),
          );
          await refreshOverview(true);
          setTimeout(() => setState({ batch: null }), 4000);
        } catch (error) {
          setState({ batch: null });
          toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
        }
      };
      setTimeout(tick, 800);
    }

    async function revealDoc(doc) {
      try {
        const value = await api('doc.reveal', { kbId: doc.kbId, docId: doc.id, target: 'markdown' });
        if (value.hint) toast(value.hint);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    async function repairDoc(doc) {
      try {
        const job = await api('doc.repair', { kbId: doc.kbId, docId: doc.id });
        toast(t('doc.repairStarted'));
        trackJob(job);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    async function visionExtractDoc(doc, rebuild) {
      try {
        const body = rebuild
          ? { kbId: doc.kbId, docId: doc.id, force: true, full: true, forceVision: true }
          : { kbId: doc.kbId, docId: doc.id, forceVision: true };
        const job = await api('doc.convert', body);
        if (job.skipped === true) {
          toast(t('doc.convertNothing'));
          return;
        }
        toast(rebuild === true ? t('doc.visionRebuildStarted') : t('doc.visionExtractStarted'));
        trackJob(job);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    const VISION_FULL_HINTS = /(残缺|残片|缺失|乱码|无法辨认|无法识别|OCR|残损|不全|incomplete|garbled|unreadable)/i;

    // 文本转化结果明显不可靠（摘要自述残缺、OCR 残片、或内容远少于源文本）→ 建议整篇视觉重做。
    function needsVisionFull(doc) {
      if (doc.kind !== 'pdf' && doc.kind !== 'image') return false;
      if (doc.conversionMode === 'vision') return false;
      if (doc.status !== 'ready') return false;
      if (VISION_FULL_HINTS.test(`${doc.title} ${doc.summary ?? ''}`)) return true;
      const source = typeof doc.sourceChars === 'number' ? doc.sourceChars : 0;
      return source > 2000 && doc.chars > 0 && doc.chars < source * 0.55;
    }

    function needsVision(doc) {
      if (doc.kind !== 'pdf' && doc.kind !== 'image') return false;
      if (doc.conversionMode === 'vision') return false;
      const quality = typeof doc.textQuality === 'number' ? doc.textQuality : 1;
      return quality <= 0 || quality < 0.9;
    }

    async function visionFullDoc(doc) {
      try {
        const job = await api('doc.convert', { kbId: doc.kbId, docId: doc.id, force: true, full: true, forceVision: true });
        if (job.skipped === true) {
          toast(t('doc.convertNothing'));
          return;
        }
        toast(t('doc.visionFullStarted', { pages: doc.totalPages || 0 }));
        trackJob(job);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    async function openConverted(doc) {
      const kbId = doc.kbId;
      setState({ preview: { doc, kbId, loading: true, text: '', html: null, tab: 'text', mode: 'converted', truncated: false, error: null } });
      try {
        const value = await api('doc.markdown', { kbId, docId: doc.id });
        setState({
          preview: {
            doc: { ...doc, model: value.doc?.model ?? doc.model },
            kbId,
            loading: false,
            text: value.text,
            html: null,
            tab: 'text',
            mode: 'converted',
            truncated: value.truncated === true,
            error: value.text === '' ? t('preview.empty') : null,
          },
        });
      } catch (error) {
        setState({
          preview: { doc, kbId, loading: false, text: '', html: null, tab: 'text', mode: 'converted', truncated: false, error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    function elapsedText(startedAt) {
      const started = new Date(startedAt).getTime();
      if (!Number.isFinite(started)) return '';
      const seconds = Math.max(0, Math.round((Date.now() - started) / 1000));
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      return minutes < 60 ? `${minutes}m${String(rest).padStart(2, '0')}s` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
    }

    function phaseLabel(phase) {
      switch (phase) {
        case 'reading':
          return t('phase.reading');
        case 'extract':
          return t('phase.extract');
        case 'images':
          return t('phase.images');
        case 'vision':
          return t('phase.vision');
        case 'verify':
          return t('phase.verify');
        case 'saved':
          return t('phase.saved');
        default:
          return t('phase.model');
      }
    }

    // 转化进度条：阶段 + 完成度 + 已用时间，轮询每次刷新都会重算。
    function ConvertProgress({ job }) {
      if (job === undefined || job.status !== 'running') return null;
      const percent = Number.isFinite(job.percent) ? job.percent : 0;
      const progress = job.progress ?? {};
      const total = Number(progress.total) || 0;
      const done = Number(progress.done) || 0;
      const detail = total > 1 ? `${done}/${total}` : '';
      return h(
        'div',
        { className: 'dshkb-conv', role: 'progressbar', 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div', { className: 'dshkb-conv-bar' }, h('span', { className: 'dshkb-conv-fill', style: { width: `${Math.max(3, percent)}%` } })),
        h(
          'div',
          { className: 'dshkb-conv-meta' },
          h('span', null, `${phaseLabel(progress.phase)}${detail === '' ? '' : ` ${detail}`}`),
          h('span', { className: 'dshkb-dot' }, '·'),
          h('span', null, `${percent}%`),
          job.startedAt ? h('span', { className: 'dshkb-dot' }, '·') : null,
          job.startedAt ? h('span', null, t('doc.elapsed', { time: elapsedText(job.startedAt) })) : null,
        ),
      );
    }

    function DocRow({ doc, kb, app }) {
      const job = app.jobs[doc.id];
      const converting = job !== undefined && job.status === 'running';
      const showError = doc.status !== 'ready' && typeof doc.error === 'string' && doc.error !== '';
      const statusLabel = doc.status === 'ready' ? t('doc.ready') : showError ? t('doc.error') : doc.hasText ? t('doc.imported') : t('doc.pending');
      const confirming = app.confirm === `doc:${doc.id}`;
      const open = () => openPreview(doc);
      return h(
        'div',
        { className: 'dshkb-doc-row' },
        h(
          'div',
          {
            className: 'dshkb-doc-hit',
            role: 'button',
            tabIndex: 0,
            title: t('doc.doubleClick'),
            onDoubleClick: open,
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
              }
            },
          },
          h('span', { className: 'dshkb-doc-icon' }, KIND_ICON[doc.kind] || KIND_ICON.other),
          h(
            'div',
            { className: 'dshkb-doc-main' },
            h('div', { className: 'dshkb-doc-title' }, doc.title),
            h(
              'div',
              { className: 'dshkb-doc-meta' },
              h('span', null, t(`tab.${kindOf(doc)}`)),
              h('span', { className: 'dshkb-dot' }, '·'),
              h('span', null, `${doc.chars} 字符`),
              h('span', { className: 'dshkb-dot' }, '·'),
              h('span', null, bytesLabel(doc.bytes)),
              h('span', { className: 'dshkb-dot' }, '·'),
              h('span', null, timeLabel(doc.addedAt)),
              doc.conversionMode === 'vision' ? h('span', { className: 'dshkb-doc-tags' }, t('doc.vision')) : null,
              doc.tags.length > 0 ? h('span', { className: 'dshkb-doc-tags' }, doc.tags.slice(0, 3).join(' / ')) : null,
            ),
            doc.summary !== '' ? h('div', { className: 'dshkb-doc-summary' }, doc.summary) : null,
            converting ? h(ConvertProgress, { job }) : null,
            showError ? h('div', { className: 'dshkb-doc-error' }, doc.error) : doc.status !== 'ready' && doc.note ? h('div', { className: 'dshkb-doc-note' }, doc.note) : null,
            doc.partial ? h('div', { className: 'dshkb-doc-partial' }, partialLabel(doc)) : null,
            needsVisionFull(doc)
              ? h('div', { className: 'dshkb-doc-partial' }, t('doc.visionFullNote'))
              : needsVision(doc) && doc.status === 'ready'
                ? h('div', { className: 'dshkb-doc-partial' }, t('doc.visionQualityLow', { percent: Math.round((doc.textQuality || 0) * 100) }))
                : null,
            legacyVision(doc) ? h('div', { className: 'dshkb-doc-partial' }, t('doc.legacyVision', { total: doc.totalPages })) : null,
            doc.legacyText ? h('div', { className: 'dshkb-doc-partial' }, t('doc.legacyText')) : null,
            doc.visionCheck && doc.visionCheck.ok === false
              ? h('div', { className: 'dshkb-doc-error' }, t('doc.visionIssues', { issues: doc.visionCheck.issues.join('；') }))
              : doc.visionCheck && doc.visionCheck.ok === true
                ? h('div', { className: 'dshkb-doc-note' }, t('doc.visionChecked'))
                : null,
          ),
        ),
        h(
          'span',
          { className: 'dshkb-doc-side' },
          h('span', { className: `dshkb-status dshkb-status-${doc.status === 'ready' ? 'ready' : showError ? 'error' : 'pending'}` }, converting ? t('doc.converting') : statusLabel),
          doc.status === 'ready' ? h('button', { type: 'button', className: 'dshkb-link-btn', onClick: () => openConverted(doc) }, t('doc.openConverted')) : null,
          doc.partial ? h('button', { type: 'button', className: 'dshkb-link-btn dshkb-link-strong', onClick: () => continueDoc(doc) }, t('doc.continue')) : null,
          doc.partial && doc.totalPages > 0
            ? h('button', { type: 'button', className: 'dshkb-link-btn dshkb-link-strong', title: t('doc.fullHint', { total: doc.totalPages }), onClick: () => fullConvertDoc(doc) }, t('doc.full'))
            : null,
          doc.visionCheck && doc.visionCheck.ok === false
            ? h('button', { type: 'button', className: 'dshkb-link-btn dshkb-link-strong', title: t('doc.repairHint'), onClick: () => repairDoc(doc) }, t('doc.repair'))
            : null,
          needsVisionFull(doc)
            ? h('button', { type: 'button', className: 'dshkb-link-btn dshkb-link-strong', title: t('doc.visionFullHint'), onClick: () => visionFullDoc(doc) }, t('doc.visionFull'))
            : needsVision(doc)
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshkb-link-btn dshkb-link-strong',
                    title: t('doc.visionExtractHint'),
                    onClick: () => visionExtractDoc(doc, doc.status === 'ready'),
                  },
                  doc.status === 'ready' ? t('doc.visionRebuild') : t('doc.visionExtract'),
                )
              : null,
          legacyVision(doc) ? h('button', { type: 'button', className: 'dshkb-link-btn dshkb-link-strong', onClick: () => convertDoc(doc, true) }, t('doc.reconvert')) : null,
          doc.legacyText ? h('button', { type: 'button', className: 'dshkb-link-btn dshkb-link-strong', onClick: () => convertDoc(doc, true) }, t('doc.reconvert')) : null,
        ),
        h(
          'span',
          { className: 'dshkb-doc-actions' },
          converting
            ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-small dshkb-btn-quiet', onClick: () => cancelConversion(job) }, t('doc.cancel'))
            : doc.status !== 'ready'
              ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-small', onClick: () => convertDoc(doc) }, t('doc.convert'))
              : null,
          h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-small dshkb-btn-quiet', onClick: open }, t('doc.preview')),
          confirming
            ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-small dshkb-btn-danger', onClick: () => deleteDoc(kb, doc) }, t('panel.confirmDeleteDoc'))
            : h('button', { type: 'button', className: 'dshkb-icon-btn dshkb-icon-danger dshkb-icon-small', title: t('doc.delete'), 'aria-label': t('doc.delete'), onClick: () => setState({ confirm: `doc:${doc.id}` }) }, h(IconTrash)),
        ),
      );
    }

    async function cancelConversion(job) {
      try {
        await api('job.cancel', { id: job.id });
        // 立刻在界面上把任务标成已取消，不等下一次轮询。
        if (job.docId !== undefined && job.docId !== null) {
          setState({ jobs: { ...state.jobs, [job.docId]: { ...job, status: 'cancelled', percent: job.percent ?? 0 } } });
          if (state.activeKbId !== null) void refreshDocs(state.activeKbId, true);
        }
        if (state.batch !== null && state.batch.id === job.id) setState({ batch: { ...state.batch, status: 'cancelled' } });
        toast(t('doc.cancelDone'));
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    async function cancelBatch() {
      const batch = state.batch;
      if (batch === null) return;
      try {
        await api('job.cancel', { id: batch.id });
        setState({ batch: { ...batch, status: 'cancelled' } });
        toast(t('panel.convertAllStopped'));
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    async function deleteDoc(kb, doc) {
      try {
        await api('doc.delete', { kbId: kb.id, docId: doc.id });
        setState({ confirm: null });
        await refreshDocs(kb.id, true);
        await refreshOverview(true);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    async function openPreview(doc) {
      const kbId = doc.kbId;
      setState({ preview: { doc, kbId, loading: true, text: '', html: null, tab: doc.kind === 'html' ? 'rendered' : 'text', error: null } });
      try {
        const value = await api('doc.preview', { kbId, docId: doc.id, limit: 200000 });
        let html = null;
        if (doc.kind === 'html') {
          try {
            const raw = await api('doc.rawtext', { kbId, docId: doc.id });
            html = raw.text;
          } catch {
            html = null;
          }
        }
        setState({ preview: { doc: value.doc || doc, kbId, loading: false, text: value.text, html, tab: doc.kind === 'html' ? 'rendered' : 'text', error: null } });
      } catch (error) {
        setState({ preview: { doc, kbId, loading: false, text: '', html: null, tab: 'text', error: error instanceof Error ? error.message : String(error) } });
      }
    }

    function PreviewDialog({ preview, kb }) {
      const doc = preview.doc;
      const link = rawUrl(preview.kbId, doc.id);
      const converted = preview.mode === 'converted';
      const copyText = () => {
        try {
          void navigator.clipboard.writeText(preview.text ?? '');
          toast(t('preview.copied'));
        } catch {
          toast(t('common.failed', { message: 'clipboard' }), 'error');
        }
      };
      return h(
        'div',
        {
          className: 'dshkb-preview-backdrop',
          role: 'dialog',
          'aria-modal': 'true',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) setState({ preview: null });
          },
        },
        h(
          'div',
          { className: 'dshkb-preview-card' },
          h(
            'header',
            { className: 'dshkb-preview-head' },
            h('span', { className: 'dshkb-doc-icon' }, KIND_ICON[doc.kind] || KIND_ICON.other),
            h(
              'div',
              { className: 'dshkb-preview-titles' },
              h('h3', { className: 'dshkb-preview-title' }, converted ? t('preview.convertedTitle', { title: doc.title }) : doc.title),
              h(
                'div',
                { className: 'dshkb-preview-meta' },
                converted
                  ? `${t('preview.convertedMeta')} · ${doc.chars} 字符${doc.model ? ` · ${doc.model}` : ''}`
                  : `${t(`tab.${kindOf(doc)}`)} · ${doc.chars} 字符 · ${timeLabel(doc.addedAt)}${doc.tags.length > 0 ? ` · ${doc.tags.join('、')}` : ''}`,
              ),
            ),
            doc.kind === 'html' && preview.html !== null && !converted
              ? h(
                  'div',
                  { className: 'dshkb-preview-tabs' },
                  h('button', { type: 'button', className: preview.tab === 'rendered' ? 'dshkb-tab dshkb-tab-active' : 'dshkb-tab', onClick: () => setState({ preview: { ...preview, tab: 'rendered' } }) }, t('preview.rendered')),
                  h('button', { type: 'button', className: preview.tab === 'source' ? 'dshkb-tab dshkb-tab-active' : 'dshkb-tab', onClick: () => setState({ preview: { ...preview, tab: 'source' } }) }, t('preview.source')),
                )
              : null,
            converted && preview.text ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', onClick: copyText }, t('preview.copy')) : null,
            converted
              ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', onClick: () => revealDoc(doc) }, t('preview.reveal'))
              : doc.hasRaw
                ? h('a', { className: 'dshkb-btn dshkb-btn-quiet', href: link, target: '_blank', rel: 'noreferrer' }, doc.kind === 'html' ? t('preview.download') : t('preview.open'))
                : null,
            h('button', { type: 'button', className: 'dshkb-icon-btn', title: t('common.close'), 'aria-label': t('common.close'), onClick: () => setState({ preview: null }) }, h(IconClose)),
          ),
          h(
            'div',
            { className: 'dshkb-preview-body' },
            preview.loading
              ? h('div', { className: 'dshkb-empty-note' }, t('preview.loading'))
              : preview.error !== null
                ? h('div', { className: 'dshkb-error-bar', role: 'alert' }, preview.error)
                : converted
                  ? h(
                      'div',
                      { className: 'dshkb-text-wrap' },
                      preview.truncated ? h('div', { className: 'dshkb-preview-note' }, t('preview.truncated')) : null,
                      h('pre', { className: 'dshkb-pre' }, preview.text),
                    )
                  : previewBody(doc, preview, link),
          ),
        ),
      );
    }

    function previewBody(doc, preview, link) {
      if (doc.kind === 'pdf') {
        // 优先用 <object>：Electron 若未启用 PDF 插件会自动显示回退内容，而不是一片空白。
        return h(
          'object',
          { className: 'dshkb-frame', data: link, type: 'application/pdf', title: doc.title },
          h(
            'div',
            { className: 'dshkb-empty-note' },
            t('preview.pdfFallback'),
            ' ',
            h('a', { href: link, target: '_blank', rel: 'noreferrer' }, t('preview.open')),
          ),
        );
      }
      if (doc.kind === 'image') return h('div', { className: 'dshkb-image-wrap' }, h('img', { className: 'dshkb-image', src: link, alt: doc.title }));
      if (doc.kind === 'html') {
        if (preview.tab === 'rendered' && preview.html !== null) {
          return h('iframe', { className: 'dshkb-frame dshkb-frame-html', sandbox: '', srcDoc: preview.html, title: doc.title, referrerPolicy: 'no-referrer' });
        }
        if (preview.tab === 'source' && preview.html !== null) {
          return h('pre', { className: 'dshkb-pre' }, preview.html.slice(0, 300000));
        }
      }
      if (preview.text) {
        return h(
          'div',
          { className: 'dshkb-text-wrap' },
          doc.kind === 'epub' || doc.kind === 'docx' ? h('div', { className: 'dshkb-preview-note' }, t('preview.note')) : null,
          h('pre', { className: 'dshkb-pre' }, preview.text),
        );
      }
      return h('div', { className: 'dshkb-empty-note' }, t('preview.empty'));
    }

    function SettingsDialog() {
      const [form, setForm] = React.useState({
        baseURL: '',
        model: '',
        visionModel: '',
        apiKey: '',
        vision: true,
        verify: true,
        maxImages: 8,
        concurrency: 3,
        rasterScale: 1.5,
      });
      const [hasKey, setHasKey] = React.useState(false);
      const [mask, setMask] = React.useState('');
      const [loading, setLoading] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [testing, setTesting] = React.useState(false);
      const [testResult, setTestResult] = React.useState(null);

      React.useEffect(() => {
        let alive = true;
        api('settings.get')
          .then((value) => {
            if (!alive) return;
            setForm({
              baseURL: value.baseURL ?? '',
              model: value.model ?? '',
              visionModel: value.visionModel ?? '',
              apiKey: '',
              vision: value.vision !== false,
              verify: value.verify !== false,
              maxImages: Number.isFinite(value.maxImages) ? value.maxImages : 8,
              concurrency: Number.isFinite(value.concurrency) ? value.concurrency : 3,
              rasterScale: Number.isFinite(value.rasterScale) ? value.rasterScale : 1.5,
            });
            setHasKey(Boolean(value.hasKey));
            setMask(value.keyMask ?? '');
          })
          .catch((error) => {
            if (alive) toast(t('common.failed', { message: error.message }), 'error');
          })
          .finally(() => {
            if (alive) setLoading(false);
          });
        return () => {
          alive = false;
        };
      }, []);

      const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

      const save = async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          const value = await api('settings.update', {
            baseURL: form.baseURL,
            model: form.model,
            visionModel: form.visionModel,
            vision: form.vision,
            verify: form.verify,
            maxImages: Number(form.maxImages),
            concurrency: Number(form.concurrency),
            rasterScale: Number(form.rasterScale),
            apiKey: form.apiKey,
          });
          setHasKey(Boolean(value.hasKey));
          setMask(value.keyMask ?? '');
          setForm((current) => ({
            ...current,
            baseURL: value.baseURL ?? current.baseURL,
            model: value.model ?? current.model,
            visionModel: value.visionModel ?? current.visionModel,
            vision: value.vision !== false,
            verify: value.verify !== false,
            maxImages: Number.isFinite(value.maxImages) ? value.maxImages : current.maxImages,
            concurrency: Number.isFinite(value.concurrency) ? value.concurrency : current.concurrency,
            rasterScale: Number.isFinite(value.rasterScale) ? value.rasterScale : current.rasterScale,
            apiKey: '',
          }));
          toast(t('settings.saved'));
        } catch (error) {
          toast(t('common.failed', { message: error.message }), 'error');
        } finally {
          setBusy(false);
        }
      };

      const clearKey = async () => {
        try {
          await api('settings.update', { clearKey: true });
          setHasKey(false);
          setMask('');
          toast(t('settings.keyCleared'));
        } catch (error) {
          toast(t('common.failed', { message: error.message }), 'error');
        }
      };

      const test = async () => {
        setTesting(true);
        setTestResult(null);
        try {
          const value = await api('settings.test', { baseURL: form.baseURL, model: form.model, apiKey: form.apiKey });
          setTestResult(value);
        } catch (error) {
          setTestResult({ ok: false, message: error.message });
        } finally {
          setTesting(false);
        }
      };

      return h(
        'div',
        { className: 'dshkb-modal-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) setState({ dialog: null }); } },
        h(
          'form',
          { className: 'dshkb-modal dshkb-modal-wide', onSubmit: save },
          h('h3', { className: 'dshkb-modal-title' }, t('settings.title')),
          h('p', { className: 'dshkb-modal-hint' }, t('settings.hint')),
          loading
            ? h('div', { className: 'dshkb-progress' }, t('panel.loading'))
            : h(
                React.Fragment,
                null,
                h('label', { className: 'dshkb-field' }, h('span', null, t('settings.baseURL')), h('input', { className: 'dshkb-input', value: form.baseURL, onChange: (event) => patch('baseURL', event.target.value), placeholder: 'https://api.deepseek.com/v1' })),
                h('label', { className: 'dshkb-field' }, h('span', null, t('settings.model')), h('input', { className: 'dshkb-input', value: form.model, onChange: (event) => patch('model', event.target.value), placeholder: 'deepseek-chat' })),
                h('label', { className: 'dshkb-field' }, h('span', null, t('settings.visionModel')), h('input', { className: 'dshkb-input', value: form.visionModel, onChange: (event) => patch('visionModel', event.target.value), placeholder: 'qwen-vl-max' })),
                h(
                  'label',
                  { className: 'dshkb-field' },
                  h('span', null, t('settings.apiKey')),
                  h('input', {
                    className: 'dshkb-input',
                    type: 'password',
                    value: form.apiKey,
                    onChange: (event) => patch('apiKey', event.target.value),
                    placeholder: hasKey ? t('settings.keySaved', { mask }) : t('settings.keyMissing'),
                    autoComplete: 'off',
                  }),
                ),
                h(
                  'div',
                  { className: 'dshkb-settings-row' },
                  h('label', { className: 'dshkb-check' }, h('input', { type: 'checkbox', checked: form.vision, onChange: (event) => patch('vision', event.target.checked) }), h('span', null, t('settings.vision'))),
                  h('label', { className: 'dshkb-check' }, h('input', { type: 'checkbox', checked: form.verify, onChange: (event) => patch('verify', event.target.checked) }), h('span', null, t('settings.verify'))),
                  h('label', { className: 'dshkb-check dshkb-check-number' }, h('span', null, t('settings.maxImages')), h('input', { className: 'dshkb-input dshkb-input-number', type: 'number', min: 1, max: 20, value: form.maxImages, onChange: (event) => patch('maxImages', event.target.value) })),
                  h('label', { className: 'dshkb-check dshkb-check-number' }, h('span', null, t('settings.concurrency')), h('input', { className: 'dshkb-input dshkb-input-number', type: 'number', min: 1, max: 6, value: form.concurrency, onChange: (event) => patch('concurrency', event.target.value) })),
                  h('label', { className: 'dshkb-check dshkb-check-number' }, h('span', null, t('settings.rasterScale')), h('input', { className: 'dshkb-input dshkb-input-number', type: 'number', min: 1, max: 2.5, step: 0.1, value: form.rasterScale, onChange: (event) => patch('rasterScale', event.target.value) })),
                ),
                testResult !== null
                  ? h(
                      'div',
                      { className: testResult.ok ? 'dshkb-test-ok' : 'dshkb-test-fail', role: 'status' },
                      testResult.ok ? t('settings.testOk', { ms: testResult.latencyMs, model: testResult.model }) : t('settings.testFail', { message: testResult.message }),
                    )
                  : null,
              ),
          h(
            'div',
            { className: 'dshkb-modal-actions' },
            hasKey ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet dshkb-btn-danger-text', disabled: busy, onClick: clearKey }, t('settings.clearKey')) : null,
            h('button', { type: 'button', className: 'dshkb-btn', disabled: testing || loading || form.baseURL === '' || form.model === '', onClick: test }, testing ? t('settings.testing') : t('settings.test')),
            h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', disabled: busy, onClick: () => setState({ dialog: null }) }, t('panel.cancel')),
            h('button', { type: 'submit', className: 'dshkb-btn dshkb-btn-primary', disabled: busy || loading }, t('settings.save')),
          ),
        ),
      );
    }

    function CreateKbDialog() {
      const [title, setTitle] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const submit = async (event) => {
        event.preventDefault();
        if (title.trim() === '' || busy) return;
        setBusy(true);
        try {
          const kb = await api('kb.create', { title: title.trim() });
          setState({ dialog: null, activeKbId: kb.id, activeKind: 'all' });
          await refreshOverview(true);
        } catch (error) {
          toast(t('common.failed', { message: error.message }), 'error');
          setBusy(false);
        }
      };
      return h(
        'div',
        { className: 'dshkb-modal-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget) setState({ dialog: null }); } },
        h(
          'form',
          { className: 'dshkb-modal', onSubmit: submit },
          h('h3', { className: 'dshkb-modal-title' }, t('panel.create')),
          h('input', { className: 'dshkb-input', placeholder: t('panel.newPlaceholder'), value: title, onChange: (event) => setTitle(event.target.value), autoFocus: true, maxLength: 60 }),
          h(
            'div',
            { className: 'dshkb-modal-actions' },
            h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', onClick: () => setState({ dialog: null }) }, t('panel.cancel')),
            h('button', { type: 'submit', className: 'dshkb-btn dshkb-btn-primary', disabled: busy || title.trim() === '' }, t('panel.create')),
          ),
        ),
      );
    }

    // 共享的导入实现：导入对话框与右侧拖拽都走这里。
    async function importFilesToLibrary(kb, files, options = {}) {
      const list = Array.from(files || []);
      const autoConvert = options.autoConvert === true;
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
      let ok = 0;
      let fail = 0;
      for (let index = 0; index < list.length; index += 1) {
        const file = list[index];
        onProgress({ phase: 'upload', index: index + 1, total: list.length, name: file.name });
        try {
          const buffer = await file.arrayBuffer();
          const base64 = toBase64(new Uint8Array(buffer));
          const result = await api('doc.import', { kbId: kb.id, name: file.name, mime: file.type, dataBase64: base64 });
          ok += 1;
          if (autoConvert) {
            onProgress({ phase: 'convert', index: index + 1, total: list.length, name: file.name });
            const job = await api('doc.convert', { kbId: kb.id, docId: result.doc.id });
            trackJob(job);
          }
        } catch (error) {
          fail += 1;
          toast(`${file.name}：${error instanceof Error ? error.message : String(error)}`, 'error');
        }
      }
      return { ok, fail };
    }

    function ImportDialog({ kb }) {
      const [files, setFiles] = React.useState([]);
      const [autoConvert, setAutoConvert] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [dragging, setDragging] = React.useState(false);
      const [progress, setProgress] = React.useState(null);

      if (kb === null) return null;

      const choose = (list) => {
        setFiles(list ? Array.from(list) : []);
      };
      const onDrop = (event) => {
        event.preventDefault();
        setDragging(false);
        if (busy) return;
        if (event.dataTransfer && event.dataTransfer.files) choose(event.dataTransfer.files);
      };

      const start = async () => {
        if (files.length === 0 || busy) return;
        setBusy(true);
        const { ok, fail } = await importFilesToLibrary(kb, files, {
          autoConvert,
          onProgress: (state) => {
            setProgress(
              state.phase === 'upload'
                ? t('import.uploading', { index: state.index, total: state.total, name: state.name })
                : t('import.converting', { name: state.name }),
            );
          },
        });
        setProgress(null);
        setBusy(false);
        setFiles([]);
        setState({ dialog: null });
        toast(t('import.done', { ok, fail }));
        await refreshDocs(kb.id, true);
        await refreshOverview(true);
      };

      return h(
        'div',
        { className: 'dshkb-modal-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) setState({ dialog: null }); } },
        h(
          'div',
          { className: 'dshkb-modal dshkb-modal-wide' },
          h('h3', { className: 'dshkb-modal-title' }, t('import.title', { kb: kb.title })),
          h('p', { className: 'dshkb-modal-hint' }, t('import.hint')),
          h(
            'label',
            {
              className: dragging ? 'dshkb-drop dshkb-drop-active' : 'dshkb-drop',
              onDragOver: (event) => {
                event.preventDefault();
                if (!busy) setDragging(true);
              },
              onDragLeave: () => setDragging(false),
              onDrop,
            },
            h('input', { type: 'file', multiple: true, onChange: (event) => choose(event.target.files), style: { display: 'none' } }),
            h('span', { className: 'dshkb-drop-icon' }, h(IconUpload)),
            h('span', { className: 'dshkb-drop-text' }, files.length === 0 ? t('import.drop') : t('import.selected', { count: files.length })),
            files.length > 0
              ? h('span', { className: 'dshkb-drop-list' }, files.slice(0, 6).map((file) => file.name).join('、') + (files.length > 6 ? ' …' : ''))
              : null,
          ),
          h(
            'label',
            { className: 'dshkb-check' },
            h('input', { type: 'checkbox', checked: autoConvert, onChange: (event) => setAutoConvert(event.target.checked), disabled: busy }),
            h('span', null, t('import.auto')),
          ),
          progress !== null ? h('div', { className: 'dshkb-progress', role: 'status' }, progress) : null,
          h(
            'div',
            { className: 'dshkb-modal-actions' },
            h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', disabled: busy, onClick: () => setState({ dialog: null }) }, t('panel.cancel')),
            h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-primary', disabled: busy || files.length === 0, onClick: start }, busy ? '…' : t('import.start')),
          ),
        ),
      );
    }

    function UrlDialog({ kb }) {
      const [url, setUrl] = React.useState('');
      const [title, setTitle] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      if (kb === null) return null;

      const submit = async (event) => {
        event.preventDefault();
        if (busy || url.trim() === '') return;
        setBusy(true);
        setError(null);
        try {
          const result = await api('doc.url', { kbId: kb.id, url: url.trim(), title: title.trim() });
          setState({ dialog: null });
          await refreshDocs(kb.id, true);
          const job = await api('doc.convert', { kbId: kb.id, docId: result.doc.id });
          trackJob(job);
          await refreshOverview(true);
        } catch (error) {
          setError(error instanceof Error ? error.message : String(error));
          setBusy(false);
        }
      };

      return h(
        'div',
        { className: 'dshkb-modal-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) setState({ dialog: null }); } },
        h(
          'form',
          { className: 'dshkb-modal', onSubmit: submit },
          h('h3', { className: 'dshkb-modal-title' }, t('url.title', { kb: kb.title })),
          h('p', { className: 'dshkb-modal-hint' }, t('url.hint')),
          h('label', { className: 'dshkb-field' }, h('span', null, 'URL'), h('input', { className: 'dshkb-input', value: url, onChange: (event) => setUrl(event.target.value), placeholder: t('url.placeholder'), autoFocus: true })),
          h('label', { className: 'dshkb-field' }, h('span', null, t('url.docTitle')), h('input', { className: 'dshkb-input', value: title, onChange: (event) => setTitle(event.target.value), maxLength: 120 })),
          error !== null ? h('div', { className: 'dshkb-error-bar', role: 'alert' }, error) : null,
          h(
            'div',
            { className: 'dshkb-modal-actions' },
            h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', disabled: busy, onClick: () => setState({ dialog: null }) }, t('panel.cancel')),
            h('button', { type: 'submit', className: 'dshkb-btn dshkb-btn-primary', disabled: busy || url.trim() === '' }, busy ? '…' : t('url.submit')),
          ),
        ),
      );
    }

    function toBase64(bytes) {
      let binary = '';
      const chunk = 0x8000;
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
      }
      return btoa(binary);
    }

    function PasteDialog({ kb }) {
      const [title, setTitle] = React.useState('');
      const [sourceUrl, setSourceUrl] = React.useState('');
      const [text, setText] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      if (kb === null) return null;

      const submit = async (event) => {
        event.preventDefault();
        if (busy || text.trim() === '') return;
        setBusy(true);
        try {
          const result = await api('doc.paste', { kbId: kb.id, title: title.trim() || '粘贴文本', text, sourceUrl: sourceUrl.trim() });
          setState({ dialog: null });
          await refreshDocs(kb.id, true);
          const job = await api('doc.convert', { kbId: kb.id, docId: result.doc.id });
          trackJob(job);
          await refreshOverview(true);
        } catch (error) {
          toast(t('common.failed', { message: error.message }), 'error');
          setBusy(false);
        }
      };

      return h(
        'div',
        { className: 'dshkb-modal-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) setState({ dialog: null }); } },
        h(
          'form',
          { className: 'dshkb-modal dshkb-modal-wide', onSubmit: submit },
          h('h3', { className: 'dshkb-modal-title' }, t('paste.title', { kb: kb.title })),
          h('label', { className: 'dshkb-field' }, h('span', null, t('paste.docTitle')), h('input', { className: 'dshkb-input', value: title, onChange: (event) => setTitle(event.target.value), placeholder: t('paste.docTitlePlaceholder'), maxLength: 120 })),
          h('label', { className: 'dshkb-field' }, h('span', null, t('paste.sourceUrl')), h('input', { className: 'dshkb-input', value: sourceUrl, onChange: (event) => setSourceUrl(event.target.value), placeholder: 'https://' })),
          h('label', { className: 'dshkb-field' }, h('span', null, t('paste.body')), h('textarea', { className: 'dshkb-textarea', value: text, onChange: (event) => setText(event.target.value), placeholder: t('paste.bodyPlaceholder'), rows: 10 })),
          h(
            'div',
            { className: 'dshkb-modal-actions' },
            h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', disabled: busy, onClick: () => setState({ dialog: null }) }, t('panel.cancel')),
            h('button', { type: 'submit', className: 'dshkb-btn dshkb-btn-primary', disabled: busy || text.trim() === '' }, busy ? '…' : t('paste.submit')),
          ),
        ),
      );
    }

    // -------------------------------------------------------------------- CSS

    const CSS = `
.dshkb-chip{display:inline-flex;align-items:center;gap:6px;height:26px;max-width:200px;padding:0 9px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;cursor:pointer;white-space:nowrap;overflow:hidden}
.dshkb-chip:hover{background:rgba(127,137,150,.12);color:var(--dsw-alias-label-primary)}
.dshkb-chip[data-bound="true"]{color:var(--dsw-alias-brand-primary);border-color:rgba(59,142,208,.45)}
.dshkb-chip-icon{display:inline-flex;width:15px;height:15px;flex:none}
.dshkb-chip-label{overflow:hidden;text-overflow:ellipsis}
.dshkb-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}
.dshkb-picker-backdrop{position:fixed;inset:0;z-index:75;pointer-events:auto}
.dshkb-picker{position:fixed;z-index:76;width:288px;max-height:min(60vh,420px);overflow:auto;padding:8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 48px rgba(8,15,25,.26);pointer-events:auto}
.dshkb-picker-title{padding:4px 8px 6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dshkb-picker-row{display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}
.dshkb-picker-row:hover{background:rgba(127,137,150,.12)}
.dshkb-picker-name{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-picker-meta{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px}
.dshkb-picker-check{flex:none;color:var(--dsw-alias-state-success-primary)}
.dshkb-picker-empty{padding:12px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dshkb-picker-foot{display:flex;justify-content:flex-end;gap:6px;margin-top:6px;padding-top:6px;border-top:.5px solid var(--dsw-alias-border-l1)}
.dshkb-btn{display:inline-flex;align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:4px 10px;cursor:pointer;white-space:nowrap;transition:background .12s ease,border-color .12s ease,opacity .12s ease}
.dshkb-btn:hover:not(:disabled){background:rgba(127,137,150,.12)}
.dshkb-btn:disabled{opacity:.45;cursor:default}
.dshkb-btn-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.dshkb-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(1.06)}
.dshkb-btn-ghost{background:transparent}
.dshkb-btn-quiet{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary);padding:4px 8px}
.dshkb-btn-quiet:hover:not(:disabled){background:rgba(127,137,150,.12);color:var(--dsw-alias-label-primary)}
.dshkb-btn-small{font-size:11px;padding:2px 8px}
.dshkb-btn-block{width:100%;justify-content:center}
.dshkb-btn-danger{background:var(--dsw-alias-state-error-primary);border-color:transparent;color:#fff}
.dshkb-btn-icon{display:inline-flex;width:14px;height:14px}
.dshkb-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:3px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dshkb-icon-btn:hover{background:rgba(127,137,150,.14);color:var(--dsw-alias-label-primary)}
.dshkb-icon-small{width:24px;height:24px}
.dshkb-icon-danger:hover{color:var(--dsw-alias-state-error-primary)}
.dshkb-pencil{font-size:13px;line-height:1}
.dshkb-panel-icon{display:inline-flex;align-items:center;justify-content:center;color:currentColor;flex:none}
.dshkb-page{display:flex;flex-direction:column;box-sizing:border-box;height:100%;min-height:420px;padding:calc(18px + var(--dsh-frame-top-clearance,0px)) 22px 16px max(22px,var(--dsh-frame-leading-clearance,0px));background:var(--dsw-alias-bg-base)}
.dshkb-page-body{display:flex;flex:1;min-height:320px;overflow:hidden;border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}
.dshkb-left{display:flex;flex-direction:column;width:252px;flex:none;border-right:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.dshkb-left-head{display:flex;align-items:center;justify-content:space-between;padding:16px 14px 10px}
.dshkb-left-tools{display:flex;align-items:center;gap:2px}
.dshkb-settings-row{display:flex;flex-wrap:wrap;align-items:center;gap:14px}
.dshkb-check-number{gap:6px}
.dshkb-input-number{width:64px;padding:4px 8px}
.dshkb-test-ok{color:var(--dsw-alias-state-success-primary);font-size:11px;line-height:16px}
.dshkb-test-fail{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}
.dshkb-btn-danger-text{color:var(--dsw-alias-state-error-primary)}
.dshkb-left-title{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}
.dshkb-left-icon{display:inline-flex;width:17px;height:17px;color:var(--dsw-alias-brand-primary)}
.dshkb-kb-list{flex:1;min-height:0;overflow-y:auto;padding:4px 8px 8px;display:flex;flex-direction:column;gap:2px}
.dshkb-kb-row{position:relative;display:flex;flex-direction:column;gap:2px;width:100%;padding:8px 30px 8px 10px;border:none;border-radius:9px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;font:inherit;cursor:pointer}
.dshkb-kb-row:hover{background:rgba(127,137,150,.1)}
.dshkb-kb-row-active{background:rgba(59,142,208,.13)}
.dshkb-kb-row-active .dshkb-kb-name{color:var(--dsw-alias-brand-primary);font-weight:600}
.dshkb-kb-name{font-size:13px;line-height:19px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-kb-meta{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dshkb-kb-pending{color:var(--dsw-alias-state-warn-primary)}
.dshkb-kb-dot{position:absolute;top:12px;right:11px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px rgba(60,180,120,.16)}
.dshkb-left-foot{flex:none;padding:10px 14px 14px;border-top:.5px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:8px}
.dshkb-datadir{color:var(--dsw-alias-label-secondary);font-size:10px;line-height:14px;opacity:.85;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-right{display:flex;flex-direction:column;flex:1;min-width:0;position:relative}
.dshkb-right-head{display:flex;align-items:flex-start;gap:16px;padding:16px 18px 12px 22px}
.dshkb-drop-overlay{position:absolute;inset:6px;z-index:6;display:flex;align-items:center;justify-content:center;border:2px dashed var(--dsw-alias-brand-primary);border-radius:12px;background:rgba(59,142,208,.08);pointer-events:none}
.dshkb-drop-overlay-card{display:flex;flex-direction:column;align-items:center;gap:5px;padding:16px 22px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 32px rgba(8,15,25,.18);color:var(--dsw-alias-label-primary);text-align:center}
.dshkb-drop-overlay-icon{display:inline-flex;width:24px;height:24px;color:var(--dsw-alias-brand-primary)}
.dshkb-drop-overlay-hint{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dshkb-drop-progress{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:7;max-width:88%;padding:6px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:20px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 26px rgba(8,15,25,.2);color:var(--dsw-alias-label-primary);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.dshkb-right-titles{flex:1;min-width:0}
.dshkb-kb-title{margin:0;color:var(--dsw-alias-label-primary);font-size:17px;font-weight:600;line-height:24px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.dshkb-title-action{flex:none;padding:1px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:20px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;cursor:pointer;white-space:nowrap}
.dshkb-title-action:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dshkb-title-action:disabled{opacity:.5;cursor:default}
.dshkb-kb-sub{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-head-actions{display:flex;align-items:center;gap:4px;flex:none}
.dshkb-running-chip{padding:2px 8px;border-radius:20px;background:rgba(59,142,208,.14);color:var(--dsw-alias-brand-primary);font-size:11px;line-height:16px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.dshkb-chip-cancel{padding:0 2px;border:none;background:transparent;color:inherit;font:inherit;font-size:11px;text-decoration:underline;cursor:pointer}
.dshkb-rename-form{display:flex;align-items:center;gap:6px}
.dshkb-input,.dshkb-textarea{box-sizing:border-box;width:100%;padding:7px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;outline:none}
.dshkb-input:focus,.dshkb-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.dshkb-textarea{resize:vertical;min-height:140px;font-size:13px;line-height:21px}
.dshkb-tabs{display:flex;align-items:center;gap:2px;padding:0 18px 0 22px;border-bottom:.5px solid var(--dsw-alias-border-l1);overflow-x:auto;flex:none}
.dshkb-tab{position:relative;display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.dshkb-tab:hover{color:var(--dsw-alias-label-primary)}
.dshkb-tab-active{color:var(--dsw-alias-brand-primary);font-weight:500}
.dshkb-tab-active:after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-brand-primary)}
.dshkb-tab-count{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:rgba(127,137,150,.16);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:16px}
.dshkb-doc-list{flex:1;min-height:0;overflow-y:auto;padding:8px 12px 16px}
.dshkb-doc-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px}
.dshkb-doc-hit{display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer;border-radius:10px;outline:none}
.dshkb-doc-row:hover{background:rgba(127,137,150,.09)}
.dshkb-doc-hit:focus-visible{box-shadow:inset 0 0 0 1.5px var(--dsw-alias-brand-primary)}
.dshkb-doc-icon{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex:none}
.dshkb-kind{display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:26px;padding:0 6px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:.04em;color:#fff;background:#64748b}
.dshkb-kind-pdf{background:#c2410c}
.dshkb-kind-html{background:#0e7490}
.dshkb-kind-md{background:#3b82f6}
.dshkb-kind-txt{background:#64748b}
.dshkb-kind-eb{background:#7c3aed}
.dshkb-kind-doc{background:#1d4ed8}
.dshkb-kind-img{background:#db2777}
.dshkb-kind-other{background:#475569}
.dshkb-doc-main{flex:1;min-width:0}
.dshkb-doc-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-doc-meta{display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-doc-tags{margin-left:6px;padding:0 5px;border-radius:5px;background:rgba(127,137,150,.14);font-size:10px}
.dshkb-doc-summary{margin-top:1px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;opacity:.9}
.dshkb-doc-partial{margin-top:2px;color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}
.dshkb-conv{display:flex;flex-direction:column;gap:3px;margin-top:5px}
.dshkb-conv-bar{height:4px;border-radius:3px;background:rgba(127,137,150,.2);overflow:hidden}
.dshkb-conv-fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary);transition:width .35s ease;background-image:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.45) 50%,rgba(255,255,255,0) 100%);background-size:200% 100%;animation:dshkb-shimmer 1.6s linear infinite}
@keyframes dshkb-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion: reduce){.dshkb-conv-fill{animation:none}}
.dshkb-conv-meta{display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);font-size:10px;line-height:14px;font-variant-numeric:tabular-nums}
.dshkb-doc-side{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none}
.dshkb-link-btn{padding:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;cursor:pointer;white-space:nowrap}
.dshkb-link-btn:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.dshkb-link-strong{color:var(--dsw-alias-brand-primary)}
.dshkb-doc-note{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;opacity:.75}
.dshkb-dot{opacity:.4}
.dshkb-status{flex:none;padding:2px 8px;border-radius:20px;font-size:10px;line-height:16px;white-space:nowrap}
.dshkb-status-ready{background:rgba(60,180,120,.14);color:var(--dsw-alias-state-success-primary)}
.dshkb-status-pending{background:rgba(230,160,60,.16);color:var(--dsw-alias-state-warn-primary)}
.dshkb-status-error{background:rgba(220,80,80,.14);color:var(--dsw-alias-state-error-primary)}
.dshkb-doc-actions{display:flex;align-items:center;gap:2px;flex:none;opacity:.35;transition:opacity .12s}
.dshkb-doc-row:hover .dshkb-doc-actions,.dshkb-doc-row:focus-within .dshkb-doc-actions{opacity:1}
.dshkb-body-empty{flex:1;display:flex;align-items:center;justify-content:center;padding:32px}
.dshkb-empty-card{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:360px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px}
.dshkb-empty-art{display:inline-flex;width:44px;height:44px;color:var(--dsw-alias-border-l2)}
.dshkb-empty-note{padding:16px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dshkb-muted{color:var(--dsw-alias-label-secondary)}
.dshkb-error-bar{display:flex;align-items:center;gap:10px;margin:8px 18px 10px 22px;padding:8px 10px;border-radius:8px;background:rgba(220,80,80,.1);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}
.dshkb-modal-backdrop{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(11,17,26,.34)}
.dshkb-modal{display:flex;flex-direction:column;gap:10px;width:min(420px,88%);padding:18px;border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 48px rgba(8,15,25,.26)}
.dshkb-modal-wide{width:min(600px,92%)}
.dshkb-modal-title{margin:0;color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:22px}
.dshkb-modal-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}
.dshkb-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.dshkb-drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:center}
.dshkb-drop:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.dshkb-drop-active{border-color:var(--dsw-alias-brand-primary);background:rgba(59,142,208,.08);color:var(--dsw-alias-label-primary)}
.dshkb-drop-icon{display:inline-flex;width:26px;height:26px;color:var(--dsw-alias-brand-primary)}
.dshkb-drop-text{font-size:12px;line-height:18px}
.dshkb-drop-list{font-size:10px;line-height:15px;opacity:.8;overflow-wrap:anywhere}
.dshkb-check{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer}
.dshkb-progress{color:var(--dsw-alias-brand-primary);font-size:11px;line-height:16px}
.dshkb-field{display:flex;flex-direction:column;gap:4px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dshkb-preview-backdrop{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,13,20,.46);pointer-events:auto}
.dshkb-preview-card{display:flex;flex-direction:column;width:min(1000px,92vw);height:min(760px,88vh);overflow:hidden;border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 28px 68px rgba(8,15,25,.34)}
.dshkb-preview-head{display:flex;align-items:center;gap:10px;padding:12px 14px 12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none}
.dshkb-preview-titles{flex:1;min-width:0}
.dshkb-preview-title{margin:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-preview-meta{margin-top:1px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-preview-tabs{display:flex;gap:2px;flex:none}
.dshkb-preview-body{flex:1;min-height:0;display:flex;overflow:hidden;background:var(--dsw-alias-bg-base)}
.dshkb-frame{width:100%;height:100%;border:0;background:#fff}
.dshkb-frame-html{background:#fff}
.dshkb-image-wrap{display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:auto;padding:16px}
.dshkb-image{max-width:100%;max-height:100%;border-radius:8px}
.dshkb-text-wrap{display:flex;flex-direction:column;width:100%;overflow:auto}
.dshkb-preview-note{padding:10px 16px;color:var(--dsw-alias-label-secondary);font-size:11px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dshkb-pre{margin:0;padding:16px 20px;color:var(--dsw-alias-label-primary);font-family:var(--dsh-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.dshkb-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:100;padding:8px 16px;border-radius:10px;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;box-shadow:0 10px 30px rgba(8,15,25,.24);pointer-events:none}
.dshkb-toast-error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dshkb-toast-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
`;

    // ---------------------------------------------------------------- apply

    function apply(ctx) {
      pluginCtx = ctx;
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), NS + ': dictionaries');
      try {
        const bound = ctx.locale.bind(NS);
        if (typeof bound === 'function') translate = bound;
      } catch {
        translate = (key, params) => {
          const value = zh[key] !== undefined ? zh[key] : key;
          return String(value).replace(/\{(\w+)\}/g, (match, name) => (params && params[name] !== undefined ? String(params[name]) : match));
        };
      }

      ctx.slots.inject('conversation.session.header.actions', () =>
        ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dshkb-header', order: 5 }, HeaderChip),
      );

      // 侧边栏导航行（全局面板）+ 主面板页面：与「上下文洞察」「邮件」同级。
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => translate('panel.title') },
          SidebarPanelIcon,
        ),
      );
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, LibraryPage));

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dshkb-picker', order: 20 }, BindPicker));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dshkb-toast', order: 90 }, ToastLayer));
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
