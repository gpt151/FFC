"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  Modal,
  Separator,
  Spinner,
  Switch,
  Tabs,
} from "@heroui/react";
import {
  Download,
  LogOut,
  RefreshCw,
  Search,
} from "lucide-react";

interface AdminPacket {
  id: number;
  public_id: string;
  red_packet_code: string;
  packet_type: "lucky" | "fixed";
  total_count: number;
  remaining_count: number;
  packet_amount_cents: number;
  remaining_amount_cents: number;
  fee_amount_cents: number;
  total_pay_cents: number;
  fee_rate: number;
  fee_mode: string;
  fee_recipient_email: string;
  fee_transfer_status: "pending" | "completed" | "failed" | "self_retained";
  fee_transfer_error: string | null;
  greeting: string;
  sender_name: string;
  sender_email: string | null;
  payer_email: string | null;
  payment_link_code: string;
  payment_transaction_id: number | null;
  status: string;
  created_at: string;
  paid_at: string | null;
}

interface AdminClaim {
  id: number;
  red_packet_id: number;
  red_packet_code: string;
  claimer_email: string;
  claim_method: "oauth" | "manual";
  amount_cents: number;
  transfer_status: "processing" | "completed" | "failed";
  transfer_error: string | null;
  claimed_at: string;
}

interface DashboardPayload {
  summary: {
    totalPackets: number;
    paidPacketsCount: number;
    awaitingPaymentCount: number;
    activeCount: number;
    completedCount: number;
    totalClaimsCount: number;
    failedClaimsCount: number;
    totalVolume: string;
    totalPacketPool: string;
    totalFee: string;
    settledFee: string;
    pendingOrFailedFee: string;
    totalClaimed: string;
    totalUnclaimed: string;
  };
  dailySeries: Array<{
    date: string;
    volume: number;
    fee: number;
    claimCount: number;
    packetCount: number;
  }>;
  packets: AdminPacket[];
  claims: AdminClaim[];
  settings: {
    feeRate: number;
    feeRecipientEmail: string;
    feeMode: "sender_pays" | "deduct_from_packet";
    allowManualClaimEmail: boolean;
    merchantEmail: string;
    merchantPasswordConfigured: boolean;
  };
  storage: {
    postgresConfigured: boolean;
    ephemeralWarning: boolean;
  };
}

interface MerchantStatus {
  connected: boolean;
  email?: string;
  balance?: string;
  error?: string;
  transactions?: {
    transactions?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

function centsToStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function AdminPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [usingDefaultDevPw, setUsingDefaultDevPw] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [setupPassword, setSetupPassword] = useState("");
  const [setupMerchantEmail, setSetupMerchantEmail] = useState("1218545105@qq.com");
  const [setupMerchantPassword, setSetupMerchantPassword] = useState("");
  const [setupFeeRecipient, setSetupFeeRecipient] = useState("1218545105@qq.com");
  const [setupFeePercent, setSetupFeePercent] = useState("5");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [submittingSetup, setSubmittingSetup] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [merchant, setMerchant] = useState<MerchantStatus | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "danger"; text: string } | null>(
    null
  );

