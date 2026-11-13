// @local/dsh-knowledge-base —— 静态资料库插件（Host 半边）。
//
// 组成：
//   lib/store.js   元数据 + 文件 + 检索 + 会话绑定（真源是可读的普通文件）
//   lib/extract.js 各格式原文抽取（txt/md/html/pdf/epub/docx/zip）
//   lib/llm.js     用宿主默认模型把原文整理成可检索的 Markdown
//   lib/routes.js  浏览器面板用的同源 API（/dsh-kb/api）
//   lib/tools.js   agent 工具：kb_search / kb_read / kb_convert / kb_write_doc …
//   lib/prompt.js  绑定后注入「资料库优先」规则与目录
//   client.js      浏览器面板：标题栏绑定开关、侧边栏入口、资料库面板与预览
import { createRuntime } from './lib/runtime.js';
import { registerPrompt } from './lib/prompt.js';
import { registerRoutes } from './lib/routes.js';
import { registerTools } from './lib/tools.js';

export const name = 'knowledge-base';
export const inject = ['tools', 'systemPrompt', 'webServer'];

export async function apply(ctx, config = {}) {
  const runtime = createRuntime({ ctx, config });

  // 预热：系统提示词在同步路径上读绑定与目录，必须先载入一次。
  try {
    await runtime.ready();
  } catch (error) {
    ctx.logger?.error?.(`[knowledge-base] 无法载入资料库数据：${error instanceof Error ? error.message : String(error)}`);
  }

  ctx.effect(() => () => runtime.cancelAll(), 'knowledge-base: abort running conversions');

  registerPrompt({ ctx, runtime });
  await registerTools({ ctx, runtime });
  registerRoutes({ ctx, runtime, config });
}
