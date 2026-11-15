import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isAdminAuthenticated } from "@/lib/auth";
import { getRedPacketByPublicId, recordOperationLog, updateRedPacketStatus } from "@/lib/db";
import { lytClient } from "@/lib/lytpay";
import { withMerchantSession } from "@/lib/merchant";
import { settlePacketFee, syncPaymentAndActivate } from "@/lib/redpacket-service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ status: "error", message: "未登录管理后台" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await req.json()) as { action?: "sync" | "retry_fee" | "cancel" };
    const packet = await getRedPacketByPublicId(id);
    const clientIp = getClientIp(req);

    if (!packet) {
      return NextResponse.json({ status: "error", message: "红包订单不存在" }, { status: 404 });
    }

    if (body.action === "sync") {
      const updated = await syncPaymentAndActivate(id, clientIp);
      await recordOperationLog({
        action: "admin_packet_action",
        actorType: "admin",
        ipAddress: clientIp,
        targetType: "packet",
        targetId: id,
        status: "success",
        detail: `管理员手动核验订单 ${id} (状态: ${updated?.status || "unknown"})`,
      });
      return NextResponse.json({ status: "success", data: updated });
    }

    if (body.action === "retry_fee") {
      if (packet.status === "awaiting_payment" || packet.status === "canceled") {
        return NextResponse.json(
          { status: "error", message: "仅已付款红包可结算手续费" },
          { status: 400 }
        );
      }
      const res = await settlePacketFee(packet, clientIp);
      await recordOperationLog({
        action: "admin_packet_action",
        actorType: "admin",
        ipAddress: clientIp,
        targetType: "packet",
        targetId: id,
        amountCents: packet.fee_amount_cents,
        status: res.status === "failed" ? "failed" : "success",
        detail: `管理员补发手续费 ${id} -> ${res.status}${res.error ? ` (${res.error})` : ""}`,
      });
      return NextResponse.json({
        status: res.status === "failed" ? "error" : "success",
        message:
          res.status === "failed"
            ? res.error
            : res.status === "self_retained"
              ? "托管账户与手续费账户一致，手续费已自留"
              : "5% 手续费已补发成功",
      });
    }

    if (body.action === "cancel") {
      if (packet.status !== "awaiting_payment") {
        return NextResponse.json(
          { status: "error", message: "仅待付款订单可撤销" },
          { status: 400 }
        );
      }
      const linkInfo = await withMerchantSession(({ sessId }) =>
        lytClient.getPaymentLinkStatus(sessId, packet.payment_link_code)
      );
      if (linkInfo.status === "completed") {
        await syncPaymentAndActivate(id, clientIp);
        return NextResponse.json(
          { status: "error", message: "该订单已完成付款，已自动为您激活红包" },
          { status: 400 }
        );
      }
      if (linkInfo.status === "pending") {
        await withMerchantSession(({ sessId }) =>
          lytClient.cancelPaymentLink(sessId, linkInfo.id)
        );
      }
      await updateRedPacketStatus(packet.id, "canceled");
      await recordOperationLog({
        action: "admin_packet_action",
        actorType: "admin",
        ipAddress: clientIp,
        targetType: "packet",
        targetId: id,
        status: "success",
        detail: `管理员撤销待付款订单 ${id}`,
      });
      return NextResponse.json({ status: "success", message: "收款链接与订单已撤销" });
    }

    return NextResponse.json({ status: "error", message: "未知操作" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "操作失败" },
      { status: 500 }
    );
  }
}
