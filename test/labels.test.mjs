// lib/labels.mjs：SKC 翻页、实拍图要求分批、汇总、打印分批、图片检查、上传绑定（全部自造数据）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindPhotos, checkPhoto, imageSize, labelPdfPath, labelRequirements, listSkcs, photoPlan, printLabels, summarizeRequirements } from '../lib/labels.mjs';

function fakeRequest(handler) {
  const calls = [];
  const request = async (path, opts = {}) => {
    calls.push({ path, ...opts });
    return handler(path, opts, calls.length);
  };
  return { request, calls };
}

test('全店 SKC：每页 200 翻到不足一页为止，按 SKC 去重', async () => {
  const page = (n, from) => Array.from({ length: n }, (_, i) => ({ skcName: `s${from + i}`, spuName: 'p', skuCodeList: ['k'] }));
  const { request, calls } = fakeRequest((_p, { body }) => ({ data: body.pageNum === 1 ? page(200, 0) : [...page(5, 195), ...page(3, 200)] }));
  const skcs = await listSkcs(request);
  assert.equal(skcs.length, 203);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].retry, true);
  await assert.rejects(listSkcs(fakeRequest(() => ({})).request), /没有 data/);
  // SKC 没有 SKU 列表：报错，不当成 0 个 SKU
  await assert.rejects(listSkcs(fakeRequest(() => ({ data: [{ skcName: 'S1' }] })).request), /SKC S1 没有 SKU 列表/);
});

const lbl = (labelName, isRequired, reviewStatus, labelGroup = 2, failReason = null) => ({ labelId: 1, labelName, isRequired, reviewStatus, labelGroup, siteList: ['SHEIN法国站'], failReason });

test('实拍图要求：每批 10 个 SKC，接口没返回的记 missing，返回了别的 SKC 不算', async () => {
  const skcs = Array.from({ length: 23 }, (_, i) => `s${i}`);
  const { request, calls } = fakeRequest((_p, { body }) => body.skcList
    .filter((s) => s !== 's5')
    .map((s) => ({ skc: s, skcShelfStatus: 1, skcLabelInfoList: [lbl('原产地', 1, 0)] }))
    .concat([{ skc: 'other', skcLabelInfoList: [] }]));
  const { rows, missing } = await labelRequirements(request, skcs);
  assert.deepEqual(calls.map((c) => c.body.skcList.length), [10, 10, 3]);
  assert.equal(calls[0].body.isRequired, 1);
  assert.equal(calls[0].body.pageSize, 10);
  assert.equal(rows.length, 22);
  assert.deepEqual(missing, ['s5']);
  assert.equal(rows[0].shelfStatus, '已上架');
  assert.deepEqual(rows[0].labels[0], { labelId: 1, name: '原产地', group: '外包装', required: true, uncertain: false, status: 0, statusText: '待提交', sites: ['SHEIN法国站'], failReason: null });
  // 返回了 SKC 但没有要求列表：算没查到（missing），不能当成「没有缺的」
  const bare = fakeRequest(() => [{ skc: 'S1' }]);
  assert.deepEqual(await labelRequirements(bare.request, ['S1']), { rows: [], missing: ['S1'] });
  const all = await labelRequirements(request, ['s1'], { requiredOnly: false });
  assert.equal('isRequired' in calls.at(-1).body, false);
  assert.equal(all.rows.length, 1);
});

