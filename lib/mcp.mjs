// MCP 服务（stdio，每行一条 JSON-RPC 2.0）：把命令行的 labels / photos / data / call 包成工具。
// stdout 只写协议消息，诊断写 stderr。唯一会改店铺数据的工具是 shein_photo_bind，必须 confirm=true。
import { createInterface } from 'node:readline';
import { data, labels, photos, storeClient } from './cli.mjs';
import { loadStores, publicStore } from './config.mjs';
import { isReadOnly, READ_ONLY } from './endpoints.mjs';
import { INV_TYPES } from './data.mjs';

export class ArgError extends Error {}

const INSTRUCTIONS = 'SHEIN 卖家官方接口（SHEIN 开放平台，需要先授权店铺）。'
  + '合规：shein_label_status（哪些 SKC 的实拍图还缺必须体现的信息）→ shein_label_templates / shein_label_materials → shein_label_print（打印标签 PDF）→ '
  + '用户把标签贴到商品 / 外包装上拍真实照片 → shein_photo_check → 用户确认后 shein_photo_bind（confirm=true）。'
  + '数据：shein_sales（SKU 销量）、shein_stock（库存）、shein_purchase_orders（采购单）、shein_finance_reports（报账单）；其他只读接口 shein_api_call。'
  + '只有 shein_photo_bind 会改店铺数据，且只能上传用户真实拍摄的照片，绝不生成或合成图片。多店用 store 参数（店名或商家 ID，见 shein_stores）。';

const storeArg = { type: 'string', description: '店铺名或商家 ID；只授权了一家店时可不填（见 shein_stores）' };
const skcList = { type: 'array', items: { type: 'string' }, description: 'SKC 编码列表；不填 = 全店' };
const photoList = (what) => ({ type: 'array', items: { type: 'string' }, description: `${what}的照片：本机文件绝对路径（png / jpg，≤10MB，长宽 ≤8000px）` });
const obj = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const LOCAL_RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// 不改店铺数据，但会在本机新写结果文件（JSON / 标签 PDF；只新建、从不覆盖已有文件）
const EXPORT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const STORE_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

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
    name: 'shein_api_call',
    description: '调用其他**只读**官方接口（已订阅的查询类接口，见开放平台文档）。会改数据的接口（发品、改价、改库存、报活动、发货等）一律拒绝。',
    annotations: RO,
    inputSchema: obj({
      store: storeArg,
      path: { type: 'string', description: '接口路径，如 /open-api/goods/searchProduct' },
      method: { type: 'string', enum: ['POST', 'GET'], default: 'POST' },
      body: { type: 'object', description: 'POST 的 JSON 请求体' },
      query: { type: 'object', description: 'GET 的查询参数' },
    }, ['path']),
    run: async (a) => {
      if (!isReadOnly(a.path)) throw new ArgError(`${a.path} 不在只读接口清单里（共 ${READ_ONLY.size} 个），MCP 不调可能改店铺数据的接口`);
      const { store, request } = storeClient(a.store);
      const info = await request(a.path, { method: a.method ?? 'POST', body: a.body, query: a.query, retry: true });
      return { store: store.name, path: a.path, info };
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
