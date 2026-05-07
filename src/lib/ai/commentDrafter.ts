import { getDb } from "../db";

const SYSTEM_PROMPT = `너는 포켓클래스(pocketclass.co.kr)라는 의료기관/병원/요양원 교육 LMS 회사의 마케팅 담당자야.
검색에서 발견한 다른 사람의 블로그 글에 자연스럽게 댓글을 달아야 해.

[톤 규칙]
- 절대 광고처럼 보이지 않게. 진심으로 공감하는 톤.
- 글 내용에 적절히 호응 (제목/본문에서 한 가지 포인트 잡아 언급)
- 마지막 1줄에 포켓클래스 관련 *아주 가벼운* 언급 (강요·홍보·링크 X)
- 2~3문장, 존댓말
- **언제나 상냥하게** (이게 가장 중요)
- 이모지 1개 이내 (또는 없어도 OK)
- 인사말은 "안녕하세요"로 시작
- 출력은 댓글 본문만. 따옴표·설명·머리말 X.`;

export type DraftInput = {
  postTitle: string;
  postSnippet: string;
  keyword: string;
};

export type AiProvider = "claude" | "openai" | "";

type AiConfig = {
  provider: AiProvider;
  claudeKey: string;
  openaiKey: string;
};

function readAiConfig(): AiConfig {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT key, value FROM settings WHERE key IN ('ai_provider', 'claude_api_key', 'openai_api_key')",
    )
    .all() as { key: string; value: string }[];
  const lookup = (k: string) =>
    rows.find((r) => r.key === k)?.value?.trim() ?? "";

  let provider = lookup("ai_provider") as AiProvider;
  const claudeKey = lookup("claude_api_key");
  const openaiKey = lookup("openai_api_key");

  // provider 미설정인데 한쪽만 키 있으면 자동 선택
  if (!provider) {
    if (claudeKey) provider = "claude";
    else if (openaiKey) provider = "openai";
  }

  return { provider, claudeKey, openaiKey };
}

const userPrompt = (input: DraftInput) =>
  `[원글 제목]\n${input.postTitle}\n\n` +
  `[원글 본문 일부]\n${input.postSnippet}\n\n` +
  `[발견 키워드]\n${input.keyword}\n\n` +
  `위 원글에 달 댓글 초안 한 개만 작성해줘.`;

const cleanup = (s: string) => s.trim().replace(/^["'\s]+|["'\s]+$/g, "");

async function generateWithClaude(
  input: DraftInput,
  apiKey: string,
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt(input) }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return cleanup(text);
}

async function generateWithOpenAI(
  input: DraftInput,
  apiKey: string,
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt(input) },
    ],
  });
  return cleanup(completion.choices[0]?.message?.content ?? "");
}

export async function generateCommentDraft(
  input: DraftInput,
  apiKey?: string,
): Promise<{ draft: string; usedAi: boolean; provider: AiProvider }> {
  const cfg = readAiConfig();

  // 외부에서 apiKey가 명시적으로 들어온 경우 — provider 추정
  // (cfg.provider 우선, 없으면 키 보유에 따라 결정)
  let provider: AiProvider = cfg.provider;
  let key = "";

  if (apiKey?.trim()) {
    // 명시적 key가 들어오면 cfg.provider 기준으로 매핑
    if (provider === "openai") key = apiKey.trim();
    else if (provider === "claude") key = apiKey.trim();
    else {
      // provider 미정 + 외부 key → claude 기본 (호환)
      provider = "claude";
      key = apiKey.trim();
    }
  } else {
    if (provider === "claude") key = cfg.claudeKey;
    else if (provider === "openai") key = cfg.openaiKey;
  }

  if (!provider || !key) {
    return { draft: fallbackTemplate(input), usedAi: false, provider: "" };
  }

  try {
    const draft =
      provider === "openai"
        ? await generateWithOpenAI(input, key)
        : await generateWithClaude(input, key);
    if (!draft) {
      return { draft: fallbackTemplate(input), usedAi: false, provider };
    }
    return { draft, usedAi: true, provider };
  } catch (err) {
    console.warn(`AI(${provider}) 실패, fallback:`, err);
    return { draft: fallbackTemplate(input), usedAi: false, provider };
  }
}

function fallbackTemplate(input: DraftInput): string {
  const preview = input.postTitle.replace(/\s+/g, " ").slice(0, 25);
  return (
    `안녕하세요 :) "${input.keyword}" 검색하다가 글이 너무 좋아서 들렀어요. ` +
    `${preview} 관련 정보 잘 정리해 주셔서 도움 많이 됐습니다! ` +
    `저희도 비슷한 교육 분야라 늘 좋은 글 챙겨보고 있어요 ☺️`
  );
}
