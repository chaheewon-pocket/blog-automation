import { getDb } from "@/lib/db";
import { fmtTimestamp } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

type Blog = { id: number; alias: string; naver_id: string };
type Row = {
  id: number;
  log_no: string;
  title: string;
  url: string;
  published_at: string;
  views: number | null;
  visitors: number | null;
  collected_at: string | null;
};

type SearchParams = Promise<{ blog?: string }>;

export default async function PostsPage({
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
        <h1 className="text-3xl font-bold tracking-tight">포스트 분석</h1>
        <p className="mt-4 text-sm text-zinc-500">활성화된 블로그가 없어.</p>
      </div>
    );
  }

  const selectedBlogId = Number(params.blog ?? blogs[0].id);
  const blog = blogs.find((b) => b.id === selectedBlogId) ?? blogs[0];

  // 각 포스트의 최신 stats를 join
  const posts = db
    .prepare(
      `SELECT p.id, p.log_no, p.title, p.url, p.published_at,
              s.views, s.visitors, s.collected_at
         FROM posts p
         LEFT JOIN (
           SELECT post_id, views, visitors, collected_at
           FROM post_stats ps1
           WHERE ps1.collected_at = (
             SELECT MAX(collected_at) FROM post_stats ps2 WHERE ps2.post_id = ps1.post_id
           )
         ) s ON s.post_id = p.id
         WHERE p.blog_id = ?
         ORDER BY p.published_at DESC
         LIMIT 100`,
    )
    .all(blog.id) as Row[];

  const totalCount = (db
    .prepare("SELECT COUNT(*) as c FROM posts WHERE blog_id = ?")
    .get(blog.id) as { c: number }).c;

  const lastCollected = (db
    .prepare(
      `SELECT MAX(collected_at) as t FROM post_stats ps
       JOIN posts p ON p.id = ps.post_id
       WHERE p.blog_id = ?`,
    )
    .get(blog.id) as { t: string | null }).t;

  return (
    <div className="px-10 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">포스트 분석</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {blog.alias} · 총 {totalCount}건
            {lastCollected && (
              <span className="ml-2 text-xs">
                (조회수 마지막 수집: {fmtTimestamp(lastCollected)})
              </span>
            )}
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

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-zinc-600 dark:text-zinc-400">
            아직 수집된 포스트가 없어. 터미널에서 아래 명령으로 RSS 수집부터 시작해줘:
          </p>
          <code className="mt-3 inline-block rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100">
            cmd /c "npm run scrape -- {blog.naver_id} --posts"
          </code>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
            💡 RSS로 포스트 메타(제목·URL·작성일)는 수집됐어. 조회수는 모바일 페이지를 직접 방문해서 가져와야 해. 터미널에서:
            <code className="ml-2 rounded bg-blue-900/20 px-2 py-0.5 font-mono text-xs">
              cmd /c "npm run scrape -- {blog.naver_id} --views"
            </code>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
                <tr>
                  <th className="px-6 py-3">제목</th>
                  <th className="px-6 py-3 w-32">발행일</th>
                  <th className="px-6 py-3 text-right w-24">조회수</th>
                  <th className="px-6 py-3 text-right w-24">방문자</th>
                  <th className="px-6 py-3 text-right w-20">바로가기</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-950"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium">{p.title}</div>
                      <div className="mt-1 font-mono text-xs text-zinc-400">
                        {p.log_no}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-zinc-500">
                      {p.published_at.slice(0, 10)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      {p.views !== null ? (
                        p.views.toLocaleString()
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      {p.visitors !== null ? (
                        p.visitors.toLocaleString()
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        열기 →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
