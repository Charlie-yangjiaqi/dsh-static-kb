// 视觉转化：抽取文档里的页面图片，交给支持视觉的 OpenAI 兼容模型转写，并用视觉复核。
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chatCompletion, visionMessages } from './openai.js';
import { mapLimit, parseConversion, truncateChars } from './util.js';
import { PdfDocument } from './pdf.js';
import { renderPdfPages } from './raster.js';

const VISION_SYSTEM = [
  '你是资料整理助手。用户给你一份文档的页面图片，请忠实转写为可供检索的 Markdown。',
  '要求：',
  '1. 逐页转写，不要遗漏正文、表格、标注；表格用 Markdown 表格或清晰的列表表达。',
  '2. 保留章节层级：页面上的标题转成 #/##/###。',
  '3. 图片模糊或不确定的字词用「□」占位，不要猜测，不要编造。',
  '4. 第一页图片的输出必须严格使用下面三个分节标记（后续页只输出正文）：',
  '<<<SUMMARY>>>',
  '一句话摘要（不超过 80 字）',
  '<<<TAGS>>>',
  '3-6 个主题标签，用逗号分隔',
  '<<<CONTENT>>>',
  '# 文档标题',
  '（正文 Markdown）',
].join('\n');

const VISION_CONTINUE_SYSTEM = [
  '你是资料整理助手。用户会给你同一份文档的后续页面图片，请继续忠实转写为 Markdown 正文。',
  '保留标题层级；表格用 Markdown 表达；不确定的字用「□」占位；不要写摘要或标签，只输出正文。',
].join('\n');

const VERIFY_SYSTEM = [
  '你是校对员。用户给你若干页面图片，以及据此整理的 Markdown（可能只是节选）。',
  '请核对：Markdown 是否有明显漏掉的关键内容、错认的数字/型号/标题？',
  '只输出 JSON，不要任何解释：{"ok":true} 或 {"ok":false,"issues":["问题1","问题2"]}。',
  '没有明显问题时必须返回 {"ok":true}，不要为了挑错而挑错。',
].join('\n');

export function visionModelOf(settings) {
  return settings.visionModel !== '' && settings.visionModel !== undefined ? settings.visionModel : settings.model;
}

/** 读取文档可用的页面图片：图片文档直接用原图，PDF 优先整页栅格化。 */
export async function extractDocumentImages({ store, kbId, doc, maxImages = 8, startPage = 1, scale = 1.5 }) {
  if (doc.kind === 'image') {
    if ((startPage ?? 1) > 1) return [];
    try {
      const { buffer } = await store.readRaw(kbId, doc.id);
      const extension = extname(String(doc.sourceName ?? '')).toLowerCase();
      const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.gif' ? 'image/gif' : 'image/jpeg';
      return [{ mime, data: buffer, width: 0, height: 0, page: 1 }];
    } catch {
      return [];
    }
  }
  if (doc.kind !== 'pdf') return [];
  try {
    const { buffer } = await store.readRaw(kbId, doc.id);
    const limit = Math.max(1, Math.min(20, maxImages));
    const firstPage = Math.max(1, Math.trunc(startPage) || 1);
    // 优先整页栅格化：扫描件 / 无文本层 PDF 只有页面图能用，内嵌小图（缩略图、插图）会被模型判为无效图片。
    const rendered = await renderPdfPages(buffer, { startPage: firstPage, maxPages: limit, scale });
    if (rendered.length > 0) return rendered;
    // 栅格化器不可用时才退回内嵌图片；此时无法按页码续读，续读请求直接返回空。
    if (firstPage > 1) return [];
    const document = new PdfDocument(buffer);
    return document.extractImages({ limit });
  } catch {
    return [];
  }
}

function imageBatches(images, size) {
  const batches = [];
  for (let index = 0; index < images.length; index += size) batches.push(images.slice(index, index + size));
  return batches;
}

/**
 * 用视觉模型逐批转写页面图片。
 * @param {{ continuation?: boolean }} options
 *        continuation=true 用于「继续转化」：不要求摘要/标签，只输出正文，调用方负责拼接。
 * @returns {Promise<{ title:string, summary:string, tags:string[], content:string, chunks:number, mode:'vision' }>}
 */
