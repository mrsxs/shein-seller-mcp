// 开放平台请求：带签名头，返回 info；code 不是 "0" 就抛 SheinApiError（错误信息里遮住密钥）
import { DEFAULT_API_HOST } from './config.mjs';
import { isReadOnly } from './endpoints.mjs';
import { redact, signature } from './sign.mjs';

export class SheinApiError extends Error {
  constructor(message, { code, path, traceId, status } = {}) {
    super(message);
    this.code = code;
    this.path = path;
    this.traceId = traceId;
    this.status = status;
  }
}

/** 常见错误码的说明（看到原文也能懂） */
export function explain(code, msg) {
  const m = String(msg ?? '');
  if (/ip/i.test(m) && /white|白名单|not allow|不允许/i.test(m)) return `${m}：本机出口 IP 不在开放平台的 IP 白名单里，去「开发套件 › IP白名单」加上`;
  if (/sign/i.test(m) || /签名/.test(m)) return `${m}：签名不对（密钥错误或本机时间偏差超过 5 分钟）`;
  if (/expire|过期/i.test(m) && /token/i.test(m)) return `${m}：授权临时码已过期（10 分钟有效），请重新点授权链接`;
  if (/auth|授权|permission|权限/i.test(m)) return `${m}：店铺授权失效或应用没有这个接口的权限`;
  return m || `错误码 ${code}`;
}

/**
 * id/secret：店铺接口用 openKeyId + 解密后的 secretKey，headerId='x-lt-openKeyId'；换取店铺密钥用 APP id + APP Secret，headerId='x-lt-appid'
 */
// 偶发的连接被重置（实测十几次里有一两次 ECONNRESET）：只读查询重试，写操作不重试（不知道服务器有没有执行过）
const RETRY_WAITS_MS = [1000, 3000];
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ id, secret, headerId = 'x-lt-openKeyId', host = DEFAULT_API_HOST, fetchImpl = fetch, now = Date.now, timeoutMs = 30_000, language, sleep = defaultSleep } = {}) {
  if (!id || !secret) throw new Error('缺少 openKeyId / secretKey');
  // sensitive：这次请求里额外要遮的值（比如授权临时码），在截断之前遮
  return async function request(path, { method = 'POST', query, body, retry = method === 'GET', sensitive = [] } = {}) {
    if (!/^\/open-api\/[\w\-/.]+$/.test(path) || path.split('/').some((seg) => seg === '.' || seg === '..')) throw new Error(`接口路径不对：${path}`);
    // 只对只读清单里的接口重试：调用方误传 retry 也不会把写操作发两遍
    const canRetry = retry && isReadOnly(path);
    for (let attempt = 0; ; attempt++) {
      try {
        return await once(path, { method, query, body, hide: [secret, id, ...sensitive] });
      } catch (err) {
        if (!(canRetry && err.network && attempt < RETRY_WAITS_MS.length)) throw err;
        await sleep(RETRY_WAITS_MS[attempt]);
      }
    }
  };

  async function once(path, { method, query, body, hide }) {
    const timestamp = String(now());
    // 上传文件（FormData）时不写 Content-Type，让 fetch 带上 multipart 边界
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers = {
      ...(isForm ? {} : { 'Content-Type': 'application/json;charset=UTF-8' }),
      [headerId]: id,
      'x-lt-timestamp': timestamp,
      'x-lt-signature': signature({ id, secret, path, timestamp }),
      ...(language ? { language } : {}),
    };
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))}` : '';
    let res;
    try {
      res = await fetchImpl(`${host}${path}${qs}`, {
        method, headers, body: method === 'GET' || (method === 'DELETE' && body === undefined) ? undefined : isForm ? body : JSON.stringify(body ?? {}), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const why = err.name === 'TimeoutError' ? `${timeoutMs / 1000} 秒没响应` : `${err.message}${err.cause?.code ? ` (${err.cause.code})` : ''}`;
      const e = new SheinApiError(`请求 ${path} 失败：${redact(why, hide)}`, { path });
      e.network = true;
      throw e;
    }
    let text;
    try {
      text = await res.text();
    } catch (err) {
      // 读响应时断开：服务器可能已经执行了，按网络错误处理（只读接口才会重试）
      const e = new SheinApiError(`${path} 读取响应失败：${redact(err.message, hide)}`, { path, status: res.status });
      e.network = true;
      throw e;
    }
    let d;
    try {
      d = JSON.parse(text);
    } catch {
      // 先遮住密钥再截断，免得截断把密钥切成遮不住的半截
      throw new SheinApiError(`${path} 返回的不是 JSON（HTTP ${res.status}）：${redact(text, hide).slice(0, 200)}`, { path, status: res.status });
    }
    if (String(d.code) !== '0') {
      throw new SheinApiError(`${path}：${redact(explain(d.code, d.msg), hide)}`, { code: d.code, path, traceId: d.traceId ?? d.trace_id, status: res.status });
    }
    return d.info;
  };
}
