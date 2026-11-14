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
  Copy,
  ExternalLink,
  RefreshCw,
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
  greeting: string;
  senderName: string;
  paymentLinkCode: string;
  paymentUrl: string;
  createdAt: string;
  paidAt: string | null;
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
          throw new Error(json.message || "查询失败");
        }
        setPacket(json.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "查询失败");
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
          setError(json.message || "查询失败");
        } else {
          setPacket(json.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "查询失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [publicId]);

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
    setTimeout(() => setCopiedKey(null), 1800);
  };

  if (loading) {
    return (
      <div className="min-h-[45vh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !packet) {
    return (
      <div className="max-w-[440px] mx-auto py-12 space-y-4">
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error || "订单不存在"}</Alert.Description>
          </Alert.Content>
        </Alert>
        <Link href="/">
          <Button variant="secondary" fullWidth>
            返回
          </Button>
        </Link>
      </div>
    );
  }

  const claimUrl = packet.redPacketCode ? `${origin}/claim/${packet.redPacketCode}` : "";

  return (
    <div className="max-w-[480px] mx-auto space-y-5 pt-2 sm:pt-4">
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            {packet.status === "awaiting_payment"
              ? "等待付款"
              : packet.status === "canceled"
                ? "已取消"
                : "红包已激活"}
          </h1>
          <div className="text-xs text-zinc-400 font-mono mt-0.5">{packet.publicId}</div>
        </div>
        <Chip
          size="sm"
          variant="soft"
          color={
            packet.status === "active"
              ? "success"
              : packet.status === "awaiting_payment"
                ? "warning"
                : "default"
          }
        >
          <Chip.Label>
            {packet.status === "awaiting_payment" && "待付款"}
            {packet.status === "active" &&
              `${packet.totalCount - packet.remainingCount}/${packet.totalCount} 已领`}
            {packet.status === "completed" && "已领完"}
            {packet.status === "expired" && "已过期"}
            {packet.status === "canceled" && "已取消"}
          </Chip.Label>
        </Chip>
      </div>

      {packet.status === "awaiting_payment" && (
        <Card className="border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
          <Card.Content className="p-6 sm:p-7 space-y-6">
            <div className="text-center space-y-1">
              <div className="text-xs text-zinc-500">应付金额</div>
              <div className="text-4xl font-semibold tracking-tight tabular-nums text-zinc-900">
                {packet.totalPayAmount} <span className="text-base font-normal text-zinc-500">Lyt</span>
              </div>
              <div className="text-xs text-zinc-400 tabular-nums">
                红包 {packet.packetAmount} · 手续费 {packet.feeAmount}
              </div>
            </div>

            <div className="flex justify-center">
              <QrCodeBox value={packet.paymentUrl} size={172} />
            </div>

            <div className="space-y-2.5">
              <a href={packet.paymentUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="primary" size="lg" fullWidth className="font-medium">
                  前往 Lyt IT Pay 付款
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </a>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  isDisabled={checking}
                  onPress={handleManualVerify}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
                  核验付款
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => copyText("payurl", packet.paymentUrl)}
                >
                  {copiedKey === "payurl" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === "payurl" ? "已复制" : "复制收款链接"}
                </Button>
              </div>
            </div>

            <div className="text-center text-[11px] text-zinc-400">
              付款完成后将自动刷新并显示激活码
            </div>
          </Card.Content>
        </Card>
      )}

      {(packet.status === "active" || packet.status === "completed" || packet.status === "expired") &&
        packet.redPacketCode && (
          <>
            <Card className="border-none shadow-sm overflow-hidden envelope-surface text-white">
              <Card.Content className="p-6 sm:p-7 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-white/75">
                      {packet.packetType === "lucky" ? "拼手气" : "等额"} · {packet.packetAmount} Lyt · 剩余{" "}
                      {packet.remainingCount}/{packet.totalCount}
                    </div>
                    <h2 className="text-xl font-semibold leading-snug">{packet.greeting}</h2>
                  </div>
                  <div className="bg-white p-1.5 rounded-xl shrink-0">
                    <QrCodeBox value={claimUrl} size={96} />
                  </div>
                </div>

                <div className="rounded-xl bg-black/15 border border-white/15 p-3.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-white/70">激活码</div>
                    <div className="font-mono text-lg font-semibold tracking-wider">
                      {packet.redPacketCode}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => copyText("code", packet.redPacketCode!)}
                  >
                    {copiedKey === "code" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === "code" ? "已复制" : "复制"}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    fullWidth
                    onPress={() => copyText("link", claimUrl)}
                  >
                    {copiedKey === "link" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === "link" ? "已复制领取链接" : "复制领取链接"}
                  </Button>
                  <Link href={`/claim/${packet.redPacketCode}`} className="shrink-0">
                    <Button variant="ghost" className="text-white hover:bg-white/15">
                      打开
                    </Button>
                  </Link>
                </div>
              </Card.Content>
            </Card>

            <Card className="border border-black/[0.06] bg-white">
              <Card.Content className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-500">
                    领取记录 ({packet.claims.length}/{packet.totalCount})
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchStatus(false)}
                    className="text-xs text-zinc-400 hover:text-zinc-900 cursor-pointer"
                  >
                    刷新
                  </button>
                </div>
                <Separator />
                {packet.claims.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-400">暂无领取</div>
                ) : (
                  <div className="divide-y divide-black/[0.05]">
                    {packet.claims.map((c) => (
                      <div key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                        <div>
                          <div className="text-zinc-800">{c.maskedEmail}</div>
                          <div className="text-[11px] text-zinc-400">
                            {new Date(c.claimedAt).toLocaleString("zh-CN")}
                          </div>
                        </div>
                        <div className="font-medium tabular-nums text-zinc-900">
                          {c.amount} Lyt
                        </div>
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
