CREATE TABLE IF NOT EXISTS whatsapp_senders (
  sender_hash TEXT PRIMARY KEY,
  case_id TEXT,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_deliveries (
  message_hash TEXT PRIMARY KEY,
  delivered_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS whatsapp_senders_updated ON whatsapp_senders (updated_at);
CREATE INDEX IF NOT EXISTS whatsapp_deliveries_delivered ON whatsapp_deliveries (delivered_at);
