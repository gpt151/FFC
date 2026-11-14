import { NextRequest, NextResponse } from "next/server";
import { decodeSignedToken, getResolvedSessionSecret } from "@/lib/auth";
import {
  getClaimsByPacketId,
  getRedPacketByPublicId,
  isEphemeralWarning,
  rehydrateRedPacketRecord,
  type RedPacketRecord,
} from "@/lib/db";
import { formatCents, maskEmail } from "@/lib/money";
import { syncPaymentAndActivate } from "@/lib/redpacket-service";

async function ensurePacketFromSnapshot(req: NextRequest, id: string): Promise<void> {
  const existing = await getRedPacketByPublicId(id);
  if (existing) return;
  const rawCookie = req.cookies.get(`lyt_order_${id}`)?.value;
  const secret = await getResolvedSessionSecret();
  const decoded = decodeSignedToken<{ snap: Omit<RedPacketRecord, "id"> }>(rawCookie, secret);
  if (decoded?.snap && decoded.snap.public_id === id) {
    await rehydrateRedPacketRecord(decoded.snap);
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const shouldSync = req.nextUrl.searchParams.get("sync") === "1";

    await ensurePacketFromSnapshot(req, id);

    const packet = shouldSync
      ? await syncPaymentAndActivate(id)
      : await getRedPacketByPublicId(id);

    if (!packet) {
      return NextResponse.json({ status: "error", message: "红包订单不存在" }, { status: 404 });
    }

    const claims =
      packet.status === "active" || packet.status === "completed"
        ? await getClaimsByPacketId(packet.id)
        : [];

    const isPaid =
      packet.status === "active" || packet.status === "completed" || packet.status === "expired";

    return NextResponse.json({
      status: "success",
      data: {
        publicId: packet.public_id,
        status: packet.status,
        packetType: packet.packet_type,
        totalCount: packet.total_count,
        remainingCount: packet.remaining_count,
        packetAmount: formatCents(packet.packet_amount_cents),
        remainingAmount: formatCents(packet.remaining_amount_cents),
        feeAmount: formatCents(packet.fee_amount_cents),
        totalPayAmount: formatCents(packet.total_pay_cents),
        feeRate: packet.fee_rate,
        feeMode: packet.fee_mode,
        greeting: packet.greeting,
        senderName: packet.sender_name,
        hasPassphrase: packet.has_passphrase,
        paymentLinkCode: packet.payment_link_code,
        paymentUrl: packet.payment_url,
        payerEmailMasked: packet.payer_email ? maskEmail(packet.payer_email) : null,
        createdAt: packet.created_at,
        paidAt: packet.paid_at,
        expiresAt: packet.expires_at,
        ephemeralWarning: isEphemeralWarning(),
        redPacketCode: isPaid ? packet.red_packet_code : null,
        claims: claims
          .filter((c) => c.transfer_status === "completed")
          .map((c) => ({
            id: c.id,
            maskedEmail: maskEmail(c.claimer_email),
            amount: formatCents(c.amount_cents),
            claimedAt: c.claimed_at,
          })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "查询红包失败" },
      { status: 500 }
    );
  }
}
