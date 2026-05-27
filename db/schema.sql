create table if not exists group_wallets (
  chat_id text primary key,
  safe_address text not null,
  threshold integer not null,
  owners jsonb not null,
  created_at timestamptz not null
);

create table if not exists trade_proposals (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  proposer_telegram_id text not null,
  token_address text not null,
  input_amount_wei text not null,
  min_output_amount text not null,
  fee_amount_wei text not null,
  route text not null,
  status text not null,
  transactions jsonb not null,
  created_at timestamptz not null
);

create table if not exists flap_launches (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  proposer_telegram_id text not null,
  name text not null,
  symbol text not null,
  metadata_uri text not null,
  buy_tax_bps integer not null,
  sell_tax_bps integer not null,
  tax_duration_seconds integer not null,
  initial_buy_wei text not null,
  recipients jsonb not null,
  salt text not null,
  transactions jsonb not null,
  created_at timestamptz not null
);

create table if not exists safe_submissions (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  source_type text not null,
  source_id text not null,
  safe_address text not null,
  safe_tx_hash text not null,
  safe_transaction jsonb not null,
  transaction_service_url text not null,
  status text not null,
  sender_address text,
  submitted_at timestamptz,
  created_at timestamptz not null
);
