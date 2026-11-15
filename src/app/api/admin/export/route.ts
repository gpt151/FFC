import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getAllAdminData } from "@/lib/db";
import { formatCents } from "@/lib/money";

function csvEscape(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ status: "error", message: "未登录管理后台" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") || "packets";
  const { packets, claims, operationLogs, accountLedger } = await getAllAdminData();

  let csv = "\uFEFF";
  if (type === "claims") {
    csv += [
      "ID",
      "红包码",
      "领取人邮箱",
      "领取方式",
      "领取金额(ELC)",
      "打款状态",
      "领取IP",
      "错误信息",
      "领取时间",
    ].join(",") + "\n";

    for (const c of claims) {
      csv += [
        c.id,
        c.red_packet_code,
        c.claimer_email,
        c.claim_method,
        formatCents(c.amount_cents),
        c.transfer_status,
        c.claimer_ip || "",
        c.transfer_error || "",
        c.claimed_at,
      ]
        .map(csvEscape)
        .join(",") + "\n";
    }
  } else if (type === "accounts") {
    csv += [
      "ID",
      "账号邮箱",
      "角色",
      "方向",
      "事件类型",
      "金额(ELC)",
      "关联订单号",
      "关联红包码",
      "操作IP",
      "备注",
      "时间",
    ].join(",") + "\n";

    for (const l of accountLedger) {
      csv += [
        l.id,
        l.account_email,
        l.role,
        l.direction,
        l.event_type,
        formatCents(l.amount_cents),
        l.related_public_id || "",
        l.related_code || "",
        l.ip_address || "",
        l.note,
        l.created_at,
      ]
        .map(csvEscape)
        .join(",") + "\n";
    }
  } else if (type === "logs") {
    csv += [
      "ID",
      "操作类型",
      "操作者身份",
      "操作账号",
      "操作IP",
      "目标类型",
      "目标ID",
      "金额(ELC)",
      "状态",
      "详情",
      "时间",
    ].join(",") + "\n";

    for (const log of operationLogs) {
      csv += [
        log.id,
        log.action,
        log.actor_type,
        log.actor_email || "",
        log.ip_address,
        log.target_type || "",
        log.target_id || "",
        log.amount_cents !== null ? formatCents(log.amount_cents) : "",
        log.status,
        log.detail,
        log.created_at,
      ]
        .map(csvEscape)
        .join(",") + "\n";
    }
  } else {
    csv += [
      "ID",
      "订单号",
      "红包码",
      "类型",
      "状态",
      "总份数",
      "剩余份数",
      "实付总额(ELC)",
      "红包净额(ELC)",
      "手续费(ELC)",
      "手续费收款人",
      "手续费状态",
      "付款人邮箱",
      "创建IP",
      "支付链接码",
      "创建时间",
      "付款时间",
    ].join(",") + "\n";

    for (const p of packets) {
      csv += [
        p.id,
        p.public_id,
        p.red_packet_code,
        p.packet_type,
        p.status,
        p.total_count,
        p.remaining_count,
        formatCents(p.total_pay_cents),
        formatCents(p.packet_amount_cents),
        formatCents(p.fee_amount_cents),
        p.fee_recipient_email,
        p.fee_transfer_status,
        p.payer_email || p.sender_email || "",
        p.creator_ip || "",
        p.payment_link_code,
        p.created_at,
        p.paid_at || "",
      ]
        .map(csvEscape)
        .join(",") + "\n";
    }
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lyt-redpacket-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
