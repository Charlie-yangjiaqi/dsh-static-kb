// 原文抽取：把用户放进资料库的各类文件转成「纯文本」。
// 纯文本既用于面板预览，也是 LLM 转化的输入；各格式都做质量门禁，
// 抽不出可信文字时返回空串，让文档停在「待转化」，由模型通过工具读取原文。
import { openZip } from './zip.js';
import { extractPdfText } from './pdf.js';
import { extractDoc, extractPpt, extractPptx, extractXls, extractXlsx } from './office.js';
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
  ['doc', 'doc'],
  ['xlsx', 'xlsx'],
  ['xls', 'xls'],
  ['pptx', 'pptx'],
  ['ppt', 'ppt'],
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
  if (type.includes('spreadsheetml')) return 'xlsx';
  if (type.includes('presentationml')) return 'pptx';
  if (type.includes('msword')) return 'doc';
  if (type.includes('ms-powerpoint')) return 'ppt';
  if (type.includes('ms-excel')) return 'xls';
  if (type.startsWith('image/')) return 'image';
  return 'other';
}

/**
 * 抽取纯文本。
 * @returns {{ text: string, quality: { ok: boolean, ratio: number, chars: number }, note: string | null }}
 */
export async function extractText(buffer, kind) {
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
      case 'xlsx':
        text = extractXlsx(buffer);
        break;
      case 'pptx':
        text = extractPptx(buffer);
        break;
      case 'xls':
        text = await extractXls(buffer);
        break;
      case 'doc':
        text = await extractDoc(buffer);
        break;
      case 'ppt':
        text = extractPpt(buffer);
        break;
      case 'pdf':
        text = extractPdfText(buffer);
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
  // PDF 需要「足够长 + 可打印比例」双重门禁（可能是扫描件或 CID 字体乱码）；
  // Office 二进制（xls/doc/ppt 等）放宽到 60%，其余文本容器只要有可信字符就接受。
  const binaryOffice = kind === 'xls' || kind === 'doc' || kind === 'ppt' || kind === 'docx' || kind === 'xlsx' || kind === 'pptx' || kind === 'epub';
  const accepted =
    kind === 'pdf' ? quality.ok : binaryOffice ? quality.chars > 0 && quality.ratio >= 0.6 : quality.chars > 0 && quality.ratio >= 0.7;
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

export { stripTags };
