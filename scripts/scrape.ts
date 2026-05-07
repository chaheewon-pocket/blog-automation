/**
 * 블로그 통계 수집 CLI.
 * 사용법:
 *   npm run scrape -- <naver_id>           # 모든 단계
 *   npm run scrape -- <naver_id> --posts   # RSS만
 *   npm run scrape -- <naver_id> --views   # 조회수만
 */
import path from "path";
import Database from "better-sqlite3";
import {
  scrapeDailyRank,
  scrapePostList,
  scrapePostViews,
  scrapeReferrers,
} from "../src/lib/scrapers/blogStats";

async function main() {
  const naverId = process.argv[2];
  const mode = process.argv[3] ?? "--all";

  if (!naverId || naverId.startsWith("--")) {
    console.error("❌ 사용법: npm run scrape -- <naver_id> [--posts|--views|--all]");
    process.exit(1);
  }

  const db = new Database(path.join(process.cwd(), "data", "blog.sqlite"));
  const blog = db
    .prepare("SELECT id, alias FROM blogs WHERE naver_id = ?")
    .get(naverId) as { id: number; alias: string } | undefined;

  if (!blog) {
    console.error(`❌ 블로그 못 찾음: ${naverId}`);
    process.exit(1);
  }

  console.log(`📊 ${blog.alias} (${naverId}) 수집 시작\n`);

  if (mode === "--posts" || mode === "--all") {
    console.log("1️⃣  RSS로 포스트 목록 수집...");
    try {
      const r = await scrapePostList(blog.id, naverId);
      console.log(`   ✅ 수집 ${r.collected}건 / 신규·갱신 ${r.inserted}건\n`);
    } catch (err) {
      console.error("   ❌ 실패:", err);
    }
  }

  if (mode === "--rank" || mode === "--all") {
    console.log("2️⃣  일간 조회수 순위 (blog.stat API)...");
    try {
      const r = await scrapeDailyRank(blog.id, naverId);
      console.log(
        `   ✅ ${r.totalRows}건 처리 / 통계 갱신 ${r.statsUpdated} / 신규 포스트 ${r.postsAdded}\n`,
      );
    } catch (err) {
      console.error("   ❌ 실패:", err);
    }
  }

  if (mode === "--referer" || mode === "--all") {
    console.log("3️⃣  유입경로 + 검색 키워드 (blog.stat API)...");
    try {
      const r = await scrapeReferrers(blog.id, naverId);
      console.log(
        `   ✅ ${r.date} 기준 / 유입경로 ${r.referrers}건 / 키워드 ${r.keywords}건\n`,
      );
    } catch (err) {
      console.error("   ❌ 실패:", err);
    }
  }

  // 레거시: 페이지 방문 방식 (백업용, 보통 안 씀)
  if (mode === "--views" || mode === "--debug") {
    const headful = process.argv.includes("--headful") || mode === "--debug";
    const limit = mode === "--debug" ? 3 : 20;
    console.log(
      `📍 [레거시] 페이지 방문 방식 (${headful ? "headful" : "headless"}, ${limit}건)...`,
    );
    try {
      const r = await scrapePostViews(blog.id, naverId, { limit, headful });
      console.log(`   방문 ${r.visited}건 / 갱신 ${r.updated}건`);
      if (r.samples.length) {
        console.log("\n📋 디버그 샘플:");
        r.samples.forEach((s) => console.log("   " + s));
      }
    } catch (err) {
      console.error("   ❌ 실패:", err);
    }
  }

  console.log("✅ 완료");
  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 스크래핑 중 오류:", err);
  process.exit(1);
});
