import { getDb } from "@/lib/db";
import {
  addLegal,
  deleteLegal,
  toggleLegal,
  updateLegal,
} from "@/lib/actions";
import { fmtTimestamp } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

type LegalRow = {
  id: number;
  title: string;
  category: string | null;
  tags: string | null;
  content: string;
  source_url: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};

function safeArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function LibraryPage() {
  const db = getDb();
  const legals = db
    .prepare(
      "SELECT * FROM legal_library ORDER BY enabled DESC, category, title",
    )
    .all() as LegalRow[];

  const grouped = new Map<string, LegalRow[]>();
  for (const l of legals) {
    const cat = l.category ?? "(미분류)";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(l);
  }

  const activeCount = legals.filter((l) => l.enabled === 1).length;

  return (
    <div className="px-10 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">📖 법령 라이브러리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          자주 쓰는 법령을 등록해두면 글 작성 시 키워드 태그가 매칭되는 법령을 AI가 자동으로 참조해. (활성 {activeCount} / 총 {legals.length}건)
        </p>
      </header>

      {/* 추가 폼 */}
      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">➕ 법령 추가</h2>
        <form action={addLegal} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                제목 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                placeholder="예: 산업안전보건법 제29조 (관리감독자 교육)"
                required
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                카테고리
              </label>
              <input
                type="text"
                name="category"
                placeholder="예: 산업안전 / 의료법 / 노동법"
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              매칭 태그 (쉼표로 구분)
            </label>
            <input
              type="text"
              name="tags"
              placeholder="예: 관리감독자, 교육, 산업안전"
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-500">
              글 작성 시 이 태그 중 하나라도 키워드와 매칭되면 자동 참조돼.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              본문 <span className="text-rose-500">*</span>
            </label>
            <textarea
              name="content"
              placeholder="법령 본문을 그대로 붙여넣기. 조항·항·호 다 포함해도 OK."
              rows={6}
              required
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              출처 URL
            </label>
            <input
              type="url"
              name="source_url"
              placeholder="https://www.law.go.kr/..."
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ➕ 법령 등록
          </button>
        </form>
      </section>

      {/* 목록 */}
      {legals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-zinc-600 dark:text-zinc-400">
            아직 등록된 법령이 없어. 위 폼에서 첫 법령을 추가해봐.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            추천: 산업안전보건법, 의료법, 근로기준법 등 자주 쓰는 조항부터.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <section key={category}>
              <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {category}{" "}
                <span className="text-zinc-400">({items.length})</span>
              </h3>
              <ul className="space-y-2">
                {items.map((legal) => {
                  const tags = legal.tags ? safeArray(legal.tags) : [];
                  return (
                    <li
                      key={legal.id}
                      className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <details>
                        <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-950">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium ${
                                  legal.enabled
                                    ? ""
                                    : "text-zinc-400 line-through"
                                }`}
                              >
                                {legal.title}
                              </span>
                              {!legal.enabled && (
                                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                                  비활성
                                </span>
                              )}
                            </div>
                            {tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {tags.map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                  >
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-zinc-400">
                            {fmtTimestamp(legal.updated_at)}
                          </span>
                        </summary>

                        <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
                          <form action={updateLegal} className="grid gap-3">
                            <input type="hidden" name="id" value={legal.id} />
                            <div className="grid gap-3 sm:grid-cols-2">
                              <input
                                type="text"
                                name="title"
                                defaultValue={legal.title}
                                required
                                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                              />
                              <input
                                type="text"
                                name="category"
                                defaultValue={legal.category ?? ""}
                                placeholder="카테고리"
                                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                              />
                            </div>
                            <input
                              type="text"
                              name="tags"
                              defaultValue={tags.join(", ")}
                              placeholder="매칭 태그, 쉼표로 구분"
                              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            />
                            <textarea
                              name="content"
                              defaultValue={legal.content}
                              rows={8}
                              required
                              className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            />
                            <input
                              type="url"
                              name="source_url"
                              defaultValue={legal.source_url ?? ""}
                              placeholder="출처 URL"
                              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            />
                            <div>
                              <button
                                type="submit"
                                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                              >
                                💾 저장
                              </button>
                            </div>
                          </form>

                          <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                            <form action={toggleLegal}>
                              <input
                                type="hidden"
                                name="id"
                                value={legal.id}
                              />
                              <button
                                type="submit"
                                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                                  legal.enabled
                                    ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800"
                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950"
                                }`}
                              >
                                {legal.enabled ? "⚪ 비활성화" : "🟢 활성화"}
                              </button>
                            </form>
                            <form action={deleteLegal}>
                              <input
                                type="hidden"
                                name="id"
                                value={legal.id}
                              />
                              <button
                                type="submit"
                                className="rounded-md px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                              >
                                🗑️ 삭제
                              </button>
                            </form>
                          </div>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
