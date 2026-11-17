// 极简 OLE2 / Compound File Binary 读取器：只读指定名字的流。
// .doc/.xls/.ppt 这类 97-2003 格式都装在这种容器里。
const SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const FREE = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;

export function isCfb(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 512 && buffer.subarray(0, 8).equals(SIGNATURE);
}

export function openCfb(buffer) {
  if (!isCfb(buffer)) return null;
  const sectorSize = 1 << buffer.readUInt16LE(30);
  const miniSectorSize = 1 << buffer.readUInt16LE(32);
  const fatSectorCount = buffer.readUInt32LE(44);
  const firstDirSector = buffer.readUInt32LE(48);
  const miniCutoff = buffer.readUInt32LE(56);
  const firstMiniFatSector = buffer.readUInt32LE(60);
  const miniFatSectorCount = buffer.readUInt32LE(64);
  const firstDifatSector = buffer.readUInt32LE(68);
  const difatSectorCount = buffer.readUInt32LE(72);

  const sectorOffset = (sector) => (sector + 1) * sectorSize;
  const readSector = (sector) => {
    const start = sectorOffset(sector);
    if (start < 0 || start + sectorSize > buffer.length) return Buffer.alloc(sectorSize);
    return buffer.subarray(start, start + sectorSize);
  };

  // DIFAT → FAT 扇区清单
  const fatSectors = [];
  for (let index = 0; index < 109; index += 1) {
    const sector = buffer.readUInt32LE(76 + index * 4);
    if (sector !== FREE) fatSectors.push(sector);
  }
  let difatSector = firstDifatSector;
  for (let guard = 0; guard < difatSectorCount && difatSector !== END_OF_CHAIN && difatSector !== FREE; guard += 1) {
    const data = readSector(difatSector);
    const perSector = sectorSize / 4 - 1;
    for (let index = 0; index < perSector; index += 1) {
      const sector = data.readUInt32LE(index * 4);
      if (sector !== FREE) fatSectors.push(sector);
    }
    difatSector = data.readUInt32LE(sectorSize - 4);
  }

  const fat = [];
  for (const sector of fatSectors.slice(0, Math.max(fatSectorCount, 1) + 32)) {
    const data = readSector(sector);
    for (let index = 0; index + 4 <= data.length; index += 4) fat.push(data.readUInt32LE(index));
  }

  const chain = (start, table, limit = 1 << 20) => {
    const sectors = [];
    let current = start;
    const seen = new Set();
    while (current !== END_OF_CHAIN && current !== FREE && current < limit) {
      if (seen.has(current)) break;
      seen.add(current);
      sectors.push(current);
      current = table[current] ?? END_OF_CHAIN;
    }
    return sectors;
  };

  // 目录
  const dirData = Buffer.concat(chain(firstDirSector, fat).map(readSector));
  const entries = new Map();
  let rootEntry = null;
  for (let offset = 0; offset + 128 <= dirData.length; offset += 128) {
    const nameLength = dirData.readUInt16LE(offset + 64);
    if (nameLength < 2 || nameLength > 64) continue;
    const name = dirData.toString('utf16le', offset, offset + nameLength - 2);
    const type = dirData.readUInt8(offset + 66);
    const startSector = dirData.readUInt32LE(offset + 116);
    const sizeLow = dirData.readUInt32LE(offset + 120);
    const sizeHigh = dirData.readUInt32LE(offset + 124);
    const size = sizeHigh * 2 ** 32 + sizeLow;
    const entry = { name, type, startSector, size };
    if (type === 5) rootEntry = entry;
    if (type === 2) entries.set(name, entry);
  }

  const miniFat = [];
  if (firstMiniFatSector !== END_OF_CHAIN && firstMiniFatSector !== FREE) {
    for (const sector of chain(firstMiniFatSector, fat)) {
      const data = readSector(sector);
      for (let index = 0; index + 4 <= data.length; index += 4) miniFat.push(data.readUInt32LE(index));
    }
  }

  const miniStream = rootEntry !== null ? Buffer.concat(chain(rootEntry.startSector, fat).map(readSector)) : Buffer.alloc(0);

  const readStream = (name) => {
    const entry = entries.get(name);
    if (entry === undefined) return undefined;
    const size = Math.min(entry.size, 256 * 1024 * 1024);
    if (size < miniCutoff) {
      const sectors = chain(entry.startSector, miniFat);
      const chunks = [];
      let written = 0;
      for (const sector of sectors) {
        const start = sector * miniSectorSize;
        if (start >= miniStream.length) break;
        const take = Math.min(miniSectorSize, size - written);
        chunks.push(miniStream.subarray(start, start + take));
        written += take;
        if (written >= size) break;
      }
      return Buffer.concat(chunks).subarray(0, size);
    }
    return Buffer.concat(chain(entry.startSector, fat).map(readSector)).subarray(0, size);
  };

  return { names: [...entries.keys()], read: readStream };
}
