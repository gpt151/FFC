import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth";
import { getClaimsByPacketId, getPlatformSettings, getRedPacketByCode } from "@/lib/db";
import { formatCents, maskEmail } from "@/lib/money";

function extractRedPacketCode(raw: string): string {
  const trimmed = raw.trim();
  const urlMatch = trimmed.match(/\/claim\/([A-Za-z0-9-]+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1].toUpperCase();
  }
  return trimmed.toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const rawCode = req.nextUrl.searchParams.get("code") || "";
    if (!rawCode.trim()) {
      return NextResponse.json({ status: "error", message: "请输入红包激活码" }, { status: 400 });
    }

    const code = extractRedPacketCode(rawCode);
    const [packet, user, settings] = await Promise.all([
      getRedPacketByCode(code),
      getUserSession(),
      getPlatformSettings(),
    ]);

    if (!packet) {
      return NextResponse.json(
        { status: "error", message: "未找到该红包，请检查红包激活码是否正确" },
        { status: 404 }
      );
    }

    if (packet.status === "awaiting_payment") {
      return NextResponse.json(
        { status: "error", message: "该红包尚未完成付款激活" },
        { status: 400 }
      );
    }

    const claims = await getClaimsByPacketId(packet.id);
    const completedClaims = claims.filter((c) => c.transfer_status === "completed");
    const isExpired =
      Boolean(packet.expires_at && new Date(packet.expires_at).getTime() < Date.now()) ||
      packet.status === "expired";

    const userClaim = user
      ? completedClaims.find((c) => c.claimer_email.toLowerCase() === user.email.toLowerCase())
      : null;

    // Best luck (手气最佳) calculation when all claimed
    let bestClaimId: number | null = null;
    if (packet.remaining_count === 0 && completedClaims.length > 0 && packet.packet_type === "lucky") {
      bestClaimId = completedClaims.reduce((best, cur) =>
        cur.amount_cents > best.amount_cents ? cur : best
      ).id;
    }

    return NextResponse.json({
      status: "success",
      data: {
        redPacketCode: packet.red_packet_code,
        packetType: packet.packet_type,
        totalCount: packet.total_count,
        remainingCount: packet.remaining_count,
        packetAmount: formatCents(packet.packet_amount_cents),
        remainingAmount: formatCents(packet.remaining_amount_cents),
        greeting: packet.greeting,
        senderName: packet.sender_name,
        hasPassphrase: packet.has_passphrase,
        status: isExpired && packet.status === "active" ? "expired" : packet.status,
        expiresAt: packet.expires_at,
        allowManualClaimEmail: settings.allow_manual_claim_email,
        userClaimedAmount: userClaim ? formatCents(userClaim.amount_cents) : null,
        claims: completedClaims.map((c) => ({
          id: c.id,
          maskedEmail: maskEmail(c.claimer_email),
          amount: formatCents(c.amount_cents),
          claimedAt: c.claimed_at,
          isBestLuck: c.id === bestClaimId,
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
