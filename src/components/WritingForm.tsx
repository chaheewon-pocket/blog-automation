"use client";

import { useState, useTransition, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { generateAndSaveDraft } from "@/lib/actions";

type Blog = { id: number; alias: string; naver_id: string };

const TONES = [
  { v: "informative", label: "📚 정보형", desc: "객관적·교육적" },
  { v: "guide", label: "📖 가이드", desc: "단계별 안내" },
  { v: "review", label: "💬 후기", desc: "경험 공유" },
  { v: "casual", label: "☕ 캐주얼", desc: "가벼운 일상 톤" },
] as const;

const LENGTHS = [
  { v: "short", label: "짧음", desc: "~500자, 3~4단락" },
  { v: "medium", label: "중간", desc: "~1200자, 5~7단락" },
  { v: "long", label: "김", desc: "~2500자, 10~13단락" },
] as const;

type DraftResult = {
  id: number;
  title: string;
  body: string;
  provider: string;
};

export default function WritingForm({
  blogs,
  suggestedKeywords,
}: {
  blogs: Blog[];
  suggestedKeywords: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string>("");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [extraKeywords, setExtraKeywords] = useState<string>("");

  const toggleKeyword = (kw: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw],
    );
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const allKeywords = [
      ...selectedKeywords,
      ...extraKeywords.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
    ];
    formData.set("keywords", allKeywords.join(","));
    setResult(null);
    setError("");
    startTransition(async () => {
      const r = await generateAndSaveDraft(formData);
      if (r.ok && r.id && r.title && r.body) {
        setResult({
          id: r.id,
          title: r.title,
          body: r.body,
          provider: r.provider ?? "fallback",
        });
      } else {
        setError(r.error ?? "알 수 없는 오류");
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      {/* ─── 입력 폼 ─── */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="mb-4 text-lg font-semibold">✍️ 새 글 작성</h2>

        <div className="mb-4">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            대상 블로그
          </label>
          <select
            name="blog_id"
            defaultValue={blogs[0]?.id}
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            required
          >
            {blogs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.alias} ({b.naver_id})
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            주제 <span className="text-rose-500">*</span>
          </label>
          <textarea
            name="topic"
            placeholder="예: 의료기관 인증평가 대비, 우리 병원 직원 교육 어떻게 준비할까?"
            rows={3}
            required
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            톤
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TONES.map((t, i) => (
              <label
                key={t.v}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 p-2 hover:bg-zinc-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:has-[:checked]:bg-blue-950"
              >
                <input
                  type="radio"
                  name="tone"
                  value={t.v}
                  defaultChecked={i === 0}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-zinc-500">{t.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            길이
          </label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {LENGTHS.map((l, i) => (
              <label
                key={l.v}
                className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-zinc-200 p-2 hover:bg-zinc-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:has-[:checked]:bg-blue-950"
              >
                <input
                  type="radio"
                  name="length"
                  value={l.v}
                  defaultChecked={i === 1}
                />
                <div className="text-sm font-medium">{l.label}</div>
                <div className="text-center text-xs text-zinc-500">{l.desc}</div>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            핵심 키워드 (선택)
          </label>
          {suggestedKeywords.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs text-zinc-500">모니터링 키워드:</div>
              <div className="flex flex-wrap gap-1">
                {suggestedKeywords.map((kw) => (
                  <button
                    type="button"
                    key={kw}
                    onClick={() => toggleKeyword(kw)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedKeywords.includes(kw)
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input
            type="text"
            value={extraKeywords}
            onChange={(e) => setExtraKeywords(e.target.value)}
            placeholder="추가 키워드, 쉼표로 구분"
            className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
        >
          {pending ? "AI가 글 쓰는 중... (10~30초)" : "🤖 글 생성"}
        </button>
      </form>

      {/* ─── 결과 영역 ─── */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {!result && !pending && !error && (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center text-zinc-400">
            <div className="text-5xl">✨</div>
            <p className="mt-3 text-sm">왼쪽에서 주제를 입력하고<br/>&quot;글 생성&quot; 버튼을 눌러줘</p>
          </div>
        )}

        {pending && (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <div className="mb-3 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm text-zinc-600">AI가 글을 작성 중이야...</p>
            <p className="mt-1 text-xs text-zinc-400">길이에 따라 10~30초 소요</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 p-4 text-rose-900 dark:bg-rose-950 dark:text-rose-200">
            <strong>❌ 생성 실패</strong>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">📝 생성된 초안</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  result.provider === "fallback"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {result.provider === "claude"
                  ? "🟣 Claude"
                  : result.provider === "openai"
                    ? "🟢 OpenAI"
                    : "⚪ Fallback"}
              </span>
            </div>

            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              ✅ 자동 저장됨 (id={result.id}). 편집·게시는{" "}
              <Link href="/drafts" className="font-semibold underline">
                /drafts
              </Link>{" "}
              에서.
            </div>

            <article className="prose prose-sm max-w-none dark:prose-invert">
              <h1 className="text-xl font-bold">{result.title}</h1>
              <ReactMarkdown>{result.body}</ReactMarkdown>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}
