import { NextRequest, NextResponse } from "next/server";
import { decodeSignedToken, getResolvedSessionSecret } from "@/lib/auth";
import { getRedPacketByPublicId, rehydrateRedPacketRecord, type RedPacketRecord } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { syncPaymentAndActivate } from "@/lib/redpacket-service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const existing = await getRedPacketByPublicId(id);
    if (!existing) {
      const rawCookie = req.cookies.get(`lyt_order_${id}`)?.value;
      const secret = await getResolvedSessionSecret();
      const decoded = decodeSignedToken<{ snap: Omit<RedPacketRecord, "id"> }>(rawCookie, secret);
      if (decoded?.snap && decoded.snap.public_id === id) {
        await rehydrateRedPacketRecord(decoded.snap);
      }
    }

    const packet = await syncPaymentAndActivate(id);
    if (!packet) {
      return NextResponse.json({ status: "error", message: "红包订单不存在" }, { status: 404 });
    }

    const isPaid = packet.status === "active" || packet.status === "completed";
    return NextResponse.json({
      status: "success",
      data: {
        publicId: packet.public_id,
        status: packet.status,
        paidAt: packet.paid_at,
        redPacketCode: isPaid ? packet.red_packet_code : null,
        totalPayAmount: formatCents(packet.total_pay_cents),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "校验付款状态失败" },
      { status: 500 }
    );
  }
}
