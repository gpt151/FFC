"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Chip,
  Separator,
  Spinner,
} from "@heroui/react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Gift,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react";
import { QrCodeBox } from "@/components/QrCodeBox";

interface PacketDetail {
  publicId: string;
  status: "awaiting_payment" | "active" | "completed" | "expired" | "canceled";
  packetType: "lucky" | "fixed";
  totalCount: number;
  remainingCount: number;
  packetAmount: string;
  remainingAmount: string;
  feeAmount: string;
  totalPayAmount: string;
  feeRate: number;
  feeMode: string;
  greeting: string;
  senderName: string;
  hasPassphrase: boolean;
  paymentLinkCode: string;
  paymentUrl: string;
  payerEmailMasked: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  redPacketCode: string | null;
  claims: Array<{
    id: number;
    maskedEmail: string;
    amount: string;
    claimedAt: string;
  }>;
}

export default function PacketOrderPage() {
  const params = useParams<{ id: string }>();
  const publicId = params.id;

  const [packet, setPacket] = useState<PacketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );

  const fetchStatus = useCallback(
    async (sync = false) => {
      try {
        const res = await fetch(
          `/api/red-packets/${encodeURIComponent(publicId)}${sync ? "?sync=1" : ""}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok || json.status !== "success") {
          throw new Error(json.message || "查询订单失败");
        }
        setPacket(json.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "查询订单失败");
      } finally {
        setLoading(false);
      }
    },
    [publicId]
  );

  useEffect(() => {
    let active = true;
    fetch(`/api/red-packets/${encodeURIComponent(publicId)}?sync=1`, { cache: "no-store" })
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return;
        if (!ok || json.status !== "success") {
          setError(json.message || "查询订单失败");
        } else {
          setPacket(json.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "查询订单失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [publicId]);

  // Poll every 3.5s while awaiting payment, or every 8s while active for live claim updates
  useEffect(() => {
    if (!packet) return;
    if (packet.status === "awaiting_payment") {
      const timer = setInterval(() => fetchStatus(true), 3500);
      return () => clearInterval(timer);
    }
    if (packet.status === "active") {
      const timer = setInterval(() => fetchStatus(false), 8000);
      return () => clearInterval(timer);
    }
  }, [packet, fetchStatus]);

  const handleManualVerify = async () => {
    setChecking(true);
    try {
      await fetch(`/api/red-packets/${encodeURIComponent(publicId)}/verify-payment`, {
        method: "POST",
      });
      await fetchStatus(false);
    } finally {
      setChecking(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted">正在加载红包订单信息...</p>
      </div>
    );
  }

  if (error || !packet) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>加载失败</Alert.Title>
            <Alert.Description>{error || "订单不存在"}</Alert.Description>
          </Alert.Content>
        </Alert>
        <div className="mt-4 text-center">
          <Link href="/">
            <Button variant="secondary">返回包红包</Button>
          </Link>
        </div>
      </div>
    );
  }

  const claimUrl = packet.redPacketCode
    ? `${origin}/claim/${packet.redPacketCode}`
    : "";

  const shareMessage = packet.redPacketCode
    ? `🧧 ${packet.senderName} 发了一个 Lyt IT Pay ${packet.packetType === "lucky" ? "拼手气" : "普通"}红包：「${packet.greeting}」\n🎫 红包激活码：${packet.redPacketCode}\n🔗 点击立即领取：${claimUrl}`
    : "";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted">订单编号：{packet.publicId}</div>
          <h1 className="text-2xl font-bold tracking-tight mt-0.5">
            {packet.status === "awaiting_payment"
              ? "等待完成 Lyt IT Pay 付款"
              : packet.status === "canceled"
                ? "订单已取消"
                : "红包已激活 · 立即分享给好友"}
          </h1>
        </div>
        <Chip
          color={
            packet.status === "active"
              ? "success"
              : packet.status === "completed"
                ? "accent"
                : packet.status === "awaiting_payment"
                  ? "warning"
                  : "danger"
          }
          variant="soft"
        >
          <Chip.Label>
            {packet.status === "awaiting_payment" && "待付款激活"}
            {packet.status === "active" && `领取中 (${packet.totalCount - packet.remainingCount}/${packet.totalCount})`}
            {packet.status === "completed" && "已全部领完"}
            {packet.status === "expired" && "已过期"}
            {packet.status === "canceled" && "已取消"}
          </Chip.Label>
        </Chip>
      </div>

      {/* Awaiting payment view */}
      {packet.status === "awaiting_payment" && (
        <Card className="border border-rose-200 shadow-lg bg-white">
          <Card.Content className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  系统每 3 秒自动检测 Lyt IT Pay 付款结果
                </div>

                <div>
                  <div className="text-sm text-muted">需支付总金额（含 {(packet.feeRate * 100).toFixed(0)}% 手续费）</div>
                  <div className="text-4xl font-extrabold text-rose-600 mt-1">
                    {packet.totalPayAmount} <span className="text-lg font-semibold">Lyt</span>
                  </div>
                  <div className="text-xs text-muted mt-1">
                    红包净额 {packet.packetAmount} Lyt（{packet.totalCount}个） + 手续费 {packet.feeAmount} Lyt
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <a href={packet.paymentUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="primary" size="lg" className="font-semibold">
                      前往 Lyt IT Pay 立即付款
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </a>
                  <Button
                    variant="secondary"
                    size="lg"
                    isDisabled={checking}
                    onPress={handleManualVerify}
                  >
                    <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                    我已付款，立即核验
                  </Button>
                </div>

                <div className="p-3 rounded-xl bg-black/[0.03] border border-black/5 flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-mono text-foreground/80">
                    {packet.paymentUrl}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => copyText("payurl", packet.paymentUrl)}
                  >
                    {copiedKey === "payurl" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === "payurl" ? "已复制" : "复制链接"}
                  </Button>
                </div>
              </div>

              <div className="md:col-span-5 flex flex-col items-center justify-center p-4 rounded-2xl bg-rose-50/50 border border-rose-100">
                <QrCodeBox value={packet.paymentUrl} size={176} />
                <span className="text-xs text-muted mt-3">使用手机扫码打开 Lyt IT Pay 收银台</span>
                <span className="text-[11px] font-mono text-muted mt-1">
                  链接码：{packet.paymentLinkCode}
                </span>
              </div>
            </div>

            <Separator />

            <div className="text-xs text-muted leading-relaxed">
              付款完成后，系统将自动激活红包，并在本页面直接生成<strong>红包激活码</strong>与<strong>领取链接</strong>（请勿关闭本页面；如果已关闭，可通过「我的记录」找回）。
            </div>
          </Card.Content>
        </Card>
      )}

      {/* Activated / Completed view */}
      {(packet.status === "active" || packet.status === "completed" || packet.status === "expired") &&
        packet.redPacketCode && (
          <>
            <Card className="border-none shadow-xl overflow-hidden red-envelope-gradient text-white">
              <Card.Content className="p-6 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-amber-200 text-xs font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      付款已确认 · 红包已激活生效
                    </div>
                    <h2 className="text-2xl font-bold">“{packet.greeting}”</h2>
                    <p className="text-xs text-white/80">
                      {packet.packetType === "lucky" ? "拼手气红包" : "普通等额红包"} · 总额{" "}
                      {packet.packetAmount} Lyt · 剩余 {packet.remainingCount}/{packet.totalCount} 份
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded-2xl shadow-lg">
                    <QrCodeBox value={claimUrl} size={132} />
                  </div>
                </div>

                {/* Red packet code & Claim Link */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/15 backdrop-blur-xs p-4 space-y-2 border border-white/20">
                    <div className="text-xs text-white/80">红包激活码（可凭码领取）</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xl font-extrabold font-mono tracking-wider text-amber-200">
                        {packet.redPacketCode}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => copyText("code", packet.redPacketCode!)}
                      >
                        {copiedKey === "code" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === "code" ? "已复制" : "复制"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/15 backdrop-blur-xs p-4 space-y-2 border border-white/20">
                    <div className="text-xs text-white/80">一键领取链接</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono truncate text-white/95">{claimUrl}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => copyText("link", claimUrl)}
                      >
                        {copiedKey === "link" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === "link" ? "已复制" : "复制"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onPress={() => copyText("share", shareMessage)}
                    className="font-semibold"
                  >
                    <Share2 className="w-4 h-4" />
                    {copiedKey === "share" ? "已复制完整转发文案！" : "复制群聊转发文案"}
                  </Button>
                  <Link href={`/claim/${packet.redPacketCode}`}>
                    <Button variant="ghost" className="text-white hover:bg-white/15">
                      <Gift className="w-4 h-4" />
                      打开领取页面预览
                    </Button>
                  </Link>
                </div>
              </Card.Content>
            </Card>

            {/* Claims feed */}
            <Card className="border border-black/5 bg-white">
              <Card.Header>
                <div className="flex items-center justify-between">
                  <Card.Title className="text-base font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-rose-600" />
                    实时领取记录 ({packet.claims.length}/{packet.totalCount})
                  </Card.Title>
                  <Button size="sm" variant="ghost" onPress={() => fetchStatus(false)}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    刷新
                  </Button>
                </div>
              </Card.Header>
              <Card.Content>
                {packet.claims.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted">
                    暂无人领取，快把激活码或领取链接分享给好友吧！
                  </div>
                ) : (
                  <div className="divide-y divide-black/5">
                    {packet.claims.map((c) => (
                      <div key={c.id} className="py-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{c.maskedEmail}</div>
                          <div className="text-xs text-muted">
                            {new Date(c.claimedAt).toLocaleString("zh-CN")}
                          </div>
                        </div>
                        <div className="font-bold text-rose-600">{c.amount} Lyt</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Content>
            </Card>
          </>
        )}
    </div>
  );
}
