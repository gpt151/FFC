import fs from "fs/promises";
import os from "os";
import path from "path";
import { Pool, type PoolClient } from "pg";
import { computeClaimAmountCents, type FeeMode } from "./money";

export type RedPacketStatus =
  | "awaiting_payment"
  | "active"
  | "completed"
  | "expired"
  | "canceled";

export type FeeTransferStatus = "pending" | "completed" | "failed" | "self_retained";
export type ClaimTransferStatus = "processing" | "completed" | "failed";

export interface RedPacketRecord {
  id: number;
  public_id: string;
  red_packet_code: string;
  packet_type: "lucky" | "fixed";
  total_count: number;
  remaining_count: number;
  packet_amount_cents: number;
  remaining_amount_cents: number;
  fee_amount_cents: number;
  total_pay_cents: number;
  fee_rate: number;
  fee_mode: FeeMode;
  fee_recipient_email: string;
  fee_transfer_status: FeeTransferStatus;
  fee_transfer_error: string | null;
  fee_transferred_at: string | null;
  greeting: string;
  sender_name: string;
  sender_email: string | null;
  passphrase_hash: string | null;
  has_passphrase: boolean;
  payment_link_code: string;
  payment_link_id: number | null;
  payment_url: string;
  payer_email: string | null;
  payment_transaction_id: number | null;
  status: RedPacketStatus;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
}

export interface RedPacketClaimRecord {
  id: number;
  red_packet_id: number;
  red_packet_code: string;
  claimer_email: string;
  claimer_user_id: number | null;
  claim_method: "oauth" | "manual";
  amount_cents: number;
  transfer_status: ClaimTransferStatus;
  transfer_error: string | null;
  claimed_at: string;
}

export interface OAuthStateRecord {
  auth_code: string;
  secret_key: string;
  return_to: string;
  created_at: string;
}

export interface PlatformSettings {
  fee_rate: number;
  fee_recipient_email: string;
  fee_mode: FeeMode;
  allow_manual_claim_email: boolean;
  merchant_email: string;
  merchant_password: string;
  merchant_sess_id: string | null;
  merchant_sess_updated_at: string | null;
}

interface LocalStoreData {
  nextPacketId: number;
  nextClaimId: number;
  red_packets: RedPacketRecord[];
  red_packet_claims: RedPacketClaimRecord[];
  oauth_states: OAuthStateRecord[];
  platform_settings: Record<string, string>;
}

function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.NETLIFY === "true" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.cwd().startsWith("/var/task")
  );
}

function getLocalStorePath(): string {
  if (isServerlessRuntime()) {
    return path.join(os.tmpdir(), "lyt-redpacket-data", "store.json");
  }
  return path.join(process.cwd(), ".data", "store.json");
}

function getDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL_UNPOOLED
  );
}

export function isPostgresConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

export function isEphemeralWarning(): boolean {
  return !isPostgresConfigured() && isServerlessRuntime();
}

// Singleton Postgres Pool & fallback memory store across warm serverless instances
const globalForDb = globalThis as unknown as {
  __pgPool?: Pool;
  __pgInitialized?: Promise<void>;
  __localMutex?: Promise<unknown>;
  __memoryStore?: LocalStoreData;
};

function getPool(): Pool {
  if (!globalForDb.__pgPool) {
    const connStr = getDatabaseUrl();
    if (!connStr) {
      throw new Error("DATABASE_URL is not configured");
    }
    globalForDb.__pgPool = new Pool({
      connectionString: connStr,
      max: 10,
      ssl: connStr.includes("localhost") || connStr.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
    });
  }
  return globalForDb.__pgPool;
}