test('汇总：只算必须体现且待提交 / 不通过的；审核中和通过分开计数', () => {
  const rows = [
    { skc: 'a', shelfStatus: '已上架', labels: [{ name: '原产地', group: '外包装', required: true, status: 0, statusText: '待提交' }, { name: '制造商名称', group: '外包装', required: true, status: 2, statusText: '通过' }] },
    { skc: 'b', shelfStatus: '已下架', labels: [{ name: '原产地', group: '外包装', required: true, status: 3, statusText: '不通过', failReason: ['看不清'] }, { name: '批次号-商品主体', group: '商品本体', required: false, status: 0, statusText: '待提交' }] },
    { skc: 'c', shelfStatus: '已上架', labels: [{ name: '原产地', group: '外包装', required: true, status: 1, statusText: '审核中（后台显示申报成功）' }] },
  ];
  const s = summarizeRequirements(rows);
  assert.equal(s.skcs, 3);
  assert.equal(s.skcsNeedPhotos, 2);
  assert.deepEqual(s.requiredLabels, { pending: 2, reviewing: 1, passed: 1, unknown: 0 });
  assert.deepEqual(s.rejected, [{ skc: 'b', name: '原产地', failReason: ['看不清'] }]);
  assert.deepEqual(s.byLabel, [{ label: '原产地｜外包装', skcs: 2 }]);
});

test('打印：每次最多 10 组规则，自动补 uid，成功失败分开', async () => {
  const rules = Array.from({ length: 12 }, (_, i) => ({ skc: `s${i}`, labelType: 5 }));
  const { request, calls } = fakeRequest((_p, { body }) => ({
    successList: body.labelDetailList.slice(1).map((r) => ({ uid: r.uid, labelType: 5, labelCode: 'c', labelUrl: `https://x/${r.uid}.pdf`, labelLength: 100, labelWidth: 100 })),
    failedList: [{ uid: body.labelDetailList[0].uid, labelType: 5, reason: '缺 SKU' }],
  }));
  const res = await printLabels(request, rules);
  assert.deepEqual(calls.map((c) => c.body.labelDetailList.length), [10, 2]);
  assert.equal(calls[1].body.labelDetailList[0].uid, '11');
  assert.equal(res.success.length, 10);
  assert.deepEqual(res.failed.map((f) => f.uid), ['1', '11']);
  assert.equal(res.success[0].size, '100×100');
  await assert.rejects(printLabels(request, [{ skc: 'x' }]), /缺 skc 或 labelType/);
});

// 结构完整的最小 PNG：签名 + IHDR 块 + IDAT 块 + IEND 块（CRC 不校验，填 0）
function png(w, h) {
  const chunk = (type, data) => Buffer.concat([Buffer.from([0, 0, 0, data.length]), Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND', Buffer.alloc(0))]);
}
// SOI + APP0(长度 16) + SOF0(长度 17) + SOS(长度 12) + 扫描数据 + EOI
function jpeg(w, h) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.alloc(14)]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, ...Buffer.alloc(9)]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x0c, ...Buffer.alloc(10)]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, sos, Buffer.from([0x12, 0x34, 0x56]), Buffer.from([0xff, 0xd9])]);
}

