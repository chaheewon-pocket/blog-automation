/**
 * 법령 라이브러리 자동 매칭.
 * 입력 키워드와 등록된 법령의 title / tags 를 비교해 매칭되는 법령을
 * AI에 주입할 형태(combinedText)로 합쳐 반환.
 */

import { getDb } from "../db";

type LegalRow = {
  id: number;
  title: string;
  category: string | null;
  tags: string | null;
  content: string;
  source_url: string | null;
  enabled: number;
};

export type MatchedLegal = {
  id: number;
  title: string;
  category: string | null;
};

export type MatchResult = {
  matched: MatchedLegal[];
  combinedText: string;
};

const MAX_LEGALS = 5;
const MAX_CONTENT_PER_LEGAL = 5000;

export function matchLegalsForKeywords(keywords: string[]): MatchResult {
  if (keywords.length === 0) return { matched: [], combinedText: "" };

  const db = getDb();
  const all = db
    .prepare(
      "SELECT id, title, category, tags, content, source_url, enabled FROM legal_library WHERE enabled = 1 ORDER BY id",
    )
    .all() as LegalRow[];

  const lowerKws = keywords
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (lowerKws.length === 0) return { matched: [], combinedText: "" };

  const matched: LegalRow[] = [];
  for (const legal of all) {
    const tags = legal.tags ? safeJsonArray(legal.tags) : [];
    const haystack = [legal.title, ...tags]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const isMatch = lowerKws.some((kw) => haystack.includes(kw));
    if (isMatch) matched.push(legal);
    if (matched.length >= MAX_LEGALS) break;
  }

  if (matched.length === 0) return { matched: [], combinedText: "" };

  const sections = matched.map((legal, i) => {
    const content =
      legal.content.length > MAX_CONTENT_PER_LEGAL
        ? legal.content.slice(0, MAX_CONTENT_PER_LEGAL) + "\n... (이하 생략)"
        : legal.content;
    const sourceLine = legal.source_url ? `\n[출처] ${legal.source_url}` : "";
    return `## 법령 ${i + 1}: ${legal.title}\n${content}${sourceLine}`;
  });

  return {
    matched: matched.map((l) => ({
      id: l.id,
      title: l.title,
      category: l.category,
    })),
    combinedText: sections.join("\n\n---\n\n"),
  };
}

function safeJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
