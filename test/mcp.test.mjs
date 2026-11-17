// MCP 协议：握手、工具清单、参数校验、写操作边界（不连网：用空的配置目录）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/shein-seller-mcp.mjs', import.meta.url));

// withStore：配置目录里放一家假店铺（只用于预览，不会发请求）
function server({ withStore = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'shein-mcp-'));
  if (withStore) {
    writeFileSync(join(dir, 'stores.json'), JSON.stringify({ stores: { 测试店: { openKeyId: 'KEYID000000', secretKey: 'SECRET000000', supplierId: 1 } } }), { mode: 0o600 });
    chmodSync(join(dir, 'stores.json'), 0o600);
  }
  const env = { ...process.env, SHEIN_OPEN_DIR: dir, SHEIN_OUTPUT_DIR: mkdtempSync(join(tmpdir(), 'shein-mcp-out-')) };
  const child = spawn(process.execPath, [BIN], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const waiting = new Map();
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const m = JSON.parse(line);
      waiting.get(m.id)?.(m);
    }
  });
  let n = 0;
  const rpc = (method, params) => new Promise((resolve) => {
    const id = ++n;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
  return { child, rpc, call };
}

test('握手、工具清单、只有实拍图绑定是写店铺数据的工具', async () => {
  const s = server();
  try {
    const init = await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'shein-seller-mcp');
    assert.match(init.result.instructions, /shein_photo_bind/);
    s.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const tools = (await s.rpc('tools/list', {})).result.tools;
    assert.deepEqual(tools.map((t) => t.name), ['shein_stores', 'shein_label_status', 'shein_label_templates', 'shein_label_materials', 'shein_label_print',
      'shein_photo_check', 'shein_photo_bind', 'shein_sales', 'shein_stock', 'shein_purchase_orders', 'shein_finance_reports',
      'shein_api_search', 'shein_api_doc', 'shein_api_call']);
    // 只读（什么都不写）的工具；写本机结果文件的不算只读；通用调用能调写接口（含删除 / 取消），标成可能破坏性
    assert.deepEqual(tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name),
      ['shein_stores', 'shein_label_templates', 'shein_label_materials', 'shein_photo_check', 'shein_api_search', 'shein_api_doc']);
    assert.deepEqual(tools.filter((t) => t.annotations.destructiveHint).map((t) => t.name), ['shein_api_call']);
    assert.ok(tools.every((t) => !t.run));
    assert.deepEqual((await s.rpc('ping', {})).result, {});
    assert.equal((await s.rpc('nope', {})).error.code, -32601);
  } finally {
    s.child.kill();
  }
});

test('参数校验：未知参数、缺必填、类型、范围、数组元素带逗号', async () => {
  const s = server();
  try {
    const bad = async (name, args, re) => {
      const r = await s.call(name, args);
      assert.equal(r.isError, true, `${name} ${JSON.stringify(args)}`);
      assert.match(r.content[0].text, re);
    };
    await bad('shein_stores', { x: 1 }, /未知参数：x/);
    await bad('shein_stores', { constructor: 1 }, /未知参数：constructor/);
    await bad('shein_label_templates', {}, /缺少参数：skc/);
    await bad('shein_label_status', { max_skcs: 151 }, /不能大于 150/);
    await bad('shein_label_status', { offset: 1.5 }, /必须是整数/);
    await bad('shein_label_print', { skc: 's', label_type: 6 }, /只能是/);
    await bad('shein_sales', { skc: ['a,b'] }, /不能有逗号/);
    await bad('shein_photo_bind', { skc: 's' }, /缺少参数：confirm/);
    await bad('shein_api_call', { path: '/open-api/x', method: 'PUT' }, /只能是/);
    await bad('shein_api_search', { category: '不存在' }, /只能是/);
    await bad('shein_api_doc', { path: '/open-api/not-in-catalog' }, /不在开放平台文档目录里/);
    await bad('no_such_tool', {}, /未知工具/);
  } finally {
    s.child.kill();
  }
});

test('写操作边界：实拍图 confirm=false 只检查不上传；没有店铺时查询报授权提示', async () => {
  const s = server();
  try {
    const dir = mkdtempSync(join(tmpdir(), 'shein-mcp-photo-'));
    // SOI + SOF0 + SOS + 扫描数据 + EOI
    writeFileSync(join(dir, 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0, 10, 0, 10, 3, ...Array(9).fill(0), 0xff, 0xda, 0x00, 0x0c, ...Array(10).fill(0), 0x12, 0x34, 0xff, 0xd9]));
    const dry = await s.call('shein_photo_bind', { skc: 's1', package_photos: [join(dir, 'a.jpg')], confirm: false });
    assert.equal(dry.isError, undefined);
    assert.equal(JSON.parse(dry.content[0].text).applied, false);
    const real = await s.call('shein_photo_bind', { skc: 's1', package_photos: [join(dir, 'a.jpg')], confirm: true });
    assert.equal(real.isError, true);
    assert.match(real.content[0].text, /还没有授权的店铺/);
    assert.deepEqual(JSON.parse((await s.call('shein_stores', {})).content[0].text), []);
    const q = await s.call('shein_sales', {});
    assert.match(q.content[0].text, /还没有授权的店铺/);
  } finally {
    s.child.kill();
  }
});

