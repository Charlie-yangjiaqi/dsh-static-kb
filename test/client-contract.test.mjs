// 客户端 bundle 契约测试：不渲染 DOM，只验证 __ModuleLoader__ 注册、导出形状与 apply 副作用。
// 目的是在刷新页面之前抓住“apply 抛错 / slot id 写错”这类会让面板整体消失的问题。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const ReactStub = {
  createElement: () => null,
  Fragment: Symbol('fragment'),
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useSyncExternalStore: undefined,
};

test('client bundle registers the package factory and three slots', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  let registration = null;
  const sandboxWindow = {
    __ModuleLoader__: {
      load(value) {
        registration = value;
      },
    },
  };
  const factoryFn = new Function('window', 'require', `${source}\nreturn window.__ModuleLoader__;`);
  const loader = factoryFn(sandboxWindow, (specifier) => {
    if (specifier === 'react') return ReactStub;
    throw new Error(`unexpected require: ${specifier}`);
  });
  assert.equal(loader, sandboxWindow.__ModuleLoader__);
  assert.equal(registration.id, '@local/dsh-knowledge-base');

  const moduleExports = registration.factory((specifier) => {
    if (specifier === 'react') return ReactStub;
    throw new Error(`unexpected require: ${specifier}`);
  });
  assert.ok(Array.isArray(moduleExports.inject));
  assert.ok(moduleExports.inject.includes('slots'));
  assert.ok(moduleExports.inject.includes('locale'));
  assert.equal(typeof moduleExports.apply, 'function');

  const slots = [];
  const locale = {
    register: () => () => {},
    bind: () => (key) => key,
  };
  moduleExports.apply({
    effect: (callback) => {
      callback();
      return () => {};
    },
    slots: {
      inject(name, callback) {
        callback();
        return () => {};
      },
      register(config) {
        slots.push(config);
        return () => {};
      },
    },
    locale,
  });

  assert.deepEqual(
    slots.map((slot) => `${slot.name}#${slot.id}`),
    [
      'conversation.session.header.actions#dshkb-header',
      'sidebar.footer.action#dshkb-sidebar',
      'shell.overlay#dshkb-panel',
      'shell.overlay#dshkb-toast',
    ],
  );
  for (const slot of slots) assert.equal(typeof slot.order, 'number');
});
