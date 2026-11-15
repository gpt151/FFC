"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Chip, Spinner, Tabs } from "@heroui/react";

interface SentItem {
  publicId: string;
  redPacketCode: string | null;
  totalCount: number;
  remainingCount: number;
  packetAmount: string;
  totalPayAmount: string;
  greeting: string;
  status: string;
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
      <div className="max-w-[400px] mx-auto py-12">
        <Card className="border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white">
          <Card.Content className="p-7 text-center space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-zinc-900">我的记录</h1>
              <p className="text-xs text-zinc-500">授权登录后查看发出与领到的红包</p>
            </div>
            <a href="/api/auth/login?returnTo=/my" className="block">
              <Button variant="primary" fullWidth>
                Lyt IT Pay 授权登录
              </Button>
            </a>
          </Card.Content>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">记录</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{user.email}</p>
        </div>
        <Link href="/">
          <Button size="sm" variant="primary">
            发红包
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
              发出 ({sent.length})
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="received">
              领到 ({received.length})
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="sent" className="pt-4">
          {sent.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">暂无记录</div>
          ) : (
            <div className="divide-y divide-black/[0.05] rounded-2xl border border-black/[0.06] bg-white">
              {sent.map((p) => (
                <div key={p.publicId} className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">{p.greeting}</span>
                      <Chip size="sm" variant="soft">
                        <Chip.Label className="text-[11px]">{p.status}</Chip.Label>
                      </Chip>
                    </div>
                    <div className="text-xs text-zinc-400 tabular-nums flex flex-wrap gap-3">
                      <span>{p.packetAmount} ELC</span>
                      <span>
                        {p.totalCount - p.remainingCount}/{p.totalCount}
                      </span>
                      {p.redPacketCode && <span className="font-mono">{p.redPacketCode}</span>}
                    </div>
                  </div>
                  <Link href={`/packet/${p.publicId}`}>
                    <Button size="sm" variant="secondary">
                      详情
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel id="received" className="pt-4">
          {received.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">暂无记录</div>
          ) : (
            <div className="divide-y divide-black/[0.05] rounded-2xl border border-black/[0.06] bg-white">
              {received.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-zinc-900">
                      {c.senderName} · {c.greeting}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      <span className="font-mono">{c.redPacketCode}</span> ·{" "}
                      {new Date(c.claimedAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-zinc-900">
                    +{c.amount} ELC
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
