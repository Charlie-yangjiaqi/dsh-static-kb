#!/usr/bin/env node
// 生成 market/index.json（DSH 插件市场索引 format 1）。
// 用法：
//   node scripts/build-market-index.mjs            # 用当前 HEAD 作为钉住的提交
//   node scripts/build-market-index.mjs <40位SHA>   # 指定发布提交
//   MARKET_SOURCE=npm node scripts/build-market-index.mjs  # 发布到 npm 后用 npm 源
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const repositoryUrl = 'https://github.com/Charlie-yangjiaqi/dsh-static-kb';
const sourceKind = process.env.MARKET_SOURCE === 'npm' ? 'npm' : 'git';

const commit = (process.argv[2] ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).trim();
if (!/^[0-9a-f]{40}$/u.test(commit)) {
  console.error(`commit 必须是完整 40 位小写 SHA，收到：${commit}`);
  process.exit(1);
}

let publishTimestamp = Math.floor(Date.now() / 1000);
try {
  const seconds = Number(execFileSync('git', ['show', '-s', '--format=%ct', commit], { cwd: root, encoding: 'utf8' }).trim());
  if (Number.isInteger(seconds) && seconds > 0) publishTimestamp = seconds;
} catch {
  /* 保留当前时间 */
}

const icon = `data:image/svg+xml;base64,${readFileSync(join(root, 'icon.svg')).toString('base64')}`;
const source =
  sourceKind === 'npm'
    ? { type: 'npm' }
    : { type: 'git', url: repositoryUrl, commit };

const index = {
  format: 1,
  title: { zh: 'dsh-static-kb 插件索引', en: 'dsh-static-kb plugin index' },
  description: {
    zh: '静态知识库插件 dsh-static-kb 的发布索引。',
    en: 'Release index for the dsh-static-kb plugin.',
  },
  metadata: { categories: {}, labels: {}, sortKeys: {} },
  plugins: [
    {
      name: pkg.name,
      title: { zh: '静态知识库', en: 'Static knowledge base' },
      description: {
        zh: '静态分区资料库：导入 PDF/网页/TXT/电子书，模型转化为可检索 Markdown，按对话绑定并资料库优先回答。',
        en: 'Static, partitioned knowledge libraries: import PDFs, pages, text and ebooks, let the model convert them into searchable Markdown, bind a library to a conversation and answer from it first.',
      },
      icon,
      author: 'Charlie',
      homepage: pkg.homepage,
      repository: { url: repositoryUrl },
      metadata: {
        keywords: pkg.keywords ?? [],
        labels: [],
        sortKeys: {},
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp,
          source,
          engines: { dsh: pkg.engines?.dsh ?? '>=0.2.2-rc.3' },
        },
      ],
    },
  ],
};

const outDir = join(root, 'market');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'index.json');
writeFileSync(outFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`wrote ${outFile}`);
console.log(`  ${pkg.name}@${pkg.version}  source=${source.type}${source.type === 'git' ? ` commit=${commit.slice(0, 10)}…` : ''}`);
