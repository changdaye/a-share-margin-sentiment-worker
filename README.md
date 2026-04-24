# a-share-margin-sentiment-worker

A Cloudflare Worker that sends a daily 17:00 Asia/Shanghai A-share market-wide margin sentiment digest.

## Features

- SSE/SZSE official data first
- Eastmoney fallback when official data is unavailable
- Feishu daily digest and alert messages
- Detailed Markdown report uploaded to Tencent COS
- Workers AI summary generation
- 24h heartbeat and failure alerting
- D1 + KV persistence

## Scope

This repository only covers market-wide margin sentiment. Industry, ETF, and single-stock variants belong in separate projects.
