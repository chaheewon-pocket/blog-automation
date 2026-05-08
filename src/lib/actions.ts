"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { clearSession } from "./playwright/session";
import { runJobForAllBlogs, type JobName } from "./jobs/runner";
import {
  generatePostDraft,
  type Length,
  type Tone,
} from "./ai/postDrafter";

// ───────────────────────────────────────── Keywords ─────

export async function addKeyword(formData: FormData): Promise<void> {
  const raw = String(formData.get("keyword") ?? "").trim();
  if (!raw) return;
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO monitor_keywords (keyword) VALUES (?)").run(
    raw,
  );
  revalidatePath("/settings");
}

export async function toggleKeyword(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  db.prepare(
    "UPDATE monitor_keywords SET enabled = 1 - enabled WHERE id = ?",
  ).run(id);
  revalidatePath("/settings");
}

export async function deleteKeyword(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  db.prepare("DELETE FROM monitor_keywords WHERE id = ?").run(id);
  revalidatePath("/settings");
}

// ───────────────────────────────────────── Blogs ─────

export async function addBlog(formData: FormData): Promise<void> {
  const alias = String(formData.get("alias") ?? "").trim();
  const naverId = String(formData.get("naver_id") ?? "")
    .trim()
    .replace(/^https?:\/\/blog\.naver\.com\//, "")
    .replace(/\/$/, "");
  if (!alias || !naverId) return;

  const db = getDb();
  const url = `https://blog.naver.com/${naverId}`;

  db.prepare(
    `INSERT OR IGNORE INTO blogs (alias, naver_id, blog_url, is_default, enabled)
     VALUES (?, ?, ?, 0, 1)`,
  ).run(alias, naverId, url);

  // 새 블로그에 대한 기본 자동화 설정도 같이 생성
  const newBlog = db
    .prepare("SELECT id FROM blogs WHERE naver_id = ?")
    .get(naverId) as { id: number } | undefined;
  if (newBlog) {
    db.prepare(
      "INSERT OR IGNORE INTO neighbor_settings (blog_id) VALUES (?)",
    ).run(newBlog.id);
  }

  revalidatePath("/settings");
  revalidatePath("/neighbors");
}

export async function setDefaultBlog(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE blogs SET is_default = 0").run();
    db.prepare("UPDATE blogs SET is_default = 1 WHERE id = ?").run(id);
  })();
  revalidatePath("/settings");
}

export async function toggleBlog(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  db.prepare("UPDATE blogs SET enabled = 1 - enabled WHERE id = ?").run(id);
  revalidatePath("/settings");
  revalidatePath("/neighbors");
}

export async function deleteBlog(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  // 기본 블로그는 삭제 금지
  const blog = db.prepare("SELECT is_default FROM blogs WHERE id = ?").get(id) as
    | { is_default: number }
    | undefined;
  if (!blog || blog.is_default === 1) return;
  db.prepare("DELETE FROM neighbor_settings WHERE blog_id = ?").run(id);
  db.prepare("DELETE FROM blogs WHERE id = ?").run(id);
  revalidatePath("/settings");
  revalidatePath("/neighbors");
}

// ───────────────────────────────────────── Neighbor Settings ─────

export async function updateNeighborSettings(formData: FormData): Promise<void> {
  const blogId = Number(formData.get("blog_id"));
  if (!Number.isInteger(blogId)) return;
  const autoEnabled = formData.get("auto_enabled") === "on" ? 1 : 0;
  const dailyLimit = Math.max(
    0,
    Math.min(200, Number(formData.get("daily_limit") ?? 30)),
  );
  const intervalSeconds = Math.max(
    30,
    Number(formData.get("interval_seconds") ?? 60),
  );
  const defaultMessage = String(
    formData.get("default_message") ?? "",
  ).slice(0, 500);

  const db = getDb();
  db.prepare(
    `UPDATE neighbor_settings
       SET auto_enabled = ?, daily_limit = ?, interval_seconds = ?, default_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE blog_id = ?`,
  ).run(autoEnabled, dailyLimit, intervalSeconds, defaultMessage, blogId);

  revalidatePath("/neighbors");
}

export async function rejectNeighbor(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  db.prepare(
    "UPDATE neighbor_candidates SET status = 'skipped' WHERE id = ?",
  ).run(id);
  revalidatePath("/neighbors");
}

export async function clearBlogSession(formData: FormData): Promise<void> {
  const id = Number(formData.get("blog_id"));
  if (!Number.isInteger(id)) return;
  clearSession(id);
  revalidatePath("/settings");
  revalidatePath("/neighbors");
}

/**
 * 반자동 서로이웃 처리. UI에서 클릭 시:
 * 1) 클라이언트가 클립보드 복사 + 새 탭 열기
 * 2) 이 액션이 안전장치 체크 + DB 상태 'sent'로 업데이트 + neighbor_log 기록
 *
 * 안전장치 위반 시 ok=false로 응답하고 DB는 손대지 않음.
 */
