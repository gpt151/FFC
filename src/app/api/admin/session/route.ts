import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  encodeSignedToken,
  getAdminPassword,
  isAdminAuthenticated,
  isUsingDefaultDevAdminPassword,
} from "@/lib/auth";

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  const configured = Boolean(getAdminPassword());
  return NextResponse.json({
    status: "success",
    data: {
      authenticated,
      adminPasswordConfigured: configured,
      usingDefaultDevPassword: isUsingDefaultDevAdminPassword(),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { password?: string };
    const expected = getAdminPassword();
    if (!expected) {
      return NextResponse.json(
        {
          status: "error",
          message: "生产环境未配置 ADMIN_PASSWORD 环境变量，请在 Vercel 中设置 ADMIN_PASSWORD",
        },
        { status: 500 }
      );
    }

    const input = body.password || "";
    const inputBuf = Buffer.from(input);
    const expectedBuf = Buffer.from(expected);
    if (
      inputBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(inputBuf, expectedBuf)
    ) {
      return NextResponse.json({ status: "error", message: "后台密码错误" }, { status: 401 });
    }

    const token = encodeSignedToken({ role: "admin" }, 86400 * 3);
    const res = NextResponse.json({ status: "success" });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
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
