import { NextRequest, NextResponse } from "next/server";
import { syncPaymentAndActivate } from "@/lib/redpacket-service";
import { formatCents } from "@/lib/money";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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