async function ensurePgSchema(): Promise<void> {
  if (!globalForDb.__pgInitialized) {
    globalForDb.__pgInitialized = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS red_packets (
          id SERIAL PRIMARY KEY,
          public_id VARCHAR(64) UNIQUE NOT NULL,
          red_packet_code VARCHAR(32) UNIQUE NOT NULL,
          packet_type VARCHAR(16) NOT NULL,
          total_count INTEGER NOT NULL,
          remaining_count INTEGER NOT NULL,
          packet_amount_cents INTEGER NOT NULL,
          remaining_amount_cents INTEGER NOT NULL,
          fee_amount_cents INTEGER NOT NULL,
          total_pay_cents INTEGER NOT NULL,
          fee_rate DOUBLE PRECISION NOT NULL,
          fee_mode VARCHAR(32) NOT NULL,
          fee_recipient_email VARCHAR(255) NOT NULL,
          fee_transfer_status VARCHAR(32) NOT NULL DEFAULT 'pending',
          fee_transfer_error TEXT,
          fee_transferred_at TIMESTAMPTZ,
          greeting TEXT NOT NULL,
          sender_name VARCHAR(120) NOT NULL,
          sender_email VARCHAR(255),
          passphrase_hash VARCHAR(128),
          has_passphrase BOOLEAN NOT NULL DEFAULT FALSE,
          payment_link_code VARCHAR(64) NOT NULL,
          payment_link_id INTEGER,
          payment_url TEXT NOT NULL,
          payer_email VARCHAR(255),
          payment_transaction_id INTEGER,
          status VARCHAR(32) NOT NULL DEFAULT 'awaiting_payment',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          paid_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_red_packets_code ON red_packets(red_packet_code);
        CREATE INDEX IF NOT EXISTS idx_red_packets_status ON red_packets(status);
        CREATE INDEX IF NOT EXISTS idx_red_packets_created_at ON red_packets(created_at DESC);

        CREATE TABLE IF NOT EXISTS red_packet_claims (
          id SERIAL PRIMARY KEY,
          red_packet_id INTEGER NOT NULL REFERENCES red_packets(id) ON DELETE CASCADE,
          red_packet_code VARCHAR(32) NOT NULL,
          claimer_email VARCHAR(255) NOT NULL,
          claimer_user_id INTEGER,
          claim_method VARCHAR(16) NOT NULL,
          amount_cents INTEGER NOT NULL,
          transfer_status VARCHAR(32) NOT NULL DEFAULT 'processing',
          transfer_error TEXT,
          claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_claims_packet_id ON red_packet_claims(red_packet_id);
        CREATE INDEX IF NOT EXISTS idx_claims_email ON red_packet_claims(LOWER(claimer_email));

        CREATE TABLE IF NOT EXISTS oauth_states (
          auth_code VARCHAR(64) PRIMARY KEY,
          secret_key VARCHAR(128) NOT NULL,
          return_to TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS platform_settings (
          key VARCHAR(64) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    })();
  }
  await globalForDb.__pgInitialized;
}

async function withLocalMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalForDb.__localMutex || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  globalForDb.__localMutex = prev.then(() => next, () => next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function createEmptyStore(): LocalStoreData {
  return {
    nextPacketId: 1,
    nextClaimId: 1,
    red_packets: [],
    red_packet_claims: [],
    oauth_states: [],
    platform_settings: {},
  };
}

async function readLocalStore(): Promise<LocalStoreData> {
  if (globalForDb.__memoryStore) {
    return globalForDb.__memoryStore;
  }
  try {
    const raw = await fs.readFile(getLocalStorePath(), "utf8");
    const parsed = JSON.parse(raw) as LocalStoreData;
    globalForDb.__memoryStore = parsed;
    return parsed;
  } catch {
    const empty = createEmptyStore();
    globalForDb.__memoryStore = empty;
    return empty;
  }
}

async function writeLocalStore(data: LocalStoreData): Promise<void> {
  globalForDb.__memoryStore = data;
  try {
    const storePath = getLocalStorePath();
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // Ignore read-only FS errors in restricted runtimes; in-memory store still persists for the instance.
  }
}

function normalizePgPacket(row: Record<string, unknown>): RedPacketRecord {
  return {
    id: Number(row.id),
    public_id: String(row.public_id),
    red_packet_code: String(row.red_packet_code),
    packet_type: row.packet_type === "fixed" ? "fixed" : "lucky",
    total_count: Number(row.total_count),
    remaining_count: Number(row.remaining_count),
    packet_amount_cents: Number(row.packet_amount_cents),
    remaining_amount_cents: Number(row.remaining_amount_cents),
    fee_amount_cents: Number(row.fee_amount_cents),
    total_pay_cents: Number(row.total_pay_cents),
    fee_rate: Number(row.fee_rate),
    fee_mode: row.fee_mode === "deduct_from_packet" ? "deduct_from_packet" : "sender_pays",
    fee_recipient_email: String(row.fee_recipient_email),
    fee_transfer_status: row.fee_transfer_status as FeeTransferStatus,
    fee_transfer_error: row.fee_transfer_error ? String(row.fee_transfer_error) : null,
    fee_transferred_at: row.fee_transferred_at ? new Date(String(row.fee_transferred_at)).toISOString() : null,
    greeting: String(row.greeting),
    sender_name: String(row.sender_name),
    sender_email: row.sender_email ? String(row.sender_email) : null,
    passphrase_hash: row.passphrase_hash ? String(row.passphrase_hash) : null,
    has_passphrase: Boolean(row.has_passphrase),
    payment_link_code: String(row.payment_link_code),
    payment_link_id: row.payment_link_id !== null && row.payment_link_id !== undefined ? Number(row.payment_link_id) : null,
    payment_url: String(row.payment_url),
    payer_email: row.payer_email ? String(row.payer_email) : null,
    payment_transaction_id:
      row.payment_transaction_id !== null && row.payment_transaction_id !== undefined
        ? Number(row.payment_transaction_id)
        : null,
    status: row.status as RedPacketStatus,
    created_at: new Date(String(row.created_at)).toISOString(),
    paid_at: row.paid_at ? new Date(String(row.paid_at)).toISOString() : null,
    expires_at: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
  };
}

function normalizePgClaim(row: Record<string, unknown>): RedPacketClaimRecord {
  return {
    id: Number(row.id),
    red_packet_id: Number(row.red_packet_id),
    red_packet_code: String(row.red_packet_code),
    claimer_email: String(row.claimer_email),
    claimer_user_id:
      row.claimer_user_id !== null && row.claimer_user_id !== undefined
        ? Number(row.claimer_user_id)
        : null,
    claim_method: row.claim_method === "oauth" ? "oauth" : "manual",
    amount_cents: Number(row.amount_cents),
    transfer_status: row.transfer_status as ClaimTransferStatus,
    transfer_error: row.transfer_error ? String(row.transfer_error) : null,
    claimed_at: new Date(String(row.claimed_at)).toISOString(),
  };
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const defaultFeeRate = parseFloat(process.env.FEE_RATE || "0.05");
  const defaultFeeRecipient = process.env.FEE_RECIPIENT_EMAIL || "1218545105@qq.com";
  const defaultFeeMode: FeeMode =
    process.env.FEE_MODE === "deduct_from_packet" ? "deduct_from_packet" : "sender_pays";

  let map: Record<string, string> = {};
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const { rows } = await getPool().query("SELECT key, value FROM platform_settings");
    for (const row of rows) {
      map[String(row.key)] = String(row.value);
    }
  } else {
    map = await withLocalMutex(async () => (await readLocalStore()).platform_settings);
  }

  return {
    fee_rate: map.fee_rate ? parseFloat(map.fee_rate) : Number.isFinite(defaultFeeRate) ? defaultFeeRate : 0.05,
    fee_recipient_email: map.fee_recipient_email || defaultFeeRecipient,
    fee_mode:
      map.fee_mode === "deduct_from_packet" || map.fee_mode === "sender_pays"
        ? map.fee_mode
        : defaultFeeMode,
    allow_manual_claim_email: map.allow_manual_claim_email !== "false",
    merchant_email: map.merchant_email || process.env.LYT_MERCHANT_EMAIL || "",
    merchant_password: map.merchant_password || process.env.LYT_MERCHANT_PASSWORD || "",
    merchant_sess_id: map.merchant_sess_id || null,
    merchant_sess_updated_at: map.merchant_sess_updated_at || null,
  };
}

export async function updatePlatformSettings(entries: Record<string, string>): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const pool = getPool();
    for (const [key, value] of Object.entries(entries)) {
      await pool.query(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );
    }
    return;
  }

  await withLocalMutex(async () => {
    const store = await readLocalStore();
    for (const [key, value] of Object.entries(entries)) {
      store.platform_settings[key] = value;
    }
    await writeLocalStore(store);
  });
}

