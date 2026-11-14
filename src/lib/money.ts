import crypto from "crypto";

export type FeeMode = "sender_pays" | "deduct_from_packet";

export function toCents(amount: number | string): number {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface FeeBreakdown {
  packetAmountCents: number;
  feeAmountCents: number;
  totalPayCents: number;
  feeRate: number;
  feeMode: FeeMode;
}

/**
 * Calculate red packet pool, 5% platform fee, and total payment amount in integer cents.
 */
export function calculateFeeBreakdown(
  inputAmountCents: number,
  feeRate = 0.05,
  feeMode: FeeMode = "sender_pays"
): FeeBreakdown {
  if (feeMode === "deduct_from_packet") {
    const feeAmountCents = Math.max(1, Math.round(inputAmountCents * feeRate));
    const packetAmountCents = inputAmountCents - feeAmountCents;
    return {
      packetAmountCents,
      feeAmountCents,
      totalPayCents: inputAmountCents,
      feeRate,
      feeMode,
    };
  }

  // Default: sender_pays — packet pool stays clean, 5% fee is added on top
  const feeAmountCents = Math.max(1, Math.round(inputAmountCents * feeRate));
  const totalPayCents = inputAmountCents + feeAmountCents;
  return {
    packetAmountCents: inputAmountCents,
    feeAmountCents,
    totalPayCents,
    feeRate,
    feeMode,
  };
}

/**
 * Double-mean algorithm for lucky red packets, or equal split for fixed packets.
 * Guarantees each share is at least 1 cent (0.01).
 */
export function computeClaimAmountCents(
  remainingAmountCents: number,
  remainingCount: number,
  packetType: "lucky" | "fixed"
): number {
  if (remainingCount <= 1) {
    return remainingAmountCents;
  }

  if (packetType === "fixed") {
    const base = Math.floor(remainingAmountCents / remainingCount);
    return Math.max(1, base);
  }

  // Lucky double-mean algorithm
  const min = 1;
  const maxAllowed = remainingAmountCents - (remainingCount - 1) * min;
  const doubleMean = Math.floor((remainingAmountCents / remainingCount) * 2);
  const max = Math.max(min, Math.min(maxAllowed, doubleMean));
  if (max <= min) return min;
  return crypto.randomInt(min, max + 1);
}

export function generateRedPacketCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (len: number) => {
    let out = "";
    for (let i = 0; i < len; i++) {
      out += chars[crypto.randomInt(0, chars.length)];
    }
    return out;
  };
  return `LYT-${part(4)}-${part(4)}`;
}

export function generateOrderId(): string {
  return `rp_${crypto.randomBytes(8).toString("hex")}`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "匿名用户";
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) return `***${email.slice(atIndex)}`;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const prefix = local.slice(0, Math.min(3, Math.max(1, local.length - 2)));
  return `${prefix}***${domain}`;
}