  const [activeTab, setActiveTab] = useState("packets");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPacket, setSelectedPacket] = useState<AdminPacket | null>(null);

  const [feePercent, setFeePercent] = useState("5");
  const [feeRecipient, setFeeRecipient] = useState("1218545105@qq.com");
  const [feeMode, setFeeMode] = useState<"sender_pays" | "deduct_from_packet">("sender_pays");
  const [allowManual, setAllowManual] = useState(true);
  const [merchantEmail, setMerchantEmail] = useState("");
  const [merchantPassword, setMerchantPassword] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const json = await res.json();
      if (json?.data) {
        const d = json.data as DashboardPayload;
        setDashboard(d);
        setFeePercent(String(Number((d.settings.feeRate * 100).toFixed(2))));
        setFeeRecipient(d.settings.feeRecipientEmail);
        setFeeMode(d.settings.feeMode);
        setAllowManual(d.settings.allowManualClaimEmail);
        setMerchantEmail(d.settings.merchantEmail);
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  const loadMerchant = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/merchant", { cache: "no-store" });
      const json = await res.json();
      if (json.status === "success") {
        setMerchant(json.data);
      } else {
        setMerchant({ connected: false, error: json.message });
      }
    } catch (err) {
      setMerchant({
        connected: false,
        error: err instanceof Error ? err.message : "连接失败",
      });
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.authenticated) {
          setAuthenticated(true);
          loadDashboard();
          loadMerchant();
        }
        setNeedsSetup(Boolean(res?.data?.needsSetup));
        setUsingDefaultDevPw(Boolean(res?.data?.usingDefaultDevPassword));
      })
      .finally(() => setAuthLoading(false));
  }, [loadDashboard, loadMerchant]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);
    setSubmittingSetup(true);
    try {
      const rateNum = Number(setupFeePercent) / 100;
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: setupPassword,
          merchantEmail: setupMerchantEmail.trim(),
          merchantPassword: setupMerchantPassword,
          feeRecipientEmail: setupFeeRecipient.trim() || setupMerchantEmail.trim(),
          feeRate: rateNum,
          feeMode: "sender_pays",
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json.message || "初始化失败");
      }
      setNeedsSetup(false);
      setAuthenticated(true);
      await Promise.all([loadDashboard(), loadMerchant()]);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "初始化失败");
    } finally {
      setSubmittingSetup(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json.message || "密码错误");
      }
      setAuthenticated(true);
      await Promise.all([loadDashboard(), loadMerchant()]);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" });
    setAuthenticated(false);
    setDashboard(null);
  };

  const handlePacketAction = async (
    publicId: string,
    action: "sync" | "retry_fee" | "cancel"
  ) => {
    setActionMsg(null);
    const res = await fetch(`/api/admin/packets/${encodeURIComponent(publicId)}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!res.ok || json.status === "error") {
      setActionMsg({ type: "danger", text: json.message || "操作失败" });
    } else {
      setActionMsg({ type: "success", text: json.message || "已完成" });
      await loadDashboard();
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeRate: Number(feePercent) / 100,
          feeRecipientEmail: feeRecipient,
          feeMode,
          allowManualClaimEmail: allowManual,
          merchantEmail: merchantEmail.trim() || undefined,
          merchantPassword: merchantPassword || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json.message || "保存失败");
      }
      setMerchantPassword("");
      setActionMsg({ type: "success", text: "配置已更新" });
      await Promise.all([loadDashboard(), loadMerchant()]);
    } catch (err) {
      setActionMsg({
        type: "danger",
        text: err instanceof Error ? err.message : "保存失败",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredPackets = useMemo(() => {
    if (!dashboard) return [];
    const q = search.trim().toLowerCase();
    return dashboard.packets.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.red_packet_code.toLowerCase().includes(q) ||
        p.public_id.toLowerCase().includes(q) ||
        (p.payer_email || "").toLowerCase().includes(q) ||
        (p.sender_email || "").toLowerCase().includes(q) ||
        p.greeting.toLowerCase().includes(q)
      );
    });
  }, [dashboard, search, statusFilter]);

  const selectedPacketClaims = useMemo(() => {
    if (!dashboard || !selectedPacket) return [];
    return dashboard.claims.filter((c) => c.red_packet_id === selectedPacket.id);
  }, [dashboard, selectedPacket]);

  const chartMax = useMemo(() => {
    if (!dashboard) return 10;
    return Math.max(...dashboard.dailySeries.map((d) => d.volume), 1);
  }, [dashboard]);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!authenticated && needsSetup) {
    return (
      <div className="max-w-[440px] mx-auto py-12">
        <Card className="border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
          <Card.Content className="p-6 sm:p-7 space-y-5">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">首次部署初始化</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                配置管理员密码与 Lyt IT Pay 托管账号，信息将加密保存在数据库中
              </p>
            </div>

            <form onSubmit={handleSetup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="setup-admin-pw" className="text-xs font-medium text-zinc-500">
                  设置后台登录密码（至少 6 位）
                </Label>
                <Input
                  id="setup-admin-pw"
                  type="password"
                  required
                  minLength={6}
                  fullWidth
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  placeholder="用于登录 /admin 后台"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="setup-merchant-email" className="text-xs font-medium text-zinc-500">
                  Lyt IT Pay 托管收款账号
                </Label>
                <Input
                  id="setup-merchant-email"
                  type="email"
                  required
                  fullWidth
                  value={setupMerchantEmail}
                  onChange={(e) => setSetupMerchantEmail(e.target.value)}
                  placeholder="1218545105@qq.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="setup-merchant-pw" className="text-xs font-medium text-zinc-500">
                  Lyt IT Pay 托管账号密码
                </Label>
                <Input
                  id="setup-merchant-pw"
                  type="password"
                  required
                  fullWidth
                  value={setupMerchantPassword}
                  onChange={(e) => setSetupMerchantPassword(e.target.value)}
                  placeholder="用于创建收款链接与发放红包"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="setup-fee-recipient" className="text-xs font-medium text-zinc-500">
                    抽成收款邮箱
                  </Label>
                  <Input
                    id="setup-fee-recipient"
                    type="email"
                    required
                    fullWidth
                    value={setupFeeRecipient}
                    onChange={(e) => setSetupFeeRecipient(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-fee-pct" className="text-xs font-medium text-zinc-500">
                    手续费率 (%)
                  </Label>
                  <Input
                    id="setup-fee-pct"
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    required
                    fullWidth
                    value={setupFeePercent}
                    onChange={(e) => setSetupFeePercent(e.target.value)}
                  />
                </div>
              </div>

              {setupError && (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{setupError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}

              <Button type="submit" variant="primary" fullWidth isDisabled={submittingSetup}>
                {submittingSetup ? <Spinner size="sm" color="current" /> : "验证账号并完成初始化"}
              </Button>
            </form>
          </Card.Content>
        </Card>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-[380px] mx-auto py-14">
        <Card className="border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
          <Card.Content className="p-6 sm:p-7 space-y-5">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">管理后台</h1>
              <p className="text-xs text-zinc-500 mt-0.5">输入密码访问流水与结算数据</p>
            </div>

            {usingDefaultDevPw && (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    本地默认密码：<code className="font-mono">admin123456</code>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-pw" className="text-xs font-medium text-zinc-500">
                  密码
                </Label>
                <Input
                  id="admin-pw"
                  type="password"
                  required
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入管理员密码"
                />
              </div>
              {loginError && (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{loginError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              <Button type="submit" variant="primary" fullWidth isDisabled={loggingIn}>
                {loggingIn ? <Spinner size="sm" color="current" /> : "登录"}
              </Button>
            </form>
          </Card.Content>
        </Card>
      </div>
    );
  }

  const txItems =
    (merchant?.transactions?.transactions as Array<Record<string, unknown>> | undefined) ||
    (Array.isArray(merchant?.transactions?.data)
      ? (merchant?.transactions?.data as Array<Record<string, unknown>>)
      : []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">数据后台</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            抽成账户 {dashboard?.settings.feeRecipientEmail || "1218545105@qq.com"} ·{" "}
            {((dashboard?.settings.feeRate ?? 0.05) * 100).toFixed(1)}%
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={loadingData}
            onPress={() => {
              loadDashboard();
              loadMerchant();
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button size="sm" variant="ghost" onPress={handleLogout}>
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {dashboard?.storage.ephemeralWarning && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              当前为 Serverless 环境且未配置 `DATABASE_URL` / `POSTGRES_URL`，请绑定 Postgres 数据库以持久化数据。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {actionMsg && (
        <Alert status={actionMsg.type === "success" ? "success" : "danger"}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{actionMsg.text}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {/* Minimalist KPI Strip */}
      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border border-black/[0.06] bg-white">
            <Card.Content className="p-4 space-y-1">
              <div className="text-xs text-zinc-500">实付流水</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900">
                {dashboard.summary.totalVolume} <span className="text-xs font-normal text-zinc-400">ELC</span>
              </div>
              <div className="text-[11px] text-zinc-400">
                已付 {dashboard.summary.paidPacketsCount} · 待付 {dashboard.summary.awaitingPaymentCount}
              </div>
            </Card.Content>
          </Card>

          <Card className="border border-black/[0.06] bg-white">
            <Card.Content className="p-4 space-y-1">
              <div className="text-xs text-zinc-500">手续费收益 (5%)</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900">
                {dashboard.summary.totalFee} <span className="text-xs font-normal text-zinc-400">ELC</span>
              </div>
              <div className="text-[11px] text-zinc-400">
                已结 {dashboard.summary.settledFee} ELC · 待结 {dashboard.summary.pendingOrFailedFee} ELC
              </div>
            </Card.Content>
          </Card>

          <Card className="border border-black/[0.06] bg-white">
            <Card.Content className="p-4 space-y-1">
              <div className="text-xs text-zinc-500">已领取总额</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900">
                {dashboard.summary.totalClaimed} <span className="text-xs font-normal text-zinc-400">ELC</span>
              </div>
              <div className="text-[11px] text-zinc-400">
                {dashboard.summary.totalClaimsCount} 次领取 · 剩余 {dashboard.summary.totalUnclaimed} ELC
              </div>
            </Card.Content>
          </Card>

          <Card className="border border-black/[0.06] bg-white">
            <Card.Content className="p-4 space-y-1">
              <div className="text-xs text-zinc-500">托管账户余额</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900">
                {merchant?.connected ? (
                  <>
                    {merchant.balance} <span className="text-xs font-normal text-zinc-400">ELC</span>
                  </>
                ) : (
                  "--"
                )}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {merchant?.connected ? merchant.email : merchant?.error || "未连接"}
              </div>
            </Card.Content>
          </Card>
        </div>
      )}

      {/* Minimalist 14-Day Chart */}
      {dashboard && (
        <Card className="border border-black/[0.06] bg-white">
          <Card.Content className="p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-medium text-zinc-900">近 14 天流水与手续费</span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-xs bg-zinc-900 inline-block" />
                  流水
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-xs bg-[#c81e32] inline-block" />
                  手续费
                </span>
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <div className="min-w-[560px] h-36 flex items-end gap-2 pt-2">
                {dashboard.dailySeries.map((d) => {
                  const volPct = Math.max(4, Math.round((d.volume / chartMax) * 100));
                  const feePct = d.volume > 0 ? Math.max(2, Math.round((d.fee / chartMax) * 100)) : 0;
                  return (
                    <div
                      key={d.date}
                      className="flex-1 flex flex-col items-center gap-1.5 group"
                      title={`${d.date}: 流水 ${d.volume} ELC / 手续费 ${d.fee} ELC`}
                    >
                      <div className="w-full h-24 flex items-end justify-center gap-0.5">
                        <div
                          style={{ height: `${d.volume > 0 ? volPct : 3}%` }}
                          className={`w-2.5 rounded-t-xs transition-colors ${
                            d.volume > 0 ? "bg-zinc-900 group-hover:bg-zinc-700" : "bg-zinc-100"
                          }`}
                        />
                        <div
                          style={{ height: `${feePct}%` }}
                          className="w-1.5 rounded-t-xs bg-[#c81e32]"
                        />
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">{d.date}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card.Content>
        </Card>
      )}

      <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(String(k))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="后台板块">
            <Tabs.Tab id="packets">
              红包订单 ({dashboard?.packets.length || 0})
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="claims">
              领取流水 ({dashboard?.claims.length || 0})
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="merchant">
              官方对账
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="settings">
              设置
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="packets" className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索激活码、订单号、邮箱..."
                  className="pl-8 w-full"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-xl bg-white border border-black/[0.08] px-3 text-xs"
              >
                <option value="all">全部状态</option>
                <option value="awaiting_payment">待付款</option>
                <option value="active">领取中</option>
                <option value="completed">已领完</option>
                <option value="canceled">已取消</option>
              </select>
            </div>
            <a href="/api/admin/export?type=packets">
              <Button size="sm" variant="secondary">
                <Download className="w-3.5 h-3.5" />
                导出 CSV
              </Button>
            </a>
          </div>

          <Card className="border border-black/[0.06] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-50 border-b border-black/[0.05] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">激活码 / 订单</th>
                    <th className="px-4 py-3 font-medium">付款人</th>
                    <th className="px-4 py-3 font-medium">实付 / 红包池</th>
                    <th className="px-4 py-3 font-medium">手续费</th>
                    <th className="px-4 py-3 font-medium">进度</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {filteredPackets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    filteredPackets.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-3">
                          <div className="font-mono font-semibold text-zinc-900">
                            {p.red_packet_code}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">{p.public_id}</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          {p.payer_email || p.sender_email || "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <div className="font-medium text-zinc-900">
                            {centsToStr(p.total_pay_cents)} ELC
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            池 {centsToStr(p.packet_amount_cents)} ELC
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <div className="text-zinc-900">{centsToStr(p.fee_amount_cents)} ELC</div>
                          <div className="text-[11px] text-zinc-400">{p.fee_transfer_status}</div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-700">
                          {p.total_count - p.remaining_count}/{p.total_count}
                        </td>
                        <td className="px-4 py-3">
                          <Chip size="sm" variant="soft">
                            <Chip.Label className="text-[11px]">{p.status}</Chip.Label>
                          </Chip>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() => setSelectedPacket(p)}
                            >
                              明细
                            </Button>
                            {p.status === "awaiting_payment" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onPress={() => handlePacketAction(p.public_id, "sync")}
                                >
                                  核验
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger-soft"
                                  onPress={() => handlePacketAction(p.public_id, "cancel")}
                                >
                                  撤销
                                </Button>
                              </>
                            )}
                            {(p.status === "active" || p.status === "completed") &&
                              (p.fee_transfer_status === "failed" ||
                                p.fee_transfer_status === "pending") && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onPress={() => handlePacketAction(p.public_id, "retry_fee")}
                                >
                                  补发
                                </Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel id="claims" className="pt-4 space-y-3">
          <div className="flex justify-end">
            <a href="/api/admin/export?type=claims">
              <Button size="sm" variant="secondary">
                <Download className="w-3.5 h-3.5" />
                导出 CSV
              </Button>
            </a>
          </div>
          <Card className="border border-black/[0.06] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-50 border-b border-black/[0.05] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">激活码</th>
                    <th className="px-4 py-3 font-medium">领取人</th>
                    <th className="px-4 py-3 font-medium">方式</th>
                    <th className="px-4 py-3 font-medium">金额</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {!dashboard || dashboard.claims.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    dashboard.claims.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-3 font-mono text-zinc-400">#{c.id}</td>
                        <td className="px-4 py-3 font-mono font-medium">{c.red_packet_code}</td>
                        <td className="px-4 py-3">{c.claimer_email}</td>
                        <td className="px-4 py-3 text-zinc-500">{c.claim_method}</td>
                        <td className="px-4 py-3 font-medium tabular-nums">
                          {centsToStr(c.amount_cents)} ELC
                        </td>
                        <td className="px-4 py-3">
                          <Chip
                            size="sm"
                            variant="soft"
                            color={c.transfer_status === "completed" ? "success" : "danger"}
                          >
                            <Chip.Label className="text-[11px]">{c.transfer_status}</Chip.Label>
                          </Chip>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          {new Date(c.claimed_at).toLocaleString("zh-CN")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel id="merchant" className="pt-4 space-y-4">
          <Card className="border border-black/[0.06] bg-white">
            <Card.Content className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-900">Lyt IT Pay 托管账户</div>
                  <div className="text-xs text-zinc-400">官方余额与最近流水</div>
                </div>
                <Button size="sm" variant="secondary" onPress={loadMerchant}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  刷新
                </Button>
              </div>

              {!merchant?.connected ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{merchant?.error || "未连接"}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : (
                <>
                  <div className="p-4 rounded-xl bg-zinc-50 border border-black/[0.05] flex items-center justify-between">
                    <div className="text-sm font-medium text-zinc-900">{merchant.email}</div>
                    <div className="text-lg font-semibold tabular-nums text-zinc-900">
                      {merchant.balance} ELC
                    </div>
                  </div>
                  {txItems.length > 0 && (
                    <div className="divide-y divide-black/[0.05] border border-black/[0.05] rounded-xl">
                      {txItems.map((tx, idx) => (
                        <div
                          key={String(tx.id || idx)}
                          className="p-3 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="text-zinc-900">
                              {String(tx.sender_email || "")} → {String(tx.receiver_email || "")}
                            </div>
                            <div className="text-zinc-400 mt-0.5">
                              {String(tx.note || tx.type || "")} · {String(tx.created_at || "")}
                            </div>
                          </div>
                          <div className="font-mono font-medium tabular-nums">
                            {String(tx.amount || "0.00")} ELC
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card.Content>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel id="settings" className="pt-4">
          <Card className="border border-black/[0.06] bg-white max-w-xl">
            <Card.Content className="p-6">
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-fee-rate" className="text-xs font-medium text-zinc-500">
                      手续费比例 (%)
                    </Label>
                    <Input
                      id="s-fee-rate"
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      fullWidth
                      value={feePercent}
                      onChange={(e) => setFeePercent(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-fee-email" className="text-xs font-medium text-zinc-500">
                      手续费收款账户
                    </Label>
                    <Input
                      id="s-fee-email"
                      type="email"
                      required
                      fullWidth
                      value={feeRecipient}
                      onChange={(e) => setFeeRecipient(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-fee-mode" className="text-xs font-medium text-zinc-500">
                    计费方式
                  </Label>
                  <select
                    id="s-fee-mode"
                    value={feeMode}
                    onChange={(e) =>
                      setFeeMode(
                        e.target.value === "deduct_from_packet"
                          ? "deduct_from_packet"
                          : "sender_pays"
                      )
                    }
                    className="w-full h-10 rounded-xl bg-black/[0.04] px-3 text-xs"
                  >
                    <option value="sender_pays">外扣（红包 100 + 5% 手续费 = 实付 105）</option>
                    <option value="deduct_from_packet">内扣（实付 100，抽 5% 手续费，可领 95）</option>
                  </select>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-xs font-medium text-zinc-900">允许手动填邮箱领取</div>
                    <div className="text-[11px] text-zinc-400">关闭后需经 OAuth 授权领取</div>
                  </div>
                  <Switch isSelected={allowManual} onChange={setAllowManual}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-m-email" className="text-xs text-zinc-500">
                      托管账号邮箱
                    </Label>
                    <Input
                      id="s-m-email"
                      type="email"
                      fullWidth
                      value={merchantEmail}
                      onChange={(e) => setMerchantEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-m-pw" className="text-xs text-zinc-500">
                      托管账号密码（留空不改）
                    </Label>
                    <Input
                      id="s-m-pw"
                      type="password"
                      fullWidth
                      value={merchantPassword}
                      onChange={(e) => setMerchantPassword(e.target.value)}
                    />
                  </div>
                </div>

                <Button type="submit" variant="primary" isDisabled={savingSettings}>
                  {savingSettings ? <Spinner size="sm" color="current" /> : "保存"}
                </Button>
              </form>
            </Card.Content>
          </Card>
        </Tabs.Panel>
      </Tabs>

      <Modal
        isOpen={Boolean(selectedPacket)}
        onOpenChange={(open) => {
          if (!open) setSelectedPacket(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>{selectedPacket?.red_packet_code}</Modal.Heading>
                <Modal.CloseTrigger />
              </Modal.Header>
              <Modal.Body className="space-y-4">
                {selectedPacket && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-50 p-3 rounded-xl">
                      <div>订单：{selectedPacket.public_id}</div>
                      <div>支付码：{selectedPacket.payment_link_code}</div>
                      <div>付款人：{selectedPacket.payer_email || "-"}</div>
                      <div>流水 ID：{selectedPacket.payment_transaction_id || "-"}</div>
                      <div>实付：{centsToStr(selectedPacket.total_pay_cents)} ELC</div>
                      <div>
                        手续费：{centsToStr(selectedPacket.fee_amount_cents)} ELC ({selectedPacket.fee_transfer_status})
                      </div>
                    </div>
                    <div className="divide-y divide-black/[0.05] border border-black/[0.05] rounded-xl">
                      {selectedPacketClaims.length === 0 ? (
                        <div className="p-4 text-center text-xs text-zinc-400">暂无领取</div>
                      ) : (
                        selectedPacketClaims.map((c) => (
                          <div
                            key={c.id}
                            className="p-3 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="text-zinc-900">{c.claimer_email}</div>
                              <div className="text-zinc-400">
                                {c.claim_method} · {new Date(c.claimed_at).toLocaleString("zh-CN")}
                              </div>
                            </div>
                            <div className="font-medium tabular-nums">
                              {centsToStr(c.amount_cents)} ELC
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => setSelectedPacket(null)}>
                  关闭
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
