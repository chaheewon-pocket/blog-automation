import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "blog.sqlite");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

export type Post = {
  id: number;
  log_no: string;
  title: string;
  url: string;
  published_at: string;
};

export type PostStat = {
  post_id: number;
  collected_at: string;
  views: number;
  visitors: number;
};

export type CommentCandidate = {
  id: number;
  source_url: string;
  source_title: string;
  source_keyword: string;
  draft_comment: string | null;
  status: "pending" | "approved" | "posted" | "rejected";
  created_at: string;
};
