// 签名、密钥解密、授权链接与回跳解析、请求客户端、本机密钥存储（全部自造数据）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { mkdtempSync, statSync, chmodSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decryptSecretKey, redact, signature } from '../lib/sign.mjs';
import { empowerUrl, exchangeToken, parseRedirect } from '../lib/auth.mjs';
import { createClient, SheinApiError } from '../lib/client.mjs';
import { loadApiHost, loadAppId, loadAppSecret, loadLanguage, loadStores, resolveStore, saveStore } from '../lib/config.mjs';

test('签名：与 Python 独立实现的结果一致；随机串必须 5 位', () => {
  // python: 'ab12c' + b64(hmac_sha256(b'test-secret'+b'ab12c', b'KEY123&1583398764000&/open-api/order/purchase-order-infos').hexdigest())
  const s = signature({ id: 'KEY123', secret: 'test-secret', path: '/open-api/order/purchase-order-infos', timestamp: '1583398764000', randomKey: 'ab12c' });
  assert.equal(s, 'ab12cNDMxNGUyZWE3MGYyOGVlNzUxMDE2Y2Y3YjI3YjcwMzNiYjFmOGFjMmEzZDQ1YzBiMmEwNTk3YTBkNGMwNzczMQ==');
  assert.match(signature({ id: 'a', secret: 'b', path: '/open-api/x', timestamp: '1' }), /^[0-9a-f]{5}[A-Za-z0-9+/=]+$/);
  assert.throws(() => signature({ id: 'a', secret: 'b', path: '/x', timestamp: '1', randomKey: 'abc' }), /5 位/);
});

test('secretKey 解密：AES-128-CBC，密钥取 APP Secret 前 16 字节，IV 取固定种子前 16 字节', () => {
  const appSecret = 'ABCDEF0123456789ABCDEF0123456789';
  const c = createCipheriv('aes-128-cbc', Buffer.from(appSecret.slice(0, 16)), Buffer.from('space-station-default-iv'.slice(0, 16)));
  const enc = Buffer.concat([c.update('store-secret-xyz'), c.final()]).toString('base64');
  assert.equal(decryptSecretKey(enc, appSecret), 'store-secret-xyz');
  assert.throws(() => decryptSecretKey(enc, 'WRONG0123456789WRONG'));
});

test('授权链接和官方示例格式一致；回跳地址只认 baidu + 本应用 + 有 tempToken', () => {
  assert.equal(
    empowerUrl({ appId: 'F9D87342D803BA78E1EE49997162', state: 'AUTH-SHEIN-1624700000000' }),
    'https://openapi-sem.sheincorp.com/#/empower?appid=F9D87342D803BA78E1EE49997162&redirectUrl=aHR0cHM6Ly93d3cuYmFpZHUuY29t&state=AUTH-SHEIN-1624700000000',
  );
  assert.throws(() => empowerUrl({ appId: 'APP1', state: 'a&b' }), /state/);
  assert.throws(() => empowerUrl({ state: 's1' }), /缺少 APP ID/);
  assert.deepEqual(parseRedirect('https://www.baidu.com/?appid=APP1&tempToken=t-1&state=s1', { appId: 'APP1' }), { tempToken: 't-1', state: 's1', appid: 'APP1' });
  assert.equal(parseRedirect('https://www.baidu.com/?appid=OTHER&tempToken=t&state=s', { appId: 'APP1' }), null);
  assert.equal(parseRedirect('https://evil.example/?tempToken=t', { appId: 'APP1' }), null);
  assert.equal(parseRedirect('https://www.baidu.com/s?wd=x', { appId: 'APP1' }), null);
  // 路径也要对：别的页面带着 tempToken 不认
  assert.equal(parseRedirect('https://www.baidu.com/s?appid=APP1&tempToken=t&state=s1', { appId: 'APP1' }), null);
  assert.equal(parseRedirect('not a url'), null);
});

