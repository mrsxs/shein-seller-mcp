// 命令行的写操作边界：不加 --apply 不会上传 / 调写接口（在找店铺、发请求之前就停）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/shein-seller-mcp.mjs', import.meta.url));
// 空的配置目录：没有任何店铺密钥，一旦去找店铺或发请求就会报「还没有授权的店铺」
const env = { ...process.env, SHEIN_OPEN_DIR: mkdtempSync(join(tmpdir(), 'shein-cli-')) };
const run = (...args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [BIN, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout), err: String(e.stderr) };
  }
};

test('photos bind 不加 --apply：只检查，不找店铺、不上传', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shein-cli-photo-'));
  // SOI + SOF0 + SOS + 扫描数据 + EOI
  writeFileSync(join(dir, 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0, 10, 0, 10, 3, ...Array(9).fill(0), 0xff, 0xda, 0x00, 0x0c, ...Array(10).fill(0), 0x12, 0x34, 0xff, 0xd9]));
  const r = run('photos', 'bind', '--skc', 's1', '--package', join(dir, 'a.jpg'));
  assert.equal(r.code, 0, r.err);
  const d = JSON.parse(r.out);
  assert.equal(d.applied, false);
  assert.equal(d.ok, true);
  // 加了 --apply 才会去找店铺（这里没有店铺，所以报错）
  const a = run('photos', 'bind', '--skc', 's1', '--package', join(dir, 'a.jpg'), '--apply');
  assert.equal(a.code, 1);
  assert.match(a.err, /还没有授权的店铺/);
});

test('call 写接口：不加 --apply 直接拒绝；只读接口照常（去找店铺）', () => {
  const w = run('call', '/open-api/goods-compliance/skc-save-label', '--json', '{}', '--retry');
  assert.equal(w.code, 1);
  assert.match(w.err, /不在只读接口清单里/);
  const r = run('call', '/open-api/goods/query-sku-sales', '--json', '{}');
  assert.equal(r.code, 1);
  assert.match(r.err, /还没有授权的店铺/);
});

test('拼错的参数直接报错（不会对默认店铺执行）', () => {
  const r = run('call', '/open-api/goods-compliance/skc-save-label', '--stor', 'x', '--apply', '--json', '{}');
  assert.equal(r.code, 1);
  assert.match(r.err, /不认识的参数 --stor/);
});

test('带值的参数不会把后面的 --xxx 吞成值', () => {
  const r = run('call', '/open-api/goods-compliance/skc-save-label', '--query', '--stor', 'x', '--apply', '--json', '{}');
  assert.equal(r.code, 1);
  assert.match(r.err, /--query 缺少值/);
});
