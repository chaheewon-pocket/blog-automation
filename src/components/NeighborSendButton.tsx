"use client";

import { useState } from "react";
import { markNeighborSent } from "@/lib/actions";

export default function NeighborSendButton({
  candidateId,
  targetUrl,
  message,
  disabled,
  disabledReason,
}: {
  candidateId: number;
  targetUrl: string;
  message: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      // 1) user-gesture 안에서 즉시 클립보드 복사 + 새 탭 열기
      try {
        await navigator.clipboard.writeText(message);
      } catch {
        // 클립보드 권한 거부 등 — 그래도 새 탭은 열어줌
      }
      window.open(targetUrl, "_blank", "noopener,noreferrer");

      // 2) 백그라운드로 안전장치 체크 + DB 업데이트
      const r = await markNeighborSent(candidateId);
      if (!r.ok) {
        alert(
          `⚠️ ${r.message}\n\n메시지는 이미 클립보드에 복사돼 있어. 신청을 보류할 거면 새 탭을 그냥 닫아줘.`,
        );
      } else {
        alert(
          '✅ 메시지 클립보드 복사됨!\n\n새 탭의 대상 블로그에서:\n1) "이웃추가" 버튼 클릭\n2) "서로이웃" 선택\n3) 메시지 입력란에 Ctrl+V로 붙여넣기\n4) 신청',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  if (disabled) {
    return (
      <button
        disabled
        title={disabledReason}
        className="rounded-md bg-zinc-200 px-3 py-2 text-xs font-medium text-zinc-500 cursor-not-allowed"
      >
        🚫 한도 도달
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
    >
      {busy ? "처리 중..." : "✅ 지금 신청"}
    </button>
  );
}