export async function saveOAuthState(record: OAuthStateRecord): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    await getPool().query(
      `INSERT INTO oauth_states (auth_code, secret_key, return_to, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (auth_code) DO UPDATE SET secret_key = EXCLUDED.secret_key, return_to = EXCLUDED.return_to`,
      [record.auth_code, record.secret_key, record.return_to, record.created_at]
    );
    return;
  }

  await withLocalMutex(async () => {
    const store = await readLocalStore();
    store.oauth_states = store.oauth_states.filter((s) => s.auth_code !== record.auth_code);
    store.oauth_states.push(record);
    // Keep only recent 200 states
    if (store.oauth_states.length > 200) {
      store.oauth_states = store.oauth_states.slice(-200);
    }
    await writeLocalStore(store);
  });
}

export async function getAndDeleteOAuthState(authCode: string): Promise<OAuthStateRecord | null> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const { rows } = await getPool().query(
      "DELETE FROM oauth_states WHERE auth_code = $1 RETURNING auth_code, secret_key, return_to, created_at",
      [authCode]
    );
    if (!rows[0]) return null;
    return {
      auth_code: String(rows[0].auth_code),
      secret_key: String(rows[0].secret_key),
      return_to: String(rows[0].return_to),
      created_at: new Date(String(rows[0].created_at)).toISOString(),
    };
  }

  return withLocalMutex(async () => {
    const store = await readLocalStore();
    const idx = store.oauth_states.findIndex((s) => s.auth_code === authCode);
    if (idx === -1) return null;
    const [found] = store.oauth_states.splice(idx, 1);
    await writeLocalStore(store);
    return found;
  });
}

