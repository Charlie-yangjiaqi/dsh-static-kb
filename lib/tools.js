// Agent 工具：读取、检索、转化资料库。
// 与面板走同一套 Host 方法（KnowledgeStore / runtime），保证 UI 与工具的结果一致。
import { truncateChars } from './util.js';

// defineTool 来自 dsh 随安装提供的 @deepseek-ai/dsh-tools（bundle 不声明依赖）。
// 插件用 link:D:/dsh-kb 安装时这个包解析不到（真实路径下没有 node_modules），
// 早先的兜底是「原样注册」，于是扁平参数表被当成 JSON Schema 直接下发给模型：
// 属性里残留 author-only 的 required:true、根节点没有 type/properties，
// provider 判为 invalid JSON Schema in function parameters，整轮 400。
// （只在 native 工具模式暴露；PTC 模式只下发 run_code，所以看起来「没事」。）
// 兜底必须自己完成 defineTool 里的那一步编译，注册表不会替我们转换。
function compileParameters(parameters) {
  const properties = {};
  const required = [];
  for (const [key, spec] of Object.entries(parameters ?? {})) {
    const { required: isRequired, ...rest } = spec ?? {};
    properties[key] = rest;
    if (isRequired === true) required.push(key);
  }
  const schema = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

function fallbackDefineTool(definition) {
  return { ...definition, parameters: compileParameters(definition.parameters) };
}

let defineToolPromise = null;
function loadDefineTool(ctx) {
  if (defineToolPromise === null) {
    defineToolPromise = import('@deepseek-ai/dsh-tools')
      .then((module) => (typeof module.defineTool === 'function' ? module.defineTool : fallbackDefineTool))
      .catch((error) => {
        ctx.logger?.debug?.(`[knowledge-base] @deepseek-ai/dsh-tools 不可用（${error?.code ?? 'unresolved'}），参数表就地编译成 JSON Schema`);
        return fallbackDefineTool;
      });
  }
  return defineToolPromise;
}

function textOutput(description) {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    ...(description === undefined ? {} : { description }),
  };
}

function sessionIdOf(exec) {
  return exec?.agent?.session?.id ?? exec?.session?.id;
}

async function resolveKbId(runtime, args, exec) {
  if (typeof args?.kbId === 'string' && args.kbId !== '') return args.kbId;
  const bound = runtime.bindingOfSync(sessionIdOf(exec));
  return bound === null ? null : bound.kbId;
}

function noBindingMessage(runtime) {
  const names = runtime.store.library.kbs.map((kb) => `- ${kb.title}（${kb.id}）`).join('\n');
  return `当前对话没有绑定资料库。请在对话框标题栏选择资料库后再试；也可以直接传 kbId 参数。\n可用资料库：\n${names || '（还没有资料库）'}`;
}

