// 连用户的主 Chrome（chrome://inspect/#remote-debugging 打开的远程调试；DevToolsActivePort 里是端口和浏览器 WebSocket 路径，没有 /json 接口），
// 用 flatten 会话挂到某个标签页上执行页面脚本。Node 22+ 自带 WebSocket，无需依赖。
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export class ChromeError extends Error {}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Chrome 默认用户目录里的 DevToolsActivePort（macOS / Windows / Linux） */
export function defaultActivePortFile(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data', 'DevToolsActivePort');
  if (platform === 'linux') return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'google-chrome', 'DevToolsActivePort');
  return join(home, 'Library/Application Support/Google/Chrome/DevToolsActivePort');
}

/** 读 DevToolsActivePort，返回浏览器级 WebSocket 地址（CHROME_DEVTOOLS_ACTIVE_PORT 可指定文件） */
export function devToolsEndpoint(file = process.env.CHROME_DEVTOOLS_ACTIVE_PORT || defaultActivePortFile()) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new ChromeError('找不到主 Chrome 的远程调试信息：在 Chrome 打开 chrome://inspect/#remote-debugging，勾选允许远程调试');
  }
  const [port, path] = text.trim().split('\n');
  if (!/^\d+$/.test(port ?? '') || !path?.startsWith('/devtools/browser/')) throw new ChromeError(`DevToolsActivePort 内容不对：${text.slice(0, 80)}`);
  return `ws://127.0.0.1:${port}${path}`;
}

/** 连浏览器。send(method, params, sessionId?, timeoutMs?)；Chrome 可能弹窗问是否允许，所以连接超时给得长 */
export function connectBrowser(wsUrl, { connectTimeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 0;
    let closed = false;
    const timer = setTimeout(() => {
      ws.close();
      reject(new ChromeError('连不上主 Chrome：如果 Chrome 弹出「允许远程调试」请点允许，然后重跑'));
    }, connectTimeoutMs);
    const failAll = (err) => {
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      pending.clear();
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const p = msg.id ? pending.get(msg.id) : null;
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new ChromeError(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    };
    ws.onclose = () => {
      closed = true;
      failAll(new ChromeError('和 Chrome 的连接断开了'));
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new ChromeError(`连不上主 Chrome（${wsUrl}）：确认 Chrome 开着且已开启远程调试`));
    };
    const send = (method, params = {}, sessionId, timeoutMs = DEFAULT_TIMEOUT_MS) =>
      new Promise((res, rej) => {
        if (closed) return rej(new ChromeError('和 Chrome 的连接断开了'));
        const id = ++nextId;
        const t = setTimeout(() => {
          pending.delete(id);
          rej(new ChromeError(`${method} 超时 (${timeoutMs}ms)`));
        }, timeoutMs);
        pending.set(id, { resolve: res, reject: rej, timer: t, method });
        ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      });
    ws.onopen = () => {
      clearTimeout(timer);
      resolve({ send, close: () => ws.close(), isOpen: () => !closed });
    };
  });
}

/** 挂到一个标签页上：evaluate / callInPage（把自包含函数序列化后在页面执行，返回值要能 JSON 序列化） */
export async function attachPage(browser, targetId) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async (expression, timeoutMs) => {
    const r = await browser.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId, timeoutMs);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new ChromeError(`页面脚本异常: ${d.exception?.description || d.text || 'unknown'}`);
    }
    return r.result?.value;
  };
  return {
    sessionId,
    evaluate,
    callInPage: (fn, arg, timeoutMs) => evaluate(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`, timeoutMs),
    detach: () => browser.send('Target.detachFromTarget', { sessionId }).catch(() => {}),
  };
}
