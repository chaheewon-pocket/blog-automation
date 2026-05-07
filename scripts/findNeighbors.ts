/**
 * 모니터링 키워드로 서로이웃 후보 블로그 수집.
 * 사용법: npm run find-neighbors -- <naver_id>
 */
import path from "path";
import Database from "better-sqlite3";
import { collectNeighborCandidates } from "../src/lib/scrapers/neighborCandidates";

async function main() {
  const naverId = process.argv[2];
  if (!naverId) {
    console.error("❌ 사용법: npm run find-neighbors -- <naver_id>");
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

  console.log(`🔍 ${blog.alias} 서로이웃 후보 수집 시작\n`);
  const r = await collectNeighborCandidates(blog.id, naverId, {
    perKeyword: 10,
    betweenMs: 4000,
  });

  console.log(`\n✅ 결과:`);
  console.log(`   - 키워드 시도: ${r.keywordsTried}건`);
  console.log(`   - 블로그 발견: ${r.blogsFound}건`);
  console.log(`   - 신규 후보 등록: ${r.blogsAdded}건`);

  if (r.samples.length) {
    console.log("\n📋 디버그 샘플:");
    r.samples.forEach((s) => console.log("   " + s));
  }

  if (r.errors.length) {
    console.log("\n⚠️  오류:");
    r.errors.forEach((e) => console.log("   - " + e));
  }

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 수집 중 오류:", err);
  process.exit(1);
});
