"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

export function QrCodeBox({ value, size = 180 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    if (!value) return;
    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: {
        dark: "#18181b",
        light: "#ffffff",
      },
    })
      .then(setDataUrl)
      .catch(() => {});
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-xl bg-black/5 animate-pulse flex items-center justify-center text-xs text-muted"
      >
        生成二维码...
      </div>
    );
  }

  return (
    <Image
      src={dataUrl}
      alt="QR Code"
      width={size}
      height={size}
      unoptimized
      className="rounded-xl border border-black/10 bg-white p-1.5 shadow-xs"
    />
  );
}