function fakeFetch(reply) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const r = typeof reply === 'function' ? reply(url, init) : reply;
    return { status: 200, text: async () => (typeof r === 'string' ? r : JSON.stringify(r)) };
  };
  return { f, calls };
}

test('请求：签名头、GET 拼查询参数、code≠0 抛错并说明、错误里不带密钥', async () => {
  const { f, calls } = fakeFetch({ code: '0', info: { ok: 1 } });
  const req = createClient({ id: 'OPENKEY1', secret: 'SECRET-abcdef', fetchImpl: f, now: () => 1700000000000, host: 'https://h' });
  assert.deepEqual(await req('/open-api/x/y', { body: { a: 1 } }), { ok: 1 });
  const h = calls[0].init.headers;
  assert.equal(h['x-lt-openKeyId'], 'OPENKEY1');
  assert.equal(h['x-lt-timestamp'], '1700000000000');
  assert.match(h['x-lt-signature'], /^[0-9a-f]{5}/);
  // 默认带 language: zh-cn（商品发布规范等接口必填）；单次请求可改；格式不对直接拒绝
  assert.equal(h.language, 'zh-cn');
  await req('/open-api/x/y', { body: {}, language: 'en' });
  assert.equal(calls.at(-1).init.headers.language, 'en');
  await assert.rejects(req('/open-api/x/y', { language: 'zh cn' }), /language 不对/);
  assert.equal(calls[0].init.body, '{"a":1}');
  await req('/open-api/order/purchase-order-infos', { method: 'GET', query: { pageNumber: 1, skip: undefined, t: '2026-11-01 00:00:00' } });
  assert.equal(calls[2].url, 'https://h/open-api/order/purchase-order-infos?pageNumber=1&t=2026-11-01+00%3A00%3A00');
  assert.equal(calls[2].init.body, undefined);
  await assert.rejects(req('/x'), /接口路径不对/);

  const ip = createClient({ id: 'K', secret: 'SECRET-abcdef', fetchImpl: fakeFetch({ code: '403', msg: 'ip not in white list' }).f });
  await assert.rejects(ip('/open-api/a'), (e) => e instanceof SheinApiError && e.code === '403' && /IP白名单/.test(e.message));
  const leak = createClient({ id: 'K', secret: 'SECRET-abcdef', fetchImpl: fakeFetch('<html>SECRET-abcdef</html>').f });
  await assert.rejects(leak('/open-api/a'), (e) => !e.message.includes('SECRET-abcdef') && /不是 JSON/.test(e.message));
  // openKeyId 也要遮；密钥跨在第 200 个字符上也不能露出半截
  const edge = createClient({ id: 'OPENKEY-123456', secret: 'SECRET-abcdefgh', fetchImpl: fakeFetch(`${'x'.repeat(195)}SECRET-abcdefgh OPENKEY-123456`).f });
  await assert.rejects(edge('/open-api/a'), (e) => !/SECRET-ab|OPENKEY-1234/.test(e.message));
  assert.equal(redact('x?tempToken=abc-123&state=1'), 'x?tempToken=***&state=1');
  // 网络层报错、读响应报错里带了密钥也要遮住
  const boom = createClient({ id: 'OPENKEY1', secret: 'SECRET-abcdef', fetchImpl: async () => { throw new Error('connect to SECRET-abcdef failed'); }, sleep: async () => {} });
  await assert.rejects(boom('/open-api/a'), (e) => e.network && !e.message.includes('SECRET-abcdef'));
  const bodyFail = createClient({ id: 'OPENKEY1', secret: 'SECRET-abcdef', fetchImpl: async () => ({ status: 200, text: async () => { throw new Error('reset SECRET-abcdef'); } }) });
  await assert.rejects(bodyFail('/open-api/a'), (e) => e.network && !e.message.includes('SECRET-abcdef'));
});

