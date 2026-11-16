// LLM 转化：把资料库里的原文整理成结构化 Markdown。
// 走宿主 ctx.llm 服务（当前默认模型），无需开启对话；调用失败时抛错，
// 由上层把文档留在「待转化」，并提示改用对话内的 kb_convert 工具。
import { mapLimit, parseConversion, splitForModel } from './util.js';

export const CONVERSION_SYSTEM_PROMPT = [
  '你是资料库整理助手，负责把用户提供的原文整理成可供 AI 检索的 Markdown 文档。',
  '硬性要求：',
  '1. 忠实原文：不添加原文没有的事实，不改变作者观点，只做结构化与排版清理。',
  '2. 保留章节层级：原文有小标题就转成 ## / ###；没有小标题时按语义分段，并为每段起一个简短小标题。',
  '3. 清理明显的排版噪音（断行、页眉页脚、重复空行），但保留原文用词与关键句。',
  '4. 第一段输出必须严格使用下面三个分节标记，除此之外不要输出任何解释：',
  '<<<SUMMARY>>>',
  '一句话摘要（不超过 80 字）',
  '<<<TAGS>>>',
  '3-6 个主题标签，用逗号分隔',
  '<<<CONTENT>>>',
  '# 文档标题',
  '（正文 Markdown，可含 ## 小节）',
].join('\n');

export const CONTINUATION_SYSTEM_PROMPT = [
  '你是资料库整理助手。用户会给你同一篇长文档的后续片段，请继续整理成 Markdown。',
  '硬性要求：忠实原文、保留章节层级、不要写摘要或标签，只输出正文 Markdown。',
  '如果片段开头是上一节的延续，不要重复上一节标题。',
].join('\n');

export function resolveModelSelection(ctx, config = {}) {
  const configuredProvider = typeof config.provider === 'string' && config.provider !== '' ? config.provider : null;
  const configuredModel = typeof config.model === 'string' && config.model !== '' ? config.model : null;
  if (configuredProvider !== null && configuredModel !== null) {
    return { provider: configuredProvider, model: configuredModel };
  }
  const selection = safeCall(() => ctx.get?.('agentDefaultModel')?.currentSelection?.());
  if (selection !== undefined && selection !== null && typeof selection.provider === 'string' && typeof selection.model === 'string') {
    return { provider: selection.provider, model: selection.model };
  }
  return null;
}

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

async function collectStream(stream) {
  const parts = new Map();
  let reasoningChars = 0;
  let finishKind = null;
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta') {
      parts.set(chunk.index, (parts.get(chunk.index) ?? '') + (chunk.text ?? ''));
    } else if (chunk?.type === 'reasoning-delta') {
      reasoningChars += (chunk.text ?? '').length;
    } else if (chunk?.type === 'block-end') {
      // 有些适配器不发 text-delta，只在 block-end 给出完整文本块。
      if (chunk.block?.type === 'text' && !parts.has(chunk.index)) parts.set(chunk.index, chunk.block.text ?? '');
    } else if (chunk?.type === 'finish') {
      const reason = chunk.reason ?? {};
      finishKind = reason.kind ?? null;
      if (reason.kind === 'error') {
        throw new Error(`模型调用失败：${reason.failure?.message ?? '未知错误'}`);
      }
      if (reason.kind === 'aborted') {
        throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
      }
    }
  }
  const text = [...parts.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, value]) => value)
    .join('');
  return { text, reasoningChars, finishKind };
}

async function resolveControls(llm, selection, config) {
  let info;
  try {
    info = await llm.resolveModelInfo(selection.provider, selection.model);
  } catch {
    info = undefined;
  }
  const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts.map((entry) => entry.id) : [];
  let effort;
  if (efforts.length > 0) {
    const preferred =
      typeof config.reasoningEffort === 'string' && config.reasoningEffort !== ''
        ? config.reasoningEffort
        : (['none', 'off', 'minimal', 'low'].find((id) => efforts.includes(id)) ?? 'low');
    effort = efforts.includes(preferred) ? preferred : undefined;
  }
  let maxTokens = Number.isFinite(config.maxTokens) ? config.maxTokens : efforts.length > 0 ? 32768 : 8192;
  if (!Number.isFinite(config.maxTokens) && Number.isFinite(info?.defaultMaxTokens) && info.defaultMaxTokens > 0) {
    maxTokens = Math.min(maxTokens, info.defaultMaxTokens);
  }
  return { effort, maxTokens, efforts, defaultMaxTokens: info?.defaultMaxTokens, contextWindow: info?.context?.contextWindow };
}

/**
 * 用当前默认模型转化一份资料。
 * @param {object} options
 * @param {object} options.ctx  Cordis 上下文（需要 llm）
 * @param {string} options.text 原文
 * @param {string} options.title 标题（用于兜底）
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ title: string, summary: string, tags: string[], content: string, chunks: number, truncated: boolean }>}
 */
