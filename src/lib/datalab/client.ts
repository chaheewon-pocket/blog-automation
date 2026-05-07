import { getDb } from "../db";

export type TimeUnit = "date" | "week" | "month";

export type TrendPoint = { period: string; ratio: number };
export type TrendResult = {
  title: string;
  keywords: string[];
  data: TrendPoint[];
};
export type DataLabResponse = {
  startDate: string;
  endDate: string;
  timeUnit: TimeUnit;
  results: TrendResult[];
};

export async function fetchSearchTrend(input: {
  clientId: string;
  clientSecret: string;
  keywords: string[]; // 1~5개. 그룹당 1개씩 자동 변환.
  startDate: string; // YYYY-MM-DD
  endDate: string;
  timeUnit?: TimeUnit;
}): Promise<DataLabResponse> {
  if (input.keywords.length === 0 || input.keywords.length > 5) {
    throw new Error("키워드는 1~5개여야 함");
  }
  const groups = input.keywords.map((k) => ({
    groupName: k,
    keywords: [k],
  }));

  const res = await fetch("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: {
      "X-Naver-Client-Id": input.clientId,
      "X-Naver-Client-Secret": input.clientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: input.startDate,
      endDate: input.endDate,
      timeUnit: input.timeUnit ?? "date",
      keywordGroups: groups,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`DataLab API ${res.status}: ${errBody.slice(0, 200)}`);
  }
  return (await res.json()) as DataLabResponse;
}

/**
 * 활성 모니터링 키워드들에 대해 최근 N일 트렌드를 받아 daily_search_trend에 저장.
 */
export async function fetchAndStoreTrends(
  options: {
    days?: number;
    timeUnit?: TimeUnit;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<{
  keywords: number;
  chunks: number;
  dataPoints: number;
  startDate: string;
  endDate: string;
}> {
  const days = options.days ?? 30;
  const timeUnit = options.timeUnit ?? "date";
  const log = options.onProgress ?? ((m) => console.log("    " + m));

  const db = getDb();
  const settings = db
    .prepare(
      "SELECT key, value FROM settings WHERE key IN ('datalab_client_id', 'datalab_client_secret')",
    )
    .all() as { key: string; value: string }[];

  const clientId =
    settings.find((s) => s.key === "datalab_client_id")?.value?.trim() ?? "";
  const clientSecret =
    settings.find((s) => s.key === "datalab_client_secret")?.value?.trim() ?? "";

  if (!clientId || !clientSecret) {
    throw new Error(
      "DataLab API 키가 미설정. /settings 에서 입력해줘. (Client ID + Secret)",
    );
  }

  const keywords = (
    db
      .prepare("SELECT keyword FROM monitor_keywords WHERE enabled = 1 ORDER BY id")
      .all() as { keyword: string }[]
  ).map((r) => r.keyword);

  if (keywords.length === 0) {
    throw new Error("활성 모니터링 키워드 없음 - /settings에서 추가해줘");
  }

  const today = new Date();
  const start = new Date(today.getTime() - days * 86400000);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  log(`키워드 ${keywords.length}개 / 기간 ${startDate} ~ ${endDate} (${timeUnit})`);

  // 5개 단위 chunk
  const chunks: string[][] = [];
  for (let i = 0; i < keywords.length; i += 5) {
    chunks.push(keywords.slice(i, i + 5));
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO daily_search_trend (date, keyword, ratio, collected_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `);

  let totalPoints = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    log(`[${i + 1}/${chunks.length}] ${chunk.join(", ")} 조회...`);
    const result = await fetchSearchTrend({
      clientId,
      clientSecret,
      keywords: chunk,
      startDate,
      endDate,
      timeUnit,
    });

    db.transaction(() => {
      for (const r of result.results) {
        for (const point of r.data) {
          insert.run(point.period, r.title, point.ratio);
          totalPoints++;
        }
      }
    })();

    log(`  ✓ ${result.results.reduce((s, r) => s + r.data.length, 0)}건 저장`);

    // 다음 chunk 전 짧은 대기 (rate limit 보호)
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return {
    keywords: keywords.length,
    chunks: chunks.length,
    dataPoints: totalPoints,
    startDate,
    endDate,
  };
}
