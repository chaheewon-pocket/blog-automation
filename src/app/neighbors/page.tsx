import { getDb } from "@/lib/db";
import {
  rejectNeighbor,
  seedDemoNeighbors,
  updateNeighborSettings,
} from "@/lib/actions";
import NeighborSendButton from "@/components/NeighborSendButton";

export const dynamic = "force-dynamic";

type Blog = { id: number; alias: string; naver_id: string; is_default: number };
type NeighborSettings = {
  blog_id: number;
  auto_enabled: number;
  daily_limit: number;
  interval_seconds: number;
  default_message: string;
};
type Candidate = {
  id: number;
  from_blog_id: number;
  target_url: string;
  target_alias: string;
  target_keyword: string;
  request_message: string;
  status: "pending" | "sent" | "failed" | "skipped";
  created_at: string;
};

type SearchParams = Promise<{ blog?: string; tab?: string }>;

export default async function NeighborsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const db = getDb();
  const blogs = db
    .prepare("SELECT id, alias, naver_id, is_default FROM blogs WHERE enabled = 1 ORDER BY is_default DESC, id")
    .all() as Blog[];

  if (blogs.length === 0) {
    return (
      <div className="px-10 py-8">
        <h1 className="text-3xl font-bold tracking-tight">서로이웃</h1>
        <p className="mt-4 text-sm text-zinc-500">
          활성화된 블로그가 없어. <a href="/settings" className="text-blue-600 underline">설정</a>에서 먼저 추가해줘.
        </p>
      </div>
    );
  }

  const selectedBlogId = Number(params.blog ?? blogs[0].id);
  const tab = (params.tab ?? "pending") as Candidate["status"];
  const blog = blogs.find((b) => b.id === selectedBlogId) ?? blogs[0];

  const settings = db
    .prepare("SELECT * FROM neighbor_settings WHERE blog_id = ?")
    .get(blog.id) as NeighborSettings;

  const candidates = db
    .prepare(
      "SELECT * FROM neighbor_candidates WHERE from_blog_id = ? AND status = ? ORDER BY id DESC LIMIT 50",
    )
    .all(blog.id, tab) as Candidate[];

  const counts = db
    .prepare(
      `SELECT status, COUNT(*) as c FROM neighbor_candidates
       WHERE from_blog_id = ? GROUP BY status`,
    )
    .all(blog.id) as { status: string; c: number }[];
  const countOf = (s: string) => counts.find((c) => c.status === s)?.c ?? 0;

  const todaySent = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM neighbor_log
         WHERE blog_id = ? AND success = 1 AND date(sent_at) = date('now', 'localtime')`,
      )
      .get(blog.id) as { c: number }
  ).c;

  const tabs = [
    { key: "pending", label: "대기", count: countOf("pending") },
    { key: "sent", label: "발송됨", count: countOf("sent") },
    { key: "failed", label: "실패", count: countOf("failed") },
    { key: "skipped", label: "건너뜀", count: countOf("skipped") },
  ];

  return (
    <div className="px-10 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🤝 서로이웃 관리</h1>
          <p className="mt-1 text-sm text-zinc-500">
            키워드로 발견한 블로그에 서로이웃 신청을 반자동으로 보내. 클릭 시 클립보드 복사 + 새 탭으로 열림.
          </p>
        </div>

        {/* 블로그 선택 */}
        <form className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">블로그:</label>
          <select
            name="blog"
            defaultValue={blog.id}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {blogs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.alias} ({b.naver_id})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-3 py-2 text-xs hover:bg-zinc-200 dark:bg-zinc-800"
          >
            전환
          </button>
        </form>
      </header>

      {/* ⚠️ 위험 안내 */}
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <strong>⚠️ 자동 서로이웃 신청은 네이버 약관 위반 소지가 있어.</strong> 일일 한도와 인터벌을 보수적으로 설정하고, 자동화는 신중히 켜줘.
      </div>

      {/* 자동화 설정 + 카운터 */}
      <section className="mb-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <form
          action={updateNeighborSettings}
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <input type="hidden" name="blog_id" value={blog.id} />
          <h2 className="mb-4 text-lg font-semibold">⚙️ 자동화 설정</h2>

          <div className="mb-4 flex items-center justify-between">
            <label htmlFor="auto_enabled" className="text-sm font-medium">
              자동 신청 활성화
            </label>
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                id="auto_enabled"
                name="auto_enabled"
                defaultChecked={settings.auto_enabled === 1}
                className="peer sr-only"
              />
              <div className="h-6 w-11 rounded-full bg-zinc-300 transition-colors peer-checked:bg-blue-600 dark:bg-zinc-700"></div>
              <div className="absolute ml-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5"></div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500">일일 한도 (건)</label>
              <input
                type="number"
                name="daily_limit"
                min={0}
                max={200}
                defaultValue={settings.daily_limit}
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">간격 (초, 최소 30)</label>
              <input
                type="number"
                name="interval_seconds"
                min={30}
                defaultValue={settings.interval_seconds}
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs text-zinc-500">기본 신청 메시지 (AI가 미생성 시 사용)</label>
            <textarea
              name="default_message"
              rows={2}
              defaultValue={settings.default_message}
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <button
            type="submit"
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            저장
          </button>
        </form>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold">📊 오늘 발송</h2>
          <div className="text-center">
            <div className="text-5xl font-bold text-blue-600">
              {todaySent}
              <span className="text-2xl text-zinc-400"> / {settings.daily_limit}</span>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              {settings.auto_enabled ? "🟢 자동화 ON" : "🔴 자동화 OFF"}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              간격 {settings.interval_seconds}초
            </div>
          </div>
        </div>
      </section>

      {/* 후보 탭 */}
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <a
                key={t.key}
                href={`/neighbors?blog=${blog.id}&tab=${t.key}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                {t.label} <span className="ml-1 text-xs text-zinc-400">{t.count}</span>
              </a>
            ))}
          </nav>

          {countOf("pending") + countOf("sent") + countOf("failed") + countOf("skipped") === 0 && (
            <form action={seedDemoNeighbors}>
              <input type="hidden" name="blog_id" value={blog.id} />
              <button
                type="submit"
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700"
              >
                🌱 데모 후보 5건 생성
              </button>
            </form>
          )}
        </div>

        {candidates.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            {tab} 상태의 후보가 없어.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {candidates.map((c) => (
              <li key={c.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <a
                      href={c.target_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:text-blue-700"
                    >
                      {c.target_alias}
                    </a>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {c.target_keyword}
                      </span>
                      <span className="font-mono text-zinc-400">{c.target_url}</span>
                    </div>
                    {c.request_message && (
                      <p className="mt-2 rounded bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
                        💬 {c.request_message}
                      </p>
                    )}
                  </div>

                  {tab === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <NeighborSendButton
                        candidateId={c.id}
                        targetUrl={c.target_url}
                        message={c.request_message ?? settings.default_message}
                        disabled={todaySent >= settings.daily_limit}
                        disabledReason={`일일 한도 ${settings.daily_limit}건 도달`}
                      />
                      <form action={rejectNeighbor}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700"
                        >
                          ❌ 건너뛰기
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
