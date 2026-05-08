import { getDb } from "@/lib/db";
import { runJobNow, toggleJob, updateJobCron } from "@/lib/actions";
import { JOB_LABELS, type JobName } from "@/lib/jobs/runner";
import { fmtTimestamp, fmtShortTimestamp } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

type ScheduleRow = {
  job_name: string;
  cron_expression: string;
  enabled: number;
  description: string | null;
  updated_at: string;
};

type RunRow = {
  id: number;
  job_name: string;
  blog_id: number | null;
  blog_alias: string | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "failed";
  result_json: string | null;
  error: string | null;
};

type LastRunMap = Record<string, RunRow | undefined>;

export default function SchedulePage() {
  const db = getDb();
  const schedules = db
    .prepare("SELECT * FROM job_schedule ORDER BY job_name")
    .all() as ScheduleRow[];

  const recentRuns = db
    .prepare(
      `SELECT r.*, b.alias AS blog_alias
         FROM job_runs r
         LEFT JOIN blogs b ON b.id = r.blog_id
         ORDER BY r.started_at DESC LIMIT 30`,
    )
    .all() as RunRow[];

  // 잡별 마지막 실행
  const lastByJob: LastRunMap = {};
  for (const r of recentRuns) {
    if (!lastByJob[r.job_name]) lastByJob[r.job_name] = r;
  }

  return (
    <div className="px-10 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">⏰ 스케줄</h1>
        <p className="mt-1 text-sm text-zinc-500">
          매일/매주 자동으로 통계 수집·서로이웃 검색을 실행. 데몬을 띄워야 동작해.
        </p>
      </header>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <strong>📌 스케줄러 데몬 실행이 필요해.</strong> 별도 터미널에서:
        <code className="ml-2 rounded bg-amber-900/20 px-2 py-0.5 font-mono text-xs">
          cmd /c &quot;npm run scheduler&quot;
        </code>
        <p className="mt-1 text-xs">
          이 창을 닫지 말고 둬야 cron이 동작해. PC를 켜둔 동안 자동 수집됨.<br />
          단발성 실행은 아래 &quot;지금 실행&quot; 버튼으로 즉시 트리거 가능.
        </p>
      </div>

      <section className="mb-8 grid gap-4">
        {schedules.map((s) => {
          const last = lastByJob[s.job_name];
          const label = JOB_LABELS[s.job_name as JobName] ?? s.job_name;
          return (
            <div
              key={s.job_name}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold">{label}</span>
                    <form action={toggleJob}>
                      <input type="hidden" name="name" value={s.job_name} />
                      <button
                        type="submit"
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.enabled
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                        }`}
                      >
                        {s.enabled ? "🟢 활성" : "⚪ 비활성"}
                      </button>
                    </form>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{s.description}</p>

                  <form
                    action={updateJobCron}
                    className="mt-3 flex items-center gap-2"
                  >
                    <input type="hidden" name="name" value={s.job_name} />
                    <label className="text-xs text-zinc-500">Cron:</label>
                    <input
                      type="text"
                      name="cron"
                      defaultValue={s.cron_expression}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      style={{ width: "120px" }}
                    />
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      저장
                    </button>
                  </form>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <form action={runJobNow}>
                    <input type="hidden" name="name" value={s.job_name} />
                    <button
                      type="submit"
                      className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      ▶ 지금 실행
                    </button>
                  </form>
                  {last && (
                    <div className="text-right text-xs">
                      <div className="text-zinc-400">마지막 실행</div>
                      <div className="font-mono">
                        {fmtTimestamp(last.started_at)}
                      </div>
                      <div>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            last.status === "ok"
                              ? "bg-emerald-50 text-emerald-700"
                              : last.status === "running"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {last.status === "ok"
                            ? "✅ 성공"
                            : last.status === "running"
                              ? "⏳ 진행 중"
                              : "❌ 실패"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">📜 최근 실행 로그 (최대 30건)</h2>
        </div>
        {recentRuns.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-zinc-400">
            아직 실행 기록이 없어. &quot;지금 실행&quot;을 눌러봐.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
              <tr>
                <th className="px-6 py-2">시각</th>
                <th className="px-6 py-2">작업</th>
                <th className="px-6 py-2">블로그</th>
                <th className="px-6 py-2">상태</th>
                <th className="px-6 py-2">결과/오류</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => {
                const elapsed =
                  r.finished_at && r.started_at
                    ? `${Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 100) / 10}s`
                    : "—";
                return (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-6 py-2 font-mono text-xs">
                      {fmtShortTimestamp(r.started_at)}
                    </td>
                    <td className="px-6 py-2">
                      {JOB_LABELS[r.job_name as JobName] ?? r.job_name}
                    </td>
                    <td className="px-6 py-2 text-xs">{r.blog_alias ?? "—"}</td>
                    <td className="px-6 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          r.status === "ok"
                            ? "bg-emerald-50 text-emerald-700"
                            : r.status === "running"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {r.status} ({elapsed})
                      </span>
                    </td>
                    <td className="px-6 py-2 max-w-md truncate font-mono text-xs text-zinc-500">
                      {r.error ?? r.result_json ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
