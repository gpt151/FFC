"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  Separator,
  Spinner,
  Tabs,
} from "@heroui/react";
import {
  ArrowRight,
  Coins,
  Gift,
  Lock,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

interface PublicConfig {
  feeRate: number;
  feeMode: "sender_pays" | "deduct_from_packet";
  merchantConfigured: boolean;
  user: { userId: number; email: string } | null;
}

const PRESET_AMOUNTS = ["5", "10", "20", "50", "100"];
const PRESET_GREETINGS = [
  "恭喜发财，大吉大利",
  "感谢支持，一点心意！",
  "祝你好运连连，手气最佳",
  "Lyt IT Pay 红包来袭！",
];

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
        perPacket: "0.00",
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
      perPacket: (packetCents / 100 / count).toFixed(2),
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
      setError(err instanceof Error ? err.message : "请求失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border border-black/5 shadow-lg bg-white/95 backdrop-blur-sm">
      <Card.Header className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Card.Title className="text-xl font-bold flex items-center gap-2">
              <Gift className="w-5 h-5 text-rose-600" />
              包一个 Lyt IT Pay 红包
            </Card.Title>
            <Card.Description>
              生成官方收款链接，付款确认后立即获得红包激活码与领取链接
            </Card.Description>
          </div>
          <Chip color="danger" variant="soft" size="sm">
            <Chip.Label>费率 {(config.feeRate * 100).toFixed(0)}%</Chip.Label>
          </Chip>
        </div>
      </Card.Header>

      <Card.Content>
        {!config.merchantConfigured && (
          <Alert status="warning" className="mb-4">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>尚未配置托管收款账户</Alert.Title>
              <Alert.Description>
                管理员需先在环境变量或后台配置 `LYT_MERCHANT_EMAIL` 与 `LYT_MERCHANT_PASSWORD` 才能生成收款链接。
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Packet Type Tabs */}
          <div>
            <Label className="text-sm font-medium mb-2 block">红包玩法</Label>
            <Tabs
              selectedKey={packetType}
              onSelectionChange={(k) => setPacketType(k === "fixed" ? "fixed" : "lucky")}
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label="红包类型" className="w-full grid grid-cols-2">
                  <Tabs.Tab id="lucky">
                    <Sparkles className="w-4 h-4 mr-1.5 inline" />
                    拼手气红包
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="fixed">
                    <Coins className="w-4 h-4 mr-1.5 inline" />
                    普通等额红包
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          </div>

          {/* Amount & Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rp-amount" className="text-sm font-medium flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-rose-600" />
                {config.feeMode === "deduct_from_packet" ? "支付总金额 (Lyt)" : "红包总金额 (Lyt)"}
              </Label>
              <Input
                id="rp-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                fullWidth
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例如 10.00"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_AMOUNTS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(val)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      Number(amount) === Number(val)
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-black/5 text-foreground/80 border-transparent hover:bg-black/10"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rp-count" className="text-sm font-medium flex items-center gap-1.5">
                <Users className="w-4 h-4 text-rose-600" />
                红包个数 (1 ~ 100)
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
                placeholder="例如 5"
              />
              <p className="text-xs text-muted pt-1">
                {packetType === "lucky"
                  ? "拼手气随机分配，每人至少 0.01"
                  : `均分每份约 ${feePreview.perPacket} Lyt`}
              </p>
            </div>
          </div>

          {/* Greeting */}
          <div className="space-y-1.5">
            <Label htmlFor="rp-greeting" className="text-sm font-medium">
              红包祝福语
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
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESET_GREETINGS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGreeting(g)}
                  className="px-2 py-0.5 rounded-md text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Sender Name, Passphrase, Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-sender" className="text-xs font-medium text-muted">
                发红包署名（可选）
              </Label>
              <Input
                id="rp-sender"
                type="text"
                maxLength={60}
                fullWidth
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder={config.user?.email?.split("@")[0] || "匿名金主"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rp-pass" className="text-xs font-medium text-muted flex items-center gap-1">
                <Lock className="w-3 h-3" />
                领取口令（可选）
              </Label>
              <Input
                id="rp-pass"
                type="text"
                maxLength={40}
                fullWidth
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="留空则无需口令"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rp-expiry" className="text-xs font-medium text-muted">
                有效期
              </Label>
              <select
                id="rp-expiry"
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
                className="w-full h-10 rounded-xl bg-black/[0.04] px-3 text-sm outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="24">24 小时内有效</option>
                <option value="72">72 小时内有效</option>
                <option value="168">7 天内有效</option>
                <option value="0">长期有效</option>
              </select>
            </div>
          </div>

          {/* Fee Breakdown Box */}
          <div className="rounded-2xl bg-gradient-to-br from-rose-50/90 to-amber-50/70 border border-rose-200/70 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between text-foreground/80">
              <span>红包可领总额</span>
              <span className="font-semibold">{feePreview.packetAmount} Lyt</span>
            </div>
            <div className="flex items-center justify-between text-foreground/70">
              <span>
                平台手续费 ({(config.feeRate * 100).toFixed(0)}% ·{" "}
                {config.feeMode === "deduct_from_packet" ? "内扣" : "外扣"})
              </span>
              <span className="font-medium text-amber-700">{feePreview.feeAmount} Lyt</span>
            </div>
            <Separator className="my-1" />
            <div className="flex items-center justify-between text-base font-bold text-rose-700">
              <span>收款链接应付总额</span>
              <span>{feePreview.totalPay} Lyt</span>
            </div>
          </div>

          {error && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>无法创建订单</Alert.Title>
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
            className="font-semibold shadow-md"
          >
            {submitting ? (
              <>
                <Spinner size="sm" color="current" />
                正在生成 Lyt IT Pay 收款链接...
              </>
            ) : (
              <>
                塞钱进红包 · 生成收款链接 ({feePreview.totalPay} Lyt)
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>
      </Card.Content>
    </Card>
  );
}
