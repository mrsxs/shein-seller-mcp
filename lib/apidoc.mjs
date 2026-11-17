// 读开放平台文档中心里某个接口的文档（公开接口，不需要登录）：请求参数 / 返回字段树，供拼请求用
const DOC_API = 'https://open.sheincorp.com/api/api/apiDoc/queryApiPublishDocDetailInfoById';
const MAX_NODES = 400;

const ENTITIES = { '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };
export function cleanText(s, max = 300) {
  const t = String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&(nbsp|lt|gt|amp|quot|#39);/g, (m) => ENTITIES[m]).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 文档里的参数是 {props:{name,type,required,description}, children:[…]} 结构的 JSON 字符串 → [{name,type,required,description,children}] */
export function paramTree(raw, { maxDepth = 5 } = {}) {
  if (!raw) return [];
  let root;
  try {
    root = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  let count = 0;
  const walk = (node, depth) => {
    const out = [];
    for (const c of node?.children || []) {
      if (count++ >= MAX_NODES) break;
      const p = c.props || {};
      // 文档用 multiple=1 表示数组：写成 array<类型>，免得照着拼出单个对象
      const type = p.multiple ? `array<${p.type || 'any'}>` : p.type ?? '';
      const item = { name: p.name ?? '', type, required: Boolean(p.required), description: cleanText(p.description, 240) };
      if (depth < maxDepth && c.children?.length) item.children = walk(c, depth + 1);
      out.push(item);
    }
    return out;
  };
  return walk(Array.isArray(root) ? { children: root } : root, 1);
}

export async function fetchApiDoc(docId, { fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  if (!/^\d{1,12}$/.test(String(docId))) throw new Error('文档 ID 不对');
  let d;
  try {
    const r = await fetchImpl(`${DOC_API}?id=${docId}&isLatest=true`, { signal: AbortSignal.timeout(timeoutMs) });
    d = JSON.parse(await r.text());
  } catch (err) {
    throw new Error(`读接口文档失败：${err.name === 'TimeoutError' ? '超时' : err.message}`);
  }
  const det = d?.info?.apiPublishDocDetailVo;
  if (String(d?.code) !== '0' || !det) throw new Error(`读接口文档失败：${d?.msg ?? '没有内容'}`);
  return {
    path: det.openPath,
    method: det.method,
    name: det.userDocName || det.title,
    modes: d.info.modeNameList ?? [],
    updatedAt: det.updateTime ?? null,
    description: cleanText(det.description, 1200),
    query: paramTree(det.queryStrings),
    body: paramTree(det.requestBody),
    response: paramTree(det.responseBody, { maxDepth: 3 }),
    docUrl: `https://open.sheincorp.com/documents/apidoc/detail/${docId}`,
  };
}
