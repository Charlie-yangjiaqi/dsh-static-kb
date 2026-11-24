// 运行时：组装存储、转化任务与系统提示词所需的同步快照。
import { homedir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore } from './store.js';
import { convertTextWithModel } from './llm.js';
import { chatCompletion } from './openai.js';
import { readConversionKey, SettingsStore } from './settings.js';
import { convertWithVision, extractDocumentImages, verifyWithVision, visionModelOf } from './vision.js';
import { newId, nowIso } from './util.js';

const MAX_JOBS = 60;

export function resolveDataDir(config = {}) {
  if (typeof config.dataDir === 'string' && config.dataDir.trim() !== '') return config.dataDir.trim();
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh');
  return join(home, 'knowledge-base');
}

export function createRuntime({ ctx, config = {}, logger = console }) {
  const dataDir = resolveDataDir(config);
  const store = new KnowledgeStore({ dataDir, logger });
  const settings = new SettingsStore({ dataDir, logger });
  const jobs = new Map();
  let loadPromise = null;

  const ready = () => {
    if (loadPromise === null) loadPromise = Promise.all([store.ensureLoaded(), settings.load()]);
    return loadPromise;
  };

  function pruneJobs() {
    if (jobs.size <= MAX_JOBS) return;
    const finished = [...jobs.values()].filter((job) => job.status !== 'running').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    for (const job of finished.slice(0, jobs.size - MAX_JOBS)) jobs.delete(job.id);
  }

  /** 同步读绑定（系统提示词必须在同步路径上调用；apply 阶段已预热 store）。 */
  function bindingOfSync(sessionId) {
    if (!sessionId) return null;
    const binding = store.bindings?.bindings?.[String(sessionId)];
    if (binding === undefined || binding === null) return null;
    const kb = store.library.kbs.find((item) => item.id === binding.kbId);
    if (kb === undefined) return null;
    return { kbId: kb.id, title: kb.title, boundAt: binding.boundAt };
  }

  function catalogOfSync(kbId, { maxDocs = 40 } = {}) {
    const kb = store.library.kbs.find((item) => item.id === kbId);
    if (kb === undefined) return null;
    const readyDocs = kb.docs.filter((doc) => doc.status === 'ready');
    const pending = kb.docs.filter((doc) => doc.status !== 'ready');
    return {
      id: kb.id,
      title: kb.title,
      total: kb.docs.length,
      ready: readyDocs.length,
      pending: pending.length,
      truncated: readyDocs.length > maxDocs,
      lines: readyDocs.slice(0, maxDocs).map((doc) => {
        const summary = doc.summary === '' ? '' : `：${doc.summary.slice(0, 120)}`;
        return `- ${doc.title}${summary}`;
      }),
    };
  }

  /**
   * 按窗口（每窗口最多 20 页）逐页渲染 + 视觉转写，直到 toPage。
   * 全量视觉、自动视觉兜底、自动修复都复用这一条路径。
   */
  async function runVisionWindows({ job, doc, kbId, conversion, apiKey, fromPage, toPage, existingMarkdown = '', replace = false, notes = '', cancelSignal }) {
    const parts = [];
    let firstResult = null;
    let page = fromPage;
    let sampleFirst = null;
    let sampleLast = [];
    const windowSize = Math.max(1, Math.min(20, conversion.maxImages || 20));
    const signal = cancelSignal ?? job.controller.signal;
    while (page <= toPage) {
      if (signal.aborted) throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
      job.progress = { phase: 'images', done: page - 1, total: toPage };
      const windowImages = await extractDocumentImages({
        store,
        kbId,
        doc,
        maxImages: windowSize,
        startPage: page,
        scale: conversion.rasterScale,
      });
      if (windowImages.length === 0) break;
      sampleFirst = sampleFirst ?? windowImages[0];
      sampleLast = windowImages;
      job.progress = { phase: 'vision', done: page - 1, total: toPage };
      const section = await convertWithVision({
        settings: conversion,
        apiKey,
        images: windowImages,
        title: doc.title,
        signal,
        continuation: page > fromPage || (!replace && existingMarkdown.trim() !== ''),
        concurrency: conversion.concurrency,
        batchPages: conversion.visionBatchPages,
        notes: page === fromPage ? notes : '',
        onProgress: (progress) => {
          job.progress = {
            phase: 'vision',
            done: Math.min(toPage, page - 1 + (Number(progress.done) || 0)),
            total: toPage,
          };
        },
      });
      parts.push(section.content);
      firstResult = firstResult ?? section;
      page += windowImages.length;
    }
    const pages = Math.min(toPage, page - 1);
    const sampleImages =
      sampleFirst === null ? [] : [sampleFirst, ...sampleLast.filter((item) => item !== sampleFirst)].slice(0, 3);
    return { parts, firstResult, pages, sampleImages };
  }

  async function startConversion(kbId, docId, options = {}) {
    await ready();
    const { doc } = await store.getDoc(kbId, docId);
    if (doc.status === 'ready' && options.force !== true && options.continue !== true && options.full !== true) {
      return { job: publicJob({ id: newId('job'), kbId, docId, status: 'done', result: { skipped: true } }), skipped: true };
    }
    if ((options.continue === true || options.full === true) && options.forceVision !== true && doc.status === 'ready') {
      const continuingVision = (doc.visionPages ?? 0) > 0 || doc.conversionMode === 'vision';
      const morePages = continuingVision && (doc.totalPages ?? 0) > (doc.visionPages ?? 0);
      // 文本文档按剩余字符判断；剩余不超过 8 个字符视为已转完。
      const moreText = !continuingVision && (doc.sourceChars ?? 0) - (doc.textOffset ?? 0) > 8;
      if (!morePages && !moreText) {
        return { job: publicJob({ id: newId('job'), kbId, docId, status: 'done', result: { skipped: true } }), skipped: true };
      }
    }
    // 同一文档已有转化任务时复用，避免面板与工具各点一次就跑两遍模型。
    // 全量转化自身是编排任务（orchestrator），不能把它当成可复用的子任务，否则会等待自己。
    for (const existing of jobs.values()) {
      if (existing.orchestrator === true) continue;
      if (existing.status === 'running' && existing.kbId === kbId && existing.docId === docId) {
        return { job: publicJob(existing), reused: true };
      }
    }
    const jobId = newId('job');
    const job = {
      id: jobId,
      kbId,
      docId,
      title: doc.title,
      status: 'running',
      progress:
        options.full === true && options.forceVision === true && (doc.totalPages ?? 0) > 0
          ? { phase: 'images', done: 0, total: doc.totalPages }
          : { phase: 'reading', done: 0, total: 1 },
      startedAt: nowIso(),
      finishedAt: null,
      error: null,
      result: null,
      controller: new AbortController(),
      parentId: options.parentId ?? null,
    };
    jobs.set(jobId, job);
    pruneJobs();

    const run = async () => {
      try {
        const conversion = await settings.get();
        const apiKey = await readConversionKey(ctx);
        const custom = typeof apiKey === 'string' && apiKey !== '' && conversion.baseURL !== '' && conversion.model !== '';

        const source = await store.readSourceText(kbId, doc);
        let text = source.text ?? '';
        let quality = Number.isFinite(doc.textQuality) ? doc.textQuality : null;
        // 旧的导入可能因为抽取器不支持 CID 字体而没留下文本；转化前再试一次，
        // 解析器升级后无需重新导入即可补回正文。
        if (text.trim() === '' && typeof doc.rawPath === 'string') {
          job.progress = { phase: 'extract', done: 0, total: 1 };
          const retried = await store.reextract(kbId, docId);
          text = retried.text ?? '';
          quality = retried.quality?.ratio ?? quality;
        }
        if (text.trim() !== '' && quality === null) quality = 1;

        // 判断是否需要走视觉：没有文本、文本质量差，或本身就是图片文档。
        // 「继续转化」按上次的转化方式续读：视觉文档从下一页开始，文本文档从上次字符偏移继续。
        // 「全量转化」把剩下的页面/文本一次做完：按窗口循环渲染 + 转写，直到最后一页。
        const isContinue = options.continue === true;
        const isFull = options.full === true;
        const forceVision = options.forceVision === true;
        const continuingVision = (isContinue || isFull) && (doc.conversionMode === 'vision' || (doc.visionPages ?? 0) > 0);
        const existingMarkdown = isContinue || isFull ? (await store.readMarkdown(kbId, docId)).text : '';
        // 强制视觉 + 全量 = 用视觉把整篇重做一遍（用于 OCR 残片、原文残缺的文本转化文档）。
        const replaceVision = forceVision && isFull;
        let images = [];
        let startPage = 1;
        let converted = null;
        let mode = 'text';
        let fullVisionPages = null;
        let fullVisionTotal = 0;
        const poorText = text.trim() === '' || (quality !== null && quality < 0.9);
        if (forceVision && doc.kind !== 'pdf' && doc.kind !== 'image') {
          throw Object.assign(new Error('只有 PDF 或图片可以用视觉提取'), { code: 'vision-unsupported' });
        }

        const visionUsable =
          custom &&
          conversion.vision === true &&
          typeof doc.rawPath === 'string' &&
          (doc.kind === 'pdf' || doc.kind === 'image');

        // 自动视觉兜底：没有可用文本 / 文本质量差 / 图片文档，且配置了视觉模型时，
        // 直接整篇走视觉，不再停在「待转化」等用户点按钮。
        const autoVision = visionUsable && conversion.autoVisionFallback !== false && (poorText || doc.kind === 'image');
        let checkImages = [];

        // 全量：按窗口（最多 20 页/次）循环渲染 + 转写，直到最后一页，内存不会一次性装下整本书。
        // 覆盖三种情形：用户点「全量转化」、自动视觉兜底（首次即整篇）、继续 + 全量（从已有页往后）。
        const wantsWindowLoop = (isFull || autoVision) && visionUsable;
        if (wantsWindowLoop) {
          const totalPages = doc.kind === 'image' ? 1 : doc.totalPages ?? 0;
          const alreadyPages = replaceVision || autoVision ? 0 : Math.max(0, doc.visionPages ?? 0);
          if (totalPages > alreadyPages) {
            fullVisionTotal = totalPages;
            const window = await runVisionWindows({
              job,
              doc,
              kbId,
              conversion,
              apiKey,
              fromPage: alreadyPages + 1,
              toPage: totalPages,
              existingMarkdown,
              replace: replaceVision || autoVision,
            });
            checkImages = window.sampleImages;
            if (window.parts.length > 0) {
              fullVisionPages = window.pages;
              const previous = replaceVision || autoVision ? '' : existingMarkdown;
              const body = `${previous.trim()}\n\n${window.parts.join('\n\n')}`.trim();
              converted = {
                title: window.firstResult?.title ?? doc.title,
                summary: window.firstResult?.summary || doc.summary || '',
                tags: window.firstResult?.tags?.length ? window.firstResult.tags : doc.tags ?? [],
                content: body.startsWith('#') ? body : `# ${doc.title}\n\n${body}`,
                chunks: window.parts.length,
                pages: fullVisionPages,
                mode: 'vision',
                partial: fullVisionPages < totalPages,
              };
              mode = 'vision';
            }
          } else if (isFull) {
            // 已经转完：全量没什么可做，交给下面的单窗口路径继续判断。
            fullVisionTotal = totalPages;
          }
        }

        // 单窗口：只用于「继续转化」的一批页面；首次转化已由上面的自动视觉兜底整篇处理。
        if (converted === null && continuingVision) {
          if (typeof doc.rawPath !== 'string') {
            throw Object.assign(new Error('该文档没有原始文件，无法继续按页转化'), { code: 'no-source-file' });
          }
          if (!(doc.visionPages > 0) && existingMarkdown.trim() !== '') {
            throw Object.assign(new Error('这篇文档是旧版本转化的，页数记录缺失；请先点「重新转化」'), { code: 'legacy-unknown-progress' });
          }
          startPage = Math.max(1, (doc.visionPages ?? 0) + 1);
          job.progress = { phase: 'images', done: 0, total: 1 };
          images = await extractDocumentImages({
            store,
            kbId,
            doc,
            maxImages: conversion.maxImages,
            startPage,
            scale: conversion.rasterScale,
          });
          if (images.length === 0) {
            job.status = 'done';
            job.progress = { phase: 'saved', done: 1, total: 1 };
            job.result = { skipped: true };
            return;
          }
          const canVision = custom && images.length > 0;
          if (canVision) {
            job.progress = { phase: 'vision', done: 0, total: 1 };
            converted = await convertWithVision({
              settings: conversion,
              apiKey,
              images,
              title: doc.title,
              signal: job.controller.signal,
              continuation: true,
              concurrency: conversion.concurrency,
              batchPages: conversion.visionBatchPages,
              onProgress: (progress) => {
                job.progress = progress;
              },
            });
            mode = 'vision';
            checkImages = images.slice(0, 3);
          }
        }

        // 视觉不可用（没配模型 / 不是 PDF 或图片）但确实没有可用文本时，给出可执行的提示。
        if (converted === null && text.trim() === '' && (poorText || doc.kind === 'image')) {
          if (!visionUsable) {
            throw Object.assign(
              new Error(
                conversion.vision === false
                  ? '没有可转化的原文，且「自动视觉提取」已关闭；请在「转化设置」里打开视觉识别'
                  : '没有可转化的原文；请在「转化设置」里填写视觉模型（服务地址、模型、API Key），再重新转化',
              ),
              { code: 'vision-unavailable' },
            );
          }
          throw Object.assign(new Error('视觉模型没有返回可用的转写结果，请稍后重试或改用对话内的工具'), {
            code: 'vision-empty',
          });
        }

        if (converted === null) {
          if (text.trim() === '') {
            throw Object.assign(
              new Error('没有可转化的原文；该文件可能是扫描件。请在「转化设置」里配置支持视觉的模型，或让模型读图后写回资料库'),
              { code: 'no-source-text' },
            );
          }
          const textStart = continuingVision ? 0 : isContinue || isFull ? Math.max(0, doc.textOffset ?? 0) : 0;
          const remaining = text.slice(textStart);
          if (remaining.trim().length < 4) {
            job.status = 'done';
            job.progress = { phase: 'saved', done: 1, total: 1 };
            job.result = { skipped: true };
            return;
          }
          job.progress = { phase: 'model', done: 0, total: 1 };
          const chat = custom
            ? async ({ system, prompt, maxTokens }) =>
                chatCompletion({
                  baseURL: conversion.baseURL,
                  apiKey,
                  model: conversion.model,
                  system,
                  messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
                  maxTokens,
                  temperature: conversion.temperature,
                  signal: job.controller.signal,
                })
            : undefined;
          const textResult = await convertTextWithModel({
            ctx,
            chat,
            text: remaining,
            title: doc.title,
            config: { ...config, concurrency: conversion.concurrency, ...(isFull ? { maxChunks: 9999 } : {}) },
            signal: job.controller.signal,
            onProgress: (progress) => {
              job.progress = progress;
            },
          });
          // 续读时保留原有的标题/摘要/标签，只追加正文。
          converted = isContinue
            ? {
                ...textResult,
                title: doc.title,
                summary: doc.summary ?? '',
                tags: doc.tags ?? [],
                content: textResult.content,
                consumed: textResult.consumed ?? 0,
              }
            : textResult;
          mode = 'text';
          converted.textStart = textStart;
        }

        // 续读：把新内容接在已有 Markdown 后面（全量视觉过程中已自行拼接）。
        if ((isContinue || isFull) && mode !== 'vision' && existingMarkdown.trim() !== '') {
          converted.content = `${existingMarkdown.trim()}\n\n${converted.content.trim()}`.trim();
        }

        // 记录进度：视觉按页、文本按字符，用于「只转了前 N 页」提示与继续转化。
        let totalPages = doc.totalPages ?? 0;
        let visionPages = doc.visionPages ?? 0;
        let textOffset = doc.textOffset ?? 0;
        let partial = false;
        if (mode === 'vision') {
          if (fullVisionPages !== null) {
            visionPages = fullVisionPages;
            if (fullVisionTotal > 0) totalPages = fullVisionTotal;
            partial = totalPages > visionPages;
          } else {
            visionPages = (continuingVision ? startPage - 1 : 0) + images.length;
            if (totalPages === 0) totalPages = visionPages;
            partial = totalPages > visionPages;
          }
        } else {
          textOffset = (converted.textStart ?? 0) + (converted.consumed ?? 0);
          partial = textOffset < (doc.sourceChars ?? text.length);
        }

        // 视觉复核 + 自动修复：复核挑出问题就带着意见重转，最多 repairAttempts 轮，不再等用户点按钮。
        let visionCheck = null;
        const repairRounds = conversion.verify === true && custom ? Math.max(0, Math.min(5, Math.trunc(conversion.repairAttempts ?? 2))) : 0;
        const autoRepair = conversion.autoRepair !== false;
        const verifyImages = checkImages.length > 0 ? checkImages : images;
        if (conversion.verify === true && custom && verifyImages.length > 0 && mode === 'vision') {
          job.progress = { phase: 'verify', done: 0, total: 1 };
          visionCheck = await verifyWithVision({
            settings: conversion,
            apiKey,
            images: verifyImages,
            markdown: converted.content,
            title: doc.title,
            signal: job.controller.signal,
          });
          let round = 0;
          while (autoRepair && round < repairRounds && visionCheck !== null && visionCheck.ok === false) {
            round += 1;
            const issues = Array.isArray(visionCheck.issues) ? visionCheck.issues.join('；') : '';
            job.progress = { phase: 'repair', done: round, total: repairRounds, note: issues.slice(0, 200) };
            const from = 1;
            const to = Math.max(1, visionPages || totalPages || 1);
            const fixed = await runVisionWindows({
              job,
              doc,
              kbId,
              conversion,
              apiKey,
              fromPage: from,
              toPage: to,
              existingMarkdown: '',
              replace: true,
              notes: issues,
            });
            if (fixed.parts.length === 0) break;
            converted.content = fixed.parts.join('\n\n').trim();
            if (!converted.content.startsWith('#')) converted.content = `# ${converted.title ?? doc.title}\n\n${converted.content}`;
            if (fixed.firstResult?.summary) converted.summary = fixed.firstResult.summary;
            if (fixed.firstResult?.tags?.length) converted.tags = fixed.firstResult.tags;
            job.progress = { phase: 'verify', done: 0, total: 1 };
            visionCheck = await verifyWithVision({
              settings: conversion,
              apiKey,
              images: fixed.sampleImages.length > 0 ? fixed.sampleImages : verifyImages,
              markdown: converted.content,
              title: doc.title,
              signal: job.controller.signal,
            });
          }
        }

        const modelLabel =
          mode === 'vision'
            ? `视觉 · ${visionModelOf(conversion)}${visionPages ? ` · ${visionPages}${totalPages ? `/${totalPages}` : ''} 页` : ''}`
            : custom
              ? conversion.model
              : `${converted.chunks} 段`;
        // 取消后即使结果已经拿到也不要写盘，避免「点了取消却又保存」。
        if (job.controller.signal.aborted) {
          throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
        }
        const saved = await store.saveConverted({
          kbId,
          docId,
          title: converted.title,
          markdown: converted.content,
          summary: converted.summary,
          tags: converted.tags,
          model: modelLabel,
          conversionMode: mode,
          visionCheck,
          totalPages,
          visionPages,
          textOffset,
          partial,
        });
        job.status = 'done';
        job.result = { doc: saved, chunks: converted.chunks, truncated: converted.truncated, mode, visionCheck, partial };
      } catch (error) {
        if (error?.code === 'aborted' || job.controller.signal.aborted) {
          job.status = 'cancelled';
          job.error = null;
          try {
            await store.clearDocError(kbId, docId);
          } catch {
            /* 忽略 */
          }
        } else {
          job.status = 'error';
          job.error = {
            code: error?.code ?? 'conversion-failed',
            message: error instanceof Error ? error.message : String(error),
          };
          try {
            await store.markDocError(kbId, docId, job.error.message);
          } catch {
            /* 忽略落盘失败 */
          }
        }
      } finally {
        job.finishedAt = nowIso();
      }
    };

    job.done = run();
    void job.done;
    return { job: publicJob(job) };
  }

  /**
   * 按视觉复核意见修复：把这篇文档已转的页面重新用视觉转写一遍，
   * 并把复核提出的问题作为重点提示交给模型，最后重新复核。
   */
  async function startRepair(kbId, docId) {
    await ready();
    const { doc } = await store.getDoc(kbId, docId);
    if (doc.kind !== 'pdf' && doc.kind !== 'image') {
      throw Object.assign(new Error('只有 PDF 或图片支持视觉修复'), { code: 'vision-unsupported' });
    }
    // 修复只针对「已经用视觉转过、又被复核挑出问题」的文档；
    // 文本转化的 PDF 应该用「视觉重建」，否则会白跑一遍全页视觉。
    if (doc.conversionMode !== 'vision' && !doc.visionCheck) {
      throw Object.assign(new Error('这篇文档不是视觉转化的；要重做请用「视觉重建」'), { code: 'vision-not-applicable' });
    }
    const conversion = await settings.get();
    const apiKey = await readConversionKey(ctx);
    const custom = typeof apiKey === 'string' && apiKey !== '' && conversion.baseURL !== '' && conversion.model !== '';
    if (!custom) {
      throw Object.assign(new Error('没有配置视觉模型：请在「转化设置」里填写服务地址、模型与 API Key'), { code: 'vision-unavailable' });
    }
    const totalPages = doc.kind === 'image' ? 1 : doc.totalPages ?? 0;
    const endPage = Math.max(1, doc.visionPages || totalPages || 1);
    const issues = Array.isArray(doc.visionCheck?.issues) ? doc.visionCheck.issues.join('；') : '';

    const jobId = newId('job');
    const job = {
      id: jobId,
      kbId,
      docId,
      title: doc.title,
      status: 'running',
      progress: { phase: 'vision', done: 0, total: endPage },
      startedAt: nowIso(),
      finishedAt: null,
      error: null,
      result: null,
      controller: new AbortController(),
      orchestrator: true,
      repair: true,
    };
    jobs.set(jobId, job);
    pruneJobs();

    job.done = (async () => {
      try {
        const windowSize = Math.max(1, Math.min(20, conversion.maxImages || 20));
        const parts = [];
        let firstResult = null;
        let page = 1;
        while (page <= endPage) {
          if (job.controller.signal.aborted) throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
          job.progress = { phase: 'images', done: page - 1, total: endPage };
          const windowImages = await extractDocumentImages({
            store,
            kbId,
            doc,
            maxImages: windowSize,
            startPage: page,
            scale: conversion.rasterScale,
          });
          if (windowImages.length === 0) break;
          job.progress = { phase: 'vision', done: page - 1, total: endPage };
          const section = await convertWithVision({
            settings: conversion,
            apiKey,
            images: windowImages,
            title: doc.title,
            signal: job.controller.signal,
            continuation: page > 1,
            concurrency: conversion.concurrency,
            notes: page === 1 ? issues : '',
            onProgress: (progress) => {
              job.progress = { phase: 'vision', done: Math.min(endPage, page - 1 + (Number(progress.done) || 0)), total: endPage };
            },
          });
          parts.push(section.content);
          firstResult = firstResult ?? section;
          page += windowImages.length;
        }
        if (parts.length === 0) {
          throw Object.assign(new Error('没有可修复的页面'), { code: 'nothing-to-repair' });
        }
        const content = parts.join('\n\n').trim();
        job.progress = { phase: 'verify', done: 0, total: 1 };
        const lastWindow = await extractDocumentImages({ store, kbId, doc, maxImages: 3, startPage: Math.max(1, endPage - 2), scale: conversion.rasterScale });
        const visionCheck =
          conversion.verify === true && lastWindow.length > 0
            ? await verifyWithVision({
                settings: conversion,
                apiKey,
                images: lastWindow,
                markdown: content,
                title: doc.title,
                signal: job.controller.signal,
              })
            : null;
        if (job.controller.signal.aborted) {
          throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
        }
        const saved = await store.saveConverted({
          kbId,
          docId,
          title: firstResult?.title ?? doc.title,
          markdown: content,
          summary: firstResult?.summary || doc.summary || '',
          tags: firstResult?.tags?.length ? firstResult.tags : doc.tags ?? [],
          model: `视觉修复 · ${visionModelOf(conversion)}`,
          conversionMode: 'vision',
          visionCheck,
          visionPages: Math.min(endPage, page - 1),
          totalPages: totalPages || Math.min(endPage, page - 1),
          partial: totalPages > Math.min(endPage, page - 1),
        });
        job.status = 'done';
        job.progress = { phase: 'saved', done: 1, total: 1 };
        job.result = { doc: saved, visionCheck };
      } catch (error) {
        if (error?.code === 'aborted' || job.controller.signal.aborted) {
          job.status = 'cancelled';
          job.error = null;
        } else {
          job.status = 'error';
          job.error = { code: error?.code ?? 'repair-failed', message: error instanceof Error ? error.message : String(error) };
        }
      } finally {
        job.finishedAt = nowIso();
      }
    })();
    void job.done;
    return { job: publicJob(job) };
  }

  /**
   * 整个资料库全量转化：把「未转化」和「只转了一部分」的文档逐个跑完。
   * 已经全量转化的直接跳过；旧版视觉文档（页数记录缺失）也跳过并计入失败说明。
   */
  async function startFullLibrary(kbId) {
    await ready();
    const kb = await store.getKb(kbId);
    if (kb === undefined) throw Object.assign(new Error('资料库不存在'), { code: 'not-found' });
    const targets = kb.docs.filter((doc) => {
      if (doc.status !== 'ready') return true;
      const visionMode = doc.conversionMode === 'vision' || (doc.visionPages ?? 0) > 0;
      // 旧版本文本转化没有进度记录，续转会重复追加；交给用户手动「重新转化」。
      if (!visionMode && (doc.textOffset ?? 0) === 0 && typeof doc.mdPath === 'string') return false;
      return visionMode
        ? (doc.totalPages ?? 0) > (doc.visionPages ?? 0)
        : (doc.sourceChars ?? 0) - (doc.textOffset ?? 0) > 8;
    });
    if (targets.length === 0) {
      return { job: publicJob({ id: newId('job'), kbId, docId: null, status: 'done', result: { skipped: true } }), skipped: true };
    }
    const jobId = newId('job');
    const job = {
      id: jobId,
      kbId,
      docId: null,
      title: `${kb.title} · 全量转化`,
      status: 'running',
      progress: { phase: 'vision', done: 0, total: targets.length },
      startedAt: nowIso(),
      finishedAt: null,
      error: null,
      result: null,
      controller: new AbortController(),
      orchestrator: true,
      batch: true,
    };
    jobs.set(jobId, job);
    pruneJobs();

    job.done = (async () => {
      let done = 0;
      const skippedDocs = [];
      try {
        for (const target of targets) {
          if (job.controller.signal.aborted) {
            throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
          }
          job.progress = { phase: target.totalPages > 0 ? 'vision' : 'model', done, total: targets.length };
          try {
            const inner = await startFullConversion(kbId, target.id, jobId);
            if (inner.skipped !== true) {
              const record = jobs.get(inner.job.id);
              // 全量任务可以取消外层：把取消传给子任务。
              const cancelWatcher = () => {
                if (job.controller.signal.aborted) runtimeCancel(inner.job.id);
              };
              job.controller.signal.addEventListener('abort', cancelWatcher, { once: true });
              if (record?.done !== undefined) await record.done;
              job.controller.signal.removeEventListener('abort', cancelWatcher);
              if (record?.status === 'error') {
                skippedDocs.push(`${target.title}：${record.error?.message ?? '失败'}`);
              }
            }
          } catch (error) {
            skippedDocs.push(`${target.title}：${error instanceof Error ? error.message : String(error)}`);
          }
          done += 1;
          job.progress = { phase: 'vision', done, total: targets.length };
        }
        job.status = 'done';
        job.progress = { phase: 'saved', done: 1, total: 1 };
        job.result = { total: targets.length, failed: skippedDocs };
      } catch (error) {
        if (error?.code === 'aborted' || job.controller.signal.aborted) {
          job.status = 'cancelled';
          job.error = null;
        } else {
          job.status = 'error';
          job.error = { code: error?.code ?? 'conversion-failed', message: error instanceof Error ? error.message : String(error) };
        }
      } finally {
        job.finishedAt = nowIso();
      }
    })();
    void job.done;
    return { job: publicJob(job) };
  }

  function runtimeCancel(jobId) {
    const target = jobs.get(jobId);
    if (target !== undefined && target.status === 'running') target.controller.abort();
  }

  /**
   * 单篇全量转化：内部复用「继续转化」，每次处理一批（默认最多 maxImages 页），直到没有剩余。
   * 外层只有一个任务，进度按「已处理页数 / 总页数」汇报。
   */
  async function startFullConversion(kbId, docId, parentId = null) {
    await ready();
    const { doc } = await store.getDoc(kbId, docId);
    const totalPages = doc.kind === 'image' ? 1 : doc.totalPages ?? 0;
    const isVision = totalPages > 0 && (doc.conversionMode === 'vision' || (doc.visionPages ?? 0) > 0);
    if (isVision && !(doc.visionPages > 0)) {
      // 旧版本转的视觉文档没有页数记录；从第 1 页追加会重复，要求先重新转化。
      const existing = await store.readMarkdown(kbId, docId);
      if (existing.text.trim() !== '') {
        throw Object.assign(new Error('这篇文档是旧版本转化的，页数记录缺失；请先点「重新转化」再全量转化'), {
          code: 'legacy-unknown-progress',
        });
      }
    }
    const remainingPages = isVision ? totalPages - (doc.visionPages ?? 0) : 0;
    const remainingText = doc.partial === true && doc.conversionMode !== 'vision';
    // 从没转化过的文档也要能全量转化：此时没有 Markdown，直接从头开始。
    const fresh = doc.status !== 'ready' || typeof doc.mdPath !== 'string';
    // 已经转完、或旧版视觉文档（页数记录缺失，继续追加会重复），都不该再跑。
    if (!fresh && remainingPages <= 0 && !remainingText) {
      return { job: publicJob({ id: newId('job'), kbId, docId, status: 'done', result: { skipped: true } }), skipped: true };
    }
    const totalUnits = totalPages > 0 && isVision ? totalPages : doc.sourceChars || doc.chars || 1;
    const doneUnits = totalPages > 0 && isVision ? doc.visionPages ?? 0 : doc.textOffset ?? 0;
    if (!fresh && doneUnits >= totalUnits) {
      return { job: publicJob({ id: newId('job'), kbId, docId, status: 'done', result: { skipped: true } }), skipped: true };
    }
    const jobId = newId('job');
    const job = {
      id: jobId,
      kbId,
      docId,
      title: doc.title,
      status: 'running',
      progress: { phase: totalPages > 0 ? 'vision' : 'model', done: doneUnits, total: totalUnits },
      startedAt: nowIso(),
      finishedAt: null,
      error: null,
      result: null,
      controller: new AbortController(),
      inner: null,
      orchestrator: true,
      parentId,
    };
    jobs.set(jobId, job);
    pruneJobs();

    job.done = (async () => {
      try {
        let guard = 0;
        let stalled = 0;
        while (guard < 500) {
          guard += 1;
          if (job.controller.signal.aborted) {
            throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
          }
          const { doc: current } = await store.getDoc(kbId, docId);
          job.progress = {
            phase: current.kind === 'image' || current.totalPages > 0 ? 'vision' : 'model',
            done: current.totalPages > 0 ? current.visionPages ?? 0 : current.textOffset ?? 0,
            total: current.totalPages > 0 ? current.totalPages : current.sourceChars || current.chars || 1,
          };
          const inner = await startConversion(kbId, docId, { continue: true, parentId });
          if (inner.skipped === true) break;
          job.inner = inner.job.id;
          const record = jobs.get(inner.job.id);
          if (record?.done !== undefined) await record.done;
          if (record?.status !== 'done') {
            throw Object.assign(new Error(record?.error?.message ?? '转化失败'), { code: record?.error?.code ?? 'conversion-failed' });
          }
          const { doc: after } = await store.getDoc(kbId, docId);
          const doneAfter = after.totalPages > 0 ? after.visionPages ?? 0 : after.textOffset ?? 0;
          const totalAfter = after.totalPages > 0 ? after.totalPages : after.sourceChars || after.chars || 1;
          job.progress = { phase: after.totalPages > 0 ? 'vision' : 'model', done: doneAfter, total: totalAfter };
          // 没有进展就停下，避免源文件/上限导致死循环。
          if (doneAfter <= doneUnits) stalled += 1;
          else stalled = 0;
          if (doneAfter >= totalAfter || after.partial !== true || stalled >= 2) break;
        }
        const { doc: finalDoc } = await store.getDoc(kbId, docId);
        job.status = 'done';
        job.progress = { phase: 'saved', done: 1, total: 1 };
        job.result = { doc: publicDocOf(kbId, finalDoc), mode: finalDoc.conversionMode, partial: finalDoc.partial === true };
      } catch (error) {
        if (error?.code === 'aborted' || job.controller.signal.aborted) {
          job.status = 'cancelled';
          job.error = null;
        } else {
          job.status = 'error';
          job.error = { code: error?.code ?? 'conversion-failed', message: error instanceof Error ? error.message : String(error) };
        }
      } finally {
        job.finishedAt = nowIso();
      }
    })();
    void job.done;
    return { job: publicJob(job) };
  }

  function publicDocOf(kbId, doc) {
    const kb = store.library.kbs.find((item) => item.id === kbId);
    return kb === undefined ? null : store.publicDoc(kb, doc);
  }

  async function convertAndWait(kbId, docId, options = {}) {
    const { job, skipped, reused } = await startConversion(kbId, docId, options);
    if (skipped === true) return { ok: true, job, skipped: true };
    const record = jobs.get(job.id);
    if (record === undefined) return { ok: true, job, skipped: true };
    if (reused === true && record.done !== undefined) await record.done;
    else if (record.done !== undefined) await record.done;
    return { ok: record.status === 'done', job: publicJob(record) };
  }

  function getJob(jobId) {
    const job = jobs.get(jobId);
    return job === undefined ? null : publicJob(job);
  }

  // 阶段在总进度里的区间：完成度 = 起点 + 阶段内比例 × 区间宽度。
  const PHASE_RANGES = {
    reading: [0, 4],
    extract: [4, 14],
    images: [14, 20],
    imagesContinue: [14, 20],
    model: [20, 90],
    vision: [20, 90],
    repair: [78, 92],
    verify: [90, 98],
    saved: [98, 100],
  };

  function percentOf(progress) {
    if (progress === null || progress === undefined) return 0;
    const [start, end] = PHASE_RANGES[progress.phase] ?? [20, 90];
    const total = Number(progress.total) || 0;
    const done = Number(progress.done) || 0;
    const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
    return Math.round(start + (end - start) * ratio);
  }

  function publicJob(job) {
    return {
      id: job.id,
      kbId: job.kbId,
      docId: job.docId,
      title: job.title,
      status: job.status,
      progress: job.progress,
      percent: job.status === 'done' ? 100 : percentOf(job.progress),
      startedAt: job.startedAt,
      finishedAt: job.finishedAt ?? null,
      error: job.error ?? null,
      result: job.result ?? null,
    };
  }

  function cancelJob(jobId) {
    const job = jobs.get(jobId);
    if (job === undefined) return false;
    // 立刻把任务标记为已取消并中止，不等底层 await 返回；连同所有子任务一起停。
    const stack = [job];
    const seen = new Set();
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || seen.has(current.id)) continue;
      seen.add(current.id);
      if (current.status === 'running') {
        current.controller.abort();
        current.status = 'cancelled';
        current.error = null;
        current.finishedAt = nowIso();
      }
      for (const child of jobs.values()) {
        if (child.parentId === current.id) stack.push(child);
      }
    }
    return true;
  }

  function cancelAll() {
    for (const job of jobs.values()) if (job.status === 'running') job.controller.abort();
  }

  // 看门狗：任务长时间没有进度就自动停止，避免「已用 14h」这种僵死任务。
  const STALE_MINUTES = Number.isFinite(config.jobStaleMinutes) ? Math.max(2, config.jobStaleMinutes) : 20;
  const MAX_JOB_HOURS = Number.isFinite(config.jobMaxHours) ? Math.max(0.5, config.jobMaxHours) : 8;
  const watchSnapshots = new Map();

  function watchdogTick() {
    const now = Date.now();
    for (const job of jobs.values()) {
      if (job.status !== 'running') {
        watchSnapshots.delete(job.id);
        continue;
      }
      const progress = job.progress ?? {};
      const signature = `${progress.phase}|${progress.done}|${progress.total}`;
      const previous = watchSnapshots.get(job.id);
      if (previous === undefined || previous.signature !== signature) {
        watchSnapshots.set(job.id, { signature, at: now });
        continue;
      }
      const staleMs = now - previous.at;
      const runningHours = (now - new Date(job.startedAt).getTime()) / 3_600_000;
      const tooLong = runningHours > MAX_JOB_HOURS;
      if (staleMs > STALE_MINUTES * 60_000 || tooLong) {
        job.controller.abort();
        job.status = 'error';
        job.error = {
          code: 'job-stalled',
          message: tooLong
            ? `任务运行超过 ${MAX_JOB_HOURS} 小时已自动停止（可能模型无响应）`
            : `${STALE_MINUTES} 分钟没有进度，已自动停止（模型可能无响应或超时）`,
        };
        job.finishedAt = nowIso();
        watchSnapshots.delete(job.id);
        logger?.warn?.(`[knowledge-base] 任务 ${job.id}（${job.title}）${job.error.message}`);
      }
    }
  }

  const watchdogTimer = setInterval(watchdogTick, 60_000);
  if (typeof watchdogTimer.unref === 'function') watchdogTimer.unref();
  // 插件卸载时停止看门狗。
  try {
    ctx.effect(() => () => clearInterval(watchdogTimer), 'knowledge-base: job watchdog');
  } catch {
    /* mock ctx 没有 effect 时忽略 */
  }

  async function overview(sessionId) {
    await ready();
    const [kbs, stats] = await Promise.all([store.listKbs(), store.stats()]);
    const binding = sessionId ? bindingOfSync(sessionId) : null;
    const running = [...jobs.values()].filter((job) => job.status === 'running').map((job) => publicJob(job));
    return { kbs, stats, binding, running };
  }

  return {
    store,
    settings,
    dataDir,
    ready,
    bindingOfSync,
    catalogOfSync,
    startConversion,
    startFullConversion,
    startFullLibrary,
    startRepair,
    convertAndWait,
    getJob,
    cancelJob,
    cancelAll,
    overview,
    jobs,
  };
}
