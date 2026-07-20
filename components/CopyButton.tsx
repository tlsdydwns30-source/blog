"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "복사",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 권한이 없을 때를 대비한 폴백
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <button
      onClick={copy}
      disabled={!text}
      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-brand-500 hover:text-brand-600 disabled:opacity-40"
    >
      {copied ? "복사됨 ✓" : label}
    </button>
  );
}
