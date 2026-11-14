import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  getAllAdminData,
  getPlatformSettings,
  isEphemeralWarning,
  isPostgresConfigured,
} from "@/lib/db";
import { formatCents } from "@/lib/money";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ status: "error", message: "未登录管理后台" }, { status: 401 });
  }

  try {
    const [{ packets, claims }, settings] = await Promise.all([
      getAllAdminData(),
      getPlatformSettings(),
    ]);

    const paidPackets = packets.filter(
      (p) => p.status === "active" || p.status === "completed" || p.status === "expired"
    );
    const completedClaims = claims.filter((c) => c.transfer_status === "completed");

    const totalVolumeCents = paidPackets.reduce((sum, p) => sum + p.total_pay_cents, 0);
    const totalPacketPoolCents = paidPackets.reduce((sum, p) => sum + p.packet_amount_cents, 0);
    const totalFeeCents = paidPackets.reduce((sum, p) => sum + p.fee_amount_cents, 0);
    const settledFeeCents = paidPackets
      .filter((p) => p.fee_transfer_status === "completed" || p.fee_transfer_status === "self_retained")
      .reduce((sum, p) => sum + p.fee_amount_cents, 0);
    const failedFeeCents = paidPackets
      .filter((p) => p.fee_transfer_status === "failed" || p.fee_transfer_status === "pending")
      .reduce((sum, p) => sum + p.fee_amount_cents, 0);
    const totalClaimedCents = completedClaims.reduce((sum, c) => sum + c.amount_cents, 0);
    const totalUnclaimedCents = paidPackets.reduce((sum, p) => sum + p.remaining_amount_cents, 0);

    // Build 14-day daily chart series
    const daysMap = new Map<
      string,
      { date: string; volumeCents: number; feeCents: number; claimCount: number; packetCount: number }
    >();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400 * 1000);
      const key = d.toISOString().slice(0, 10);
      daysMap.set(key, {
        date: key.slice(5),
        volumeCents: 0,
        feeCents: 0,
        claimCount: 0,
        packetCount: 0,
      });
    }

    for (const p of paidPackets) {
      const key = (p.paid_at || p.created_at).slice(0, 10);
      const entry = daysMap.get(key);
      if (entry) {
        entry.volumeCents += p.total_pay_cents;
        entry.feeCents += p.fee_amount_cents;
        entry.packetCount += 1;
      }
    }

    for (const c of completedClaims) {
      const key = c.claimed_at.slice(0, 10);
      const entry = daysMap.get(key);
      if (entry) {
        entry.claimCount += 1;
      }
    }

    const dailySeries = Array.from(daysMap.values()).map((d) => ({
      date: d.date,
      volume: Number((d.volumeCents / 100).toFixed(2)),
      fee: Number((d.feeCents / 100).toFixed(2)),
      claimCount: d.claimCount,
      packetCount: d.packetCount,
    }));

    return NextResponse.json({
      status: "success",
      data: {
        summary: {
          totalPackets: packets.length,
          paidPacketsCount: paidPackets.length,
          awaitingPaymentCount: packets.filter((p) => p.status === "awaiting_payment").length,
          activeCount: packets.filter((p) => p.status === "active").length,
          completedCount: packets.filter((p) => p.status === "completed").length,
          totalClaimsCount: completedClaims.length,
          failedClaimsCount: claims.filter((c) => c.transfer_status === "failed").length,
          totalVolume: formatCents(totalVolumeCents),
          totalPacketPool: formatCents(totalPacketPoolCents),
          totalFee: formatCents(totalFeeCents),
          settledFee: formatCents(settledFeeCents),
          pendingOrFailedFee: formatCents(failedFeeCents),
          totalClaimed: formatCents(totalClaimedCents),
          totalUnclaimed: formatCents(totalUnclaimedCents),
        },
        dailySeries,
        packets,
        claims,
        settings: {
          feeRate: settings.fee_rate,
          feeRecipientEmail: settings.fee_recipient_email,
          feeMode: settings.fee_mode,
          allowManualClaimEmail: settings.allow_manual_claim_email,
          merchantEmail: settings.merchant_email,
          merchantPasswordConfigured: Boolean(settings.merchant_password),
        },
        storage: {
          postgresConfigured: isPostgresConfigured(),
          ephemeralWarning: isEphemeralWarning(),
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "获取后台数据失败" },
      { status: 500 }
    );
  }
}
