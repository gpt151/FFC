"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  Separator,
  Spinner,
} from "@heroui/react";

interface ClaimLookupData {
  redPacketCode: string;
  packetType: "lucky" | "fixed";
  totalCount: number;
  remainingCount: number;
  packetAmount: string;
  remainingAmount: string;
  greeting: string;
  senderName: string;
  hasPassphrase: boolean;
  status: "active" | "completed" | "expired" | "canceled";
  allowManualClaimEmail: boolean;
  userClaimedAmount: string | null;
  claims: Array<{
    id: number;
    maskedEmail: string;
    amount: string;
    claimedAt: string;
    isBestLuck?: boolean;
  }>;
}

export default function ClaimRedPacketPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code || "").toUpperCase();

  const [data, setData] = useState<ClaimLookupData | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimedResult, setClaimedResult] = useState<{
    amount: string;
    emailMasked: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInfo = useCallback(async () => {
    try {
      const [lookupRes, meRes] = await Promise.all([
        fetch(`/api/red-packets/lookup?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      const lookupJson = await lookupRes.json();
      const meJson = await meRes.json();

      if (meJson?.data?.user?.email) {
        setUserEmail(meJson.data.user.email);
      }
      if (!lookupRes.ok || lookupJson.status !== "success") {
        throw new Error(lookupJson.message || "未找到该红包");
      }
      setData(lookupJson.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/red-packets/lookup?code=${encodeURIComponent(code)}`, { cache: "no-store" }).then(
        (r) => r.json().then((json) => ({ ok: r.ok, json }))
      ),
      fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([lookupRes, meJson]) => {
        if (!active) return;
        if (meJson?.data?.user?.email) {
          setUserEmail(meJson.data.user.email);
        }
        if (!lookupRes.ok || lookupRes.json.status !== "success") {
          setError(lookupRes.json.message || "未找到该红包");
        } else {
          setData(lookupRes.json.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setClaiming(true);
    try {
      const res = await fetch("/api/red-packets/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          email: userEmail ? undefined : manualEmail,
          passphrase: passphrase || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json.message || "领取失败");
      }
      setClaimedResult({
        amount: json.data.claimedAmount,
        emailMasked: json.data.claimerEmailMasked,
      });
      await loadInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "领取失败");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[45vh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-[420px] mx-auto py-12 space-y-4">
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error || "红包不存在"}</Alert.Description>
          </Alert.Content>
        </Alert>
        <Link href="/claim">
          <Button variant="secondary" fullWidth>
            重新输入
          </Button>
        </Link>
      </div>
    );
  }

  const alreadyClaimedAmount = claimedResult?.amount || data.userClaimedAmount;
  const canClaim = data.status === "active" && data.remainingCount > 0 && !alreadyClaimedAmount;

  return (
    <div className="max-w-[440px] mx-auto space-y-5 pt-2 sm:pt-4">
      <Card className="border-none shadow-sm overflow-hidden envelope-surface text-white">
        <Card.Content className="p-7 text-center space-y-4">
          <div className="flex items-center justify-between text-[11px] text-white/70">
            <span className="font-mono">{data.redPacketCode}</span>
            <span>{data.packetType === "lucky" ? "拼手气" : "等额"}</span>
          </div>

          <div className="space-y-1.5 py-2">
            <div className="text-xs text-white/75">{data.senderName}</div>
            <h1 className="text-xl font-semibold tracking-tight">{data.greeting}</h1>
          </div>

          {alreadyClaimedAmount ? (
            <div className="rounded-xl bg-black/15 border border-white/15 p-4 space-y-1">
              <div className="text-[11px] text-white/75">已转入 Lyt IT Pay</div>
              <div className="text-3xl font-semibold tabular-nums text-amber-200">
                +{alreadyClaimedAmount} <span className="text-sm font-normal">Lyt</span>
              </div>
              {claimedResult?.emailMasked && (
                <div className="text-[11px] text-white/70">{claimedResult.emailMasked}</div>
              )}
            </div>
          ) : data.status !== "active" || data.remainingCount <= 0 ? (
            <div className="rounded-xl bg-black/15 p-3 text-xs text-white/85">
              {data.status === "expired"
                ? "已过期"
                : data.status === "canceled"
                  ? "已取消"
                  : "已领完"}
            </div>
          ) : null}

          <div className="text-[11px] text-white/70 tabular-nums">
            总额 {data.packetAmount} Lyt · 剩余 {data.remainingCount}/{data.totalCount}
          </div>
        </Card.Content>
      </Card>

      {canClaim && (
        <Card className="border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
          <Card.Content className="p-6 space-y-4">
            <form onSubmit={handleClaim} className="space-y-4">
              {userEmail ? (
                <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-zinc-50 border border-black/[0.05]">
                  <span className="text-zinc-500">收款账户</span>
                  <span className="font-medium text-zinc-900">{userEmail}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <a
                    href={`/api/auth/login?returnTo=${encodeURIComponent(`/claim/${code}`)}`}
                    className="block"
                  >
                    <Button variant="secondary" fullWidth>
                      Lyt IT Pay 授权领取
                    </Button>
                  </a>

                  {data.allowManualClaimEmail && (
                    <>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                        <Separator className="flex-1" />
                        <span>或</span>
                        <Separator className="flex-1" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="claimer-email" className="text-xs font-medium text-zinc-500">
                          Lyt IT Pay 邮箱
                        </Label>
                        <Input
                          id="claimer-email"
                          type="email"
                          required
                          fullWidth
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          placeholder="name@example.com"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {data.hasPassphrase && (
                <div className="space-y-1.5">
                  <Label htmlFor="claim-passphrase" className="text-xs font-medium text-zinc-500">
                    口令
                  </Label>
                  <Input
                    id="claim-passphrase"
                    type="text"
                    required
                    fullWidth
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="输入领取口令"
                  />
                </div>
              )}

              {error && (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isDisabled={claiming || (!userEmail && !data.allowManualClaimEmail)}
                className="font-medium"
              >
                {claiming ? (
                  <>
                    <Spinner size="sm" color="current" />
                    拆包中...
                  </>
                ) : (
                  "拆红包"
                )}
              </Button>
            </form>
          </Card.Content>
        </Card>
      )}

      <Card className="border border-black/[0.06] bg-white">
        <Card.Content className="p-5 space-y-3">
          <div className="text-xs font-medium text-zinc-500">
            领取详情 ({data.claims.length}/{data.totalCount})
          </div>
          <Separator />
          {data.claims.length === 0 ? (
            <div className="py-5 text-center text-xs text-zinc-400">暂无领取</div>
          ) : (
            <div className="divide-y divide-black/[0.05]">
              {data.claims.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="flex items-center gap-2 text-zinc-800">
                      <span>{c.maskedEmail}</span>
                      {c.isBestLuck && (
                        <Chip color="warning" variant="soft" size="sm">
                          <Chip.Label className="text-[11px]">手气最佳</Chip.Label>
                        </Chip>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {new Date(c.claimedAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <div className="font-medium tabular-nums text-zinc-900">{c.amount} Lyt</div>
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
