import { openContext } from "../playwright/session";
import { getDb } from "../db";

type Candidate = {
  url: string;
  title: string;
  bloggerId: string;
};

/**
 * 활성화된 모니터링 키워드로 네이버 통합검색(블로그 탭)을 돌면서
 * 서로이웃 신청 후보 블로그를 수집한다.
 *
 * 주의: 네이버 검색 결과 스크래핑은 회색지대. 키워드 간 인터벌과
 * 일일 검색량 제한을 보수적으로 둔다. 본인 블로그/이미 후보로 등록된
 * 블로그/이미 신청한 블로그는 제외한다.
 */
export async function collectNeighborCandidates(
  blogId: number,
  ownerNaverId: string,
  options: {
    perKeyword?: number;
    betweenMs?: number;
    debug?: boolean;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<{
  keywordsTried: number;
  blogsFound: number;
  blogsAdded: number;
  samples: string[];
  errors: string[];
}> {
  const perKeyword = options.perKeyword ?? 10;
  const betweenMs = options.betweenMs ?? 4000;
  const log = options.onProgress ?? ((m) => console.log("    " + m));

  const db = getDb();
  const keywords = db
    .prepare("SELECT keyword FROM monitor_keywords WHERE enabled = 1")
    .all() as { keyword: string }[];

  if (keywords.length === 0) {
    return {
      keywordsTried: 0,
      blogsFound: 0,
      blogsAdded: 0,
      samples: [],
      errors: ["활성 키워드 없음 - /settings에서 추가해줘"],
    };
  }

  const settings = db
    .prepare("SELECT default_message FROM neighbor_settings WHERE blog_id = ?")
    .get(blogId) as { default_message: string } | undefined;
  const defaultMsg =
    settings?.default_message ??
    "안녕하세요! 블로그 잘 보고 갑니다. 서로이웃 신청드려요 :)";

  // 이미 등록된 target_url + 본인 블로그
  const existing = new Set(
    (
      db
        .prepare(
          "SELECT target_url FROM neighbor_candidates WHERE from_blog_id = ?",
        )
        .all(blogId) as { target_url: string }[]
    ).map((r) => r.target_url),
  );

  const insert = db.prepare(`
    INSERT OR IGNORE INTO neighbor_candidates
      (from_blog_id, target_url, target_alias, target_keyword, request_message, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  const { browser, context } = await openContext({ blogId, headless: true });
  const page = await context.newPage();

  let blogsFound = 0;
  let blogsAdded = 0;
  const samples: string[] = [];
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

        const result = await page.evaluate(
          (max: number) => {
            // 모든 blog.naver.com 링크 수집
            const links = Array.from(
              document.querySelectorAll('a[href*="blog.naver.com"]'),
            ) as HTMLAnchorElement[];

            const out: Array<{
              url: string;
              title: string;
              bloggerId: string;
            }> = [];
            const seen = new Set<string>();

            for (const link of links) {
              const href = link.href;
              const m = href.match(/blog\.naver\.com\/([^/?#]+)/);
              if (!m) continue;
              const bloggerId = m[1];

              // PostView.naver, BlogHome 등 시스템 path 제외
              if (
                bloggerId.includes(".naver") ||
                bloggerId === "PostList" ||
                bloggerId === "BlogHome"
              )
                continue;
              if (seen.has(bloggerId)) continue;
              seen.add(bloggerId);

              // 제목: 가장 가까운 부모/형제에서 텍스트
              const cardEl = link.closest('li, article, div[class*="bx"], div[class*="item"]');
              const title =
                ((cardEl ?? link).textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80) ||
                bloggerId;

              out.push({ url: href, title, bloggerId });
              if (out.length >= max) break;
            }

            return {
              found: out,
              pageTitle: document.title,
              totalLinks: links.length,
              snippet: document.body.innerText.slice(0, 200).replace(/\s+/g, " "),
            };
          },
          perKeyword,
        );

        if (i === 0) {
          samples.push(
            `[디버그] 첫 키워드 "${keyword}":\n` +
              `   페이지: ${result.pageTitle}\n` +
              `   blog.naver.com 링크 수: ${result.totalLinks}\n` +
              `   추출 결과: ${result.found.length}건\n` +
              `   본문 일부: ${result.snippet}`,
          );
        }

        // 본인 블로그/중복/이미 등록된 거 필터
        const filtered = result.found.filter(
          (r: Candidate) =>
            r.bloggerId !== ownerNaverId && !existing.has(r.url),
        );

        blogsFound += filtered.length;

        for (const r of filtered) {
          const msg = `안녕하세요 :) "${keyword}" 검색하다가 들렀어요. ${defaultMsg}`;
          const inserted = insert.run(
            blogId,
            r.url,
            r.title || r.bloggerId,
            keyword,
            msg,
          );
          if (inserted.changes > 0) {
            blogsAdded++;
            existing.add(r.url);
          }
        }

        log(`  → 발견 ${result.found.length}건 / 필터 후 신규 ${filtered.length}건`);
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
    blogsFound,
    blogsAdded,
    samples,
    errors,
  };
}
