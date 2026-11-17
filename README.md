# shein-seller-mcp

SHEIN seller MCP server + CLI built on the **official SHEIN Open Platform API** (no browser scraping): compliance-label / real-photo requirements, label printing (PDF), real-photo upload & binding, SKU sales, inventory, purchase orders and finance reports. Zero dependencies, Node ≥ 22.

基于 **SHEIN 开放平台官方接口** 的卖家 MCP 服务 + 命令行：合规实拍图要求、打印合规标签（PDF）、上传绑定真实实拍图、SKU 销量、库存、采购单、报账单。零依赖，Node ≥ 22。

只主动调接口，不用 Webhook，不需要公网服务器。

## 准备

1. 在 [SHEIN 开放平台](https://open.sheincorp.com) 建应用并审核通过，订阅要用的权限包（商品合规资质、采购单履约、库存同步、销量查询、账单接口等）。
2. 本机配置目录 `~/.config/shein-open/`（目录 700、文件 600；`SHEIN_OPEN_DIR` 可改）：

   ```bash
   mkdir -p ~/.config/shein-open && chmod 700 ~/.config/shein-open
   # 应用 APP ID；apiHost：全托管 / SHEIN 自营用 .cn，半托管 / 自运营用 .com
   echo '{"appId":"你的 APP ID","apiHost":"https://openapi.sheincorp.cn"}' > ~/.config/shein-open/app.json
   # APP Secret（应用详情页「查看」）
   pbpaste > ~/.config/shein-open/app-secret.txt
   chmod 600 ~/.config/shein-open/*
   ```

3. **IP 白名单**：开放平台「开发套件 › IP白名单」加上本机出口 IP。注意走代理时出口 IP 可能不是宽带 IP（`openapi.sheincorp.cn` 在国内，一般直连）。
4. **店铺授权**：店铺主账号在 Chrome 登录 SHEIN 卖家后台，Chrome 打开 `chrome://inspect/#remote-debugging` 允许远程调试，然后：

   ```bash
   npx -y shein-seller-mcp auth-watch --name 店铺名
   ```

   会在 Chrome 打开授权页，点「确认授权」后自动换取并保存店铺密钥（`stores.json`）。多家店：切换卖家后台店铺后再跑一次。
   授权以最新一次为准，**不要在多台电脑上重复授权同一家店**；其他电脑用同一份配置文件（私下传）。

## 接入 MCP 客户端

```json
{
  "mcpServers": {
    "shein-seller": { "command": "npx", "args": ["-y", "shein-seller-mcp@latest"] }
  }
}
```

Accio：设置 → MCP → 添加本地服务，命令 `npx`，参数 `-y shein-seller-mcp@latest`。

## 工具

| 工具 | 内容 |
|---|---|
| `shein_stores` | 已授权的店铺（不含密钥） |
| `shein_label_status` | 哪些 SKC 的实拍图里还缺必须体现的信息（外包装 / 商品本体、站点、审核状态、驳回原因），按缺得最多的汇总；全店分段查（`offset` / `max_skcs`，返回 `nextOffset`） |
| `shein_label_templates` | SKC 可用的标签模板（环保标、GPSR、条码合并、欧洲通用…） |
| `shein_label_materials` | 环保材料清单（打环保标用） |
| `shein_label_print` | 打印合规标签，下载 PDF 到本机（不改店铺数据） |
| `shein_photo_check` | 检查实拍图：格式、≤10MB、≤8000px、每个 SKC ≤15 张，不上传 |
| `shein_photo_bind` | 上传实拍图并绑定 SKC（**唯一会改店铺数据的工具**，要 `confirm: true`） |
| `shein_sales` | 每个 SKU 的今日 / 昨日 / 近 7 天 / 近 30 天销量 |
| `shein_stock` | 库存（PI SHEIN 仓实物 / VI 虚拟 / JI JIT）：总、可用、锁定、在途 |
| `shein_purchase_orders` | 采购单（备货单 / 急采单），≤60 天 |
| `shein_finance_reports` | 报账单：结算状态、按币种合计 |
| `shein_api_call` | 其他**只读**接口（内置只读清单；会改数据的接口一律拒绝） |

明细写到本机 JSON / PDF：`~/Documents/SHEIN数据/<店铺>/`、`~/Documents/SHEIN标签/<店铺>/`（`SHEIN_OUTPUT_DIR` 可改）。

## 实拍图

实拍图用来证明合规标签真的贴在商品 / 包装上：平台会自动识别图里的信息和图物是否一致，异步审核。

1. `shein_label_status` 找出缺信息的 SKC → 2. `shein_label_templates` + `shein_label_print` 打出标签 → 3. 贴到商品 / 外包装上，**拍真实照片** → 4. `shein_photo_check` → 5. 用户确认后 `shein_photo_bind`（`confirm: true`）→ 6. 过一阵用 `shein_label_status` 复查。

**只上传真实拍摄的照片。** 本工具不生成、不合成、不修改图片；假图会被驳回，还可能导致商品被下架。

## 命令行

同一个命令带子命令就是命令行（输出 JSON）：

```bash
npx -y shein-seller-mcp stores
npx -y shein-seller-mcp labels status --store 店铺 [--skc a,b] [--offset 0 --max-skcs 80]
npx -y shein-seller-mcp labels print --store 店铺 --skc X --type 5 --code 模板 --sku-code SKU --origin-country China --materials 6:66
npx -y shein-seller-mcp photos bind --store 店铺 --skc X --package a.jpg --apply
npx -y shein-seller-mcp data sales|stock|orders|finance --store 店铺
npx -y shein-seller-mcp call /open-api/goods/searchProduct --store 店铺 --json '{"pageNum":1,"pageSize":10}'
npx -y shein-seller-mcp --help
```

## 安全

- 密钥只在 `~/.config/shein-open/`（权限太宽会拒绝读取），不进 MCP 配置、不打印；报错里会遮住密钥、openKeyId 和授权临时码。
- 写操作只有实拍图绑定，要显式确认；上传 / 绑定不自动重试。只读接口断线自动重试 2 次。
- 命令行不认识的参数直接报错。

## 已知限制（实测）

- `skc-label-list` 一次最多 10 个 SKC；全店 200 个 SKC 约 2 分钟（MCP 里分段查）。
- `material-quality-tree-v2` 只能 GET；采购单查询至少要一个筛选条件（按更新时间）。
- 库存接口不返回没有库存记录的 SKC（输出里单独计数，不当成 0）。
- 流量、转化、广告、热搜词开放平台没有。

## 开发

```bash
npm test
```

测试不连网，用自造数据。

## License

MIT
