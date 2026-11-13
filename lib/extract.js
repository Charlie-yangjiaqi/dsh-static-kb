// 原文抽取：把用户放进资料库的各类文件转成「纯文本」。
// 纯文本既用于面板预览，也是 LLM 转化的输入；各格式都做质量门禁，
// 抽不出可信文字时返回空串，让文档停在「待转化」，由模型通过工具读取原文。
import { inflateSync, constants as zlibConstants } from 'node:zlib';
import { openZip } from './zip.js';
import { decodeEntities, htmlToText, normalizeText, stripTags, textQuality } from './util.js';

const KIND_BY_EXTENSION = new Map([
  ['pdf', 'pdf'],
  ['html', 'html'],
  ['htm', 'html'],
  ['xhtml', 'html'],
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['txt', 'text'],
  ['text', 'text'],
  ['log', 'text'],
  ['epub', 'epub'],
  ['docx', 'docx'],
  ['json', 'json'],
  ['csv', 'csv'],
  ['tsv', 'csv'],
  ['png', 'image'],
  ['jpg', 'image'],
  ['jpeg', 'image'],
  ['webp', 'image'],
  ['gif', 'image'],
  ['svg', 'image'],
]);

export function extensionOf(filename) {
  const base = String(filename || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

export function detectKind(filename, mime) {
  const byExtension = KIND_BY_EXTENSION.get(extensionOf(filename));
  if (byExtension !== undefined) return byExtension;
  const type = String(mime || '').toLowerCase();
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('html')) return 'html';
  if (type.includes('markdown')) return 'markdown';
  if (type.startsWith('text/')) return 'text';
  if (type.includes('epub')) return 'epub';
  if (type.includes('wordprocessingml')) return 'docx';
  if (type.startsWith('image/')) return 'image';
  return 'other';
}

/**
 * 抽取纯文本。
 * @returns {{ text: string, quality: { ok: boolean, ratio: number, chars: number }, note: string | null }}
 */
export function extractText(buffer, kind) {
  let text = '';
  let note = null;
  try {
    switch (kind) {
      case 'html':
        text = extractHtml(buffer);
        break;
      case 'docx':
        text = extractDocx(buffer);
        break;
      case 'epub':
        text = extractEpub(buffer);
        break;
      case 'pdf':
        text = extractPdf(buffer);
        note = 'PDF 文字层抽取；扫描版或 CID 字体可能不完整。';
        break;
      case 'markdown':
      case 'text':
      case 'json':
      case 'csv':
      case 'other':
        text = normalizeText(decodeUtf8(buffer));
        break;
      case 'image':
        text = '';
        note = '图片文件无法直接转文字。';
        break;
      default:
        text = normalizeText(decodeUtf8(buffer));
    }
  } catch (error) {
    note = `抽取失败：${error instanceof Error ? error.message : String(error)}`;
    text = '';
  }
  const quality = textQuality(text);
  // 只有 PDF 需要「足够长 + 可打印比例」的双重门禁（可能是扫描件或 CID 字体乱码）；
  // 其余格式本身就是文本容器，只要有可信字符就接受，长度交给使用方决定。
  const accepted = kind === 'pdf' ? quality.ok : quality.chars > 0 && quality.ratio >= 0.7;
  return {
    text: accepted ? text : '',
    quality,
    note,
  };
}

function decodeUtf8(buffer) {
  const text = buffer.toString('utf8');
  // UTF-8 解码出现大量替换符说明不是 UTF-8（例如 GBK 的 TXT）。
  const replacement = (text.match(/\ufffd/g) || []).length;
  if (replacement > Math.max(3, text.length * 0.01)) {
    try {
      return new TextDecoder('gb18030').decode(buffer);
    } catch {
      return text;
    }
  }
  return text;
}

function extractHtml(buffer) {
  const raw = decodeUtf8(buffer);
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(raw)?.[1] ?? raw;
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1]?.trim();
  const text = htmlToText(body);
  return title === undefined ? text : `${text}`;
}

