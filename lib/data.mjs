// 官方接口能拿到的经营数据：SKU 销量（今日 / 昨日 / 近 7 天 / 近 30 天）、库存、采购单、报账单。
// 流量、转化、同行对比、热搜词官方没有，仍用浏览器的 shein-data-stats。
const noPause = async () => {};
const SALES_BATCH = 100;
const STOCK_BATCH = 50;
const ORDER_PAGE = 200;
const FINANCE_PAGE = 200;
const DAY = 86_400_000;

/** 北京时间 yyyy-MM-dd HH:mm:ss */
export function bjTime(ms) {
  return new Date(ms + 8 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** 每个 SKU 的销量；接口每天北京时间 0 点更新（dt 是统计截止日）。接口没返回的 SKU 记在 missing */
export async function skuSales(request, skuCodes, { pause = noPause } = {}) {
  const rows = [];
  const wanted = [...new Set(skuCodes)];
  for (const [i, batch] of chunks(wanted, SALES_BATCH).entries()) {
    if (i) await pause();
    const info = await request('/open-api/goods/query-sku-sales', { body: { skuCodeList: batch }, retry: true });
    if (!Array.isArray(info?.dataList)) throw new Error('销量接口返回的数据不完整（没有 dataList）');
    for (const r of info.dataList) {
      if (!batch.includes(r.skuCode) || rows.some((x) => x.skuCode === r.skuCode)) continue;
      rows.push({ skuCode: r.skuCode, today: r.realTimeSaleCnt ?? null, yesterday: r.cydSaleCnt ?? null, d7: r.c7dSaleCnt ?? null, d30: r.c30dSaleCnt ?? null, dt: r.dt ?? null });
    }
  }
  const got = new Set(rows.map((r) => r.skuCode));
  return { rows, missing: wanted.filter((k) => !got.has(k)) };
}

export const INV_TYPES = { PI: 'SHEIN 仓实物库存', VI: '商家虚拟库存', JI: '商家 JIT 库存' };
const WAREHOUSE_TYPE = { PI: '1', VI: '3', JI: '3' }; // 旧参数 warehouseType（2026-12-31 下线前仍要传）

/** 按 SKC 查库存；返回每个 SKU 的库存汇总。没有这类库存记录的 SKC 接口不返回，记在 missing（不是 0 库存的意思） */
export async function inventory(request, skcs, { invType = 'PI', pause = noPause } = {}) {
  if (!INV_TYPES[invType]) throw new Error(`库存类型只能是 ${Object.keys(INV_TYPES).join(' / ')}`);
  const rows = [];
  const wanted = [...new Set(skcs)];
  for (const [i, batch] of chunks(wanted, STOCK_BATCH).entries()) {
    if (i) await pause();
    const info = await request('/open-api/stock/stock-query', { body: { skcNameList: batch, warehouseType: WAREHOUSE_TYPE[invType], invType }, retry: true });
    if (!Array.isArray(info)) throw new Error('库存接口返回的数据不完整');
    for (const block of info) {
      if (!Array.isArray(block?.goodsInventory)) throw new Error('库存接口返回的数据不完整（没有 goodsInventory）');
      for (const g of block.goodsInventory) {
        if (!batch.includes(g.skcName)) continue;
        if (!Array.isArray(g.skuList)) throw new Error(`库存接口返回的数据不完整（SKC ${g.skcName} 没有 skuList）`);
        for (const s of g.skuList) {
          rows.push({
            spu: g.spuName, skc: g.skcName, skuCode: s.skuCode,
            total: s.totalInventoryQuantity ?? null, usable: s.totalUsableInventory ?? null, locked: s.totalLockedQuantity ?? null,
            tempLocked: s.totalTempLockQuantity ?? null, inTransit: s.totalTransitQuantity ?? null, outOfStockDemand: s.totalOutOfStockQty ?? null,
          });
        }
      }
    }
  }
  const got = new Set(rows.map((r) => r.skc));
  return { rows, missing: wanted.filter((s) => !got.has(s)) };
}

/** 采购单（备货单 / 急采单）：按更新时间查，最多 60 天，每页 200 翻完 */
export async function purchaseOrders(request, { days = 7, now = Date.now(), pause = noPause } = {}) {
  if (!(days >= 1 && days <= 60)) throw new Error('采购单只能查最近 1–60 天');
  const query = { updateTimeStart: bjTime(now - days * DAY), updateTimeEnd: bjTime(now), pageSize: ORDER_PAGE };
  const orders = [];
  let count = null;
  for (let page = 1; ; page++) {
    if (page > 1) await pause();
    const info = await request('/open-api/order/purchase-order-infos', { method: 'GET', query: { ...query, pageNumber: page } });
    const list = info?.list;
    if (!Array.isArray(list)) throw new Error('采购单接口返回的数据不完整（没有 list）');
    count = info.count ?? count;
    for (const o of list) if (typeof o?.orderNo !== 'string' || !o.orderNo) throw new Error('采购单接口返回了没有单号的记录');
    orders.push(...list);
    if (!list.length || list.length < ORDER_PAGE || (count !== null && orders.length >= count)) break;
  }
  const unique = new Map(orders.map((o) => [o.orderNo, o]));
  if (count !== null && unique.size !== count) throw new Error(`采购单取到 ${unique.size} 张，和接口总数 ${count} 对不上，请重试`);
  return { range: { start: query.updateTimeStart, end: query.updateTimeEnd }, count: unique.size, orders: [...unique.values()] };
}

/** 报账单：按生成时间，每 7 天一段查（接口单次最多 7 天），每页 200 翻完 */
export async function financeReports(request, { days = 30, now = Date.now(), pause = noPause } = {}) {
  if (!(days >= 1 && days <= 366)) throw new Error('报账单只能查最近 1–366 天');
  const reports = new Map();
  let calls = 0;
  for (let end = now; end > now - days * DAY; end -= 7 * DAY) {
    const start = Math.max(end - 7 * DAY, now - days * DAY);
    // 每段按报账单号去重计数，和接口给的总数核对：重复页、提前空页都不能当成取全了
    const seg = new Set();
    let count = null;
    for (let page = 1; ; page++) {
      if (calls++) await pause();
      const info = await request('/open-api/finance/report-list', { body: { addTimeStart: bjTime(start), addTimeEnd: bjTime(end), page, perPage: FINANCE_PAGE }, retry: true });
      if (!Number.isInteger(info?.count)) throw new Error('报账单接口没有返回总数');
      count = info.count;
      const list = info.reportOrderInfos ?? (count === 0 ? [] : null);
      if (!Array.isArray(list)) throw new Error('报账单接口返回的数据不完整（没有 reportOrderInfos）');
      const before = seg.size;
      for (const r of list) {
        if (typeof r?.reportOrderNo !== 'string' || !r.reportOrderNo) throw new Error('报账单接口返回了没有报账单号的记录');
        seg.add(r.reportOrderNo);
        reports.set(r.reportOrderNo, r);
      }
      // 空页、或整页都是已经见过的单（接口在重复返回）：不再翻，交给下面的总数核对
      if (!list.length || seg.size >= count || seg.size === before) break;
    }
    if (seg.size !== count) throw new Error(`${bjTime(start)} ~ ${bjTime(end)} 的报账单取到 ${seg.size} 张，和接口总数 ${count} 对不上，请重试`);
  }
  return { range: { start: bjTime(now - days * DAY), end: bjTime(now) }, count: reports.size, reports: [...reports.values()] };
}
