"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Chip, Spinner, Tabs } from "@heroui/react";
import { ArrowUpRight, Gift, LogIn, Send } from "lucide-react";

interface SentItem {
  publicId: string;
  redPacketCode: string | null;
  packetType: "lucky" | "fixed";
  totalCount: number;
  remainingCount: number;
  packetAmount: string;
  feeAmount: string;
  totalPayAmount: string;
  greeting: string;
  status: string;
  createdAt: string;
}

interface ReceivedItem {
  id: number;
  redPacketCode: string;
  amount: string;
  greeting: string;
  senderName: string;
  claimedAt: string;
}

export default function MyRecordsPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ userId: number; email: string } | null>(null);
  const [sent, setSent] = useState<SentItem[]>([]);
  const [received, setReceived] = useState<ReceivedItem[]>([]);
  const [tab, setTab] = useState<"sent" | "received">("sent");

  useEffect(() => {
    fetch("/api/my", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          setUser(null);
          return;
        }
        const json = await r.json();
        if (json?.data) {
          setUser(json.data.user);
          setSent(json.data.sent || []);
          setReceived(json.data.received || []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-[45vh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card className="border border-black/5 shadow-lg bg-white text-center">
          <Card.Content className="p-8 space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <LogIn className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold">授权查看我的红包记录</h1>
            <p className="text-sm text-muted">
              通过 Lyt IT Pay 官方 OAuth 授权登录后，即可同步查看您发出的全部红包与领取记录。
            </p>
            <Link href="/api/auth/login?returnTo=/my" className="block">
              <Button variant="primary" size="lg" fullWidth>
                <LogIn className="w-4 h-4" />
                Lyt IT Pay 授权登录
              </Button>
            </Link>
          </Card.Content>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">我的红包记录</h1>
          <p className="text-sm text-muted">当前绑定账号：{user.email}</p>
        </div>
        <Link href="/">
          <Button variant="primary">
            <Send className="w-4 h-4" />
            再去包一个
          </Button>
        </Link>
      </div>

      <Tabs
        selectedKey={tab}
        onSelectionChange={(k) => setTab(k === "received" ? "received" : "sent")}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="记录分类">
            <Tabs.Tab id="sent">
              我发出的红包 ({sent.length})
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="received">
              我领到的红包 ({received.length})
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="sent" className="pt-4">
          {sent.length === 0 ? (
            <Card className="bg-white border border-black/5">
              <Card.Content className="py-12 text-center text-sm text-muted">
                您还没有发出过红包
              </Card.Content>
            </Card>
          ) : (
            <div className="space-y-3">
              {sent.map((p) => (
                <Card key={p.publicId} className="bg-white border border-black/5">
                  <Card.Content className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{p.greeting}</span>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={
                            p.status === "active"
                              ? "success"
                              : p.status === "awaiting_payment"
                                ? "warning"
                                : "default"
                          }
                        >
                          <Chip.Label>{p.status}</Chip.Label>
                        </Chip>
                      </div>
                      <div className="text-xs text-muted flex flex-wrap gap-3">
                        <span>总额 {p.packetAmount} Lyt（实付 {p.totalPayAmount}）</span>
                        <span>剩余 {p.remainingCount}/{p.totalCount} 份</span>
                        {p.redPacketCode && (
                          <span className="font-mono text-rose-600 font-semibold">
                            码: {p.redPacketCode}
                          </span>
                        )}
                      </div>
                    </div>

                    <Link href={`/packet/${p.publicId}`}>
                      <Button size="sm" variant="secondary">
                        查看详情
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </Card.Content>
                </Card>
              ))}
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel id="received" className="pt-4">
          {received.length === 0 ? (
            <Card className="bg-white border border-black/5">
              <Card.Content className="py-12 text-center text-sm text-muted">
                您还没有领到过红包
              </Card.Content>
            </Card>
          ) : (
            <div className="space-y-3">
              {received.map((c) => (
                <Card key={c.id} className="bg-white border border-black/5">
                  <Card.Content className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                        <Gift className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">
                          {c.senderName} · “{c.greeting}”
                        </div>
                        <div className="text-xs text-muted">
                          红包码 {c.redPacketCode} ·{" "}
                          {new Date(c.claimedAt).toLocaleString("zh-CN")}
                        </div>
                      </div>
                    </div>
                    <div className="text-lg font-extrabold text-rose-600">
                      +{c.amount} Lyt
                    </div>
                  </Card.Content>
                </Card>
              ))}
            </div>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