function extractDocx(buffer) {
  const zip = openZip(buffer);
  const xml = zip.read('word/document.xml');
  if (xml === undefined) return '';
  const document = xml.toString('utf8');
  const paragraphs = [];
  const blockRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let match;
  while ((match = blockRe.exec(document)) !== null) {
    const inner = match[1];
    let line = '';
    const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
    let piece;
    while ((piece = textRe.exec(inner)) !== null) {
      if (piece[1] !== undefined) line += decodeEntities(piece[1]);
      else line += ' ';
    }
    paragraphs.push(line.trim());
  }
  return normalizeText(paragraphs.join('\n'));
}

function extractEpub(buffer) {
  const zip = openZip(buffer);
  let opfPath = 'OEBPS/content.opf';
  const container = zip.read('META-INF/container.xml')?.toString('utf8') ?? '';
  const rootfile = /<rootfile\b[^>]*full-path="([^"]+)"/i.exec(container)?.[1];
  if (rootfile !== undefined) opfPath = rootfile;
  const opf = zip.read(opfPath)?.toString('utf8') ?? '';
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const manifest = new Map();
  const itemRe = /<item\b([^>]*)\/?>/gi;
  let item;
  while ((item = itemRe.exec(opf)) !== null) {
    const attrs = item[1];
    const id = /\bid="([^"]+)"/i.exec(attrs)?.[1];
    const href = /\bhref="([^"]+)"/i.exec(attrs)?.[1];
    if (id !== undefined && href !== undefined) manifest.set(id, decodeEntities(href));
  }
  const spineIds = [];
  const spine = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(opf)?.[1] ?? '';
  const refRe = /<itemref\b[^>]*idref="([^"]+)"/gi;
  let ref;
  while ((ref = refRe.exec(spine)) !== null) spineIds.push(ref[1]);

  const files = spineIds.map((id) => manifest.get(id)).filter((href) => typeof href === 'string');
  if (files.length === 0) {
    for (const name of zip.names) if (/\.(x?html|htm)$/i.test(name) && !name.startsWith('META-INF/')) files.push(name.replace(baseDir, ''));
  }
  const sections = [];
  for (const href of files.slice(0, 400)) {
    const clean = href.split('#')[0];
    const entry = zip.read(`${baseDir}${clean}`) ?? zip.read(clean);
    if (entry === undefined) continue;
    const text = htmlToText(entry.toString('utf8'));
    if (text !== '') sections.push(text);
  }
  return normalizeText(sections.join('\n\n'));
}

// ---------------------------------------------------------------------------
// PDF：扫描流对象 → inflate → 解析 BT/ET 内的文本操作符。
// ---------------------------------------------------------------------------

const TRAILER_WHITESPACE = new Set([' ', '\n', '\r', '\t', '\f', '\u0000']);

function decodePdfString(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
    return out;
  }
  let out = '';
  for (const byte of bytes) out += byte >= 0x20 || byte === 0x0a || byte === 0x09 ? String.fromCharCode(byte) : ' ';
  return out;
}

function readLiteralString(source, start) {
  const bytes = [];
  let depth = 1;
  let index = start;
  while (index < source.length && depth > 0) {
    const ch = source[index];
    if (ch === '\\') {
      const next = source[index + 1];
      index += 2;
      switch (next) {
        case 'n': bytes.push(0x0a); break;
        case 'r': bytes.push(0x0d); break;
        case 't': bytes.push(0x09); break;
        case 'b': bytes.push(0x08); break;
        case 'f': bytes.push(0x0c); break;
        case '(': bytes.push(0x28); break;
        case ')': bytes.push(0x29); break;
        case '\\': bytes.push(0x5c); break;
        case '\n': break;
        case '\r': if (source[index] === '\n') index += 1; break;
        default: {
          if (/[0-7]/.test(next ?? '')) {
            let octal = next;
            for (let extra = 0; extra < 2 && /[0-7]/.test(source[index] ?? ''); extra += 1) {
              octal += source[index];
              index += 1;
            }
            bytes.push(Number.parseInt(octal, 8) & 0xff);
          } else if (next !== undefined) {
            bytes.push(next.charCodeAt(0) & 0xff);
          }
        }
      }
      continue;
    }
    if (ch === '(') { depth += 1; bytes.push(0x28); index += 1; continue; }
    if (ch === ')') { depth -= 1; if (depth === 0) { index += 1; break; } bytes.push(0x29); index += 1; continue; }
    bytes.push(ch.charCodeAt(0) & 0xff);
    index += 1;
  }
  return { bytes, end: index };
}

