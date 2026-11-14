import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hashPassphrase } from "@/lib/auth";
import {
  completeClaimTransfer,
  getClaimsByPacketId,
  getPlatformSettings,
  reserveRedPacketShare,
  rollbackClaimReservation,
} from "@/lib/db";
import { lytClient } from "@/lib/lytpay";
import { withMerchantSession } from "@/lib/merchant";
import { formatCents, maskEmail } from "@/lib/money";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      code?: string;
      email?: string;
      passphrase?: string;
    };

    const code = body.code?.trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ status: "error", message: "缺少红包激活码" }, { status: 400 });
    }

    const [user, settings] = await Promise.all([getUserSession(), getPlatformSettings()]);

    let claimerEmail = "";
    let claimerUserId: number | null = null;
    let claimMethod: "oauth" | "manual" = "manual";

    if (user?.email) {
      claimerEmail = user.email;
      claimerUserId = user.userId;
      claimMethod = "oauth";
    } else {
      if (!settings.allow_manual_claim_email) {
        return NextResponse.json(
          { status: "error", message: "当前平台已开启安全验证，请先点击「Lyt IT Pay 授权登录」后领取" },
          { status: 401 }
        );
      }
      const manual = body.email?.trim() || "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual)) {
        return NextResponse.json(
          { status: "error", message: "请输入有效的 Lyt IT Pay 收款邮箱，或通过授权登录领取" },
          { status: 400 }
        );
      }
      claimerEmail = manual;
      claimMethod = "manual";
    }

    // Check merchant cannot transfer to itself in Lyt IT Pay
    if (claimerEmail.toLowerCase() === settings.merchant_email.trim().toLowerCase()) {
      return NextResponse.json(
        { status: "error", message: "托管发款账号自身不可作为领取人，请使用其他 Lyt IT Pay 账户领取" },
        { status: 400 }
      );
    }

    const passphraseHash = body.passphrase?.trim() ? hashPassphrase(body.passphrase) : null;

    const { packet, claim } = await reserveRedPacketShare({
      code,
      claimerEmail,
      claimerUserId,
      claimMethod,
      passphraseHash,
    });

    const amountStr = formatCents(claim.amount_cents);

    try {
      await withMerchantSession(async ({ sessId, password }) => {
        await lytClient.transfer(sessId, {
          receiverEmail: claim.claimer_email,
          amount: amountStr,
          note: `LytPay红包领取 (${packet.red_packet_code}) - ${packet.greeting.slice(0, 30)}`,
          password,
        });
      });

      await completeClaimTransfer(claim.id);
    } catch (transferErr) {
      const errorMsg =
        transferErr instanceof Error ? transferErr.message : "Lyt IT Pay 转账失败";
      await rollbackClaimReservation({
        packetId: packet.id,
        claimId: claim.id,
        amountCents: claim.amount_cents,
        error: errorMsg,
      });

      return NextResponse.json(
        {
          status: "error",
          message: `打款至 ${claimerEmail} 失败：${errorMsg}（请确认该邮箱已在 Lyt IT Pay 注册并激活）`,
        },
        { status: 400 }
      );
    }

    const claims = await getClaimsByPacketId(packet.id);
    return NextResponse.json({
      status: "success",
      data: {
        claimedAmount: amountStr,
        claimerEmailMasked: maskEmail(claim.claimer_email),
        claimedAt: claim.claimed_at,
        remainingCount: packet.remaining_count,
        remainingAmount: formatCents(packet.remaining_amount_cents),
        claims: claims
          .filter((c) => c.transfer_status === "completed")
          .map((c) => ({
            id: c.id,
            maskedEmail: maskEmail(c.claimer_email),
            amount: formatCents(c.amount_cents),
            claimedAt: c.claimed_at,
          })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "领取红包失败" },
      { status: 400 }
    );
  }
}
