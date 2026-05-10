"use client";

import { useState, useTransition, useRef, type FormEvent, type DragEvent } from "react";
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
  { v: "short", label: "짧음", desc: "~500자 + 이미지 3~4자리" },
  { v: "medium", label: "중간", desc: "~1200자 + 이미지 5~6자리" },
  { v: "long", label: "김 (기본)", desc: "2500자 이상 + 이미지 7~9자리" },
] as const;

const ALLOWED_EXT = [".pdf", ".docx", ".txt", ".md"] as const;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type DraftResult = {
  id: number;
  title: string;
  body: string;
  provider: string;
  warning?: string;
  matchedLegals?: { id: number; title: string; category: string | null }[];
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string>("");

  const toggleKeyword = (kw: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw],
    );
  };

  const acceptFile = (f: File) => {
    const lower = f.name.toLowerCase();
    if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
      setFileError(`지원하지 않는 형식 — PDF/DOCX/TXT/MD만 가능 (${f.name})`);
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setFileError(
        `파일이 너무 커 — 최대 20MB (${(f.size / 1024 / 1024).toFixed(1)}MB)`,
      );
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFileError("");
    setAttachedFile(f);
    // native input에 파일을 프로그래매틱하게 세팅 → form submit 시 자동 전송
    const dt = new DataTransfer();
    dt.items.add(f);
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) acceptFile(dropped);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) acceptFile(selected);
  };

  const removeFile = () => {
    setAttachedFile(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
          warning: r.warning,
          matchedLegals: r.matchedLegals,
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
                  defaultChecked={i === 2}
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

        <div className="mb-4">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            📎 참고 자료 (선택, 강력 추천)
          </label>
          <p className="mt-1 text-xs text-zinc-500">
            논문·법령·HR 자료를 첨부하면 AI가 그 자료만 ground truth로 활용해 정확한 글을 써줘.
          </p>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                : attachedFile
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                  : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {attachedFile ? (
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-2xl">📄</span>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {attachedFile.name}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {(attachedFile.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile();
                  }}
                  className="shrink-0 rounded-md bg-rose-100 px-2 py-1 text-xs text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300"
                >
                  ✕ 제거
                </button>
              </div>
            ) : (
              <>
                <div className="text-3xl">{isDragging ? "📥" : "📎"}</div>
                <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {isDragging ? "여기에 놓아줘!" : "파일을 드래그하거나 클릭해서 선택"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  PDF · DOCX · TXT · MD (최대 20MB)
                </p>
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              name="reference_file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {fileError && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              ⚠️ {fileError}
            </p>
          )}
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

            {result.warning && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                ⚠️ {result.warning}
              </div>
            )}

            {result.matchedLegals && result.matchedLegals.length > 0 && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                <strong>📖 참조한 법령 ({result.matchedLegals.length}건)</strong>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {result.matchedLegals.map((m) => (
                    <li key={m.id}>
                      {m.title}
                      {m.category && (
                        <span className="text-blue-600/70"> · {m.category}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
