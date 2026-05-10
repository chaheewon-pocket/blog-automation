import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "blog.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

function tableHasColumn(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

function tableExists(table: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    )
    .get(table);
  return Boolean(row);
}

console.log("🔧 마이그레이션 시작...");

db.transaction(() => {
  // 1. blogs 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS blogs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      alias           TEXT NOT NULL,
      naver_id        TEXT UNIQUE NOT NULL,
      blog_url        TEXT NOT NULL,
      session_path    TEXT,
      is_default      INTEGER NOT NULL DEFAULT 0,
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. 기존 settings.blog_url 값 → blogs 테이블 첫 행으로 시드 (1회만)
  const existingBlog = db.prepare("SELECT COUNT(*) as c FROM blogs").get() as {
    c: number;
  };
  if (existingBlog.c === 0) {
    const oldBlogUrlRow = db
      .prepare("SELECT value FROM settings WHERE key = 'blog_url'")
      .get() as { value: string } | undefined;
    if (oldBlogUrlRow) {
      const url = oldBlogUrlRow.value;
      const naverId = url.replace(/.*\/blog\.naver\.com\//, "").replace(/\/$/, "");
      db.prepare(
        `INSERT INTO blogs (alias, naver_id, blog_url, is_default, enabled)
         VALUES (?, ?, ?, 1, 1)`,
      ).run("포켓클래스 (기본)", naverId, url);
      console.log(`  ✓ 기존 블로그 이관: ${naverId}`);
    }
  }

  // 3. posts에 blog_id FK 컬럼 추가
  if (!tableHasColumn("posts", "blog_id")) {
    db.exec(`ALTER TABLE posts ADD COLUMN blog_id INTEGER REFERENCES blogs(id)`);
    db.exec(`UPDATE posts SET blog_id = (SELECT id FROM blogs WHERE is_default = 1 LIMIT 1)`);
    console.log("  ✓ posts.blog_id 추가");
  }

  // 4. 서로이웃 후보 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS neighbor_candidates (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      from_blog_id    INTEGER NOT NULL REFERENCES blogs(id),
      target_url      TEXT NOT NULL,
      target_alias    TEXT NOT NULL,
      target_keyword  TEXT NOT NULL,
      request_message TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed|skipped
      error_message   TEXT,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
      sent_at         TEXT,
      UNIQUE(from_blog_id, target_url)
    );
  `);

  // 5. 서로이웃 신청 일일 로그 (rate limiting)
  db.exec(`
    CREATE TABLE IF NOT EXISTS neighbor_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      blog_id         INTEGER NOT NULL REFERENCES blogs(id),
      target_url      TEXT NOT NULL,
      sent_at         TEXT NOT NULL,
      success         INTEGER NOT NULL,
      message         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_neighbor_log_blog_date
      ON neighbor_log(blog_id, sent_at);
  `);

  // 6. 서로이웃 자동화 설정 (블로그별)
  db.exec(`
    CREATE TABLE IF NOT EXISTS neighbor_settings (
      blog_id              INTEGER PRIMARY KEY REFERENCES blogs(id),
      auto_enabled         INTEGER NOT NULL DEFAULT 0,
      daily_limit          INTEGER NOT NULL DEFAULT 30,
      interval_seconds     INTEGER NOT NULL DEFAULT 60,
      default_message      TEXT NOT NULL DEFAULT '안녕하세요! 블로그 글 잘 읽었습니다. 서로이웃 신청드려요 :)',
      updated_at           TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 7. 모든 기존 블로그에 기본 자동화 설정 행 생성
  db.exec(`
    INSERT OR IGNORE INTO neighbor_settings (blog_id)
    SELECT id FROM blogs;
  `);

  console.log("  ✓ neighbor_candidates / neighbor_log / neighbor_settings 생성");

  // 8. 스케줄/실행로그
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_schedule (
      job_name        TEXT PRIMARY KEY,
      cron_expression TEXT NOT NULL,
      enabled         INTEGER NOT NULL DEFAULT 1,
      description     TEXT,
      updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name        TEXT NOT NULL,
      blog_id         INTEGER REFERENCES blogs(id),
      started_at      TEXT NOT NULL,
      finished_at     TEXT,
      status          TEXT NOT NULL,    -- running | ok | failed
      result_json     TEXT,
      error           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_job_runs_started
      ON job_runs(started_at DESC);
  `);

  const seedJobs = [
    { name: "scrapePosts", cron: "0 9 * * *", desc: "매일 09:00 - RSS로 새 포스트 수집" },
    { name: "scrapeRank", cron: "5 9 * * *", desc: "매일 09:05 - 일간 조회수 수집" },
    { name: "scrapeReferer", cron: "10 9 * * *", desc: "매일 09:10 - 유입경로/검색 키워드 수집" },
    { name: "findNeighbors", cron: "0 10 * * 1", desc: "매주 월 10:00 - 서로이웃 후보 검색" },
  ];
  const seedJob = db.prepare(`
    INSERT OR IGNORE INTO job_schedule (job_name, cron_expression, description)
    VALUES (?, ?, ?)
  `);
  for (const j of seedJobs) seedJob.run(j.name, j.cron, j.desc);

  console.log("  ✓ job_schedule / job_runs 생성 + 4개 기본 잡 시드");

  // 9. 일별 유입경로/키워드 테이블 (블로그 전체 합계)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_referrers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      blog_id         INTEGER NOT NULL REFERENCES blogs(id),
      date            TEXT NOT NULL,
      referrer_domain TEXT NOT NULL,
      count           INTEGER NOT NULL,
      percent         REAL,
      collected_at    TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blog_id, date, referrer_domain)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_referrers_blog_date
      ON daily_referrers(blog_id, date);

    CREATE TABLE IF NOT EXISTS daily_keywords (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      blog_id         INTEGER NOT NULL REFERENCES blogs(id),
      date            TEXT NOT NULL,
      keyword         TEXT NOT NULL,
      count           INTEGER NOT NULL,
      percent         REAL,
      search_url      TEXT,
      collected_at    TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blog_id, date, keyword)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_keywords_blog_date
      ON daily_keywords(blog_id, date);
  `);
  console.log("  ✓ daily_referrers / daily_keywords 생성");

  // 10. 댓글 후보에 from_blog_id 추가 (있으면 무시)
  if (!tableHasColumn("comment_candidates", "from_blog_id")) {
    db.exec(
      `ALTER TABLE comment_candidates ADD COLUMN from_blog_id INTEGER REFERENCES blogs(id)`,
    );
    db.exec(
      `UPDATE comment_candidates SET from_blog_id = (SELECT id FROM blogs WHERE is_default = 1 LIMIT 1)`,
    );
    console.log("  ✓ comment_candidates.from_blog_id 추가");
  }

  // 11. Claude API key 자리 (settings 테이블 활용)
  db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('claude_api_key', '')",
  ).run();

  // 12. job_schedule에 findComments 추가
  db.prepare(
    `INSERT OR IGNORE INTO job_schedule (job_name, cron_expression, enabled, description)
     VALUES ('findComments', '0 11 * * 2,5', 0, '매주 화·금 11:00 - 댓글 후보 글 검색 + AI 초안')`,
  ).run();

  console.log("  ✓ comment 인프라 + findComments 스케줄 시드");

  // 13. DataLab 검색 트렌드 (M5)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_search_trend (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT NOT NULL,
      keyword         TEXT NOT NULL,
      ratio           REAL NOT NULL,
      collected_at    TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, keyword)
    );
    CREATE INDEX IF NOT EXISTS idx_search_trend_keyword_date
      ON daily_search_trend(keyword, date);
  `);
  db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('datalab_client_id', '')",
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('datalab_client_secret', '')",
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO job_schedule (job_name, cron_expression, enabled, description)
     VALUES ('fetchTrends', '0 8 * * *', 0, '매일 08:00 - 네이버 DataLab 검색 트렌드 수집')`,
  ).run();
  console.log("  ✓ daily_search_trend + DataLab 키 자리 + fetchTrends 스케줄 시드");

  // 14. AI 제공자 토글 + OpenAI 키 자리
  db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_provider', '')",
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('openai_api_key', '')",
  ).run();
  console.log("  ✓ ai_provider + openai_api_key 자리 추가");

  // 15. 자동 포스팅 초안 (M6)
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      blog_id         INTEGER NOT NULL REFERENCES blogs(id),
      topic           TEXT NOT NULL,
      tone            TEXT NOT NULL,             -- informative|guide|review|casual
      length          TEXT NOT NULL,             -- short|medium|long
      keywords        TEXT,                       -- JSON array
      title           TEXT,
      body            TEXT,
      ai_provider     TEXT,                       -- claude|openai|fallback
      status          TEXT NOT NULL DEFAULT 'draft',  -- draft|edited|published
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
      published_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_blog_status
      ON drafts(blog_id, status, created_at DESC);
  `);
  console.log("  ✓ drafts 테이블 생성");

  // 16. 법령 라이브러리 (M7) — 자주 쓰는 법령 등록 → 글 작성 시 키워드 매칭으로 자동 참조
  db.exec(`
    CREATE TABLE IF NOT EXISTS legal_library (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      category        TEXT,
      tags            TEXT,                            -- JSON array, 매칭 키워드
      content         TEXT NOT NULL,
      source_url      TEXT,
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_legal_library_enabled
      ON legal_library(enabled);
  `);
  console.log("  ✓ legal_library 테이블 생성 (M7)");
})();

console.log("✅ 마이그레이션 완료");
console.log("   blogs:", db.prepare("SELECT COUNT(*) c FROM blogs").get());
console.log(
  "   neighbor_candidates:",
  db.prepare("SELECT COUNT(*) c FROM neighbor_candidates").get(),
);
db.close();
