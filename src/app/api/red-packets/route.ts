import { NextRequest, NextResponse } from "next/server";
import {
  encodeSignedToken,
  getRequestOrigin,
  getResolvedSessionSecret,
  getUserSession,
  hashPassphrase,
} from "@/lib/auth";
import { createRedPacketRecord, getPlatformSettings } from "@/lib/db";
import { lytClient } from "@/lib/lytpay";
import { withMerchantSession } from "@/lib/merchant";
import {
  calculateFeeBreakdown,
  formatCents,
  generateOrderId,
  generateRedPacketCode,
  toCents,
} from "@/lib/money";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      packetType?: "lucky" | "fixed";
      amount?: number | string;
      totalCount?: number;
      greeting?: string;
      senderName?: string;
      passphrase?: string;
      expiresInHours?: number;
    };

    const packetType = body.packetType === "fixed" ? "fixed" : "lucky";
    const totalCount = Math.floor(Number(body.totalCount || 1));
    const inputAmountCents = toCents(body.amount ?? 0);

    if (!Number.isFinite(totalCount) || totalCount < 1 || totalCount > 100) {
      return NextResponse.json(
        { status: "error", message: "红包个数必须在 1 ~ 100 之间" },
        { status: 400 }
      );
    }

    if (inputAmountCents <= 0) {
      return NextResponse.json(
        { status: "error", message: "请输入有效的红包金额" },
        { status: 400 }
      );
    }

    const settings = await getPlatformSettings();
    const breakdown = calculateFeeBreakdown(
      inputAmountCents,
      settings.fee_rate,
      settings.fee_mode
    );

    if (breakdown.packetAmountCents < totalCount) {
      return NextResponse.json(
        {
          status: "error",
          message: `可分配红包净额（${formatCents(breakdown.packetAmountCents)}）不能少于每份最低 0.01（至少需 ${formatCents(totalCount)}）`,
        },
        { status: 400 }
      );
    }

    const user = await getUserSession();
    const publicId = generateOrderId();
    const redPacketCode = generateRedPacketCode();
    const greeting = (body.greeting || "恭喜发财，大吉大利").trim().slice(0, 120) || "恭喜发财，大吉大利";
    const senderName = (body.senderName || user?.email?.split("@")[0] || "Lyt IT Pay 好友")
      .trim()
      .slice(0, 60);
    const passphrase = body.passphrase?.trim() || "";
    const hasPassphrase = passphrase.length > 0;
    const passphraseHash = hasPassphrase ? hashPassphrase(passphrase) : null;

    const hours = Number(body.expiresInHours ?? 72);
    const expiresAt =
      hours > 0 ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;

    const payAmountStr = formatCents(breakdown.totalPayCents);
    const note = `LytPay红包订单 ${publicId} (${totalCount}个)`;

    const { linkCode, payUrl } = await withMerchantSession(({ sessId }) =>
      lytClient.createPaymentLink(sessId, payAmountStr, note)
    );

    const record = await createRedPacketRecord({
      public_id: publicId,
      red_packet_code: redPacketCode,
      packet_type: packetType,
      total_count: totalCount,
      remaining_count: totalCount,
      packet_amount_cents: breakdown.packetAmountCents,
      remaining_amount_cents: breakdown.packetAmountCents,
      fee_amount_cents: breakdown.feeAmountCents,
      total_pay_cents: breakdown.totalPayCents,
      fee_rate: breakdown.feeRate,
      fee_mode: breakdown.feeMode,
      fee_recipient_email: settings.fee_recipient_email,
      fee_transfer_status: "pending",
      fee_transfer_error: null,
      greeting,
      sender_name: senderName,
      sender_email: user?.email || null,
      passphrase_hash: passphraseHash,
      has_passphrase: hasPassphrase,
      payment_link_code: linkCode,
      payment_link_id: null,
      payment_url: payUrl,
      payer_email: null,
      payment_transaction_id: null,
      status: "awaiting_payment",
      expires_at: expiresAt,
    });

    const origin = getRequestOrigin(req);
    const sessionSecret = await getResolvedSessionSecret();
    const snapshotToken = encodeSignedToken(
      {
        snap: {
          public_id: record.public_id,
          red_packet_code: record.red_packet_code,
          packet_type: record.packet_type,
          total_count: record.total_count,
          remaining_count: record.remaining_count,
          packet_amount_cents: record.packet_amount_cents,
          remaining_amount_cents: record.remaining_amount_cents,
          fee_amount_cents: record.fee_amount_cents,
          total_pay_cents: record.total_pay_cents,
          fee_rate: record.fee_rate,
          fee_mode: record.fee_mode,
          fee_recipient_email: record.fee_recipient_email,
          fee_transfer_status: record.fee_transfer_status,
          fee_transfer_error: record.fee_transfer_error,
          fee_transferred_at: record.fee_transferred_at,
          greeting: record.greeting,
          sender_name: record.sender_name,
          sender_email: record.sender_email,
          passphrase_hash: record.passphrase_hash,
          has_passphrase: record.has_passphrase,
          payment_link_code: record.payment_link_code,
          payment_link_id: record.payment_link_id,
          payment_url: record.payment_url,
          payer_email: record.payer_email,
          payment_transaction_id: record.payment_transaction_id,
          status: record.status,
          created_at: record.created_at,
          paid_at: record.paid_at,
          expires_at: record.expires_at,
        },
      },
      86400 * 7,
      sessionSecret
    );

    const res = NextResponse.json({
      status: "success",
      data: {
        publicId: record.public_id,
        paymentLinkCode: record.payment_link_code,
        paymentUrl: record.payment_url,
        packetAmount: formatCents(record.packet_amount_cents),
        feeAmount: formatCents(record.fee_amount_cents),
        totalPayAmount: formatCents(record.total_pay_cents),
        feeRate: record.fee_rate,
        feeMode: record.fee_mode,
        status: record.status,
      },
    });
    res.cookies.set(`lyt_order_${record.public_id}`, snapshotToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 86400 * 7,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "创建红包失败" },
      { status: 500 }
    );
  }
}
