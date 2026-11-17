#!/usr/bin/env node
// 从 SHEIN 开放平台文档中心生成 lib/catalog.json（全部接口：分类、路径、方法、名称、适用模式、一句话说明）。
//   node scripts/build-catalog.mjs                     在线拉目录和每个接口的文档（约 240 个，每个间隔 0.3 秒）
//   node scripts/build-catalog.mjs --details x.json    用已经拉好的文档详情（{docId: {modes, description}}）
import { readFileSync, writeFileSync } from 'node:fs';
import { cleanText } from '../lib/apidoc.mjs';

const BASE = 'https://open.sheincorp.com/api/api/apiDoc';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      return JSON.parse(await r.text());
    } catch (err) {
      if (i >= 2) throw err;
      await sleep(2000);
    }
  }
};

const args = process.argv.slice(2);
const cached = args[0] === '--details' ? JSON.parse(readFileSync(args[1], 'utf8')) : null;
const cat = await getJson(`${BASE}/queryAllApiDocCategoryList?categoryType=1`);
if (String(cat.code) !== '0' || !Array.isArray(cat.info)) throw new Error('目录接口返回不对');
const apis = [];
for (const c of cat.info) {
  for (const a of c.apiDocVoList || []) {
    let d = cached?.[String(a.id)];
    if (!d) {
      const doc = await getJson(`${BASE}/queryApiPublishDocDetailInfoById?id=${a.id}&isLatest=true`);
      d = { modes: doc.info?.modeNameList, description: doc.info?.apiPublishDocDetailVo?.description };
      await sleep(300);
    }
    apis.push({
      id: a.id, category: c.categoryName, method: a.method, path: a.openPath,
      name: a.userDocName || a.title, modes: Array.isArray(d.modes) ? d.modes : [], summary: cleanText(d.description, 120),
    });
  }
}
const out = { generatedAt: new Date().toISOString().slice(0, 10), categories: cat.info.map((c) => c.categoryName), apis };
writeFileSync(new URL('../lib/catalog.json', import.meta.url), `${JSON.stringify(out)}\n`);
console.log(`lib/catalog.json：${out.categories.length} 个分类，${apis.length} 个接口`);
