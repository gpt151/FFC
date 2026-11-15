import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  encodeSignedToken,
  getAdminAuthConfig,
  getClientIp,
  getRequestOrigin,
  getResolvedSessionSecret,
  isAdminAuthenticated,
  verifyAdminPassword,
} from "@/lib/auth";
import { recordOperationLog } from "@/lib/db";

export async function GET() {
  const [authenticated, config] = await Promise.all([
    isAdminAuthenticated(),
    getAdminAuthConfig(),
  ]);
  return NextResponse.json({
    status: "success",
    data: {
      authenticated,
      adminPasswordConfigured: config.mode !== "unconfigured",
      needsSetup: config.mode === "unconfigured",
      usingDefaultDevPassword: config.mode === "dev",
      authMode: config.mode,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { password?: string };
    const config = await getAdminAuthConfig();
    if (config.mode === "unconfigured") {
      return NextResponse.json(
        {
          status: "error",
          message: "后台尚未设置管理密码，请先完成首次初始化配置",
        },
        { status: 403 }
      );
    }

    const input = body.password || "";
    let valid = false;
    if (config.mode === "db" && config.dbHash) {
      valid = verifyAdminPassword(input, config.dbHash);
    } else if (config.envPassword) {
      const inputBuf = Buffer.from(input);
      const expectedBuf = Buffer.from(config.envPassword);
      valid =
        inputBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(inputBuf, expectedBuf);
    }

    const clientIp = getClientIp(req);
    if (!valid) {
      await recordOperationLog({
        action: "admin_login",
        actorType: "admin",
        ipAddress: clientIp,
        targetType: "auth",
        status: "failed",
        detail: "管理后台密码验证失败",
      });
      return NextResponse.json({ status: "error", message: "后台密码错误" }, { status: 401 });
    }

    await recordOperationLog({
      action: "admin_login",
      actorType: "admin",
      ipAddress: clientIp,
      targetType: "auth",
      status: "success",
      detail: "管理员成功登录后台",
    });

    const secret = await getResolvedSessionSecret();
    const token = encodeSignedToken({ role: "admin" }, 86400 * 3, secret);
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
      { status: "error", message: err instanceof Error ? err.message : "登录失败" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ status: "success" });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
