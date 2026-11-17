# SHEIN 开放平台官方接口清单

整理日期：2026-11-17。来源：SHEIN 开放平台文档中心（[API 文档](https://open.sheincorp.com/documents/apidoc)）的接口目录和每个接口的文档。由 `scripts/build-catalog.mjs` 生成的 `lib/catalog.json` 整理。

共 **20 个分类、238 个接口**：**读 131 个、写 107 个**。

**`shein-seller-mcp` 全部 238 个接口都能调**：`shein_api_search` 找接口 → `shein_api_doc` 看参数 → `shein_api_call` 调用。读接口直接调；写接口不带 `confirm: true` 只返回将要发送的请求（不发送），用户确认后带 `confirm: true` 才发送，且不自动重试。常用的另有专门工具（见「MCP 工具」一节）。

另有 26 种 Webhook 消息（本工具只主动调接口，不接收回调）。

## 先看这里

- **官方没有的数据**：流量 / 访客 / 曝光 / 加购等转化数据、同行对比、广告、热搜词。
- **域名按合作模式**：全托管 / SHEIN 自营 / 代运营用 `https://openapi.sheincorp.cn`；半托管、自运营（传统平台）用 `https://openapi.sheincorp.com`。测试环境 `https://openapi-test01.sheincorp.cn`。
- **适用模式**：每个接口文档标注了适用的合作模式（下表「适用模式」列），不是所有接口全托管都能用。
- **调用条件**：应用审核通过 → 订阅权限包 → 店铺主账号授权（拿到 openKeyId + secretKey）→ 出口 IP 加入白名单 → 每次请求带签名（`x-lt-openKeyId` / `x-lt-timestamp` / `x-lt-signature`）。签名和授权细节见本项目 README。
- 「读 / 写」列：**读** = 只查询（或只生成标签 / 条码 PDF），不改店铺数据；**写** = 会改店铺或平台数据（发品、改价、改库存、上下架、发货、报活动、退货、上传、删除、回调上报…），调用前必须让用户确认。
- 应用要先在开放平台订阅接口所在的权限包，没订阅的调用会报没有权限。「MCP 工具」列：有专门工具的写专门工具名，其余都用通用的 `shein_api_call`。

## 分类总览

| 分类 | 接口数 | 读 | 写 | 主要内容 |
|---|---|---|---|---|
| [密钥](#密钥) | 1 | 0 | 1 | 授权换密钥 |
| [商品](#商品) | 43 | 28 | 15 | 发品、编辑、商品查询、分类属性、图片、额度 |
| [价格](#价格) | 10 | 5 | 5 | 售价、供货价、建议零售价 |
| [合规](#合规) | 18 | 11 | 7 | 资质证书、代理公司（欧代等）、警告语、实拍图 / 合规标签 |
| [Feed](#Feed) | 6 | 2 | 4 | 批量任务（Feed） |
| [客单](#客单) | 18 | 6 | 12 | 消费者订单（自运营 / 半托管） |
| [退货退款](#退货退款) | 5 | 4 | 1 | 消费者退货退款 |
| [采购单](#采购单) | 20 | 14 | 6 | 备货单 / 急采单、发货单、面单、仓库 |
| [采购单退货](#采购单退货) | 13 | 10 | 3 | 采购退货 / 报废 |
| [库存和销量](#库存和销量) | 6 | 3 | 3 | 库存查询 / 同步、SKU 销量 |
| [营销活动报名](#营销活动报名) | 6 | 4 | 2 | 活动列表、报名、取消 |
| [财务](#财务) | 6 | 6 | 0 | 报账单、收支明细 |
| [店铺](#店铺) | 3 | 3 | 0 | 店铺信息、站点 |
| [定制商品](#定制商品) | 5 | 4 | 1 | 定制信息、生产模板 |
| [认证仓](#认证仓) | 4 | 0 | 4 | 认证仓 |
| [物流](#物流) | 11 | 1 | 10 | 物流 / 运单 |
| [MES](#MES) | 25 | 18 | 7 | 生产执行（工厂） |
| [排产](#排产) | 10 | 5 | 5 | 排产（工厂） |
| [面料](#面料) | 6 | 0 | 6 | 面料（工厂） |
| [MDP印染](#MDP印染) | 22 | 7 | 15 | 印染（工厂） |

## MCP 工具

| MCP 工具 | 用到的官方接口 |
|---|---|
| `shein_api_search` | 在全部接口里按关键词 / 分类 / 读写筛选 |
| `shein_api_doc` | 实时读某个接口的官方文档（参数、返回字段） |
| `shein_label_status` | `/open-api/goods-compliance/skc-label-list`<br>`/open-api/openapi-business-backend/product/query` |
| `shein_sales` | `/open-api/openapi-business-backend/product/query`<br>`/open-api/goods/query-sku-sales` |
| `shein_stock` | `/open-api/openapi-business-backend/product/query`<br>`/open-api/stock/stock-query` |
| `shein_label_templates` | `/open-api/goods-compliance/get-label-template` |
| `shein_label_materials` | `/open-api/goods-quality/environmental-label-rule/material-quality-tree-v2` |
| `shein_label_print` | `/open-api/goods-compliance/label-print` |
| `shein_photo_bind` | `/open-api/goods-compliance/upload-skc-label-picture`<br>`/open-api/goods-compliance/skc-save-label` |
| `shein_purchase_orders` | `/open-api/order/purchase-order-infos` |
| `shein_finance_reports` | `/open-api/finance/report-list` |
| `shein_stores` | `/open-api/openapi-business-backend/query-store-info` |
| `auth-watch` | `/open-api/auth/get-by-token` |
| `shein_api_call` | 全部接口（读直接调；写要 confirm） |

## 密钥

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [获取openKeyId和secretKey](https://open.sheincorp.com/documents/apidoc/detail/3001520) | **写** | POST | `/open-api/auth/get-by-token` | 自运营、全托管、SHEIN自营、半托管、POP | `auth-watch` | 该API支持用tempToken交换openKeyId和secretKey，对接之前请查阅 店铺授权开发者应用手册 了解更全面的信息 |

## 商品

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [商品发布/编辑](https://open.sheincorp.com/documents/apidoc/detail/3002086) | **写** | POST | `/open-api/goods/product/publishOrEdit` | 自运营、全托管、半托管 | `shein_api_call` | 接口支持场景： 新发布商品（SPU）、更新已发布的商品信息、在已发布商品下新增SKC/SKU 各场景的对接指南： 不同应用模式、不同场景中此接口的使用方式有较大… |
| [商品部分编辑](https://open.sheincorp.com/documents/apidoc/detail/3002087) | **写** | POST | `/open-api/goods/product/partialEdit` | 自运营、全托管、半托管 | `shein_api_call` | 此接口用于编辑已审核通过的商品，支持简化入参实现编辑，提交后商品需要接受平台审核 支持的场景 （以下场景可在一次请求中叠加出现）： 1、编辑商品的信息：修改A信… |
| [确认店铺是否可发品](https://open.sheincorp.com/documents/apidoc/detail/3001589) | 读 | GET | `/open-api/goods/product/check-publish-permission` | 自运营、全托管、半托管 | `shein_api_call` | 发布商品前调用接口 ，确认商家店铺是否有发布商品资格。店铺会因为多种原因导致无法发品，大多需要商家前往商家后台处理，此接口覆盖以下原因： 1、店铺已关闭。即无法… |
| [确认商品是否可编辑](https://open.sheincorp.com/documents/apidoc/detail/3001380) | 读 | POST | `/open-api/goods/product/check-edit-permission` | 自运营、全托管、半托管 | `shein_api_call` | 编辑商品前请调用接口确认商品是否可编辑，可编辑的商品需要满足以下条件： 1、商品已首次发布且通过平台审核。（首次发布的SPU下有多个SKC，只要有1个SKC审核… |
| [查询商品审核状态](https://open.sheincorp.com/documents/apidoc/detail/3002088) | 读 | POST | `/open-api/goods/query-document-state` | 自运营、全托管、半托管、POP | `shein_api_call` | 支持通过spu查询skc的审核状态，支持查询spu指定版本的审核状态；同时，平台也支持webhook消息通知的方式推送商品审核结果，具体可查看 商品公文审核通知 |
| [撤回商品审核](https://open.sheincorp.com/documents/apidoc/detail/3001896) | **写** | POST | `/open-api/goods/revoke-product` | 自运营、全托管、半托管 | `shein_api_call` | 该接口支持根据spu撤回在审核中的商品，审核通过的商品无法撤回。 |
| [商品综合查询](https://open.sheincorp.com/documents/apidoc/detail/3001938) | 读 | POST | `/open-api/goods/searchProduct` | 自运营、全托管、半托管、POP | `shein_api_call` | 商品列表接口，支持使用各种条件综合查询，查询结果按SPU维度提供，每个SPU下会提供商品的关键信息。 支持的条件：平台编码、商家维护货号、上架状态、类目、发布时… |
| [商品列表接口](https://open.sheincorp.com/documents/apidoc/detail/3001239) | 读 | POST | `/open-api/openapi-business-backend/product/query` | 自运营、全托管、半托管、POP | `shein_label_status / shein_sales / shein_stock` | 该API支持查询已发布成功的商品列表数据，接口一次最多返回50000条数据。如果商家发布的商品数量超过50000条，请增加时间范围进行查询。 |
| [商品上下架](https://open.sheincorp.com/documents/apidoc/detail/3002089) | **写** | POST | `/open-api/goods/modify-skc-shelf` | 自运营、半托管、POP | `shein_api_call` | 该API支持根据SKC维度修改商品上下架状态 |
| [spu商品详情查询](https://open.sheincorp.com/documents/apidoc/detail/3002090) | 读 | POST | `/open-api/goods/spu-info` | 自运营、全托管、半托管、POP | `shein_api_call` | 支持通过SPU查询商品信息。 只有发布且已通过平台审核的SPU才能查到信息。 可查信息：SPU/SKC/SKU维度品牌、名称、图片、属性、上架状态、价格、样品信… |
| [sku商品详情查询（即将作废）](https://open.sheincorp.com/documents/apidoc/detail/3001085) | 读 | POST | `/open-api/openapi-business-backend/product/full-detail` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持通过skucode查询sku详细信息，该接口目前暂停维护，请对接 spu商品详情查询(新) 接口，如需查询库存，请对接 库存查询接口 。 |
| [商品发布字段规范](https://open.sheincorp.com/documents/apidoc/detail/3002091) | 读 | POST | `/open-api/goods/query-publish-fill-in-standard` | 自运营、全托管、半托管 | `shein_api_call` | 每个店铺在各个分类下有不同的商品发布字段填写规范（要求）。建议在调用商品发布接口前，先调用此接口。本接口可查询的要求范围包括： 1、商品标题和商品描述的必填默认… |
| [店铺查商品末级分类](https://open.sheincorp.com/documents/apidoc/detail/3002092) | 读 | POST | `/open-api/goods/query-category-tree` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持查询店铺的商品末级分类信息，不同店铺，分类会有差异。 |
| [图文识别推荐类目](https://open.sheincorp.com/documents/apidoc/detail/3001363) | 读 | POST | `/open-api/goods/image-category-suggestion` | 自运营、全托管、半托管 | `shein_api_call` | 支持通过商品图片或商品文本描述获取推荐类目， 仅返回当前商家可用类目范围内的推荐类目。 可实现3种入参组合：仅图片、仅文本、图片+文本。 |
| [查询分类可用属性](https://open.sheincorp.com/documents/apidoc/detail/3002095) | 读 | POST | `/open-api/goods/query-attribute-template` | 自运营、全托管、半托管 | `shein_api_call` | 支持查询店铺可用属性。平台内不同店铺在各个类目下可用的属性不同，因此建议按店铺维度更新数据。同时因平台规则可能会变更，如增加销售属性，修改属性是否必填等，建议一… |
| [查询是否支持自定义属性值](https://open.sheincorp.com/documents/apidoc/detail/3001369) | 读 | POST | `/open-api/goods/get-custom-attribute-permission-config` | 自运营、全托管、SHEIN自营、半托管 | `shein_api_call` | 查询某个分类是否可以自定义销售属性的属性值。 注意：并非所有商家、所有分类都可以自定义属性值。 创建自定义属性值之前一定要先查询此接口确定X商家的Y分类可自定义… |
| [添加自定义属性值](https://open.sheincorp.com/documents/apidoc/detail/3001483) | **写** | POST | `/open-api/goods/add-custom-attribute-value` | — | `shein_api_call` | 2025年12月1日前创建的应用可使用此接口，先确认属性是否支持添加自定义属性值（通过 接口 确认），则可通过此接口添加自定义属性值。同时也可迁移使用新方案： … |
| [查询关联属性填写规则](https://open.sheincorp.com/documents/apidoc/detail/3001680) | 读 | POST | `/open-api/goods/get-associated-attribute-rules` | 自运营、全托管、半托管 | `shein_api_call` | 发布或编辑商品时，某个商品属性（attribute_type=3/4）或尺码属性（attribute_type=2）是否必填有两层规则：基础规则、关联规则。 基… |
| [查询店铺站点和币种信息（新）](https://open.sheincorp.com/documents/apidoc/detail/3001249) | 读 | POST | `/open-api/goods/query-site-list` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持查询店铺售卖的站点和币种信息 |
| [查询店铺站点和站点币种（旧）](https://open.sheincorp.com/documents/apidoc/detail/3001254) | 读 | POST | `/open-api/openapi-business-backend/site/query` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持查询店铺售卖的站点和币种信息，后续不在更新维护，建议对接 查询店铺站点和币种信息（新） |
| [查询可用品牌列表](https://open.sheincorp.com/documents/apidoc/detail/3001900) | 读 | POST | `/open-api/goods/query-brand-list` | 自运营、全托管、半托管 | `shein_api_call` | 该API支持查询店铺可用的品牌信息，店铺品牌会变动，请定期更新。 |
| [查询可用IP列表](https://open.sheincorp.com/documents/apidoc/detail/3001901) | 读 | POST | `/open-api/goods/query-ip-list` | 自运营、全托管、半托管 | `shein_api_call` | 获取店铺可用的IP数据。此接口的数据可使用在商品发布接口的入参"ip_character_list"。 IP指米老鼠这里IP形象，当商品涉及IP（例如联名款）时… |
| [图片链接转换](https://open.sheincorp.com/documents/apidoc/detail/3001360) | **写** | POST | `/open-api/goods/transform-pic` | 自运营、全托管、半托管 | `shein_api_call` | 支持将外部的图片地址转换成SHEIN可用的图片地址， 各类型图片需满足下方要求，否则无法转换，建议开发者将图片在本地处理完成后再调用接口 。 - 主图（type… |
| [本地图片上传](https://open.sheincorp.com/documents/apidoc/detail/3001359) | **写** | POST | `/open-api/goods/upload-pic` | 自运营、全托管、半托管 | `shein_api_call` | 支持将图片文件转换成SHEIN可用的在线图片链接。 各类型图片需满足下方要求，否则无法转换，建议开发者将图片在本地处理完成后再调用接口 。 - 主图（type=… |
| [创建商品视频转换任务](https://open.sheincorp.com/documents/apidoc/detail/3002020) | **写** | POST | `/open-api/goods/product/create-video-transform-task` | 自运营、全托管、半托管 | `shein_api_call` | 商品视频的调用顺序：① 查询规范确认分类下能否发布视频 → ② 创建视频转换任务 → ③ 监听任务完成通知 → ④ 查询任务获取转换后URL →⑤ 使用转换后U… |
| [获取视频转换结果](https://open.sheincorp.com/documents/apidoc/detail/3002021) | 读 | POST | `/open-api/goods/product/query-video-transform-task` | 自运营、全托管、半托管 | `shein_api_call` | 商品视频的调用顺序：① 查询规范确认分类下能否发布视频 → ② 创建视频转换任务 → ③ 监听任务完成通知 → ④ 查询任务获取转换后URL →⑤ 使用转换后U… |
| [查询商家发品额度](https://open.sheincorp.com/documents/apidoc/detail/3002025) | 读 | POST | `/open-api/goods-publish-quotas/detail` | 自运营、全托管、半托管 | `shein_api_call` | 商家能否发品的条件之一：发品额度，每个商家每个月会定时更新额度。发品额度指：当前周期内可 累计的发布且审核成功的SKC总数量 。只要SKC审核通过，即使下架或删… |
| [获取店铺上架额度](https://open.sheincorp.com/documents/apidoc/detail/3001931) | 读 | POST | `/open-api/goods/query-shelf-quota` | 自运营、半托管、POP | `shein_api_call` | 平台对店铺可上架的商品SKC数量有管控，请在调用 商品上架接口 之前先查询店铺可上架额度，有额度时再操作上架。 仅自运营、半托管模式的商家会被管控上架额度。 |
| [查询商家sku是否已存在](https://open.sheincorp.com/documents/apidoc/detail/3001437) | 读 | POST | `/open-api/goods/product/check-supplierSku-repeated` | 自运营、全托管、半托管 | `shein_api_call` | 平台要求商品的商家sku（即发布接口中的supplier_sku）在店铺内全局唯一。 建议在发布商品前调用，查询本次输入的商家sku是否在店内已存在（包括已发布… |
| [商品删除预校验](https://open.sheincorp.com/documents/apidoc/detail/3001904) | **写** | POST | `/open-api/goods/check-deletable` | 自运营、全托管、半托管 | `shein_api_call` | 商品删除操作是SKC维度，SKC需要满足以下所有条件时才能被删除。以下的1、2、3三点可通过此接口校验知晓。4、5需要提交删除申请后以审核结果为准。 1、商家允… |
| [提交商品删除申请](https://open.sheincorp.com/documents/apidoc/detail/3001905) | **写** | DELETE | `/open-api/goods/delete/{skcName}` | — | `shein_api_call` | 商品删除是SKC颗粒度，只有满足条件的SKC才可删除，删除前请先通过接口确认：/open-api/goods/check-deletable。 此接口为提交删除… |
| [查询商品删除审核记录](https://open.sheincorp.com/documents/apidoc/detail/3001906) | 读 | POST | `/open-api/goods-delete-logs/search` | 自运营、全托管、半托管 | `shein_api_call` | 可查询近一年内，商家发起的商品删除的申请审核记录（平台发起的删除不在此范围内，平台会定期对长期无动销的商品进行删除） 入参查询status_list=2（审核成… |
| [查询是否可修改销售属性](https://open.sheincorp.com/documents/apidoc/detail/3002076) | 读 | POST | `/open-api/goods-specs/check-modify-permission` | 自运营、全托管、半托管 | `shein_api_call` | 商品发起修改销售属性，需要满足以下所有条件，可通过此接口判断商品是否满足要求。修改销售属性的整体解决方案， 请点击查看文档。 1、非成衣、鞋类、胚衣/定制类商品… |
| [提交修改销售属性](https://open.sheincorp.com/documents/apidoc/detail/3002077) | **写** | POST | `/open-api/goods-specs/update` | 自运营、全托管、半托管 | `shein_api_call` | 修改销售属性的表单构建较为复杂，请参考详细的解决方案， 点击查看 。 |
| [查询修改销售属性审核记录](https://open.sheincorp.com/documents/apidoc/detail/3002078) | 读 | POST | `/open-api/goods-specs/modify-logs/search` | 自运营、全托管、半托管 | `shein_api_call` | 提交销售属性修改后，有独立的审核流程，审核通过后才能用新的销售属性数据进行编辑或复色加码。此接口可查询商品的审核记录详情。修改销售属性的整体解决方案， 请点击查… |
| [查询商品证书要求和审核状态](https://open.sheincorp.com/documents/apidoc/detail/3001859) | 读 | POST | `/open-api/goods/get-certificate-rule` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持查询证书要求及证书信息。 2026年7月开放平台已推出资质证书新接口，建议对接新接口， 详细方案请参考文档。 |
| [查询证书所需上传资料（新）](https://open.sheincorp.com/documents/apidoc/detail/3001860) | 读 | POST | `/open-api/goods/certificate/get-all-certificate-type-list-v2` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持查询全量证书所需的资料，用于让开发者了解上传证书所需要填写的信息，比如：检测机构、电池型号、产品型号、证书编号、证书生效时间、证书失效时间等信息。 … |
| [上传证书文件](https://open.sheincorp.com/documents/apidoc/detail/3001861) | **写** | POST | `/open-api/goods/upload-certificate-file` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持将本地文件转成SHEIN要求的在线URL。 2026年7月开放平台已推出资质证书新接口，建议对接新接口， 详细方案请参考文档。 |
| [商品证书池创建/编辑](https://open.sheincorp.com/documents/apidoc/detail/3001862) | **写** | POST | `/open-api/goods/save-or-update-certificate-pool` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持创建或编辑商品证书池。当 certificateDimension=1 ，说明该类型的证书需要绑定SKC，因此需要创建商品证书池。另外在创建商品证书… |
| [店铺证书池创建/编辑](https://open.sheincorp.com/documents/apidoc/detail/3001863) | **写** | POST | `/open-api/goods/save-or-update-supplier-certificate` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持创建或编辑店铺证书池。当 certificateDimension=2 时，说明该类型的证书为店铺维度的证书，不需要绑定SKC商品。因此，在创建店铺… |
| [SKC绑定商品证书池](https://open.sheincorp.com/documents/apidoc/detail/3001864) | **写** | POST | `/open-api/goods/save-certificate-pool-skc-bind` | 自运营、全托管、半托管、POP | `shein_api_call` | 该API支持商品证书池与商品绑定（SKC维度）。当 certificateDimension=1 ，说明该类型的证书需要绑定SKC，因此在创建商品证书池后，需要… |
| [商品接口-根据条码批量获取SKC与尺码](https://open.sheincorp.com/documents/apidoc/detail/3001485) | 读 | POST | `/open-api/goods/batch-skc-size` | 全托管、SHEIN自营 | `shein_api_call` | 该API支持根据商家的条码批量获取SHEIN的 (skc和尺码) |
| [商品接口-全量查询SKC/SKU/设计款号关系列表](https://open.sheincorp.com/documents/apidoc/detail/3001486) | 读 | GET | `/open-api/goods/number-list` | 全托管、SHEIN自营 | `shein_api_call` | 该API支持查询skc/设计款号等编码信息 |

## 价格

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [更新商品售价](https://open.sheincorp.com/documents/apidoc/detail/3002100) | **写** | POST | `/open-api/openapi-business-backend/product/price/save` | 自运营 | `shein_api_call` | 该API支持更新商品的售价信息，调整价格会有价格审核机制，需要重点关注返回参数中的status，只有修改成功之后才能再次发起修改价格，如果返回参数status=… |
| [更新成本价](https://open.sheincorp.com/documents/apidoc/detail/3001941) | **写** | POST | `/open-api/goods/update-cost` | 全托管、半托管 | `shein_api_call` | 该API支持更新商品成本价（也称供货价）信息。 |
| [获取成本价涨价原因枚举值](https://open.sheincorp.com/documents/apidoc/detail/3001885) | 读 | POST | `/open-api/goods/query-change-price-reason` | 全托管、半托管 | `shein_api_call` | 此接口获取到的枚举值，可用在更新成本价接口（/open-api/goods/update-cost）的涨价原因change_price_reason_flag |
| [价格证明材料上传](https://open.sheincorp.com/documents/apidoc/detail/3001886) | **写** | POST | `/open-api/goods/discuss/upload-discuss-file` | 自运营、全托管、半托管 | `shein_api_call` | 上传议价单、更新成本价、SKU建议零售价中需要使用的文件。 |
| [查询商品建议零售价](https://open.sheincorp.com/documents/apidoc/detail/3001893) | 读 | POST | `/open-api/goods-recommend-retail-price/search` | 自运营、全托管、半托管 | `shein_api_call` | 查询商品当前的建议零售价详情。 注意：更新建议零售价前，请一定要查询商品当前建议零售价信息，因为更新是全量覆盖逻辑，提交时必须提供所有想要的信息，原数据会清空，… |
| [查询建议零售价填写规则](https://open.sheincorp.com/documents/apidoc/detail/3002033) | 读 | POST | `/open-api/goods/query-recommend-retail-price-rule` | 自运营、全托管、半托管 | `shein_api_call` | 商品建议零售价填写规则（SKU维度），使用前请查看说明文档： https://open.sheincorp.com/documents/system/bf5a5… |
| [提交建议零售价](https://open.sheincorp.com/documents/apidoc/detail/3001895) | **写** | POST | `/open-api/goods-recommend-retail-price/batch-save` | 自运营、全托管、半托管 | `shein_api_call` | 支持新增/更新商品的建议零售价，建议零售价发起新增/更新后，会进入审核流程。 注意：更新建议零售价是 全量覆盖 逻辑，请在提交时务必传入所有需要的信息，可以在更… |
| [查询建议零售价审核记录](https://open.sheincorp.com/documents/apidoc/detail/3001890) | 读 | POST | `/open-api/goods-recommend-retail-price-audit/search` | 自运营、全托管、半托管 | `shein_api_call` | 建议零售价的审核记录明细。 |
| [获取议价单列表](https://open.sheincorp.com/documents/apidoc/detail/3001891) | 读 | POST | `/open-api/goods/discuss/query-discuss-list` | 全托管、半托管 | `shein_api_call` | 支持获取商品成本价的议价单列表。 目前仅支持3种议价类型：新品议价、老品议价、新品核价复议 |
| [处理议价单](https://open.sheincorp.com/documents/apidoc/detail/3001892) | **写** | POST | `/open-api/goods/discuss/process-discuss` | 全托管、半托管 | `shein_api_call` | 只有议价单状态discussStatus=1（待商家确认）的议价单，才可以使用此接口调用处理。 议价单的处理操作有3项。 1、同意平台建议价：同意后，商品价格会… |

## 合规

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [查询SKC的合规信息要求](https://open.sheincorp.com/documents/apidoc/detail/3001849) | 读 | POST | `/open-api/goods-compliance-requirements/list` | 自运营、全托管、半托管、POP | `shein_api_call` | 可查询平台对SKC的合规信息绑定要求（包括资质证书、代理公司、警告语、合规法案、卖点、说明书），出参数据可对应商家后台的商品合规管理列表。 合规信息完整解决方案… |
| [查询资质证书列表](https://open.sheincorp.com/documents/apidoc/detail/3001907) | 读 | POST | `/open-api/goods-certificates/search` | 自运营、全托管、半托管、POP | `shein_api_call` | 获取店铺内已经创建好的资质证书列表（对应商家后台-合规-商品合规管理-证书库tab列表）。 完整的资质证书场景接口调用方式， 详见文档 |
| [查询资质证书填写规则](https://open.sheincorp.com/documents/apidoc/detail/3002037) | 读 | POST | `/open-api/goods-certificate-schemas/detail` | 自运营、全托管、半托管、POP | `shein_api_call` | 获取资质证书的填写规则，仅支持获取 complianceGroupCode= ZSZZL的规则，其他合规信息的填写规则请通过其他接口获取。 完整的资质证书接口调… |
| [上传资质证书文件](https://open.sheincorp.com/documents/apidoc/detail/3001852) | **写** | POST | `/open-api/goods-certificate-files/upload` | 自运营、全托管、半托管、POP | `shein_api_call` | 可将本地文件转换为SHEIN的文件链接，用于创建/更新资质证书中的文件内容。 完整的资质证书调用方案 ，详见文档 |
| [创建/编辑资质证书](https://open.sheincorp.com/documents/apidoc/detail/3001908) | **写** | POST | `/open-api/goods-certificates/save` | 自运营、全托管、半托管、POP | `shein_api_call` | 可创建和编辑资质证书。操作前请先查询证书的填写规则（/open-api/goods-certificate-schemas/detail），基于规则再操作。 完… |
| [SKC绑定资质证书](https://open.sheincorp.com/documents/apidoc/detail/3001854) | **写** | POST | `/open-api/goods-certificates/bind` | 自运营、全托管、半托管、POP | `shein_api_call` | 商品绑定资质证书。资质证书接口完整方案， 详见文档。 |
| [查询代理公司列表](https://open.sheincorp.com/documents/apidoc/detail/3001848) | 读 | POST | `/open-api/goods-compliance/agency-list` | 自运营、全托管、半托管、POP | `shein_api_call` | 查询商家申报的代理公司信息，包括欧盟责任人、制造商、美国代理、英国代理，此接口的返回信息在SKC绑定代理公司时会使用。 代理公司的整体解决方案， 可点击查看文档… |
| [绑定SKC和代理公司](https://open.sheincorp.com/documents/apidoc/detail/3001172) | **写** | POST | `/open-api/goods-compliance/save-skc-agency` | 自运营、全托管、半托管、POP | `shein_api_call` | 按要平台合规要求，绑定SKC和代理公司。 代理公司的整体解决方案， 可点击查看文档。 |
| [查询SKC的代理公司绑定要求](https://open.sheincorp.com/documents/apidoc/detail/3001855) | 读 | POST | `/open-api/goods-compliance/skc-agency-detail` | 自运营、全托管、半托管、POP | `shein_api_call` | 查询哪些SKC需要绑定哪些类型的代理公司，以及当前的绑定状态（此接口已有新接口承接，建议优先对接新接口： /open-api/goods-compliance-… |
| [查询警告语证书的填写规则](https://open.sheincorp.com/documents/apidoc/detail/3001857) | 读 | POST | `/open-api/goods-compliance/query-warning-certificate-rules` | 自运营、全托管、半托管、POP | `shein_api_call` | 此接口可获取所有需商家手动操作的警告语证书填写规则。详细信息 可参考解决方案。 |
| [更新SKC的警告语](https://open.sheincorp.com/documents/apidoc/detail/3001858) | **写** | POST | `/open-api/goods-compliance/update-skc-warning-certificate` | 自运营、全托管、半托管、POP | `shein_api_call` | 创建/更新某个SKC的警告书证书。 详细的入参方式可参考解决方案 |
| [查询SKC的警告语绑定状态](https://open.sheincorp.com/documents/apidoc/detail/3001856) | 读 | POST | `/open-api/goods-compliance/query-skc-warning-status` | 自运营、全托管、半托管、POP | `shein_api_call` | 查询SKC的警告语证书绑定要求和状态，（此接口已有新接口承接，建议优先对接新接口： /open-api/goods-compliance-requirement… |
| [查询SKC的实拍图要求](https://open.sheincorp.com/documents/apidoc/detail/3001394) | 读 | POST | `/open-api/goods-compliance/skc-label-list` | 自运营、全托管、半托管、POP | `shein_label_status` | 查询哪些SKC需要上传实拍图，以及实拍图内需要体现哪些信息元素。 实拍图场景的整体解决方案， 可点击查看文档。 |
| [查询SKC可用的标签模板](https://open.sheincorp.com/documents/apidoc/detail/3001373) | 读 | POST | `/open-api/goods-compliance/get-label-template` | 自运营、全托管、半托管、POP | `shein_label_templates` | 平台基于各国家地区的要求，提前预设了多个标签模板，例如GPSR标签模板。系统会为每个skc推荐可用的标签模板，建议商家使用平台的标签模板打印。 点击此处查看商家… |
| [获取全量环保耗材信息](https://open.sheincorp.com/documents/apidoc/detail/3001902) | 读 | GET | `/open-api/goods-quality/environmental-label-rule/material-quality-tree-v2` | 自运营、全托管、半托管 | `shein_label_materials` | 商品若要打印环保标，需先通过此接口获取平台支持的环保材料信息。 环保材料信息共有两层，材料类型 -> 具体材料。 |
| [打印合规标签](https://open.sheincorp.com/documents/apidoc/detail/3001385) | 读 | POST | `/open-api/goods-compliance/label-print` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_label_print` | 此接口支持打印商品相关的标签，标签中会包含多种信息，包括：环保标、GPSR、制造商、商品条码。 打印标签前，请先通过接口/open-api/goods-comp… |
| [上传实拍图图片](https://open.sheincorp.com/documents/apidoc/detail/3001176) | **写** | POST | `/open-api/goods-compliance/upload-skc-label-picture` | 自运营、全托管、半托管、POP | `shein_photo_bind` | SKC绑定实拍图时需要使用图片URL，请使用此接口上传本地图片获取URL。 实拍图场景整体解决方案， 可点击查看文档。 |
| [绑定SKC和实拍图](https://open.sheincorp.com/documents/apidoc/detail/3001399) | **写** | POST | `/open-api/goods-compliance/skc-save-label` | 自运营、全托管、半托管、POP | `shein_photo_bind` | 绑定SKC和实拍图，若实拍图信息符合要求，则绑定成功。 实拍图场景整体解决方案， 可点击查看文档。 |

## Feed

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [创建Feed文件](https://open.sheincorp.com/documents/apidoc/detail/3001229) | **写** | POST | `/open-api/sem/feed/createFeedDocument` | 自运营 | `shein_api_call` | 通过调用接口，创建SHEIN平台可访问的文档，接口会返回feedDocumentid值和用于上传feed内容的接口URL。 |
| [查询Feed文件](https://open.sheincorp.com/documents/apidoc/detail/3001226) | 读 | GET | `/open-api/sem/feed/getFeedDocument` | 自运营 | `shein_api_call` | url是1小时有效，如超时请重新调用接口获取 |
| [上传Feed文件](https://open.sheincorp.com/documents/apidoc/detail/3001227) | **写** | POST | `/open-api/sem/feed/uploadDocumentContent` | 自运营 | `shein_api_call` | 上传JSON内容到SHEIN平台 |
| [创建Feed任务](https://open.sheincorp.com/documents/apidoc/detail/3001230) | **写** | POST | `/open-api/sem/feed/createFeed` | 自运营 | `shein_api_call` |  |
| [查看Feed任务](https://open.sheincorp.com/documents/apidoc/detail/3001234) | 读 | GET | `/open-api/sem/feed/getFeed` | 自运营 | `shein_api_call` |  |
| [取消Feed任务](https://open.sheincorp.com/documents/apidoc/detail/3001233) | **写** | POST | `/open-api/sem/feed/cancelFeed` | 自运营 | `shein_api_call` | 仅排队中（IN_QUEUE）状态的Feed任务可以取消 |

## 客单

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [请求订单列表](https://open.sheincorp.com/documents/apidoc/detail/3001921) | 读 | POST | `/open-api/order/order-list` | 自运营、半托管 | `shein_api_call` | 通过该接口获取订单列表；该接口适用自主运营，半托管的应用；也可以使用webhook中的 订单同步通知 感知最新的订单信息； 支持通过订单的创建时间和更新时间查询… |
| [请求订单详情](https://open.sheincorp.com/documents/apidoc/detail/3002094) | 读 | POST | `/open-api/order/order-detail` | 自运营、半托管 | `shein_api_call` | 通过该接口获取自主运营、半托管商家的订单详情；接口中返回的时间均为北京时间（UTC+8）； 如何对接订单请查看 ERP订单履约方案 ； |
| [导出地址接口](https://open.sheincorp.com/documents/apidoc/detail/3001924) | **写** | POST | `/open-api/order/export-address` | 自运营、半托管 | `shein_api_call` | 该API支持自主运营，半托管商家导出收件人地址信息以及流转订单状态； 对接前请查看解决方案： ERP订单履约方案； |
| [商家维度查渠道信息](https://open.sheincorp.com/documents/apidoc/detail/3001916) | 读 | POST | `/open-api/order/express-channel` | 自运营、半托管 | `shein_api_call` | 该API支持自主运营，半托管卖家查询自履约场景下可用的物流信息； 对接前请查看解决方案： ERP订单履约方案； 注意：接口返回的是商家维度的可用物流渠道，并不是… |
| [批量上传运单号](https://open.sheincorp.com/documents/apidoc/detail/3001274) | **写** | POST | `/open-api/order/import-batch-multiple-express` | 自运营、半托管 | `shein_api_call` | 通过该接口上传自主运营、半托管商家自履约场景的订单物流信息； 如何对接订单请查看 ERP订单履约方案 ； 注意：上传运单号不代表“已发货”，SHEIN跟各大物流… |
| [查询仓库地址](https://open.sheincorp.com/documents/apidoc/detail/3001786) | 读 | POST | `/open-api/gsp/warehouse-address` | 自运营、半托管 | `shein_api_call` | 通过接口获取仓库地址信息用于在线下单业务； |
| [查询订单可用发货仓库](https://open.sheincorp.com/documents/apidoc/detail/3001815) | **写** | POST | `/open-api/gsp/available-shipping-warehouse` | 自运营、半托管 | `shein_api_call` | 提供接口查在线下单业务的订单维度数据的可用发货仓库； 请查阅 仓库常见不可用原因以及解决方案 了解更全面的信息 |
| [查询订单可用物流信息](https://open.sheincorp.com/documents/apidoc/detail/3002052) | 读 | POST | `/open-api/gsp/order-mapping-channels` | 自运营、半托管 | `shein_api_call` | 提供接口查在线下单业务的订单维度数据的可用物流渠道； |
| [在线下单](https://open.sheincorp.com/documents/apidoc/detail/3001918) | **写** | POST | `/open-api/gsp/place-express-order` | 自运营、半托管 | `shein_api_call` | 在线下单指SHEIN商家指定平台合作物流进行订单履约；目前该功能仅支持美国、欧洲、中东的自运营或半托管商家 注意：不是所有店铺可用的物流渠道都支持在线下单，需要… |
| [查询下单结果](https://open.sheincorp.com/documents/apidoc/detail/3002053) | **写** | POST | `/open-api/gsp/check-express-order` | 自运营、半托管 | `shein_api_call` | 查询在线下单业务的物流渠道下单结果 |
| [切换导出地址发货](https://open.sheincorp.com/documents/apidoc/detail/3001922) | **写** | POST | `/open-api/gsp/switch-self-shipping` | 自运营、半托管 | `shein_api_call` | 仅在商家通过SHEIN合作物流在线下单后可使用该接口，用于切换为商家自履约模式（商家自行联系物流商发货）。仅支持美国和欧洲订单。 如何判断订单是否可调用 ： 通… |
| [回传发票信息](https://open.sheincorp.com/documents/apidoc/detail/3001923) | **写** | POST | `/open-api/order/sync-invoice-info` | 自运营 | `shein_api_call` | 该接口用于巴西市场商家同步订单发票信息到SHEIN平台。发票上传成功后，平台将自动开具CTE发票，开票状态通过Webhook: /invoice_status_… |
| [打印面单接口](https://open.sheincorp.com/documents/apidoc/detail/3001925) | **写** | POST | `/open-api/order/print-express-info` | 自运营、半托管 | `shein_api_call` | 使用SHEIN合作物流履约时，开发者可调用该接口打印面单。 面单URL有效期为1小时 ，请及时下载保存；QPS不超过20。 如何判断是否可以打印面单？ 调用订单… |
| [预约取件](https://open.sheincorp.com/documents/apidoc/detail/3002081) | **写** | POST | `/open-api/order/update-pickup-appointment` | 自运营、半托管 | `shein_api_call` | 订单通过在线下单方式履约时，订单下单成功并打印面单后，若物流商支持线上预约，开发者可通过该接口预约物流商上门取件 注意 ：该接口QPS不超过5 如何对接预约取件… |
| [客单物流轨迹查询](https://open.sheincorp.com/documents/apidoc/detail/3001814) | 读 | GET | `/open-api/gsp/logistics-track` | 自运营、半托管 | `shein_api_call` | 通过该接口查下正向客单或逆向退回单的物流轨迹信息； |
| [确认无货接口](https://open.sheincorp.com/documents/apidoc/detail/3001415) | **写** | POST | `/open-api/order/confirm-no-stock` | 自运营、半托管 | `shein_api_call` | 该API支持商家取消订单中的商品。调用该接口后，开发者再次调用订单详情接口时，可以发现商品的 storageTag 字段会从 1 变更为 3 。随后，系统会在一… |
| [取消超限拆分包裹](https://open.sheincorp.com/documents/apidoc/detail/3001279) | **写** | POST | `/open-api/order/unpacking-group-remove` | 自运营、半托管 | `shein_api_call` | 该接口用于当巴西和墨西哥市场的订单超过限制并需要拆包时使用。ERP 需要根据订单详情字段判断订单是否需要拆包（"isOverLimitOrder": 1）。请注… |
| [确认超限拆分包裹](https://open.sheincorp.com/documents/apidoc/detail/3001280) | **写** | POST | `/open-api/order/unpacking-group-confirm` | 自运营、半托管 | `shein_api_call` | 该接口用于当巴西和墨西哥市场的订单超过限制并需要拆包时使用。ERP 需要根据订单详情字段判断订单是否需要拆包（"isOverLimitOrder": 1）。请注… |

## 退货退款

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [查询售后单列表](https://open.sheincorp.com/documents/apidoc/detail/3002085) | 读 | POST | `/open-api/after-sales-order/list` | 自运营、半托管 | `shein_api_call` | 通过该接口获取售后单列表；该接口适用自主运营，半托管的应用；也可以使用webhook中的 售后单同步通知 感知最新的售后单信息； 支持通过售后单的申请时间和更新… |
| [查询售后单详情](https://open.sheincorp.com/documents/apidoc/detail/3002084) | 读 | POST | `/open-api/after-sales-order/details` | 自运营、半托管 | `shein_api_call` | 通过该接口获取自主运营、半托管商家的售后单详情；接口中返回的时间均为北京时间（UTC+8）； 如何对接售后单请查看 售后单解决方案 ； |
| [查询退货单列表](https://open.sheincorp.com/documents/apidoc/detail/3001281) | 读 | POST | `/open-api/return-order/list` | 自运营、半托管 | `shein_api_call` | 通过该接口获取退货单列表；如何对接退货单请查看 客单退货退款服务； |
| [退货单详情查询](https://open.sheincorp.com/documents/apidoc/detail/3001282) | 读 | POST | `/open-api/return-order/details` | 自运营、半托管 | `shein_api_call` | 通过该接口获取退货单详情；如何对接退货单请查看 客单退货退款服务； |
| [退货单签收](https://open.sheincorp.com/documents/apidoc/detail/3001283) | **写** | POST | `/open-api/return-order/sign-return-order` | 自运营、半托管 | `shein_api_call` | 通过该接口签收退货商品； |

## 采购单

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [获取采购单信息](https://open.sheincorp.com/documents/apidoc/detail/3002068) | 读 | GET | `/open-api/order/purchase-order-infos` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_purchase_orders` | 该接口适用于全托管、SHEIN自营以及POP三种店铺类型，可用来获取对应店铺的采购单列表，并进一步查询每个采购单的详细信息。通过该接口，可以查询到普通备货单和急… |
| [JIT母单及子单对应关系查询接口](https://open.sheincorp.com/documents/apidoc/detail/3001813) | 读 | GET | `/open-api/order/get-mothe-child-orders` | 全托管、SHEIN自营、POP | `shein_api_call` | 1.入参orderNos，selectJitMother必填，orderNos最多支持200个订单 2.info是个列表，列表实体必返回请求的订单号，mothe… |
| [发货基本信息查询接口](https://open.sheincorp.com/documents/apidoc/detail/3001981) | 读 | GET | `/open-api/shipping/basic` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 通过该接口获取商家发货地址、发货仓、支持的发货方式、打包方式、发货车队、 发货路径 等发货的信息。 查询SHEIN合作物流信息需要调用 查询SHEIN合作物流产… |
| [创建发货单](https://open.sheincorp.com/documents/apidoc/detail/3002010) | **写** | POST | `/open-api/shipping/orderToShipping` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 使用该接口创建发货单，进行订单发货。全托管订单发货方式请查看 备货单履约管理 文档。 |
| [修改和取消发货单订单](https://open.sheincorp.com/documents/apidoc/detail/3002049) | **写** | POST | `/open-api/shipping/modify-delivery-order-info` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 该接口主要用于：1、修改发货单订单包裹数量和商品数量；2、取消发货单订单； 取消订单前，请查询订单状态： https://open.sheincorp.com/… |
| [查询智能拆包结果接口](https://open.sheincorp.com/documents/apidoc/detail/3002042) | 读 | POST | `/open-api/purchase/intelligent-packing-result` | 全托管、SHEIN自营、POP | `shein_api_call` | 用于采购单发货之前，查询平台智能拆包的结果，可以帮助开发者判断如何创建发货单 |
| [查询发货单列表](https://open.sheincorp.com/documents/apidoc/detail/3002045) | 读 | GET | `/open-api/shipping/delivery` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 查询发货单列表 |
| [查询SHEIN合作物流产品](https://open.sheincorp.com/documents/apidoc/detail/3001973) | 读 | POST | `/open-api/shipping/express-company-list-v2` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 通过该接口查询SHEIN合作物流的时效产品以及对应的物流公司； |
| [查询SHEIN合作物流预估运费](https://open.sheincorp.com/documents/apidoc/detail/3002011) | 读 | POST | `/open-api/openapi-business-backend/purchase-estimated-fee` | 全托管、SHEIN自营、POP | `shein_api_call` | 通过该接口查询shein合作物流的预估运费，适用于全托管、shein自营模式。欧洲地区的合作物流暂时不支持查询预估运费。 |
| [收货仓信息查询](https://open.sheincorp.com/documents/apidoc/detail/3001982) | 读 | GET | `/open-api/shipping/warehouse` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 通过该接口获取备货单的平台收货仓地址信息（适用全托管、SHEIN自营模式）； |
| [发货单维度打印面单](https://open.sheincorp.com/documents/apidoc/detail/3001293) | **写** | POST | `/open-api/shipping/delivery/print-package` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 通过该接口获取发货单的物流面单信息； |
| [​查询货代信息](https://open.sheincorp.com/documents/apidoc/detail/3002075) | 读 | POST | `/open-api/pfmp/shipping/thirdPartyAndChannelList` | 全托管、SHEIN自营、POP | `shein_api_call` | 用于查询货代信息，供商家选择使用货代服务。直送场景，当 发货方式：deliveryType = 2时，支持使用货代方式发货。 |
| [打印物流面单](https://open.sheincorp.com/documents/apidoc/detail/3001943) | **写** | POST | `/open-api/pfmp/print-purchase-logisticsLabel` | 全托管、SHEIN自营、POP | `shein_api_call` | 用于下载物流商面单PDF。在创建发货单之后，如果查询发货单接口（/open-api/shipping/delivery）logisticsLabelPrintF… |
| [商品打印条码](https://open.sheincorp.com/documents/apidoc/detail/3001653) | 读 | POST | `/open-api/goods/print-barcode` | 全托管、SHEIN自营、POP | `shein_api_call` | 使用该API打印商品条码 |
| [手工下备货单](https://open.sheincorp.com/documents/apidoc/detail/3002040) | **写** | POST | `/open-api/idms/create-order` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 该接口用于商家创建备货单（创建的备货单需等待平台审核），适用于部分全托管、自运营及半托管模式的商家。需要注意的是，备货单是指 SHEIN 面向供应商的采购订单，… |
| [备货单审核列表](https://open.sheincorp.com/documents/apidoc/detail/3002041) | 读 | POST | `/open-api/idms/review-orders` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_api_call` | 通过该接口查询申请备货的审核信息列表，适用全托管，备货到shein仓（SFS）的自运营、半托管模式的商家； |
| [查询商品备货信息列表](https://open.sheincorp.com/documents/apidoc/detail/3002062) | 读 | POST | `/open-api/openapi-business-backend/stock-goods-list` | 全托管、SHEIN自营、POP | `shein_api_call` | 通过该接口获取商品备货相关信息。该接口主要适用全托管模式，备货到SHEIN仓库的商家，如果商家没有数据权限，会返回“不符合对外规则”。 该接口仅支持查询SHEI… |
| [打印箱唛或包裹面单](https://open.sheincorp.com/documents/apidoc/detail/3001659) | **写** | POST | `/open-api/order/print-package` | 全托管、SHEIN自营、POP | `shein_api_call` | 该接口已逐步废弃，推荐优先对接【 发货单维度打印面单接口 】 |
| [物流公司信息查询（即将废弃）](https://open.sheincorp.com/documents/apidoc/detail/3001300) | 读 | GET | `/open-api/shipping/express-company-list` | — | `shein_api_call` | 此接口可以查询到全国性和区域性的物流方式，建议开发者使用此接口获取物流方式信息，提高商家选择物流方式的范围， |
| [查询SHEIN仓库的收件信息](https://open.sheincorp.com/documents/apidoc/detail/3001660) | 读 | GET | `/open-api/order/storage-receiver-info` | 全托管、SHEIN自营、POP | `shein_api_call` | 该接口固定查询佛山仓安博1号仓收件人信息，后续不再维护，建议使用/open-api/shipping/warehouse代替 1. code=0成功，code … |

## 采购单退货

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [查询退货申请单列表](https://open.sheincorp.com/documents/apidoc/detail/3001910) | 读 | POST | `/open-api/purchase/return-application-list` | 全托管 | `shein_api_call` | 分页查询退货申请单列表数据；如何对接请查看 采购单退货解决方案 |
| [查询退货申请单商品明细](https://open.sheincorp.com/documents/apidoc/detail/3001798) | 读 | POST | `/open-api/purchase/return-application-detail` | 全托管 | `shein_api_call` | 查询指定退货申请单的商品明细 |
| [查询商家可选择的处理方式](https://open.sheincorp.com/documents/apidoc/detail/3001771) | 读 | GET | `/open-api/purchase/return-disposals` | 全托管 | `shein_api_call` | 获取商家对退货申请单可选的处理方式（如退货、报废） |
| [查询退货方式](https://open.sheincorp.com/documents/apidoc/detail/3001774) | 读 | POST | `/open-api/purchase/return-pickup-methods` | 全托管 | `shein_api_call` | 当创建退货申请单或确认退货申请单时，处理方式为报废的情况下，开发者可通过此接口获取发货仓支持的退货方式 |
| [查询商家退货地址](https://open.sheincorp.com/documents/apidoc/detail/3001803) | 读 | POST | `/open-api/purchase/query-return-address` | 全托管 | `shein_api_call` | 获取商家可用的退货收货地址列表 |
| [查询退货可选择的物流](https://open.sheincorp.com/documents/apidoc/detail/3001796) | 读 | POST | `/open-api/purchase/return-carriers` | 全托管 | `shein_api_call` | 当选择处理方式是退货且使用退货方式是SHEIN合作物流时，可通过此接口获取退货收货地址支持的物流商 |
| [确认退货申请单](https://open.sheincorp.com/documents/apidoc/detail/3001804) | **写** | POST | `/open-api/purchase/confirm-return-application` | 全托管 | `shein_api_call` | 通过该接口对状态为"待商家确认"的退货申请单执行确认操作 |
| [查询商品可退库存数](https://open.sheincorp.com/documents/apidoc/detail/3001805) | 读 | POST | `/open-api/purchase/returnable-inventory` | 全托管 | `shein_api_call` | 查询指定商品在仓库中可退货或报废的库存数量 |
| [创建退货申请单](https://open.sheincorp.com/documents/apidoc/detail/3001806) | **写** | POST | `/open-api/purchase/create-return-application` | 全托管 | `shein_api_call` | 商家主动发起退货申请，创建退货申请单 |
| [查询退货与报废单列表](https://open.sheincorp.com/documents/apidoc/detail/3001909) | 读 | POST | `/open-api/purchase/return-list` | 全托管 | `shein_api_call` | 分页查询退货单、报废单列表数据；如何对接请查看 采购单退货解决方案 |
| [查询退货与报废单商品明细](https://open.sheincorp.com/documents/apidoc/detail/3001780) | 读 | POST | `/open-api/purchase/return-product-detail` | 全托管 | `shein_api_call` | 查询退货单、报废中商品的明细信息 |
| [查询退货与报废单包裹明细](https://open.sheincorp.com/documents/apidoc/detail/3001779) | 读 | POST | `/open-api/purchase/return-package-detail` | 全托管 | `shein_api_call` | 查询退货单对应的包裹打包明细信息 |
| [修改退货单的退货方式](https://open.sheincorp.com/documents/apidoc/detail/3001781) | **写** | POST | `/open-api/purchase/update-pickup-methods` | 全托管 | `shein_api_call` | 在退货单退货前，通过此接口修改退货单的退货方式、地址及承运商 |

## 库存和销量

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [商家仓库列表查询](https://open.sheincorp.com/documents/apidoc/detail/3002013) | 读 | GET | `/open-api/msc/warehouse/list` | 自运营、半托管 | `shein_api_call` | 功能介绍：查询商家仓库列表信息。适用应用：自运营，半托管 ⚠️注意：商家如果有多个仓库，修改库存时必须传仓库id |
| [商家库存查询接口](https://open.sheincorp.com/documents/apidoc/detail/3001695) | 读 | POST | `/open-api/stock/stock-query` | 自运营、全托管、SHEIN自营、半托管、POP | `shein_stock` | 支持通过sku、skc、spu查询库存数量 请求参数：请注意，skuCodeList/skcNameList/spuNameList三个参数不能全部为空，至少传… |
| [更新商家库存接口v1](https://open.sheincorp.com/documents/apidoc/detail/3001692) | **写** | POST | `/open-api/gsp/goods/change-inventory` | 自运营、半托管 | `shein_api_call` | 功能介绍：根据 shein sku 编码修改库存，输入 shein sku 编码和修改后的库存数量，返回状态以及修改失败的 shein sku 编码。 适用应用… |
| [更新商家库存接口v2](https://open.sheincorp.com/documents/apidoc/detail/3001738) | **写** | POST | `/open-api/stock/change-inventory/v2` | 自运营、半托管 | `shein_api_call` | 修改sku库存数量，支持自运营，半托管模式商家 注意： 1. 如果店铺是多仓库的，warehouseCode必填 2. changeInventoryQuant… |
| [全托管/SHEIN自营商家库存更新](https://open.sheincorp.com/documents/apidoc/detail/3001304) | **写** | POST | `/open-api/goods/stock-update` | 全托管、SHEIN自营、POP | `shein_api_call` | 该API用于更新代运营（又称全托管、简易平台）和SHEIN自营商家的库存，接口支持全量方式更新； ⚠️注意：自主运营和半托管模式应用请勿使用； |
| [根据SKU查询销量](https://open.sheincorp.com/documents/apidoc/detail/3001305) | 读 | POST | `/open-api/goods/query-sku-sales` | 全托管、SHEIN自营、半托管、POP | `shein_sales` | 商家可以通过该接口查询7天和30天销量 平台限制的QPS为 40/S，某一时间点大批量的调用接口可能会导致限流 接口的数据为每天北京时间0点统计更新，建议开发者… |

## 营销活动报名

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [查询可报活动列表](https://open.sheincorp.com/documents/apidoc/detail/3001993) | 读 | POST | `/open-api/campaigns/campaign-list` | 自运营、全托管、半托管、POP | `shein_api_call` | 通过该接口获取商家能够报名的所有营销活动，支持对活动类型进行筛选。 |
| [查询活动详情](https://open.sheincorp.com/documents/apidoc/detail/3002006) | 读 | POST | `/open-api/campaigns/campaign-detail` | 自运营、全托管、半托管、POP | `shein_api_call` | 通过接口获取营销活动详情，包括活动时间、活动站点、报名形式、对店铺和商品的要求等。 |
| [查询活动可报商品列表](https://open.sheincorp.com/documents/apidoc/detail/3002014) | 读 | POST | `/open-api/campaigns/registrable-product-list` | 自运营、全托管、半托管、POP | `shein_api_call` | 查询商家在指定活动中可报名的商品及报名要求，包括活动价格或降幅区间、活动件数要求和活动预留件数要求。 自运营模式需关注售价相关字段；半托管、全托管模式需关注供货… |
| [报名活动](https://open.sheincorp.com/documents/apidoc/detail/3002032) | **写** | POST | `/open-api/campaigns/register-campaign` | 自运营、全托管、半托管、POP | `shein_api_call` | 本接口用于提交活动商品的报名。调用前需先通过 查询活动详情接口 和 查询活动可报商品列表接口 获取报名规则与填报要求。 填报规则简述： 1. 基础必填信息 需填… |
| [查询活动报名记录列表](https://open.sheincorp.com/documents/apidoc/detail/3002096) | 读 | POST | `/open-api/campaigns/registration-records` | 自运营、全托管、半托管、POP | `shein_api_call` | 该接口用于查询营销活动报名记录，支持根据活动ID、SKC进行筛选，仅支持查询近4个月内的报名记录数据。 |
| [取消活动报名](https://open.sheincorp.com/documents/apidoc/detail/3001998) | **写** | POST | `/open-api/campaigns/cancel-registration` | 自运营、全托管、半托管、POP | `shein_api_call` | 本接口用于取消营销活动报名。当报名审核状态为“审核中”时，允许调用本接口进行取消操作。 |

## 财务

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [报账单列表](https://open.sheincorp.com/documents/apidoc/detail/3001626) | 读 | POST | `/open-api/finance/report-list` | 全托管、POP | `shein_finance_reports` | 查询全托管店铺和POP模式的账单列表，当前仅支持查询2024年1月1日至今的数据，需要查询更多数据需要在商家后台操作； |
| [报账单销售款收支明细](https://open.sheincorp.com/documents/apidoc/detail/3001674) | 读 | POST | `/open-api/finance/report-sales-detail` | 全托管、POP | `shein_api_call` | 该接口支持全托管和POP模式的商家通过报账单号查询销售款明细数据；报账单号请通过【 报账单列表 】接口中的reportOrderNo获取； |
| [报账单补扣款收支明细](https://open.sheincorp.com/documents/apidoc/detail/3001628) | 读 | POST | `/open-api/finance/report-adjustment-detail` | 全托管、POP | `shein_api_call` | 该接口支持全托管和POP模式的商家通过报账单号查询补扣款明细数据；报账单号请通过【 报账单列表 】接口中的reportOrderNo获取； |
| [查询报账单列表](https://open.sheincorp.com/documents/apidoc/detail/3001920) | 读 | POST | `/open-api/finance/report-order-list` | 自运营、半托管 | `shein_api_call` | 自运营和半托管应用可使用该接口查询店铺中已生成的报账单列表。 |
| [查询对账单列表](https://open.sheincorp.com/documents/apidoc/detail/3001631) | 读 | POST | `/open-api/finance/get-check-order-list` | 自运营、半托管 | `shein_api_call` | 自运营和半托管应用可使用该接口查询店铺中已生成的对账单列表。目前，仅对账单列表支持自运营和半托管店铺。 对账单接口说明： 当订单或其他业务单据进入结算节点后，系… |
| [查询对账单详情](https://open.sheincorp.com/documents/apidoc/detail/3001932) | 读 | GET | `/open-api/finance/get-check-order-detail` | 自运营、半托管 | `shein_api_call` | 自运营、半托管模式的应用可用。通过对账单单号查询对账单详情，对账单单号可通过 查询对账单列表接口 获取。 |

## 店铺

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [查询店铺信息](https://open.sheincorp.com/documents/apidoc/detail/3001499) | 读 | POST | `/open-api/openapi-business-backend/query-store-info` | 自运营、全托管、半托管、POP | `shein_stores 授权时校验` | 查询店铺的基本信息，如商家id、店铺状态及店铺可发布商品数量 |
| [查询公告列表](https://open.sheincorp.com/documents/apidoc/detail/3001144) | 读 | POST | `/open-api/ssls/announcement/get-anno-list` | 自运营 | `shein_api_call` | 获取公告列表 |
| [获取公告详情](https://open.sheincorp.com/documents/apidoc/detail/3001145) | 读 | POST | `/open-api/ssls/announcement/get-anno-detail` | 自运营 | `shein_api_call` | 获取公告详情 |

## 定制商品

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [获取定制数据](https://open.sheincorp.com/documents/apidoc/detail/3001668) | 读 | GET | `/open-api/ccst/v1/custom-infos` | 全托管、半托管 | `shein_api_call` | 使用定制商品id（customInfoId）查询定制数据 |
| [创建⽣产模板任务](https://open.sheincorp.com/documents/apidoc/detail/3001672) | **写** | POST | `/open-api/ccst/v1/composite/task` | 全托管、半托管 | `shein_api_call` | 使用定制商品id（customInfoId）+ 模版id（compositeId）生成最终定制生产任务，需要异步查询结果 |
| [获取模版数据](https://open.sheincorp.com/documents/apidoc/detail/3001670) | 读 | GET | `/open-api/ccst/v1/custom-info/templates` | 全托管、半托管 | `shein_api_call` | 接口请求通讯成功统一返回 httpcode 200 返回body code错误码描述： 100001:CustomInfoId字段是为必填项 120001:未找… |
| [查询任务结果](https://open.sheincorp.com/documents/apidoc/detail/3001671) | 读 | GET | `/open-api/ccst/v1/composite/queryTask` | 全托管、半托管 | `shein_api_call` | 接口请求通讯成功统一返回 httpcode 200 返回body code错误码描述： 100004:Id字段为必填项 120002:商家id不匹配 10000… |
| [查询加车结构信息](https://open.sheincorp.com/documents/apidoc/detail/3001665) | 读 | POST | `/open-api/ccst/v1/custom-info/queryAddCartInfo` | 全托管、半托管 | `shein_api_call` |  |

## 认证仓

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [认证仓调用-上传物流运单接口](https://open.sheincorp.com/documents/apidoc/detail/3001262) | **写** | POST | `/open-api/order/openapi/auth/order/express-upload` | — | `shein_api_call` | 认证仓上传物流运单 |
| [认证仓调用-回调出库单创建结果接口](https://open.sheincorp.com/documents/apidoc/detail/3001263) | **写** | POST | `/open-api/order/openapi/auth/order/outbound-result` | — | `shein_api_call` | 认证仓回调出库单创建结果 |
| [认证仓调用-作废出库单接口](https://open.sheincorp.com/documents/apidoc/detail/3001264) | **写** | POST | `/open-api/order/openapi/auth/order/outbound-cancel` | — | `shein_api_call` | 认证仓作废出库单 |
| [认证仓调用-接收认证仓服务商仓库渠道变更接口](https://open.sheincorp.com/documents/apidoc/detail/3001265) | **写** | POST | `/open-api/lsps-java/auth/entity-change` | — | `shein_api_call` | 认证仓同步物理仓库、渠道接口 |

## 物流

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [物流商网点回调接口](https://open.sheincorp.com/documents/apidoc/detail/3000496) | **写** | POST | `/open-api/cargo/express-website-message` | — | `shein_api_call` | 更新： 2021-11-19 1）opType 非必填，由SHEIN后台校验是新增还是修改。 2）如果province，city，region，detail这几… |
| [【新】物流轨迹回调](https://open.sheincorp.com/documents/apidoc/detail/3000505) | **写** | POST | `/open-api/cargo/logistics-trajectory-callback` | — | `shein_api_call` | # 我司运单-物流状态 ｜ 节点名称 ｜ 节点值 ｜ 描述 ｜ ｜ -------- ｜ -------- ｜ -------- ｜ ｜ 待取货 ｜ 100 ｜… |
| [车牌信息回调](https://open.sheincorp.com/documents/apidoc/detail/3001045) | **写** | POST | `/open-api/cargo/platenum-callback` | — | `shein_api_call` |  |
| [顺丰运单未揽收包裹明细回调接口](https://open.sheincorp.com/documents/apidoc/detail/3000498) | **写** | POST | `/open-api/cargo/qc-outside-cancel-sf-express` | — | `shein_api_call` | 顺丰运单未揽收包裹明细回调接口，通知SHEIN未揽收的包裹号明细及运单号 |
| [【新】物流重量回调](https://open.sheincorp.com/documents/apidoc/detail/3000928) | **写** | POST | `/open-api/cargo/weight-callback` | — | `shein_api_call` |  |
| [物流接口-获取快递公司信息](https://open.sheincorp.com/documents/apidoc/detail/3001498) | 读 | GET | `/open-api/order/express-infos` | — | `shein_api_call` | 提供给商家查询快递信息 |
| [物流商接口-物流商运单回调](https://open.sheincorp.com/documents/apidoc/detail/3000499) | **写** | POST | `/open-api/cargo/express-notify` | — | `shein_api_call` | 物流商运单回调接口，用于物流商在生产运单成功，修改运单，删除运单回调给shein |
| [物流商推送轨迹数据-统一接口](https://open.sheincorp.com/documents/apidoc/detail/3000501) | **写** | POST | `/open-api/cargo/track-notify` | — | `shein_api_call` | 物流商推送轨迹数据给到Shein的统一接口 |
| [物流商推送轨迹数据-trackingmore](https://open.sheincorp.com/documents/apidoc/detail/3000502) | **写** | POST | `/open-api/cargo/track-notify-trackingmore` | — | `shein_api_call` | trackingmore物流商推送轨迹数据给到Shein [接口文档](https://www.51tracking.com/v3/api-index#webh… |
| [上传结算异常举证](https://open.sheincorp.com/documents/apidoc/detail/3000503) | **写** | POST | `/open-api/cargo/quote-return` | — | `shein_api_call` | 该接口用于物流商上传运单号异常的举证信息，举证信息不超过500字符，相关附件最多上传10个文件。 |
| [揽收超时/取消运单原因回传](https://open.sheincorp.com/documents/apidoc/detail/3000504) | **写** | POST | `/open-api/cargo/timeout-cancel-reason-return` | — | `shein_api_call` |  |

## MES

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [MES-FAC-002 采购信息接口](https://open.sheincorp.com/documents/apidoc/detail/3001822) | 读 | POST | `/open-api/mes/get-purchase-info` | SHEIN自营 | `shein_api_call` |  |
| [MES-FAC-003 领料信息接口](https://open.sheincorp.com/documents/apidoc/detail/3000508) | 读 | POST | `/open-api/mes/get-material-info` | SHEIN自营 | `shein_api_call` |  |
| [MES-FAC-004 二次工艺接口](https://open.sheincorp.com/documents/apidoc/detail/3000509) | 读 | POST | `/open-api/mes/get-second-precess` | SHEIN自营 | `shein_api_call` |  |
| [MES-FAC-005 大货bom接口](https://open.sheincorp.com/documents/apidoc/detail/3000510) | 读 | POST | `/open-api/mes/get-big-goods-bom` | SHEIN自营 | `shein_api_call` |  |
| [扎信息查询接口](https://open.sheincorp.com/documents/apidoc/detail/3000511) | 读 | POST | `/open-api/mes/bundle-info` | SHEIN自营 | `shein_api_call` |  |
| [查询物料异常详细接口](https://open.sheincorp.com/documents/apidoc/detail/3000512) | 读 | POST | `/open-api/mes/material-anomalous/list` | SHEIN自营 | `shein_api_call` |  |
| [查询采购单详细接口](https://open.sheincorp.com/documents/apidoc/detail/3000513) | 读 | POST | `/open-api/mes/purchase-detail-info-list` | SHEIN自营 | `shein_api_call` |  |
| [按时间查询生产制单号](https://open.sheincorp.com/documents/apidoc/detail/3000514) | 读 | POST | `/open-api/mes/query-produce-order-ids` | SHEIN自营 | `shein_api_call` |  |
| [查询发货单信息](https://open.sheincorp.com/documents/apidoc/detail/3000515) | **写** | POST | `/open-api/mes/deliver-order/list` | SHEIN自营 | `shein_api_call` |  |
| [查询供应商尾货](https://open.sheincorp.com/documents/apidoc/detail/3000522) | 读 | POST | `/open-api/mes/order-inventory-surplus/list` | SHEIN自营 | `shein_api_call` |  |
| [查询生产订单](https://open.sheincorp.com/documents/apidoc/detail/3001929) | 读 | POST | `/open-api/mes/get-produce-order-info` | SHEIN自营 | `shein_api_call` |  |
| [MES-FAC-001 订单数据获取接口](https://open.sheincorp.com/documents/apidoc/detail/3000520) | 读 | POST | `/open-api/mes/get-order-info` | SHEIN自营 | `shein_api_call` |  |
| [更新供应商尾货](https://open.sheincorp.com/documents/apidoc/detail/3000519) | **写** | POST | `/open-api/mes/order-inventory-surplus/update` | SHEIN自营 | `shein_api_call` |  |
| [车缝完工](https://open.sheincorp.com/documents/apidoc/detail/3000518) | **写** | POST | `/open-api/mes/sew-end` | SHEIN自营 | `shein_api_call` |  |
| [裁床完成](https://open.sheincorp.com/documents/apidoc/detail/3000517) | **写** | POST | `/open-api/mes/end-cut-bed` | SHEIN自营 | `shein_api_call` |  |
| [根据订单号查询订单信息](https://open.sheincorp.com/documents/apidoc/detail/3001882) | 读 | POST | `/open-api/mes/query-produce-order-info-by-id` | SHEIN自营 | `shein_api_call` |  |
| [自营供应商库存更新](https://open.sheincorp.com/documents/apidoc/detail/3001820) | **写** | POST | `/open-api/sims/stock-update` | SHEIN自营 | `shein_api_call` |  |
| [自营供应商入库单确认](https://open.sheincorp.com/documents/apidoc/detail/3001821) | **写** | POST | `/open-api/sims/inbound-order-confirm` | SHEIN自营 | `shein_api_call` |  |
| [自营供应商待入库数量修改](https://open.sheincorp.com/documents/apidoc/detail/3001957) | **写** | POST | `/open-api/sims/inbound-order-modify` | — | `shein_api_call` |  |
| [分页查询商家SKC列表](https://open.sheincorp.com/documents/apidoc/detail/3001824) | 读 | POST | `/open-api/spss/skc-page-query` | SHEIN自营 | `shein_api_call` |  |
| [批量查询SKC信息](https://open.sheincorp.com/documents/apidoc/detail/3001876) | 读 | POST | `/open-api/spss/skc-info-query` | SHEIN自营 | `shein_api_call` |  |
| [入库单列表查询](https://open.sheincorp.com/documents/apidoc/detail/3001816) | 读 | POST | `/open-api/sims/inbound-order-query` | SHEIN自营 | `shein_api_call` |  |
| [出库订单列表查询](https://open.sheincorp.com/documents/apidoc/detail/3001817) | 读 | POST | `/open-api/sims/outbound-order-query` | SHEIN自营 | `shein_api_call` |  |
| [库存结余列表查询](https://open.sheincorp.com/documents/apidoc/detail/3001819) | 读 | POST | `/open-api/sims/stock-query` | SHEIN自营 | `shein_api_call` |  |
| [库位列表数据](https://open.sheincorp.com/documents/apidoc/detail/3001818) | 读 | POST | `/open-api/sims/location-query` | SHEIN自营 | `shein_api_call` |  |

## 排产

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [查询任务节点配置](https://open.sheincorp.com/documents/apidoc/detail/3001865) | 读 | POST | `/open-api/sims/srp/progress-node-query` | SHEIN自营 | `shein_api_call` |  |
| [查询任务进度交期配置](https://open.sheincorp.com/documents/apidoc/detail/3001866) | 读 | POST | `/open-api/sims/srp/timeline-query` | SHEIN自营 | `shein_api_call` |  |
| [查询作业流程配置](https://open.sheincorp.com/documents/apidoc/detail/3001867) | 读 | POST | `/open-api/sims/srp/procedure-query` | SHEIN自营 | `shein_api_call` |  |
| [分页查询排产计划](https://open.sheincorp.com/documents/apidoc/detail/3001936) | 读 | POST | `/open-api/sims/srp/production-plan-query` | SHEIN自营 | `shein_api_call` |  |
| [分页查询生产任务](https://open.sheincorp.com/documents/apidoc/detail/3001935) | 读 | POST | `/open-api/sims/srp/task-query` | SHEIN自营 | `shein_api_call` |  |
| [根据排单计划批量创建成品生产任务](https://open.sheincorp.com/documents/apidoc/detail/3001937) | **写** | POST | `/open-api/sims/srp/tasks-create-by-production-nos` | SHEIN自营 | `shein_api_call` |  |
| [根据排单计划批量创建半成品生产任务](https://open.sheincorp.com/documents/apidoc/detail/3001871) | **写** | POST | `/open-api/sims/srp/sfp-tasks-create-by-production-nos` | SHEIN自营 | `shein_api_call` |  |
| [根据商品信息批量创建成品排单计划和生产任务](https://open.sheincorp.com/documents/apidoc/detail/3001872) | **写** | POST | `/open-api/sims/srp/tasks-create-by-products` | SHEIN自营 | `shein_api_call` |  |
| [根据商品信息批量创建半成品排单计划和生产任务](https://open.sheincorp.com/documents/apidoc/detail/3001873) | **写** | POST | `/open-api/sims/srp/sfp-tasks-create-by-sfps` | SHEIN自营 | `shein_api_call` |  |
| [更新生产任务接口](https://open.sheincorp.com/documents/apidoc/detail/3001874) | **写** | POST | `/open-api/sims/srp/task-update` | SHEIN自营 | `shein_api_call` |  |

## 面料

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [供应商库存-入库同步接口](https://open.sheincorp.com/documents/apidoc/detail/3000493) | **写** | POST | `/open-api/material/in-inventory` | — | `shein_api_call` | 入库同步接口注意： 1.请求参数的中文不能出现unicode编码 如：柯桥变成了 \u67ef\u6865 2.请求参数中不能含有特殊的符号如制表符，换行符 |
| [供应商库存-出库同步接口](https://open.sheincorp.com/documents/apidoc/detail/3000489) | **写** | POST | `/open-api/material/out-inventory` | — | `shein_api_call` | 出库同步接口注意： 1.请求参数的中文不能出现unicode编码 如：柯桥变成了 \u67ef\u6865 2.请求参数中不能含有特殊的符号如制表符，换行符 |
| [供应商质检-验布报告](https://open.sheincorp.com/documents/apidoc/detail/3000492) | **写** | POST | `/open-api/material/receive-cloth-report` | — | `shein_api_call` | 字段填写说明： 条编码：最多200个字符；条编码不得与该供应商已有验布报告重复； 系统对接码：在Shein存在，且属于该调动接口供应商的系统对接码； 幅宽：要求… |
| [供应商订单-发货信息](https://open.sheincorp.com/documents/apidoc/detail/3000490) | **写** | POST | `/open-api/material/sales-order-deliver-info` | — | `shein_api_call` |  |
| [供应商库存-库存同步接口](https://open.sheincorp.com/documents/apidoc/detail/3000491) | **写** | POST | `/open-api/material/sync-inventory` | — | `shein_api_call` | 库存同步接口注意： 1.请求参数的中文不能出现unicode编码 如：柯桥变成了 \u67ef\u6865 2.请求参数中不能含有特殊的符号如制表符，换行符 3… |
| [发起快速加供任务](https://open.sheincorp.com/documents/apidoc/detail/3001378) | **写** | POST | `/open-api/material/mesCreateAddSupp` | — | `shein_api_call` |  |

## MDP印染

| 接口 | 读 / 写 | 方法 | 路径 | 适用模式 | MCP 工具 | 说明 |
|---|---|---|---|---|---|---|
| [获取大货订单信息](https://open.sheincorp.com/documents/apidoc/detail/3001429) | 读 | POST | `/open-api/mdp/get-order-info-list` | — | `shein_api_call` |  |
| [提供更新MDP打印任务开始](https://open.sheincorp.com/documents/apidoc/detail/3001421) | **写** | POST | `/open-api/mdp/product/print-task/begin` | — | `shein_api_call` |  |
| [提供更新MDP打印任务完成](https://open.sheincorp.com/documents/apidoc/detail/3001422) | **写** | POST | `/open-api/mdp/product/print-task/finish` | — | `shein_api_call` |  |
| [提供扫码排产创建波次](https://open.sheincorp.com/documents/apidoc/detail/3001420) | **写** | POST | `/open-api/mdp/product/schedule/allocation-confirm` | — | `shein_api_call` |  |
| [提供更新MDP转印任务开始](https://open.sheincorp.com/documents/apidoc/detail/3001419) | **写** | POST | `/open-api/mdp/product/transfer-print-task/begin` | — | `shein_api_call` |  |
| [提供更新MDP转印任务结束](https://open.sheincorp.com/documents/apidoc/detail/3001418) | **写** | POST | `/open-api/mdp/product/transfer-print-task/finish` | — | `shein_api_call` |  |
| [创建待补全审核的客户需求](https://open.sheincorp.com/documents/apidoc/detail/3001427) | **写** | POST | `/open-api/mdp/order/customer-requirement/create-customer-requirement` | — | `shein_api_call` |  |
| [根据印花厂code获取客户信息](https://open.sheincorp.com/documents/apidoc/detail/3001426) | 读 | POST | `/open-api/mdp/order/customer-requirement/get-factory-customer-list` | — | `shein_api_call` |  |
| [根据名称获取可用的印花厂](https://open.sheincorp.com/documents/apidoc/detail/3001425) | 读 | POST | `/open-api/mdp/order/customer-requirement/get-factory-list` | — | `shein_api_call` |  |
| [给外部供应商调用- 重录订单米数和裁片](https://open.sheincorp.com/documents/apidoc/detail/3001424) | **写** | POST | `/open-api/mdp/order/goods/reenter-order-info` | — | `shein_api_call` |  |
| [给外部供应商调用- 同步订单信息（状态，发货）](https://open.sheincorp.com/documents/apidoc/detail/3001467) | **写** | POST | `/open-api/mdp/order/goods/sync-order-info` | — | `shein_api_call` |  |
| [微信小程序登陆](https://open.sheincorp.com/documents/apidoc/detail/3001417) | **写** | POST | `/open-api/mdp/wx-mini-program/login` | — | `shein_api_call` | 微信小程序登陆，目前并没有做真正的登陆，只是简单返回了允许的菜单 |
| [挂卡聚合操作（上架or出库or移位）](https://open.sheincorp.com/documents/apidoc/detail/3001430) | **写** | POST | `/open-api/mdp/hangcard/operate` | — | `shein_api_call` |  |
| [新增或更新挂卡信息](https://open.sheincorp.com/documents/apidoc/detail/3001431) | **写** | POST | `/open-api/mdp/hang-card/add-or-update` | — | `shein_api_call` |  |
| [获取打印设备列表](https://open.sheincorp.com/documents/apidoc/detail/3001432) | 读 | POST | `/open-api/mdp/basic-configure/production-equipment/get-print-equipmentList` | — | `shein_api_call` |  |
| [添加或取消设备异常](https://open.sheincorp.com/documents/apidoc/detail/3001433) | **写** | POST | `/open-api/mdp/basic-configure/production-equipment/add-or-cancel-equipment-exception` | — | `shein_api_call` | 添加或取消设备异常 |
| [接收外部ERP完结订单](https://open.sheincorp.com/documents/apidoc/detail/3001434) | **写** | POST | `/open-api/mdp/order/goods/external/receive-external-erp-complete-order` | — | `shein_api_call` |  |
| [提供外部ERP版料任务查询接口](https://open.sheincorp.com/documents/apidoc/detail/3002099) | 读 | POST | `/open-api/mdp/process/get-process-develop-info-list` | — | `shein_api_call` |  |
| [外部查询操作日志（供小程序调用）](https://open.sheincorp.com/documents/apidoc/detail/3001470) | 读 | POST | `/open-api/mdp/order/external/get-order-log-list` | — | `shein_api_call` |  |
| [提供外部ERP花型开发分页查询接口](https://open.sheincorp.com/documents/apidoc/detail/3001474) | 读 | POST | `/open-api/mdp/flower/get-pattern-dev-page-list` | — | `shein_api_call` |  |
| [推送版料文件URL](https://open.sheincorp.com/documents/apidoc/detail/3001950) | **写** | POST | `/open-api/mdp/process/pushProcessFileUrl` | — | `shein_api_call` |  |
| [获取文件上传sts](https://open.sheincorp.com/documents/apidoc/detail/3001953) | **写** | POST | `/open-api/mdp/process/getPushProcessSts` | — | `shein_api_call` |  |

## Webhook 消息

本工具只主动调接口，不接收推送；以下仅供参考。

| 消息 | 路径 |
|---|---|
| [商品接收通知](https://open.sheincorp.com/documents/apidoc/detail/3000910) | `/product_document_receive_status_notice` |
| [商品发布公文审核通知（全渠道）](https://open.sheincorp.com/documents/apidoc/detail/3001449) | `/product_document_audit_status_notice_all_channels` |
| [商品审核通知](https://open.sheincorp.com/documents/apidoc/detail/3001450) | `/product_document_audit_status_notice` |
| [商品涨价审批结果通知](https://open.sheincorp.com/documents/apidoc/detail/3000912) | `/product_price_audit_status_notice` |
| [商品价格异常通知](https://open.sheincorp.com/documents/apidoc/detail/3000804) | `/product_prices_abnormal_notice` |
| [建议零售价审核状态更新](https://open.sheincorp.com/documents/apidoc/detail/3001792) | `/product_rrp_review_status_changed` |
| [建议零售价有效期变更](https://open.sheincorp.com/documents/apidoc/detail/3001793) | `/product_rrp_validity_changed` |
| [商品上下架通知](https://open.sheincorp.com/documents/apidoc/detail/3000848) | `/product_shelves_notice` |
| [商品额度变动通知](https://open.sheincorp.com/documents/apidoc/detail/3001061) | `/product_quota_change_notice` |
| [商品删除审核通知](https://open.sheincorp.com/documents/apidoc/detail/3001903) | `/product_delete_audit` |
| [订单同步通知](https://open.sheincorp.com/documents/apidoc/detail/3001442) | `/order_push_notice` |
| [SHEIN合作物流单下单通知](https://open.sheincorp.com/documents/apidoc/detail/3001461) | `/logistics_order_result_notice` |
| [预约取件同步通知](https://open.sheincorp.com/documents/apidoc/detail/3002066) | `/pickup_appointment_notice` |
| [cte开票通知](https://open.sheincorp.com/documents/apidoc/detail/3001082) | `/invoice_status_notice` |
| [退货单同步通知](https://open.sheincorp.com/documents/apidoc/detail/3000914) | `/return_order_push_notice` |
| [售后单同步通知](https://open.sheincorp.com/documents/apidoc/detail/3002058) | `/aftersales_push_notice` |
| [采购单通知](https://open.sheincorp.com/documents/apidoc/detail/3001967) | `/purchase_order_notice` |
| [发货单变更通知](https://open.sheincorp.com/documents/apidoc/detail/3001441) | `/delivery_modify_notice` |
| [采购单合作物流通知](https://open.sheincorp.com/documents/apidoc/detail/3001765) | `/logistics_forecast_result_notice` |
| [采购退货申请单状态通知](https://open.sheincorp.com/documents/apidoc/detail/3001744) | `/purchase_order_return_application_notice` |
| [采购退货单状态通知](https://open.sheincorp.com/documents/apidoc/detail/3001801) | `/purchase_order_return_notice` |
| [推送缺货需求库存数（新）](https://open.sheincorp.com/documents/apidoc/detail/3001048) | `/out_of_stock_notice` |
| [SKU库存预警通知](https://open.sheincorp.com/documents/apidoc/detail/3001068) | `/inventory_warning_notice` |
| [商品视频任务完成](https://open.sheincorp.com/documents/apidoc/detail/3002022) | `/product_video_conversion_completed` |
| [商品合规信息失效通知](https://open.sheincorp.com/documents/apidoc/detail/3001104) | `/product_compliance_change_notice` |
| [店铺授权关系变更通知](https://open.sheincorp.com/documents/apidoc/detail/3001503) | `/authorization_change_notice` |

## 实测限制

- `skc-label-list` 一次最多 10 个 SKC（传 100 个报「查询标签审核结果列表异常」）；全店 200 个 SKC 约 2 分钟。
- `material-quality-tree-v2` 只能 GET。
- `product/query` pageSize 可用 200，不返回总数；`searchProduct` pageSize 最大 10。
- `purchase-order-infos`（GET）至少要一个筛选条件，时间范围 ≤60 天，每页 ≤200。
- `report-list` 单次时间范围 ≤7 天，每页 ≤200。
- `stock-query`：`warehouseType` 将于 2026-12-31 下线，改用 `invType`（PI / VI / JI）；没有库存记录的 SKC 不返回。
- `query-sku-sales` 一次 ≤100 个 SKU，每天北京时间 0 点更新；平台限流 40 次/秒。
- 偶发 `ECONNRESET`：只读接口重试即可，写接口不要自动重试。
- 授权：多次授权以最新一次为准；临时码 tempToken 10 分钟有效。
- 会改订单状态的不只是名字带「修改 / 提交」的接口：如 `/open-api/order/export-address` 在 `handleType: 2` 时会把订单从待处理流转到待发货，本工具按写接口处理。