test('图片检查：读 PNG / JPEG 尺寸；格式、尺寸、文件不存在、张数上限', () => {
  assert.deepEqual(imageSize(png(640, 480)), { type: 'png', width: 640, height: 480 });
  assert.deepEqual(imageSize(jpeg(1200, 900)), { type: 'jpeg', width: 1200, height: 900 });
  assert.equal(imageSize(Buffer.from('GIF89a')), null);
  // 只有签名前 4 字节、没有 IEND、宽高为 0、JPEG 没有结尾：都不算图片
  const half = Buffer.alloc(40);
  half.writeUInt32BE(0x89504e47, 0);
  half.write('IHDR', 12);
  half.writeUInt32BE(100, 16);
  half.writeUInt32BE(100, 20);
  assert.equal(imageSize(half), null);
  assert.equal(imageSize(png(640, 480).subarray(0, -12)), null);
  assert.equal(imageSize(png(0, 480)), null);
  assert.equal(imageSize(jpeg(0, 10)), null);
  assert.equal(imageSize(jpeg(10, 10).subarray(0, -2)), null);
  // 块 / 段长度超出文件、没有 IDAT、没有扫描数据：都不算图片
  const lie = png(10, 10);
  lie.writeUInt32BE(0xffffffff, 8);
  assert.equal(imageSize(lie), null);
  const noIdat = Buffer.concat([png(10, 10).subarray(0, 33), png(10, 10).subarray(-12)]);
  assert.equal(imageSize(noIdat), null);
  const bigSof = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0xff, 0xff, 0x08, 0, 10, 0, 10, 0xff, 0xd9]);
  assert.equal(imageSize(bigSof), null);
  const noScan = Buffer.concat([jpeg(10, 10).subarray(0, -5), Buffer.from([0xff, 0xd9])]);
  assert.equal(imageSize(noScan), null);
  const dir = mkdtempSync(join(tmpdir(), 'shein-photo-'));
  writeFileSync(join(dir, 'ok.png'), png(800, 600));
  writeFileSync(join(dir, 'big.jpg'), jpeg(9000, 100));
  writeFileSync(join(dir, 'fake.jpg'), Buffer.from('not an image'));
  writeFileSync(join(dir, 'x.gif'), Buffer.from('GIF89a'));
  assert.deepEqual(checkPhoto(join(dir, 'ok.png')).problems, []);
  assert.match(checkPhoto(join(dir, 'big.jpg')).problems.join(), /9000×100/);
  assert.match(checkPhoto(join(dir, 'fake.jpg')).problems.join(), /不是有效的/);
  assert.match(checkPhoto(join(dir, 'x.gif')).problems.join(), /只支持/);
  assert.match(checkPhoto(join(dir, 'none.png')).problems.join(), /不存在/);
  const plan = photoPlan('s1', { packagePhotos: [join(dir, 'ok.png')], bodyPhotos: [join(dir, 'ok.png')] });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.photos.map((p) => p.group), ['外包装', '商品本体']);
  assert.equal(photoPlan('s1', {}).ok, false);
  assert.match(photoPlan('s1', { packagePhotos: Array(16).fill(join(dir, 'ok.png')) }).problems.join(), /最多 15 张/);
});

test('上传绑定：逐张上传（文件表单、不重试），再按外包装 / 本体一次绑定；计划有问题就不上传', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shein-bind-'));
  writeFileSync(join(dir, 'a.png'), png(10, 10));
  writeFileSync(join(dir, 'b.jpg'), jpeg(10, 10));
  const { request, calls } = fakeRequest((path, opts, n) => (path.endsWith('upload-skc-label-picture')
    ? { imageUrl: `https://img/${n}`, imageMd5: `m${n}` }
    : { totalCount: 1, successCount: 1, faildList: [] }));
  const plan = photoPlan('s9', { packagePhotos: [join(dir, 'a.png')], bodyPhotos: [join(dir, 'b.jpg')] });
  const res = await bindPhotos(request, plan);
  assert.deepEqual(res, { uploaded: 2, total: 1, success: 1, failed: [] });
  assert.ok(calls[0].body instanceof FormData);
  assert.equal(calls[0].retry, undefined);
  assert.deepEqual(calls[2].body, { skcList: ['s9'], packageLableList: [{ imageUrl: 'https://img/1', imageMd5: 'm1' }], bodyLableList: [{ imageUrl: 'https://img/2', imageMd5: 'm2' }] });
  const bad = photoPlan('s9', { packagePhotos: [join(dir, 'none.png')] });
  const before = calls.length;
  await assert.rejects(bindPhotos(request, bad), /照片有问题/);
  assert.equal(calls.length, before);
  const noUrl = fakeRequest(() => ({ msg: '图片不合规' }));
  await assert.rejects(bindPhotos(noUrl.request, plan), /没有返回图片地址：图片不合规/);
});

