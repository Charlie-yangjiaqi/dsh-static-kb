// 视觉转化：抽取文档里的页面图片，交给支持视觉的 OpenAI 兼容模型转写，并用视觉复核。
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chatCompletion, visionMessages } from './openai.js';
import { mapLimit, parseConversion, truncateChars } from './util.js';
import { PdfDocument } from './pdf.js';
import { renderPdfPages } from './raster.js';

const VISION_MAX_TOKENS = 16384;
const VISION_MAX_TOKENS_CEILING = 32768;

/**
 * 视觉请求：推理型模型会把输出预算全花在「思考」上，返回空正文。
 * 遇到空内容时自动加倍 max_tokens 重试；瞬时网络错误（fetch failed 等）原样重试一次。
 */
async function chatWithBudget(chat, args) {
  let budget = Number.isFinite(args.maxTokens) ? args.maxTokens : VISION_MAX_TOKENS;
  let lastError;
  let transientRetries = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await chat({ ...args, maxTokens: budget });
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? '');
      if (/空内容/.test(message)) {
        if (budget >= VISION_MAX_TOKENS_CEILING) throw error;
        budget = Math.min(VISION_MAX_TOKENS_CEILING, budget * 2);
        continue;
      }
      // 网关偶发断连：等一秒原样重试，别让整本书因为一次抖动全废。
      const transient = /fetch failed|ECONNRESET|socket hang up|terminated|network/i.test(message);
      if (transient && transientRetries < 2) {
        transientRetries += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000 * transientRetries));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/** 每页至少应有的字符数：低于这个值说明模型只回了标题/片段，需要重试。 */
const MIN_CHARS_PER_PAGE = 80;

function batchText(output, wantsHeader, title) {
  if (wantsHeader) return parseConversion(output, title).content;
  return (/<<<\s*CONTENT\s*>>>([\s\S]*)$/i.exec(output)?.[1] ?? output).trim();
}

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
  '关于「文档标题」的规则（重要）：',
  '- 页面上有正式文档名称（书名、标准名称、手册名、型号说明书的正式标题）时，直接采用该名称，不要改写。',
  '- 页面上只有「中华人民共和国国家标准」「使用说明书」「目录」这类封面抬头或泛称时，不要用它当标题：根据正文内容自己起一个简洁、正式、概括全文的标题（10–30 字）。',
  '- 标题里不要带标准编号、版本号、页码、日期等噪声（例如 GB/T 15579.6-2018、Rev.2）。',
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
export async function convertWithVision({ settings, apiKey, images, title, signal, continuation = false, concurrency = 2, batchPages = 4, notes = '', onProgress = () => {}, chat = chatCompletion }) {
  const model = visionModelOf(settings);
  const batches = imageBatches(images, Math.max(1, Math.min(4, Math.trunc(batchPages) || 4)));
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
      const request = {
        baseURL: settings.baseURL,
        apiKey,
        model,
        system: wantsHeader ? VISION_SYSTEM : VISION_CONTINUE_SYSTEM,
        messages: visionMessages(prompt, batch),
        maxTokens: VISION_MAX_TOKENS,
        temperature: settings.temperature ?? 0.2,
        signal,
      };
      let output = await chatWithBudget(chat, request);
      // 整批只回了标题/几个字，说明这一批基本没转写：提高预算再来一次，取更长的结果。
      let text = batchText(output, wantsHeader, title);
      if (text.length < MIN_CHARS_PER_PAGE * batch.length) {
        try {
          const retryOutput = await chatWithBudget(chat, { ...request, maxTokens: VISION_MAX_TOKENS_CEILING });
          const retryText = batchText(retryOutput, wantsHeader, title);
          if (retryText.length > text.length) {
            output = retryOutput;
            text = retryText;
          }
        } catch {
          /* 重试失败就保留第一次的结果，交给上面的产出下限检查处理 */
        }
      }
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
      bodies.push(batchText(part.output, false, title));
    }
  }
  let content = bodies.join('\n\n').trim();
  if (!continuation && !content.startsWith('#')) content = `# ${first?.title ?? title}\n\n${content}`;
  // 产出下限：整批几乎没转出正文时，宁可报错也不要把残缺结果存成「已转化」。
  const expected = MIN_CHARS_PER_PAGE * images.length;
  if (!continuation && images.length >= 3 && content.length < expected) {
    throw Object.assign(
      new Error(
        `视觉模型几乎没转出正文（${images.length} 页仅 ${content.length} 字符，低于 ${MIN_CHARS_PER_PAGE} 字/页）。` +
          '常见原因是推理模型把输出预算花在思考上：请换用非推理的视觉模型，或调小「视觉最多读取页数」后重试',
      ),
      { code: 'vision-thin-output' },
    );
  }
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
    const output = await chatWithBudget(chat, {
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
