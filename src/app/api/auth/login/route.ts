import { NextRequest, NextResponse } from "next/server";
import { encodeSignedToken, getRequestOrigin, getResolvedSessionSecret } from "@/lib/auth";
import { saveOAuthState } from "@/lib/db";
import { lytClient } from "@/lib/lytpay";

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);

  try {
    const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
    const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/";
    const redirectUri = `${origin}/api/auth/callback`;

    const { authCode, authUrl, secretKey } = await lytClient.createAuthLink(
      "LytPay RedPacket",
      redirectUri
    );

    try {
      await saveOAuthState({
        auth_code: authCode,
        secret_key: secretKey,
        return_to: safeReturnTo,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Cookie fallback below guarantees state survives even without DB persistence
    }

    const secret = await getResolvedSessionSecret();
    const pendingToken = encodeSignedToken({ authCode, secretKey, returnTo: safeReturnTo }, 600, secret);
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
    return NextResponse.redirect(new URL(`/?auth_error=${msg}`, origin));
  }
}