test('换取店铺密钥：用 APP id 签名、x-lt-appid 头、返回解密后的 secretKey', async () => {
  const appSecret = 'ABCDEF0123456789ABCDEF0123456789';
  const c = createCipheriv('aes-128-cbc', Buffer.from(appSecret.slice(0, 16)), Buffer.from('space-station-default-iv'.slice(0, 16)));
  const enc = Buffer.concat([c.update('plain-store-key'), c.final()]).toString('base64');
  const { f, calls } = fakeFetch({ code: '0', info: { openKeyId: 'OK1', secretKey: enc, supplierId: 99 } });
  const keys = await exchangeToken('tmp-1', { appId: 'APP1', appSecret, fetchImpl: f });
  assert.deepEqual(keys, { openKeyId: 'OK1', supplierId: 99, secretKey: 'plain-store-key' });
  assert.equal(calls[0].init.headers['x-lt-appid'], 'APP1');
  assert.ok(calls[0].url.endsWith('/open-api/auth/get-by-token'));
  assert.equal(calls[0].init.body, '{"tempToken":"tmp-1"}');
  await assert.rejects(exchangeToken('t', { appId: 'A', appSecret, fetchImpl: fakeFetch({ code: '0', info: {} }).f }), /没有返回 openKeyId/);
  // 接口把临时码带回报错里：要遮住
  const echo = fakeFetch({ code: '400', msg: 'invalid token: TEMP-TOKEN-SECRET-123456' }).f;
  await assert.rejects(exchangeToken('TEMP-TOKEN-SECRET-123456', { appId: 'A', appSecret, fetchImpl: echo }), (e) => !e.message.includes('TEMP-TOKEN-SECRET-123456'));
  // 非 JSON 返回、临时码跨在截断点上：也不能露出半截
  const html = fakeFetch(`${'x'.repeat(190)}TEMP-TOKEN-SECRET-123456</html>`).f;
  await assert.rejects(exchangeToken('TEMP-TOKEN-SECRET-123456', { appId: 'A', appSecret, fetchImpl: html }), (e) => !e.message.includes('TEMP-TOKE'));
});

test('本机密钥：文件 600、权限太宽拒绝读、按名称或商家 ID 找店', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shein-open-'));
  assert.throws(() => loadAppSecret(dir), /没有 APP Secret/);
  writeFileSync(join(dir, 'app-secret.txt'), 'ABCDEF0123456789ABCDEF0123456789\n', { mode: 0o644 });
  chmodSync(join(dir, 'app-secret.txt'), 0o644);
  // Windows 没有 Unix 权限位，不检查
  if (process.platform !== 'win32') assert.throws(() => loadAppSecret(dir), /权限太宽/);
  chmodSync(join(dir, 'app-secret.txt'), 0o600);
  assert.equal(loadAppSecret(dir), 'ABCDEF0123456789ABCDEF0123456789');
  const file = saveStore('店A', { openKeyId: 'K1', secretKey: 'S1', supplierId: 11 }, dir);
  saveStore('店B', { openKeyId: 'K2', secretKey: 'S2', supplierId: 22 }, dir);
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
  const stores = loadStores(dir);
  assert.equal(resolveStore(stores, '22').name, '店B');
  assert.throws(() => resolveStore(stores), /请用 --store 指定/);
  assert.throws(() => resolveStore({}, 'x'), /还没有授权的店铺/);
  assert.throws(() => saveStore('a/b', {}, dir), /店铺名/);
  // 店名优先于商家 ID；商家 ID 撞了就报错；constructor 之类不会读到原型
  assert.equal(resolveStore({ '22': { supplierId: 1 }, x: { supplierId: 22 } }, '22').name, '22');
  assert.throws(() => resolveStore({ a: { supplierId: 5 }, b: { supplierId: 5 } }, '5'), /对应多家店/);
  assert.throws(() => resolveStore({ a: { supplierId: 5 } }, 'constructor'), /没有找到店铺/);
  // stores.json 坏了：报错但不带文件内容
  writeFileSync(join(dir, 'stores.json'), '{"stores":{"x":{"secretKey":"TOPSECRET-123"', { mode: 0o600 });
  assert.throws(() => loadStores(dir), (e) => /格式不对/.test(e.message) && !e.message.includes('TOPSECRET'));
});

