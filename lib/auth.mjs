// 店铺授权：拼授权链接 → 店铺主账号点「授权」→ 跳到 redirectUrl?tempToken=…（10 分钟有效）→ get-by-token 换 openKeyId + secretKey
import { AUTH_HOST } from './config.mjs';
import { createClient } from './client.mjs';
import { decryptSecretKey, redact } from './sign.mjs';

// 回调地址不需要能访问：浏览器跳过去后从地址栏读 tempToken（官方示例也用 baidu）
export const DEFAULT_REDIRECT = 'https://www.baidu.com';

export function empowerUrl({ appId, redirectUrl = DEFAULT_REDIRECT, state }) {
  if (!appId) throw new Error('缺少 APP ID');
  if (!/^[\w-]{1,64}$/.test(state || '')) throw new Error('state 只能用字母、数字、_ -');
  return `${AUTH_HOST}/#/empower?appid=${appId}&redirectUrl=${Buffer.from(redirectUrl, 'utf8').toString('base64')}&state=${state}`;
}

/** 从跳转后的地址里取 tempToken / state / appid；不是授权回跳的地址返回 null */
export function parseRedirect(url, { redirectUrl = DEFAULT_REDIRECT, appId } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const want = new URL(redirectUrl);
  if (u.origin !== want.origin || u.pathname !== want.pathname) return null;
  const tempToken = u.searchParams.get('tempToken');
  if (!tempToken) return null;
  const appid = u.searchParams.get('appid');
  if (appid && appid !== appId) return null;
  return { tempToken, state: u.searchParams.get('state'), appid };
}

/** 用 tempToken 换店铺密钥；返回 { openKeyId, secretKey(明文), supplierId, ... } */
export async function exchangeToken(tempToken, { appId, appSecret, host, fetchImpl, now } = {}) {
  const request = createClient({ id: appId, secret: appSecret, headerId: 'x-lt-appid', host, fetchImpl, now });
  let info;
  try {
    info = await request('/open-api/auth/get-by-token', { body: { tempToken }, sensitive: [tempToken] });
  } catch (err) {
    // 接口报错可能把临时码原样带回来：遮住再抛
    err.message = redact(err.message, [tempToken, appSecret]);
    throw err;
  }
  if (!info?.openKeyId || !info?.secretKey) throw new Error('get-by-token 没有返回 openKeyId / secretKey');
  const { secretKey, ...rest } = info;
  return { ...rest, secretKey: decryptSecretKey(secretKey, appSecret) };
}
