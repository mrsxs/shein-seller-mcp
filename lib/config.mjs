// 本机配置：~/.config/shein-open/（目录 700、文件 600；SHEIN_OPEN_DIR 可改）
//   app.json        { "appId": "开放平台应用 APP ID", "apiHost": "可选，默认全托管域名" }（也可用 SHEIN_APP_ID / SHEIN_API_HOST）
//   app-secret.txt  开放平台应用的 APP Secret（只有一行）
//   stores.json     各店铺授权后的 openKeyId 和解密后的 secretKey
// 密钥不进项目目录、不打印。
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 接口域名：全托管 / SHEIN 自营 openapi.sheincorp.cn；半托管、自运营 openapi.sheincorp.com
export const DEFAULT_API_HOST = 'https://openapi.sheincorp.cn';
export const AUTH_HOST = 'https://openapi-sem.sheincorp.com';

export const configDir = (env = process.env) => env.SHEIN_OPEN_DIR || join(homedir(), '.config', 'shein-open');

function assertPrivate(file) {
  if (process.platform === 'win32') return;
  const mode = statSync(file).mode & 0o777;
  if (mode & 0o077) throw new Error(`${file} 权限太宽（${mode.toString(8)}），应为 600：chmod 600 "${file}"`);
}

function readAppJson(dir) {
  const file = join(dir, 'app.json');
  if (!existsSync(file)) return {};
  try {
    const d = JSON.parse(readFileSync(file, 'utf8'));
    return d && typeof d === 'object' ? d : {};
  } catch {
    throw new Error(`${file} 不是合法 JSON`);
  }
}

/** 应用 APP ID：环境变量 SHEIN_APP_ID 优先，其次 app.json */
export function loadAppId(dir = configDir(), env = process.env) {
  const id = env.SHEIN_APP_ID || readAppJson(dir).appId;
  if (!id) throw new Error(`没有配置开放平台应用 APP ID：设置环境变量 SHEIN_APP_ID，或在 ${join(dir, 'app.json')} 写 {"appId":"…"}`);
  if (!/^[0-9A-Za-z]{10,64}$/.test(String(id))) throw new Error('APP ID 格式不对');
  return String(id);
}

/** 接口域名：SHEIN_API_HOST 优先，其次 app.json 的 apiHost，默认全托管域名；只允许 SHEIN 的 openapi 域名 */
export function loadApiHost(dir = configDir(), env = process.env) {
  const host = env.SHEIN_API_HOST || readAppJson(dir).apiHost || DEFAULT_API_HOST;
  if (!/^https:\/\/openapi(-test01)?\.sheincorp\.(cn|com)$/.test(host)) throw new Error(`接口域名不对：${host}（应是 https://openapi.sheincorp.cn 或 .com）`);
  return host;
}

export function loadAppSecret(dir = configDir()) {
  const file = join(dir, 'app-secret.txt');
  if (!existsSync(file)) throw new Error(`没有 APP Secret：请把开放平台应用的 APP Secret 存进 ${file}（chmod 600）`);
  assertPrivate(file);
  const v = readFileSync(file, 'utf8').trim();
  if (!/^[0-9A-Za-z]{16,64}$/.test(v)) throw new Error(`${file} 内容不像 APP Secret`);
  return v;
}

export function loadStores(dir = configDir()) {
  const file = join(dir, 'stores.json');
  if (!existsSync(file)) return {};
  assertPrivate(file);
  let d;
  try {
    d = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // 解析错误信息会带上文件片段（含密钥），不能原样输出
    throw new Error(`${file} 格式不对（内容含密钥，不显示）：重新授权店铺或检查文件`);
  }
  if (!d || typeof d !== 'object' || !d.stores || typeof d.stores !== 'object') throw new Error(`${file} 格式不对：没有 stores`);
  return d.stores;
}

export function saveStore(name, record, dir = configDir()) {
  if (!/^[\p{L}\p{N} _.-]{1,60}$/u.test(name)) throw new Error('店铺名只能用字母、数字、空格、_ . -');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stores = { ...loadStores(dir), [name]: record };
  const file = join(dir, 'stores.json');
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ stores }, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
  return file;
}

/** 按名称或商家 ID 找店；只有一家时可不填 */
export function resolveStore(stores, ref) {
  const names = Object.keys(stores);
  if (!names.length) throw new Error('还没有授权的店铺：先运行 auth-url 生成授权链接，再 auth-watch');
  if (!ref) {
    if (names.length === 1) return { name: names[0], ...stores[names[0]] };
    throw new Error(`有 ${names.length} 家店，请用 --store 指定：${names.join('、')}`);
  }
  // 店名完全一致优先；按商家 ID 找时必须唯一，免得拿错店的密钥去写数据
  if (Object.hasOwn(stores, ref)) return { name: ref, ...stores[ref] };
  const byId = names.filter((n) => String(stores[n].supplierId ?? '') === String(ref));
  if (byId.length > 1) throw new Error(`商家 ID ${ref} 对应多家店（${byId.join('、')}），请用店名指定`);
  if (!byId.length) throw new Error(`没有找到店铺「${ref}」；已授权：${names.join('、')}`);
  return { name: byId[0], ...stores[byId[0]] };
}

/** 对外展示用（不含密钥） */
export const publicStore = (name, s) => ({ name, supplierId: s.supplierId ?? null, storeName: s.storeName ?? null, authorizedAt: s.authorizedAt ?? null, openKeyId: s.openKeyId ? `${s.openKeyId.slice(0, 4)}…` : null });
