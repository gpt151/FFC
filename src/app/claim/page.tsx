"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Label } from "@heroui/react";

export default function ClaimIndexPage() {
  const router = useRouter();
  const [rawInput, setRawInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = rawInput.trim();
    if (!trimmed) {
      setError("请输入激活码或领取链接");
      return;
    }
    const match = trimmed.match(/\/claim\/([A-Za-z0-9-]+)/i);
    const code = (match?.[1] || trimmed).toUpperCase();
    router.push(`/claim/${encodeURIComponent(code)}`);
  };

  return (
    <div className="max-w-[420px] mx-auto space-y-6 pt-4 sm:pt-8">
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">领红包</h1>
        <p className="text-xs text-zinc-500 mt-1">
          输入激活码或粘贴领取链接
        </p>
      </div>

      <Card className="border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
        <Card.Content className="p-6">
          <form onSubmit={handleGo} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-code" className="text-xs font-medium text-zinc-500">
                激活码 / 链接
              </Label>
              <Input
                id="claim-code"
                type="text"
                fullWidth
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="LYT-XXXX-XXXX"
                className="font-mono"
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

            <Button type="submit" variant="primary" size="lg" fullWidth className="font-medium">
              打开红包
            </Button>
          </form>
        </Card.Content>
      </Card>
    </div>
  );
}
