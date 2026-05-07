import { getDb } from "@/lib/db";
import KeywordTrendChart, {
  type ChartRow,
} from "@/components/KeywordTrendChart";

export const dynamic = "force-dynamic";

type TrendRow = { date: string; keyword: string; ratio: number };

export default function InsightsPage() {
  const db = getDb();

  const clientId = (db
    .prepare("SELECT value FROM settings WHERE key = 'datalab_client_id'")
    .get() as { value: string } | undefined)?.value ?? "";
  const clientSecret = (db
    .prepare("SELECT value FROM settings WHERE key = 'datalab_client_secret'")
    .get() as { value: string } | undefined)?.value ?? "";
  const keysReady = Boolean(clientId.trim() && clientSecret.trim());

  // 최근 30일 데이터
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const rows = db
    .prepare(
      `SELECT date, keyword, ratio FROM daily_search_trend
         WHERE date >= ? ORDER BY date ASC, keyword ASC`,
    )
    .all(since) as TrendRow[];

  const keywords = Array.from(new Set(rows.map((r) => r.keyword)));

  // long → wide pivot
  const byDate: Record<string, ChartRow> = {};
  for (const r of rows) {
    const k = r.date;
    if (!byDate[k]) byDate[k] = { date: r.date };
    byDate[k][r.keyword] = r.ratio;
  }
  const chartData = Object.values(byDate).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  // 키워드별 통계 (평균/최대/최근)
  const stats = keywords
    .map((kw) => {
      const points = rows.filter((r) => r.keyword === kw);
      if (points.length === 0)
        return { keyword: kw, avg: 0, max: 0, latest: 0, count: 0 };
      const ratios = points.map((p) => p.ratio);
      const avg = ratios.reduce((s, x) => s + x, 0) / ratios.length;
      const max = Math.max(...ratios);
      const latest = points[points.length - 1].ratio;
      return { keyword: kw, avg, max, latest, count: ratios.length };
    })
    .sort((a, b) => b.avg - a.avg);

  return (
    <div className="px-10 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">📈 키워드 인사이트</h1>
        <p className="mt-1 text-sm text-zinc-500">
          네이버 DataLab API 기반 검색 트렌드 (0~100 정규화 점수, 100=기간 내 최댓값)
        </p>
      </header>

      {!keysReady ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <h2 className="text-lg font-semibold">🔑 DataLab API 키 미설정</h2>
          <p className="mt-2 text-sm">
            <a
              href="https://developers.naver.com/apps/#/register"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              네이버 개발자 센터
            </a>
            에서 애플리케이션 등록 후 (API 선택: <strong>데이터랩 (검색어트렌드)</strong>) Client ID/Secret을 발급받아{" "}
            <a href="/settings" className="underline">
              설정
            </a>
            에 입력해줘. 무료.
          </p>
          <p className="mt-3 text-xs">
            발급 5분이면 끝. 등록 시 Web 서비스 URL은 <code>http://localhost:3000</code>으로.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-zinc-600 dark:text-zinc-400">
            아직 수집된 트렌드 데이터가 없어. 터미널에서:
          </p>
          <code className="mt-3 inline-block rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100">
            cmd /c &quot;npm run fetch-trends&quot;
          </code>
          <p className="mt-3 text-xs text-zinc-500">
            또는 <a href="/schedule" className="underline">스케줄</a>에서 &quot;fetchTrends&quot; 활성화 + &quot;지금 실행&quot;
          </p>
        </div>
      ) : (
        <>
          <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold">
              📊 최근 30일 검색 트렌드 ({keywords.length}개 키워드)
            </h2>
            <KeywordTrendChart data={chartData} keywords={keywords} />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
              <h2 className="text-lg font-semibold">🏆 키워드 순위 (평균 점수 기준)</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
                <tr>
                  <th className="px-6 py-3 w-12">#</th>
                  <th className="px-6 py-3">키워드</th>
                  <th className="px-6 py-3 text-right">평균</th>
                  <th className="px-6 py-3 text-right">최고</th>
                  <th className="px-6 py-3 text-right">최근</th>
                  <th className="px-6 py-3 text-right">데이터</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => (
                  <tr
                    key={s.keyword}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-6 py-3 font-mono text-zinc-400">{i + 1}</td>
                    <td className="px-6 py-3 font-medium">{s.keyword}</td>
                    <td className="px-6 py-3 text-right font-mono">
                      {s.avg.toFixed(1)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono">
                      {s.max.toFixed(1)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono">
                      <span
                        className={
                          s.latest > s.avg
                            ? "text-emerald-600"
                            : s.latest < s.avg * 0.7
                              ? "text-rose-600"
                              : ""
                        }
                      >
                        {s.latest.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-xs text-zinc-400">
                      {s.count}일
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
