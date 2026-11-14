import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  clearCachedSessionSecret,
  encodeSignedToken,
  getAdminAuthConfig,
  getRequestOrigin,
  hashAdminPassword,
} from "@/lib/auth";
import { isPostgresConfigured, updatePlatformSettings } from "@/lib/db";
import { lytClient } from "@/lib/lytpay";

export async function POST(req: NextRequest) {
  try {
    const config = await getAdminAuthConfig();
    if (config.mode !== "unconfigured") {
      return NextResponse.json(
        { status: "error", message: "后台已完成初始化，请直接登录" },
        { status: 403 }
      );
    }

    if (!isPostgresConfigured()) {
      return NextResponse.json(
        {
          status: "error",
          message: "未检测到 PostgreSQL 数据库连接，请先在 Vercel 绑定 Neon / Postgres 数据库",
        },
        { status: 400 }
      );
    }

    const body = (await req.json()) as {
      adminPassword?: string;
      merchantEmail?: string;
      merchantPassword?: string;
      feeRecipientEmail?: string;
      feeRate?: number | string;
      feeMode?: string;
    };

    const adminPassword = (body.adminPassword || "").trim();
    const merchantEmail = (body.merchantEmail || "").trim();
    const merchantPassword = body.merchantPassword || "";
    const feeRecipientEmail = (body.feeRecipientEmail || merchantEmail).trim();
    const feeRateNum = Number(body.feeRate ?? 0.05);
    const feeMode = body.feeMode === "deduct_from_packet" ? "deduct_from_packet" : "sender_pays";

    if (adminPassword.length < 6) {
      return NextResponse.json(
        { status: "error", message: "管理员密码长度至少 6 位" },
        { status: 400 }
      );
    }
    if (!merchantEmail || !merchantEmail.includes("@") || !merchantPassword) {
      return NextResponse.json(
        { status: "error", message: "请填写有效的 Lyt IT Pay 托管收款账号与密码" },
        { status: 400 }
      );
    }
    if (!feeRecipientEmail || !feeRecipientEmail.includes("@")) {
      return NextResponse.json(
        { status: "error", message: "请填写有效的手续费收款邮箱" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(feeRateNum) || feeRateNum < 0 || feeRateNum > 0.5) {
      return NextResponse.json(
        { status: "error", message: "手续费率必须在 0 ~ 0.5（0% ~ 50%）之间" },
        { status: 400 }
      );
    }

    const loginRes = await lytClient.login(merchantEmail, merchantPassword);
    const sessionSecret = crypto.randomBytes(32).toString("hex");
    const adminPasswordHash = hashAdminPassword(adminPassword);

    await updatePlatformSettings({
      admin_password_hash: adminPasswordHash,
      session_secret: sessionSecret,
      merchant_email: merchantEmail,
      merchant_password: merchantPassword,
      merchant_sess_id: loginRes.sessId,
      merchant_sess_updated_at: new Date().toISOString(),
      fee_recipient_email: feeRecipientEmail,
      fee_rate: String(feeRateNum),
      fee_mode: feeMode,
      allow_manual_claim_email: "true",
    });

    clearCachedSessionSecret();

    const token = encodeSignedToken({ role: "admin" }, 86400 * 3, sessionSecret);
    const origin = getRequestOrigin(req);
    const res = NextResponse.json({ status: "success" });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 86400 * 3,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "初始化配置失败",
      },
      { status: 500 }
    );
  }
}

