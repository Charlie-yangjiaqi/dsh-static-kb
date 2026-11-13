#!/usr/bin/env node
// 用 @deepseek-ai/dsh-plugin-market-index 校验 market/index.json（format 1）。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';

const indexUrl = 'https://cdn.jsdelivr.net/gh/Charlie-yangjiaqi/dsh-static-kb@main/market/index.json';
const path = fileURLToPath(new URL('../market/index.json', import.meta.url));
const index = JSON.parse(await readFile(path, 'utf8'));

try {
  const parsed = parseMarketIndex(index, indexUrl);
  const plugin = parsed.plugins[0];
  console.log(`OK  ${plugin.name}  versions=${plugin.versions.length}  default=${plugin.versions[0].version}`);
  for (const version of plugin.versions) {
    const source = version.source;
    const where = source.type === 'npm' ? 'npm' : `git ${source.commit.slice(0, 10)}…`;
    console.log(`    ${version.version}  ${where}  engines.dsh=${version.engines.dsh ?? 'any'}`);
  }
} catch (error) {
  console.error(`INVALID  ${error?.path ?? '?'}: ${error?.reason ?? error?.message ?? error}`);
  process.exit(1);
}
