// 运行时：组装存储、转化任务与系统提示词所需的同步快照。
import { homedir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore } from './store.js';
import { convertTextWithModel } from './llm.js';
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
  const jobs = new Map();
  let loadPromise = null;

  const ready = () => {
    if (loadPromise === null) loadPromise = store.ensureLoaded();
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
        const source = await store.readSourceText(kbId, doc);
        const text = source.text ?? '';
        if (text.trim() === '') {
          throw Object.assign(new Error('没有可转化的原文；请让模型用文件阅读工具读取原始文件后再写入'), { code: 'no-source-text' });
        }
        job.progress = { phase: 'model', done: 0, total: 1 };
        const converted = await convertTextWithModel({
          ctx,
          text,
          title: doc.title,
          config,
          signal: job.controller.signal,
          onProgress: (progress) => {
            job.progress = progress;
          },
        });
        const saved = await store.saveConverted({
          kbId,
          docId,
          title: converted.title,
          markdown: converted.content,
          summary: converted.summary,
          tags: converted.tags,
          model: `${converted.chunks} 段`,
        });
        job.status = 'done';
        job.result = { doc: saved, chunks: converted.chunks, truncated: converted.truncated };
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
