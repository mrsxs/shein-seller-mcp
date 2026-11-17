// 命令行（`shein-seller-mcp <命令>`）：官方接口，输出 JSON；密钥只存 ~/.config/shein-open/，不打印。MCP 服务也复用这里的 labels / photos / data。
//   auth-url   [--state X]                         打印店铺授权链接
//   auth-watch [--name 店铺名] [--timeout 秒] [--no-open]
//              在主 Chrome 打开授权页，等店铺主账号点「授权」后跳转，读出 tempToken 立即换取并保存店铺密钥
//   stores                                         已授权的店铺（不含密钥）
//   call <接口路径> [--store 店铺] [--get] [--retry] [--apply] [--json '{...}' | --json-file 文件] [--query k=v ...]
//              只读清单（lib/endpoints.mjs）里的接口直接调，--retry 断线重试；其他接口可能改店铺数据，要 --apply 才执行、不重试
// 合规标签 / 实拍图（--store 选店；结果文件在 ~/Documents/SHEIN标签/<店铺>/）：
//   labels status    [--skc a,b] [--all-labels] [--offset N --max-skcs M]   哪些 SKC 的实拍图里还缺哪些必须体现的信息（默认全店）
//   labels templates --skc X                      SKC 可用的标签模板
//   labels materials                              环保材料（打环保标时用 --materials 类型ID:材料ID）
//   labels print     --skc X --type N [--code 模板] [--count 份数] [--sku-code S | --supplier-sku S] [--order-no 单号]
//                    [--origin-country 原产地] [--batch 批次号] [--warning 警示语] [--materials 6:66,7:68]   打印标签并下载 PDF
//   photos check     --skc X [--package a.jpg,b.jpg] [--body c.jpg]   检查实拍图（格式、大小、尺寸、张数），不上传
//   photos bind      同上 + --apply                 上传并绑定到 SKC（只上传真实拍摄的照片；不加 --apply 只检查）
// 经营数据（只读；结果文件在 ~/Documents/SHEIN数据/<店铺>/官方_*.json）：
//   data sales   [--skc a,b]          每个 SKU 今日 / 昨日 / 近 7 天 / 近 30 天销量（默认全店）
//   data stock   [--inv PI|VI|JI] [--skc a,b]   库存（PI SHEIN 仓实物，默认；VI 虚拟；JI JIT）
//   data orders  [--days 7]           采购单（备货单 / 急采单），按更新时间，最多 60 天
//   data finance [--days 30]          报账单
import { readFileSync } from 'node:fs';
import { configDir, loadApiHost, loadAppId, loadAppSecret, loadStores, publicStore, resolveStore, saveStore } from './config.mjs';
import { createClient } from './client.mjs';
import { empowerUrl, exchangeToken, parseRedirect } from './auth.mjs';
import { connectBrowser, devToolsEndpoint } from './chrome.mjs';
import { redact } from './sign.mjs';
import { bindPhotos, labelPdfPath, labelRequirements, labelTemplates, listSkcs, photoPlan, printLabels, summarizeRequirements } from './labels.mjs';
import { financeReports, inventory, INV_TYPES, purchaseOrders, skuSales } from './data.mjs';
import { isReadOnly } from './endpoints.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = (v) => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FLAGS = ['get', 'no-open', 'retry', 'apply', 'all-labels'];
const VALUES = ['store', 'json', 'json-file', 'query', 'state', 'name', 'timeout', 'skc', 'type', 'code', 'count', 'sku-code', 'supplier-sku',
  'order-no', 'origin-country', 'batch', 'warning', 'materials', 'out', 'package', 'body', 'inv', 'days', 'offset', 'max-skcs'];

