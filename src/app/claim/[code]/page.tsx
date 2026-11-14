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
import {
  Award,
  CheckCircle2,
  Gift,
  Lock,
  LogIn,
  Mail,
  Sparkles,
} from "lucide-react";

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
  expiresAt: string | null;
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
      setError(err instanceof Error ? err.message : "加载红包失败");
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
        if (active) setError(err instanceof Error ? err.message : "加载红包失败");
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
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted">正在拆封红包信息...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-md mx-auto py-12 space-y-4">
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>无法打开红包</Alert.Title>
            <Alert.Description>{error || "红包不存在或尚未激活"}</Alert.Description>
          </Alert.Content>
        </Alert>
        <div className="text-center">
          <Link href="/claim">
            <Button variant="secondary">重新输入激活码</Button>
          </Link>
        </div>
      </div>
    );
  }

  const alreadyClaimedAmount = claimedResult?.amount || data.userClaimedAmount;
  const canClaim = data.status === "active" && data.remainingCount > 0 && !alreadyClaimedAmount;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Main Red Envelope Card */}
      <Card className="border-none shadow-2xl overflow-hidden red-envelope-gradient text-white">
        <Card.Content className="p-6 sm:p-8 text-center space-y-5">
          <div className="flex items-center justify-between text-xs text-white/80">
            <span className="font-mono bg-white/15 px-2.5 py-1 rounded-full">
              {data.redPacketCode}
            </span>
            <Chip color="warning" variant="soft" size="sm">
              <Chip.Label>
                {data.packetType === "lucky" ? "拼手气红包" : "普通红包"}
              </Chip.Label>
            </Chip>
          </div>

          <div className="space-y-2 pt-2">
            <div className="w-16 h-16 mx-auto rounded-full gold-shimmer text-zinc-950 flex items-center justify-center shadow-lg">
              <Gift className="w-8 h-8" />
            </div>
            <div className="text-sm text-amber-200 font-medium">
              来自 {data.senderName} 的红包
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              “{data.greeting}”
            </h1>
          </div>

          {alreadyClaimedAmount ? (
            <div className="rounded-2xl bg-white/15 backdrop-blur-xs border border-amber-300/40 p-5 space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-amber-200 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" />
                恭喜！已实时转账至您的 Lyt IT Pay 账户
              </div>
              <div className="text-4xl font-black text-amber-200">
                +{alreadyClaimedAmount} <span className="text-lg">Lyt</span>
              </div>
              {claimedResult?.emailMasked && (
                <div className="text-xs text-white/80">
                  收款账户：{claimedResult.emailMasked}
                </div>
              )}
            </div>
          ) : data.status !== "active" || data.remainingCount <= 0 ? (
            <div className="rounded-2xl bg-black/20 p-4 text-sm text-white/90">
              {data.status === "expired"
                ? "很遗憾，该红包已超过有效期"
                : data.status === "canceled"
                  ? "该红包已被取消"
                  : "手慢了，红包已被全部领完啦！"}
            </div>
          ) : null}

          <div className="text-xs text-white/80">
            总金额 {data.packetAmount} Lyt · 剩余 {data.remainingCount}/{data.totalCount} 份
          </div>
        </Card.Content>
      </Card>

      {/* Claim Action Card */}
      {canClaim && (
        <Card className="border border-black/5 shadow-lg bg-white">
          <Card.Content className="p-6 space-y-5">
            <form onSubmit={handleClaim} className="space-y-4">
              {userEmail ? (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-emerald-700 font-medium">
                      已通过 Lyt IT Pay 授权验证身份
                    </div>
                    <div className="text-sm font-bold text-emerald-900 mt-0.5">
                      {userEmail}
                    </div>
                  </div>
                  <Chip color="success" variant="soft" size="sm">
                    <Chip.Label>OAuth 已验证</Chip.Label>
                  </Chip>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/70">
                    <div className="text-xs text-foreground/80">
                      <strong className="text-rose-700 block text-sm">
                        推荐：Lyt IT Pay 一键授权领取
                      </strong>
                      无需手动输入邮箱，自动获取账户并秒速入账
                    </div>
                    <Link
                      href={`/api/auth/login?returnTo=${encodeURIComponent(`/claim/${code}`)}`}
                      className="shrink-0"
                    >
                      <Button variant="primary" size="sm">
                        <LogIn className="w-3.5 h-3.5" />
                        一键授权
                      </Button>
                    </Link>
                  </div>

                  {data.allowManualClaimEmail && (
                    <>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <Separator className="flex-1" />
                        <span>或手动填写 Lyt IT Pay 收款邮箱</span>
                        <Separator className="flex-1" />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="claimer-email"
                          className="text-sm font-medium flex items-center gap-1.5"
                        >
                          <Mail className="w-4 h-4 text-rose-600" />
                          Lyt IT Pay 注册邮箱
                        </Label>
                        <Input
                          id="claimer-email"
                          type="email"
                          required
                          fullWidth
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          placeholder="请输入已激活的 Lyt IT Pay 邮箱"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {data.hasPassphrase && (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="claim-passphrase"
                    className="text-sm font-medium flex items-center gap-1.5"
                  >
                    <Lock className="w-4 h-4 text-rose-600" />
                    请输入红包口令
                  </Label>
                  <Input
                    id="claim-passphrase"
                    type="text"
                    required
                    fullWidth
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="输入发红包人设置的口令"
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
                className="font-bold text-base shadow-md"
              >
                {claiming ? (
                  <>
                    <Spinner size="sm" color="current" />
                    正在拆红包并打款中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    开 · 拆红包立即到账
                  </>
                )}
              </Button>
            </form>
          </Card.Content>
        </Card>
      )}

      {/* Leaderboard / Claims list */}
      <Card className="border border-black/5 bg-white">
        <Card.Header>
          <Card.Title className="text-base font-bold">
            领取手气榜 ({data.claims.length}/{data.totalCount})
          </Card.Title>
        </Card.Header>
        <Card.Content>
          {data.claims.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">
              还没有人拆开，快来抢第一个手气！
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {data.claims.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {c.maskedEmail}
                      {c.isBestLuck && (
                        <Chip color="warning" variant="soft" size="sm">
                          <Award className="w-3 h-3 mr-0.5 inline" />
                          <Chip.Label>手气最佳</Chip.Label>
                        </Chip>
                      )}
                    </div>
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
    </div>
  );
}
