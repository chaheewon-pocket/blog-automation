import { getDb } from "@/lib/db";
import DraftCard from "@/components/DraftCard";

export const dynamic = "force-dynamic";

type Blog = { id: number; alias: string; naver_id: string };
type DraftRow = {
  id: number;
  blog_id: number;
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

type SearchParams = Promise<{ blog?: string; tab?: string }>;

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const db = getDb();
  const blogs = db
    .prepare(
      "SELECT id, alias, naver_id FROM blogs WHERE enabled = 1 ORDER BY is_default DESC, id",
    )
    .all() as Blog[];

  if (blogs.length === 0) {
    return (
      <div className="px-10 py-8">
        <h1 className="text-3xl font-bold">초안</h1>
        <p className="mt-4 text-zinc-500">활성 블로그 없음.</p>
      </div>
    );
  }

  const selectedBlogId = Number(params.blog ?? blogs[0].id);
  const tab = (params.tab ?? "all") as "all" | DraftRow["status"];
  const blog = blogs.find((b) => b.id === selectedBlogId) ?? blogs[0];

  const drafts = (
    tab === "all"
      ? db
          .prepare(
            "SELECT * FROM drafts WHERE blog_id = ? ORDER BY created_at DESC LIMIT 100",
          )
          .all(blog.id)
      : db
          .prepare(
            "SELECT * FROM drafts WHERE blog_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100",
          )
          .all(blog.id, tab)
  ) as DraftRow[];

  const counts = db
    .prepare(
      "SELECT status, COUNT(*) AS c FROM drafts WHERE blog_id = ? GROUP BY status",
    )
    .all(blog.id) as { status: string; c: number }[];
  const total = counts.reduce((s, c) => s + c.c, 0);
  const countOf = (s: string) =>
    counts.find((c) => c.status === s)?.c ?? 0;

  const tabs = [
    { key: "all", label: "전체", count: total },
    { key: "draft", label: "초안", count: countOf("draft") },
    { key: "edited", label: "편집됨", count: countOf("edited") },
    { key: "published", label: "게시됨", count: countOf("published") },
  ];

  return (
    <div className="px-10 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">📝 초안 보관함</h1>
          <p className="mt-1 text-sm text-zinc-500">
            AI가 만든 글을 보관·편집·게시하는 곳. 새 글은{" "}
            <a href="/writing" className="underline">/writing</a> 에서 작성.
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

      {/* 탭 */}
      <nav className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/drafts?blog=${blog.id}&tab=${t.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700 dark:text-blue-300"
                : "border-transparent text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            {t.label} <span className="ml-1 text-xs text-zinc-400">{t.count}</span>
          </a>
        ))}
      </nav>

      {/* 리스트 */}
      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-zinc-600 dark:text-zinc-400">
            {tab === "all" ? "아직 작성한 글이 없어." : `${tab} 상태의 글이 없어.`}
          </p>
          <a
            href="/writing"
            className="mt-3 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ✍️ 새 글 작성
          </a>
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} blogNaverId={blog.naver_id} />
          ))}
        </ul>
      )}
    </div>
  );
}