test('断线重试：GET 和标了 retry 的查询重试两次，写操作不重试', async () => {
  let n = 0;
  const flaky = async () => {
    if (n++ < 2) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    return { status: 200, text: async () => '{"code":"0","info":{"ok":true}}' };
  };
  const waits = [];
  const req = createClient({ id: 'K', secret: 'S', fetchImpl: flaky, sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(await req('/open-api/order/purchase-order-infos', { method: 'GET' }), { ok: true });
  assert.deepEqual(waits, [1000, 3000]);
  n = 0;
  await assert.rejects(req('/open-api/a', { body: {} }), (e) => e.network && /ECONNRESET/.test(e.message));
  assert.equal(n, 1);
  n = 0;
  // 不在只读清单里的接口：即使传了 retry 也不重试
  await assert.rejects(req('/open-api/a', { body: {}, retry: true }), /ECONNRESET/);
  assert.equal(n, 1);
  n = 0;
  assert.deepEqual(await req('/open-api/goods/query-sku-sales', { body: {}, retry: true }), { ok: true });
  n = -10;
  await assert.rejects(req('/open-api/order/purchase-order-infos', { method: 'GET' }), /ECONNRESET/);
});

test('应用 ID / 接口域名：环境变量优先，其次 app.json；没配就报错；域名只认 SHEIN openapi', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shein-app-'));
  assert.throws(() => loadAppId(dir, {}), /没有配置开放平台应用 APP ID/);
  assert.equal(loadApiHost(dir, {}), 'https://openapi.sheincorp.cn');
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ appId: 'ABCDEF0123456789', apiHost: 'https://openapi.sheincorp.com' }));
  assert.equal(loadAppId(dir, {}), 'ABCDEF0123456789');
  assert.equal(loadApiHost(dir, {}), 'https://openapi.sheincorp.com');
  assert.equal(loadAppId(dir, { SHEIN_APP_ID: 'ZZZZ0123456789' }), 'ZZZZ0123456789');
  assert.throws(() => loadApiHost(dir, { SHEIN_API_HOST: 'https://evil.example' }), /接口域名不对/);
  assert.throws(() => loadAppId(dir, { SHEIN_APP_ID: 'a/b' }), /格式不对/);
  assert.equal(loadLanguage(dir, {}), 'zh-cn');
  assert.equal(loadLanguage(dir, { SHEIN_LANGUAGE: 'en' }), 'en');
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ appId: 'ABCDEF0123456789', language: 'pt-BR' }));
  assert.equal(loadLanguage(dir, {}), 'pt-BR');
  assert.throws(() => loadLanguage(dir, { SHEIN_LANGUAGE: 'zh cn' }), /language 不对/);
});

test('接口文档参数树：multiple=1 写成数组类型；路径里的 . / .. 段直接拒绝', async () => {
  const { paramTree } = await import('../lib/apidoc.mjs');
  const raw = JSON.stringify({ children: [{ props: { name: 'skc_info_list', type: 'object', multiple: 1, required: true, description: '<p>skc 信息</p>' }, children: [{ props: { name: 'skc_name', type: 'string' } }] }] });
  const t = paramTree(raw);
  assert.equal(t[0].type, 'array<object>');
  assert.equal(t[0].description, 'skc 信息');
  assert.equal(t[0].children[0].type, 'string');
  assert.deepEqual(paramTree('not json'), []);
  const req = createClient({ id: 'K', secret: 'S', fetchImpl: async () => { throw new Error('不该发请求'); } });
  await assert.rejects(req('/open-api/goods/delete/..'), /接口路径不对/);
  await assert.rejects(req('/open-api/./x'), /接口路径不对/);
});