export async function createRedPacketRecord(
  input: Omit<RedPacketRecord, "id" | "created_at" | "paid_at" | "fee_transferred_at">
): Promise<RedPacketRecord> {
  const now = new Date().toISOString();
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const { rows } = await getPool().query(
      `INSERT INTO red_packets (
        public_id, red_packet_code, packet_type, total_count, remaining_count,
        packet_amount_cents, remaining_amount_cents, fee_amount_cents, total_pay_cents,
        fee_rate, fee_mode, fee_recipient_email, fee_transfer_status, fee_transfer_error,
        greeting, sender_name, sender_email, passphrase_hash, has_passphrase,
        payment_link_code, payment_link_id, payment_url, payer_email, payment_transaction_id,
        status, created_at, expires_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
      ) RETURNING *`,
      [
        input.public_id,
        input.red_packet_code,
        input.packet_type,
        input.total_count,
        input.remaining_count,
        input.packet_amount_cents,
        input.remaining_amount_cents,
        input.fee_amount_cents,
        input.total_pay_cents,
        input.fee_rate,
        input.fee_mode,
        input.fee_recipient_email,
        input.fee_transfer_status,
        input.fee_transfer_error,
        input.greeting,
        input.sender_name,
        input.sender_email,
        input.passphrase_hash,
        input.has_passphrase,
        input.payment_link_code,
        input.payment_link_id,
        input.payment_url,
        input.payer_email,
        input.payment_transaction_id,
        input.status,
        now,
        input.expires_at,
      ]
    );
    return normalizePgPacket(rows[0]);
  }

  return withLocalMutex(async () => {
    const store = await readLocalStore();
    const record: RedPacketRecord = {
      ...input,
      id: store.nextPacketId++,
      created_at: now,
      paid_at: null,
      fee_transferred_at: null,
    };
    store.red_packets.push(record);
    await writeLocalStore(store);
    return record;
  });
}

export async function getRedPacketByPublicId(publicId: string): Promise<RedPacketRecord | null> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const { rows } = await getPool().query("SELECT * FROM red_packets WHERE public_id = $1", [
      publicId,
    ]);
    return rows[0] ? normalizePgPacket(rows[0]) : null;
  }
  return withLocalMutex(async () => {
    const store = await readLocalStore();
    return store.red_packets.find((p) => p.public_id === publicId) || null;
  });
}

