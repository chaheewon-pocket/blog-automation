"use client";

import { useState } from "react";
import { markDraftPublished } from "@/lib/actions";

export default function PublishButton({
  draftId,
  title,
  body,
  blogNaverId,
}: {
  draftId: number;
  title: string;
  body: string;
  blogNaverId: string;
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 클립보드에 "제목 + 빈 줄 + 본문" 통째로 복사
      const fullText = `${title}\n\n${body}`;
      try {
        await navigator.clipboard.writeText(fullText);
      } catch {}

      // 네이버 블로그 글쓰기 새 탭
      const writeUrl = `https://blog.naver.com/${blogNaverId}?Redirect=Write`;
      window.open(writeUrl, "_blank", "noopener,noreferrer");

      const r = await markDraftPublished(draftId);
      if (r.ok) {
        alert(
          "✅ 클립보드에 글 전체가 복사됐어!\n\n새 탭의 네이버 글쓰기 에디터(SmartEditor)에서:\n1) 제목 칸 클릭 → 첫 줄(제목)만 잘라내서 붙이기\n2) 본문 칸 클릭 → 나머지 붙여넣기\n3) 발행",
        );
      } else {
        alert(`⚠️ ${r.message}\n\n메시지는 이미 클립보드에 복사됐어.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
    >
      {busy ? "처리 중..." : "📝 게시 (클립보드 복사)"}
    </button>
  );
}
