import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { lytClient } from "@/lib/lytpay";
import { withMerchantSession } from "@/lib/merchant";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ status: "error", message: "未登录管理后台" }, { status: 401 });
  }

  try {
    const result = await withMerchantSession(async ({ sessId }) => {
      const [balanceInfo, txRes] = await Promise.all([
        lytClient.getBalance(sessId),
        lytClient.getTransactions(sessId, 1),
      ]);
      return { balanceInfo, txRes };
    });

    return NextResponse.json({
      status: "success",
      data: {
        connected: true,
        email: result.balanceInfo.email,
        balance: result.balanceInfo.balance,
        transactions: result.txRes,
      },
    });
  } catch (err) {
    return NextResponse.json({
      status: "error",
      message: err instanceof Error ? err.message : "连接 Lyt IT Pay 托管账户失败",
    });
  }
}
