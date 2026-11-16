import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONVERSION, SettingsStore, maskKey } from '../lib/settings.js';

test('settings store persists non-secret conversion fields with defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-kb-settings-'));
  try {
    const store = new SettingsStore({ dataDir: dir });
    const initial = await store.get();
    assert.equal(initial.baseURL, DEFAULT_CONVERSION.baseURL);
    assert.equal(initial.vision, true);

    const updated = await store.update({
      baseURL: 'https://api.example.com/v1/',
      model: 'cheap-model',
      visionModel: 'vision-model',
      vision: false,
      verify: false,
      maxImages: 99,
      temperature: 5,
    });
    assert.equal(updated.baseURL, 'https://api.example.com/v1');
    assert.equal(updated.model, 'cheap-model');
    assert.equal(updated.vision, false);
    assert.equal(updated.maxImages, 20);
    assert.equal(updated.temperature, 2);

    const reloaded = new SettingsStore({ dataDir: dir });
    assert.deepEqual(await reloaded.get(), updated);
    const raw = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
    assert.equal(raw.conversion.model, 'cheap-model');
    assert.equal(raw.conversion.apiKey, undefined, 'API key must never be written to settings.json');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('maskKey hides all but the edges', () => {
  assert.equal(maskKey(''), '');
  assert.equal(maskKey('short'), '••••');
  assert.equal(maskKey('sk-1234567890abcd'), 'sk-1…abcd');
});
