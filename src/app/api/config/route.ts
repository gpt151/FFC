import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth";
import { getPlatformSettings, isEphemeralWarning, isPostgresConfigured } from "@/lib/db";

export async function GET() {
  try {
    const [settings, user] = await Promise.all([getPlatformSettings(), getUserSession()]);
    return NextResponse.json({
      status: "success",
      data: {
        feeRate: settings.fee_rate,
        feeMode: settings.fee_mode,
        feeRecipientEmail: settings.fee_recipient_email,
        allowManualClaimEmail: settings.allow_manual_claim_email,
        merchantConfigured: Boolean(settings.merchant_email && settings.merchant_password),
        postgresConfigured: isPostgresConfigured(),
        ephemeralWarning: isEphemeralWarning(),
        user,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "读取配置失败" },
      { status: 500 }
    );
  }
}
