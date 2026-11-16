const fs = require('node:fs');
const path = 'lib/store.js';
let source = fs.readFileSync(path, 'utf8');

const startMarker = '  #publicDoc(kb, doc) {';
const start = source.indexOf(startMarker);
if (start < 0) throw new Error('publicDoc start not found');
const tailMarker = 'partial: doc.partial === true,';
const tail = source.indexOf(tailMarker, start);
if (tail < 0) throw new Error('publicDoc tail not found');
const end = source.indexOf('\n  }', tail);
if (end < 0) throw new Error('publicDoc end not found');

const replacement = `  #publicDoc(kb, doc) {
    const totalPages = doc.totalPages ?? 0;
    const visionPages = doc.visionPages ?? 0;
    const sourceChars = doc.sourceChars ?? doc.chars ?? 0;
    const textOffset = doc.textOffset ?? 0;
    // 进度口径按转化方式区分：视觉看页数，文本看字符。partial 每次读取时重新推导，
    // 避免旧数据把「文本已转完」显示成「视觉 0/N 页」。
    const progressMode = doc.conversionMode === 'vision' || visionPages > 0 ? 'vision' : 'text';
    const remainingText = Math.max(0, sourceChars - textOffset);
    const partial =
      doc.status === 'ready' &&
      (progressMode === 'vision' ? totalPages > visionPages : sourceChars > 0 && remainingText > 8);
    return {
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
      totalPages,
      visionPages,
      textOffset,
      sourceChars,
      progressMode,
      partial,
      addedAt: doc.addedAt,
      updatedAt: doc.updatedAt,
    };
  }`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source, 'utf8');
console.log('publicDoc replaced');
