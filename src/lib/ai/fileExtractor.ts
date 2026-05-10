/**
 * 첨부 자료(PDF/DOCX/TXT/MD) → 텍스트 추출.
 * AI가 ground truth로 사용할 자료를 normalize 한다.
 */

const MAX_TEXT_CHARS = 50000; // 토큰 폭증 방지 (대략 25K 토큰 한국어)

export type ExtractResult = {
  text: string;
  pages?: number;
  warning?: string;
};

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  let text = "";
  let pages: number | undefined;

  if (name.endsWith(".pdf")) {
    // pdf-parse v1: lib 경로 직접 import (root index.js는 모듈 로드 시 sample fs.readFileSync 시도해 ENOENT 에러)
    const pdfMod = (await import("pdf-parse/lib/pdf-parse.js")) as unknown as {
      default: (b: Buffer) => Promise<{ text: string; numpages: number }>;
    };
    const pdfParse = (pdfMod.default ?? (pdfMod as unknown)) as (
      b: Buffer,
    ) => Promise<{ text: string; numpages: number }>;
    const result = await pdfParse(buffer);
    text = result.text;
    pages = result.numpages;
  } else if (name.endsWith(".docx")) {
    const mammothMod = (await import("mammoth")) as unknown as {
      default?: {
        extractRawText: (i: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      extractRawText?: (i: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const extractRawText =
      mammothMod.default?.extractRawText ?? mammothMod.extractRawText;
    if (!extractRawText) throw new Error("mammoth 모듈 로드 실패");
    const result = await extractRawText({ buffer });
    text = result.value;
  } else if (name.endsWith(".txt") || name.endsWith(".md")) {
    text = buffer.toString("utf-8");
  } else {
    throw new Error(
      `지원하지 않는 파일 형식: ${file.name} (PDF, DOCX, TXT, MD만 가능)`,
    );
  }

  // 정규화: 연속 공백/개행 → 단일 공백
  text = text.replace(/\s+/g, " ").trim();

  let warning: string | undefined;
  if (text.length > MAX_TEXT_CHARS) {
    text =
      text.slice(0, MAX_TEXT_CHARS) +
      "\n\n... (자료가 길어 앞부분만 사용됨)";
    warning = `자료가 ${MAX_TEXT_CHARS.toLocaleString()}자를 초과해 앞부분만 AI에 전달됨`;
  }

  if (text.length < 50) {
    warning = (warning ? warning + " · " : "") +
      "추출된 텍스트가 너무 짧아. 스캔 PDF나 이미지 위주 문서일 수 있음";
  }

  return { text, pages, warning };
}