function parseArgs(argv) {
  const pos = [];
  const opts = { query: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = a.slice(2);
    // 拼错的参数（比如 --stor）不能悄悄忽略：可能导致对默认店铺执行写操作
    if (!FLAGS.includes(key) && !VALUES.includes(key)) throw new Error(`不认识的参数 ${a}`);
    if (FLAGS.includes(key)) { opts[key] = true; continue; }
    const v = argv[++i];
    // 值不能是另一个参数（--query --stor x 这种会把 --stor 吞成值）
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} 缺少值`);
    if (key === 'query') opts.query.push(v);
    else opts[key] = v;
  }
  return { pos, opts };
}

export function storeClient(ref) {
  const store = resolveStore(loadStores(), ref);
  return { store, request: createClient({ id: store.openKeyId, secret: store.secretKey, host: loadApiHost() }) };
}

async function authWatch(opts) {
  const appSecret = loadAppSecret(); // 先确认有 APP Secret / APP ID，避免授权后 10 分钟内才发现缺
  const appId = loadAppId();
  const host = loadApiHost();
  const state = `cc${Date.now().toString(36)}`;
  const url = empowerUrl({ appId, state });
  const timeoutMs = Number(opts.timeout ?? 600) * 1000;
  const browser = await connectBrowser(devToolsEndpoint());
  try {
    if (!opts['no-open']) await browser.send('Target.createTarget', { url, background: false });
    process.stderr.write(`已在主 Chrome 打开授权页（state=${state}）。请用店铺主账号点「授权」；等待跳转…\n`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { targetInfos } = await browser.send('Target.getTargets', {}, undefined, Math.max(1000, deadline - Date.now()));
      if (Date.now() >= deadline) break;
      for (const t of targetInfos) {
        const r = t.type === 'page' ? parseRedirect(t.url, { appId }) : null;
        if (!r || r.state !== state) continue;
        const keys = await exchangeToken(r.tempToken, { appId, appSecret, host });
        const { openKeyId, secretKey, ...meta } = keys;
        // 用新密钥查一次店铺信息，确认能用，也拿店名
        const request = createClient({ id: openKeyId, secret: secretKey, host });
        const info = await request('/open-api/openapi-business-backend/query-store-info', { body: {} }).catch((e) => ({ error: e.message }));
        const si = info?.storeInfo ?? {};
        const supplierId = meta.supplierId ?? si.supplierId ?? null;
        const name = opts.name || si.storeName || String(supplierId ?? openKeyId.slice(0, 8));
        const authorizedAt = new Date().toISOString();
        const file = saveStore(name, { openKeyId, secretKey, supplierId, storeName: si.storeName ?? opts.name ?? null, authorizedAt, meta, storeInfo: info?.error ? null : info });
        // 带 tempToken 的回跳页用完就关掉
        await browser.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
        return { ok: true, saved: file.replace(configDir(), '~/.config/shein-open'), store: publicStore(name, { openKeyId, supplierId, storeName: si.storeName ?? opts.name, authorizedAt }), storeInfo: info };
      }
      await sleep(1500);
    }
    throw new Error(`${timeoutMs / 1000} 秒内没等到授权跳转`);
  } finally {
    browser.close();
  }
}

const pacing = () => sleep(300 + Math.random() * 300);
// 结果文件的根目录：SHEIN_OUTPUT_DIR，默认「文稿」
const outputBase = () => process.env.SHEIN_OUTPUT_DIR || join(homedir(), 'Documents');
const list = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // 北京时间
// 导出文件名带到秒（北京时间），重复查询不覆盖之前的结果
const stamp = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '');
/** 只新建、不覆盖：文件已存在就在扩展名前加 _2、_3…（独占创建，并发也不会互相覆盖）；返回实际写入的路径 */
export function writeNew(file, data) {
  const dot = file.lastIndexOf('.');
  const [base, ext] = dot > file.lastIndexOf('/') && dot > file.lastIndexOf('\\') ? [file.slice(0, dot), file.slice(dot)] : [file, ''];
  for (let i = 1; i < 1000; i++) {
    const f = i === 1 ? file : `${base}_${i}${ext}`;
    try {
      writeFileSync(f, data, { flag: 'wx' });
      return f;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`${file} 同名文件太多`);
}
const outDir = (store, opts) => {
  const dir = opts.out || join(outputBase(), 'SHEIN标签', store.name.replace(/[\\/:*?"<>|]/g, '_'));
  mkdirSync(dir, { recursive: true });
  return dir;
};

export async function labels(sub, opts) {
  const { store, request } = storeClient(opts.store);
  switch (sub) {
    case 'status': {
      const all = opts.skc ? list(opts.skc) : (await listSkcs(request, { pause: pacing })).map((x) => x.skc);
      // 分段查：全店 SKC 多时一次查一段（MCP 客户端一般 1–2 分钟超时；每 10 个 SKC 一次请求约 5 秒）
      const offset = Number(opts.offset ?? 0);
      const max = opts['max-skcs'] === undefined ? all.length : Number(opts['max-skcs']);
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(max) || max < 1) throw new Error('offset 要是 ≥0 的整数，max-skcs 要是 ≥1 的整数');
      const skcs = all.slice(offset, offset + max);
      const { rows, missing } = await labelRequirements(request, skcs, { requiredOnly: !opts['all-labels'], pause: pacing });
      const sum = summarizeRequirements(rows);
      const partial = skcs.length < all.length;
      const file = writeNew(join(outDir(store, opts), `实拍图要求_${stamp()}${partial ? `_第${offset + 1}-${offset + skcs.length}个` : ''}.json`),
        JSON.stringify({ store: store.name, checkedAt: new Date().toISOString(), totalSkcs: all.length, offset, ...sum, missing, rows }, null, 2));
      const { todo, ...head } = sum;
      const next = offset + skcs.length < all.length ? offset + skcs.length : null;
      return { store: store.name, totalSkcs: all.length, checkedRange: [offset + 1, offset + skcs.length], nextOffset: next, ...head, notReturned: missing.length, file, todoSample: todo.slice(0, 10),
        note: 'pending = 必须体现但还没提交或审核不通过的信息；reviewing = 审核中（后台显示申报成功）。notReturned = 接口没返回的 SKC（多半没有必须体现的信息）。完整清单在 file。' };
    }
    case 'templates':
      if (!opts.skc) throw new Error('labels templates 需要 --skc');
      return { store: store.name, skc: opts.skc, templates: await labelTemplates(request, opts.skc) };
    case 'materials': {
      const info = await request('/open-api/goods-quality/environmental-label-rule/material-quality-tree-v2', { method: 'GET' });
      return (info || []).filter((t) => t.isEnabled !== 0).map((t) => ({ typeId: t.packageTypeId, type: t.packageTypeName,
        materials: (t.packageMaterials || []).filter((m) => m.isEnabled !== 0).map((m) => `${m.packageMaterialId} ${m.packageMaterialName}`) }));
    }
    case 'print': {
      if (!opts.skc || !opts.type) throw new Error('labels print 需要 --skc 和 --type（用 labels templates 查）');
      const rule = {
        skc: opts.skc, labelType: Number(opts.type),
        ...(opts.code ? { labelCode: opts.code, printNumber: Number(opts.count ?? 1) } : {}),
        ...(opts['sku-code'] ? { skuCode: opts['sku-code'] } : {}), ...(opts['supplier-sku'] ? { supplierSku: opts['supplier-sku'] } : {}),
        ...(opts['order-no'] ? { orderNo: opts['order-no'] } : {}), ...(opts['origin-country'] ? { originCountry: opts['origin-country'] } : {}),
        ...(opts.batch ? { productBatchNo: opts.batch } : {}), ...(opts.warning ? { warning: opts.warning } : {}),
        ...(opts.materials ? { packageMaterialList: list(opts.materials).map((pair) => {
          const [t, m] = pair.split(':').map(Number);
          if (!t || !m) throw new Error(`--materials 格式是 类型ID:材料ID，如 6:66（${pair} 不对）`);
          return { packageTypeId: t, packageMaterialId: m };
        }) } : {}),
      };
      const res = await printLabels(request, [rule]);
      const dir = outDir(store, opts);
      const files = [];
      for (const [i, s] of res.success.entries()) {
        const r = await fetch(s.labelUrl, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`下载标签 PDF 失败：HTTP ${r.status}`);
        const f = labelPdfPath(dir, { skc: opts.skc, labelType: s.labelType, labelCode: s.labelCode ?? i + 1, date: today() });
        files.push({ file: writeNew(f, Buffer.from(await r.arrayBuffer())), labelType: s.labelType, labelCode: s.labelCode, size: s.size });
      }
      return { store: store.name, skc: opts.skc, files, failed: res.failed,
        note: '打印标签不会改动店铺数据。把标签贴到商品 / 外包装上拍实拍图，再用 photos bind 上传绑定。' };
    }
    default:
      throw new Error('labels 子命令：status | templates | materials | print');
  }
}

const countBy = (rows, key) => rows.reduce((m, r) => { const k = String(key(r) ?? '未知'); m[k] = (m[k] ?? 0) + 1; return m; }, {});
// 合计只加有值的；缺值（null）单独计数，不当成 0
const sumBy = (rows, key) => rows.reduce((n, r) => (Number.isFinite(key(r)) ? n + key(r) : n), 0);
const unknownBy = (rows, key) => rows.filter((r) => !Number.isFinite(key(r))).length;

export async function data(sub, opts) {
  const { store, request } = storeClient(opts.store);
  const dir = join(outputBase(), 'SHEIN数据', store.name.replace(/[\\/:*?"<>|]/g, '_'));
  mkdirSync(dir, { recursive: true });
  const save = (kind, payload) => {
    return writeNew(join(dir, `官方_${kind}_${stamp()}.json`), JSON.stringify({ store: store.name, fetchedAt: new Date().toISOString(), ...payload }, null, 2));
  };
  // 只看几个 SKC 时也从商品列表里取它们的 SKU（不靠库存接口，避免没库存记录的 SKC 被漏掉）
  const skcList = async () => {
    const all = await listSkcs(request, { pause: pacing });
    if (!opts.skc) return all;
    const want = list(opts.skc);
    const found = all.filter((x) => want.includes(x.skc));
    const lost = want.filter((w) => !found.some((x) => x.skc === w));
    if (lost.length) throw new Error(`商品列表里没有这些 SKC：${lost.join('、')}`);
    return found;
  };
  switch (sub) {
    case 'sales': {
      const skcs = await skcList();
      const skuToSkc = new Map(skcs.flatMap((x) => (x.skuCodes || []).map((k) => [k, x.skc])));
      const res = await skuSales(request, [...skuToSkc.keys()], { pause: pacing });
      const rows = res.rows.map((r) => ({ skc: skuToSkc.get(r.skuCode) ?? null, ...r }));
      const file = save('销量', { rows, notReturned: res.missing });
      const top = [...rows].sort((a, b) => (b.d30 ?? 0) - (a.d30 ?? 0)).slice(0, 15);
      return { store: store.name, skus: rows.length, notReturned: res.missing.length, dt: rows[0]?.dt ?? null,
        total: { today: sumBy(rows, (r) => r.today), yesterday: sumBy(rows, (r) => r.yesterday), d7: sumBy(rows, (r) => r.d7), d30: sumBy(rows, (r) => r.d30) },
        noSales30d: rows.filter((r) => r.d30 === 0).length, unknown30d: unknownBy(rows, (r) => r.d30), top30d: top, file,
        note: '销量每天北京时间 0 点更新，dt 是统计截止日；today 是当日实时。notReturned = 接口没给销量的 SKU 数（不计入合计，清单在 file）。' };
    }
    case 'stock': {
      const invType = (opts.inv || 'PI').toUpperCase();
      const skcs = await skcList();
      const { rows, missing } = await inventory(request, skcs.map((x) => x.skc), { invType, pause: pacing });
      const file = save(`库存_${invType}`, { invType, rows, skcsWithoutRecord: missing });
      return { store: store.name, invType: INV_TYPES[invType], skcs: skcs.length, skcsWithoutRecord: missing.length, skus: rows.length,
        total: { total: sumBy(rows, (r) => r.total), usable: sumBy(rows, (r) => r.usable), locked: sumBy(rows, (r) => r.locked), inTransit: sumBy(rows, (r) => r.inTransit) },
        zeroUsable: rows.filter((r) => r.usable === 0).length, unknownUsable: unknownBy(rows, (r) => r.usable), file,
        note: 'skcsWithoutRecord = 在这类库存里没有记录的 SKC（接口不返回，不代表一定是 0；清单在 file）。' };
    }
    case 'orders': {
      const res = await purchaseOrders(request, { days: Number(opts.days ?? 7), pause: pacing });
      const file = save('采购单', res);
      return { store: store.name, range: res.range, count: res.count,
        byStatus: countBy(res.orders, (o) => o.statusName ?? o.status), byType: countBy(res.orders, (o) => o.typeName ?? o.type), file,
        note: '按更新时间查（北京时间）；明细在 file。' };
    }
    case 'finance': {
      const res = await financeReports(request, { days: Number(opts.days ?? 30), pause: pacing });
      const file = save('报账单', res);
      const byCurrency = {};
      for (const r of res.reports) byCurrency[r.currencyCode ?? '未知'] = Math.round(((byCurrency[r.currencyCode ?? '未知'] ?? 0) + (Number(r.estimateIncomeMoneyTotal) || 0)) * 100) / 100;
      return { store: store.name, range: res.range, count: res.count, bySettlement: countBy(res.reports, (r) => r.settlementStatusName ?? r.settlementStatus), amountByCurrency: byCurrency, file,
        note: '按报账单生成时间（北京时间）；金额是报账单金额合计，明细用 call /open-api/finance/report-sales-detail 按报账单号查。' };
    }
    default:
      throw new Error('data 子命令：sales | stock | orders | finance');
  }
}

export async function photos(sub, opts) {
  if (!opts.skc) throw new Error('photos 需要 --skc');
  const plan = photoPlan(opts.skc, { packagePhotos: list(opts.package), bodyPhotos: list(opts.body) });
  if (sub === 'check' || (sub === 'bind' && !opts.apply)) {
    return { ...plan, applied: false, note: plan.ok ? '照片检查通过。确认是贴好标签后真实拍摄的照片，再加 --apply 上传并绑定。' : '照片有问题，改好再试。' };
  }
  if (sub !== 'bind') throw new Error('photos 子命令：check | bind');
  const { store, request } = storeClient(opts.store);
  const res = await bindPhotos(request, plan, { pause: pacing });
  return { store: store.name, skc: opts.skc, applied: true, ...res,
    note: '实拍图是异步审核：先显示审核中（后台显示申报成功），识别不通过会变成审核不通过；过一阵用 labels status --skc 复查。' };
}

export const CLI_COMMANDS = ['auth-url', 'auth-watch', 'stores', 'call', 'labels', 'photos', 'data'];

/** 跑一条命令：结果打印到 stdout；出错抛异常（调用方负责打印和退出码） */
export async function runCli(argv) {
  const [cmd, ...rest] = argv;
  const { pos, opts } = parseArgs(rest);
  switch (cmd) {
    case 'auth-url':
      return out({ appId: loadAppId(), url: empowerUrl({ appId: loadAppId(), state: opts.state || `cc${Date.now().toString(36)}` }) });
    case 'auth-watch':
      return out(await authWatch(opts));
    case 'stores':
      return out(Object.entries(loadStores()).map(([n, s]) => publicStore(n, s)));
    case 'call': {
      const path = pos[0];
      if (!path) throw new Error('call 需要接口路径，如 /open-api/openapi-business-backend/query-store-info');
      // 不在只读清单里的接口当作会改店铺数据：先让用户确认，再加 --apply；也不重试
      const readOnly = isReadOnly(path);
      if (!readOnly && !opts.apply) throw new Error(`${path} 不在只读接口清单里（可能会改店铺数据）：先让用户确认要做什么，再加 --apply 执行`);
      const body = opts['json-file'] ? JSON.parse(readFileSync(opts['json-file'], 'utf8')) : opts.json ? JSON.parse(opts.json) : undefined;
      const query = opts.query.length ? Object.fromEntries(opts.query.map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; })) : undefined;
      const { store, request } = storeClient(opts.store);
      const info = await request(path, { method: opts.get ? 'GET' : 'POST', body, query, retry: readOnly && Boolean(opts.get || opts.retry) });
      return out({ store: store.name, path, info });
    }
    case 'labels':
      return out(await labels(pos[0], opts));
    case 'photos':
      return out(await photos(pos[0], opts));
    case 'data':
      return out(await data(pos[0], opts));
    default:
      throw new Error('用法：auth-url | auth-watch | stores | call | labels status|templates|materials|print | photos check|bind | data sales|stock|orders|finance（详见文件开头注释）');
  }
}
