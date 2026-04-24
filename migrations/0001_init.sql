CREATE TABLE IF NOT EXISTS market_daily_snapshots (
  trade_date TEXT PRIMARY KEY,
  source_strategy TEXT NOT NULL,
  sse_available INTEGER NOT NULL,
  szse_available INTEGER NOT NULL,
  eastmoney_used INTEGER NOT NULL,
  financing_balance REAL NOT NULL,
  securities_lending_balance REAL NOT NULL,
  margin_balance_total REAL NOT NULL,
  financing_buy REAL NOT NULL,
  financing_repay REAL NOT NULL,
  financing_net_buy REAL NOT NULL,
  lending_sell REAL,
  lending_repay REAL,
  lending_net_sell REAL,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_daily_signals (
  trade_date TEXT PRIMARY KEY,
  financing_balance_pct_250 REAL NOT NULL,
  financing_net_buy_1d_pct_250 REAL NOT NULL,
  financing_net_buy_5d REAL NOT NULL,
  financing_net_buy_5d_pct_250 REAL NOT NULL,
  financing_net_buy_10d REAL NOT NULL,
  lending_balance_pct_250 REAL,
  sentiment_level TEXT NOT NULL,
  alert_state TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_runs (
  id TEXT PRIMARY KEY,
  trade_date TEXT,
  run_type TEXT NOT NULL,
  alert_direction TEXT,
  message_text TEXT NOT NULL,
  report_url TEXT,
  feishu_push_ok INTEGER NOT NULL,
  push_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
