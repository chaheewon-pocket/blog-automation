/**
 * 댓글 후보 글 수집 + AI 초안 생성.
 * 사용법: npm run find-comments -- <naver_id>
 */
import path from "path";
import Database from "better-sqlite3";
import { collectCommentCandidates } from "../src/lib/scrapers/commentCandidates";

async function main() {
  const naverId = process.argv[2];
  if (!naverId) {
    console.error("❌ 사용법: npm run find-comments -- <naver_id>");
    process.exit(1);
  }

  const db = new Database(path.join(process.cwd(), "data", "blog.sqlite"));
  const blog = db
    .prepare("SELECT id, alias FROM blogs WHERE naver_id = ?")
    .get(naverId) as { id: number; alias: string } | undefined;
  if (!blog) {
    console.error(`❌ 블로그 없음: ${naverId}`);
    process.exit(1);
  }

  console.log(`💬 ${blog.alias} 댓글 후보 + AI 초안 수집\n`);
  const r = await collectCommentCandidates(blog.id, naverId, {
    perKeyword: 5,
    betweenMs: 4000,
  });

  console.log(`\n✅ 결과:`);
  console.log(`   - 키워드 시도: ${r.keywordsTried}건`);
  console.log(`   - 글 발견: ${r.postsFound}건`);
  console.log(`   - 신규 후보: ${r.postsAdded}건`);
  console.log(`   - AI 초안: ${r.draftsAi}건`);
  console.log(`   - Fallback 초안: ${r.draftsFallback}건`);
  if (r.errors.length) {
    console.log(`\n⚠️  오류:`);
    r.errors.forEach((e) => console.log("   - " + e));
  }

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 수집 중 오류:", err);
  process.exit(1);
});
