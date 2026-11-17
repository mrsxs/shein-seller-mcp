// SHEIN 开放平台签名与密钥解密（规则见 references/official-api.md）
//   签名串 = `${id}&${timestamp}&${path}`，id 是 openKeyId（店铺接口）或 APP id（换取店铺密钥时）
//   随机串 = 5 位；HMAC-SHA256(签名串, secret + 随机串) 取十六进制，再 Base64；签名 = 随机串 + Base64 结果
//   get-by-token 返回的 secretKey 是密文：AES-128-CBC，密钥 = APP Secret 前 16 字节，IV = 固定种子前 16 字节
import { createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const IV_SEED = 'space-station-default-iv';

export function signature({ id, secret, path, timestamp, randomKey = randomBytes(16).toString('hex').slice(0, 5) }) {
  if (!id || !secret || !path || !timestamp) throw new Error('签名缺少 id / secret / path / timestamp');
  if (!/^[0-9a-zA-Z]{5}$/.test(randomKey)) throw new Error('随机串应是 5 位字母数字');
  const hex = createHmac('sha256', secret + randomKey).update(`${id}&${timestamp}&${path}`).digest('hex');
  return randomKey + Buffer.from(hex, 'utf8').toString('base64');
}

const fit16 = (s) => {
  const out = Buffer.alloc(16);
  Buffer.from(s, 'utf8').copy(out, 0, 0, 16);
  return out;
};

/** 解密 get-by-token 返回的 secretKey */
export function decryptSecretKey(cipherBase64, appSecret) {
  if (!cipherBase64 || !appSecret) throw new Error('解密缺少密文或 APP Secret');
  const d = createDecipheriv('aes-128-cbc', fit16(appSecret), Buffer.from(IV_SEED, 'utf8').subarray(0, 16));
  return Buffer.concat([d.update(Buffer.from(cipherBase64, 'base64')), d.final()]).toString('utf8');
}

/** 把文本里的密钥类字符串遮住（报错、日志用） */
export function redact(text, secrets = []) {
  let s = String(text ?? '');
  for (const v of secrets) if (v && v.length >= 6) s = s.split(v).join(`${v.slice(0, 3)}***`);
  return s.replace(/(tempToken=)[^&\s"]+/gi, '$1***').replace(/("(?:secretKey|tempToken)"\s*:\s*")[^"]+/g, '$1***');
}
