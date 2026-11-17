// 合规标签与实拍图（官方接口）：
//   查哪些 SKC 的实拍图里必须体现哪些信息 → 查 SKC 可用的标签模板 → 打印标签 PDF →（人工把标签贴到商品 / 包装上、拍照）
//   → 上传实拍图 → 绑定到 SKC。平台会自动识别照片里的信息，审核是异步的。
// 只上传真实拍摄的照片：工具不生成、不合成图片。
import { readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';

export const REVIEW_STATUS = { 0: '待提交', 1: '审核中（后台显示申报成功）', 2: '通过', 3: '不通过' };
export const LABEL_GROUP = { 1: '商品本体', 2: '外包装' };
export const SHELF_STATUS = { 0: '待上架', 1: '已上架', 2: '已下架', 3: '售罄' };
export const LABEL_TYPES = { 1: '环保标', 2: 'GPSR 标', 3: '商家自定义', 4: 'GPSR+环保标', 5: '条码/GPSR/环保标合并', 7: '欧洲通用模板' };

const PRODUCT_PAGE = 200;
const LABEL_BATCH = 10; // skc-label-list 一次最多 10 个 SKC（100 个会报「查询标签审核结果列表异常」）
const PRINT_BATCH = 10; // label-print 单次最多 10 组规则
const noPause = async () => {};

/** 店铺全部 SKC（商品列表接口，每页 200，按 SKC 去重） */
export async function listSkcs(request, { pause = noPause, maxPages = 250 } = {}) {
  const out = new Map();
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await pause();
    const info = await request('/open-api/openapi-business-backend/product/query', { body: { pageNum: page, pageSize: PRODUCT_PAGE }, retry: true });
    const rows = info?.data;
    if (!Array.isArray(rows)) throw new Error('商品列表返回的数据不完整（没有 data）');
    for (const r of rows) {
      if (!r.skcName) throw new Error('商品列表返回了没有 SKC 编码的记录');
      // 没有 SKU 列表就没法按 SKU 查销量，不能当成「0 个 SKU」
      if (!Array.isArray(r.skuCodeList) || !r.skuCodeList.length) throw new Error(`商品列表里 SKC ${r.skcName} 没有 SKU 列表`);
      if (!out.has(r.skcName)) out.set(r.skcName, { skc: r.skcName, spu: r.spuName ?? null, skuCodes: r.skuCodeList });
    }
    if (rows.length < PRODUCT_PAGE) return [...out.values()];
  }
  throw new Error(`商品超过 ${maxPages * PRODUCT_PAGE} 个 SKC，请分批查询`);
}

const label = (l) => ({
  labelId: l.labelId,
  name: l.labelName,
  group: LABEL_GROUP[l.labelGroup] ?? String(l.labelGroup ?? ''),
  required: l.isRequired === 1,
  // isRequired 只有 0/1 是确定的（10 是 SKC 刚生成时的瞬间状态）；缺字段或取值不认识都算「不确定」，不能当成没问题
  uncertain: ![0, 1].includes(l.isRequired) || !(Number.isInteger(l.reviewStatus) && REVIEW_STATUS[l.reviewStatus] !== undefined),
  status: l.reviewStatus,
  statusText: Number.isInteger(l.reviewStatus) ? REVIEW_STATUS[l.reviewStatus] ?? '状态未知' : '状态未知',
  sites: l.siteList ?? [],
  failReason: l.failReason ?? null,
});

/** 查一批 SKC 的实拍图要求；requiredOnly 只看必须体现的信息。每批 10 个，接口没返回的 SKC 记在 missing 里 */
export async function labelRequirements(request, skcs, { requiredOnly = true, pause = noPause } = {}) {
  const rows = [];
  const missing = [];
  for (let i = 0; i < skcs.length; i += LABEL_BATCH) {
    if (i) await pause();
    const batch = skcs.slice(i, i + LABEL_BATCH);
    const info = await request('/open-api/goods-compliance/skc-label-list', {
      body: { pageNum: 1, pageSize: LABEL_BATCH, skcList: batch, ...(requiredOnly ? { isRequired: 1 } : {}) }, retry: true,
    });
    if (!Array.isArray(info)) throw new Error('实拍图要求返回的数据不完整');
    const got = new Set();
    for (const r of info) {
      if (!batch.includes(r.skc) || got.has(r.skc)) continue;
      // 没有要求列表的 SKC 不能当成「没有缺的」：记到 missing
      if (!Array.isArray(r.skcLabelInfoList)) continue;
      got.add(r.skc);
      rows.push({ skc: r.skc, shelfStatus: SHELF_STATUS[r.skcShelfStatus] ?? String(r.skcShelfStatus ?? ''), labels: r.skcLabelInfoList.map(label) });
    }
    for (const s of batch) if (!got.has(s)) missing.push(s);
  }
  return { rows, missing };
}