export async function rehydrateRedPacketRecord(
  snapshot: Omit<RedPacketRecord, "id">
): Promise<RedPacketRecord> {
  const existing = await getRedPacketByPublicId(snapshot.public_id);
  if (existing) return existing;

  if (isPostgresConfigured()) {
    return createRedPacketRecord({
      public_id: snapshot.public_id,
      red_packet_code: snapshot.red_packet_code,
      packet_type: snapshot.packet_type,
      total_count: snapshot.total_count,
      remaining_count: snapshot.remaining_count,
      packet_amount_cents: snapshot.packet_amount_cents,
      remaining_amount_cents: snapshot.remaining_amount_cents,
      fee_amount_cents: snapshot.fee_amount_cents,
      total_pay_cents: snapshot.total_pay_cents,
      fee_rate: snapshot.fee_rate,
      fee_mode: snapshot.fee_mode,
      fee_recipient_email: snapshot.fee_recipient_email,
      fee_transfer_status: snapshot.fee_transfer_status,
      fee_transfer_error: snapshot.fee_transfer_error,
      greeting: snapshot.greeting,
      sender_name: snapshot.sender_name,
      sender_email: snapshot.sender_email,
      passphrase_hash: snapshot.passphrase_hash,
      has_passphrase: snapshot.has_passphrase,
      payment_link_code: snapshot.payment_link_code,
      payment_link_id: snapshot.payment_link_id,
      payment_url: snapshot.payment_url,
      payer_email: snapshot.payer_email,
      payment_transaction_id: snapshot.payment_transaction_id,
      status: snapshot.status,
      expires_at: snapshot.expires_at,
    });
  }

  return withLocalMutex(async () => {
    const store = await readLocalStore();
    const found = store.red_packets.find((p) => p.public_id === snapshot.public_id);
    if (found) return found;
    const record: RedPacketRecord = {
      ...snapshot,
      id: store.nextPacketId++,
    };
    store.red_packets.push(record);
    await writeLocalStore(store);
    return record;
  });
}

export async function getRedPacketByCode(code: string): Promise<RedPacketRecord | null> {
  const normalized = code.trim().toUpperCase();
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const { rows } = await getPool().query(
      "SELECT * FROM red_packets WHERE UPPER(red_packet_code) = $1",
      [normalized]
    );
    return rows[0] ? normalizePgPacket(rows[0]) : null;
  }
  return withLocalMutex(async () => {
    const store = await readLocalStore();
    return (
      store.red_packets.find((p) => p.red_packet_code.toUpperCase() === normalized) || null
    );
  });
}

export async function getClaimsByPacketId(packetId: number): Promise<RedPacketClaimRecord[]> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const { rows } = await getPool().query(
      "SELECT * FROM red_packet_claims WHERE red_packet_id = $1 ORDER BY claimed_at DESC",
      [packetId]
    );
    return rows.map(normalizePgClaim);
  }
  return withLocalMutex(async () => {
    const store = await readLocalStore();
    return store.red_packet_claims
      .filter((c) => c.red_packet_id === packetId)
      .sort((a, b) => b.claimed_at.localeCompare(a.claimed_at));
  });
}

