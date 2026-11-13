import assert from 'node:assert/strict';
import test from 'node:test';
import { fileNameForUrl, isPublicHttpUrl } from '../lib/routes.js';

test('isPublicHttpUrl accepts public http(s) URLs', () => {
  assert.equal(isPublicHttpUrl('https://example.com/a/b')?.hostname, 'example.com');
  assert.equal(isPublicHttpUrl('http://93.184.216.34/')?.hostname, '93.184.216.34');
});

test('isPublicHttpUrl rejects loopback, private and non-http URLs', () => {
  for (const url of [
    'file:///etc/passwd',
    'http://localhost:50965/',
    'http://127.0.0.1:50965/',
    'http://10.0.0.5/',
    'http://172.20.1.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://router.local/',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.equal(isPublicHttpUrl(url), null, url);
  }
});

test('fileNameForUrl derives a readable html name', () => {
  assert.equal(fileNameForUrl(new URL('https://example.com/docs/getting-started')), 'getting-started.html');
  assert.match(fileNameForUrl(new URL('https://example.com/')), /\.html$/);
});
