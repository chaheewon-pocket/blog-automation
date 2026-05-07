/**
 * 저장된 세션이 실제 로그인 상태인지 검증.
 * 사용법: npm run verify -- <naver_id>
 *
 * 헤드풀 브라우저로 본인 블로그를 열어 로그인 indicator를 확인하고,
 * 사용자가 눈으로도 직접 볼 수 있게 10초간 띄워둔 뒤 닫는다.
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

async function main() {
  const naverId = process.argv[2];
  if (!naverId) {
    console.error("❌ 사용법: npm run verify -- <naver_id>");
    process.exit(1);
  }

  const db = new Database(path.join(process.cwd(), "data", "blog.sqlite"));
  const blog = db
    .prepare("SELECT id, alias FROM blogs WHERE naver_id = ?")
    .get(naverId) as { id: number; alias: string } | undefined;

  if (!blog) {
    console.error(`❌ 블로그 못 찾음: ${naverId}`);
    db.close();
    process.exit(1);
  }

  const sessionPath = path.join(
    process.cwd(),
    "data",
    "sessions",
    `${naverId}.json`,
  );
  if (!fs.existsSync(sessionPath)) {
    console.error(`❌ 세션 파일 없음: ${sessionPath}`);
    console.error("   먼저 `npm run login -- " + naverId + "` 실행해줘.");
    db.close();
    process.exit(1);
  }

  const stat = fs.statSync(sessionPath);
  console.log(`📂 세션 파일: ${sessionPath}`);
  console.log(`   크기: ${stat.size}B, 저장: ${stat.mtime.toLocaleString("ko-KR")}\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    storageState: sessionPath,
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();

  // 1. 네이버 메인에서 로그인 indicator 확인
  console.log("1️⃣  네이버 메인에서 로그인 상태 확인 중...");
  await page.goto("https://www.naver.com", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const mainIndicators = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasLogout: text.includes("로그아웃") || text.includes("LOGOUT"),
      hasMyArea: Boolean(
        document.querySelector("[class*='MyView']") ||
          document.querySelector("[class*='gnb_my']"),
      ),
      title: document.title,
    };
  });
  console.log("   ", mainIndicators);

  // 2. 로그인 시에만 접근 가능한 페이지(내 정보)로 검증
  console.log("\n2️⃣  로그인 필수 페이지(내 정보) 접근 시도...");
  try {
    await page.goto("https://nid.naver.com/user2/help/myInfo.naver?lang=ko_KR", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    const myInfoIndicators = await page.evaluate(() => {
      return {
        url: location.href,
        title: document.title,
        redirectedToLogin: location.href.includes("nidlogin.login"),
        hasMyInfo:
          document.body.innerText.includes("내 정보") ||
          document.body.innerText.includes("회원정보") ||
          Boolean(document.querySelector("[class*='member'], [class*='info']")),
      };
    });
    console.log("   ", myInfoIndicators);

    if (myInfoIndicators.redirectedToLogin) {
      console.log("\n❌ 세션 만료/실패 — 로그인 페이지로 리디렉트됐어.");
      console.log("   `cmd /c \"npm run login -- " + naverId + "\"` 다시 실행해줘.");
    } else {
      console.log("\n✅ 세션 유효! 로그인 필수 페이지 정상 접근.");
    }
  } catch (err) {
    console.log("   접근 실패:", err);
  }

  // 3. 추가로 본인 블로그 글쓰기 페이지로 더블체크
  console.log("\n3️⃣  본인 블로그 글쓰기 페이지 접근 (보너스 체크)...");
  try {
    await page.goto(`https://blog.naver.com/${naverId}?Redirect=Write`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    const writePage = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      redirectedToLogin: location.href.includes("nidlogin.login"),
    }));
    console.log("   ", writePage);
  } catch (err) {
    console.log("   접근 실패:", err);
  }

  console.log("\n👀 브라우저 창 12초간 띄워둘게. 직접 확인해줘.");
  await page.waitForTimeout(12000);

  await browser.close();
  db.close();
}

main().catch((err) => {
  console.error("❌ 검증 중 오류:", err);
  process.exit(1);
});
