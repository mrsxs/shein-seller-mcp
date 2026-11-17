// lib/data.mjs：销量 / 库存分批、采购单翻页与总数核对、报账单按 7 天分段（全部自造数据）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bjTime, financeReports, inventory, purchaseOrders, skuSales } from '../lib/data.mjs';

function fakeRequest(handler) {
  const calls = [];
  return { calls, request: async (path, opts = {}) => { calls.push({ path, ...opts }); return handler(path, opts, calls.length); } };
}

test('北京时间格式', () => {
  assert.equal(bjTime(Date.UTC(2026, 10, 16, 16, 0, 5)), '2026-11-17 00:00:05');
});

test('销量：每批 100 个 SKU、去重、缺 dataList 报错', async () => {
  const skus = Array.from({ length: 150 }, (_, i) => `k${i}`);
  const { request, calls } = fakeRequest((_p, { body }) => ({ dataList: body.skuCodeList.map((k) => ({ skuCode: k, realTimeSaleCnt: 1, cydSaleCnt: 2, c7dSaleCnt: 3, c30dSaleCnt: 4, dt: '20261116' })) }));
  const { rows, missing } = await skuSales(request, [...skus, 'k0']);
  assert.deepEqual(calls.map((c) => c.body.skuCodeList.length), [100, 50]);
  assert.equal(calls[0].retry, true);
  assert.deepEqual(rows[0], { skuCode: 'k0', today: 1, yesterday: 2, d7: 3, d30: 4, dt: '20261116' });
  assert.deepEqual(missing, []);
  // 接口少给了一个 SKU：记在 missing，不悄悄当成全了
  const partial = fakeRequest((_p, { body }) => ({ dataList: body.skuCodeList.filter((k) => k !== 'b').map((k) => ({ skuCode: k })) }));
  assert.deepEqual((await skuSales(partial.request, ['a', 'b'])).missing, ['b']);
  await assert.rejects(skuSales(fakeRequest(() => ({})).request, ['a']), /没有 dataList/);
});

test('库存：每批 50 个 SKC、带新旧两个库存类型参数、展开到 SKU', async () => {
  const skcs = Array.from({ length: 60 }, (_, i) => `s${i}`);
  const { request, calls } = fakeRequest((_p, { body }) => [{ goodsInventory: body.skcNameList.map((s) => ({ spuName: 'p', skcName: s, skuList: [{ skuCode: `${s}-1`, totalInventoryQuantity: 5, totalUsableInventory: 3, totalLockedQuantity: 2 }] })) }]);
  const { rows, missing } = await inventory(request, skcs, { invType: 'PI' });
  assert.deepEqual(missing, []);
  assert.deepEqual(calls.map((c) => c.body.skcNameList.length), [50, 10]);
  assert.equal(calls[0].body.invType, 'PI');
  assert.equal(calls[0].body.warehouseType, '1');
  assert.equal(rows.length, 60);
  assert.deepEqual(rows[0], { spu: 'p', skc: 's0', skuCode: 's0-1', total: 5, usable: 3, locked: 2, tempLocked: null, inTransit: null, outOfStockDemand: null });
  await assert.rejects(inventory(request, ['s'], { invType: 'XX' }), /库存类型只能是/);
  // 没有库存记录的 SKC 记在 missing；结构缺字段就报错
  const some = fakeRequest(() => [{ goodsInventory: [{ skcName: 'a', skuList: [] }] }]);
  assert.deepEqual((await inventory(some.request, ['a', 'b'])).missing, ['a', 'b']);
  await assert.rejects(inventory(fakeRequest(() => [{}]).request, ['a']), /没有 goodsInventory/);
  await assert.rejects(inventory(fakeRequest(() => [{ goodsInventory: [{ skcName: 'a' }] }]).request, ['a']), /没有 skuList/);
});

test('采购单：GET 翻页到总数为止，按单号去重后核对总数；最多 60 天', async () => {
  const now = Date.UTC(2026, 10, 17, 4, 0, 0);
  const all = Array.from({ length: 250 }, (_, i) => ({ orderNo: `o${i}`, status: 1 }));
  const { request, calls } = fakeRequest((_p, { query }) => ({ count: 250, list: all.slice((query.pageNumber - 1) * 200, query.pageNumber * 200) }));
  const res = await purchaseOrders(request, { days: 7, now });
  assert.equal(res.count, 250);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].query.updateTimeStart, '2026-11-10 12:00:00');
  assert.equal(calls[0].query.updateTimeEnd, '2026-11-17 12:00:00');
  // 第 2 页重复了第 1 页的单：去重后对不上总数要报错
  const dup = fakeRequest((_p, { query }) => ({ count: 250, list: query.pageNumber === 1 ? all.slice(0, 200) : all.slice(0, 50) }));
  await assert.rejects(purchaseOrders(dup.request, { days: 7, now }), /取到 200 张，和接口总数 250 对不上/);
  await assert.rejects(purchaseOrders(request, { days: 61 }), /1–60 天/);
  await assert.rejects(purchaseOrders(fakeRequest(() => ({ count: 1, list: [{ status: 1 }] })).request, { days: 7, now }), /没有单号/);
});

test('报账单：每 7 天一段、段内翻页、跨段去重', async () => {
  const now = Date.UTC(2026, 10, 17, 4, 0, 0);
  const { request, calls } = fakeRequest((_p, { body }) => ({
    count: body.addTimeStart.startsWith('2026-11-10') ? 201 : 1,
    reportOrderInfos: body.addTimeStart.startsWith('2026-11-10')
      ? Array.from({ length: body.page === 1 ? 200 : 1 }, (_, i) => ({ reportOrderNo: `r${body.page}-${i}`, currencyCode: 'CNY', estimateIncomeMoneyTotal: 1 }))
      : [{ reportOrderNo: 'r1-0', currencyCode: 'CNY', estimateIncomeMoneyTotal: 1 }],
  }));
  const res = await financeReports(request, { days: 10, now });
  // 10 天 = [now-7d, now] + [now-10d, now-7d]；第一段 2 页
  assert.deepEqual(calls.map((c) => [c.body.addTimeStart, c.body.page]), [['2026-11-10 12:00:00', 1], ['2026-11-10 12:00:00', 2], ['2026-11-07 12:00:00', 1]]);
  assert.equal(res.count, 201);
  await assert.rejects(financeReports(request, { days: 0 }), /1–366 天/);
  // 总数 250 但第 2 页空了：报错，不当成取全
  const short = fakeRequest((_p, { body }) => ({ count: 250, reportOrderInfos: body.page === 1 ? Array.from({ length: 200 }, (_, i) => ({ reportOrderNo: `x${i}` })) : [] }));
  await assert.rejects(financeReports(short.request, { days: 3, now }), /取到 200 张，和接口总数 250 对不上/);
  // 第 2 页重复第 1 页：去重后对不上
  const dupPages = fakeRequest(() => ({ count: 250, reportOrderInfos: Array.from({ length: 200 }, (_, i) => ({ reportOrderNo: `x${i}` })) }));
  await assert.rejects(financeReports(dupPages.request, { days: 3, now }), /对不上/);
  await assert.rejects(financeReports(fakeRequest(() => ({ reportOrderInfos: [] })).request, { days: 3, now }), /没有返回总数/);
  await assert.rejects(financeReports(fakeRequest(() => ({ count: 3 })).request, { days: 3, now }), /没有 reportOrderInfos/);
  await assert.rejects(financeReports(fakeRequest(() => ({ count: 1, reportOrderInfos: [{ estimateIncomeMoneyTotal: 5 }] })).request, { days: 3, now }), /没有报账单号/);
});
