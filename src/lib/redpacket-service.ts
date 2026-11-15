import {
  activateRedPacketOnPayment,
  getPlatformSettings,
  getRedPacketByPublicId,
  recordAccountLedgerEntries,
  recordOperationLog,
  updateRedPacketFeeStatus,
  updateRedPacketStatus,
  type RedPacketRecord,
} from "./db";
import { lytClient } from "./lytpay";
import { withMerchantSession } from "./merchant";
import { formatCents } from "./money";

/**
 * Settles the 5% platform fee to the configured recipient (default 1218545105@qq.com).
 * If merchant account IS the fee recipient, marks as self_retained (since Lyt IT Pay forbids self-transfer).
 */
export async function settlePacketFee(
  packet: RedPacketRecord,
  ipAddress?: string
): Promise<{
  status: "completed" | "failed" | "self_retained";
  error?: string;
}> {
  if (
    packet.fee_transfer_status === "completed" ||
    packet.fee_transfer_status === "self_retained"
  ) {
    return { status: packet.fee_transfer_status };
  }

  const settings = await getPlatformSettings();
  const merchantEmail = settings.merchant_email.trim().toLowerCase();
  const feeRecipient = (packet.fee_recipient_email || settings.fee_recipient_email || "1218545105@qq.com").trim();

  if (merchantEmail && merchantEmail === feeRecipient.toLowerCase()) {
    await updateRedPacketFeeStatus({
      packetId: packet.id,
      status: "self_retained",
      error: null,
    });
    await recordAccountLedgerEntries([
      {
        accountEmail: feeRecipient,
        role: "fee_recipient",
        direction: "in",
        eventType: "fee_income",
        amountCents: packet.fee_amount_cents,
        relatedPublicId: packet.public_id,
        relatedCode: packet.red_packet_code,
        ipAddress: ipAddress || packet.creator_ip || null,
        note: `平台手续费自留 (${packet.red_packet_code})`,
      },
    ]);
    return { status: "self_retained" };
  }

  try {
    await withMerchantSession(async ({ sessId, password }) => {
      await lytClient.transfer(sessId, {
        receiverEmail: feeRecipient,
        amount: formatCents(packet.fee_amount_cents),
        note: `LytRedPacket 5%手续费 (${packet.red_packet_code})`,
        password,
      });
    });

    await updateRedPacketFeeStatus({
      packetId: packet.id,
      status: "completed",
      error: null,
    });
    await recordAccountLedgerEntries([
      {
        accountEmail: feeRecipient,
        role: "fee_recipient",
        direction: "in",
        eventType: "fee_income",
        amountCents: packet.fee_amount_cents,
        relatedPublicId: packet.public_id,
        relatedCode: packet.red_packet_code,
        ipAddress: ipAddress || packet.creator_ip || null,
        note: `平台手续费转入 (${packet.red_packet_code})`,
      },
      ...(settings.merchant_email
        ? [
            {
              accountEmail: settings.merchant_email,
              role: "merchant" as const,
              direction: "out" as const,
              eventType: "merchant_fee_out" as const,
              amountCents: packet.fee_amount_cents,
              relatedPublicId: packet.public_id,
              relatedCode: packet.red_packet_code,
              ipAddress: ipAddress || packet.creator_ip || null,
              note: `划转手续费至 ${feeRecipient} (${packet.red_packet_code})`,
            },
          ]
        : []),
    ]);
    return { status: "completed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "手续费转账失败";
    await updateRedPacketFeeStatus({
      packetId: packet.id,
      status: "failed",
      error: message,
    });
    return { status: "failed", error: message };
  }
}

/**
 * Polls Lyt IT Pay get_payment_link_status and activates the red packet if paid.
 */
export async function syncPaymentAndActivate(
  publicId: string,
  ipAddress?: string
): Promise<RedPacketRecord | null> {
  const packet = await getRedPacketByPublicId(publicId);
  if (!packet) return null;

  if (packet.status !== "awaiting_payment") {
    return packet;
  }

  const linkStatus = await withMerchantSession(({ sessId }) =>
    lytClient.getPaymentLinkStatus(sessId, packet.payment_link_code)
  );

  if (linkStatus.status === "canceled") {
    await updateRedPacketStatus(packet.id, "canceled");
    return (await getRedPacketByPublicId(publicId))!;
  }

  if (linkStatus.status === "completed") {
    const { packet: activated, justActivated } = await activateRedPacketOnPayment({
      publicId,
      payerEmail: linkStatus.payer_email,
      paymentLinkId: linkStatus.id,
      paymentTransactionId: linkStatus.transaction_id,
      paidAt: linkStatus.paid_at || new Date().toISOString(),
    });

    if (justActivated) {
      const settings = await getPlatformSettings();
      const payer = activated.payer_email || activated.sender_email || "";
      await recordAccountLedgerEntries([
        ...(payer
          ? [
              {
                accountEmail: payer,
                role: "payer" as const,
                direction: "out" as const,
                eventType: "packet_pay" as const,
                amountCents: activated.total_pay_cents,
                relatedPublicId: activated.public_id,
                relatedCode: activated.red_packet_code,
                ipAddress: ipAddress || activated.creator_ip || null,
                note: `支付红包订单 (${activated.red_packet_code})`,
              },
            ]
          : []),
        ...(settings.merchant_email
          ? [
              {
                accountEmail: settings.merchant_email,
                role: "merchant" as const,
                direction: "in" as const,
                eventType: "merchant_in" as const,
                amountCents: activated.total_pay_cents,
                relatedPublicId: activated.public_id,
                relatedCode: activated.red_packet_code,
                ipAddress: ipAddress || activated.creator_ip || null,
                note: `收到发包付款 (${activated.red_packet_code})`,
              },
            ]
          : []),
      ]);
      await recordOperationLog({
        action: "verify_payment",
        actorType: "user",
        actorEmail: payer || null,
        ipAddress: ipAddress || activated.creator_ip || "system",
        targetType: "packet",
        targetId: activated.public_id,
        amountCents: activated.total_pay_cents,
        status: "success",
        detail: `付款确认激活红包 ${activated.red_packet_code}，实付 ${formatCents(activated.total_pay_cents)} ELC`,
      });
    }

    if (justActivated || activated.fee_transfer_status === "pending") {
      await settlePacketFee(activated, ipAddress);
    }

    return (await getRedPacketByPublicId(publicId))!;
  }

  return packet;
}
