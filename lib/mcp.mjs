// MCP 服务（stdio，每行一条 JSON-RPC 2.0）：把命令行的 labels / photos / data / call 包成工具。
// stdout 只写协议消息，诊断写 stderr。唯一会改店铺数据的工具是 shein_photo_bind，必须 confirm=true。
import { createInterface } from 'node:readline';
import { data, labels, photos, storeClient } from './cli.mjs';
import { loadStores, publicStore } from './config.mjs';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute } from 'node:path';
import { isReadOnly } from './endpoints.mjs';
import { INV_TYPES } from './data.mjs';
import { catalogInfo, findApi, searchApis } from './catalog.mjs';
import { fetchApiDoc } from './apidoc.mjs';

export class ArgError extends Error {}

const INSTRUCTIONS = 'SHEIN 卖家官方接口（SHEIN 开放平台，需要先授权店铺）。'
  + '合规：shein_label_status（哪些 SKC 的实拍图还缺必须体现的信息）→ shein_label_templates / shein_label_materials → shein_label_print（打印标签 PDF）→ '
  + '用户把标签贴到商品 / 外包装上拍真实照片 → shein_photo_check → 用户确认后 shein_photo_bind（confirm=true）。'
  + '数据：shein_sales（SKU 销量）、shein_stock（库存）、shein_purchase_orders（采购单）、shein_finance_reports（报账单）。'
  + '其他全部官方接口（读和写）：shein_api_search 找接口 → shein_api_doc 看参数 → shein_api_call 调用。'
  + '会改店铺数据的（发品、改价、改库存、上下架、发货、报活动、退货、上传等）必须先把要改的内容列给用户、用户明确同意后才带 confirm=true；不带 confirm 只返回将要发送的请求。'
  + '实拍图只能用用户真实拍摄的照片，绝不生成或合成图片。多店用 store 参数（店名或商家 ID，见 shein_stores）。';

const storeArg = { type: 'string', description: '店铺名或商家 ID；只授权了一家店时可不填（见 shein_stores）' };
const skcList = { type: 'array', items: { type: 'string' }, description: 'SKC 编码列表；不填 = 全店' };
const photoList = (what) => ({ type: 'array', items: { type: 'string' }, description: `${what}的照片：本机文件绝对路径（png / jpg，≤10MB，长宽 ≤8000px）` });
const obj = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const LOCAL_RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// 不改店铺数据，但会在本机新写结果文件（JSON / 标签 PDF；只新建、从不覆盖已有文件）
const EXPORT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const STORE_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
// 通用调用能调删除、取消、下架这类接口
const STORE_WRITE_DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
const MAX_UPLOAD = 20 * 1024 * 1024;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv', '.zip': 'application/zip' };

