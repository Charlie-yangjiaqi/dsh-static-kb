// Minimal asar reader: extract a path (file or dir tree) from an asar archive.
// Usage: node asar-extract.mjs <archive> <innerPath> <outDir>
import { openSync, readSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

const [archive, innerPath = '', outDir = ''] = process.argv.slice(2);
if (!archive) {
  console.error('usage: node asar-extract.mjs <archive> <innerPath> <outDir>');
  process.exit(2);
}

const fd = openSync(archive, 'r');
const sizeBuf = Buffer.alloc(16);
readSync(fd, sizeBuf, 0, 16, 0);
const headerSize = sizeBuf.readUInt32LE(4);
const headerJsonSize = sizeBuf.readUInt32LE(12);
const headerBuf = Buffer.alloc(headerJsonSize);
readSync(fd, headerBuf, 0, headerJsonSize, 16);
const header = JSON.parse(headerBuf.toString('utf8'));
const dataOffset = 8 + headerSize; // start of file payload area

const parts = innerPath.replaceAll('\\', '/').split('/').filter(Boolean);
let node = header;
for (const part of parts) {
  if (!node.files || !node.files[part]) {
    console.error(`not found: ${innerPath} (missing ${part})`);
    process.exit(1);
  }
  node = node.files[part];
}

const out = [];
function walk(node, rel) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) walk(child, rel ? `${rel}/${name}` : name);
    return;
  }
  const start = Number(node.offset) + dataOffset;
  const len = Number(node.size);
  out.push({ rel, start, len });
}
walk(node, parts.length ? parts.join('/') : '');
// strip the innerPath prefix so output mirrors the extracted subtree
const prefix = parts.length ? parts.join('/') + '/' : '';

for (const f of out) {
  const rel = prefix && f.rel.startsWith(prefix) ? f.rel.slice(prefix.length) : f.rel;
  const target = join(outDir, rel);
  mkdirSync(dirname(target), { recursive: true });
  const buf = Buffer.alloc(f.len);
  if (f.len > 0) readSync(fd, buf, 0, f.len, f.start);
  writeFileSync(target, buf);
  console.log(`${rel} (${f.len} bytes)`);
}