/** 需要处理的：必须体现、还没提交（0）或审核不通过（3）的信息 */
export function summarizeRequirements(rows) {
  const todo = [];
  const byLabel = new Map();
  let passed = 0;
  let reviewing = 0;
  let unknown = 0;
  for (const r of rows) {
    // 必须体现且待提交 / 不通过的；加上状态不确定的（过一阵再查）
    const pending = r.labels.filter((l) => (l.required && (l.status === 0 || l.status === 3)) || l.uncertain);
    unknown += r.labels.filter((l) => l.uncertain).length;
    passed += r.labels.filter((l) => l.required && l.status === 2).length;
    reviewing += r.labels.filter((l) => l.required && l.status === 1).length;
    if (!pending.length) continue;
    todo.push({ skc: r.skc, shelfStatus: r.shelfStatus, pending: pending.map((l) => ({ name: l.name, group: l.group, status: l.uncertain ? '状态未知（过一阵再查）' : l.statusText, failReason: l.failReason })) });
    for (const l of pending) byLabel.set(`${l.name}｜${l.group}`, (byLabel.get(`${l.name}｜${l.group}`) ?? 0) + 1);
  }
  return {
    skcs: rows.length,
    skcsNeedPhotos: todo.length,
    requiredLabels: { pending: todo.reduce((n, t) => n + t.pending.length, 0) - unknown, reviewing, passed, unknown },
    rejected: todo.flatMap((t) => t.pending.filter((p) => p.status === REVIEW_STATUS[3]).map((p) => ({ skc: t.skc, name: p.name, failReason: p.failReason }))),
    byLabel: [...byLabel].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, skcs: n })),
    todo,
  };
}

export async function labelTemplates(request, skc) {
  const info = await request('/open-api/goods-compliance/get-label-template', { body: { skc }, retry: true });
  return (info?.labelList || []).map((l) => ({ labelType: l.labelType, typeName: LABEL_TYPES[l.labelType] ?? null, labelCode: l.labelCode, name: l.labelName, preview: l.labelPreview ?? null }));
}

/**
 * 打印标签：rules = [{ skc, labelType, labelCode?, printNumber?, skuCode?|supplierSku?, orderNo?, originCountry?, productBatchNo?, warning?, packageMaterialList? }]
 * 返回 { success: [{ uid, labelType, labelCode, labelUrl, size }], failed: [{ uid, labelType, reason }] }；打印不改动店铺数据
 */
export async function printLabels(request, rules, { pause = noPause } = {}) {
  const success = [];
  const failed = [];
  const withUid = rules.map((r, i) => {
    if (!r.skc || !r.labelType) throw new Error(`第 ${i + 1} 条打印规则缺 skc 或 labelType`);
    return { ...r, uid: r.uid ?? String(i + 1) };
  });
  for (let i = 0; i < withUid.length; i += PRINT_BATCH) {
    if (i) await pause();
    const batch = withUid.slice(i, i + PRINT_BATCH);
    const info = await request('/open-api/goods-compliance/label-print', { body: { labelDetailList: batch }, retry: true });
    const ok = info?.successList ?? [];
    const bad = info?.failedList ?? [];
    if (!Array.isArray(ok) || !Array.isArray(bad)) throw new Error('打印接口返回的数据不完整');
    for (const s of ok) {
      if (!s?.labelUrl) throw new Error(`打印接口返回的成功记录没有 PDF 地址（uid ${s?.uid}）`);
      success.push({ uid: s.uid, labelType: s.labelType, labelCode: s.labelCode, labelUrl: s.labelUrl, size: s.labelLength && s.labelWidth ? `${s.labelLength}×${s.labelWidth}` : null });
    }
    for (const f of bad) failed.push({ uid: f.uid, labelType: f.labelType, reason: f.reason ?? f.code ?? '未知原因' });
    // 每条规则都要有结果：没返回的算失败，不能悄悄少打
    const seen = new Set([...ok, ...bad].map((x) => String(x?.uid)));
    for (const r of batch) if (!seen.has(String(r.uid))) failed.push({ uid: r.uid, labelType: r.labelType, reason: '接口没有返回这条的结果' });
  }
  return { success, failed };
}

/** 标签 PDF 的保存路径：文件名里的 SKC / 模板编码只留安全字符，最终路径必须在 dir 里面 */
export function labelPdfPath(dir, { skc, labelType, labelCode, date }) {
  const safe = (v) => String(v ?? '').replace(/[^\w-]/g, '_').slice(0, 80) || 'x';
  const f = join(dir, `${safe(skc)}_类型${safe(labelType)}_${safe(labelCode)}_${safe(date)}.pdf`);
  if (!resolve(f).startsWith(resolve(dir) + sep)) throw new Error('标签文件路径不对，已停止');
  return f;
}

// ---- 实拍图 ----
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 8000;
const MAX_PER_SKC = 15;

