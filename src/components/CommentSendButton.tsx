"use client";

import { useState } from "react";
import { markCommentPosted } from "@/lib/actions";

export default function CommentSendButton({
  candidateId,
  sourceUrl,
  draft,
}: {
  candidateId: number;
  sourceUrl: string;
  draft: string;
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      try {
        await navigator.clipboard.writeText(draft);
      } catch {}
      window.open(sourceUrl, "_blank", "noopener,noreferrer");

      const r = await markCommentPosted(candidateId);
      if (r.ok) {
        alert(
          "✅ 댓글 초안 클립보드 복사 완료!\n\n새 탭에서:\n1) 댓글 작성란 클릭\n2) Ctrl+V로 붙여넣기\n3) 등록",
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
      {busy ? "처리 중..." : "✅ 게시"}
    </button>
  );
}
