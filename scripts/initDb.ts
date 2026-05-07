import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "blog.sqlite");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    log_no          TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    published_at    TEXT NOT NULL,
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS post_stats (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id         INTEGER REFERENCES posts(id),
    collected_at    TEXT NOT NULL,
    views           INTEGER NOT NULL DEFAULT 0,
    visitors        INTEGER NOT NULL DEFAULT 0,
    UNIQUE(post_id, collected_at)
  );

  CREATE TABLE IF NOT EXISTS keyword_inflows (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id         INTEGER REFERENCES posts(id),
    collected_at    TEXT NOT NULL,
    keyword         TEXT NOT NULL,
    count           INTEGER NOT NULL,
    UNIQUE(post_id, collected_at, keyword)
  );

  CREATE TABLE IF NOT EXISTS referrers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id         INTEGER REFERENCES posts(id),
    collected_at    TEXT NOT NULL,
    source          TEXT NOT NULL,
    count           INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comment_candidates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url      TEXT UNIQUE NOT NULL,
    source_title    TEXT NOT NULL,
    source_keyword  TEXT NOT NULL,
    draft_comment   TEXT,
    status          TEXT DEFAULT 'pending',
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    posted_at       TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS monitor_keywords (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword         TEXT UNIQUE NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const seedKeywords = [
  "법정의무교육",
  "의료기관 인증교육",
  "병원 교육",
  "요양원 교육",
  "급여제공 지침교육",
  "산업안전보건교육",
];

const insertKw = db.prepare(
  "INSERT OR IGNORE INTO monitor_keywords (keyword) VALUES (?)",
);
for (const kw of seedKeywords) insertKw.run(kw);

db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
).run("blog_url", "https://blog.naver.com/pocketclass1212");

console.log(`✅ DB 초기화 완료: ${dbPath}`);
console.log(`   - 7 tables created`);
console.log(`   - ${seedKeywords.length} seed keywords inserted`);
db.close();