/**
 * 读 PNG / JPEG 的宽高（只看结构，不解码）。不是结构完整的图片就返回 null，别把坏文件传上去：
 *   PNG：8 字节签名 → 第一个块是长度 13 的 IHDR → 每个块的长度都在文件范围内 → 至少一个 IDAT → 最后是长度 0 的 IEND 且正好到文件末尾
 *   JPEG：SOI → 各段长度都在文件范围内 → SOS 之前有 SOF → SOS 之后有扫描数据 → 以 EOI 结尾
 *   宽高都要 > 0
 */
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngSize(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  let i = 8;
  let size = null;
  let idat = false;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len; // 长度 + 类型 + 数据 + CRC
    if (len > 0x7fffffff || end > buf.length) return null;
    if (!size) {
      if (type !== 'IHDR' || len !== 13) return null;
      size = { type: 'png', width: buf.readUInt32BE(i + 8), height: buf.readUInt32BE(i + 12) };
    } else if (type === 'IDAT' && len > 0) {
      idat = true;
    } else if (type === 'IEND') {
      return len === 0 && end === buf.length && idat && size.width > 0 && size.height > 0 ? size : null;
    }
    i = end;
  }
  return null;
}
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return null;
  let i = 2;
  let size = null;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; } // 填充字节
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // 没有长度的独立标记
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    // SOF0..SOF15（不含 DHT C4、JPG C8、DAC CC）
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (len < 8) return null;
      size = { type: 'jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    if (marker === 0xda) {
      // 扫描数据在 SOS 段之后、EOI 之前，至少要有一点
      const scanStart = i + 2 + len;
      return size && size.width > 0 && size.height > 0 && buf.length - 2 > scanStart ? size : null;
    }
    i += 2 + len;
  }
  return null;
}
export const imageSize = (buf) => pngSize(buf) ?? jpegSize(buf);

/** 上传前检查：png/jpg/jpeg、≤10M、长宽 ≤8000；返回问题列表（空 = 没问题） */
export function checkPhoto(file) {
  const problems = [];
  if (!['.png', '.jpg', '.jpeg'].includes(extname(file).toLowerCase())) problems.push('只支持 png / jpg / jpeg');
  let st;
  try {
    st = statSync(file);
  } catch {
    return { file, problems: ['文件不存在'] };
  }
  if (st.size > MAX_BYTES) problems.push(`文件 ${(st.size / 1048576).toFixed(1)}MB，超过 10MB`);
  const size = imageSize(readFileSync(file));
  if (!size) problems.push('不是有效的 PNG / JPEG 图片');
  else if (size.width > MAX_SIDE || size.height > MAX_SIDE) problems.push(`尺寸 ${size.width}×${size.height}，长或宽超过 8000px`);
  return { file, bytes: st.size, ...(size ? { width: size.width, height: size.height } : {}), problems };
}

/** 绑定计划：每个 SKC 最多 15 张；package = 外包装上的标签照片，body = 商品本体上的标签照片 */
export function photoPlan(skc, { packagePhotos = [], bodyPhotos = [] }) {
  const checks = [...packagePhotos.map((f) => ({ ...checkPhoto(f), group: '外包装' })), ...bodyPhotos.map((f) => ({ ...checkPhoto(f), group: '商品本体' }))];
  const problems = checks.filter((c) => c.problems.length).map((c) => `${basename(c.file)}：${c.problems.join('；')}`);
  if (!checks.length) problems.push('没有照片');
  if (checks.length > MAX_PER_SKC) problems.push(`一个 SKC 最多 ${MAX_PER_SKC} 张，现在 ${checks.length} 张`);
  return { skc, photos: checks, ok: !problems.length, problems };
}

export async function uploadPhoto(request, file) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg' }), basename(file));
  // 上传会产生新图片：不自动重试
  const info = await request('/open-api/goods-compliance/upload-skc-label-picture', { body: form });
  if (!info?.imageUrl || !info?.imageMd5) throw new Error(`${basename(file)} 上传没有返回图片地址：${info?.msg ?? ''}`);
  return { imageUrl: info.imageUrl, imageMd5: info.imageMd5 };
}

/** 执行绑定计划：逐张上传，再一次绑定到 SKC。调用前必须让用户确认 */
export async function bindPhotos(request, plan, { pause = noPause } = {}) {
  if (!plan.ok) throw new Error(`照片有问题，不能上传：${plan.problems.join('；')}`);
  const packageLableList = [];
  const bodyLableList = [];
  for (const [i, p] of plan.photos.entries()) {
    if (i) await pause();
    const img = await uploadPhoto(request, p.file);
    (p.group === '外包装' ? packageLableList : bodyLableList).push(img);
  }
  const info = await request('/open-api/goods-compliance/skc-save-label', {
    body: { skcList: [plan.skc], ...(packageLableList.length ? { packageLableList } : {}), ...(bodyLableList.length ? { bodyLableList } : {}) },
  });
  return { uploaded: packageLableList.length + bodyLableList.length, total: info?.totalCount ?? null, success: info?.successCount ?? null, failed: info?.faildList ?? [] };
}
