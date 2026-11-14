import Link from "next/link";
import { Card, Chip } from "@heroui/react";
import { CheckCircle2, Gift, KeyRound, Link2, ShieldCheck, Zap } from "lucide-react";
import { CreateRedPacketForm } from "@/components/CreateRedPacketForm";

export default function HomePage() {
  const steps = [
    {
      icon: Link2,
      title: "1. 生成收款链接",
      desc: "设置红包金额、个数和祝福语，调用 Lyt IT Pay 生成官方收款链接。",
    },
    {
      icon: CheckCircle2,
      title: "2. 完成付款激活",
      desc: "点击收款链接在 Lyt IT Pay 安全支付，系统秒级自动核验到账状态。",
    },
    {
      icon: KeyRound,
      title: "3. 获取红包码/链接",
      desc: "自动生成专属红包激活码（如 LYT-XXXX-XXXX）与一键分享领取链接。",
    },
    {
      icon: Gift,
      title: "4. 好友拆包秒到账",
      desc: "好友输入激活码或点开链接，资金实时转账至其 Lyt IT Pay 账户。",
    },
  ];

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Hero & Workflow */}
        <div className="lg:col-span-5 space-y-6">
          <div className="space-y-3">
            <Chip color="accent" variant="soft" size="sm">
              <Chip.Label>Lyt IT Pay 官方支付通道 · 安全实时到账</Chip.Label>
            </Chip>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              发送可验证的{" "}
              <span className="text-rose-600">Lyt IT Pay 社交红包</span>
            </h1>
            <p className="text-foreground/70 text-sm sm:text-base leading-relaxed">
              无需复杂转账流程。包好红包并完成收款链接支付后，立即生成专属
              <strong>红包激活码</strong>与<strong>领取链接</strong>，支持拼手气、普通等额及口令红包。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/80 border border-black/5 shadow-xs"
                >
                  <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{step.title}</div>
                    <div className="text-xs text-muted mt-0.5 leading-relaxed">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white border-none">
            <Card.Content className="p-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  已有红包激活码？
                </div>
                <div className="text-xs text-white/70">
                  立即输入激活码领取红包，支持 OAuth 一键授权入账
                </div>
              </div>
              <Link
                href="/claim"
                className="shrink-0 px-4 py-2 rounded-xl bg-amber-400 text-zinc-950 font-semibold text-xs hover:bg-amber-300 transition-colors"
              >
                去领红包
              </Link>
            </Card.Content>
          </Card>

          <div className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>每笔订单均与 Lyt IT Pay 交易流水关联，支持后台实时对账与 CSV 导出</span>
          </div>
        </div>

        {/* Right: Create Form */}
        <div className="lg:col-span-7">
          <CreateRedPacketForm />
        </div>
      </div>
    </div>
  );
}
