"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Chip } from "@heroui/react";
import { LogOut } from "lucide-react";

interface UserInfo {
  userId: number;
  email: string;
}

export function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((res) => {
        if (active && res?.data?.user) {
          setUser(res.data.user);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/me", { method: "POST" });
    setUser(null);
    window.location.reload();
  };

  const navLinks = [
    { href: "/", label: "发红包" },
    { href: "/claim", label: "领红包" },
    { href: "/my", label: "记录" },
    { href: "/admin", label: "后台" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c81e32]" />
            <span className="font-semibold text-[15px] tracking-tight text-zinc-900">
              LytPay
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navLinks.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 py-1 rounded-lg text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <div className="flex items-center gap-1.5">
              <Chip variant="soft" size="sm" className="hidden sm:inline-flex">
                <Chip.Label className="text-xs text-zinc-600">{user.email}</Chip.Label>
              </Chip>
              <Button size="sm" variant="ghost" onPress={handleLogout} aria-label="退出登录">
                <LogOut className="w-3.5 h-3.5 text-zinc-500" />
              </Button>
            </div>
          ) : (
            <Link href={`/api/auth/login?returnTo=${encodeURIComponent(pathname || "/")}`}>
              <Button size="sm" variant="secondary">
                授权登录
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
