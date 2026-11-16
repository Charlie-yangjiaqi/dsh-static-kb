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

  async function startConversion(kbId, docId, options = {}) {
    await ready();
    const { doc } = await store.getDoc(kbId, docId);
    if (doc.status === 'ready' && options.force !== true && options.continue !== true && options.full !== true) {
      return { job: publicJob({ id: newId('job'), kbId, docId, status: 'done', result: { skipped: true } }), skipped: true };
    }
    if ((options.continue === true || options.full === true) && doc.status === 'ready') {
      const continuingVision = (doc.visionPages ?? 0) > 0 || doc.conversionMode === 'vision';
      const morePages = continuingVision && (doc.totalPages ?? 0) > (doc.visionPages ?? 0);
      // 文本文档只有记录过偏移才算「还有剩余」；老文档偏移为 0 视为已转完，避免整篇重复追加。
      const moreText = !continuingVision && (doc.textOffset ?? 0) > 0;
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
      progress: { phase: 'reading', done: 0, total: 1 },
      startedAt: nowIso(),
      finishedAt: null,
      error: null,
      result: null,
      controller: new AbortController(),
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

        // 全量：按窗口（最多 20 页/次）循环渲染 + 转写，直到最后一页，内存不会一次性装下整本书。
        if (isFull && visionUsable) {
          const totalPages = doc.kind === 'image' ? 1 : doc.totalPages ?? 0;
          const alreadyPages = replaceVision ? 0 : continuingVision ? doc.visionPages ?? 0 : 0;
          if (totalPages > alreadyPages) {
            fullVisionTotal = totalPages;
            const parts = [];
            let firstResult = null;
            let page = alreadyPages + 1;
            const windowSize = Math.max(1, Math.min(20, conversion.maxImages || 20));
            while (page <= totalPages) {
              if (job.controller.signal.aborted) {
                throw Object.assign(new Error('转化已取消'), { code: 'aborted' });
              }
              job.progress = { phase: 'images', done: page - 1, total: totalPages };
              const windowImages = await extractDocumentImages({
                store,
                kbId,
                doc,
                maxImages: windowSize,
                startPage: page,
                scale: conversion.rasterScale,
              });
              if (windowImages.length === 0) break;
              images = windowImages;
              job.progress = { phase: 'vision', done: page - 1, total: totalPages };
              const section = await convertWithVision({
                settings: conversion,
                apiKey,
                images: windowImages,
                title: doc.title,
                signal: job.controller.signal,
                continuation: page > 1 || (!replaceVision && existingMarkdown.trim() !== ''),
                concurrency: conversion.concurrency,
                onProgress: (progress) => {
                  job.progress = {
                    phase: 'vision',
                    done: Math.min(totalPages, page - 1 + (Number(progress.done) || 0)),
                    total: totalPages,
                  };
                },
              });
              parts.push(section.content);
              firstResult = firstResult ?? section;
              page += windowImages.length;
            }
            if (parts.length > 0) {
              fullVisionPages = Math.min(totalPages, page - 1);
              const previous = replaceVision ? '' : existingMarkdown;
              const body = `${previous.trim()}\n\n${parts.join('\n\n')}`.trim();
              converted = {
                title: firstResult?.title ?? doc.title,
                summary: firstResult?.summary || doc.summary || '',
                tags: firstResult?.tags?.length ? firstResult.tags : doc.tags ?? [],
                content: body.startsWith('#') ? body : `# ${doc.title}\n\n${body}`,
                chunks: parts.length,
                pages: fullVisionPages,
                mode: 'vision',
                partial: fullVisionPages < totalPages,
              };
              mode = 'vision';
            }
          }
        }

        // 单窗口：首次视觉，或「继续转化」只处理下一批页面。
        if (converted === null) {
          if (continuingVision) {
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
              throw Object.assign(
                new Error(`没有可继续转化的页面（已处理 ${doc.visionPages ?? 0} 页${doc.totalPages ? ` / 共 ${doc.totalPages} 页` : ''}）`),
                { code: 'nothing-to-continue' },
              );
            }
          } else if ((conversion.vision === true || forceVision) && (forceVision || poorText || doc.kind === 'image') && typeof doc.rawPath === 'string') {
            if (forceVision && !custom) {
              throw Object.assign(
                new Error('用户要求用视觉提取，但没有配置视觉模型：请在「转化设置」里填写服务地址、模型与 API Key'),
                { code: 'vision-unavailable' },
              );
            }
            job.progress = { phase: 'images', done: 0, total: 1 };
            images = await extractDocumentImages({ store, kbId, doc, maxImages: conversion.maxImages, scale: conversion.rasterScale });
          }

          const canVision = custom && images.length > 0;
          if (canVision && (continuingVision || forceVision || text.trim() === '' || doc.kind === 'image' || poorText)) {
            try {
              job.progress = { phase: 'vision', done: 0, total: 1 };
              converted = await convertWithVision({
                settings: conversion,
                apiKey,
                images,
                title: doc.title,
                signal: job.controller.signal,
                continuation: continuingVision,
                concurrency: conversion.concurrency,
                onProgress: (progress) => {
                  job.progress = progress;
                },
              });
              mode = 'vision';
            } catch (error) {
              if (text.trim() === '' || continuingVision || forceVision) throw error;
              // 视觉失败但还有文本：退回文本转化，不中断任务。
              converted = null;
            }
          }
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
            throw Object.assign(new Error('这篇文档已经全部转化完成，没有剩余内容'), { code: 'nothing-to-continue' });
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
          if (isFull && fullVisionPages !== null) {
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

        let visionCheck = null;
        if (conversion.verify === true && custom && images.length > 0) {
          job.progress = { phase: 'verify', done: 0, total: 1 };
          visionCheck = await verifyWithVision({
            settings: conversion,
            apiKey,
            images,
            markdown: converted.content,
            title: doc.title,
            signal: job.controller.signal,
          });
        }

        const modelLabel =
          mode === 'vision'
            ? `视觉 · ${visionModelOf(conversion)}${visionPages ? ` · ${visionPages}${totalPages ? `/${totalPages}` : ''} 页` : ''}`
            : custom
              ? conversion.model
              : `${converted.chunks} 段`;
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
    const targets = kb.docs.filter((doc) => doc.status !== 'ready' || doc.partial === true);
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
            const inner = await startFullConversion(kbId, target.id);
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
  async function startFullConversion(kbId, docId) {
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
    // 已经转完、或旧版视觉文档（页数记录缺失，继续追加会重复），都不该再跑。
    if (remainingPages <= 0 && !remainingText) {
      return { job: publicJob({ id: newId('job'), kbId, docId, status: 'done', result: { skipped: true } }), skipped: true };
    }
    const totalUnits = totalPages > 0 && isVision ? totalPages : doc.sourceChars || doc.chars || 1;
    const doneUnits = totalPages > 0 && isVision ? doc.visionPages ?? 0 : doc.textOffset ?? 0;
    if (doneUnits >= totalUnits) {
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
          const inner = await startConversion(kbId, docId, { continue: true });
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
    if (job === undefined || job.status !== 'running') return false;
    job.controller.abort();
    return true;
  }

  function cancelAll() {
    for (const job of jobs.values()) if (job.status === 'running') job.controller.abort();
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
