"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Label } from "@heroui/react";
import { ArrowRight, Gift, KeyRound } from "lucide-react";

export default function ClaimIndexPage() {
  const router = useRouter();
  const [rawInput, setRawInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = rawInput.trim();
    if (!trimmed) {
      setError("请输入红包激活码或粘贴领取链接");
      return;
    }
    const match = trimmed.match(/\/claim\/([A-Za-z0-9-]+)/i);
    const code = (match?.[1] || trimmed).toUpperCase();
    router.push(`/claim/${encodeURIComponent(code)}`);
  };

  return (
    <div className="max-w-lg mx-auto py-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 mx-auto rounded-2xl red-envelope-gradient text-white flex items-center justify-center shadow-lg">
          <Gift className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">输入激活码领取红包</h1>
        <p className="text-sm text-muted">
          输入朋友分享的红包激活码（如 <span className="font-mono">LYT-XXXX-XXXX</span>）或直接粘贴领取链接
        </p>
      </div>

      <Card className="border border-black/5 shadow-lg bg-white">
        <Card.Content className="p-6">
          <form onSubmit={handleGo} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-code" className="text-sm font-medium flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-rose-600" />
                红包激活码 / 领取链接
              </Label>
              <Input
                id="claim-code"
                type="text"
                fullWidth
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="例如 LYT-8K9M-2P4X 或 https://.../claim/..."
              />
            </div>

            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth className="font-semibold">
              打开红包
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </Card.Content>
      </Card>
    </div>
  );
}
