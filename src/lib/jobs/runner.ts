import { getDb } from "../db";
import {
  scrapeDailyRank,
  scrapePostList,
  scrapeReferrers,
} from "../scrapers/blogStats";
import { collectNeighborCandidates } from "../scrapers/neighborCandidates";
import { collectCommentCandidates } from "../scrapers/commentCandidates";
import { fetchAndStoreTrends } from "../datalab/client";
import { getSessionInfo } from "../playwright/session";

export type JobName =
  | "scrapePosts"
  | "scrapeRank"
  | "scrapeReferer"
  | "findNeighbors"
  | "findComments"
  | "fetchTrends";

export const JOB_LABELS: Record<JobName, string> = {
  scrapePosts: "📚 RSS 포스트 수집",
  scrapeRank: "📊 일별 조회수",
  scrapeReferer: "🔍 유입경로/키워드",
  findNeighbors: "🤝 서로이웃 후보",
  findComments: "💬 댓글 후보 + AI 초안",
  fetchTrends: "📈 DataLab 검색 트렌드",
};

type Blog = { id: number; naver_id: string };

export type JobResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
};

export async function runJob(
  jobName: JobName,
  blog: Blog,
): Promise<JobResult> {
  const db = getDb();
  const startTs = Date.now();
  const startedAt = new Date(startTs).toISOString();

  // scrapePosts(RSS) 외에는 모두 로그인 세션 필요. 없으면 즉시 skip.
  if (jobName !== "scrapePosts") {
    const session = getSessionInfo(blog.id);
    if (!session.exists) {
      const skipResult = {
        skipped: true,
        reason: `세션 없음 — \`npm run login -- ${blog.naver_id}\` 필요`,
      };
      db.prepare(
        `INSERT INTO job_runs (job_name, blog_id, started_at, finished_at, status, result_json)
         VALUES (?, ?, ?, ?, 'ok', ?)`,
      ).run(
        jobName,
        blog.id,
        startedAt,
        startedAt,
        JSON.stringify(skipResult),
      );
      return { ok: true, result: skipResult, durationMs: 0 };
    }
  }

  const insertRun = db.prepare(`
    INSERT INTO job_runs (job_name, blog_id, started_at, status)
    VALUES (?, ?, ?, 'running')
  `);
  const runId = insertRun.run(jobName, blog.id, startedAt).lastInsertRowid as number;

  try {
    let result: unknown;
    switch (jobName) {
      case "scrapePosts":
        result = await scrapePostList(blog.id, blog.naver_id);
        break;
      case "scrapeRank":
        result = await scrapeDailyRank(blog.id, blog.naver_id);
        break;
      case "scrapeReferer":
        result = await scrapeReferrers(blog.id, blog.naver_id);
        break;
      case "findNeighbors":
        result = await collectNeighborCandidates(blog.id, blog.naver_id);
        break;
      case "findComments":
        result = await collectCommentCandidates(blog.id, blog.naver_id);
        break;
      case "fetchTrends":
        result = await fetchAndStoreTrends({ days: 30 });
        break;
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }

    const durationMs = Date.now() - startTs;
    db.prepare(
      `UPDATE job_runs SET status = 'ok', result_json = ?, finished_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(result), new Date().toISOString(), runId);

    return { ok: true, result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTs;
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE job_runs SET status = 'failed', error = ?, finished_at = ?
       WHERE id = ?`,
    ).run(msg, new Date().toISOString(), runId);

    return { ok: false, error: msg, durationMs };
  }
}

/**
 * 활성화된 모든 블로그에 대해 job 실행.
 */
export async function runJobForAllBlogs(jobName: JobName): Promise<JobResult[]> {
  const db = getDb();
  const blogs = db
    .prepare("SELECT id, naver_id FROM blogs WHERE enabled = 1")
    .all() as Blog[];

  const results: JobResult[] = [];
  for (const blog of blogs) {
    results.push(await runJob(jobName, blog));
  }
  return results;
}
