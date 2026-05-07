import DashboardCharts from "@/components/DashboardCharts";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Blog = { id: number; alias: string; naver_id: string };
type ReferrerRow = { referrer_domain: string; count: number; percent: number };
type KeywordRow = { keyword: string; count: number; percent: number };
type TopPostRow = {
  log_no: string;
  title: string;
  views: number;
  url: string;
  collected_at: string;
};

export default function Dashboard() {
  const db = getDb();
  const blog = db
    .prepare(
      "SELECT id, alias, naver_id FROM blogs WHERE is_default = 1 LIMIT 1",
    )
    .get() as Blog | undefined;

  if (!blog) {
    return (
      <div className="px-10 py-8">
        <h1 className="text-3xl font-bold">대시보드</h1>
        <p className="mt-4 text-zinc-500">기본 블로그가 없어. /settings 가서 추가해줘.</p>
      </div>
    );
  }

  // 최신 수집 날짜의 유입경로
  const latestReferrerDate = (db
    .prepare(
      "SELECT MAX(date) AS d FROM daily_referrers WHERE blog_id = ?",
    )
    .get(blog.id) as { d: string | null }).d;

  const referrers = latestReferrerDate
    ? (db
        .prepare(
          `SELECT referrer_domain, count, percent FROM daily_referrers
           WHERE blog_id = ? AND date = ?
           ORDER BY count DESC LIMIT 8`,
        )
        .all(blog.id, latestReferrerDate) as ReferrerRow[])
    : [];

  const keywords = latestReferrerDate
    ? (db
        .prepare(
          `SELECT keyword, count, percent FROM daily_keywords
           WHERE blog_id = ? AND date = ?
           ORDER BY count DESC LIMIT 10`,
        )
        .all(blog.id, latestReferrerDate) as KeywordRow[])
    : [];

  // 최신 collected_at 기준 TOP 포스트
  const topPosts = db
    .prepare(
      `SELECT p.log_no, p.title, p.url, s.views, s.collected_at
         FROM posts p
         JOIN (
           SELECT post_id, views, collected_at
           FROM post_stats ps1
           WHERE ps1.collected_at = (
             SELECT MAX(collected_at) FROM post_stats ps2 WHERE ps2.post_id = ps1.post_id
           )
         ) s ON s.post_id = p.id
         WHERE p.blog_id = ?
         ORDER BY s.views DESC LIMIT 5`,
    )
    .all(blog.id) as TopPostRow[];

  const totalViewsToday = topPosts.reduce((sum, p) => sum + p.views, 0);
  const totalReferrerCount = referrers.reduce((s, r) => s + r.count, 0);
  const pendingComments = (db
    .prepare(
      "SELECT COUNT(*) c FROM comment_candidates WHERE status = 'pending'",
    )
    .get() as { c: number }).c;
  const pendingNeighbors = (db
    .prepare(
      "SELECT COUNT(*) c FROM neighbor_candidates WHERE status = 'pending'",
    )
    .get() as { c: number }).c;

  const summaryCards = [
    {
      label: "최신 일별 조회수",
      value: totalViewsToday.toLocaleString(),
      delta: latestReferrerDate ? `${latestReferrerDate} 기준` : "데이터 없음",
    },
    {
      label: "유입 합계",
      value: totalReferrerCount.toLocaleString(),
      delta: `${referrers.length}개 경로`,
    },
    {
      label: "검토 대기 댓글",
      value: pendingComments.toLocaleString(),
      delta: "M4에서 활성화",
    },
    {
      label: "서로이웃 후보",
      value: pendingNeighbors.toLocaleString(),
      delta: "/neighbors",
    },
  ];

  // 도넛 차트용 데이터
  const PALETTE = [
    "#16a34a", "#2563eb", "#a855f7", "#f97316",
    "#ef4444", "#0ea5e9", "#84cc16", "#ec4899",
  ];
  const referrerChartData = referrers.map((r, i) => ({
    name: r.referrer_domain,
    value: r.count,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="px-10 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          대시보드
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {blog.alias} · {blog.naver_id}
          {latestReferrerDate && (
            <span className="ml-2 text-xs">(최신 통계: {latestReferrerDate})</span>
          )}
        </p>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="text-sm text-zinc-500">{card.label}</div>
            <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {card.value}
            </div>
            <div className="mt-2 text-xs font-medium text-zinc-400">
              {card.delta}
            </div>
          </div>
        ))}
      </section>

      <DashboardCharts referrerData={referrerChartData} />

      {/* 검색 키워드 TOP */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">🔍 검색 키워드 TOP</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {latestReferrerDate ? `${latestReferrerDate} 기준` : "데이터 없음"}
            </p>
          </div>
          {keywords.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-zinc-400">
              <code className="text-xs">
                cmd /c "npm run scrape -- {blog.naver_id} --referer"
              </code>
              {" "}먼저 실행해줘
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {keywords.map((k, i) => (
                <li
                  key={k.keyword}
                  className="flex items-center justify-between px-6 py-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="font-mono text-xs text-zinc-400 w-6">
                      {i + 1}
                    </span>
                    <span className="truncate font-medium">{k.keyword}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs text-zinc-500">
                      {k.percent.toFixed(1)}%
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      {k.count}건
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 인기 포스트 TOP 5 */}
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">📝 인기 포스트 TOP 5</h2>
            <p className="mt-1 text-xs text-zinc-500">최신 일별 조회수 기준</p>
          </div>
          {topPosts.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-zinc-400">
              <code className="text-xs">
                cmd /c "npm run scrape -- {blog.naver_id} --rank"
              </code>
              {" "}먼저 실행해줘
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {topPosts.map((p, i) => (
                <li key={p.log_no} className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-400 w-6">
                      {i + 1}
                    </span>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate text-sm font-medium hover:text-blue-700"
                    >
                      {p.title}
                    </a>
                    <span className="font-mono text-sm text-blue-600 shrink-0">
                      {p.views}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
