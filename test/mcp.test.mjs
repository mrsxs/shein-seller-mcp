// MCP 协议：握手、工具清单、参数校验、写操作边界（不连网：用空的配置目录）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/shein-seller-mcp.mjs', import.meta.url));

function server() {
  const env = { ...process.env, SHEIN_OPEN_DIR: mkdtempSync(join(tmpdir(), 'shein-mcp-')), SHEIN_OUTPUT_DIR: mkdtempSync(join(tmpdir(), 'shein-mcp-out-')) };
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
      'shein_photo_check', 'shein_photo_bind', 'shein_sales', 'shein_stock', 'shein_purchase_orders', 'shein_finance_reports', 'shein_api_call']);
    // 只读（不写任何东西）的只有查店铺、模板、材料、照片检查、只读接口；写本机结果文件的不算只读；只有实拍图绑定会改店铺数据
    assert.deepEqual(tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name), ['shein_stores', 'shein_label_templates', 'shein_label_materials', 'shein_photo_check', 'shein_api_call']);
    assert.ok(tools.every((t) => t.annotations.destructiveHint === false));
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
    await bad('no_such_tool', {}, /未知工具/);
  } finally {
    s.child.kill();
  }
});

test('写操作边界：调写接口被拒；实拍图 confirm=false 只检查不上传；没有店铺时查询报授权提示', async () => {
  const s = server();
  try {
    const w = await s.call('shein_api_call', { path: '/open-api/goods-compliance/skc-save-label', body: {} });
    assert.equal(w.isError, true);
    assert.match(w.content[0].text, /不在只读接口清单里/);
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
