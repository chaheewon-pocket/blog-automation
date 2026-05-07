import { getDb } from "../db";
import { openContext } from "../playwright/session";

// ───────────────────────────────────── RSS-based 포스트 목록 ─────

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
};

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  for (const match of xml.matchAll(itemRegex)) {
    const block = match[1];
    const pick = (tag: string) => {
      const m = new RegExp(
        `<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
      ).exec(block);
      return (m?.[1] ?? "").trim();
    };
    items.push({
      title: pick("title"),
      link: pick("link"),
      pubDate: pick("pubDate"),
      description: pick("description"),
    });
  }
  return items;
}

function extractLogNo(url: string): string | null {
  const m = url.match(/\/(\d{8,})/);
  return m ? m[1] : null;
}

function isoFromRss(rssDate: string): string {
  const d = new Date(rssDate);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * RSS 피드로 포스트 목록을 수집해 posts 테이블에 upsert.
 * RSS는 보통 최근 50건 정도 노출. 로그인 불필요.
 */
export async function scrapePostList(
  blogId: number,
  naverId: string,
): Promise<{ collected: number; inserted: number }> {
  const rssUrl = `https://rss.blog.naver.com/${naverId}.xml`;
  const res = await fetch(rssUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`RSS 응답 실패: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const items = parseRss(xml);

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO posts (blog_id, log_no, title, url, published_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(log_no) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      published_at = excluded.published_at
  `);

  let inserted = 0;
  const tx = db.transaction((rows: RssItem[]) => {
    for (const item of rows) {
      const logNo = extractLogNo(item.link);
      if (!logNo) continue;
      const result = upsert.run(
        blogId,
        logNo,
        item.title,
        item.link,
        isoFromRss(item.pubDate),
      );
      if (result.changes > 0) inserted++;
    }
  });
  tx(items);

  return { collected: items.length, inserted };
}

// ───────────────────────────────────── 포스트별 조회수 (Playwright) ─────

/**
 * 각 포스트 페이지를 방문해 조회수 카운터를 추출하고 post_stats에 저장.
 * 로그인 세션 사용 (본인 글에서 더 안정적인 셀렉터 노출).
 */
export async function scrapePostViews(
  blogId: number,
  naverId: string,
  options: {
    limit?: number;
    betweenMs?: number;
    headful?: boolean;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<{ visited: number; updated: number; samples: string[] }> {
  const limit = options.limit ?? 20;
  const betweenMs = options.betweenMs ?? 2500;
  const log = options.onProgress ?? ((m) => console.log("    " + m));

  const db = getDb();
  const posts = db
    .prepare(
      `SELECT id, log_no, url FROM posts WHERE blog_id = ?
       ORDER BY published_at DESC LIMIT ?`,
    )
    .all(blogId, limit) as { id: number; log_no: string; url: string }[];

  log(`대상 ${posts.length}건`);
  if (posts.length === 0) return { visited: 0, updated: 0, samples: [] };

  log("Playwright 브라우저 시작 중...");
  const { browser, context } = await openContext({
    blogId,
    headless: !options.headful,
  });
  const page = await context.newPage();
  log(`✓ 브라우저 시작 완료 (${options.headful ? "headful" : "headless"})`);

  const insertStat = db.prepare(`
    INSERT OR REPLACE INTO post_stats (post_id, collected_at, views, visitors)
    VALUES (?, ?, ?, ?)
  `);

  const collectedAt = new Date().toISOString();
  let updated = 0;
  const samples: string[] = [];

  try {
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const mobileUrl = `https://m.blog.naver.com/${naverId}/${post.log_no}`;
      log(`[${i + 1}/${posts.length}] ${post.log_no} 방문...`);

      try {
        await page.goto(mobileUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await page.waitForTimeout(1500);

        // 통계 버튼 클릭 시도 (여러 셀렉터 시도)
        const statBtnCandidates = [
          'button:has-text("통계")',
          'a:has-text("통계")',
          '[aria-label*="통계"]',
          '.btn_stat',
          '.area_statistics button',
        ];
        let clicked = false;
        for (const sel of statBtnCandidates) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1000 })) {
              await btn.click();
              clicked = true;
              await page.waitForTimeout(1500);
              break;
            }
          } catch {}
        }

        const result = await page.evaluate(() => {
          const pageText = document.body.innerText;
          const modalEl = document.querySelector(
            '[role="dialog"], .layer_view, .area_statistics, .post_stat, .pop_stat, .layer_stat',
          );
          const modalText = modalEl?.textContent ?? "";
          const allText = modalText + "\n" + pageText;

          const patterns = [
            /조회수\s*[:：]?\s*([\d,]+)/,
            /누적\s*조회\s*([\d,]+)/,
            /조회\s*[:：]?\s*([\d,]+)/,
          ];
          const visitorPatterns = [
            /방문자\s*[:：]?\s*([\d,]+)/,
            /오늘\s*방문\s*([\d,]+)/,
          ];

          let views: number | null = null;
          for (const re of patterns) {
            const m = allText.match(re);
            if (m) {
              views = Number(m[1].replace(/,/g, ""));
              break;
            }
          }
          let visitors: number | null = null;
          for (const re of visitorPatterns) {
            const m = allText.match(re);
            if (m) {
              visitors = Number(m[1].replace(/,/g, ""));
              break;
            }
          }
          return {
            views,
            visitors,
            pageSnippet: pageText.slice(0, 400).replace(/\s+/g, " "),
            modalSnippet: modalText.slice(0, 400).replace(/\s+/g, " "),
            url: location.href,
          };
        });

        if (i === 0) {
          samples.push(
            `[디버그] URL: ${result.url}\n` +
              `   통계버튼 클릭: ${clicked ? "성공" : "실패"}\n` +
              `   모달 본문(앞 400자): ${result.modalSnippet || "(빈 값)"}\n` +
              `   페이지 본문(앞 400자): ${result.pageSnippet}`,
          );
        }

        if (result.views !== null) {
          insertStat.run(
            post.id,
            collectedAt,
            result.views,
            result.visitors ?? 0,
          );
          updated++;
          log(`  ✓ 조회수 ${result.views} / 방문자 ${result.visitors ?? 0}`);
        } else {
          log(`  ✗ 조회수 텍스트 못 찾음 (통계버튼 ${clicked ? "클릭됨" : "미클릭"})`);
        }
      } catch (err) {
        log(`  ! 오류: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (i < posts.length - 1) await page.waitForTimeout(betweenMs);
    }
  } finally {
    await browser.close();
  }

  return { visited: posts.length, updated, samples };
}

// ───────────────────────────────────── 일간 조회수 순위 (API 직접 호출) ─────

type RankRows = {
  date: string[];
  cv: number[];
  rank: number[];
  title: string[];
  uri: string[];
  createDate: string[];
};

function todayKr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * blog.stat.naver.com 의 일간 게시물 조회수 순위 API 직접 호출.
 * 페이지 렌더링 없이 JSON 응답만 받아 빠르고 안정적.
 *
 * 신규 발견 글이면 posts 테이블에 자동 추가, 기존 글이면 post_stats에 일별 스냅샷 적재.
 */
export async function scrapeDailyRank(
  blogId: number,
  naverId: string,
  options: { date?: string } = {},
): Promise<{ totalRows: number; statsUpdated: number; postsAdded: number }> {
  const date = options.date ?? todayKr();
  const apiUrl =
    `https://blog.stat.naver.com/api/blog/daily/rankDetail` +
    `?timeDimension=DATE&startDate=${date}&exclude=&_=${Date.now()}`;
  const referer = `https://blog.stat.naver.com/blog/rankDetail/article?date=${date}&timeDimension=DATE`;

  const { browser, context } = await openContext({ blogId, headless: true });
  try {
    const response = await context.request.get(apiUrl, {
      headers: {
        Referer: referer,
        Accept: "application/json",
      },
      timeout: 15000,
    });

    if (!response.ok()) {
      throw new Error(
        `통계 API 실패: ${response.status()} ${response.statusText()}`,
      );
    }
    const json = (await response.json()) as {
      statusCode: number;
      result?: {
        statDataList?: Array<{
          dataId: string;
          data: { rows?: RankRows };
        }>;
      };
    };

    const rankBlock = json.result?.statDataList?.find(
      (d) => d.dataId === "rankCv",
    );
    const rows = rankBlock?.data?.rows;
    if (!rows || !rows.cv) {
      return { totalRows: 0, statsUpdated: 0, postsAdded: 0 };
    }

    const db = getDb();
    const findPost = db.prepare(
      "SELECT id FROM posts WHERE blog_id = ? AND log_no = ?",
    );
    const insertPost = db.prepare(`
      INSERT OR IGNORE INTO posts (blog_id, log_no, title, url, published_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const upsertStat = db.prepare(`
      INSERT OR REPLACE INTO post_stats (post_id, collected_at, views, visitors)
      VALUES (?, ?, ?, ?)
    `);

    let statsUpdated = 0;
    let postsAdded = 0;
    const collectedAt = new Date().toISOString();
    const total = rows.cv.length;

    const tx = db.transaction(() => {
      for (let i = 0; i < total; i++) {
        const uri = rows.uri[i];
        const m = uri.match(/\/(\d{8,})/);
        if (!m) continue;
        const logNo = m[1];

        let post = findPost.get(blogId, logNo) as { id: number } | undefined;
        if (!post) {
          // RSS에 없던 옛날 글일 수도 — 통계 API의 메타로 backfill
          const url = uri.replace(/^http:\/\//, "https://");
          const createDateIso = parseCreateDate(rows.createDate[i]);
          insertPost.run(blogId, logNo, rows.title[i], url, createDateIso);
          postsAdded++;
          post = findPost.get(blogId, logNo) as { id: number };
        }

        upsertStat.run(post.id, collectedAt, rows.cv[i], 0);
        statsUpdated++;
      }
    });
    tx();

    return { totalRows: total, statsUpdated, postsAdded };
  } finally {
    await browser.close();
  }
}

function parseCreateDate(s: string): string {
  // "2025.02.10. 20:58" → ISO
  const m = s.match(/(\d{4})\.(\d{2})\.(\d{2})\.\s*(\d{2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h, mi] = m;
  return new Date(
    `${y}-${mo}-${d}T${h}:${mi}:00+09:00`,
  ).toISOString();
}

// ───────────────────────────────────── 일별 유입경로 + 검색 키워드 (API) ─────

type RefererTotalRows = {
  date: string[];
  referrerDomain: string[];
  cv: number[];
  cv_p: number[];
};

type RefererDetailRows = {
  date: string[];
  searchQuery: string[];
  referrerUrl: string[];
  cv: number[];
  cv_p: number[];
};

function yesterdayKr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

/**
 * blog.stat.naver.com 의 유입경로 + 검색 키워드 API 호출.
 * 일별 합계 데이터 (블로그 전체).
 */
export async function scrapeReferrers(
  blogId: number,
  naverId: string,
  options: { date?: string } = {},
): Promise<{
  date: string;
  referrers: number;
  keywords: number;
}> {
  const date = options.date ?? yesterdayKr();
  const apiUrl =
    `https://blog.stat.naver.com/api/blog/user/referer/total` +
    `?timeDimension=DATE&startDate=${date}&exclude=&_=${Date.now()}`;
  const referer = `https://blog.stat.naver.com/blog/user/referer/total?blogId=${naverId}`;

  const { browser, context } = await openContext({ blogId, headless: true });
  try {
    const response = await context.request.get(apiUrl, {
      headers: { Referer: referer, Accept: "application/json" },
      timeout: 15000,
    });
    if (!response.ok()) {
      throw new Error(
        `유입통계 API 실패: ${response.status()} ${response.statusText()}`,
      );
    }

    const json = (await response.json()) as {
      result?: {
        statDataList?: Array<{
          dataId: string;
          data: {
            rows?: RefererTotalRows | RefererDetailRows;
          };
        }>;
      };
    };

    const total = json.result?.statDataList?.find(
      (d) => d.dataId === "refererTotal",
    )?.data.rows as RefererTotalRows | undefined;
    const detail = json.result?.statDataList?.find(
      (d) => d.dataId === "refererDetail",
    )?.data.rows as RefererDetailRows | undefined;

    const db = getDb();
    const insertReferrer = db.prepare(`
      INSERT OR REPLACE INTO daily_referrers
        (blog_id, date, referrer_domain, count, percent)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertKeyword = db.prepare(`
      INSERT OR REPLACE INTO daily_keywords
        (blog_id, date, keyword, count, percent, search_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let referrerCount = 0;
    let keywordCount = 0;

    db.transaction(() => {
      if (total?.cv) {
        for (let i = 0; i < total.cv.length; i++) {
          insertReferrer.run(
            blogId,
            date,
            total.referrerDomain[i],
            total.cv[i],
            total.cv_p[i],
          );
          referrerCount++;
        }
      }
      if (detail?.cv) {
        for (let i = 0; i < detail.cv.length; i++) {
          insertKeyword.run(
            blogId,
            date,
            detail.searchQuery[i],
            detail.cv[i],
            detail.cv_p[i],
            detail.referrerUrl[i],
          );
          keywordCount++;
        }
      }
    })();

    return { date, referrers: referrerCount, keywords: keywordCount };
  } finally {
    await browser.close();
  }
}

// ───────────────────────────────────── 통합 ─────

export async function scrapeAll(
  blogId: number,
  naverId: string,
): Promise<{
  posts: { collected: number; inserted: number };
  rank: { totalRows: number; statsUpdated: number; postsAdded: number };
  referrers: { date: string; referrers: number; keywords: number };
}> {
  const posts = await scrapePostList(blogId, naverId);
  const rank = await scrapeDailyRank(blogId, naverId);
  const referrers = await scrapeReferrers(blogId, naverId);
  return { posts, rank, referrers };
}
