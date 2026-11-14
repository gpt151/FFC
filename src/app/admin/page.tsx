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
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Coins,
  Download,
  Eye,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Wallet,
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
  const [usingDefaultDevPw, setUsingDefaultDevPw] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

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

  // Settings form state
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
        setUsingDefaultDevPw(Boolean(res?.data?.usingDefaultDevPassword));
      })
      .finally(() => setAuthLoading(false));
  }, [loadDashboard, loadMerchant]);

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
        throw new Error(json.message || "登录失败");
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
      setActionMsg({ type: "success", text: json.message || "操作成功" });
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
      setActionMsg({ type: "success", text: "平台配置已更新" });
      await Promise.all([loadDashboard(), loadMerchant()]);
    } catch (err) {
      setActionMsg({
        type: "danger",
        text: err instanceof Error ? err.message : "保存配置失败",
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
    const maxVol = Math.max(...dashboard.dailySeries.map((d) => d.volume), 1);
    return maxVol;
  }, [dashboard]);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card className="border border-black/5 shadow-xl bg-white">
          <Card.Header className="text-center pb-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-900 text-white flex items-center justify-center mb-2">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <Card.Title className="text-xl font-bold">LytPay 红包数据后台</Card.Title>
            <Card.Description>请输入管理员密码查看详细流水、手续费收益与对账数据</Card.Description>
          </Card.Header>
          <Card.Content>
            {usingDefaultDevPw && (
              <Alert status="warning" className="mb-4">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>本地开发默认密码提示</Alert.Title>
                  <Alert.Description>
                    未配置 ADMIN_PASSWORD，本地开发默认密码为 <code className="font-mono">admin123456</code>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-pw" className="text-sm font-medium flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  管理员密码
                </Label>
                <Input
                  id="admin-pw"
                  type="password"
                  required
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入 ADMIN_PASSWORD"
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
              <Button type="submit" variant="primary" size="lg" fullWidth isDisabled={loggingIn}>
                {loggingIn ? <Spinner size="sm" color="current" /> : "进入管理后台"}
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-rose-600" />
            LytPay 红包运营数据后台
          </h1>
          <p className="text-xs text-muted mt-0.5">
            手续费收款账户：
            <strong className="text-foreground">
              {dashboard?.settings.feeRecipientEmail || "1218545105@qq.com"}
            </strong>{" "}
            ({((dashboard?.settings.feeRate ?? 0.05) * 100).toFixed(1)}%)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            刷新全量数据
          </Button>
          <Button size="sm" variant="ghost" onPress={handleLogout}>
            <LogOut className="w-3.5 h-3.5" />
            退出后台
          </Button>
        </div>
      </div>

      {dashboard?.storage.ephemeralWarning && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>当前在 Vercel 运行且未绑定 PostgreSQL 数据库</Alert.Title>
            <Alert.Description>
              请在 Vercel 项目中添加 Neon / Supabase / Postgres 并设置 `DATABASE_URL`（或 `POSTGRES_URL`），否则数据无法跨实例持久化。
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

      {/* KPI Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-white border border-black/5">
            <Card.Content className="p-5 space-y-1">
              <div className="text-xs text-muted flex items-center justify-between">
                <span>累计实付流水总额</span>
                <Wallet className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-2xl font-extrabold">{dashboard.summary.totalVolume} Lyt</div>
              <div className="text-xs text-muted">
                已付款 {dashboard.summary.paidPacketsCount} 单 · 待付款{" "}
                {dashboard.summary.awaitingPaymentCount} 单
              </div>
            </Card.Content>
          </Card>

          <Card className="bg-white border border-black/5">
            <Card.Content className="p-5 space-y-1">
              <div className="text-xs text-muted flex items-center justify-between">
                <span>5% 平台手续费总收益</span>
                <Coins className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-extrabold text-amber-600">
                {dashboard.summary.totalFee} Lyt
              </div>
              <div className="text-xs text-muted">
                已结算 {dashboard.summary.settledFee} · 待补发{" "}
                {dashboard.summary.pendingOrFailedFee}
              </div>
            </Card.Content>
          </Card>

          <Card className="bg-white border border-black/5">
            <Card.Content className="p-5 space-y-1">
              <div className="text-xs text-muted flex items-center justify-between">
                <span>红包池发放 / 领取情况</span>
                <Activity className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-extrabold">{dashboard.summary.totalClaimed} Lyt</div>
              <div className="text-xs text-muted">
                总池 {dashboard.summary.totalPacketPool} · 剩余未领{" "}
                {dashboard.summary.totalUnclaimed}
              </div>
            </Card.Content>
          </Card>

          <Card className="bg-white border border-black/5">
            <Card.Content className="p-5 space-y-1">
              <div className="text-xs text-muted flex items-center justify-between">
                <span>托管账户实时余额</span>
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-extrabold">
                {merchant?.connected ? `${merchant.balance} Lyt` : "未连接"}
              </div>
              <div className="text-xs text-muted truncate">
                {merchant?.connected
                  ? merchant.email
                  : merchant?.error || "请检查托管账号配置"}
              </div>
            </Card.Content>
          </Card>
        </div>
      )}

      {/* 14-day Trend SVG Chart */}
      {dashboard && (
        <Card className="bg-white border border-black/5">
          <Card.Header className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Card.Title className="text-base font-bold">近 14 天交易流水与手续费趋势</Card.Title>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                  实付流水 (Lyt)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 inline-block" />
                  5% 手续费 (Lyt)
                </span>
              </div>
            </div>
          </Card.Header>
          <Card.Content>
            <div className="w-full overflow-x-auto">
              <div className="min-w-[600px] h-44 flex items-end gap-2 pt-4 pb-1">
                {dashboard.dailySeries.map((d) => {
                  const volPct = Math.max(4, Math.round((d.volume / chartMax) * 100));
                  const feePct = d.volume > 0 ? Math.max(2, Math.round((d.fee / chartMax) * 100)) : 0;
                  return (
                    <div
                      key={d.date}
                      className="flex-1 flex flex-col items-center gap-1 group"
                      title={`${d.date}: 流水 ${d.volume} Lyt / 手续费 ${d.fee} Lyt / 领取 ${d.claimCount} 次`}
                    >
                      <div className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {d.volume > 0 ? d.volume.toFixed(1) : ""}
                      </div>
                      <div className="w-full h-28 flex items-end justify-center gap-1">
                        <div
                          style={{ height: `${d.volume > 0 ? volPct : 3}%` }}
                          className={`w-3 rounded-t-md transition-all ${
                            d.volume > 0 ? "bg-rose-500 group-hover:bg-rose-600" : "bg-black/5"
                          }`}
                        />
                        <div
                          style={{ height: `${feePct}%` }}
                          className="w-2 rounded-t-md bg-amber-400"
                        />
                      </div>
                      <div className="text-[10px] text-muted font-mono">{d.date}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card.Content>
        </Card>
      )}

      {/* Main Data Tabs */}
      <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(String(k))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="后台面板">
            <Tabs.Tab id="packets">
              红包订单明细 ({dashboard?.packets.length || 0})
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="claims">
              领取打款流水 ({dashboard?.claims.length || 0})
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="merchant">
              托管账户对账
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="settings">
              系统与手续费配置
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        {/* Tab 1: Packets */}
        <Tabs.Panel id="packets" className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索红包码 / 订单号 / 邮箱..."
                  className="pl-9 w-full"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-xl bg-white border border-black/10 px-3 text-sm"
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
                导出订单 CSV
              </Button>
            </a>
          </div>

          <Card className="bg-white border border-black/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/[0.03] text-xs text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3">红包码 / 订单</th>
                    <th className="px-4 py-3">付款人</th>
                    <th className="px-4 py-3">实付 / 红包池</th>
                    <th className="px-4 py-3">5% 手续费</th>
                    <th className="px-4 py-3">领取进度</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filteredPackets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted">
                        暂无匹配的红包订单
                      </td>
                    </tr>
                  ) : (
                    filteredPackets.map((p) => (
                      <tr key={p.id} className="hover:bg-black/[0.015]">
                        <td className="px-4 py-3">
                          <div className="font-mono font-bold text-rose-600">
                            {p.red_packet_code}
                          </div>
                          <div className="text-[11px] text-muted font-mono">{p.public_id}</div>
                          <div className="text-[11px] text-muted">
                            {new Date(p.created_at).toLocaleString("zh-CN")}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium">
                            {p.payer_email || p.sender_email || "未记录"}
                          </div>
                          <div className="text-[11px] text-muted truncate max-w-[140px]">
                            {p.greeting}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{centsToStr(p.total_pay_cents)} Lyt</div>
                          <div className="text-xs text-muted">
                            净额 {centsToStr(p.packet_amount_cents)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-amber-700">
                            {centsToStr(p.fee_amount_cents)} Lyt
                          </div>
                          <div className="text-[11px]">
                            {p.fee_transfer_status === "completed" && (
                              <span className="text-emerald-600">已转账抽成</span>
                            )}
                            {p.fee_transfer_status === "self_retained" && (
                              <span className="text-emerald-600">同账户自留</span>
                            )}
                            {p.fee_transfer_status === "pending" && (
                              <span className="text-muted">待入账</span>
                            )}
                            {p.fee_transfer_status === "failed" && (
                              <span className="text-rose-600" title={p.fee_transfer_error || ""}>
                                结算失败
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {p.total_count - p.remaining_count} / {p.total_count} 份
                          </div>
                          <div className="text-xs text-muted">
                            余 {centsToStr(p.remaining_amount_cents)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Chip
                            size="sm"
                            variant="soft"
                            color={
                              p.status === "active"
                                ? "success"
                                : p.status === "completed"
                                  ? "accent"
                                  : p.status === "awaiting_payment"
                                    ? "warning"
                                    : "default"
                            }
                          >
                            <Chip.Label>{p.status}</Chip.Label>
                          </Chip>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() => setSelectedPacket(p)}
                            >
                              <Eye className="w-3.5 h-3.5" />
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
                                  补发手续费
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

        {/* Tab 2: Claims */}
        <Tabs.Panel id="claims" className="pt-4 space-y-4">
          <div className="flex justify-end">
            <a href="/api/admin/export?type=claims">
              <Button size="sm" variant="secondary">
                <Download className="w-3.5 h-3.5" />
                导出领取流水 CSV
              </Button>
            </a>
          </div>
          <Card className="bg-white border border-black/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/[0.03] text-xs text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3">流水 ID</th>
                    <th className="px-4 py-3">红包码</th>
                    <th className="px-4 py-3">领取人邮箱</th>
                    <th className="px-4 py-3">验证方式</th>
                    <th className="px-4 py-3">金额</th>
                    <th className="px-4 py-3">打款状态</th>
                    <th className="px-4 py-3">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {!dashboard || dashboard.claims.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted">
                        暂无领取记录
                      </td>
                    </tr>
                  ) : (
                    dashboard.claims.map((c) => (
                      <tr key={c.id} className="hover:bg-black/[0.015]">
                        <td className="px-4 py-3 font-mono text-xs">#{c.id}</td>
                        <td className="px-4 py-3 font-mono font-semibold">{c.red_packet_code}</td>
                        <td className="px-4 py-3 text-xs font-medium">{c.claimer_email}</td>
                        <td className="px-4 py-3">
                          <Chip
                            size="sm"
                            variant="soft"
                            color={c.claim_method === "oauth" ? "success" : "default"}
                          >
                            <Chip.Label>{c.claim_method === "oauth" ? "OAuth" : "手动邮箱"}</Chip.Label>
                          </Chip>
                        </td>
                        <td className="px-4 py-3 font-bold text-rose-600">
                          {centsToStr(c.amount_cents)} Lyt
                        </td>
                        <td className="px-4 py-3">
                          <Chip
                            size="sm"
                            variant="soft"
                            color={
                              c.transfer_status === "completed"
                                ? "success"
                                : c.transfer_status === "failed"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            <Chip.Label>{c.transfer_status}</Chip.Label>
                          </Chip>
                          {c.transfer_error && (
                            <div className="text-[11px] text-rose-600 mt-1 max-w-[200px] truncate">
                              {c.transfer_error}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
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

        {/* Tab 3: Merchant Reconciliation */}
        <Tabs.Panel id="merchant" className="pt-4 space-y-4">
          <Card className="bg-white border border-black/5">
            <Card.Header>
              <div className="flex items-center justify-between">
                <div>
                  <Card.Title className="text-base font-bold">Lyt IT Pay 托管账户对账</Card.Title>
                  <Card.Description>
                    实时调用官方 get_balance 与 get_transactions 接口核对账目
                  </Card.Description>
                </div>
                <Button size="sm" variant="secondary" onPress={loadMerchant}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  刷新官方流水
                </Button>
              </div>
            </Card.Header>
            <Card.Content className="space-y-4">
              {!merchant?.connected ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>托管账户未连接</Alert.Title>
                    <Alert.Description>{merchant?.error || "请检查账号密码配置"}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : (
                <>
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-emerald-700">当前托管账户</div>
                      <div className="font-bold text-emerald-950">{merchant.email}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-emerald-700">账户可用余额</div>
                      <div className="text-2xl font-extrabold text-emerald-700">
                        {merchant.balance} Lyt
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold mb-2">最近官方交易流水 (第 1 页)</div>
                    {txItems.length === 0 ? (
                      <pre className="text-xs bg-black/[0.03] p-4 rounded-xl overflow-x-auto">
                        {JSON.stringify(merchant.transactions, null, 2)}
                      </pre>
                    ) : (
                      <div className="divide-y divide-black/5 border border-black/5 rounded-xl overflow-hidden">
                        {txItems.map((tx, idx) => (
                          <div
                            key={String(tx.id || idx)}
                            className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="font-semibold">
                                {String(tx.sender_email || "")} → {String(tx.receiver_email || "")}
                              </div>
                              <div className="text-muted">
                                {String(tx.note || tx.type || "")} · {String(tx.created_at || "")}
                              </div>
                            </div>
                            <div className="font-mono font-bold text-sm">
                              {String(tx.amount || "0.00")} Lyt
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </Card.Content>
          </Card>
        </Tabs.Panel>

        {/* Tab 4: System Settings */}
        <Tabs.Panel id="settings" className="pt-4">
          <Card className="bg-white border border-black/5 max-w-2xl">
            <Card.Header>
              <Card.Title className="text-base font-bold flex items-center gap-2">
                <Settings className="w-4 h-4 text-rose-600" />
                费率与托管账户配置
              </Card.Title>
              <Card.Description>
                默认抽成 5% 至 1218545105@qq.com；支持在后台动态调整或覆盖环境变量
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-fee-rate" className="text-sm font-medium">
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
                    <Label htmlFor="s-fee-email" className="text-sm font-medium">
                      手续费收款 Lyt IT Pay 账户
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
                  <Label htmlFor="s-fee-mode" className="text-sm font-medium">
                    手续费计算模式
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
                    className="w-full h-10 rounded-xl bg-black/[0.04] px-3 text-sm"
                  >
                    <option value="sender_pays">
                      外扣模式（包 100 红包 + 5% 手续费 = 付 105，领取总池 100）
                    </option>
                    <option value="deduct_from_packet">
                      内扣模式（付 100，抽 5% 手续费 = 5，领取总池 95）
                    </option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-black/[0.03]">
                  <div>
                    <div className="text-sm font-medium">允许领取时手动输入邮箱</div>
                    <div className="text-xs text-muted">
                      关闭后，领取人必须通过 Lyt IT Pay OAuth 授权登录后才可拆红包
                    </div>
                  </div>
                  <Switch isSelected={allowManual} onChange={setAllowManual}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    托管收款账号覆盖配置（可选，优先推荐通过环境变量设置）
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="s-m-email" className="text-xs font-medium text-muted">
                        托管账户邮箱
                      </Label>
                      <Input
                        id="s-m-email"
                        type="email"
                        fullWidth
                        value={merchantEmail}
                        onChange={(e) => setMerchantEmail(e.target.value)}
                        placeholder="Lyt IT Pay 托管邮箱"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="s-m-pw" className="text-xs font-medium text-muted">
                        托管账户密码（留空则保持不变）
                      </Label>
                      <Input
                        id="s-m-pw"
                        type="password"
                        fullWidth
                        value={merchantPassword}
                        onChange={(e) => setMerchantPassword(e.target.value)}
                        placeholder="留空不修改"
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" variant="primary" isDisabled={savingSettings}>
                  {savingSettings ? <Spinner size="sm" color="current" /> : "保存配置"}
                </Button>
              </form>
            </Card.Content>
          </Card>
        </Tabs.Panel>
      </Tabs>

      {/* Packet Detail Modal */}
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
                <Modal.Heading>
                  红包详情 · {selectedPacket?.red_packet_code}
                </Modal.Heading>
                <Modal.CloseTrigger />
              </Modal.Header>
              <Modal.Body className="space-y-4">
                {selectedPacket && (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-xs bg-black/[0.03] p-3 rounded-xl">
                      <div>订单号：{selectedPacket.public_id}</div>
                      <div>支付链接码：{selectedPacket.payment_link_code}</div>
                      <div>付款人：{selectedPacket.payer_email || "未付款"}</div>
                      <div>官方流水ID：{selectedPacket.payment_transaction_id || "-"}</div>
                      <div>实付：{centsToStr(selectedPacket.total_pay_cents)} Lyt</div>
                      <div>
                        5%手续费：{centsToStr(selectedPacket.fee_amount_cents)} Lyt (
                        {selectedPacket.fee_transfer_status})
                      </div>
                    </div>
                    {selectedPacket.fee_transfer_error && (
                      <Alert status="danger">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Description>
                            手续费转账错误：{selectedPacket.fee_transfer_error}
                          </Alert.Description>
                        </Alert.Content>
                      </Alert>
                    )}
                    <div>
                      <div className="text-sm font-semibold mb-2">
                        该红包下的全部领取记录 ({selectedPacketClaims.length})
                      </div>
                      {selectedPacketClaims.length === 0 ? (
                        <div className="text-xs text-muted py-4 text-center">暂无领取记录</div>
                      ) : (
                        <div className="divide-y divide-black/5 border border-black/5 rounded-xl">
                          {selectedPacketClaims.map((c) => (
                            <div
                              key={c.id}
                              className="p-2.5 flex items-center justify-between text-xs"
                            >
                              <div>
                                <div className="font-medium">{c.claimer_email}</div>
                                <div className="text-muted">
                                  {c.claim_method} ·{" "}
                                  {new Date(c.claimed_at).toLocaleString("zh-CN")}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-rose-600">
                                  {centsToStr(c.amount_cents)} Lyt
                                </div>
                                <div className="text-[11px] text-muted">{c.transfer_status}</div>
                              </div>
                            </div>
                          ))}
                        </div>
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
