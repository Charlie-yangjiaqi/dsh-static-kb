// 极简 ZIP 读取器（无第三方依赖）：只解析中央目录，按需 inflate 单个条目。
// 覆盖 EPUB/DOCX 这类「zip + XML」容器；不支持 ZIP64 与加密条目。
import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/**
 * 读取 zip 条目的元数据。
 * @returns {{ names: string[], read(name: string): Buffer | undefined, has(name: string): boolean }}
 */
export function openZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) return emptyZip();
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return emptyZip();
  const count = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (count > 10000 || directoryOffset <= 0 || directoryOffset >= buffer.length) return emptyZip();

  const entries = new Map();
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) break;
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    entries.set(name, { flags, method, compressedSize, uncompressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const readEntry = (name) => {
    const entry = entries.get(name);
    if (entry === undefined) return undefined;
    if ((entry.flags & 0x1) !== 0) return undefined; // 加密条目
    if (entry.uncompressedSize > 64 * 1024 * 1024) return undefined;
    const local = entry.localOffset;
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) return undefined;
    const nameLength = buffer.readUInt16LE(local + 26);
    const extraLength = buffer.readUInt16LE(local + 28);
    const start = local + 30 + nameLength + extraLength;
    const end = start + entry.compressedSize;
    if (start > buffer.length || end > buffer.length) return undefined;
    const payload = buffer.subarray(start, end);
    if (entry.method === 0) return Buffer.from(payload);
    if (entry.method === 8) {
      try {
        return inflateRawSync(payload, { maxOutputLength: Math.max(entry.uncompressedSize, 1024) + 1024 });
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    read: readEntry,
  };
}

function emptyZip() {
  return { names: [], has: () => false, read: () => undefined };
}
