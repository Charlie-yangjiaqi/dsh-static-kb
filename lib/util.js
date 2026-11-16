// 文本与标识符工具：全部为纯函数，便于单测。
import { randomUUID } from 'node:crypto';

export function newId(prefix) {
  return `${prefix}-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

/** 归一化抽取出来的正文：统一换行、去控制符、压缩空行、去掉每行尾部空白。 */
export function normalizeText(input) {
  if (typeof input !== 'string') return '';
  let text = input.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  // 除换行与制表外的 C0/C1 控制符
  text = text.replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
  text = text.replace(/[ \t\u00a0]+$/gm, '');
  text = text.replace(/\n{4,}/g, '\n\n\n');
  return text.trim();
}

/** 去掉 HTML/XML 标签，保留段落边界。 */
export function stripTags(markup) {
  if (typeof markup !== 'string') return '';
  return markup
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|figcaption)>/gi, '\n')
    .replace(/<(li|tr)\b[^>]*>/gi, '\n')
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, level) => `\n\n${'#'.repeat(Number(level))} `)
    .replace(/<[^>]+>/g, '');
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
  bull: '•',
};

export function decodeEntities(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const value = NAMED_ENTITIES[body.toLowerCase()];
    return value === undefined ? match : value;
  });
}

export function htmlToText(html) {
  return normalizeText(decodeEntities(stripTags(html)));
}

/**
 * 粗略判断抽取结果是否可信：可打印字符（含中日韩）占比过低说明是乱码/字体未映射。
 * 返回 { ok, ratio, chars }。
 */
export function textQuality(text) {
  const trimmed = (text || '').replace(/\s+/g, '');
  if (trimmed.length === 0) return { ok: false, ratio: 0, chars: 0 };
  let good = 0;
  for (const ch of trimmed) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0x3400 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0x2000 && code <= 0x206f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      good += 1;
    }
  }
  const ratio = good / trimmed.length;
  return { ok: trimmed.length >= 40 && ratio >= 0.72, ratio, chars: trimmed.length };
}

export function truncateChars(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return { text: value, truncated: false };
  return { text: value.slice(0, max), truncated: true };
}

export function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 从文件名推导一个可读标题（去掉扩展名）。 */
export function titleFromFilename(name) {
  const base = String(name || '').split(/[\\/]/).pop() || '未命名文档';
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).trim() || '未命名文档';
}

/** 生成一个在资料库目录内合法的相对文件路径片段。 */
export function safeSegment(input, fallback = 'file') {
  const cleaned = String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/** 把 LLM 的「摘要 + 标签 + 正文」分隔格式解析成结构体；解析失败时整段当正文。 */
export function parseConversion(text, fallbackTitle) {
  const raw = String(text || '').trim();
  if (raw === '') return { title: fallbackTitle, summary: '', tags: [], content: '' };
  const summaryRe = /<<<\s*SUMMARY\s*>>>([\s\S]*?)(?=<<<\s*TAGS\s*>>>|<<<\s*CONTENT\s*>>>|$)/i;
  const tagsRe = /<<<\s*TAGS\s*>>>([\s\S]*?)(?=<<<\s*CONTENT\s*>>>|$)/i;
  const contentRe = /<<<\s*CONTENT\s*>>>([\s\S]*)$/i;
  const summary = summaryRe.exec(raw)?.[1]?.trim() ?? '';
  const tags = (tagsRe.exec(raw)?.[1] ?? '')
    .split(/[,，、;；\s]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter((tag) => tag.length > 0 && tag.length <= 24)
    .slice(0, 8);
  let content = contentRe.exec(raw)?.[1]?.trim() ?? '';
  if (content === '') content = raw;
  const heading = /^#{1,3}\s+(.+)$/m.exec(content);
  const title = heading === null ? fallbackTitle : heading[1].trim().slice(0, 120);
  return { title, summary: summary.slice(0, 400), tags, content };
}

/** 把 Markdown 按字符预算切块，尽量落在段落边界。 */
export function splitForModel(text, maxChars) {  const source = String(text || '');
  const chunks = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + maxChars);
    if (end < source.length) {
      const window = source.slice(Math.max(start, end - 2000), end);
      const boundary = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'));
      if (boundary > 0) end = Math.max(start, end - 2000) + boundary;
    }
    const chunk = source.slice(start, end).trim();
    if (chunk !== '') chunks.push(chunk);
    start = end;
  }
  return chunks;
}

/**
 * 有限并发地处理一组任务，结果按输入顺序返回。
 * onSettled(index, result, error) 在每次任务结束时调用，用于更新进度。
 */
export async function mapLimit(items, limit, worker, onSettled) {
  const total = items.length;
  const results = new Array(total);
  const size = Math.max(1, Math.min(total || 1, Math.trunc(limit) || 1));
  let next = 0;
  let completed = 0;
  const runner = async () => {
    while (next < total) {
      const index = next;
      next += 1;
      try {
        results[index] = await worker(items[index], index);
        if (onSettled) onSettled(index, results[index], null, completed + 1, total);
      } catch (error) {
        if (onSettled) onSettled(index, undefined, error, completed + 1, total);
        throw error;
      } finally {
        completed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: size }, () => runner()));
  return results;
}
