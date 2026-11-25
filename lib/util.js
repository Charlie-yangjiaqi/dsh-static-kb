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
/**
 * 封面抬头 / 泛用标题：国标、说明书封面上常见，但不是文档真名。
 * 命中时不该拿来当文档标题（文件名里通常有更准确的名称）。
 */
const GENERIC_TITLES = new Set([
  '中华人民共和国国家标准',
  '中华人民共和国国家标准化指导性技术文件',
  '中华人民共和国机械行业标准',
  '中华人民共和国行业标准',
  '中华人民共和国国家标准全文公开系统',
  '国家标准',
  '行业标准',
  '企业标准',
  '说明书',
  '使用说明书',
  '操作说明书',
  '用户手册',
  '目录',
  '前言',
  '封面',
  'untitled',
  'document',
  'manual',
]);

/** 疑似泛化标题：完全命中清单，或整句只有「国家标准 / 说明书」这类泛称。 */
export function isGenericTitle(title) {
  const value = String(title || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .trim();
  if (value === '') return true;
  if (GENERIC_TITLES.has(value)) return true;
  // 「中华人民共和国国家标准 GB/T xxx」这种带编号的封面抬头也算泛化。
  if (/^中华人民共和国.{0,8}标准/.test(value) && value.length <= 40) return true;
  return false;
}

/**
 * 文档标题：模型给的标题若是封面抬头，退回原文件名（去扩展名）。
 * 文件名通常带「第6部分：限制负载的设备」这类真实名称。
 */
export function resolveDocTitle(modelTitle, fallbackTitle, sourceName) {
  const source = String(sourceName ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.[A-Za-z0-9]{1,8}$/u, '')
    .trim();
  const candidate = String(modelTitle || '').trim();
  if (candidate !== '' && !isGenericTitle(candidate)) return candidate.slice(0, 160);
  if (source !== '' && !isGenericTitle(source)) return source.slice(0, 160);
  if (candidate !== '') return candidate.slice(0, 160);
  return String(fallbackTitle || '').slice(0, 160);
}

// 标准编号、文件编号、版本号、日期这类噪声：出现在标题里只会让名字变长变乱。
// 下划线/全角斜杠/空格都视为编号的一部分（GB_T、GB∕T、GB T 等写法都见得到）。
const STANDARD_TOKEN = /(?:GB|GBT|JB|ISO|IEC|EN|DIN|AWS|ANSI|JIS|KS|BS)(?:\s*[_/／\u2215]\s*|\s+)[A-Z]{0,4}\s*\d[\d.\-—:/\s]*/gi;
const TITLE_NOISE = [
  // 含标准编号的括号注记整体去掉，例如「（GB/T 15579.6-2018）」
  /[（(【\[]\s*(?:GB|GBT|JB|ISO|IEC|EN|DIN|AWS|ANSI|JIS|KS|BS)[^）)】\]]*[）)】\]]/gi,
  // 括号里的纯年份/版本注记（只删「(2025)」「(2025-09)」这种，不碰 (OM-xxx)）
  /[（(【\[]\s*(?:(?:19|20)\d{2})(?:[-—/]\d{1,2})?(?:\s*年)?\s*[）)】\]]/g,
  /\b(?:Rev|Ver|Version|V)\s*\.?\s*\d+(?:\.\d+)*\b/gi,
  /第\s*\d+\s*版/g,
];

/** 括号/书名号是否配平（避免在括号中间截断留下半个括号）。 */
function balanced(value) {
  const pairs = [
    ['（', '）'],
    ['(', ')'],
    ['《', '》'],
    ['【', '】'],
    ['[', ']'],
    ['“', '”'],
    ['「', '」'],
  ];
  for (const [open, close] of pairs) {
    const left = value.split(open).length - 1;
    const right = value.split(close).length - 1;
    if (left !== right) return false;
  }
  return true;
}

/** 按标点切成「尽量完整」的片段，用于安全截断。 */
function safeCutpoints(value) {
  const points = [];
  for (let index = 0; index < value.length; index += 1) {
    if ('：:；;，,、·—–-'.includes(value[index])) points.push(index);
  }
  return points;
}

/**
 * 标题整洁化：去掉标准编号/版本号/日期等噪声、压缩空白；超长时在标点或空白处截断，
 * 且保证括号、书名号配平，绝不切在括号中间。
 */
export function tidyTitle(input, { maxChars = 80 } = {}) {
  // 全角/特殊斜杠先归一，标准编号里的「GB∕T」才能被识别。
  let value = String(input || '')
    .replace(/[\u2215\uff0f]/g, '/')
    .replace(/[\r\n\t]+/g, ' ');
  for (const pattern of TITLE_NOISE) value = value.replace(pattern, ' ');
  value = value.replace(STANDARD_TOKEN, ' ');
  value = value.replace(/[\s\u3000]{2,}/g, ' ').replace(/^[\s\-—_,，、:：]+/, '').replace(/[\s\-—_,，、:：]+$/, '').trim();
  if (value === '') return '';
  if (value.length <= maxChars) return value;

  // 只在强分隔处截断（不在「/」切，避免把「A / B」型号名切成半截），且保持括号配平。
  const cutpoints = [];
  for (let index = 0; index < value.length; index += 1) {
    if ('：:；;，,、—– '.includes(value[index])) cutpoints.push(index);
  }
  const usable = cutpoints
    .filter((index) => index >= 6 && index <= maxChars)
    .sort((a, b) => b - a)
    .find((index) => balanced(value.slice(0, index).trim()));
  if (usable !== undefined) return value.slice(0, usable).trim();

  let cut = maxChars;
  while (cut > 6 && !balanced(value.slice(0, cut))) cut -= 1;
  return `${value.slice(0, cut).trim()}…`;
}

