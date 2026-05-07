/**
 * 네이버 로그인 → storageState 저장 (블로그별)
 *
 * 사용법:
 *   npm run login -- <naver_id>
 *   예: npm run login -- pocketclass1212
 *
 * 동작:
 *   1. 헤드풀 Chromium 창 띄움
 *   2. 네이버 로그인 페이지로 이동
 *   3. 사용자가 직접 로그인 (2단계 인증 포함)
 *   4. 터미널에서 Enter 누르면 세션 저장
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import readline from "readline";
import Database from "better-sqlite3";

type Blog = {
  id: number;
  alias: string;
  naver_id: string;
  blog_url: string;
};

async function main() {
  const naverId = process.argv[2];
  if (!naverId) {
    console.error("❌ 사용법: npm run login -- <naver_id>");
    console.error("   예: npm run login -- pocketclass1212");
    process.exit(1);
  }

  const db = new Database(path.join(process.cwd(), "data", "blog.sqlite"));
  const blog = db
    .prepare("SELECT id, alias, naver_id, blog_url FROM blogs WHERE naver_id = ?")
    .get(naverId) as Blog | undefined;

  if (!blog) {
    console.error(`❌ 블로그를 찾을 수 없어: ${naverId}`);
    console.error("   먼저 /settings에서 블로그를 추가해줘.");
    db.close();
    process.exit(1);
  }

  const sessionDir = path.join(process.cwd(), "data", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `${naverId}.json`);

  console.log(`\n🌐 ${blog.alias} (${naverId}) 로그인을 시작할게.`);
  console.log("   브라우저 창이 열리면 직접 로그인해줘 (2단계 인증 포함).\n");

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });

  // 자동화 탐지 회피
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  await page.goto("https://nid.naver.com/nidlogin.login");

  console.log("👉 브라우저에서 로그인을 완료한 후, 이 터미널로 돌아와서 Enter를 눌러줘.");
  console.log("   (자동화 탐지로 캡차가 뜰 수 있어. 그땐 직접 풀어줘.)\n");

  await new Promise<void>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("⏎ 로그인 완료 후 Enter: ", () => {
      rl.close();
      resolve();
    });
  });

  // 로그인 검증: 네이버 메인으로 이동해 로그인 상태 확인
  await page.goto("https://www.naver.com", { waitUntil: "domcontentloaded" });

  const isLoggedIn = await page.evaluate(() => {
    // 로그아웃 링크가 보이면 로그인 상태
    return Boolean(
      document.querySelector("a[href*='nidlogin.logout']") ||
        document.querySelector(".MyView-module__link_login___")?.textContent?.includes("로그아웃") ||
        document.body.innerText.includes("로그아웃"),
    );
  });

  if (!isLoggedIn) {
    console.warn("\n⚠️  로그인 상태를 자동 확인 못했어.");
    console.warn("   그래도 세션 저장을 진행할게. 안 되면 다시 실행해줘.");
  } else {
    console.log("\n✅ 로그인 확인 완료!");
  }

  // 세션 저장
  await context.storageState({ path: sessionPath });
  db.prepare("UPDATE blogs SET session_path = ? WHERE id = ?").run(sessionPath, blog.id);

  console.log(`💾 세션 저장: ${sessionPath}`);
  console.log("   다음 스크래핑/자동화부터는 이 세션을 헤드리스로 재사용해.\n");

  await browser.close();
  db.close();
}

main().catch((err) => {
  console.error("❌ 로그인 중 오류:", err);
  process.exit(1);
});
