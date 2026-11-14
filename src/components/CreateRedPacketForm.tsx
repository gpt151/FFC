"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Separator,
  Spinner,
  Tabs,
} from "@heroui/react";
import { ChevronDown } from "lucide-react";

interface PublicConfig {
  feeRate: number;
  feeMode: "sender_pays" | "deduct_from_packet";
  merchantConfigured: boolean;
  user: { userId: number; email: string } | null;
}

const PRESET_AMOUNTS = ["5", "10", "20", "50", "100"];

export function CreateRedPacketForm() {
  const router = useRouter();
  const [config, setConfig] = useState<PublicConfig>({
    feeRate: 0.05,
    feeMode: "sender_pays",
    merchantConfigured: true,
    user: null,
  });

  const [packetType, setPacketType] = useState<"lucky" | "fixed">("lucky");
  const [amount, setAmount] = useState("10.00");
  const [totalCount, setTotalCount] = useState("5");
  const [greeting, setGreeting] = useState("恭喜发财，大吉大利");
  const [senderName, setSenderName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((res) => {
        if (res?.data) {
          setConfig(res.data);
          if (res.data.user?.email) {
            setSenderName((prev) => prev || res.data.user.email.split("@")[0]);
          }
        }
      })
      .catch(() => {});
  }, []);

  const feePreview = useMemo(() => {
    const parsed = parseFloat(amount);
    const cents = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
    const count = Math.max(1, Math.floor(Number(totalCount) || 1));
    if (cents <= 0) {
      return {
        packetAmount: "0.00",
        feeAmount: "0.00",
        totalPay: "0.00",
        valid: false,
      };
    }

    const feeCents = Math.max(1, Math.round(cents * config.feeRate));
    const packetCents =
      config.feeMode === "deduct_from_packet" ? cents - feeCents : cents;
    const totalPayCents =
      config.feeMode === "deduct_from_packet" ? cents : cents + feeCents;

    return {
      packetAmount: (packetCents / 100).toFixed(2),
      feeAmount: (feeCents / 100).toFixed(2),
      totalPay: (totalPayCents / 100).toFixed(2),
      valid: packetCents >= count,
    };
  }, [amount, totalCount, config.feeRate, config.feeMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/red-packets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packetType,
          amount,
          totalCount: Number(totalCount),
          greeting,
          senderName,
          passphrase,
          expiresInHours: Number(expiresInHours),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json.message || "生成收款链接失败");
      }
      router.push(`/packet/${json.data.publicId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
      <Card.Content className="p-6 sm:p-7">
        {!config.merchantConfigured && (
          <Alert status="warning" className="mb-5">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                尚未配置收款托管账户，请先在环境变量或后台完成配置。
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Tabs
            selectedKey={packetType}
            onSelectionChange={(k) => setPacketType(k === "fixed" ? "fixed" : "lucky")}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="红包类型" className="w-full grid grid-cols-2">
                <Tabs.Tab id="lucky">
                  拼手气
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="fixed">
                  等额
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="rp-amount" className="text-xs font-medium text-zinc-500">
                {config.feeMode === "deduct_from_packet" ? "支付金额" : "红包金额"}
              </Label>
              <div className="flex items-center gap-1">
                {PRESET_AMOUNTS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(val)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium tabular-nums transition-colors cursor-pointer ${
                      Number(amount) === Number(val)
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <Input
              id="rp-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              fullWidth
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg font-semibold tabular-nums"
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-count" className="text-xs font-medium text-zinc-500">
                红包个数
              </Label>
              <Input
                id="rp-count"
                type="number"
                min="1"
                max="100"
                required
                fullWidth
                value={totalCount}
                onChange={(e) => setTotalCount(e.target.value)}
                className="tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rp-greeting" className="text-xs font-medium text-zinc-500">
                留言
              </Label>
              <Input
                id="rp-greeting"
                type="text"
                maxLength={120}
                fullWidth
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="恭喜发财，大吉大利"
              />
            </div>
          </div>

          {/* Collapsible options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
            >
              <span>更多选项（署名、口令、有效期）</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
              />
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-black/[0.06]">
                <div className="space-y-1">
                  <Label htmlFor="rp-sender" className="text-[11px] text-zinc-500">
                    署名
                  </Label>
                  <Input
                    id="rp-sender"
                    type="text"
                    maxLength={60}
                    fullWidth
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder={config.user?.email?.split("@")[0] || "匿名"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rp-pass" className="text-[11px] text-zinc-500">
                    领取口令
                  </Label>
                  <Input
                    id="rp-pass"
                    type="text"
                    maxLength={40}
                    fullWidth
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="可选"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rp-expiry" className="text-[11px] text-zinc-500">
                    有效期
                  </Label>
                  <select
                    id="rp-expiry"
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(e.target.value)}
                    className="w-full h-10 rounded-xl bg-black/[0.04] px-3 text-xs outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="24">24 小时</option>
                    <option value="72">72 小时</option>
                    <option value="168">7 天</option>
                    <option value="0">长期</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span>可领总额</span>
              <span className="tabular-nums text-zinc-900">{feePreview.packetAmount} Lyt</span>
            </div>
            <div className="flex items-center justify-between text-zinc-500">
              <span>手续费 ({(config.feeRate * 100).toFixed(0)}%)</span>
              <span className="tabular-nums text-zinc-900">{feePreview.feeAmount} Lyt</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 text-sm font-semibold text-zinc-900">
              <span>应付总额</span>
              <span className="tabular-nums text-base">{feePreview.totalPay} Lyt</span>
            </div>
          </div>

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
            isDisabled={submitting || !feePreview.valid}
            className="font-medium"
          >
            {submitting ? (
              <>
                <Spinner size="sm" color="current" />
                生成收款链接...
              </>
            ) : (
              `生成收款链接 · ${feePreview.totalPay} Lyt`
            )}
          </Button>
        </form>
      </Card.Content>
    </Card>
  );
}
