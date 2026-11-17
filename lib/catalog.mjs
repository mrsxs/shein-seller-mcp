// 官方接口目录（lib/catalog.json，由 scripts/build-catalog.mjs 从开放平台文档中心生成）：搜索、按路径找接口
import { readFileSync } from 'node:fs';
import { isReadOnly } from './endpoints.mjs';

const CATALOG = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
const BY_PATH = new Map(CATALOG.apis.map((a) => [a.path, a]));
// 带变量的路径（如 /open-api/goods/delete/{skcName}）按模板匹配：变量是一段字母数字（可以带 . 但不能是 . / .. 或以 . 开头），
// 否则 fetch 会把 .. 规范化掉，实际请求的地址和签名、校验用的地址不一样
const TEMPLATES = CATALOG.apis.filter((a) => a.path.includes('{')).map((a) => ({
  a, re: new RegExp(`^${a.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[\\w-]+(?:\\.[\\w-]+)*')}$`),
}));

export const catalogInfo = () => ({ generatedAt: CATALOG.generatedAt, categories: CATALOG.categories, total: CATALOG.apis.length });

/** 按路径找接口；不在文档目录里返回 null */
export const findApi = (path) => BY_PATH.get(path) ?? TEMPLATES.find((t) => t.re.test(path))?.a ?? null;

const view = (a) => ({ path: a.path, method: a.method, name: a.name, category: a.category, modes: a.modes, readOnly: isReadOnly(a.path), summary: a.summary, docId: a.id });

/**
 * 搜接口：query 按空格分词，每个词都要出现在名称 / 路径 / 分类 / 说明里（不分大小写）；category 精确匹配分类名。
 * 名称命中排前面。
 */
export function searchApis({ query = '', category, readOnly, limit = 30 } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const hits = [];
  for (const a of CATALOG.apis) {
    if (category && a.category !== category) continue;
    if (readOnly !== undefined && isReadOnly(a.path) !== readOnly) continue;
    const name = a.name.toLowerCase();
    const hay = `${name} ${a.path.toLowerCase()} ${a.category.toLowerCase()} ${(a.summary || '').toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    hits.push({ a, score: words.filter((w) => name.includes(w)).length });
  }
  hits.sort((x, y) => y.score - x.score);
  return { total: hits.length, apis: hits.slice(0, limit).map(({ a }) => view(a)) };
}
