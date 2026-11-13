window.__ModuleLoader__.load({
  id: '@local/dsh-knowledge-base',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-knowledge-base';
    const API = '/dsh-kb/api';

    // ---------------------------------------------------------------- locale

    const zh = {
      'dock.unbound': '未绑定资料库',
      'dock.hint': '绑定后以资料库为主要依据',
      'dock.bound': '资料库',
      'dock.ready': '{count} 篇可检索',
      'dock.bind': '绑定',
      'dock.change': '更换',
      'dock.open': '打开资料库',
      'panel.title': '资料库',
      'panel.subtitle': '静态资料分区，由你整理，模型转化为可检索文档',
      'panel.new': '新建',
      'panel.newPlaceholder': '新资料库名称，如「毛泽东选集资料库」',
      'panel.create': '创建资料库',
      'panel.cancel': '取消',
      'panel.empty': '还没有资料库。先创建一个，再导入 PDF、网页或 TXT。',
      'panel.emptyDocs': '这个资料库还是空的。导入文件或粘贴文本开始整理。',
      'panel.docs': '{count} 篇',
      'panel.pending': '{count} 待转化',
      'panel.bindHere': '绑定到当前对话',
      'panel.boundHere': '当前对话已绑定',
      'panel.noSession': '打开一个对话后即可绑定资料库',
      'panel.import': '导入文件',
      'panel.paste': '粘贴文本',
      'panel.url': '导入网页',
      'panel.rename': '改名',
      'panel.deleteKb': '删除资料库',
      'panel.confirmDeleteKb': '确认删除整个资料库？',
      'panel.confirmDeleteDoc': '确认删除？',
      'panel.dataDir': '数据目录：{dir}',
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
      'doc.preview': '预览',
      'doc.delete': '删除',
      'doc.doubleClick': '双击预览',
      'doc.noDocs': '这个分类下没有文件',
      'import.title': '导入文件到「{kb}」',
      'import.hint': '支持 PDF、HTML、Markdown、TXT、EPUB、DOCX、图片；单文件上限 64 MB。',
      'import.drop': '把文件拖到这里，或点击选择',
      'import.selected': '已选 {count} 个文件',
      'import.auto': '导入后用当前模型自动转化',
      'import.start': '开始导入',
      'import.uploading': '正在上传 {index}/{total}：{name}',
      'import.converting': '正在转化：{name}',
      'import.done': '完成：{ok} 个导入，{fail} 个失败',
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
      'preview.source': '源码',
      'preview.rendered': '预览',
      'preview.note': '该格式没有内嵌预览，下面显示抽取出的文字。',
      'preview.loading': '载入中…',
      'preview.empty': '没有可显示的正文。可以在对话里让模型读取原文件并写回资料库。',
      'preview.pdfFallback': '当前窗口无法内嵌显示 PDF。',
      'common.close': '关闭',
      'common.retry': '重试',
      'common.failed': '操作失败：{message}',
      'bind.done': '已绑定「{title}」',
      'bind.cleared': '已取消绑定',
    };

    const en = {
      'dock.unbound': 'No library bound',
      'dock.hint': 'Answers prefer the bound library',
      'dock.bound': 'Library',
      'dock.ready': '{count} searchable',
      'dock.bind': 'Bind',
      'dock.change': 'Change',
      'dock.open': 'Open library',
      'panel.title': 'Knowledge base',
      'panel.subtitle': 'Static, user-curated libraries converted by the model into searchable docs',
      'panel.new': 'New',
      'panel.newPlaceholder': 'Library name, e.g. "Collected Works"',
      'panel.create': 'Create library',
      'panel.cancel': 'Cancel',
      'panel.empty': 'No libraries yet. Create one, then import PDFs, pages or text.',
      'panel.emptyDocs': 'This library is empty. Import a file or paste text to begin.',
      'panel.docs': '{count} docs',
      'panel.pending': '{count} pending',
      'panel.bindHere': 'Bind to this conversation',
      'panel.boundHere': 'Bound to this conversation',
      'panel.noSession': 'Open a conversation to bind a library',
      'panel.import': 'Import files',
      'panel.paste': 'Paste text',
      'panel.url': 'Import page',
      'panel.rename': 'Rename',
      'panel.deleteKb': 'Delete library',
      'panel.confirmDeleteKb': 'Delete this entire library?',
      'panel.confirmDeleteDoc': 'Delete?',
      'panel.dataDir': 'Data directory: {dir}',
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
      'doc.preview': 'Preview',
      'doc.delete': 'Delete',
      'doc.doubleClick': 'Double-click to preview',
      'doc.noDocs': 'No files in this category',
      'import.title': 'Import into "{kb}"',
      'import.hint': 'PDF, HTML, Markdown, TXT, EPUB, DOCX and images; up to 64 MB each.',
      'import.drop': 'Drop files here, or click to choose',
      'import.selected': '{count} files selected',
      'import.auto': 'Convert with the current model after import',
      'import.start': 'Start import',
      'import.uploading': 'Uploading {index}/{total}: {name}',
      'import.converting': 'Converting: {name}',
      'import.done': 'Done: {ok} imported, {fail} failed',
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
      'preview.source': 'Source',
      'preview.rendered': 'Rendered',
      'preview.note': 'No inline preview for this format; extracted text is shown below.',
      'preview.loading': 'Loading…',
      'preview.empty': 'No displayable text. Ask the model in a conversation to read the original and write it back.',
      'preview.pdfFallback': 'This window cannot embed PDFs.',
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
      open: false,
      mode: 'browse',
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

    async function refreshOverview(options) {
      const force = options === true;
      if (state.loading) return;
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
        if (activeKbId !== null) await refreshDocs(activeKbId, true);
        else setState({ docs: [], docsKbId: null });
      } catch (error) {
        setState({ loading: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    async function refreshDocs(kbId, force) {
      if (kbId === undefined || kbId === null) return;
      if (!force && state.docsKbId === kbId) return;
      try {
        const docs = await api('docs.list', { kbId });
        if (state.docsKbId !== null && state.docsKbId !== kbId) return;
        setState({ docs, docsKbId: kbId });
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
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

    function openPanel(mode) {
      setState({ open: true, mode: mode || 'browse', dialog: null, confirm: null });
      void refreshOverview(true);
    }

    function closePanel() {
      setState({ open: false, dialog: null, preview: null, confirm: null, editingTitle: false });
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
          }
        } catch (error) {
          pollers.delete(job.id);
          toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
        }
      };
      pollers.set(job.id, true);
      setTimeout(tick, 700);
    }

    async function convertDoc(doc) {
      if (doc === null) return;
      try {
        const job = await api('doc.convert', { kbId: doc.kbId, docId: doc.id });
        trackJob(job);
      } catch (error) {
        toast(t('common.failed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      }
    }

    // -------------------------------------------------------------- components

    function StyleTag() {
      return h('style', null, CSS);
    }

    function Dock(props) {
      const app = useAppState();
      // 会话槽的 standardProps 里是 sessionId；ownerProps 里还有 session 快照，两者都兼容。
      const sessionId =
        (props && props.sessionId) ||
        (props && props.session && (props.session.id || props.session.sessionId)) ||
        null;

      React.useEffect(() => {
        if (sessionId !== null) {
          activeDocks.add(sessionId);
          if (state.sessionId !== sessionId) setState({ sessionId });
          void refreshOverview(true);
        }
        return () => {
          if (sessionId !== null) activeDocks.delete(sessionId);
          const remaining = [...activeDocks];
          setState({ sessionId: remaining.length > 0 ? remaining[remaining.length - 1] : null });
        };
      }, [sessionId]);

      const bound = app.binding;
      return h(
        React.Fragment,
        null,
        h(StyleTag),
        h(
          'div',
          { className: 'dshkb-dock' },
          h('span', { className: 'dshkb-dock-icon' }, h(IconBook)),
          bound
            ? h(
                'span',
                { className: 'dshkb-dock-text' },
                h('span', { className: 'dshkb-dock-strong' }, bound.title),
                h('span', { className: 'dshkb-dock-sep' }, '·'),
                h('span', null, t('dock.ready', { count: countReady(app.kbs, bound.kbId) })),
              )
            : h('span', { className: 'dshkb-dock-text' }, h('span', { className: 'dshkb-dock-muted' }, t('dock.unbound')), h('span', { className: 'dshkb-dock-sep' }, '·'), h('span', { className: 'dshkb-dock-muted' }, t('dock.hint'))),
          h('span', { className: 'dshkb-dock-actions' },
            h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-ghost', onClick: () => openPanel('bind') }, bound ? t('dock.change') : t('dock.bind')),
            h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', onClick: () => openPanel('browse') }, t('dock.open')),
          ),
        ),
      );
    }

    function countReady(kbs, kbId) {
      const kb = (kbs || []).find((item) => item.id === kbId);
      return kb ? kb.readyCount : 0;
    }

    function SidebarAction(props) {
      useAppState();
      const wide = Boolean(props && props.wide);
      return h(
        React.Fragment,
        null,
        h(StyleTag),
        h(
          'div',
          { className: wide ? 'dshkb-footer' : 'dshkb-footer dshkb-footer-rail' },
          h(
            'button',
            {
              type: 'button',
              className: 'dshkb-footer-btn',
              title: t('panel.title'),
              'aria-label': t('panel.title'),
              onClick: () => openPanel('browse'),
            },
            h('span', { className: 'dshkb-footer-icon' }, h(IconBook)),
            wide ? h('span', { className: 'dshkb-footer-label' }, t('panel.title')) : null,
          ),
        ),
      );
    }

    function Panel() {
      const app = useAppState();
      const [renaming, setRenaming] = React.useState(false);
      const [titleDraft, setTitleDraft] = React.useState('');

      React.useEffect(() => {
        if (!app.open) return;
        void refreshOverview(false);
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          if (state.preview !== null) setState({ preview: null });
          else if (state.dialog !== null) setState({ dialog: null });
          else closePanel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [app.open]);

      React.useEffect(() => {
        if (app.activeKbId !== null) void refreshDocs(app.activeKbId, false);
      }, [app.activeKbId]);

      if (!app.open) return null;

      const kb = app.kbs.find((item) => item.id === app.activeKbId) || null;
      const boundHere = app.binding !== null && kb !== null && app.binding.kbId === kb.id;

      return h(
        React.Fragment,
        null,
        h(StyleTag),
        h(
          'div',
          {
            className: 'dshkb-backdrop',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('panel.title'),
            onMouseDown: (event) => {
              if (event.target === event.currentTarget) closePanel();
            },
          },
          h(
            'div',
            { className: 'dshkb-card' },
            // left column
            h(
              'aside',
              { className: 'dshkb-left' },
              h(
                'div',
                { className: 'dshkb-left-head' },
                h('div', { className: 'dshkb-left-title' }, h('span', { className: 'dshkb-left-icon' }, h(IconBook)), t('panel.title')),
                h('button', { type: 'button', className: 'dshkb-icon-btn', title: t('panel.new'), 'aria-label': t('panel.new'), onClick: () => setState({ dialog: 'create-kb' }) }, h(IconPlus)),
              ),
              h(
                'div',
                { className: 'dshkb-kb-list', role: 'list' },
                app.kbs.length === 0 && !app.loading
                  ? h('div', { className: 'dshkb-empty-note' }, t('panel.empty'))
                  : app.kbs.map((item) =>
                      h(
                        'button',
                        {
                          key: item.id,
                          type: 'button',
                          role: 'listitem',
                          className: item.id === app.activeKbId ? 'dshkb-kb-row dshkb-kb-row-active' : 'dshkb-kb-row',
                          onClick: () => setState({ activeKbId: item.id, activeKind: 'all', confirm: null }),
                          onDoubleClick: () => bindTo(item.id),
                          title: t('panel.bindHere'),
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
                app.sessionId === null
                  ? h('div', { className: 'dshkb-foot-note' }, t('panel.noSession'))
                  : h(
                      'div',
                      { className: 'dshkb-foot-note' },
                      boundHere
                        ? h('span', { className: 'dshkb-bound-chip' }, t('panel.boundHere'))
                        : h(
                            'button',
                            { type: 'button', className: 'dshkb-btn dshkb-btn-primary dshkb-btn-block', onClick: () => kb !== null && bindTo(kb.id) },
                            t('panel.bindHere'),
                          ),
                    ),
                app.stats ? h('div', { className: 'dshkb-datadir', title: app.stats.dataDir }, t('panel.dataDir', { dir: shortDir(app.stats.dataDir) })) : null,
              ),
            ),
            // right column
            h(
              'section',
              { className: 'dshkb-right' },
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
                        'h2',
                        { className: 'dshkb-kb-title', onDoubleClick: () => { if (kb !== null) { setTitleDraft(kb.title); setRenaming(true); } }, title: t('panel.rename') },
                        kb === null ? t('panel.title') : kb.title,
                      ),
                  h('p', { className: 'dshkb-kb-sub' }, kb === null ? t('panel.subtitle') : kb.description || t('panel.subtitle')),
                ),
                h(
                  'div',
                  { className: 'dshkb-head-actions' },
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
                  h('button', { type: 'button', className: 'dshkb-icon-btn', title: t('common.close'), 'aria-label': t('common.close'), onClick: closePanel }, h(IconClose)),
                ),
              ),
              kb === null
                ? h('div', { className: 'dshkb-body-empty' }, h('div', { className: 'dshkb-empty-card' }, h('div', { className: 'dshkb-empty-art' }, h(IconBook)), h('p', null, t('panel.empty'))))
                : h(
                    React.Fragment,
                    null,
                    h(KindTabs, { docs: app.docs, activeKind: app.activeKind, onChange: (kind) => setState({ activeKind: kind }) }),
                    h(DocList, { app, kb }),
                  ),
              app.error !== null ? h('div', { className: 'dshkb-error-bar', role: 'alert' }, app.error, h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-quiet', onClick: () => refreshOverview(true) }, t('common.retry'))) : null,
            ),
          ),
          app.dialog === 'create-kb' ? h(CreateKbDialog, null) : null,
          app.dialog === 'import' ? h(ImportDialog, { kb }) : null,
          app.dialog === 'paste' ? h(PasteDialog, { kb }) : null,
          app.dialog === 'url' ? h(UrlDialog, { kb }) : null,
          app.preview !== null ? h(PreviewDialog, { preview: app.preview, kb }) : null,
          app.toast !== null ? h('div', { className: `dshkb-toast dshkb-toast-${app.toast.tone}`, role: 'status' }, app.toast.message) : null,
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

    function DocList({ app, kb }) {
      const docs = app.activeKind === 'all' ? app.docs : app.docs.filter((doc) => kindOf(doc) === app.activeKind);
      if (app.docs.length === 0) {
        return h('div', { className: 'dshkb-body-empty' }, h('div', { className: 'dshkb-empty-card' }, h('div', { className: 'dshkb-empty-art' }, h(IconUpload)), h('p', null, t('panel.emptyDocs'))));
      }
      if (docs.length === 0) return h('div', { className: 'dshkb-body-empty' }, h('p', { className: 'dshkb-muted' }, t('doc.noDocs')));
      return h(
        'div',
        { className: 'dshkb-doc-list' },
        docs.map((doc) => h(DocRow, { key: doc.id, doc, kb, app })),
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
              doc.tags.length > 0 ? h('span', { className: 'dshkb-doc-tags' }, doc.tags.slice(0, 3).join(' / ')) : null,
            ),
            doc.summary !== '' ? h('div', { className: 'dshkb-doc-summary' }, doc.summary) : null,
          ),
        ),
        h('span', { className: `dshkb-status dshkb-status-${doc.status === 'ready' ? 'ready' : showError ? 'error' : 'pending'}` }, converting ? t('doc.converting') : statusLabel),
        h(
          'span',
          { className: 'dshkb-doc-actions' },
          doc.status !== 'ready'
            ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-small', disabled: converting, onClick: () => convertDoc(doc) }, converting ? t('doc.converting') : t('doc.convert'))
            : null,
          h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-small dshkb-btn-quiet', onClick: open }, t('doc.preview')),
          confirming
            ? h('button', { type: 'button', className: 'dshkb-btn dshkb-btn-small dshkb-btn-danger', onClick: () => deleteDoc(kb, doc) }, t('panel.confirmDeleteDoc'))
            : h('button', { type: 'button', className: 'dshkb-icon-btn dshkb-icon-danger dshkb-icon-small', title: t('doc.delete'), 'aria-label': t('doc.delete'), onClick: () => setState({ confirm: `doc:${doc.id}` }) }, h(IconTrash)),
        ),
      );
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
              h('h3', { className: 'dshkb-preview-title' }, doc.title),
              h('div', { className: 'dshkb-preview-meta' }, `${t(`tab.${kindOf(doc)}`)} · ${doc.chars} 字符 · ${timeLabel(doc.addedAt)}${doc.tags.length > 0 ? ` · ${doc.tags.join('、')}` : ''}`),
            ),
            doc.kind === 'html' && preview.html !== null
              ? h(
                  'div',
                  { className: 'dshkb-preview-tabs' },
                  h('button', { type: 'button', className: preview.tab === 'rendered' ? 'dshkb-tab dshkb-tab-active' : 'dshkb-tab', onClick: () => setState({ preview: { ...preview, tab: 'rendered' } }) }, t('preview.rendered')),
                  h('button', { type: 'button', className: preview.tab === 'source' ? 'dshkb-tab dshkb-tab-active' : 'dshkb-tab', onClick: () => setState({ preview: { ...preview, tab: 'source' } }) }, t('preview.source')),
                )
              : null,
            doc.hasRaw ? h('a', { className: 'dshkb-btn dshkb-btn-quiet', href: link, target: '_blank', rel: 'noreferrer' }, t('preview.open')) : null,
            h('button', { type: 'button', className: 'dshkb-icon-btn', title: t('common.close'), 'aria-label': t('common.close'), onClick: () => setState({ preview: null }) }, h(IconClose)),
          ),
          h(
            'div',
            { className: 'dshkb-preview-body' },
            preview.loading
              ? h('div', { className: 'dshkb-empty-note' }, t('preview.loading'))
              : preview.error !== null
                ? h('div', { className: 'dshkb-error-bar', role: 'alert' }, preview.error)
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

    function ImportDialog({ kb }) {
      const [files, setFiles] = React.useState([]);
      const [autoConvert, setAutoConvert] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [progress, setProgress] = React.useState(null);
      const inputRef = React.useRef(null);

      if (kb === null) return null;

      const choose = (event) => {
        const list = event.target.files;
        setFiles(list ? Array.from(list) : []);
      };

      const start = async () => {
        if (files.length === 0 || busy) return;
        setBusy(true);
        let ok = 0;
        let fail = 0;
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          setProgress(t('import.uploading', { index: index + 1, total: files.length, name: file.name }));
          try {
            const buffer = await file.arrayBuffer();
            const base64 = toBase64(new Uint8Array(buffer));
            const result = await api('doc.import', { kbId: kb.id, name: file.name, mime: file.type, dataBase64: base64 });
            ok += 1;
            if (autoConvert) {
              setProgress(t('import.converting', { name: file.name }));
              const job = await api('doc.convert', { kbId: kb.id, docId: result.doc.id });
              trackJob(job);
            }
          } catch (error) {
            fail += 1;
            toast(`${file.name}：${error.message}`, 'error');
          }
        }
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
            { className: 'dshkb-drop' },
            h('input', { ref: inputRef, type: 'file', multiple: true, onChange: choose, style: { display: 'none' } }),
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
.dshkb-dock{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;max-width:860px;margin:0 auto 8px;padding:5px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dshkb-dock-icon{display:inline-flex;width:16px;height:16px;color:var(--dsw-alias-brand-primary);flex:none}
.dshkb-dock-text{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-dock-strong{color:var(--dsw-alias-label-primary);font-weight:500;overflow:hidden;text-overflow:ellipsis}
.dshkb-dock-muted{color:var(--dsw-alias-label-secondary)}
.dshkb-dock-sep{color:var(--dsw-alias-label-secondary);opacity:.45}
.dshkb-dock-actions{margin-left:auto;display:flex;align-items:center;gap:4px;flex:none}
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
.dshkb-footer{display:flex;align-items:center;width:100%;height:42px;margin:8px 0 0}
.dshkb-footer-rail{width:36px;height:36px;margin:0;justify-content:center}
.dshkb-footer-btn{display:inline-flex;align-items:center;gap:8px;width:100%;height:42px;padding:0 10px 0 8px;border:none;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;cursor:pointer;overflow:hidden}
.dshkb-footer-rail .dshkb-footer-btn{width:36px;height:36px;justify-content:center;gap:0;padding:0;border-radius:50%}
.dshkb-footer-btn:hover{background:rgba(127,137,150,.14)}
.dshkb-footer-icon{display:inline-flex;width:18px;height:18px;flex:none;color:var(--dsw-alias-label-secondary)}
.dshkb-footer-label{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-backdrop{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(11,17,26,.36);pointer-events:auto}
.dshkb-card{position:relative;display:flex;width:min(1120px,94vw);height:min(780px,88vh);overflow:hidden;border:.5px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 24px 64px rgba(8,15,25,.28)}
.dshkb-left{display:flex;flex-direction:column;width:252px;flex:none;border-right:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.dshkb-left-head{display:flex;align-items:center;justify-content:space-between;padding:16px 14px 10px}
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
.dshkb-foot-note{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dshkb-bound-chip{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-state-success-primary);font-size:12px}
.dshkb-bound-chip:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.dshkb-datadir{color:var(--dsw-alias-label-secondary);font-size:10px;line-height:14px;opacity:.85;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-right{display:flex;flex-direction:column;flex:1;min-width:0}
.dshkb-right-head{display:flex;align-items:flex-start;gap:16px;padding:16px 18px 12px 22px}
.dshkb-right-titles{flex:1;min-width:0}
.dshkb-kb-title{margin:0;color:var(--dsw-alias-label-primary);font-size:17px;font-weight:600;line-height:24px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-kb-sub{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshkb-head-actions{display:flex;align-items:center;gap:4px;flex:none}
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
.dshkb-modal-backdrop{position:absolute;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(11,17,26,.34);border-radius:16px}
.dshkb-modal{display:flex;flex-direction:column;gap:10px;width:min(420px,88%);padding:18px;border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 48px rgba(8,15,25,.26)}
.dshkb-modal-wide{width:min(600px,92%)}
.dshkb-modal-title{margin:0;color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:22px}
.dshkb-modal-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}
.dshkb-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.dshkb-drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:center}
.dshkb-drop:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
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
.dshkb-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:100;padding:8px 16px;border-radius:10px;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;box-shadow:0 10px 30px rgba(8,15,25,.24)}
.dshkb-toast-error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dshkb-toast-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
`;

    // ---------------------------------------------------------------- apply

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), NS + ': dictionaries');
      translations = zh;
      try {
        const bound = ctx.locale.bind(NS);
        if (typeof bound === 'function') translate = bound;
      } catch {
        translate = (key, params) => {
          const value = zh[key] !== undefined ? zh[key] : key;
          return String(value).replace(/\{(\w+)\}/g, (match, name) => (params && params[name] !== undefined ? String(params[name]) : match));
        };
      }

      ctx.slots.inject('conversation.input.dock', () =>
        ctx.slots.register({ name: 'conversation.input.dock', id: 'dshkb-binding-dock', order: 10 }, Dock),
      );

      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register({ name: 'sidebar.footer.action', id: 'dshkb-sidebar', order: 20 }, SidebarAction),
      );

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dshkb-panel', order: 30 }, Panel));
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
