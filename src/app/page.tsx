import Link from "next/link";
import { CreateRedPacketForm } from "@/components/CreateRedPacketForm";

export default function HomePage() {
  return (
    <div className="max-w-[460px] mx-auto space-y-6 pt-2 sm:pt-6">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">发红包</h1>
          <p className="text-xs text-zinc-500 mt-1">
            付款后生成激活码与领取链接
          </p>
        </div>
        <Link
          href="/claim"
          className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          有激活码？去领取 →
        </Link>
      </div>

      <CreateRedPacketForm />
    </div>
  );
}