export async function markNeighborSent(candidateId: number): Promise<{
  ok: boolean;
  message: string;
}> {
  const db = getDb();
  const cand = db
    .prepare(
      "SELECT id, from_blog_id, target_url, status FROM neighbor_candidates WHERE id = ?",
    )
    .get(candidateId) as
    | {
        id: number;
        from_blog_id: number;
        target_url: string;
        status: string;
      }
    | undefined;

  if (!cand) return { ok: false, message: "후보 없음" };
  if (cand.status !== "pending")
    return { ok: false, message: `이미 처리됨: ${cand.status}` };

  const settings = db
    .prepare(
      "SELECT daily_limit, interval_seconds FROM neighbor_settings WHERE blog_id = ?",
    )
    .get(cand.from_blog_id) as
    | { daily_limit: number; interval_seconds: number }
    | undefined;
  if (!settings) return { ok: false, message: "neighbor_settings 없음" };

  // 인터벌 체크
  const lastLog = db
    .prepare(
      "SELECT MAX(sent_at) AS t FROM neighbor_log WHERE blog_id = ? AND success = 1",
    )
    .get(cand.from_blog_id) as { t: string | null };

  if (lastLog?.t) {
    const elapsed = (Date.now() - new Date(lastLog.t).getTime()) / 1000;
    if (elapsed < settings.interval_seconds) {
      const wait = Math.ceil(settings.interval_seconds - elapsed);
      return { ok: false, message: `간격 부족: ${wait}초 더 기다려줘` };
    }
  }

  // 일일 한도 체크
  const todayCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM neighbor_log
         WHERE blog_id = ? AND success = 1
         AND date(sent_at) = date('now', 'localtime')`,
      )
      .get(cand.from_blog_id) as { c: number }
  ).c;

  if (todayCount >= settings.daily_limit) {
    return {
      ok: false,
      message: `일일 한도 초과 (${todayCount}/${settings.daily_limit})`,
    };
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE neighbor_candidates SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(candidateId);
    db.prepare(
      `INSERT INTO neighbor_log (blog_id, target_url, sent_at, success, message)
       VALUES (?, ?, CURRENT_TIMESTAMP, 1, '반자동 처리')`,
    ).run(cand.from_blog_id, cand.target_url);
  })();

  revalidatePath("/neighbors");
  return { ok: true, message: "처리 완료" };
}

// ───────────────────────────────────────── Comments ─────

export async function markCommentPosted(
  candidateId: number,
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const cand = db
    .prepare("SELECT id, status FROM comment_candidates WHERE id = ?")
    .get(candidateId) as { id: number; status: string } | undefined;
  if (!cand) return { ok: false, message: "후보 없음" };
  if (cand.status !== "pending")
    return { ok: false, message: `이미 처리됨: ${cand.status}` };

  db.prepare(
    "UPDATE comment_candidates SET status = 'posted', posted_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(candidateId);
  revalidatePath("/comments");
  return { ok: true, message: "OK" };
}

export async function rejectComment(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  db.prepare(
    "UPDATE comment_candidates SET status = 'rejected' WHERE id = ?",
  ).run(id);
  revalidatePath("/comments");
}

export async function updateClaudeApiKey(formData: FormData): Promise<void> {
  const key = String(formData.get("key") ?? "").trim();
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('claude_api_key', ?, CURRENT_TIMESTAMP)",
  ).run(key);
  revalidatePath("/settings");
  revalidatePath("/comments");
}

export async function updateOpenAiApiKey(formData: FormData): Promise<void> {
  const key = String(formData.get("key") ?? "").trim();
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('openai_api_key', ?, CURRENT_TIMESTAMP)",
  ).run(key);
  revalidatePath("/settings");
  revalidatePath("/comments");
}

export async function updateAiProvider(formData: FormData): Promise<void> {
  const provider = String(formData.get("provider") ?? "").trim();
  if (!["", "claude", "openai"].includes(provider)) return;
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ai_provider', ?, CURRENT_TIMESTAMP)",
  ).run(provider);
  revalidatePath("/settings");
  revalidatePath("/comments");
}

export async function updateDataLabKeys(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") ?? "").trim();
  const clientSecret = String(formData.get("client_secret") ?? "").trim();
  const db = getDb();
  if (clientId !== undefined) {
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('datalab_client_id', ?, CURRENT_TIMESTAMP)",
    ).run(clientId);
  }
  if (clientSecret !== undefined) {
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('datalab_client_secret', ?, CURRENT_TIMESTAMP)",
    ).run(clientSecret);
  }
  revalidatePath("/settings");
  revalidatePath("/insights");
}

// ───────────────────────────────────────── Post drafts (M6) ─────

export async function generateAndSaveDraft(
  formData: FormData,
): Promise<{
  ok: boolean;
  id?: number;
  title?: string;
  body?: string;
  provider?: string;
  error?: string;
}> {
  const blogId = Number(formData.get("blog_id"));
  const topic = String(formData.get("topic") ?? "").trim();
  const tone = String(formData.get("tone") ?? "informative") as Tone;
  const length = String(formData.get("length") ?? "medium") as Length;
  const keywordsRaw = String(formData.get("keywords") ?? "");
  const keywords = keywordsRaw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!Number.isInteger(blogId) || !topic) {
    return { ok: false, error: "주제와 블로그가 필요해" };
  }

  try {
    const result = await generatePostDraft({ topic, tone, length, keywords });
    const db = getDb();
    const insertResult = db
      .prepare(
        `INSERT INTO drafts (blog_id, topic, tone, length, keywords, title, body, ai_provider, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      )
      .run(
        blogId,
        topic,
        tone,
        length,
        JSON.stringify(keywords),
        result.title,
        result.body,
        result.provider,
      );

    revalidatePath("/drafts");

    return {
      ok: true,
      id: insertResult.lastInsertRowid as number,
      title: result.title,
      body: result.body,
      provider: result.provider,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function updateDraft(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!Number.isInteger(id) || !title) return;
  const db = getDb();
  db.prepare(
    `UPDATE drafts SET title = ?, body = ?, status = 'edited', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(title, body, id);
  revalidatePath("/drafts");
}

export async function deleteDraft(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  db.prepare("DELETE FROM drafts WHERE id = ?").run(id);
  revalidatePath("/drafts");
}

export async function markDraftPublished(
  draftId: number,
): Promise<{ ok: boolean; message: string }> {
  if (!Number.isInteger(draftId))
    return { ok: false, message: "id 누락" };
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM drafts WHERE id = ?")
    .get(draftId) as { status: string } | undefined;
  if (!row) return { ok: false, message: "초안 없음" };
  if (row.status === "published")
    return { ok: false, message: "이미 게시됨" };

  db.prepare(
    `UPDATE drafts SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(draftId);
  revalidatePath("/drafts");
  return { ok: true, message: "OK" };
}

// ───────────────────────────────────────── Schedule ─────

export async function toggleJob(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const db = getDb();
  db.prepare(
    "UPDATE job_schedule SET enabled = 1 - enabled, updated_at = CURRENT_TIMESTAMP WHERE job_name = ?",
  ).run(name);
  revalidatePath("/schedule");
}

export async function updateJobCron(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const cron = String(formData.get("cron") ?? "").trim();
  if (!name || !cron) return;
  const parts = cron.split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return;
  const db = getDb();
  db.prepare(
    "UPDATE job_schedule SET cron_expression = ?, updated_at = CURRENT_TIMESTAMP WHERE job_name = ?",
  ).run(cron, name);
  revalidatePath("/schedule");
}

export async function runJobNow(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim() as JobName;
  if (!["scrapePosts", "scrapeRank", "scrapeReferer", "findNeighbors", "findComments", "fetchTrends"].includes(name)) return;
  // fire-and-forget: 작업이 길 수 있어 응답 기다리지 않음.
  // job_runs에 'running' 상태로 기록되고 끝나면 'ok'/'failed' 업데이트.
  void runJobForAllBlogs(name).catch((err) => console.error("runJobNow:", err));
  revalidatePath("/schedule");
}

export async function seedDemoNeighbors(formData: FormData): Promise<void> {
  const blogId = Number(formData.get("blog_id"));
  if (!Number.isInteger(blogId)) return;
  const db = getDb();
  const samples = [
    { keyword: "법정의무교육", alias: "병원관리자의 일상", url: "https://blog.naver.com/example_a/1" },
    { keyword: "의료기관 인증교육", alias: "간호사 N의 일기", url: "https://blog.naver.com/example_b/2" },
    { keyword: "요양원 교육", alias: "요양원 운영 노하우", url: "https://blog.naver.com/example_c/3" },
    { keyword: "산업안전보건교육", alias: "안전관리자 모임", url: "https://blog.naver.com/example_d/4" },
    { keyword: "병원 교육", alias: "신규 개원 가이드", url: "https://blog.naver.com/example_e/5" },
  ];
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO neighbor_candidates
       (from_blog_id, target_url, target_alias, target_keyword, request_message, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
  );
  for (const s of samples) {
    const msg = `안녕하세요 :) "${s.keyword}" 키워드로 들어왔다가 글이 너무 좋아서 서로이웃 신청드려요! 앞으로 좋은 글 자주 보러 올게요 ☺️`;
    stmt.run(blogId, s.url, s.alias, s.keyword, msg);
  }
  revalidatePath("/neighbors");
}
