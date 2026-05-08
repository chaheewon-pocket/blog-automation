/**
 * 백그라운드 스케줄러 데몬.
 * 사용법: npm run scheduler
 *
 * job_schedule 테이블에서 활성 잡을 읽어 cron으로 등록.
 * 프로세스가 떠있는 동안 매일/매주 자동 실행.
 * Ctrl+C 로 종료.
 */
import path from "path";
import Database from "better-sqlite3";
import cron from "node-cron";
import { JOB_LABELS, type JobName, runJobForAllBlogs } from "../src/lib/jobs/runner";

type ScheduleRow = {
  job_name: string;
  cron_expression: string;
  enabled: number;
  description: string | null;
};

async function main() {
  const db = new Database(path.join(process.cwd(), "data", "blog.sqlite"));
  const schedules = db
    .prepare("SELECT * FROM job_schedule WHERE enabled = 1")
    .all() as ScheduleRow[];

  const blogs = db
    .prepare("SELECT id, naver_id, alias FROM blogs WHERE enabled = 1")
    .all() as { id: number; naver_id: string; alias: string }[];

  if (blogs.length === 0) {
    console.error("❌ 활성 블로그 없음. /settings에서 추가/활성화해줘.");
    process.exit(1);
  }

  console.log("📅 스케줄러 시작");
  console.log(`   블로그 ${blogs.length}개: ${blogs.map((b) => b.naver_id).join(", ")}`);
  console.log(`   잡 ${schedules.length}개 등록 중...\n`);

  const tasks: ReturnType<typeof cron.schedule>[] = [];

  for (const job of schedules) {
    if (!cron.validate(job.cron_expression)) {
      console.warn(`   ⚠️  ${job.job_name}: 잘못된 cron 표현식 "${job.cron_expression}"`);
      continue;
    }

    const label = JOB_LABELS[job.job_name as JobName] ?? job.job_name;

    const task = cron.schedule(
      job.cron_expression,
      async () => {
        const ts = new Date().toISOString();
        console.log(`\n🔔 [${ts}] ${label} 실행 시작`);
        const results = await runJobForAllBlogs(job.job_name as JobName);
        for (let i = 0; i < blogs.length; i++) {
          const r = results[i];
          const emoji = r.ok ? "✅" : "❌";
          const tail = r.ok
            ? JSON.stringify(r.result)
            : `오류: ${r.error}`;
          console.log(
            `   ${emoji} ${blogs[i].alias}: ${tail} (${r.durationMs}ms)`,
          );
        }
      },
      { timezone: "Asia/Seoul" },
    );

    tasks.push(task);
    console.log(
      `   ✓ ${label.padEnd(20)} ${job.cron_expression.padEnd(15)} ${job.description ?? ""}`,
    );
  }

  console.log("\n⏰ 스케줄러 대기 중. Ctrl+C로 종료.\n");

  // 종료 핸들러
  const shutdown = () => {
    console.log("\n🛑 스케줄러 종료 중...");
    for (const t of tasks) t.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 프로세스 유지
  await new Promise(() => {
    // never resolves
  });
}

main().catch((err) => {
  console.error("❌ 스케줄러 오류:", err);
  process.exit(1);
});
