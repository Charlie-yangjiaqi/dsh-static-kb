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
    if (doc.status === 'ready' && options.force !== true) {
      return { job: publicJob({ id: newId('job'), kbId, docId, status: 'done', result: { skipped: true } }), skipped: true };
    }
    // 同一文档已有转化任务时复用，避免面板与工具各点一次就跑两遍模型。
    for (const existing of jobs.values()) {
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
        let images = [];
        const poorText = text.trim() === '' || (quality !== null && quality < 0.9);
        if (conversion.vision === true && (poorText || doc.kind === 'image') && typeof doc.rawPath === 'string') {
          job.progress = { phase: 'images', done: 0, total: 1 };
          images = await extractDocumentImages({ store, kbId, doc, maxImages: conversion.maxImages });
        }
        const canVision = custom && images.length > 0;

        let converted = null;
        let mode = 'text';
        if (canVision && (text.trim() === '' || doc.kind === 'image' || poorText)) {
          try {
            job.progress = { phase: 'vision', done: 0, total: 1 };
            converted = await convertWithVision({
              settings: conversion,
              apiKey,
              images,
              title: doc.title,
              signal: job.controller.signal,
              onProgress: (progress) => {
                job.progress = progress;
              },
            });
            mode = 'vision';
          } catch (error) {
            if (text.trim() === '') throw error;
            // 视觉失败但还有文本：退回文本转化，不中断任务。
            converted = null;
          }
        }

        if (converted === null) {
          if (text.trim() === '') {
            throw Object.assign(
              new Error('没有可转化的原文；该文件可能是扫描件。请在「转化设置」里配置支持视觉的模型，或让模型读图后写回资料库'),
              { code: 'no-source-text' },
            );
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
          converted = await convertTextWithModel({
            ctx,
            chat,
            text,
            title: doc.title,
            config,
            signal: job.controller.signal,
            onProgress: (progress) => {
              job.progress = progress;
            },
          });
          mode = 'text';
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
            ? `视觉 · ${visionModelOf(conversion)}`
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
        });
        job.status = 'done';
        job.result = { doc: saved, chunks: converted.chunks, truncated: converted.truncated, mode, visionCheck };
      } catch (error) {
        if (error?.code === 'aborted') {
          job.status = 'cancelled';
          job.error = null;
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

  function publicJob(job) {
    return {
      id: job.id,
      kbId: job.kbId,
      docId: job.docId,
      title: job.title,
      status: job.status,
      progress: job.progress,
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
    convertAndWait,
    getJob,
    cancelJob,
    cancelAll,
    overview,
    jobs,
  };
}
