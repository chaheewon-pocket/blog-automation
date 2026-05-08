/**
 * 서버(Node.js)와 클라이언트(브라우저)의 toLocaleString 결과가 달라
 * (예: "AM" vs "오전") hydration mismatch가 발생하는 걸 막기 위해
 * 직접 포맷한다. 양쪽 환경에서 동일한 결과 보장.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtShortTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
