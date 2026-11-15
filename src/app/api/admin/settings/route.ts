import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isAdminAuthenticated } from "@/lib/auth";
import { recordOperationLog, updatePlatformSettings } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ status: "error", message: "未登录管理后台" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      feeRate?: number;
      feeRecipientEmail?: string;
      feeMode?: "sender_pays" | "deduct_from_packet";
      allowManualClaimEmail?: boolean;
      merchantEmail?: string;
      merchantPassword?: string;
    };

    const updates: Record<string, string> = {};

    if (body.feeRate !== undefined) {
      const rate = Number(body.feeRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 0.5) {
        return NextResponse.json(
          { status: "error", message: "手续费比例必须在 0% ~ 50% 之间" },
          { status: 400 }
        );
      }
      updates.fee_rate = String(rate);
    }

    if (body.feeRecipientEmail !== undefined) {
      const email = body.feeRecipientEmail.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { status: "error", message: "手续费收款邮箱格式无效" },
          { status: 400 }
        );
      }
      updates.fee_recipient_email = email;
    }

    if (body.feeMode === "sender_pays" || body.feeMode === "deduct_from_packet") {
      updates.fee_mode = body.feeMode;
    }

    if (body.allowManualClaimEmail !== undefined) {
      updates.allow_manual_claim_email = body.allowManualClaimEmail ? "true" : "false";
    }

    if (body.merchantEmail !== undefined && body.merchantEmail.trim()) {
      updates.merchant_email = body.merchantEmail.trim();
      updates.merchant_sess_id = "";
    }

    if (body.merchantPassword !== undefined && body.merchantPassword.length > 0) {
      updates.merchant_password = body.merchantPassword;
      updates.merchant_sess_id = "";
    }

    await updatePlatformSettings(updates);
    const updatedKeys = Object.keys(updates).filter((k) => k !== "merchant_password" && k !== "merchant_sess_id");
    await recordOperationLog({
      action: "admin_update_settings",
      actorType: "admin",
      actorEmail: updates.merchant_email || null,
      ipAddress: getClientIp(req),
      targetType: "settings",
      status: "success",
      detail: `管理员修改系统配置 (${updatedKeys.join(", ") || "credentials"})`,
    });
    return NextResponse.json({ status: "success", message: "系统配置已更新" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "保存设置失败" },
      { status: 500 }
    );
  }
}