test('通用调用：写接口不带 confirm 只返回预览不发送；不在目录里的路径拒绝；上传文件参数检查', async () => {
  const s = server({ withStore: true });
  try {
    const p = JSON.parse((await s.call('shein_api_call', { path: '/open-api/goods/update-cost', body: { skuList: [{ skuCode: 'x', cost: 1 }] } })).content[0].text);
    assert.equal(p.preview, true);
    assert.equal(p.sent, undefined);
    assert.equal(p.store, '测试店');
    assert.equal(p.method, 'POST');
    assert.deepEqual(p.body, { skuList: [{ skuCode: 'x', cost: 1 }] });
    assert.match(p.note, /confirm=true/);
    assert.equal(p.language, null);
    assert.equal(JSON.parse((await s.call('shein_api_call', { path: '/open-api/goods/update-cost', body: {}, language: 'en' })).content[0].text).language, 'en');
    assert.match((await s.call('shein_api_call', { path: '/open-api/goods/update-cost', body: {}, language: 'zh cn' })).content[0].text, /language 不对/);
    // confirm=false 也只是预览
    assert.equal(JSON.parse((await s.call('shein_api_call', { path: '/open-api/goods/modify-skc-shelf', body: {}, confirm: false })).content[0].text).preview, true);
    // 带变量的路径：按模板匹配到删除接口，方法用目录里的 DELETE；变量里不能带 /
    const del = JSON.parse((await s.call('shein_api_call', { path: '/open-api/goods/delete/sh123ABC' })).content[0].text);
    assert.equal(del.preview, true);
    assert.equal(del.method, 'DELETE');
    assert.match((await s.call('shein_api_call', { path: '/open-api/goods/delete/a/b', confirm: true })).content[0].text, /不在开放平台文档目录里/);
    assert.match((await s.call('shein_api_call', { path: '/open-api/goods/delete/..', confirm: true })).content[0].text, /不在开放平台文档目录里/);
    // 导出地址会流转订单状态：当写接口处理，不带 confirm 只预览
    assert.equal(JSON.parse((await s.call('shein_api_call', { path: '/open-api/order/export-address', body: { orderNo: 'T', handleType: 2 } })).content[0].text).preview, true);
    const unknown = await s.call('shein_api_call', { path: '/open-api/not-in-catalog', confirm: true });
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /不在开放平台文档目录里/);
    const rel = await s.call('shein_api_call', { path: '/open-api/goods/upload-pic', files: { file: 'a.jpg' } });
    assert.match(rel.content[0].text, /绝对路径/);
    const dir = mkdtempSync(join(tmpdir(), 'shein-mcp-up-'));
    writeFileSync(join(dir, 'a.jpg'), 'x');
    const up = JSON.parse((await s.call('shein_api_call', { path: '/open-api/goods/upload-pic', files: { file: join(dir, 'a.jpg') }, form: { type: '1' } })).content[0].text);
    assert.equal(up.preview, true);
    assert.deepEqual(up.files, [{ field: 'file', file: join(dir, 'a.jpg'), bytes: 1 }]);
    const both = await s.call('shein_api_call', { path: '/open-api/goods/upload-pic', files: { file: join(dir, 'a.jpg') }, body: {} });
    assert.match(both.content[0].text, /不要同时传 body/);
  } finally {
    s.child.kill();
  }
});

test('接口搜索：关键词、分类、只读筛选', async () => {
  const s = server();
  try {
    const r = JSON.parse((await s.call('shein_api_search', { query: '库存' })).content[0].text);
    assert.ok(r.total > 0);
    assert.ok(r.apis.some((a) => a.path === '/open-api/stock/stock-query' && a.readOnly === true));
    const w = JSON.parse((await s.call('shein_api_search', { category: '价格', read_only: false })).content[0].text);
    assert.ok(w.apis.length > 0 && w.apis.every((a) => a.category === '价格' && a.readOnly === false));
    const all = JSON.parse((await s.call('shein_api_search', { limit: 300 })).content[0].text);
    assert.ok(all.total >= 200);
    assert.ok(all.apis.every((a) => a.path.startsWith('/open-api/') && ['GET', 'POST', 'DELETE'].includes(a.method)));
  } finally {
    s.child.kill();
  }
});
