#!/usr/bin/env node
// shein-seller-mcp：不带参数 = MCP 服务（stdio）；带子命令 = 命令行（授权、打印标签、查数据，见 lib/cli.mjs 开头）。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI_COMMANDS, runCli } from '../lib/cli.mjs';
import { redact } from '../lib/sign.mjs';
import { startServer } from '../lib/mcp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const [cmd] = process.argv.slice(2);

if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  process.stdout.write(`shein-seller-mcp ${VERSION}
SHEIN 卖家官方接口（SHEIN 开放平台）：MCP 服务 + 命令行。

不带参数运行 = MCP 服务（stdio）。命令行：
  auth-watch --name 店铺名     在主 Chrome 打开授权页，店铺主账号点「确认授权」后自动保存密钥
  auth-url                     只打印授权链接
  stores                       已授权的店铺
  labels status|templates|materials|print   合规标签 / 实拍图要求
  photos check|bind            检查 / 上传绑定实拍图（bind 要 --apply）
  data sales|stock|orders|finance           销量、库存、采购单、报账单
  call <接口路径>              调只读接口（其他接口要 --apply）

配置（~/.config/shein-open/，目录 700、文件 600；SHEIN_OPEN_DIR 可改）：
  app.json         {"appId":"开放平台应用 APP ID","apiHost":"https://openapi.sheincorp.cn"}（或 SHEIN_APP_ID / SHEIN_API_HOST）
  app-secret.txt   APP Secret
  stores.json      授权后自动生成
结果文件：~/Documents/SHEIN数据、~/Documents/SHEIN标签（SHEIN_OUTPUT_DIR 可改）
`);
} else if (CLI_COMMANDS.includes(cmd)) {
  runCli(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${redact(err.message)}\n`);
    process.exit(1);
  });
} else if (cmd === undefined) {
  startServer(VERSION);
} else {
  process.stderr.write(`不认识的命令 ${cmd}；--help 看用法\n`);
  process.exit(1);
}