function checkFiles(files) {
  const out = [];
  for (const [field, file] of Object.entries(files)) {
    if (!/^[\w.-]{1,64}$/.test(field)) throw new ArgError(`files 的字段名不对：${field}`);
    if (typeof file !== 'string' || !isAbsolute(file)) throw new ArgError(`files.${field} 要是本机文件的绝对路径`);
    if (!existsSync(file) || !statSync(file).isFile()) throw new ArgError(`files.${field} 文件不存在：${file}`);
    const bytes = statSync(file).size;
    if (bytes > MAX_UPLOAD) throw new ArgError(`files.${field} 超过 20MB`);
    out.push({ field, file, bytes, type: MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
  }
  if (!out.length) throw new ArgError('files 不能是空对象');
  return out;
}

function checkForm(form) {
  for (const [k, v] of Object.entries(form)) {
    if (!/^[\w.-]{1,64}$/.test(k)) throw new ArgError(`form 的字段名不对：${k}`);
    if (typeof v !== 'string') throw new ArgError(`form.${k} 要是字符串`);
  }
  return form;
}

const csv = (arr) => (arr && arr.length ? arr.join(',') : undefined);

const TOOLS = [
  {
    name: 'shein_stores',
    description: '列出本机已授权的 SHEIN 店铺（店名、商家 ID、授权时间；不含密钥）。',
    annotations: LOCAL_RO,
    inputSchema: obj({}),
    run: () => Object.entries(loadStores()).map(([n, s]) => publicStore(n, s)),
  },
  {
    name: 'shein_label_status',
    description: '合规实拍图要求：哪些 SKC 的实拍图里还缺必须体现的信息（外包装 / 商品本体、站点、审核状态、驳回原因），按缺得最多的信息汇总；完整清单写到本机 JSON 文件。'
      + '全店 SKC 多时分段查：每次最多 max_skcs 个，返回 nextOffset 时用它作 offset 继续。',
    annotations: EXPORT,
    inputSchema: obj({
      store: storeArg, skc: skcList,
      all_labels: { type: 'boolean', default: false, description: 'true = 连非必须的信息也列出' },
      offset: { type: 'integer', minimum: 0, default: 0, description: '从全店第几个 SKC 开始（上一段返回的 nextOffset）' },
      max_skcs: { type: 'integer', minimum: 1, maximum: 150, default: 80, description: '这一段最多查多少个 SKC（每 10 个约 5 秒）' },
    }),
    run: (a) => labels('status', { store: a.store, skc: csv(a.skc), 'all-labels': a.all_labels === true, offset: a.offset ?? 0, 'max-skcs': a.max_skcs ?? 80 }),
  },
  {
    name: 'shein_label_templates',
    description: 'SKC 可用的合规标签模板（labelType：1 环保标、2 GPSR、3 自定义、4 GPSR+环保、5 条码+GPSR+环保合并、7 欧洲通用；labelCode、预览图）。',
    annotations: RO,
    inputSchema: obj({ store: storeArg, skc: { type: 'string', description: 'SKC 编码' } }, ['skc']),
    run: (a) => labels('templates', { store: a.store, skc: a.skc }),
  },
  {
    name: 'shein_label_materials',
    description: '环保材料清单（类型 ID → 材料 ID，如 6 塑料袋 → 66 PE 塑料袋 LDPE），打印环保标时用。',
    annotations: RO,
    inputSchema: obj({ store: storeArg }),
    run: (a) => labels('materials', { store: a.store }),
  },
  {
    name: 'shein_label_print',
    description: '打印 SKC 的合规标签，下载 PDF 到本机（不改店铺数据）。先用 shein_label_templates 选 label_type / label_code；环保标要 materials（不知道包装材质就问用户，不要猜）。',
    annotations: EXPORT,
    inputSchema: obj({
      store: storeArg,
      skc: { type: 'string', description: 'SKC 编码' },
      label_type: { type: 'integer', enum: [1, 2, 3, 4, 5, 7], description: '标签类型（见 shein_label_templates）' },
      label_code: { type: 'string', description: '模板编码；不填 = 按类型打出所有可用模板' },
      count: { type: 'integer', minimum: 1, maximum: 500, default: 1, description: '份数（填了 label_code 才生效）' },
      sku_code: { type: 'string', description: '条码里显示的平台 SKU（和 supplier_sku 二选一）' },
      supplier_sku: { type: 'string', description: '条码里显示的商家 SKU' },
      order_no: { type: 'string', description: '条码里显示的采购单号' },
      origin_country: { type: 'string', description: '原产地（GPSR），如 China' },
      batch_no: { type: 'string', description: '产品批次号（GPSR）' },
      warning: { type: 'string', description: '警示语（GPSR）' },
      materials: { type: 'array', items: { type: 'string' }, description: '环保材料，每项「类型ID:材料ID」，如 ["6:66"]（见 shein_label_materials）' },
    }, ['skc', 'label_type']),
    run: (a) => labels('print', {
      store: a.store, skc: a.skc, type: String(a.label_type), code: a.label_code, count: a.count === undefined ? undefined : String(a.count),
      'sku-code': a.sku_code, 'supplier-sku': a.supplier_sku, 'order-no': a.order_no, 'origin-country': a.origin_country,
      batch: a.batch_no, warning: a.warning, materials: csv(a.materials),
    }),
  },
  {
    name: 'shein_photo_check',
    description: '检查准备上传的实拍图（格式、大小、尺寸、每个 SKC 最多 15 张），不上传。',
    annotations: LOCAL_RO,
    inputSchema: obj({ skc: { type: 'string', description: 'SKC 编码' }, package_photos: photoList('外包装（贴了标签的包装）'), body_photos: photoList('商品本体（贴了标签的商品）') }, ['skc']),
    run: (a) => photos('check', { skc: a.skc, package: csv(a.package_photos), body: csv(a.body_photos) }),
  },
  {
    name: 'shein_photo_bind',
    description: '上传实拍图并绑定到 SKC（会改店铺数据）。只能用用户把标签贴在商品 / 外包装上后真实拍摄的照片，绝不生成、合成或修改图片。'
      + '调用前先 shein_photo_check，把 SKC 和每张照片的路径、用途列给用户，用户明确同意后才传 confirm=true。上传后是异步审核，过一阵用 shein_label_status 复查。',
    annotations: STORE_WRITE,
    inputSchema: obj({
      store: storeArg, skc: { type: 'string', description: 'SKC 编码' },
      package_photos: photoList('外包装（贴了标签的包装）'), body_photos: photoList('商品本体（贴了标签的商品）'),
      confirm: { type: 'boolean', description: '用户已确认 SKC 和照片清单时为 true；否则只做检查、不上传' },
    }, ['skc', 'confirm']),
    run: (a) => photos('bind', { store: a.store, skc: a.skc, package: csv(a.package_photos), body: csv(a.body_photos), apply: a.confirm === true }),
  },
  {
    name: 'shein_sales',
    description: '每个 SKU 的今日 / 昨日 / 近 7 天 / 近 30 天销量（北京时间 0 点更新），合计和近 30 天销量前 15；明细写到本机 JSON。',
    annotations: EXPORT,
    inputSchema: obj({ store: storeArg, skc: skcList }),
    run: (a) => data('sales', { store: a.store, skc: csv(a.skc) }),
  },
  {
    name: 'shein_stock',
    description: '库存：总库存、可用、锁定、在途（按 SKU）。inv_type：PI SHEIN 仓实物（默认）/ VI 商家虚拟 / JI 商家 JIT。',
    annotations: EXPORT,
    inputSchema: obj({ store: storeArg, skc: skcList, inv_type: { type: 'string', enum: Object.keys(INV_TYPES), default: 'PI' } }),
    run: (a) => data('stock', { store: a.store, skc: csv(a.skc), inv: a.inv_type }),
  },
  {
    name: 'shein_purchase_orders',
    description: '采购单（备货单 / 急采单），按更新时间查最近 days 天（≤60），按状态、类型计数；明细写到本机 JSON。',
    annotations: EXPORT,
    inputSchema: obj({ store: storeArg, days: { type: 'integer', minimum: 1, maximum: 60, default: 7 } }),
    run: (a) => data('orders', { store: a.store, days: String(a.days ?? 7) }),
  },
  {
    name: 'shein_finance_reports',
    description: '报账单：按生成时间查最近 days 天，按结算状态计数、按币种合计金额；明细写到本机 JSON。',
    annotations: EXPORT,
    inputSchema: obj({ store: storeArg, days: { type: 'integer', minimum: 1, maximum: 366, default: 30 } }),
    run: (a) => data('finance', { store: a.store, days: String(a.days ?? 30) }),
  },
  {
    name: 'shein_api_search',
    description: `在 SHEIN 开放平台全部官方接口里找接口（内置目录，${catalogInfo().total} 个，${catalogInfo().categories.length} 个分类：${catalogInfo().categories.join('、')}）。`
      + '返回路径、方法、分类、适用合作模式（全托管 / 半托管 / 自运营 / POP / SHEIN 自营）、readOnly（false = 会改店铺数据）。',
    annotations: LOCAL_RO,
    inputSchema: obj({
      query: { type: 'string', description: '关键词，空格分隔，都要命中（名称 / 路径 / 分类 / 说明），如「库存 更新」「订单 列表」' },
      category: { type: 'string', enum: catalogInfo().categories, description: '只看这个分类' },
      read_only: { type: 'boolean', description: 'true 只看只读接口，false 只看会改数据的接口；不填 = 都看' },
      limit: { type: 'integer', minimum: 1, maximum: 300, default: 30 },
    }),
    run: (a) => searchApis({ query: a.query ?? '', category: a.category, readOnly: a.read_only, limit: a.limit ?? 30 }),
  },
  {
    name: 'shein_api_doc',
    description: '读某个官方接口的文档（实时从开放平台文档中心取）：说明、适用模式、查询参数、请求体字段（类型、是否必填、含义）、返回字段。拼 shein_api_call 的请求前先看这个。',
    annotations: RO,
    inputSchema: obj({ path: { type: 'string', description: '接口路径（shein_api_search 的 path）' } }, ['path']),
    run: async (a) => {
      const api = findApi(a.path);
      if (!api) throw new ArgError(`${a.path} 不在开放平台文档目录里，先用 shein_api_search 找`);
      return { readOnly: isReadOnly(a.path), ...(await fetchApiDoc(api.id)) };
    },
  },
  {
    name: 'shein_api_call',
    description: '调用任意 SHEIN 开放平台官方接口（读和写，路径要在 shein_api_search 的目录里）。只读接口直接调用（断线自动重试）。'
      + '会改店铺数据的接口（readOnly=false：发品、改价、改库存、上下架、发货、报活动、退货、删除、上传等）：不带 confirm 只返回将要发送的请求（不发送），'
      + '把它整理给用户看，用户明确同意后再带 confirm=true 发送；写操作不自动重试。需要上传文件的接口用 files（字段名 → 本机文件绝对路径），其他表单字段放 form。',
    annotations: STORE_WRITE_DESTRUCTIVE,
    inputSchema: obj({
      store: storeArg,
      path: { type: 'string', description: '接口路径，如 /open-api/goods/searchProduct；路径里带 {变量} 的换成实际值' },
      method: { type: 'string', enum: ['POST', 'GET', 'DELETE'], description: '不填 = 用文档目录里的方法' },
      body: { type: 'object', description: 'JSON 请求体（POST）' },
      query: { type: 'object', description: 'URL 查询参数（GET 常用）' },
      files: { type: 'object', description: '上传文件的接口：{ 字段名: 本机文件绝对路径 }，如 { "file": "/Users/me/a.jpg" }；单个 ≤20MB' },
      form: { type: 'object', description: '上传文件时一起提交的其他表单字段 { 字段名: 字符串 }' },
      confirm: { type: 'boolean', description: '会改店铺数据的接口：用户明确同意后为 true；不填 / false 只预览不发送' },
    }, ['path']),
    run: async (a) => {
      const api = findApi(a.path);
      const readOnly = isReadOnly(a.path);
      if (!api && !readOnly) throw new ArgError(`${a.path} 不在开放平台文档目录里，先用 shein_api_search 找`);
      const method = a.method ?? api?.method ?? 'POST';
      if (a.form && !a.files) throw new ArgError('form 只和 files 一起用（上传文件的表单）');
      if (a.files && a.body) throw new ArgError('上传文件时请求体放 form，不要同时传 body');
      const files = a.files ? checkFiles(a.files) : null;
      const form = a.form ? checkForm(a.form) : null;
      const { store, request } = storeClient(a.store);
      if (!readOnly && a.confirm !== true) {
        return {
          preview: true, store: store.name, api: api ? { name: api.name, category: api.category } : null, method, path: a.path,
          query: a.query ?? null, body: a.body ?? null, form, files: files ? files.map(({ field, file, bytes }) => ({ field, file, bytes })) : null,
          note: '这是会改店铺数据的接口，没有发送。把上面的内容（哪家店、改什么、改成什么）整理给用户确认；用户明确同意后，带同样的参数加 confirm=true 再调用。',
        };
      }
      let body = a.body;
      if (files) {
        body = new FormData();
        for (const [k, v] of Object.entries(form ?? {})) body.append(k, v);
        for (const f of files) body.append(f.field, new Blob([readFileSync(f.file)], { type: f.type }), basename(f.file));
      }
      const info = await request(a.path, { method, body, query: a.query, retry: readOnly });
      return { store: store.name, path: a.path, readOnly, sent: true, info };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** 按 inputSchema 校验参数：不认识的参数、类型、枚举、范围、必填 */
export function checkArgs(tool, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new ArgError('参数必须是对象');
  const props = tool.inputSchema.properties;
  for (const key of Object.keys(args)) if (!Object.hasOwn(props, key)) throw new ArgError(`未知参数：${key}`);
  for (const key of tool.inputSchema.required ?? []) if (args[key] === undefined) throw new ArgError(`缺少参数：${key}`);
  for (const [key, value] of Object.entries(args)) {
    const spec = props[key];
    if (value === undefined) continue;
    if (spec.type === 'string' && (typeof value !== 'string' || !value.trim())) throw new ArgError(`${key} 必须是非空字符串`);
    if (spec.type === 'integer' && !Number.isInteger(value)) throw new ArgError(`${key} 必须是整数`);
    if (spec.type === 'boolean' && typeof value !== 'boolean') throw new ArgError(`${key} 必须是 true / false`);
    if (spec.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new ArgError(`${key} 必须是对象`);
    if (spec.type === 'array') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) throw new ArgError(`${key} 必须是非空字符串数组`);
      // 列表会用逗号拼给命令行，元素里不能有逗号
      if (value.some((v) => v.includes(','))) throw new ArgError(`${key} 的元素里不能有逗号`);
    }
    if (spec.enum && !spec.enum.includes(value)) throw new ArgError(`${key} 只能是：${spec.enum.join('、')}`);
    if (spec.minimum !== undefined && value < spec.minimum) throw new ArgError(`${key} 不能小于 ${spec.minimum}`);
    if (spec.maximum !== undefined && value > spec.maximum) throw new ArgError(`${key} 不能大于 ${spec.maximum}`);
  }
}

export async function callTool(name, args) {
  const tool = BY_NAME.get(name);
  if (!tool) return { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true };
  try {
    const input = args ?? {};
    checkArgs(tool, input);
    return { content: [{ type: 'text', text: JSON.stringify(await tool.run(input)) }] };
  } catch (error) {
    if (!(error instanceof ArgError)) process.stderr.write(`[shein-seller-mcp] ${name}: ${error?.message ?? error}\n`);
    return { content: [{ type: 'text', text: String(error?.message ?? error) }], isError: true };
  }
}

export const listedTools = () => TOOLS.map(({ run, ...t }) => t);

export function startServer(version) {
  const send = (m) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  const handle = async ({ id, method, params }) => {
    switch (method) {
      case 'initialize':
        return { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'shein-seller-mcp', version }, instructions: INSTRUCTIONS };
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: listedTools() };
      case 'tools/call':
        return callTool(params?.name, params?.arguments);
      default:
        if (id === undefined) return undefined; // 通知不回复
        throw Object.assign(new Error(`不支持的方法：${method}`), { code: -32601 });
    }
  };
  createInterface({ input: process.stdin }).on('line', async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ id: null, error: { code: -32700, message: 'JSON 解析失败' } });
      return;
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      send({ id: null, error: { code: -32600, message: '请求必须是 JSON 对象' } });
      return;
    }
    try {
      const result = await handle(message);
      if (message.id !== undefined && result !== undefined) send({ id: message.id, result });
    } catch (err) {
      if (message.id !== undefined) send({ id: message.id, error: { code: err.code ?? -32603, message: String(err.message ?? err) } });
    }
  });
}
