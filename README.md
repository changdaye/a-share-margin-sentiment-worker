# a-share-margin-sentiment-worker

一个基于 **Cloudflare Workers + D1 + KV + Workers AI** 的 A 股两融全市场情绪日报项目。

它会在 **每天 17:00（Asia/Shanghai）** 拉取全市场两融总览，优先使用 **上交所 / 深交所官方数据**，在官方数据不足时回退到 **东方财富聚合数据**，生成一条飞书收盘总结，并将详细版 Markdown 报告上传到 **腾讯云 COS**。

## 功能

- 每日 17:00（Asia/Shanghai）固定推送一条收盘总结
- 数据源优先级：**SSE / SZSE 官方 > 东方财富兜底**
- 融资为主、融券为辅的市场情绪判断
- 命中过热 / 转冷规则时额外发送预警
- 详细版 Markdown 报告上传腾讯云 COS
- 使用 Workers AI 生成中文摘要
- 24 小时心跳
- 连续失败告警
- Admin 手动触发接口
- D1 保存市场快照、信号结果、消息发送记录
- KV 保存运行时状态

## 项目边界

这个仓库 **只做 A 股两融全市场总览**。

不包含：

- 行业两融
- 宽基 ETF 两融
- 个股两融
- 盘中高频预警

这些能力应放在后续单独仓库中实现。

## 数据源策略

1. 优先抓取上交所 / 深交所官方数据
2. 若任一官方源缺失，则启用东方财富聚合数据补齐
3. 若官方与东方财富存在冲突，则以官方为准

> 当前首版已稳定接入上交所官方汇总与东方财富聚合汇总；深交所官方页面解析保留接入口，必要时会由东方财富补位。

## 输出内容

### 飞书短消息

- 当日情绪结论
- 融资余额 / 当日融资净买入 / 5 日融资净买入
- 历史分位判断
- 详细版报告链接

### 详细版报告

详细版 Markdown 报告会上传到腾讯云 COS，key 规则为：

- 前缀：`a-share-margin-sentiment-worker/`
- 文件名：UTC 时间戳（`YYYYMMDDHHMMSS.md`）

## 本地开发

```bash
npm install
npm run check
npx wrangler dev
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

手动触发：

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_MANUAL_TRIGGER_TOKEN" \
  http://127.0.0.1:8787/admin/trigger
```

## Cloudflare 资源绑定

需要创建并绑定：

- 一个 D1 数据库：`a-share-margin-sentiment-worker`
- 一个 KV namespace：运行状态
- 一个 AI binding：`AI`

将生成的绑定 ID 回填到 `wrangler.jsonc` 中：

- `kv_namespaces[].id`
- `kv_namespaces[].preview_id`
- `d1_databases[].database_id`

## 环境变量

### Wrangler vars

已在 `wrangler.jsonc` 提供默认值：

- `RUN_HOUR_LOCAL=17`
- `RUN_MINUTE_LOCAL=0`
- `MARKET_TIMEZONE=Asia/Shanghai`
- `HEARTBEAT_INTERVAL_HOURS=24`
- `REQUEST_TIMEOUT_MS=15000`
- `LOOKBACK_DAYS=250`
- `ALERT_COOLDOWN_HOURS=24`
- `FAILURE_ALERT_THRESHOLD=1`
- `FAILURE_ALERT_COOLDOWN_MINUTES=180`
- `LLM_MODEL=@cf/meta/llama-3.1-8b-instruct`

### Secrets

通过 `.dev.vars` 或 Cloudflare secrets 提供：

- `FEISHU_WEBHOOK`
- `FEISHU_SECRET`
- `MANUAL_TRIGGER_TOKEN`
- `TENCENT_COS_SECRET_ID`
- `TENCENT_COS_SECRET_KEY`
- `TENCENT_COS_BUCKET`
- `TENCENT_COS_REGION`
- `TENCENT_COS_BASE_URL`（可选）

## D1 初始化

```bash
npx wrangler d1 create a-share-margin-sentiment-worker
npx wrangler kv namespace create RUNTIME_KV
npx wrangler d1 migrations apply a-share-margin-sentiment-worker --local
npx wrangler d1 migrations apply a-share-margin-sentiment-worker --remote
```

## 风险说明

- 交易所页面结构未来可能变化，导致官方抓取逻辑需要调整
- 深交所官方日度页面首版仍以“可接入但不保证稳定解析”为目标，缺失时会由东方财富补位
- 东方财富数据只作为兜底，不反向覆盖官方口径
- 第一版只做全市场总览，不能替代行业或个股层面的资金分析
- 本项目不构成投资建议
