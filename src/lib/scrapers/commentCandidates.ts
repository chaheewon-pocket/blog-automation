import { openContext } from "../playwright/session";
import { getDb } from "../db";
import { generateCommentDraft } from "../ai/commentDrafter";

type FoundPost = {
  url: string;
  title: string;
  snippet: string;
  bloggerId: string;
  logNo: string;
};

/**
 * 활성화된 모니터링 키워드로 네이버 블로그 검색 →
 * "글 단위" 후보를 수집하고 각 글마다 AI 댓글 초안을 생성해 DB 저장.
 *
 * 본인 글 / 이미 후보로 등록된 글은 자동 제외.
 * Claude API key 없으면 fallback 템플릿 사용.
 */
export async function collectCommentCandidates(
  blogId: number,
  ownerNaverId: string,
  options: {
    perKeyword?: number;
    betweenMs?: number;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<{
  keywordsTried: number;
  postsFound: number;
  postsAdded: number;
  draftsAi: number;
  draftsFallback: number;
  errors: string[];
}> {
  const perKeyword = options.perKeyword ?? 5;
  const betweenMs = options.betweenMs ?? 4000;
  const log = options.onProgress ?? ((m) => console.log("    " + m));

  const db = getDb();
  const keywords = db
    .prepare("SELECT keyword FROM monitor_keywords WHERE enabled = 1")
    .all() as { keyword: string }[];

  if (keywords.length === 0) {
    return {
      keywordsTried: 0,
      postsFound: 0,
      postsAdded: 0,
      draftsAi: 0,
      draftsFallback: 0,
      errors: ["활성 키워드 없음"],
    };
  }

  const apiKeyRow = db
    .prepare("SELECT value FROM settings WHERE key = 'claude_api_key'")
    .get() as { value: string } | undefined;
  const apiKey = (apiKeyRow?.value ?? "").trim();
  log(`Claude API: ${apiKey ? "🟢 사용" : "⚪ 미설정 (fallback 템플릿)"}`);

  const existing = new Set(
    (
      db
        .prepare(
          "SELECT source_url FROM comment_candidates WHERE from_blog_id = ?",
        )
        .all(blogId) as { source_url: string }[]
    ).map((r) => r.source_url),
  );

  const insert = db.prepare(`
    INSERT OR IGNORE INTO comment_candidates
      (from_blog_id, source_url, source_title, source_keyword, draft_comment, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  const { browser, context } = await openContext({ blogId, headless: true });
  const page = await context.newPage();

  let postsFound = 0;
  let postsAdded = 0;
  let draftsAi = 0;
  let draftsFallback = 0;
  const errors: string[] = [];

  try {
    for (let i = 0; i < keywords.length; i++) {
      const { keyword } = keywords[i];
      log(`[${i + 1}/${keywords.length}] "${keyword}" 검색...`);

      const url = `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(keyword)}`;

      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await page.waitForTimeout(2500);

        const results = await page.evaluate((max: number) => {
          const links = Array.from(
            document.querySelectorAll('a[href*="blog.naver.com"]'),
          ) as HTMLAnchorElement[];

          const out: Array<{
            url: string;
            title: string;
            snippet: string;
            bloggerId: string;
            logNo: string;
          }> = [];
          const seen = new Set<string>();

          for (const link of links) {
            // 글 단위 URL 패턴 (logNo 포함)
            const m = link.href.match(
              /blog\.naver\.com\/([^/?#]+)\/(\d{8,})/,
            );
            if (!m) continue;
            const bloggerId = m[1];
            const logNo = m[2];
            if (bloggerId.includes(".naver")) continue;

            const fullUrl = `https://blog.naver.com/${bloggerId}/${logNo}`;
            if (seen.has(fullUrl)) continue;
            seen.add(fullUrl);

            const card = link.closest(
              'li, article, div[class*="bx"], div[class*="item"]',
            );
            const cardText = ((card ?? link).textContent ?? "")
              .trim()
              .replace(/\s+/g, " ");

            out.push({
              url: fullUrl,
              title: cardText.slice(0, 80) || link.textContent?.trim() || "(제목 없음)",
              snippet: cardText.slice(80, 380),
              bloggerId,
              logNo,
            });
            if (out.length >= max) break;
          }
          return out;
        }, perKeyword);

        // 본인 글/중복 필터
        const filtered = results.filter(
          (r: FoundPost) =>
            r.bloggerId !== ownerNaverId && !existing.has(r.url),
        );

        postsFound += results.length;
        log(`  → 발견 ${results.length}건 / 신규 ${filtered.length}건`);

        // 신규 후보 각각에 대해 AI 초안 생성
        for (const r of filtered) {
          const draftResult = await generateCommentDraft(
            {
              postTitle: r.title,
              postSnippet: r.snippet,
              keyword,
            },
            apiKey,
          );
          const ins = insert.run(
            blogId,
            r.url,
            r.title,
            keyword,
            draftResult.draft,
          );
          if (ins.changes > 0) {
            postsAdded++;
            existing.add(r.url);
            if (draftResult.usedAi) draftsAi++;
            else draftsFallback++;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${keyword}: ${msg}`);
        log(`  ✗ 오류: ${msg}`);
      }

      if (i < keywords.length - 1) await page.waitForTimeout(betweenMs);
    }
  } finally {
    await browser.close();
  }

  return {
    keywordsTried: keywords.length,
    postsFound,
    postsAdded,
    draftsAi,
    draftsFallback,
    errors,
  };
}
