"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { updateDraft, deleteDraft } from "@/lib/actions";
import { fmtTimestamp } from "@/lib/utils/date";
import PublishButton from "./PublishButton";

type Draft = {
  id: number;
  topic: string;
  tone: string;
  length: string;
  keywords: string | null;
  title: string | null;
  body: string | null;
  ai_provider: string | null;
  status: "draft" | "edited" | "published";
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const TONE_LABEL: Record<string, string> = {
  informative: "📚 정보형",
  guide: "📖 가이드",
  review: "💬 후기",
  casual: "☕ 캐주얼",
};
const LENGTH_LABEL: Record<string, string> = {
  short: "짧음",
  medium: "중간",
  long: "김",
};


export default function DraftCard({
  draft,
  blogNaverId,
}: {
  draft: Draft;
  blogNaverId: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(draft.title ?? "");
  const [body, setBody] = useState(draft.body ?? "");

  const keywords: string[] = draft.keywords ? JSON.parse(draft.keywords) : [];
  const isPublished = draft.status === "published";

  return (
    <li className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">
              {draft.title ?? "(제목 없음)"}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                draft.status === "published"
                  ? "bg-emerald-100 text-emerald-800"
                  : draft.status === "edited"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {draft.status}
            </span>
            {draft.ai_provider && (
              <span className="text-xs text-zinc-400">
                {draft.ai_provider === "claude"
                  ? "🟣 Claude"
                  : draft.ai_provider === "openai"
                    ? "🟢 OpenAI"
                    : "⚪ Fallback"}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            주제: {draft.topic.slice(0, 80)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
              {TONE_LABEL[draft.tone] ?? draft.tone}
            </span>
            <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
              {LENGTH_LABEL[draft.length] ?? draft.length}
            </span>
            {keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
              >
                {kw}
              </span>
            ))}
            <span className="text-zinc-400">{fmtTimestamp(draft.created_at)}</span>
          </div>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {open ? "▲ 접기" : "▼ 펼치기"}
        </button>
      </div>

      {/* 본문 */}
      {open && (
        <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {editing ? (
            <div className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-base font-semibold dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="제목"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={20}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="본문 (마크다운)"
              />
              <div className="flex gap-2">
                <form
                  action={async (formData: FormData) => {
                    formData.set("id", String(draft.id));
                    formData.set("title", title);
                    formData.set("body", body);
                    await updateDraft(formData);
                    setEditing(false);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    💾 저장
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => {
                    setTitle(draft.title ?? "");
                    setBody(draft.body ?? "");
                    setEditing(false);
                  }}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <article className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{draft.body ?? "_(본문 없음)_"}</ReactMarkdown>
            </article>
          )}

          {/* 액션 버튼 */}
          {!editing && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              {!isPublished && (
                <PublishButton
                  draftId={draft.id}
                  title={draft.title ?? ""}
                  body={draft.body ?? ""}
                  blogNaverId={blogNaverId}
                />
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs hover:bg-zinc-50 dark:border-zinc-700"
              >
                ✏️ 편집
              </button>
              <form action={deleteDraft}>
                <input type="hidden" name="id" value={draft.id} />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:border-zinc-700"
                >
                  🗑️ 삭제
                </button>
              </form>
              {isPublished && draft.published_at && (
                <span className="ml-auto self-center text-xs text-emerald-600">
                  ✅ 게시: {fmtTimestamp(draft.published_at)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
