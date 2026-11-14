import { NextRequest, NextResponse } from "next/server";
import { decodeSignedToken, encodeSignedToken, USER_COOKIE_NAME } from "@/lib/auth";
import { getAndDeleteOAuthState } from "@/lib/db";
import { lytClient } from "@/lib/lytpay";

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") || req.nextUrl.origin;

  try {
    const queryCode = req.nextUrl.searchParams.get("code") || req.nextUrl.searchParams.get("auth_code");
    const pendingCookie = req.cookies.get("lyt_oauth_pending")?.value;
    const pending = decodeSignedToken<{
      authCode: string;
      secretKey: string;
      returnTo: string;
    }>(pendingCookie);

    const authCode = queryCode || pending?.authCode;
    if (!authCode) {
      return NextResponse.redirect(new URL("/?auth_error=缺少授权码", origin));
    }

    const dbState = await getAndDeleteOAuthState(authCode);
    const secretKey = dbState?.secret_key || pending?.secretKey;
    const returnTo = dbState?.return_to || pending?.returnTo || "/";

    if (!secretKey) {
      return NextResponse.redirect(new URL("/?auth_error=授权会话已过期，请重试", origin));
    }

    const info = await lytClient.getAuthInfo(authCode, secretKey);
    if (info.status !== "success" || !info.data?.email) {
      const errMsg = encodeURIComponent(info.message || "用户尚未完成授权");
      return NextResponse.redirect(new URL(`${returnTo}?auth_error=${errMsg}`, origin));
    }

    const userToken = encodeSignedToken(
      { userId: info.data.user_id, email: info.data.email },
      86400 * 7
    );

    const targetUrl = new URL(returnTo, origin);
    targetUrl.searchParams.set("auth_success", "1");

    const res = NextResponse.redirect(targetUrl);
    res.cookies.delete("lyt_oauth_pending");
    res.cookies.set(USER_COOKIE_NAME, userToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 86400 * 7,
    });
    return res;
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : "授权回调验证失败");
    return NextResponse.redirect(new URL(`/?auth_error=${msg}`, origin));
  }
}
