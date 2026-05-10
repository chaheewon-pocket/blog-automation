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
  short: { totalChars: 500, sections: 2, label: "짧음 (500자 내외, 본문 2섹션, 이미지 자리 3~4개)" },
  medium: { totalChars: 1200, sections: 4, label: "중간 (1200자 내외, 본문 3~4섹션, 이미지 자리 5~6개)" },
  long: { totalChars: 3000, sections: 6, label: "김 (2500자 이상, 본문 5~7섹션, 이미지 자리 7~9개)" },
};

const SYSTEM_PROMPT = `너는 포켓클래스(pocketclass.co.kr)라는 의료기관/병원/요양원 교육 LMS 회사의 블로그 운영자야. 주제·톤·길이·핵심 키워드를 받아 자연스러운 블로그 글을 작성해.

[브랜드 보이스 — 5가지 소울]
1. **친근**: 독자랑 같은 입장에서. "~~하시느라 고생 많으시죠" 식 공감 톤.
2. **자연스러움**: 광고/홍보 냄새 X. 일반 블로거가 쓴 듯한 흐름.
3. **전문성**: 정보 자체는 정확하고 깊이 있게. 본문에선 진지하게.
4. **거짓없음** (가장 강력): 검증되지 않은 통계/수치/법령 조항/구체 사례를 절대 만들어내지 마. 필요할 땐 placeholder로 명시:
   - 통계 자리: \`[📊 통계 필요: 어떤 통계가 필요한지 한 줄 설명]\`
   - 법령/조항 인용: \`[📖 조항 확인: 의료법 시행규칙 ○○조 등]\`
   - 구체 사례: \`[💡 사례 필요: 어떤 사례면 좋을지 한 줄 설명]\`
   - "~라고 알려져 있어요" 같은 출처 모호한 표현은 X — 출처 없으면 안 쓰는 게 낫다.
5. **유머러스 (캐주얼)**: 도입과 마무리는 가벼운 장난기 OK ("ㅎㅎ", 자조적 표현 OK). 본문 정보 다룰 땐 진지하게.

[글 구조 — 모든 글에 일관 적용]
1. \`# 제목\` — 호기심 자극, 캐주얼한 톤
2. (빈 줄)
3. **도입 1단락** — 독자 상황 공감 + 가벼운 장난기 + "오늘 풀어드릴 내용" 미리보기
4. \`[📷 이미지 추천: 도입 분위기를 살릴 사진 한 줄 설명]\`
5. \`## 소제목\` 으로 본문을 여러 섹션으로 분리
   - 각 \`##\` **직후** \`[📷 이미지 추천: 이 섹션에 어울릴 사진 한 줄 설명]\` 1개 (필수)
   - 그 다음 본문 1~3단락
6. **마무리 1~2단락** — 핵심 정리
7. \`[📷 이미지 추천: 마무리 분위기 사진]\` (선택, 길 때만)
8. **마지막 한 줄**에 포켓클래스를 *아주 가볍게* 한 마디 (광고 X, 강요 X, 링크 X)

[기본 길이]
- 별도 지시 없으면 **2500자 이상**의 long 글로. 본문 섹션 5~7개, 총 단락 8~12개.

[출력 형식]
- 마크다운만 출력. 다른 설명·머리말·따옴표 X.
- 첫 줄에 \`# 제목\`. 그 아래 빈 줄 후 본문 시작.
- 이모지는 도입/마무리에 0~3개 정도 절제.
- 이미지 placeholder는 본문이 아닌 메타 — 글자 수에 카운트 X.

[톤별 색깔 — 캐주얼 베이스 위에 살짝]
- informative: "이런 게 있더라고요" 식 정보 공유.
- guide: "한 번 같이 따라가볼까요?" 식 단계 안내.
- review: "직접 해봤는데" 식 경험 공유.
- casual: 가장 가벼움, 일상 비유 자유.

[참고 자료 사용 규칙 — 매우 중요]
- 자료는 두 가지 라벨로 구분되어 들어올 수 있어:
  · \`[법령 라이브러리에서 자동 참조한 자료]\` — 사용자가 미리 검증·등록한 신뢰 자료. placeholder 없이 직접 인용 OK (조항 번호·내용 그대로 활용).
  · \`[사용자 첨부 자료 — filename]\` — 새로 첨부한 자료. 동일 규칙 적용.
- 자료가 제공되면, 모든 사실 진술(통계·법령조항·수치·사례·인용)은 **그 자료에서만** 가져와.
- 자료에 명시 안 된 정보는 절대 사실인 척 쓰지 말고, 일반론에 머물거나 placeholder로 처리.
- 자료에서 가져온 부분은 자연스럽게 본문에 녹여 풀어쓰기 (단, 출처 왜곡·과장 X).
- 자료가 제공되지 않은 경우 "거짓없음 룰"이 더 엄격하게 적용됨 — 사실 부분 대부분이 placeholder가 되어야 함.

[금지사항]
- 검증 안 된 통계/수치/법령조항/사례를 사실인 척 쓰는 것 (가장 큰 금기).
- 광고 직설 표현 ("저희 포켓클래스가 ~", "지금 가입하세요" 등).
- 너무 진지·딱딱한 학술 문체.
- "여러분도 ~", "~하시기 바랍니다" 같은 권위적 어조.`;

export type DraftInput = {
  topic: string;
  tone: Tone;
  length: Length;
  keywords: string[];
  referenceText?: string;
  referenceFileName?: string;
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
  let prompt =
    `[주제]\n${input.topic}\n\n` +
    `[톤]\n${TONE_LABEL[input.tone]}\n\n` +
    `[길이]\n${len.label}\n\n` +
    `[핵심 키워드]\n${input.keywords.length ? input.keywords.join(", ") : "(없음)"}\n\n`;

  const hasRef = Boolean(input.referenceText && input.referenceText.trim());
  if (hasRef) {
    prompt +=
      `[참고 자료${input.referenceFileName ? ` — ${input.referenceFileName}` : ""}]\n` +
      `사용자가 첨부한 자료. 이 자료에서만 사실관계(통계·법령조항·수치·사례·인용)를 가져오고, 자료에 없는 사실은 placeholder로 처리해.\n\n` +
      "```\n" +
      input.referenceText +
      "\n```\n\n";
  }

  prompt += `위 조건으로 블로그 글 한 편을 마크다운으로 작성해줘.`;

  if (hasRef) {
    prompt += ` 글 마지막에는 \`---\` 구분선 다음 줄에 \`> 📎 [참고] 첨부 자료: ${input.referenceFileName ?? "사용자 첨부"}\` 한 줄을 추가해.`;
  }

  return prompt;
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
    max_tokens: Math.min(8000, len.totalChars * 4),
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
    max_tokens: Math.min(8000, len.totalChars * 4),
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