export async function convertTextWithModel({ ctx, chat, text, title, config = {}, signal, onProgress = () => {} }) {
  const custom = typeof chat === 'function';
  let llm = null;
  let selection = null;
  let controls;
  if (custom) {
    controls = { effort: undefined, maxTokens: Number.isFinite(config.maxTokens) ? config.maxTokens : 16384 };
  } else {
    llm = ctx.get?.('llm');
    if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
      throw Object.assign(new Error('当前部署没有挂载 llm 服务，无法自动转化'), { code: 'llm-unavailable' });
    }
    selection = resolveModelSelection(ctx, config);
    if (selection === null) {
      throw Object.assign(new Error('没有可用的默认模型，请先在对话框选择模型'), { code: 'no-model' });
    }
    controls = await resolveControls(llm, selection, config);
  }
  const source = String(text ?? '').trim();
  if (source.length < 4) throw Object.assign(new Error('原文太短，无法转化'), { code: 'too-short' });

  const chunkBudget = Number.isFinite(config.chunkChars) && config.chunkChars >= 2000 ? config.chunkChars : 16000;
  const maxChunks = Number.isFinite(config.maxChunks) && config.maxChunks > 0 ? config.maxChunks : 8;
  const chunks = splitForModel(source, chunkBudget);
  const used = chunks.slice(0, maxChunks);
  const truncated = chunks.length > used.length;

  let firstParsed = null;
  const bodies = [];
  // 分段互相独立（只有第一段要写摘要/标签），并发能显著缩短长文档的转化时间。
  const concurrency = Number.isFinite(config.concurrency) ? Math.max(1, Math.min(6, Math.trunc(config.concurrency))) : 3;
  const parts = await mapLimit(
    used,
    concurrency,
    async (chunkText, index) => {
      const isFirst = index === 0;
      const prompt = isFirst
        ? `请整理下面的原文。\n\n<<<原文开始>>>\n${chunkText}\n<<<原文结束>>>`
        : `这是同一篇文档的第 ${index + 1} 段（共 ${used.length} 段），请继续整理为 Markdown 正文。\n\n<<<片段开始>>>\n${chunkText}\n<<<片段结束>>>`;
      const system = isFirst ? CONVERSION_SYSTEM_PROMPT : CONTINUATION_SYSTEM_PROMPT;
      const runStream = async (maxTokens) => {
        if (custom) {
          const output = await chat({ system, prompt, maxTokens });
          return { text: typeof output === 'string' ? output : '', reasoningChars: 0, finishKind: 'stop' };
        }
        const stream = llm.stream({
          provider: selection.provider,
          model: selection.model,
          system,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          maxTokens,
          ...(controls.effort === undefined ? {} : { reasoningEffort: controls.effort }),
          signal,
        });
        return collectStream(stream);
      };

      let usedTokens = controls.maxTokens;
      let collected = await runStream(usedTokens);
      // 推理模型可能把 maxTokens 全花在思考上；命中 max-tokens 时放大预算再试一次。
      if (collected.text.trim() === '' && collected.finishKind === 'max-tokens' && usedTokens < 32768) {
        usedTokens = Math.min(32768, usedTokens * 2);
        collected = await runStream(usedTokens);
      }
      const output = collected.text;
      if (output.trim() === '') {
        const effortNote = controls.effort === undefined ? '' : `，effort=${controls.effort}`;
        throw new Error(
          `模型返回了空结果（第 ${index + 1}/${used.length} 段，推理 ${collected.reasoningChars} 字符，finish=${collected.finishKind ?? '未知'}，model=${selection?.model ?? 'custom'}${effortNote}，maxTokens=${usedTokens}；可尝试更小的推理强度或换用非推理模型）`,
        );
      }
      return { index, isFirst, output };
    },
    (index, _result, _error, done, total) => {
      onProgress({ phase: 'model', done, total });
    },
  );

  for (const part of parts) {
    if (part.isFirst) {
      firstParsed = parseConversion(part.output, title);
      bodies.push(firstParsed.content);
    } else {
      const content = /<<<\s*CONTENT\s*>>>([\s\S]*)$/i.exec(part.output)?.[1] ?? part.output;
      bodies.push(content.trim());
    }
  }
  onProgress({ phase: 'saved', done: used.length, total: used.length });

  let content = bodies.join('\n\n').trim();
  if (!content.startsWith('#')) content = `# ${firstParsed?.title ?? title}\n\n${content}`;
  return {
    title: firstParsed?.title ?? title,
    summary: firstParsed?.summary ?? '',
    tags: firstParsed?.tags ?? [],
    content,
    chunks: used.length,
    consumed: used.reduce((sum, chunk) => sum + chunk.length, 0),
    truncated,
  };
}