export async function convertWithVision({ settings, apiKey, images, title, signal, continuation = false, concurrency = 2, notes = '', onProgress = () => {}, chat = chatCompletion }) {
  const model = visionModelOf(settings);
  const batches = imageBatches(images, 4);
  if (batches.length === 0) throw new Error('没有可用于视觉转化的页面图片');
  const pageLabel = images[0]?.page !== undefined && continuation ? `（从第 ${images[0].page} 页开始）` : '';
  const fixNote = typeof notes === 'string' && notes.trim() !== '' ? `\n上一版复核发现的问题，请重点核对并修正：${notes.trim()}` : '';
  const limit = Number.isFinite(concurrency) ? Math.max(1, Math.min(4, Math.trunc(concurrency))) : 2;
  const parts = await mapLimit(
    batches,
    limit,
    async (batch, index) => {
      const wantsHeader = index === 0 && !continuation;
      const prompt = wantsHeader
        ? `这是《${title}》的页面图片（第 ${index + 1}/${batches.length} 批），请按系统要求转写。${fixNote}`
        : `这是《${title}》的后续页面图片${pageLabel}（第 ${index + 1}/${batches.length} 批），请继续转写为 Markdown 正文。`;
      const output = await chat({
        baseURL: settings.baseURL,
        apiKey,
        model,
        system: wantsHeader ? VISION_SYSTEM : VISION_CONTINUE_SYSTEM,
        messages: visionMessages(prompt, batch),
        maxTokens: 16384,
        temperature: settings.temperature ?? 0.2,
        signal,
      });
      return { index, wantsHeader, output };
    },
    (index, _result, _error, done, total) => {
      onProgress({ phase: 'vision', done, total });
    },
  );
  let first = null;
  const bodies = [];
  for (const part of parts) {
    if (part.wantsHeader) {
      first = parseConversion(part.output, title);
      bodies.push(first.content);
    } else {
      const content = /<<<\s*CONTENT\s*>>>([\s\S]*)$/i.exec(part.output)?.[1] ?? part.output;
      bodies.push(content.trim());
    }
  }
  let content = bodies.join('\n\n').trim();
  if (!continuation && !content.startsWith('#')) content = `# ${first?.title ?? title}\n\n${content}`;
  return {
    title: first?.title ?? title,
    summary: first?.summary ?? '',
    tags: first?.tags ?? [],
    content,
    chunks: batches.length,
    pages: images.length,
    mode: 'vision',
  };
}

/** 视觉复核：抽首/中/尾页面与整理结果对比，返回问题列表（不阻断转化）。 */
export async function verifyWithVision({ settings, apiKey, images, markdown, title, signal, chat = chatCompletion }) {
  if (images.length === 0) return null;
  const sample = images.length <= 3 ? images : [images[0], images[Math.floor(images.length / 2)], images[images.length - 1]];
  const excerpt = truncateChars(markdown, 6000).text;
  const prompt = [
    `文档标题：${title}`,
    `下面是从整份文档中抽取的 ${sample.length} 张样本页面图片，以及由全部页面整理出的 Markdown 节选。`,
    '请按系统要求核对并只输出 JSON。',
    '<<<Markdown 节选>>>',
    excerpt,
  ].join('\n');
  try {
    const output = await chat({
      baseURL: settings.baseURL,
      apiKey,
      model: visionModelOf(settings),
      system: VERIFY_SYSTEM,
      messages: visionMessages(prompt, sample),
      maxTokens: 4096,
      temperature: 0,
      signal,
    });
    const match = /\{[\s\S]*\}/.exec(output);
    if (match === null) return { ok: true, issues: [], model: visionModelOf(settings), checkedAt: new Date().toISOString() };
    const parsed = JSON.parse(match[0]);
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map((item) => String(item)).slice(0, 10) : [];
    return {
      ok: parsed.ok === true && issues.length === 0,
      issues,
      model: visionModelOf(settings),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { ok: null, issues: [error instanceof Error ? error.message : String(error)], model: visionModelOf(settings), checkedAt: new Date().toISOString() };
  }
}
