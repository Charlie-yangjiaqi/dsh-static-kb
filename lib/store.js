// 资料库存储层：library.json 是唯一元数据真源，文档正文落普通文件。
//   <dataDir>/library.json                 { version, kbs: [{ ..., docs: [...] }] }
//   <dataDir>/bindings.json                { version, bindings: { [sessionId]: { kbId, boundAt } } }
//   <dataDir>/<kbId>/raw/<docId>.<ext>     用户原始文件
//   <dataDir>/<kbId>/text/<docId>.txt      抽取出的纯文本（供预览/转化输入）
//   <dataDir>/<kbId>/docs/<docId>.md       模型转化后的 Markdown（可检索的正式内容）
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectKind, extractText, extensionOf } from './extract.js';
import { pdfPageCount } from './pdf.js';
import { pdfPageCountRaster } from './raster.js';
import { newId, normalizeText, nowIso, safeSegment, titleFromFilename, truncateChars } from './util.js';

const MAX_RAW_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_CHARS = 4_000_000;
const MAX_SCAN_DOCS = 400;
const MAX_SCAN_CHARS = 2_000_000;

// ------------------------------------------------------------------ helpers

const GENERIC_SOURCE_NAMES = new Set(['粘贴文本', '未命名文档', 'file', 'page']);

const FULLWIDTH_FORBIDDEN = {
  '/': '／',
  '\\': '＼',
  ':': '：',
  '*': '＊',
  '?': '？',
  '"': '＂',
  '<': '＜',
  '>': '＞',
  '|': '｜',
};

