// Office 文档抽取：
// - .xlsx / .pptx：OOXML（zip + XML），无第三方依赖，直接解析
// - .xls：BIFF8，交给 SheetJS
// - .doc：Word 97-2003，交给 word-extractor
// - .ppt：PowerPoint 97-2003，用自研 CFB + 记录遍历取文本
import { openZip } from './zip.js';
import { isCfb, openCfb } from './cfb.js';

const MAX_SHEET_ROWS = 20000;
const MAX_SHEET_COLS = 80;

function decodeXmlEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => safeChar(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => safeChar(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function safeChar(code) {
  try {
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  } catch {
    return '';
  }
}

function columnIndex(cellRef) {
  const letters = /^([A-Z]+)/.exec(String(cellRef || ''))?.[1] ?? '';
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function textOf(xml, tag) {
  const parts = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  let match;
  while ((match = re.exec(xml)) !== null) parts.push(decodeXmlEntities(match[1]));
  return parts.join('');
}

/** 解析一个 XML 标签里的 key="value" 属性（顺序无关）。 */
function attrsOf(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = decodeXmlEntities(match[2]);
  }
  return attrs;
}

/** 同一份 rels 文档里 Id → Target 的映射。 */
function parseRels(xml) {
  const map = new Map();
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const attrs = attrsOf(match[0]);
    if (typeof attrs.Id === 'string' && typeof attrs.Target === 'string') map.set(attrs.Id, attrs.Target);
  }
  return map;
}

// ------------------------------------------------------------------- XLSX

export function extractXlsx(buffer) {
  const zip = openZip(buffer);
  if (zip.names.length === 0) return '';
  const workbook = zip.read('xl/workbook.xml')?.toString('utf8') ?? '';
  const relsXml = zip.read('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const rels = new Map();
  for (const [id, target] of parseRels(relsXml)) {
    rels.set(id, target.replace(/^\/xl\//, '').replace(/^\.\//, ''));
  }

  const shared = [];
  const sharedXml = zip.read('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  for (const match of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(textOf(match[1], 't'));
  }

  const sheets = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const attrs = attrsOf(match[0].replace(/\/>$/, '>'));
    const name = attrs.name ?? '';
    const target = attrs['r:id'] !== undefined ? rels.get(attrs['r:id']) : undefined;
    if (target !== undefined) sheets.push({ name, path: `xl/${target}` });
  }
  if (sheets.length === 0) {
    for (const path of zip.names.filter((item) => /^xl\/worksheets\/sheet\d+\.xml$/.test(item)).sort()) {
      sheets.push({ name: path.replace(/^.*\//, '').replace(/\.xml$/, ''), path });
    }
  }

  const blocks = [];
  for (const sheet of sheets) {
    const xml = zip.read(sheet.path)?.toString('utf8') ?? '';
    if (xml === '') continue;
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const column = ref === undefined ? row.length : columnIndex(ref);
        let value = '';
        if (type === 'inlineStr') {
          value = textOf(body, 't');
        } else if (type === 's') {
          const index = Number.parseInt(textOf(body, 'v'), 10);
          value = Number.isFinite(index) ? shared[index] ?? '' : '';
        } else {
          value = textOf(body, 'v');
        }
        if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
        if (value !== '') row[column] = value.replace(/[\t\r\n]+/g, ' ');
      }
      if (row.some((cell) => cell !== undefined && cell !== '')) rows.push(row);
      if (rows.length >= MAX_SHEET_ROWS) break;
    }
    if (rows.length === 0) continue;
    const lines = [`## 工作表：${sheet.name}`];
    for (const row of rows) {
      lines.push(row.slice(0, MAX_SHEET_COLS).map((cell) => cell ?? '').join('\t'));
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n').trim();
}

// ------------------------------------------------------------------- PPTX

export function extractPptx(buffer) {
  const zip = openZip(buffer);
  if (zip.names.length === 0) return '';
  const presentation = zip.read('ppt/presentation.xml')?.toString('utf8') ?? '';
  const relsXml = zip.read('ppt/_rels/presentation.xml.rels')?.toString('utf8') ?? '';
  const rels = new Map();
  for (const [id, target] of parseRels(relsXml)) {
    rels.set(id, target.replace(/^\/ppt\//, '').replace(/^\.\//, ''));
  }
  const order = [];
  for (const match of presentation.matchAll(/<p:sldId\b[^>]*>/g)) {
    const attrs = attrsOf(match[0]);
    const target = rels.get(attrs['r:id']);
    if (target !== undefined) order.push(`ppt/${target}`);
  }
  const slides = order.length > 0
    ? order
    : zip.names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((left, right) => {
        const a = Number(/(\d+)/.exec(left)?.[1] ?? 0);
        const b = Number(/(\d+)/.exec(right)?.[1] ?? 0);
        return a - b;
      });

  const blocks = [];
  for (const [index, path] of slides.entries()) {
    const xml = zip.read(path)?.toString('utf8') ?? '';
    if (xml === '') continue;
    const paragraphs = [];
    for (const match of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
      const line = textOf(match[1], 'a:t').replace(/\s+/g, ' ').trim();
      if (line !== '') paragraphs.push(line);
    }
    if (paragraphs.length === 0) continue;
    blocks.push([`## 幻灯片 ${index + 1}`, ...paragraphs].join('\n'));
  }
  return blocks.join('\n\n').trim();
}

// --------------------------------------------------------------- XLS（BIFF）

export async function extractXls(buffer) {
  // .xls 一定是 OLE2 容器；否则 SheetJS 会把任意文本当成表格解析。
  if (!isCfb(buffer)) return '';
  const XLSX = await import('xlsx').catch(() => null);
  if (XLSX === null) return '';
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const blocks = [];
    for (const name of workbook.SheetNames ?? []) {
      const sheet = workbook.Sheets[name];
      if (sheet === undefined) continue;
      const rows = [];
      const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
      const lastRow = Math.min(range.e.r, MAX_SHEET_ROWS);
      const lastCol = Math.min(range.e.c, MAX_SHEET_COLS);
      for (let rowIndex = range.s.r; rowIndex <= lastRow; rowIndex += 1) {
        const cells = [];
        for (let colIndex = range.s.c; colIndex <= lastCol; colIndex += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
          cells.push(cell === undefined || cell.v === undefined ? '' : String(cell.w ?? cell.v).replace(/[\t\r\n]+/g, ' '));
        }
        if (cells.some((cell) => cell !== '')) rows.push(cells.join('\t'));
      }
      if (rows.length > 0) blocks.push([`## 工作表：${name}`, ...rows].join('\n'));
    }
    return blocks.join('\n\n').trim();
  } catch {
    return '';
  }
}

// --------------------------------------------------------------- DOC（97-2003）

export async function extractDoc(buffer) {
  let WordExtractor;
  try {
    const module = await import('word-extractor');
    WordExtractor = module.default ?? module.WordExtractor;
  } catch {
    return '';
  }
  if (typeof WordExtractor !== 'function') return '';
  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    return (doc.getBody() ?? '').trim();
  } catch {
    return '';
  }
}

// --------------------------------------------------------------- PPT（97-2003）

const PPT_TEXT_CHARS = 0x0fa0;
const PPT_TEXT_BYTES = 0x0fa8;
const PPT_SLIDE_PERSIST = 0x03f3;

export function extractPpt(buffer) {
  const cfb = openCfb(buffer);
  if (cfb === null) return '';
  const stream = cfb.read('PowerPoint Document');
  if (stream === undefined) return '';
  const out = [];
  let pages = 0;
  const walk = (offset, end, depth) => {
    let cursor = offset;
    let guard = 0;
    while (cursor + 8 <= end && guard < 200000) {
      guard += 1;
      const versionInstance = stream.readUInt16LE(cursor);
      const type = stream.readUInt16LE(cursor + 2);
      const length = stream.readUInt32LE(cursor + 4);
      const bodyStart = cursor + 8;
      const bodyEnd = Math.min(end, bodyStart + length);
      if (bodyEnd > end) break;
      const isContainer = (versionInstance & 0x000f) === 0x000f;
      if (type === PPT_TEXT_CHARS) {
        out.push(stream.toString('utf16le', bodyStart, bodyEnd));
      } else if (type === PPT_TEXT_BYTES) {
        out.push(stream.toString('latin1', bodyStart, bodyEnd));
      } else if (type === PPT_SLIDE_PERSIST) {
        pages += 1;
        out.push(`\n## 幻灯片 ${pages}`);
      }
      if (isContainer && depth < 24) walk(bodyStart, bodyEnd, depth + 1);
      cursor = bodyEnd;
    }
  };
  walk(0, stream.length, 0);
  return out
    .join('')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}
