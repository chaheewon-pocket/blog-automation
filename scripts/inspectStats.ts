/**
 * 네이버 블로그 통계 페이지의 구조와 API 응답을 dump하는 디버그 스크립트.
 *
 * 사용법:
 *   npm run inspect -- <naver_id> "<통계 페이지 URL>"
 *
 * 결과물 (data/inspect/ 폴더):
 *   - screenshot.png : 페이지 전체 스크린샷
 *   - page.html      : 렌더링 후 HTML
 *   - api-responses.json : 캡처된 모든 XHR/fetch 응답 (URL + JSON 또는 첫 1KB 텍스트)
 *   - links.json     : 페이지 내 통계 관련 링크들 (다른 메뉴 탐색용)
 */
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { chromium } from "playwright";

async function main() {
  const naverId = process.argv[2];
  const targetUrl = process.argv[3];
  if (!naverId || !targetUrl) {
    console.error('❌ 사용법: npm run inspect -- <naver_id> "<URL>"');
    process.exit(1);
  }

  const db = new Database(path.join(process.cwd(), "data", "blog.sqlite"));
  const blog = db
    .prepare("SELECT id FROM blogs WHERE naver_id = ?")
    .get(naverId) as { id: number } | undefined;
  if (!blog) {
    console.error(`❌ 블로그 없음: ${naverId}`);
    process.exit(1);
  }

  const sessionPath = path.join(
    process.cwd(),
    "data",
    "sessions",
    `${naverId}.json`,
  );
  if (!fs.existsSync(sessionPath)) {
    console.error("❌ 세션 없음. npm run login 먼저.");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "data", "inspect");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`🔍 통계 페이지 inspect: ${targetUrl}\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    storageState: sessionPath,
    viewport: { width: 1440, height: 1000 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();

  // 모든 응답 캡처 (특히 stat 도메인)
  const apiResponses: Array<{
    url: string;
    status: number;
    contentType: string;
    body: unknown;
  }> = [];

  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] ?? "";
    // 네이버 도메인의 JSON/API 응답만 캡처
    if (!url.includes("naver.com")) return;
    const looksLikeApi =
      url.includes("/api/") ||
      url.includes("stat") ||
      contentType.includes("application/json");
    if (!looksLikeApi) return;
    try {
      let body: unknown;
      if (contentType.includes("json")) {
        body = await response.json();
      } else {
        const text = await response.text();
        body = text.slice(0, 1500);
      }
      apiResponses.push({
        url,
        status: response.status(),
        contentType,
        body,
      });
      console.log(`   📡 ${response.status()} ${url.slice(0, 100)}`);
    } catch {}
  });

  console.log("➡️  페이지 로딩 중...");
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // SPA 렌더링 대기
  console.log("⏳ 네트워크 idle 대기 (최대 12초)...");
  try {
    await page.waitForLoadState("networkidle", { timeout: 12000 });
  } catch {
    console.log("   (idle 안 됨, 계속 진행)");
  }
  await page.waitForTimeout(3000); // 추가 여유

  console.log("\n📸 스크린샷 + HTML 저장 중...");
  await page.screenshot({
    path: path.join(outDir, "screenshot.png"),
    fullPage: true,
  });
  const html = await page.content();
  fs.writeFileSync(path.join(outDir, "page.html"), html, "utf-8");

  // 페이지 내 통계 메뉴 링크들 수집
  const links = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("a, nav button"));
    return all
      .map((el) => ({
        text: (el.textContent ?? "").trim().slice(0, 30),
        href: (el as HTMLAnchorElement).href ?? null,
      }))
      .filter((l) => l.text && (l.href?.includes("stat") || l.text.match(/통계|유입|검색|방문|순위|키워드|조회/)))
      .slice(0, 50);
  });
  fs.writeFileSync(
    path.join(outDir, "links.json"),
    JSON.stringify(links, null, 2),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(outDir, "api-responses.json"),
    JSON.stringify(apiResponses, null, 2),
    "utf-8",
  );

  console.log("\n✅ 완료!");
  console.log(`   📂 ${outDir}`);
  console.log(`      - screenshot.png  (스크린샷)`);
  console.log(`      - page.html       (HTML, ${html.length}자)`);
  console.log(`      - api-responses.json  (${apiResponses.length}건 API 응답)`);
  console.log(`      - links.json      (${links.length}건 링크)`);
  console.log("\n👀 브라우저 창 12초간 띄워둘게. 페이지 직접 확인해줘.");
  await page.waitForTimeout(12000);

  await browser.close();
  db.close();
}

main().catch((err) => {
  console.error("❌ inspect 중 오류:", err);
  process.exit(1);
});
