import { getDb } from "@/lib/db";
import { rejectComment } from "@/lib/actions";
import CommentSendButton from "@/components/CommentSendButton";
import { fmtTimestamp } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

type Blog = { id: number; alias: string; naver_id: string };
type Candidate = {
  id: number;
  source_url: string;
  source_title: string;
  source_keyword: string;
  draft_comment: string | null;
  status: "pending" | "posted" | "rejected";
  created_at: string;
  posted_at: string | null;
};

type SearchParams = Promise<{ blog?: string; tab?: string }>;

export default async function CommentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const db = getDb();
  const blogs = db
    .prepare("SELECT id, alias, naver_id FROM blogs WHERE enabled = 1 ORDER BY is_default DESC, id")
    .all() as Blog[];

  if (blogs.length === 0) {
    return (
      <div className="px-10 py-8">
        <h1 className="text-3xl font-bold">댓글 검토</h1>
        <p className="mt-4 text-zinc-500">활성 블로그 없음.</p>
      </div>
    );
  }

  const selectedBlogId = Number(params.blog ?? blogs[0].id);
  const tab = (params.tab ?? "pending") as Candidate["status"];
  const blog = blogs.find((b) => b.id === selectedBlogId) ?? blogs[0];

  const candidates = db
    .prepare(
      `SELECT id, source_url, source_title, source_keyword, draft_comment, status, created_at, posted_at
         FROM comment_candidates
         WHERE from_blog_id = ? AND status = ?
         ORDER BY id DESC LIMIT 50`,
    )
    .all(blog.id, tab) as Candidate[];

  const counts = db
    .prepare(
      `SELECT status, COUNT(*) AS c FROM comment_candidates
         WHERE from_blog_id = ? GROUP BY status`,
    )
    .all(blog.id) as { status: string; c: number }[];
  const countOf = (s: string) => counts.find((c) => c.status === s)?.c ?? 0;

  const claudeKey = (db
    .prepare("SELECT value FROM settings WHERE key = 'claude_api_key'")
    .get() as { value: string } | undefined)?.value ?? "";

  const tabs = [
    { key: "pending", label: "대기", count: countOf("pending") },
    { key: "posted", label: "게시됨", count: countOf("posted") },
    { key: "rejected", label: "버림", count: countOf("rejected") },
  ];

  return (
    <div className="px-10 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">💬 댓글 검토</h1>
          <p className="mt-1 text-sm text-zinc-500">
            모니터링 키워드로 발견한 글에 AI가 댓글 초안을 만들어둠. 검토하고 게시 버튼 누르면 클립보드 복사 + 새 탭으로 열림.
          </p>
        </div>

        <form className="flex items-center gap-2">
          <select
            name="blog"
            defaultValue={blog.id}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {blogs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.alias}
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

      {/* AI 모드 안내 */}
      <div
        className={`mb-4 rounded-lg border p-3 text-sm ${
          claudeKey
            ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        }`}
      >
        {claudeKey ? (
          <>
            <strong>🟢 Claude AI 활성</strong> — 새 후보의 초안은 AI가 생성. 기존 초안 갱신은 다음 스크래핑 시에 적용.
          </>
        ) : (
          <>
            <strong>⚪ Fallback 모드</strong> — Claude API key가 없어 템플릿 메시지가 사용됨. 더 자연스러운 초안을 원하면{" "}
            <a href="/settings" className="underline">설정</a>에서 키를 등록해줘.
          </>
        )}
      </div>

      {/* 탭 */}
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <a
                key={t.key}
                href={`/comments?blog=${blog.id}&tab=${t.key}`}
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

          <div className="text-xs text-zinc-500">
            <code className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
              cmd /c &quot;npm run find-comments -- {blog.naver_id}&quot;
            </code>
            {" "}로 더 수집 가능
          </div>
        </div>

        {candidates.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            {tab} 상태의 후보가 없어.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {candidates.map((c) => (
              <li key={c.id} className="px-6 py-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={c.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:text-blue-700"
                    >
                      {c.source_title.slice(0, 100)}
                    </a>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {c.source_keyword}
                      </span>
                      <span className="font-mono text-zinc-400">{c.source_url}</span>
                    </div>
                  </div>
                </div>

                {c.draft_comment && (
                  <blockquote className="mb-3 rounded-lg bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    💬 {c.draft_comment}
                  </blockquote>
                )}

                {tab === "pending" ? (
                  <div className="flex gap-2">
                    <CommentSendButton
                      candidateId={c.id}
                      sourceUrl={c.source_url}
                      draft={c.draft_comment ?? ""}
                    />
                    <form action={rejectComment}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:border-zinc-700"
                      >
                        ❌ 버림
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-400">
                    {tab === "posted" && c.posted_at && (
                      <>게시: {fmtTimestamp(c.posted_at)}</>
                    )}
                    {tab === "rejected" && <>건너뜀</>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