export async function activateRedPacketOnPayment(params: {
  publicId: string;
  payerEmail: string | null;
  paymentLinkId: number;
  paymentTransactionId: number | null;
  paidAt: string;
}): Promise<{ packet: RedPacketRecord; justActivated: boolean }> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT * FROM red_packets WHERE public_id = $1 FOR UPDATE",
        [params.publicId]
      );
      if (!rows[0]) {
        throw new Error("红包订单不存在");
      }
      const existing = normalizePgPacket(rows[0]);
      if (existing.status !== "awaiting_payment") {
        await client.query("COMMIT");
        return { packet: existing, justActivated: false };
      }

      const { rows: updated } = await client.query(
        `UPDATE red_packets
         SET status = 'active',
             payer_email = COALESCE($2, payer_email),
             sender_email = COALESCE(sender_email, $2),
             payment_link_id = $3,
             payment_transaction_id = $4,
             paid_at = $5
         WHERE id = $1
         RETURNING *`,
        [
          existing.id,
          params.payerEmail,
          params.paymentLinkId,
          params.paymentTransactionId,
          params.paidAt,
        ]
      );
      await client.query("COMMIT");
      return { packet: normalizePgPacket(updated[0]), justActivated: true };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return withLocalMutex(async () => {
    const store = await readLocalStore();
    const packet = store.red_packets.find((p) => p.public_id === params.publicId);
    if (!packet) throw new Error("红包订单不存在");
    if (packet.status !== "awaiting_payment") {
      return { packet, justActivated: false };
    }
    packet.status = "active";
    packet.payer_email = params.payerEmail || packet.payer_email;
    packet.sender_email = packet.sender_email || params.payerEmail;
    packet.payment_link_id = params.paymentLinkId;
    packet.payment_transaction_id = params.paymentTransactionId;
    packet.paid_at = params.paidAt;
    await writeLocalStore(store);
    return { packet, justActivated: true };
  });
}

export async function updateRedPacketFeeStatus(params: {
  packetId: number;
  status: FeeTransferStatus;
  error?: string | null;
}): Promise<void> {
  const transferredAt =
    params.status === "completed" || params.status === "self_retained"
      ? new Date().toISOString()
      : null;

  if (isPostgresConfigured()) {
    await ensurePgSchema();
    await getPool().query(
      `UPDATE red_packets
       SET fee_transfer_status = $2,
           fee_transfer_error = $3,
           fee_transferred_at = COALESCE($4, fee_transferred_at)
       WHERE id = $1`,
      [params.packetId, params.status, params.error || null, transferredAt]
    );
    return;
  }

  await withLocalMutex(async () => {
    const store = await readLocalStore();
    const packet = store.red_packets.find((p) => p.id === params.packetId);
    if (packet) {
      packet.fee_transfer_status = params.status;
      packet.fee_transfer_error = params.error || null;
      if (transferredAt) packet.fee_transferred_at = transferredAt;
      await writeLocalStore(store);
    }
  });
}

export async function updateRedPacketStatus(
  packetId: number,
  status: RedPacketStatus
): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    await getPool().query("UPDATE red_packets SET status = $2 WHERE id = $1", [packetId, status]);
    return;
  }
  await withLocalMutex(async () => {
    const store = await readLocalStore();
    const packet = store.red_packets.find((p) => p.id === packetId);
    if (packet) {
      packet.status = status;
      await writeLocalStore(store);
    }
  });
}

/**
 * Atomically reserves a share of a red packet before calling Lyt IT Pay transfer.
 */