test('上传 / 绑定断线：经过真实客户端也只发一次，不重试', async () => {
  const { createClient } = await import('../lib/client.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'shein-retry-'));
  writeFileSync(join(dir, 'a.png'), png(10, 10));
  const plan = photoPlan('s9', { packagePhotos: [join(dir, 'a.png')] });
  let n = 0;
  const failing = async () => { n++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); };
  const request = createClient({ id: 'K', secret: 'S', fetchImpl: failing, sleep: async () => {} });
  await assert.rejects(bindPhotos(request, plan), /ECONNRESET/);
  assert.equal(n, 1);
  // 绑定这一步断线也只发一次
  n = 0;
  let step = 0;
  const bindFails = async (url) => {
    step++;
    if (url.includes('upload-skc-label-picture')) return { status: 200, text: async () => '{"code":"0","info":{"imageUrl":"u","imageMd5":"m"}}' };
    n++;
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  };
  await assert.rejects(bindPhotos(createClient({ id: 'K', secret: 'S', fetchImpl: bindFails, sleep: async () => {} }), plan), /ECONNRESET/);
  assert.equal(n, 1);
  assert.equal(step, 2);
});

test('状态不确定的标签（isRequired=10 / 缺 reviewStatus）算进待处理，不当成没问题', async () => {
  const { request } = fakeRequest(() => [
    { skc: 'a', skcLabelInfoList: [{ labelName: '原产地', isRequired: 10, reviewStatus: 0, labelGroup: 2 }] },
    { skc: 'b', skcLabelInfoList: [{ labelName: '制造商名称', isRequired: 1, labelGroup: 2 }] },
    { skc: 'c', skcLabelInfoList: [{ labelName: '批次号', isRequired: 1, reviewStatus: 2, labelGroup: 2 }] },
    { skc: 'd', skcLabelInfoList: [{ labelName: '原产地', isRequired: 1, reviewStatus: '3', labelGroup: 2 }] },
  ]);
  const { rows } = await labelRequirements(request, ['a', 'b', 'c', 'd'], { requiredOnly: false });
  const s = summarizeRequirements(rows);
  // 字符串 "3" 也不能漏：算状态未知
  assert.equal(s.skcsNeedPhotos, 3);
  assert.deepEqual(s.requiredLabels, { pending: 0, reviewing: 0, passed: 1, unknown: 3 });
  assert.equal(s.todo[0].pending[0].status, '状态未知（过一阵再查）');
});

test('打印：每条规则都要有结果，没返回的算失败；成功记录没有 PDF 地址报错', async () => {
  const { request } = fakeRequest((_p, { body }) => ({ successList: [{ uid: body.labelDetailList[0].uid, labelType: 5, labelUrl: 'https://x/1.pdf' }], failedList: [] }));
  const res = await printLabels(request, [{ skc: 'a', labelType: 5 }, { skc: 'b', labelType: 5 }]);
  assert.equal(res.success.length, 1);
  assert.deepEqual(res.failed, [{ uid: '2', labelType: 5, reason: '接口没有返回这条的结果' }]);
  const empty = fakeRequest(() => ({}));
  assert.equal((await printLabels(empty.request, [{ skc: 'a', labelType: 1 }])).failed.length, 1);
  const noUrl = fakeRequest(() => ({ successList: [{ uid: '1', labelType: 1 }] }));
  await assert.rejects(printLabels(noUrl.request, [{ skc: 'a', labelType: 1 }]), /没有 PDF 地址/);
});

test('标签 PDF 路径：去掉 ../ 之类，结果一定在目标目录里', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shein-pdf-'));
  const f = labelPdfPath(dir, { skc: '../../etc', labelType: 5, labelCode: '../../../../outside', date: '2026-11-17' });
  assert.ok(f.startsWith(join(dir, 'x').slice(0, -1)));
  assert.ok(!f.includes('..'));
  assert.match(f, /_类型5_/);
});

test('结果文件只新建不覆盖：同名时加 _2、_3', async () => {
  const { writeNew } = await import('../lib/cli.mjs');
  const { readFileSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'shein-write-'));
  const a = writeNew(join(dir, 'x.json'), '1');
  const b = writeNew(join(dir, 'x.json'), '2');
  const c = writeNew(join(dir, 'x.json'), '3');
  assert.deepEqual([a, b, c].map((f) => f.slice(dir.length + 1)), ['x.json', 'x_2.json', 'x_3.json']);
  assert.deepEqual([a, b, c].map((f) => readFileSync(f, 'utf8')), ['1', '2', '3']);
});
