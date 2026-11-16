// 转化设置：非敏感项存 <dataDir>/settings.json；API Key 交给 DSH 的 credentials 服务。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CREDENTIAL_KEY = 'dsh-static-kb/conversion';
// 0.3.0 之前用过冒号形式；读不到新键时回退旧键，并在下次写入时迁到新键。
const LEGACY_CREDENTIAL_KEY = 'dsh-static-kb:conversion';

export const DEFAULT_CONVERSION = {
  baseURL: '',
  model: '',
  visionModel: '',
  vision: true,
  verify: true,
  maxImages: 8,
  temperature: 0.2,
  concurrency: 3,
  rasterScale: 1.5,
};

export class SettingsStore {
  constructor({ dataDir, logger = console }) {
    this.dataDir = dataDir;
    this.path = join(dataDir, 'settings.json');
    this.logger = logger;
    this.value = { conversion: { ...DEFAULT_CONVERSION } };
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      this.value = { conversion: { ...DEFAULT_CONVERSION, ...(parsed?.conversion ?? {}) } };
    } catch {
      this.value = { conversion: { ...DEFAULT_CONVERSION } };
    }
    this.loaded = true;
  }

  async get() {
    await this.load();
    return this.value.conversion;
  }

  async update(patch = {}) {
    await this.load();
    const next = { ...this.value.conversion };
    if (typeof patch.baseURL === 'string') next.baseURL = patch.baseURL.trim().replace(/\/+$/, '');
    if (typeof patch.model === 'string') next.model = patch.model.trim();
    if (typeof patch.visionModel === 'string') next.visionModel = patch.visionModel.trim();
    if (typeof patch.vision === 'boolean') next.vision = patch.vision;
    if (typeof patch.verify === 'boolean') next.verify = patch.verify;
    if (Number.isFinite(patch.maxImages)) next.maxImages = Math.max(1, Math.min(20, Math.trunc(patch.maxImages)));
    if (Number.isFinite(patch.temperature)) next.temperature = Math.max(0, Math.min(2, Number(patch.temperature)));
    if (Number.isFinite(patch.concurrency)) next.concurrency = Math.max(1, Math.min(6, Math.trunc(patch.concurrency)));
    if (Number.isFinite(patch.rasterScale)) next.rasterScale = Math.max(1, Math.min(2.5, Number(patch.rasterScale)));
    this.value = { conversion: next };
    await mkdir(this.dataDir, { recursive: true });
    const tmp = `${this.path}.tmp-${process.pid}`;
    await writeFile(tmp, `${JSON.stringify(this.value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, this.path);
    return next;
  }
}

// ----------------------------------------------------------- API Key（凭据）

function credentialsOf(ctx) {
  try {
    return typeof ctx.get === 'function' ? ctx.get('credentials') : undefined;
  } catch {
    return undefined;
  }
}

export async function readConversionKey(ctx) {
  const credentials = credentialsOf(ctx);
  if (credentials === undefined || credentials === null) return undefined;
  try {
    const record = await credentials.readRecord(CREDENTIAL_KEY);
    if (record?.kind === 'api-key' && typeof record.key === 'string' && record.key !== '') return record.key;
    const legacy = await credentials.readRecord(LEGACY_CREDENTIAL_KEY);
    if (legacy?.kind === 'api-key' && typeof legacy.key === 'string' && legacy.key !== '') {
      // 迁到新键，之后只读新键。
      await credentials.modifyRecord(CREDENTIAL_KEY, async () => ({ kind: 'api-key', key: legacy.key }));
      await credentials.deleteRecord(LEGACY_CREDENTIAL_KEY);
      return legacy.key;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function writeConversionKey(ctx, key) {
  const credentials = credentialsOf(ctx);
  if (credentials === undefined || credentials === null) {
    throw Object.assign(new Error('当前部署没有挂载 credentials 服务，无法安全保存 API Key'), { code: 'credentials-unavailable' });
  }
  await credentials.modifyRecord(CREDENTIAL_KEY, async () => ({ kind: 'api-key', key }));
}

export async function clearConversionKey(ctx) {
  const credentials = credentialsOf(ctx);
  if (credentials === undefined || credentials === null) return;
  await credentials.deleteRecord(CREDENTIAL_KEY);
  await credentials.deleteRecord(LEGACY_CREDENTIAL_KEY);
}

export function maskKey(key) {
  if (typeof key !== 'string' || key === '') return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
