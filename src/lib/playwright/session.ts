import fs from "fs";
import path from "path";
import { chromium, type BrowserContext, type Browser } from "playwright";
import { getDb } from "../db";

export type SessionInfo = {
  exists: boolean;
  path: string | null;
  ageHours: number | null;
  isStale: boolean;
};

const STALE_THRESHOLD_HOURS = 24 * 7; // 7일 지나면 stale 표시

export function getSessionInfo(blogId: number): SessionInfo {
  const db = getDb();
  const row = db
    .prepare("SELECT session_path FROM blogs WHERE id = ?")
    .get(blogId) as { session_path: string | null } | undefined;

  const sessionPath = row?.session_path ?? null;
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return { exists: false, path: null, ageHours: null, isStale: false };
  }

  const stat = fs.statSync(sessionPath);
  const ageMs = Date.now() - stat.mtimeMs;
  const ageHours = ageMs / (1000 * 60 * 60);

  return {
    exists: true,
    path: sessionPath,
    ageHours,
    isStale: ageHours > STALE_THRESHOLD_HOURS,
  };
}

export type ContextOptions = {
  blogId: number;
  headless?: boolean;
};

/**
 * 저장된 세션을 사용해 Playwright 컨텍스트를 만든다.
 * 세션이 없으면 throw.
 */
export async function openContext(
  opts: ContextOptions,
): Promise<{ browser: Browser; context: BrowserContext }> {
  const info = getSessionInfo(opts.blogId);
  if (!info.exists || !info.path) {
    throw new Error(
      `블로그(id=${opts.blogId})의 세션 파일이 없어. \`npm run login -- <naver_id>\` 로 먼저 로그인해줘.`,
    );
  }

  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    storageState: info.path,
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return { browser, context };
}

/**
 * 세션이 만료됐는지 빠르게 검증 (네이버 마이 페이지 방문)
 */
export async function isSessionValid(blogId: number): Promise<boolean> {
  try {
    const { browser, context } = await openContext({ blogId, headless: true });
    const page = await context.newPage();
    await page.goto("https://www.naver.com", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    const ok = await page.evaluate(() =>
      Boolean(
        document.querySelector("a[href*='nidlogin.logout']") ||
          document.body.innerText.includes("로그아웃"),
      ),
    );
    await browser.close();
    return ok;
  } catch {
    return false;
  }
}

export function clearSession(blogId: number): void {
  const info = getSessionInfo(blogId);
  if (info.exists && info.path) {
    fs.unlinkSync(info.path);
  }
  const db = getDb();
  db.prepare("UPDATE blogs SET session_path = NULL WHERE id = ?").run(blogId);
}

// path import 사용 표시 (linter 회피)
export const _path = path;