export async function registerTools({ ctx, runtime }) {
  const defineTool = await loadDefineTool(ctx);
  ctx.tools.register(
    defineTool({
      name: 'kb_list',
      description: '列出资料库及其文档概况。用于确认当前绑定的资料库、文档标题与待转化数量；不返回正文。',
      parameters: {
        includeDocs: { type: 'boolean', description: '为 true 时附带各资料库的文档标题（每个资料库最多 50 条）。' },
      },
      output: textOutput(),
      async execute(args, exec) {
        await runtime.ready();
        const bound = runtime.bindingOfSync(sessionIdOf(exec));
        const kbs = await runtime.store.listKbs();
        const lines = [];
        lines.push(bound === null ? '当前对话：未绑定资料库' : `当前对话绑定：${bound.title}（${bound.kbId}）`);
        lines.push(`共 ${kbs.length} 个资料库：`);
        for (const kb of kbs) {
          lines.push(`- ${kb.title}（${kb.id}）：可检索 ${kb.readyCount} 篇，待转化 ${kb.pendingCount} 篇`);
          if (args?.includeDocs === true) {
            const docs = await runtime.store.listDocs(kb.id);
            for (const doc of docs.slice(0, 50)) {
              const status = doc.status === 'ready' ? '可检索' : '待转化';
              const summary = doc.summary === '' ? '' : `：${doc.summary}`;
              lines.push(`  · [${status}] ${doc.title}（${doc.id}，${doc.kind}，${doc.chars} 字符）${summary}`);
            }
            if (docs.length > 50) lines.push(`  · …… 另有 ${docs.length - 50} 篇未列出`);
          }
        }
        return lines.join('\n');
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'kb_search',
      description:
        '在资料库中检索。默认检索当前对话绑定的资料库；返回最相关的文档片段（含标题、标签与命中上下文），用于回答前取证。只有已转化为 Markdown 的文档可被检索。',
      parameters: {
        query: { type: 'string', required: true, description: '检索词：人名、术语、原句片段都可以；中文建议 2-8 个字。' },
        kbId: { type: 'string', description: '指定资料库 id；省略时使用当前对话绑定的资料库。' },
        limit: { type: 'number', description: '返回条数，1-20，默认 6。' },
      },
      output: textOutput(),
      async execute(args, exec) {
        await runtime.ready();
        const kbId = await resolveKbId(runtime, args, exec);
        if (kbId === null) return noBindingMessage(runtime);
        const limit = Number.isFinite(args?.limit) ? Math.max(1, Math.min(20, Math.trunc(args.limit))) : 6;
        const result = await runtime.store.search({ kbId, query: String(args?.query ?? ''), limit });
        if (result.results.length === 0) {
          return `资料库中没有检索到「${args?.query}」。已扫描 ${result.scannedDocs} 篇可检索文档。可能原因：资料尚未转化（用 kb_pending 查看），或该主题不在资料库中。`;
        }
        const lines = [`命中 ${result.results.length} 条（资料库 ${kbId}）：`];
        for (const [index, item] of result.results.entries()) {
          const tags = item.tags.length === 0 ? '' : `｜标签：${item.tags.join('、')}`;
          lines.push('');
          lines.push(`${index + 1}. ${item.title}（docId: ${item.docId}）${tags}`);
          if (item.summary !== '') lines.push(`   摘要：${item.summary}`);
          lines.push(`   片段：${item.snippet}`);
        }
        lines.push('');
        lines.push('需要完整上下文时，用 kb_read 传 docId 读取。');
        return lines.join('\n');
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'kb_read',
      description: '读取资料库中一篇文档的正文（Markdown 优先）。长文档按字符分页，返回总量与是否还有后续。',
      parameters: {
        docId: { type: 'string', required: true, description: '文档 id，来自 kb_search / kb_list / kb_pending。' },
        kbId: { type: 'string', description: '文档所在资料库 id；省略时先找当前绑定的资料库，再在全部资料库中查找。' },
        offset: { type: 'number', description: '起始字符偏移，默认 0。' },
        limit: { type: 'number', description: '本次读取字符数，500-30000，默认 8000。' },
      },
      output: textOutput(),
      async execute(args, exec) {
        await runtime.ready();
        const docId = String(args?.docId ?? '');
        const limit = Number.isFinite(args?.limit) ? Math.max(500, Math.min(30000, Math.trunc(args.limit))) : 8000;
        const offset = Number.isFinite(args?.offset) ? Math.max(0, Math.trunc(args.offset)) : 0;
        const candidates = [];
        const explicit = typeof args?.kbId === 'string' && args.kbId !== '' ? args.kbId : null;
        if (explicit !== null) candidates.push(explicit);
        else {
          const bound = runtime.bindingOfSync(sessionIdOf(exec));
          if (bound !== null) candidates.push(bound.kbId);
          for (const kb of runtime.store.library.kbs) if (!candidates.includes(kb.id)) candidates.push(kb.id);
        }
        for (const kbId of candidates) {
          try {
            const { doc } = await runtime.store.getDoc(kbId, docId);
            const content = await runtime.store.readDocContent(kbId, doc, { offset, limit, prefer: doc.mdPath ? 'md' : 'text' });
            const header = [
              `# ${doc.title}`,
              `docId: ${doc.id}｜资料库: ${kbId}｜类型: ${doc.kind}｜状态: ${doc.status === 'ready' ? '可检索' : '待转化'}｜本页 ${offset}-${offset + content.text.length} 字符`,
              doc.summary === '' ? '' : `摘要：${doc.summary}`,
              content.truncated ? '（内容未读完：还有后续，可增大 offset 继续）' : '',
            ]
              .filter((line) => line !== '')
              .join('\n');
            return `${header}\n\n${content.text}`;
          } catch {
            /* 换下一个资料库 */
          }
        }
        return `没有找到文档 ${docId}。可用 kb_list / kb_search 获取有效 docId。`;
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'kb_pending',
      description: '列出尚未转化、因此不可检索的资料，并返回每篇原文的开头片段。转化前可用它判断哪篇值得处理。',
      parameters: {
        kbId: { type: 'string', description: '资料库 id；省略时使用当前对话绑定的资料库。' },
      },
      output: textOutput(),
      async execute(args, exec) {
        await runtime.ready();
        const kbId = await resolveKbId(runtime, args, exec);
        if (kbId === null) return noBindingMessage(runtime);
        const docs = (await runtime.store.listDocs(kbId)).filter((doc) => doc.status !== 'ready');
        if (docs.length === 0) return `资料库 ${kbId} 没有待转化的资料。`;
        const lines = [`待转化 ${docs.length} 篇：`];
        for (const doc of docs.slice(0, 12)) {
          const { doc: raw } = await runtime.store.getDoc(kbId, doc.id);
          const excerpt = await runtime.store.readSourceText(kbId, raw, { limit: 700 });
          lines.push('');
          lines.push(`- ${doc.title}（docId: ${doc.id}，${doc.kind}，${doc.chars} 字符）${doc.error ? `｜上次失败：${doc.error}` : ''}`);
          lines.push(`  片段：${(excerpt.text ?? '').replace(/\s+/g, ' ').slice(0, 500)}`);
        }
        lines.push('');
        lines.push('转化方式：kb_convert 传 docId（用当前默认模型自动整理）；或自己读取原文后，用 kb_write_doc 写入结构化 Markdown。');
        return lines.join('\n');
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'kb_convert',
      description:
        '把资料库中的原文交给当前默认模型，自动整理成可检索的 Markdown（保留章节、生成摘要与标签）。省略 docId 时转化绑定资料库中最新的待转化资料（每次最多 3 篇）。转化完成后文档即可被 kb_search 检索。',
      parameters: {
        docId: { type: 'string', description: '要转化的文档 id；省略时批量处理待转化资料。' },
        kbId: { type: 'string', description: '资料库 id；省略时使用当前对话绑定的资料库。' },
      },
      output: textOutput(),
      timeoutMs: 600000,
      async execute(args, exec) {
        await runtime.ready();
        const kbId = await resolveKbId(runtime, args, exec);
        if (kbId === null) return noBindingMessage(runtime);
        const targets = [];
        if (typeof args?.docId === 'string' && args.docId !== '') targets.push(args.docId);
        else {
          const pending = (await runtime.store.listDocs(kbId)).filter((doc) => doc.status !== 'ready').slice(0, 3);
          targets.push(...pending.map((doc) => doc.id));
        }
        if (targets.length === 0) return `资料库 ${kbId} 没有需要转化的资料。`;
        const lines = [];
        for (const docId of targets) {
          const outcome = await runtime.convertAndWait(kbId, docId, { force: false });
          if (outcome.ok) {
            const doc = outcome.job.result?.doc;
            lines.push(`✔ ${doc?.title ?? docId}：已转化（${doc?.chars ?? 0} 字符）`);
          } else {
            lines.push(`✘ ${outcome.job.title ?? docId}：${outcome.job.error?.message ?? '转化失败'}（${outcome.job.error?.code ?? 'error'}）`);
          }
        }
        if (lines.some((line) => line.startsWith('✘'))) {
          lines.push('');
          lines.push('若自动转化不可用：用 kb_read 或文件阅读工具读取原文，再用 kb_write_doc 写入结构化 Markdown。');
        }
        return lines.join('\n');
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'kb_write_doc',
      description:
        '把整理好的 Markdown 写入资料库，使其成为可检索文档。传 docId 时覆盖该文档（用于把 PDF/扫描件等读入后转化）；不传则新建一篇。内容必须忠实原文，保留章节层级。',
      parameters: {
        title: { type: 'string', required: true, description: '文档标题（会替换导入时的文件名）。' },
        markdown: { type: 'string', required: true, description: '正文 Markdown，建议以 # 标题开头并保留小节。' },
        kbId: { type: 'string', description: '资料库 id；省略时使用当前对话绑定的资料库。' },
        docId: { type: 'string', description: '要覆盖的文档 id；省略时新建文档。' },
        summary: { type: 'string', description: '一句话摘要（≤80 字），用于目录与检索结果。' },
        tags: { type: 'array', items: { type: 'string' }, description: '主题标签，最多 12 个。' },
      },
      output: textOutput(),
      async execute(args, exec) {
        await runtime.ready();
        const kbId = await resolveKbId(runtime, args, exec);
        if (kbId === null) return noBindingMessage(runtime);
        const markdown = String(args?.markdown ?? '');
        if (markdown.trim().length < 2) return 'markdown 不能为空。';
        const title = String(args?.title ?? '').trim();
        if (title === '') return 'title 不能为空。';
        const summary = typeof args?.summary === 'string' ? args.summary : '';
        const tags = Array.isArray(args?.tags) ? args.tags : [];
        const docId = typeof args?.docId === 'string' && args.docId !== '' ? args.docId : null;
        if (docId !== null) {
          const saved = await runtime.store.saveConverted({ kbId, docId, title, markdown, summary, tags, model: 'agent' });
          return `已写入并覆盖：${saved.title}（${saved.id}，${saved.chars} 字符，标签 ${saved.tags.join('、') || '无'}）。现在可以被 kb_search 检索。`;
        }
        const saved = await runtime.store.createConverted({ kbId, title, markdown, summary, tags, model: 'agent' });
        return `已新建：${saved.title}（${saved.id}，${saved.chars} 字符）。现在可以被 kb_search 检索。`;
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'kb_status',
      description: '查看当前对话绑定情况与资料库统计（资料库数量、文档数量、待转化数量）。只读。',
      parameters: {},
      output: textOutput(),
      async execute(_args, exec) {
        await runtime.ready();
        const bound = runtime.bindingOfSync(sessionIdOf(exec));
        const stats = await runtime.store.stats();
        const lines = [
          bound === null ? '当前对话：未绑定资料库' : `当前对话绑定：${bound.title}（${bound.kbId}）`,
          `资料库 ${stats.kbCount} 个｜文档 ${stats.docCount} 篇｜待转化 ${stats.pendingCount} 篇｜绑定会话 ${stats.bindingCount} 个`,
          `数据目录：${stats.dataDir}`,
        ];
        return lines.join('\n');
      },
    }),
  );
}

export { truncateChars };
