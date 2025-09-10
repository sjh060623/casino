"use client";

import { useState } from "react";

export default function ResetStorageButton({
  label = "돈 초기화",
  confirm = true,
  extraKeys = [],
  onCleared,
}) {
  const [loading, setLoading] = useState(false);

  const defaultKeys = ["position", "leverage", "balance", "tradeHistory"];

  const handleClick = async () => {
    if (loading) return;

    if (confirm) {
      const ok = window.confirm("저장된 정보를 모두 초기화할까요?");
      if (!ok) return;
    }

    try {
      setLoading(true);
      const keys = [...new Set([...defaultKeys, ...extraKeys])];

      keys.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });

      localStorage.clear();

      if (typeof onCleared === "function") {
        onCleared();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`px-3 py-1.5 rounded-lg border border-slate-200 text-xs
        ${
          loading
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-slate-900 text-white hover:bg-black"
        }`}
      title="정보를 삭제합니다"
    >
      {loading ? "초기화 중..." : label}
    </button>
  );
}
