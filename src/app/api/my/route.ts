import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth";
import { getUserHistory } from "@/lib/db";
import { formatCents } from "@/lib/money";

export async function GET() {
  try {
    const user = await getUserSession();
    if (!user) {
      return NextResponse.json({ status: "error", message: "未授权登录" }, { status: 401 });
    }

    const { sent, received } = await getUserHistory(user.email);

    return NextResponse.json({
      status: "success",
      data: {
        user,
        sent: sent.map((p) => ({
          publicId: p.public_id,
          redPacketCode:
            p.status === "active" || p.status === "completed" || p.status === "expired"
              ? p.red_packet_code
              : null,
          packetType: p.packet_type,
          totalCount: p.total_count,
          remainingCount: p.remaining_count,
          packetAmount: formatCents(p.packet_amount_cents),
          feeAmount: formatCents(p.fee_amount_cents),
          totalPayAmount: formatCents(p.total_pay_cents),
          greeting: p.greeting,
          status: p.status,
          createdAt: p.created_at,
          paidAt: p.paid_at,
        })),
        received: received.map((c) => ({
          id: c.id,
          redPacketCode: c.red_packet_code,
          amount: formatCents(c.amount_cents),
          greeting: c.greeting,
          senderName: c.sender_name,
          claimedAt: c.claimed_at,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "查询记录失败" },
      { status: 500 }
    );
  }
}