/** 拆出标题的「系列前缀」与「第 N 部分」结构。 */
function splitSeries(title) {
  const value = String(title || '');
  const match = /^(.*?)第\s*([0-9一二三四五六七八九十百零〇两]+)\s*(部分|章|节|篇|卷|册)(.*)$/.exec(value);
  if (match === null) return null;
  return {
    prefix: match[1].trim(),
    num: match[2],
    unit: match[3],
    rest: match[4],
    spaced: /第\s+/.test(value) || /\s+(部分|章|节|篇|卷|册)/.test(value),
  };
}

const normalizeKey = (text) => String(text || '').replace(/[\s\u3000:：·—\-_/／]+/g, '').toLowerCase();

/**
 * 自然排序键：把标题里的数字按数值比较（第2部分 < 第10部分），
 * 并把中文数字（一…十）折算成阿拉伯数字，避免「第十部分」排到「第2部分」前面。
 */
const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function cnToNumber(text) {
  const value = String(text || '');
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '十') return 10;
  const ten = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(value);
  if (ten !== null) return (ten[1] === undefined ? 1 : CN_DIGITS[ten[1]]) * 10 + (ten[2] === undefined ? 0 : CN_DIGITS[ten[2]]);
  if (value.length === 1 && value in CN_DIGITS) return CN_DIGITS[value];
  return null;
}

/** 拆成可比较的片段：文本块与数字块分开，数字块按数值比较。 */
export function naturalSortKey(title) {
  const value = String(title || '')
    .replace(/第\s*([0-9一二两三四五六七八九十百零〇]+)\s*(部分|章|节|篇|卷|册)/g, (_match, num, unit) => {
      const parsed = cnToNumber(num);
      return `${unit}${parsed === null ? num : String(parsed).padStart(6, '0')}`;
    });
  const parts = [];
  for (const match of value.matchAll(/(\d+)|(\D+)/g)) {
    if (match[1] !== undefined) parts.push([0, Number(match[1]), '']);
    else parts.push([1, 0, match[2].toLowerCase()]);
  }
  return parts;
}

/** 按自然顺序比较两个标题。纯文本部分按本地化规则比较。 */
export function compareNatural(left, right) {
  const a = naturalSortKey(left);
  const b = naturalSortKey(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const one = a[index];
    const two = b[index];
    if (one === undefined) return -1;
    if (two === undefined) return 1;
    if (one[0] !== two[0]) return one[0] - two[0];
    if (one[0] === 0) {
      if (one[1] !== two[1]) return one[1] - two[1];
    } else {
      const order = one[2].localeCompare(two[2], 'zh-Hans-CN');
      if (order !== 0) return order;
    }
  }
  return 0;
}

/**
 * 同库标题对齐：与库内既有标题属于同一系列（「第 N 部分」前的前缀相同）时，
 * 统一序号写法（「第 6 部分」还是「第6部分」）和单位用词，让一库看起来是一套。
 * 判定不出系列时原样返回，不做猜测。
 */
export function alignTitleWithLibrary(title, existingTitles) {
  const value = String(title || '').trim();
  if (value === '' || !Array.isArray(existingTitles) || existingTitles.length === 0) return value;
  const current = splitSeries(value);
  if (current === null) return value;

  const siblings = existingTitles
    .map((item) => splitSeries(String(item || '').trim()))
    .filter((item) => item !== null && item.prefix !== '')
    .filter((item) => normalizeKey(item.prefix) === normalizeKey(current.prefix));
  if (siblings.length === 0) return value;

  const spaced = siblings.filter((item) => item.spaced).length > siblings.length / 2;
  const unitVotes = new Map();
  for (const item of siblings) unitVotes.set(item.unit, (unitVotes.get(item.unit) ?? 0) + 1);
  const unit = [...unitVotes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // 分隔符随大多数：兄弟标题多写作「第 N 部分：xxx」时，缺冒号的补上。
  const withColon = siblings.filter((item) => /^\s*[:：]/.test(item.rest)).length > siblings.length / 2;

  const ordinal = spaced ? `第 ${current.num} ${unit}` : `第${current.num}${unit}`;
  const joiner = current.prefix === '' ? '' : ' ';
  let rest = current.rest;
  if (withColon && !/^\s*[:：]/.test(rest) && rest.trim() !== '') rest = `：${rest.replace(/^\s*/, '')}`;
  return `${current.prefix}${joiner}${ordinal}${rest}`.trim();
}



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
