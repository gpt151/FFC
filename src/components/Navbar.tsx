"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Chip } from "@heroui/react";
import { Gift, History, LogIn, LogOut, Send, ShieldCheck } from "lucide-react";

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
    { href: "/", label: "包红包", icon: Send },
    { href: "/claim", label: "领红包", icon: Gift },
    { href: "/my", label: "我的记录", icon: History },
    { href: "/admin", label: "数据后台", icon: ShieldCheck },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl red-envelope-gradient flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <Gift className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-base tracking-tight text-foreground">
                LytPay <span className="text-rose-600">红包</span>
              </div>
              <div className="text-[11px] text-muted hidden sm:block">Lyt IT Pay 社交红包</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-rose-50 text-rose-600"
                      : "text-foreground/70 hover:text-foreground hover:bg-black/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <div className="flex items-center gap-2">
              <Chip color="success" variant="soft" size="sm" className="hidden sm:inline-flex">
                <Chip.Label>{user.email}</Chip.Label>
              </Chip>
              <Button size="sm" variant="ghost" onPress={handleLogout}>
                <LogOut className="w-3.5 h-3.5" />
                退出
              </Button>
            </div>
          ) : (
            <Link href={`/api/auth/login?returnTo=${encodeURIComponent(pathname || "/")}`}>
              <Button size="sm" variant="secondary">
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lyt IT Pay </span>授权登录
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile bottom-style subnav inside header */}
      <nav className="md:hidden flex items-center justify-around border-t border-black/5 px-2 py-1.5 bg-white/90">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
                isActive ? "bg-rose-50 text-rose-600" : "text-foreground/70"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
