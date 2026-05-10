/**
 * 운영 셋업 진단 — DB의 settings/blogs/keywords + 세션 파일 + 누적 데이터를
 * 한 번에 출력해 "어디가 비어있고 어디가 채워졌는지" 빠르게 진단한다.
 *
 * 사용법:
 *   npm run checkup
 *   또는 cmd /c "npx tsx scripts/checkSetup.ts"
 */

import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "data", "blog.sqlite");
const SESSIONS_DIR = path.join(ROOT, "data", "sessions");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const ok = (m: string) => `${C.green}✅${C.reset} ${m}`;
const no = (m: string) => `${C.red}❌${C.reset} ${m}`;
const warn = (m: string) => `${C.yellow}⚠️ ${C.reset} ${m}`;
const head = (m: string) =>
  `\n${C.bold}${C.cyan}━━ ${m} ${"━".repeat(Math.max(0, 50 - m.length))}${C.reset}`;

function mask(v: string): string {
  if (!v) return "";
  if (v.length < 12) return "****";
  return v.slice(0, 7) + "..." + v.slice(-4);
}

function ageHuman(d: Date): string {
  const ms = Date.now() - d.getTime();
  const h = ms / 3600000;
  if (h < 1) return `${Math.round(h * 60)}분 전`;
  if (h < 48) return `${Math.round(h)}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

function main() {
  console.log(`\n${C.bold}🐾 PocketBlog Insight — 운영 셋업 진단${C.reset}`);
  console.log(`${C.dim}${new Date().toLocaleString("ko-KR")}${C.reset}`);

  if (!fs.existsSync(DB_PATH)) {
    console.log(no(`DB 파일 없음: ${DB_PATH}`));
    console.log(`   → cmd /c "npm run init-db" 먼저 실행`);
    return;
  }
  console.log(ok(`DB 파일 OK`));

  const db = new Database(DB_PATH, { readonly: true });

  // ── 1. blogs ─────────────────────────────────────
  console.log(head("1. 대상 블로그"));
  const blogs = db
    .prepare(
      "SELECT id, alias, naver_id, blog_url, is_default, enabled FROM blogs ORDER BY is_default DESC, id",
    )
    .all() as Array<{
    id: number;
    alias: string;
    naver_id: string;
    blog_url: string;
    is_default: number;
    enabled: number;
  }>;

  if (blogs.length === 0) {
    console.log("   " + no("등록된 블로그 없음 — /settings 에서 추가 필요"));
  } else {
    for (const b of blogs) {
      const tags = [
        b.is_default ? `${C.yellow}기본${C.reset}` : null,
        b.enabled ? `${C.green}활성${C.reset}` : `${C.dim}비활성${C.reset}`,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(`   • ${C.bold}${b.alias}${C.reset} (${b.naver_id}) ${tags}`);
    }
  }

  // ── 2. 모니터링 키워드 ─────────────────────────────
  console.log(head("2. 모니터링 키워드"));
  const kws = db
    .prepare("SELECT keyword, enabled FROM monitor_keywords ORDER BY id")
    .all() as Array<{ keyword: string; enabled: number }>;
  const enabled = kws.filter((k) => k.enabled === 1);
  if (kws.length === 0) {
    console.log("   " + no("키워드 없음 — /settings 에서 추가 필요"));
  } else {
    console.log(
      "   " + ok(`총 ${kws.length}개 (활성 ${enabled.length}개)`),
    );
    console.log(
      `   ${C.dim}${enabled.map((k) => k.keyword).join(", ") || "(활성 없음)"}${C.reset}`,
    );
  }

  // ── 3. API 키 ─────────────────────────────────────
  console.log(head("3. API 키"));
  const settings = Object.fromEntries(
    (
      db
        .prepare("SELECT key, value FROM settings")
        .all() as Array<{ key: string; value: string }>
    ).map((s) => [s.key, s.value]),
  );
  const showKey = (key: string, label: string) => {
    const v = (settings[key] ?? "").trim();
    if (v) console.log("   " + ok(`${label}: ${mask(v)}`));
    else console.log("   " + no(`${label}: 미설정`));
  };
  showKey("claude_api_key", "Claude API");
  showKey("openai_api_key", "OpenAI API");
  showKey("datalab_client_id", "DataLab Client ID");
  showKey("datalab_client_secret", "DataLab Client Secret");
  const provider = (settings["ai_provider"] ?? "").trim();
  console.log(
    `   ${C.dim}현재 AI 제공자: ${provider || "(미선택 — 키 있으면 자동선택)"}${C.reset}`,
  );

  // ── 4. 세션 파일 ──────────────────────────────────
  console.log(head("4. 네이버 로그인 세션"));
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log("   " + no("sessions 폴더 자체가 없음"));
  } else if (blogs.length === 0) {
    console.log(`   ${C.dim}(블로그가 없어서 확인 불가)${C.reset}`);
  } else {
    for (const b of blogs) {
      const sp = path.join(SESSIONS_DIR, `${b.naver_id}.json`);
      if (!fs.existsSync(sp)) {
        console.log(
          `   ${no(`${b.naver_id}: 세션 파일 없음`)} ${C.dim}→ cmd /c "npm run login -- ${b.naver_id}"${C.reset}`,
        );
        continue;
      }
      const stat = fs.statSync(sp);
      const ageDays = (Date.now() - stat.mtimeMs) / 86400000;
      if (ageDays > 14) {
        console.log(
          "   " + warn(`${b.naver_id}: 세션 만료 임박 (${ageHuman(stat.mtime)})`),
        );
      } else {
        console.log("   " + ok(`${b.naver_id}: 세션 활성 (${ageHuman(stat.mtime)})`));
      }
    }
  }

  // ── 5. 누적 데이터 ────────────────────────────────
  console.log(head("5. 누적 데이터"));
  const tables: Array<[string, string]> = [
    ["posts", "포스트 메타"],
    ["post_stats", "포스트 통계 스냅샷"],
    ["daily_referrers", "일별 유입경로"],
    ["daily_keywords", "일별 검색 키워드"],
    ["comment_candidates", "댓글 후보"],
    ["neighbor_candidates", "서로이웃 후보"],
    ["drafts", "글 초안"],
    ["daily_search_trend", "DataLab 트렌드"],
  ];
  for (const [table, label] of tables) {
    try {
      const c = (
        db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }
      ).c;
      const status =
        c > 0 ? `${C.green}${c}건${C.reset}` : `${C.dim}0건 (비어있음)${C.reset}`;
      console.log(`   • ${label.padEnd(20, " ")} ${status}`);
    } catch {
      console.log(
        `   • ${label.padEnd(20, " ")} ${C.red}(테이블 없음 — 마이그레이션 필요?)${C.reset}`,
      );
    }
  }

  // ── 6. 잡 스케줄 ──────────────────────────────────
  console.log(head("6. 잡 스케줄"));
  try {
    const scheds = db
      .prepare(
        "SELECT job_name, cron_expression, enabled FROM job_schedule ORDER BY job_name",
      )
      .all() as Array<{
      job_name: string;
      cron_expression: string;
      enabled: number;
    }>;
    if (scheds.length === 0) {
      console.log(`   ${C.dim}(스케줄 없음)${C.reset}`);
    } else {
      for (const s of scheds) {
        const tag =
          s.enabled === 1 ? `${C.green}🟢 활성${C.reset}` : `${C.dim}⚪ 비활성${C.reset}`;
        console.log(
          `   ${tag} ${s.job_name.padEnd(18, " ")} ${C.dim}${s.cron_expression}${C.reset}`,
        );
      }
    }
  } catch {
    console.log("   " + warn("job_schedule 테이블 없음"));
  }

  // ── 7. 최근 실행 ──────────────────────────────────
  console.log(head("7. 최근 잡 실행 (최근 5건)"));
  try {
    const runs = db
      .prepare(
        "SELECT job_name, started_at, status, error FROM job_runs ORDER BY started_at DESC LIMIT 5",
      )
      .all() as Array<{
      job_name: string;
      started_at: string;
      status: string;
      error: string | null;
    }>;
    if (runs.length === 0) {
      console.log(`   ${C.dim}(아직 실행 기록 없음)${C.reset}`);
    } else {
      for (const r of runs) {
        const icon =
          r.status === "ok"
            ? "✅"
            : r.status === "running"
              ? "⏳"
              : `${C.red}❌${C.reset}`;
        const when = new Date(r.started_at).toLocaleString("ko-KR");
        const errSuffix = r.error
          ? ` ${C.red}(${r.error.slice(0, 60)})${C.reset}`
          : "";
        console.log(`   ${icon} ${when} — ${r.job_name}${errSuffix}`);
      }
    }
  } catch {
    console.log("   " + warn("job_runs 테이블 없음"));
  }

  db.close();
  console.log(`\n${C.bold}진단 완료.${C.reset}\n`);
}

main();
