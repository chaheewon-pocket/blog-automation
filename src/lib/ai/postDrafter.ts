import { getDb } from "../db";

export type Tone = "informative" | "guide" | "review" | "casual";
export type Length = "short" | "medium" | "long";
export type AiProvider = "claude" | "openai" | "fallback";

const TONE_LABEL: Record<Tone, string> = {
  informative: "정보형 — 객관적·교육적·정보 전달 위주",
  guide: "가이드 — 단계별 안내·실용적·how-to",
  review: "후기 — 경험 공유·친근·진솔한 톤",
  casual: "캐주얼 — 가벼운 일상 톤·읽기 편한 문체",
};

const LENGTH_GUIDE: Record<
  Length,
  { totalChars: number; sections: number; label: string }
> = {
  short: { totalChars: 500, sections: 3, label: "짧음 (500자 내외, 3~4단락)" },
  medium: { totalChars: 1200, sections: 5, label: "중간 (1200자 내외, 5~7단락)" },
  long: { totalChars: 2500, sections: 8, label: "김 (2500자 내외, 10~13단락)" },
};

const SYSTEM_PROMPT = `너는 포켓클래스(pocketclass.co.kr)라는 의료기관/병원/요양원 교육 LMS 회사의 블로그 운영자야.
주제·톤·길이·핵심 키워드를 받아 자연스러운 블로그 글을 작성해.

[핵심 원칙]
- **광고처럼 보이면 안 돼.** 정보 제공·도움 제공이 우선.
- 핵심 키워드를 본문에 자연스럽게 녹여 넣기 (각 키워드 1~3회 정도, 억지로 반복 X).
- 도입 — 본문 — 마무리 구조로.
- 본문에 \`## 소제목\`, 필요 시 \`### 세부 항목\` 사용해 구조화.
- 마지막 1~2줄에 포켓클래스를 *아주 가벼운 한 문장*으로 언급 (강요·홍보·링크 X).
- 한국어 블로그 톤. 친근하지만 전문성 있게.
- 존댓말. 이모지는 0~2개로 절제.

[출력 형식]
- 마크다운만 출력. 다른 설명·머리말·따옴표 X.
- 첫 줄: \`# 제목\` (한 줄)
- 그 아래 빈 줄 후 본문 시작.

[톤별 가이드]
- informative: 사실·통계·법령·정책 등을 깔끔하게 정리. 객관적.
- guide: 1단계 → 2단계 → 3단계 식 실행 가능한 절차. 체크리스트 가능.
- review: "직접 해보니" / "다녀와보니" 식의 일인칭. 경험에서 우러난 톤.
- casual: 친구에게 말하듯 편하게. 비유나 일상 예시 자유롭게.`;

export type DraftInput = {
  topic: string;
  tone: Tone;
  length: Length;
  keywords: string[];
};

export type DraftOutput = {
  title: string;
  body: string;
  provider: AiProvider;
};

function readAiConfig() {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT key, value FROM settings WHERE key IN ('ai_provider', 'claude_api_key', 'openai_api_key')",
    )
    .all() as { key: string; value: string }[];
  const lookup = (k: string) =>
    rows.find((r) => r.key === k)?.value?.trim() ?? "";
  let provider = lookup("ai_provider") as "" | "claude" | "openai";
  const claudeKey = lookup("claude_api_key");
  const openaiKey = lookup("openai_api_key");
  if (!provider) {
    if (claudeKey) provider = "claude";
    else if (openaiKey) provider = "openai";
  }
  return { provider, claudeKey, openaiKey };
}

const userPrompt = (input: DraftInput): string => {
  const len = LENGTH_GUIDE[input.length];
  return (
    `[주제]\n${input.topic}\n\n` +
    `[톤]\n${TONE_LABEL[input.tone]}\n\n` +
    `[길이]\n${len.label}\n\n` +
    `[핵심 키워드]\n${input.keywords.length ? input.keywords.join(", ") : "(없음)"}\n\n` +
    `위 조건으로 블로그 글 한 편을 마크다운으로 작성해줘.`
  );
};

const splitTitleBody = (md: string): { title: string; body: string } => {
  const cleaned = md.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "");
  const lines = cleaned.split(/\r?\n/);
  let title = "";
  const bodyLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!title && line.trim().startsWith("# ")) {
      title = line.trim().replace(/^#\s+/, "");
      continue;
    }
    bodyLines.push(line);
  }
  return {
    title: title || "제목 없음",
    body: bodyLines.join("\n").trim(),
  };
};

async function generateWithClaude(
  input: DraftInput,
  apiKey: string,
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const len = LENGTH_GUIDE[input.length];
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: Math.min(4000, len.totalChars * 4),
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
  return text;
}

async function generateWithOpenAI(
  input: DraftInput,
  apiKey: string,
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const len = LENGTH_GUIDE[input.length];
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: Math.min(4000, len.totalChars * 4),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt(input) },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}

export async function generatePostDraft(input: DraftInput): Promise<DraftOutput> {
  const cfg = readAiConfig();
  const key =
    cfg.provider === "openai"
      ? cfg.openaiKey
      : cfg.provider === "claude"
        ? cfg.claudeKey
        : "";

  if (!cfg.provider || !key) {
    return { ...fallbackDraft(input), provider: "fallback" };
  }

  try {
    const md =
      cfg.provider === "openai"
        ? await generateWithOpenAI(input, key)
        : await generateWithClaude(input, key);
    const { title, body } = splitTitleBody(md);
    if (!title || !body) throw new Error("AI 응답이 비어있어");
    return { title, body, provider: cfg.provider };
  } catch (err) {
    console.warn(`AI(${cfg.provider}) 글 생성 실패, fallback:`, err);
    return { ...fallbackDraft(input), provider: "fallback" };
  }
}

function fallbackDraft(input: DraftInput): { title: string; body: string } {
  const kwLine = input.keywords.length
    ? `**핵심 키워드**: ${input.keywords.join(", ")}\n\n`
    : "";
  return {
    title: `[임시] ${input.topic}`,
    body:
      `> ⚠️ AI API 키가 미설정 상태라 임시 골격만 생성됐어. /settings 에서 Claude/OpenAI 키 등록 후 다시 시도해줘.\n\n` +
      kwLine +
      `## 도입\n주제: ${input.topic} (${TONE_LABEL[input.tone]})\n\n` +
      `## 본문\n_${LENGTH_GUIDE[input.length].label} 분량의 본문이 들어갈 자리._\n\n` +
      `## 마무리\n_핵심 정리 + 포켓클래스 가벼운 언급._\n`,
  };
}

export const META = { TONE_LABEL, LENGTH_GUIDE };
