import { NextRequest, NextResponse } from "next/server";
import { encodeSignedToken } from "@/lib/auth";
import { saveOAuthState } from "@/lib/db";
import { lytClient } from "@/lib/lytpay";

function getOrigin(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  try {
    const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
    const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/";
    const origin = getOrigin(req);
    const redirectUri = `${origin}/api/auth/callback`;

    const { authCode, authUrl, secretKey } = await lytClient.createAuthLink(
      "LytPay 红包平台",
      redirectUri
    );

    await saveOAuthState({
      auth_code: authCode,
      secret_key: secretKey,
      return_to: safeReturnTo,
      created_at: new Date().toISOString(),
    });

    const pendingToken = encodeSignedToken({ authCode, secretKey, returnTo: safeReturnTo }, 600);
    const res = NextResponse.redirect(authUrl);
    res.cookies.set("lyt_oauth_pending", pendingToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : "发起授权失败");
    return NextResponse.redirect(new URL(`/?auth_error=${msg}`, req.url));
  }
}