export async function reserveRedPacketShare(params: {
  code: string;
  claimerEmail: string;
  claimerUserId: number | null;
  claimMethod: "oauth" | "manual";
  passphraseHash: string | null;
}): Promise<{ packet: RedPacketRecord; claim: RedPacketClaimRecord }> {
  const normalizedCode = params.code.trim().toUpperCase();
  const normalizedEmail = params.claimerEmail.trim().toLowerCase();

  const validateAndReserve = (
    packet: RedPacketRecord,
    existingClaims: RedPacketClaimRecord[]
  ): {
    amountCents: number;
    nextRemainingCount: number;
    nextRemainingAmount: number;
    nextStatus: RedPacketStatus;
  } => {
    if (packet.status === "awaiting_payment") {
      throw new Error("该红包尚未完成付款激活");
    }
    if (packet.status === "canceled") {
      throw new Error("该红包已被取消");
    }
    if (packet.expires_at && new Date(packet.expires_at).getTime() < Date.now()) {
      throw new Error("该红包已过期");
    }
    if (packet.status === "completed" || packet.remaining_count <= 0 || packet.remaining_amount_cents <= 0) {
      throw new Error("手慢了，红包已经被领完啦");
    }
    if (packet.has_passphrase) {
      if (!params.passphraseHash || params.passphraseHash !== packet.passphrase_hash) {
        throw new Error("红包口令不正确");
      }
    }
    const already = existingClaims.find(
      (c) =>
        c.claimer_email.toLowerCase() === normalizedEmail &&
        (c.transfer_status === "completed" || c.transfer_status === "processing")
    );
    if (already) {
      throw new Error("您已经领取过这个红包啦，每人限领一次");
    }

    const amountCents = computeClaimAmountCents(
      packet.remaining_amount_cents,
      packet.remaining_count,
      packet.packet_type
    );
    const nextRemainingCount = packet.remaining_count - 1;
    const nextRemainingAmount = packet.remaining_amount_cents - amountCents;
    const nextStatus: RedPacketStatus = nextRemainingCount === 0 ? "completed" : "active";

    return { amountCents, nextRemainingCount, nextRemainingAmount, nextStatus };
  };

  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const client: PoolClient = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows: pRows } = await client.query(
        "SELECT * FROM red_packets WHERE UPPER(red_packet_code) = $1 FOR UPDATE",
        [normalizedCode]
      );
      if (!pRows[0]) {
        throw new Error("红包码无效或红包不存在");
      }
      const packet = normalizePgPacket(pRows[0]);
      const { rows: cRows } = await client.query(
        "SELECT * FROM red_packet_claims WHERE red_packet_id = $1",
        [packet.id]
      );
      const existingClaims = cRows.map(normalizePgClaim);
      const { amountCents, nextRemainingCount, nextRemainingAmount, nextStatus } =
        validateAndReserve(packet, existingClaims);

      const { rows: updatedPRows } = await client.query(
        `UPDATE red_packets
         SET remaining_count = $2,
             remaining_amount_cents = $3,
             status = $4
         WHERE id = $1
         RETURNING *`,
        [packet.id, nextRemainingCount, nextRemainingAmount, nextStatus]
      );

      const { rows: insertedClaim } = await client.query(
        `INSERT INTO red_packet_claims (
          red_packet_id, red_packet_code, claimer_email, claimer_user_id,
          claim_method, amount_cents, transfer_status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'processing')
        RETURNING *`,
        [
          packet.id,
          packet.red_packet_code,
          params.claimerEmail.trim(),
          params.claimerUserId,
          params.claimMethod,
          amountCents,
        ]
      );

      await client.query("COMMIT");
      return {
        packet: normalizePgPacket(updatedPRows[0]),
        claim: normalizePgClaim(insertedClaim[0]),
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return withLocalMutex(async () => {
    const store = await readLocalStore();
    const packet = store.red_packets.find(
      (p) => p.red_packet_code.toUpperCase() === normalizedCode
    );
    if (!packet) throw new Error("红包码无效或红包不存在");
    const existingClaims = store.red_packet_claims.filter((c) => c.red_packet_id === packet.id);
    const { amountCents, nextRemainingCount, nextRemainingAmount, nextStatus } =
      validateAndReserve(packet, existingClaims);

    packet.remaining_count = nextRemainingCount;
    packet.remaining_amount_cents = nextRemainingAmount;
    packet.status = nextStatus;

    const claim: RedPacketClaimRecord = {
      id: store.nextClaimId++,
      red_packet_id: packet.id,
      red_packet_code: packet.red_packet_code,
      claimer_email: params.claimerEmail.trim(),
      claimer_user_id: params.claimerUserId,
      claim_method: params.claimMethod,
      amount_cents: amountCents,
      transfer_status: "processing",
      transfer_error: null,
      claimed_at: new Date().toISOString(),
    };
    store.red_packet_claims.push(claim);
    await writeLocalStore(store);
    return { packet, claim };
  });
}

export async function completeClaimTransfer(claimId: number): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    await getPool().query(
      "UPDATE red_packet_claims SET transfer_status = 'completed', transfer_error = NULL WHERE id = $1",
      [claimId]
    );
    return;
  }

  await withLocalMutex(async () => {
    const store = await readLocalStore();
    const claim = store.red_packet_claims.find((c) => c.id === claimId);
    if (claim) {
      claim.transfer_status = "completed";
      claim.transfer_error = null;
      await writeLocalStore(store);
    }
  });
}