function readHexString(source, start) {
  const end = source.indexOf('>', start);
  if (end < 0) return { bytes: [], end: start };
  const digits = source.slice(start, end).replace(/[^0-9a-fA-F]/g, '');
  const bytes = [];
  for (let i = 0; i + 1 < digits.length; i += 2) bytes.push(Number.parseInt(digits.slice(i, i + 2), 16));
  return { bytes, end: end + 1 };
}

function extractTextFromContentStream(source) {
  let out = '';
  let index = 0;
  let pendingNewline = false;
  let lastY = null;
  while (index < source.length) {
    const ch = source[index];
    if (ch === '(') {
      const { bytes, end } = readLiteralString(source, index + 1);
      out += decodePdfString(bytes);
      index = end;
      continue;
    }
    if (ch === '<' && source[index + 1] !== '<') {
      const { bytes, end } = readHexString(source, index + 1);
      out += decodePdfString(bytes);
      index = end;
      continue;
    }
    if (ch === '[') {
      // TJ 数组：字符串之间的负数挪动代表词间距。
      const close = source.indexOf(']', index);
      if (close > 0) {
        const inner = source.slice(index + 1, close);
        const parts = inner.split(/(?<=\S)\s+(?=[-(<]|[-+]?\d)/);
        for (const part of parts) {
          if (part.startsWith('(')) out += decodePdfString(readLiteralString(part, 1).bytes);
          else if (part.startsWith('<')) out += decodePdfString(readHexString(part, 1).bytes);
          else if (/[-+]?\d+(\.\d+)?/.test(part) && Number.parseFloat(part) < -120) out += ' ';
        }
        index = close + 1;
        continue;
      }
    }
    if (ch === 'T' && (source[index + 1] === 'd' || source[index + 1] === 'D')) {
      const rest = source.slice(index, index + 80);
      const numbers = rest.match(/[-+]?\d+(?:\.\d+)?/g);
      if (numbers !== null && numbers.length >= 2) {
        const y = Number.parseFloat(numbers[1]);
        if (lastY !== null && Math.abs(y - lastY) > 0.8) out += '\n';
      }
      lastY = numbers === null ? lastY : Number.parseFloat(numbers[1]);
      index += 2;
      continue;
    }
    if ((ch === 'T' && source[index + 1] === '*') || ch === "'" || ch === '"') {
      out += '\n';
      index += ch === 'T' ? 2 : 1;
      continue;
    }
    if (ch === 'B' && source[index + 1] === 'T') { pendingNewline = false; index += 2; continue; }
    if (ch === 'E' && source[index + 1] === 'T') { out += '\n'; index += 2; continue; }
    if (TRAILER_WHITESPACE.has(ch)) { index += 1; continue; }
    if (pendingNewline) { out += '\n'; pendingNewline = false; }
    index += 1;
  }
  return out;
}

function extractPdf(buffer) {
  const latin = buffer.toString('latin1');
  const chunks = [];
  let index = 0;
  while (chunks.length < 4000) {
    const marker = latin.indexOf('stream', index);
    if (marker < 0) break;
    let dataStart = marker + 6;
    if (latin[dataStart] === '\r') dataStart += 1;
    if (latin[dataStart] === '\n') dataStart += 1;
    const markerEnd = latin.indexOf('endstream', dataStart);
    if (markerEnd < 0) break;
    const slice = buffer.subarray(dataStart, markerEnd);
    let decoded = null;
    try {
      decoded = inflateSync(slice, { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: 32 * 1024 * 1024 });
    } catch {
      decoded = null;
    }
    if (decoded === null) decoded = slice;
    const text = decoded.toString('latin1');
    if (text.includes('BT') && (text.includes('Tj') || text.includes('TJ'))) {
      chunks.push(extractTextFromContentStream(text));
    }
    index = markerEnd + 9;
  }
  return normalizeText(chunks.join('\n'));
}

export { stripTags };