/** 去掉 Windows/macOS 不允许出现在文件名里的字符；可读字符换成全角，其余换空格。 */
function sanitizeSegment(input, limit = 120) {
  const mapped = String(input ?? '')
    .replace(/[<>:"/\\|?*]/g, (char) => FULLWIDTH_FORBIDDEN[char] ?? ' ')
    .replace(/[\u0000-\u001f]/g, ' ');
  return mapped
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, limit)
    .trim();
}

/**
 * 转化文件的基础名：LLM 总结的标题 +（原文件名）。
 * 例：数字IGBT控制弧焊电源使用说明书（YD-350-500_manual）.md
 * 没有有意义的原文件名（粘贴文本、agent 写入）时只用标题。
 */
export function convertedBaseName(title, sourceName) {
  const base = sanitizeSegment(title) || '未命名文档';
  const rawSource = String(sourceName ?? '').split(/[\\/]/).pop() ?? '';
  const withoutExtension = rawSource.replace(/\.[A-Za-z0-9]{1,8}$/u, '');
  const source = sanitizeSegment(withoutExtension, 80);
  if (source === '' || source === base || GENERIC_SOURCE_NAMES.has(source)) return base;
  const suffix = `（${source}）`;
  if (base.endsWith(suffix)) return base;
  return `${base}${suffix}`;
}

/** 把基础名变成可用路径（必要时加 (2)、(3) 去重）。 */
async function allocateRel(dataDir, kbId, kb, doc, base, taken) {
  let index = 2;
  let rel = `docs/${base}.md`;
  const isFree = async (candidate) => {
    if (taken.has(candidate)) return false;
    if (candidate === doc?.mdPath) return true;
    try {
      await stat(join(dataDir, kbId, candidate));
      return false;
    } catch {
      return true;
    }
  };
  while (!(await isFree(rel)) && index <= 500) {
    rel = `docs/${base} (${index}).md`;
    index += 1;
  }
  return rel;
}

export class KnowledgeStore {
  constructor(options = {}) {
    this.dataDir = options.dataDir;
    this.logger = options.logger ?? console;
    this.libraryPath = join(this.dataDir, 'library.json');
    this.bindingsPath = join(this.dataDir, 'bindings.json');
    this.library = { version: 1, kbs: [] };
    this.bindings = { version: 1, bindings: {} };
    this.loaded = false;
    this.writeChain = Promise.resolve();
    this.textCache = new Map();
  }

  // ------------------------------------------------------------------ 载入

  async ensureLoaded() {
    if (this.loaded) return;
    await mkdir(this.dataDir, { recursive: true });
    this.library = await readJson(this.libraryPath, { version: 1, kbs: [] });
    if (!Array.isArray(this.library.kbs)) this.library = { version: 1, kbs: [] };
    this.bindings = await readJson(this.bindingsPath, { version: 1, bindings: {} });
    if (typeof this.bindings.bindings !== 'object' || this.bindings.bindings === null) {
      this.bindings = { version: 1, bindings: {} };
    }
    this.loaded = true;
  }

  async flush() {
    await this.ensureLoaded();
    const payload = JSON.stringify(this.library, null, 2);
    const bindingPayload = JSON.stringify(this.bindings, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await writeAtomic(this.libraryPath, payload);
      await writeAtomic(this.bindingsPath, bindingPayload);
    });
    return this.writeChain;
  }

  // --------------------------------------------------------------- 资料库

  async listKbs() {
    await this.ensureLoaded();
    return this.library.kbs.map((kb) => this.#publicKb(kb));
  }

  async getKb(kbId) {
    await this.ensureLoaded();
    return this.library.kbs.find((kb) => kb.id === kbId);
  }

  async createKb({ title, description = '' }) {
    await this.ensureLoaded();
    const name = String(title || '').trim();
    if (name === '') throw badRequest('资料库名称不能为空');
    if (name.length > 60) throw badRequest('资料库名称不能超过 60 个字符');
    const kb = {
      id: newId('kb'),
      title: name,
      description: String(description || '').trim().slice(0, 300),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      docs: [],
    };
    this.library.kbs.push(kb);
    await mkdir(join(this.dataDir, kb.id, 'raw'), { recursive: true });
    await mkdir(join(this.dataDir, kb.id, 'text'), { recursive: true });
    await mkdir(join(this.dataDir, kb.id, 'docs'), { recursive: true });
    await this.flush();
    return this.#publicKb(kb);
  }

  async updateKb(kbId, patch = {}) {
    const kb = await this.requireKb(kbId);
    if (typeof patch.title === 'string' && patch.title.trim() !== '') kb.title = patch.title.trim().slice(0, 60);
    if (typeof patch.description === 'string') kb.description = patch.description.trim().slice(0, 300);
    kb.updatedAt = nowIso();
    await this.flush();
    return this.#publicKb(kb);
  }

  async deleteKb(kbId) {
    await this.ensureLoaded();
    const index = this.library.kbs.findIndex((kb) => kb.id === kbId);
    if (index < 0) throw notFound('资料库不存在');
    this.library.kbs.splice(index, 1);
    for (const [sessionId, binding] of Object.entries(this.bindings.bindings)) {
      if (binding?.kbId === kbId) delete this.bindings.bindings[sessionId];
    }
    await this.flush();
    await rm(join(this.dataDir, kbId), { recursive: true, force: true });
    return { id: kbId };
  }

  // ----------------------------------------------------------------- 文档

  async listDocs(kbId) {
    const kb = await this.requireKb(kbId);
    await this.ensureDocMetadata(kb);
    return kb.docs.map((doc) => this.#publicDoc(kb, doc));
  }

  /** 一次性迁移：补页数、把旧版 `docs/<docId>.md` 改成「标题（原文件名）.md」。 */
  async ensureDocMetadata(kb) {
    let changed = false;
    if (await this.#migrateConvertedNames(kb)) changed = true;
    for (const doc of kb.docs) {
      // 老文档没记录源字符数：用抽取出的文本文件长度补上，用于「仅转化前 N/M 字符」与全量转化。
      if (!Number.isFinite(doc.sourceChars) && typeof doc.textPath === 'string') {
        try {
          const text = await readFile(join(this.dataDir, kb.id, doc.textPath), 'utf8');
          doc.sourceChars = text.length;
          changed = true;
        } catch {
          /* 文本文件缺失时保持未知 */
        }
      }
      if (Number.isFinite(doc.totalPages) && doc.totalPages > 0) continue;
      if (doc.pagesUnknown === true) continue;
      if (doc.kind === 'image') {
        doc.totalPages = 1;
        if (!Number.isFinite(doc.visionPages)) doc.visionPages = doc.conversionMode === 'vision' ? 1 : 0;
        changed = true;
        continue;
      }
      if (doc.kind !== 'pdf') {
        doc.totalPages = 0;
        doc.pagesUnknown = true;
        changed = true;
        continue;
      }
      if (typeof doc.rawPath !== 'string') continue;
      try {
        const buffer = await readFile(join(this.dataDir, kb.id, doc.rawPath));
        // 自研解析器读不出的（加密、对象流里藏页树）交给 pdf.js。
        let count = pdfPageCount(buffer);
        if (count === 0) count = await pdfPageCountRaster(buffer);
        doc.totalPages = count;
        doc.pagesUnknown = count === 0;
        changed = true;
      } catch {
        /* 原始文件缺失时保持未知 */
      }
    }
    if (changed) await this.flush();
  }

  /** 旧版文件名是 docs/<docId>.md；改成可读名后返回 true。 */
  async #migrateConvertedNames(kb) {
    let changed = false;
    for (const doc of kb.docs) {
      if (typeof doc.mdPath !== 'string' || doc.mdPath === '') continue;
      if (!doc.mdPath.startsWith('docs/')) continue;
      const base = convertedBaseName(doc.title, doc.sourceName);
      const wanted = `docs/${base}.md`;
      if (doc.mdPath === wanted) continue;
      // 只迁移「哈希名」这种明显是旧格式的文件，避免覆盖用户手动改过的名字。
      if (doc.mdPath !== `docs/${doc.id}.md`) continue;
      const taken = new Set(
        kb.docs.filter((item) => item.id !== doc.id && typeof item.mdPath === 'string').map((item) => item.mdPath),
      );
      const rel = await allocateRel(this.dataDir, kb.id, kb, doc, base, taken);
      const from = join(this.dataDir, kb.id, doc.mdPath);
      const to = join(this.dataDir, kb.id, rel);
      try {
        await rename(from, to);
      } catch {
        continue; // 文件不在或已迁移
      }
      doc.mdPath = rel;
      changed = true;
    }
    return changed;
  }

  async getDoc(kbId, docId) {
    const kb = await this.requireKb(kbId);
    const doc = kb.docs.find((item) => item.id === docId);
    if (doc === undefined) throw notFound('文档不存在');
    return { kb, doc };
  }

  /** 导入原始文件：落 raw/、抽取纯文本、按抽取质量决定状态。 */
  async addFile({ kbId, name, mime, buffer, source = 'upload' }) {
    const kb = await this.requireKb(kbId);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw badRequest('文件内容为空');
    if (buffer.length > MAX_RAW_BYTES) throw badRequest('文件超过 32 MB 上限');
    const kind = detectKind(name, mime);
    const extension = extensionOf(name) || 'bin';
    const docId = newId('doc');
    const rawRel = `raw/${docId}.${safeSegment(extension, 'bin')}`;
    await mkdir(join(this.dataDir, kb.id, 'raw'), { recursive: true });
    await writeFile(join(this.dataDir, kb.id, rawRel), buffer);

    const extracted = kind === 'image' ? { text: '', quality: { ok: false, ratio: 0, chars: 0 }, note: '图片文件' } : extractText(buffer, kind);
    // PDF 记录总页数，视觉转化只读前 N 页时用来提示「还有多少页没转」。
    const totalPages = kind === 'pdf' ? pdfPageCount(buffer) : kind === 'image' ? 1 : 0;
    const text = extracted.text.slice(0, MAX_TEXT_CHARS);
    let textRel = null;
    if (text !== '') {
      textRel = `text/${docId}.txt`;
      await mkdir(join(this.dataDir, kb.id, 'text'), { recursive: true });
      await writeFile(join(this.dataDir, kb.id, textRel), text, 'utf8');
    }
    const doc = {
      id: docId,
      title: titleFromFilename(name),
      kind,
      status: text === '' ? 'pending' : 'imported',
      source,
      sourceName: String(name || '').slice(0, 200),
      sourceUrl: null,
      bytes: buffer.length,
      chars: text.length,
      summary: '',
      tags: [],
      rawPath: rawRel,
      textPath: textRel,
      mdPath: null,
      note: extracted.note ?? null,
      error: null,
      model: null,
      textQuality: extracted.quality?.ratio ?? 0,
      conversionMode: null,
      visionCheck: null,
      sourceChars: text.length,
      totalPages,
      visionPages: 0,
      textOffset: 0,
      partial: false,
      addedAt: nowIso(),
      updatedAt: nowIso(),
    };
    kb.docs.unshift(doc);
    kb.updatedAt = nowIso();
    await this.flush();
    return { doc: this.#publicDoc(kb, doc), extraction: extracted.quality };
  }

  /** 粘贴文本 / 网页正文：直接成为纯文本来源。 */
  async addText({ kbId, title, text, sourceUrl = null, source = 'paste' }) {
    const kb = await this.requireKb(kbId);
    const body = normalizeText(text);
    if (body.length < 2) throw badRequest('文本内容太短');
    if (body.length > MAX_TEXT_CHARS) throw badRequest('文本超过 400 万字符上限');
    const docId = newId('doc');
    const textRel = `text/${docId}.txt`;
    await mkdir(join(this.dataDir, kb.id, 'text'), { recursive: true });
    await writeFile(join(this.dataDir, kb.id, textRel), body, 'utf8');
    const doc = {
      id: docId,
      title: String(title || '').trim().slice(0, 120) || titleFromFilename(sourceUrl || '粘贴文本'),
      kind: 'markdown',
      status: 'imported',
      source,
      sourceName: sourceUrl ?? '粘贴文本',
      sourceUrl: sourceUrl ?? null,
      bytes: Buffer.byteLength(body, 'utf8'),
      chars: body.length,
      summary: '',
      tags: [],
      rawPath: null,
      textPath: textRel,
      mdPath: null,
      note: null,
      error: null,
      model: null,
      textQuality: 1,
      conversionMode: null,
      visionCheck: null,
      sourceChars: body.length,
      totalPages: 0,
      visionPages: 0,
      textOffset: 0,
      partial: false,
      addedAt: nowIso(),
      updatedAt: nowIso(),
    };
    kb.docs.unshift(doc);
    kb.updatedAt = nowIso();
    await this.flush();
    return { doc: this.#publicDoc(kb, doc) };
  }

  /** 从网址抓取的页面：保留原始 HTML 以便预览，并记录来源网址。 */
  async addRemotePage({ kbId, url, name, buffer, title }) {
    const result = await this.addFile({ kbId, name, mime: 'text/html', buffer, source: 'url' });
    const { kb, doc } = await this.getDoc(kbId, result.doc.id);
    doc.sourceUrl = String(url || '').slice(0, 2000);
    if (typeof title === 'string' && title.trim() !== '') doc.title = title.trim().slice(0, 160);
    kb.updatedAt = nowIso();
    await this.flush();
    return { doc: this.#publicDoc(kb, doc), extraction: result.extraction };
  }

  /** 写入模型转化后的 Markdown；同一文档可重复转化（覆盖）。 */
  async saveConverted({
    kbId,
    docId,
    title,
    markdown,
    summary = '',
    tags = [],
    model = null,
    conversionMode = null,
    visionCheck = null,
    totalPages = null,
    visionPages = null,
    textOffset = null,
    partial = null,
  }) {
    const { kb, doc } = await this.getDoc(kbId, docId);
    const body = String(markdown || '').trim();
    if (body.length < 2) throw badRequest('转化结果为空');
    const nextTitle = String(title || '').trim().slice(0, 160) || doc.title;
    // 转化文件按「内容标题（原文件名）.md」命名，方便直接在文件管理器里认出来。
    const base = convertedBaseName(nextTitle, doc.sourceName);
    const taken = new Set(
      kb.docs.filter((item) => item.id !== doc.id && typeof item.mdPath === 'string').map((item) => item.mdPath),
    );
    const mdRel = await allocateRel(this.dataDir, kb.id, kb, doc, base, taken);
    await mkdir(join(this.dataDir, kb.id, 'docs'), { recursive: true });
    await writeFile(join(this.dataDir, kb.id, mdRel), body, 'utf8');
    // 改名后删掉旧文件，避免 docs/ 里残留一堆同名旧稿。
    if (typeof doc.mdPath === 'string' && doc.mdPath !== '' && doc.mdPath !== mdRel) {
      await rm(join(this.dataDir, kb.id, doc.mdPath), { force: true }).catch(() => {});
    }
    doc.mdPath = mdRel;
    doc.title = nextTitle;
    doc.summary = String(summary || '').trim().slice(0, 400);
    doc.tags = Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12) : [];
    doc.chars = body.length;
    doc.status = 'ready';
    doc.error = null;
    doc.model = model;
    doc.conversionMode = conversionMode;
    doc.visionCheck = visionCheck;
    if (Number.isFinite(totalPages)) doc.totalPages = totalPages;
    if (Number.isFinite(visionPages)) doc.visionPages = visionPages;
    if (Number.isFinite(textOffset)) doc.textOffset = textOffset;
    doc.partial = partial === null ? Boolean(doc.partial) : partial === true;
    doc.updatedAt = nowIso();
    kb.updatedAt = nowIso();
    this.textCache.delete(doc.id);
    await this.flush();
    return this.#publicDoc(kb, doc);
  }

  /** 新建一篇由模型直接撰写的资料（不依赖原始文件）。 */
  async createConverted({ kbId, title, markdown, summary = '', tags = [], model = null, source = 'agent' }) {
    const kb = await this.requireKb(kbId);
    const created = await this.addText({ kbId: kb.id, title, text: markdown, source });
    return this.saveConverted({ kbId: kb.id, docId: created.doc.id, title, markdown, summary, tags, model });
  }

  /** 清除失败标记（例如任务被取消后，文档其实还是原来的可用状态）。 */
  async clearDocError(kbId, docId) {
    const { kb, doc } = await this.getDoc(kbId, docId);
    if (doc.error === null) return;
    doc.error = null;
    doc.updatedAt = nowIso();
    kb.updatedAt = nowIso();
    await this.flush();
  }

  /** 记录一次转化失败，保留原文供重试。 */
  async markDocError(kbId, docId, message) {
    const { kb, doc } = await this.getDoc(kbId, docId);
    doc.error = String(message || '').slice(0, 500);
    doc.status = doc.mdPath ? 'ready' : 'pending';
    doc.updatedAt = nowIso();
    kb.updatedAt = nowIso();
    await this.flush();
  }

  async deleteDoc(kbId, docId) {
    const { kb, doc } = await this.getDoc(kbId, docId);
    kb.docs = kb.docs.filter((item) => item.id !== docId);
    kb.updatedAt = nowIso();
    this.textCache.delete(docId);
    await this.flush();
    for (const rel of [doc.rawPath, doc.textPath, doc.mdPath]) {
      if (typeof rel === 'string' && rel !== '') await rm(join(this.dataDir, kb.id, rel), { force: true });
    }
    return { id: docId };
  }

  // ------------------------------------------------------------- 文档内容

  /** 用当前抽取器重新读取原始文件（PDF 解析器升级后，老文档靠它补回正文）。 */
  async reextract(kbId, docId) {
    const { kb, doc } = await this.getDoc(kbId, docId);
    if (typeof doc.rawPath !== 'string' || doc.rawPath === '') return { text: '', quality: null };
    let buffer;
    try {
      buffer = await readFile(join(this.dataDir, kb.id, doc.rawPath));
    } catch {
      return { text: '', quality: null };
    }
    const extracted = extractText(buffer, doc.kind);
    const text = extracted.text.slice(0, MAX_TEXT_CHARS);
    if (text === '') {
      doc.status = 'pending';
      doc.error = '从原始文件里仍然抽不出文字（可能是扫描件，需要模型读图或 OCR）';
      doc.updatedAt = nowIso();
      kb.updatedAt = nowIso();
      await this.flush();
      return { text: '', quality: extracted.quality };
    }
    const rel = `text/${doc.id}.txt`;
    await mkdir(join(this.dataDir, kb.id, 'text'), { recursive: true });
    await writeFile(join(this.dataDir, kb.id, rel), text, 'utf8');
    doc.textPath = rel;
    doc.chars = text.length;
    doc.sourceChars = text.length;
    doc.status = 'imported';
    doc.error = null;
    doc.note = extracted.note ?? doc.note;
    doc.textQuality = extracted.quality?.ratio ?? 0;
    doc.updatedAt = nowIso();
    kb.updatedAt = nowIso();
    this.textCache.delete(doc.id);
    await this.flush();
    return { text, quality: extracted.quality };
  }

  /** 读取已转化的 Markdown（面板「打开转化文件」用）。 */
  async readMarkdown(kbId, docId, { limit = 400000 } = {}) {
    const { doc } = await this.getDoc(kbId, docId);
    if (typeof doc.mdPath !== 'string' || doc.mdPath === '') return { text: '', truncated: false, doc };
    try {
      const content = await readFile(join(this.dataDir, kbId, doc.mdPath), 'utf8');
      return { ...truncateChars(content, limit), doc };
    } catch {
      return { text: '', truncated: false, doc };
    }
  }

  /** 读取文档正文：优先模型转化后的 Markdown，其次抽取的纯文本。 */
  async readDocContent(kbId, doc, { offset = 0, limit = 12000, prefer = 'md' } = {}) {
    const rel = prefer === 'md' ? doc.mdPath : doc.textPath;
    let content = '';
    if (typeof rel === 'string' && rel !== '') {
      try {
        content = await readFile(join(this.dataDir, kbId, rel), 'utf8');
      } catch {
        content = '';
      }
    }
    return truncateChars(content.slice(Math.max(0, offset)), Math.max(500, Math.min(30000, limit)));
  }

  /** 读取可用于转化的原文（优先抽取文本，没有则读 Markdown）；不套用预览的分页上限。 */
  async readSourceText(kbId, doc, { limit = 6_000_000 } = {}) {
    const rel = doc.textPath ?? doc.mdPath;
    if (typeof rel !== 'string' || rel === '') return { text: '', truncated: false };
    try {
      const content = await readFile(join(this.dataDir, kbId, rel), 'utf8');
      return truncateChars(content, Math.max(1000, limit));
    } catch {
      return { text: '', truncated: false };
    }
  }

  /** 读取某个文档的可检索全文，带 mtime 缓存。 */
  async #searchableText(kbId, doc) {
    const rel = doc.mdPath ?? doc.textPath;
    if (typeof rel !== 'string' || rel === '') return '';
    const path = join(this.dataDir, kbId, rel);
    let mtime = 0;
    try {
      mtime = (await stat(path)).mtimeMs;
    } catch {
      return '';
    }
    const cacheKey = `${path}:${mtime}`;
    const cached = this.textCache.get(cacheKey);
    if (cached !== undefined) return cached;
    let text = '';
    try {
      text = await readFile(path, 'utf8');
    } catch {
      text = '';
    }
    text = text.slice(0, MAX_SCAN_CHARS);
    this.textCache.set(cacheKey, text);
    if (this.textCache.size > 600) this.textCache.clear();
    return text;
  }

  // --------------------------------------------------------------- 检索

  async search({ kbId, query, limit = 6 }) {
    const kb = await this.requireKb(kbId);
    const terms = tokenizeQuery(query);
    if (terms.length === 0) return { kbId, query, results: [], scannedDocs: 0 };
    const docs = kb.docs.filter((doc) => doc.status === 'ready').slice(0, MAX_SCAN_DOCS);
    const results = [];
    for (const doc of docs) {
      const body = await this.#searchableText(kb.id, doc);
      if (body === '') continue;
      const haystack = body.toLowerCase();
      let score = 0;
      let firstHit = -1;
      for (const term of terms) {
        let from = 0;
        let hits = 0;
        while (hits < 40) {
          const at = haystack.indexOf(term, from);
          if (at < 0) break;
          hits += 1;
          if (firstHit < 0 || at < firstHit) firstHit = at;
          from = at + term.length;
        }
        if (hits > 0) score += hits * (doc.mdPath ? 2 : 1);
      }
      const titleLower = doc.title.toLowerCase();
      for (const term of terms) if (titleLower.includes(term)) score += 12;
      for (const tag of doc.tags) if (terms.some((term) => tag.toLowerCase().includes(term))) score += 6;
      if (score <= 0 || firstHit < 0) continue;
      results.push({
        docId: doc.id,
        title: doc.title,
        kind: doc.kind,
        status: doc.status,
        score,
        summary: doc.summary,
        tags: doc.tags,
        snippet: makeSnippet(body, firstHit),
      });
    }
    results.sort((left, right) => right.score - left.score);
    return { kbId, query, results: results.slice(0, Math.max(1, Math.min(20, limit))), scannedDocs: docs.length };
  }

  // --------------------------------------------------------------- 绑定

  async bind(sessionId, kbId) {
    await this.ensureLoaded();
    const id = String(sessionId || '').trim();
    if (id === '') throw badRequest('缺少会话 ID');
    if (kbId === null || kbId === '' || kbId === undefined) {
      delete this.bindings.bindings[id];
      await this.flush();
      return { sessionId: id, kbId: null };
    }
    const kb = await this.requireKb(kbId);
    this.bindings.bindings[id] = { kbId: kb.id, boundAt: nowIso() };
    await this.flush();
    return { sessionId: id, kbId: kb.id, title: kb.title };
  }

  async bindingOf(sessionId) {
    await this.ensureLoaded();
    const binding = this.bindings.bindings[String(sessionId || '')];
    if (binding === undefined) return null;
    const kb = this.library.kbs.find((item) => item.id === binding.kbId);
    if (kb === undefined) return null;
    return { kbId: kb.id, title: kb.title, boundAt: binding.boundAt };
  }

  /** 系统提示词用：绑定资料库的紧凑目录。 */
  async catalogOf(kbId, { maxDocs = 60 } = {}) {
    const kb = await this.getKb(kbId);
    if (kb === undefined) return null;
    const ready = kb.docs.filter((doc) => doc.status === 'ready');
    const pending = kb.docs.filter((doc) => doc.status !== 'ready');
    const lines = ready.slice(0, maxDocs).map((doc) => {
      const summary = doc.summary === '' ? '' : ` — ${doc.summary}`;
      return `- ${doc.title}${summary}`;
    });
    return {
      id: kb.id,
      title: kb.title,
      total: kb.docs.length,
      ready: ready.length,
      pending: pending.length,
      truncated: ready.length > maxDocs,
      lines,
    };
  }

  // ------------------------------------------------------------- 内部工具

  async requireKb(kbId) {
    await this.ensureLoaded();
    const kb = this.library.kbs.find((item) => item.id === kbId);
    if (kb === undefined) throw notFound('资料库不存在');
    return kb;
  }

  #publicKb(kb) {
    const ready = kb.docs.filter((doc) => doc.status === 'ready').length;
    const pending = kb.docs.length - ready;
    return {
      id: kb.id,
      title: kb.title,
      description: kb.description,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
      docCount: kb.docs.length,
      readyCount: ready,
      pendingCount: pending,
    };
  }

  /** 对外暴露文档视图（供 runtime 生成任务结果）。 */
  publicDoc(kb, doc) {
    return this.#publicDoc(kb, doc);
  }

  #publicDoc(kb, doc) {    return {
      id: doc.id,
      kbId: kb.id,
      title: doc.title,
      kind: doc.kind,
      status: doc.status,
      source: doc.source,
      sourceName: doc.sourceName,
      sourceUrl: doc.sourceUrl,
      bytes: doc.bytes,
      chars: doc.chars,
      summary: doc.summary,
      tags: doc.tags,
      hasRaw: typeof doc.rawPath === 'string',
      hasText: typeof doc.textPath === 'string',
      hasMarkdown: typeof doc.mdPath === 'string',
      note: doc.note,
      error: doc.error,
      model: doc.model,
      textQuality: doc.textQuality ?? null,
      conversionMode: doc.conversionMode ?? null,
      visionCheck: doc.visionCheck ?? null,
      totalPages: doc.totalPages ?? 0,
      visionPages: doc.visionPages ?? 0,
      textOffset: doc.textOffset ?? 0,
      sourceChars: doc.sourceChars ?? doc.chars ?? 0,
      partial: doc.partial === true,
      addedAt: doc.addedAt,
      updatedAt: doc.updatedAt,
    };
  }

  /** 供路由读取原始文件字节。 */
  async readRaw(kbId, docId) {
    const { kb, doc } = await this.getDoc(kbId, docId);
    if (typeof doc.rawPath !== 'string') throw notFound('该文档没有原始文件');
    const buffer = await readFile(join(this.dataDir, kb.id, doc.rawPath));
    return { buffer, doc };
  }

  /** 把原始文件按 UTF-8 读出（HTML 预览用），上限 1 MB。 */
  async readRawText(kbId, docId, { limit = 1_000_000 } = {}) {
    const { kb, doc } = await this.getDoc(kbId, docId);
    if (typeof doc.rawPath !== 'string') return { text: '', truncated: false };
    const buffer = await readFile(join(this.dataDir, kb.id, doc.rawPath));
    return { text: buffer.subarray(0, limit).toString('utf8'), truncated: buffer.length > limit };
  }

  /** 供路由读取正文（预览用）。 */
  async readPreview(kbId, docId, options) {
    const { kb, doc } = await this.getDoc(kbId, docId);
    const content = await this.readDocContent(kb.id, doc, { ...options, prefer: doc.mdPath ? 'md' : 'text' });
    return { doc: this.#publicDoc(kb, doc), ...content };
  }

  /** 目录信息，用于面板与排查。 */
  async stats() {
    await this.ensureLoaded();
    return {
      dataDir: this.dataDir,
      kbCount: this.library.kbs.length,
      docCount: this.library.kbs.reduce((sum, kb) => sum + kb.docs.length, 0),
      pendingCount: this.library.kbs.reduce((sum, kb) => sum + kb.docs.filter((doc) => doc.status !== 'ready').length, 0),
      bindingCount: Object.keys(this.bindings.bindings).length,
    };
  }
}

// ------------------------------------------------------------------ helpers

function tokenizeQuery(query) {
  const text = String(query || '').toLowerCase().trim();
  if (text === '') return [];
  const terms = new Set();
  for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
    if (word.length === 0) continue;
    if (/[\u3400-\u9fff]/.test(word)) {
      if (word.length === 1) terms.add(word);
      for (let i = 0; i + 1 < word.length; i += 1) terms.add(word.slice(i, i + 2));
      terms.add(word);
    } else if (word.length >= 2) {
      terms.add(word);
    }
  }
  return [...terms].slice(0, 24);
}

function makeSnippet(body, position) {
  const start = Math.max(0, position - 100);
  const end = Math.min(body.length, position + 220);
  const snippet = body.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${snippet}${end < body.length ? '…' : ''}`;
}

async function readJson(path, fallback) {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function writeAtomic(path, content) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}

function badRequest(message) {
  return Object.assign(new Error(message), { code: 'bad-request', status: 400 });
}

function notFound(message) {
  return Object.assign(new Error(message), { code: 'not-found', status: 404 });
}

export { badRequest, notFound, tokenizeQuery };