export async function rollbackClaimReservation(params: {
  packetId: number;
  claimId: number;
  amountCents: number;
  error: string;
}): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE red_packets
         SET remaining_count = remaining_count + 1,
             remaining_amount_cents = remaining_amount_cents + $2,
             status = CASE WHEN status = 'completed' THEN 'active' ELSE status END
         WHERE id = $1`,
        [params.packetId, params.amountCents]
      );
      await client.query(
        "UPDATE red_packet_claims SET transfer_status = 'failed', transfer_error = $2 WHERE id = $1",
        [params.claimId, params.error]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  await withLocalMutex(async () => {
    const store = await readLocalStore();
    const packet = store.red_packets.find((p) => p.id === params.packetId);
    if (packet) {
      packet.remaining_count += 1;
      packet.remaining_amount_cents += params.amountCents;
      if (packet.status === "completed") packet.status = "active";
    }
    const claim = store.red_packet_claims.find((c) => c.id === params.claimId);
    if (claim) {
      claim.transfer_status = "failed";
      claim.transfer_error = params.error;
    }
    await writeLocalStore(store);
  });
}

export async function getUserHistory(email: string): Promise<{
  sent: RedPacketRecord[];
  received: Array<RedPacketClaimRecord & { greeting: string; sender_name: string }>;
}> {
  const normalized = email.trim().toLowerCase();
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const { rows: sentRows } = await getPool().query(
      `SELECT * FROM red_packets
       WHERE LOWER(COALESCE(sender_email, '')) = $1 OR LOWER(COALESCE(payer_email, '')) = $1
       ORDER BY created_at DESC LIMIT 50`,
      [normalized]
    );
    const { rows: recvRows } = await getPool().query(
      `SELECT c.*, p.greeting, p.sender_name
       FROM red_packet_claims c
       JOIN red_packets p ON c.red_packet_id = p.id
       WHERE LOWER(c.claimer_email) = $1 AND c.transfer_status = 'completed'
       ORDER BY c.claimed_at DESC LIMIT 50`,
      [normalized]
    );
    return {
      sent: sentRows.map(normalizePgPacket),
      received: recvRows.map((r) => ({
        ...normalizePgClaim(r),
        greeting: String(r.greeting),
        sender_name: String(r.sender_name),
      })),
    };
  }

  return withLocalMutex(async () => {
    const store = await readLocalStore();
    const sent = store.red_packets
      .filter(
        (p) =>
          p.sender_email?.toLowerCase() === normalized ||
          p.payer_email?.toLowerCase() === normalized
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50);

    const received = store.red_packet_claims
      .filter(
        (c) =>
          c.claimer_email.toLowerCase() === normalized &&
          c.transfer_status === "completed"
      )
      .sort((a, b) => b.claimed_at.localeCompare(a.claimed_at))
      .slice(0, 50)
      .map((c) => {
        const packet = store.red_packets.find((p) => p.id === c.red_packet_id);
        return {
          ...c,
          greeting: packet?.greeting || "恭喜发财，大吉大利",
          sender_name: packet?.sender_name || "Lyt IT Pay 用户",
        };
      });

    return { sent, received };
  });
}

export async function getAllAdminData(): Promise<{
  packets: RedPacketRecord[];
  claims: RedPacketClaimRecord[];
}> {
  if (isPostgresConfigured()) {
    await ensurePgSchema();
    const { rows: pRows } = await getPool().query(
      "SELECT * FROM red_packets ORDER BY created_at DESC"
    );
    const { rows: cRows } = await getPool().query(
      "SELECT * FROM red_packet_claims ORDER BY claimed_at DESC"
    );
    return {
      packets: pRows.map(normalizePgPacket),
      claims: cRows.map(normalizePgClaim),
    };
  }

  return withLocalMutex(async () => {
    const store = await readLocalStore();
    return {
      packets: [...store.red_packets].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      ),
      claims: [...store.red_packet_claims].sort((a, b) =>
        b.claimed_at.localeCompare(a.claimed_at)
      ),
    };
  });
}

