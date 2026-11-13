import assert from 'node:assert/strict';
import test from 'node:test';
import { registerTools } from '../lib/tools.js';

// 这份 mock 走的是生产路径：@deepseek-ai/dsh-tools 在 link 安装下解析不到，
// registerTools 必须自己把扁平参数表编译成合法 JSON Schema。
function makeCtx() {
  const tools = new Map();
  const ctx = {
    get() {
      return undefined;
    },
    effect(callback) {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    on() {
      return () => {};
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
        return () => {};
      },
    },
  };
  const runtime = { store: { library: { kbs: [] } }, bindingOfSync: () => null, ready: async () => {} };
  return { ctx, tools, runtime };
}

test('每个工具的 parameters 都是合法的 object JSON Schema', async () => {
  const { ctx, tools, runtime } = makeCtx();
  await registerTools({ ctx, runtime });
  assert.ok(tools.size >= 7, `registered ${tools.size}`);

  for (const [name, tool] of tools) {
    const params = tool.parameters;
    assert.equal(params?.type, 'object', `${name}.parameters 必须以 type:"object" 开头`);
    assert.equal(typeof params.properties, 'object');
    assert.equal(Array.isArray(params.properties), false, `${name}.parameters.properties 必须是对象`);
    if (params.required !== undefined) {
      assert.ok(Array.isArray(params.required), `${name}.parameters.required 必须是数组`);
      for (const key of params.required) {
        assert.equal(typeof key, 'string');
        assert.ok(key in params.properties, `${name}.required 指向不存在的属性 ${key}`);
      }
    }
    for (const [key, property] of Object.entries(params.properties)) {
      assert.equal(property.required, undefined, `${name}.${key} 不能保留 author-only 的 required`);
      assert.equal(typeof property.type, 'string', `${name}.${key} 必须声明 type`);
      if (property.type === 'array') assert.ok(property.items, `${name}.${key} 是数组但没有 items`);
    }
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 0);
    assert.equal(typeof tool.output?.render, 'function');
    assert.equal(tool.output?.schema?.type, 'string');
    assert.equal(typeof tool.execute, 'function');
  }
});

test('author spec 里的 required:true 变成根 required 数组', async () => {
  const { ctx, tools, runtime } = makeCtx();
  await registerTools({ ctx, runtime });

  assert.deepEqual(tools.get('kb_search').parameters.required, ['query']);
  assert.deepEqual([...tools.get('kb_write_doc').parameters.required].sort(), ['markdown', 'title']);
  assert.deepEqual(tools.get('kb_write_doc').parameters.properties.tags.items, { type: 'string' });
  assert.deepEqual(tools.get('kb_status').parameters, { type: 'object', properties: {} });
  assert.equal(tools.get('kb_list').parameters.required, undefined);
  assert.deepEqual(tools.get('kb_read').parameters.properties.limit, { type: 'number', description: '本次读取字符数，500-30000，默认 8000。' });
});
