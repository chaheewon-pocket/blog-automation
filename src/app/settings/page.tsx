import { getDb } from "@/lib/db";
import { getSessionInfo } from "@/lib/playwright/session";
import {
  addBlog,
  addKeyword,
  clearBlogSession,
  deleteBlog,
  deleteKeyword,
  setDefaultBlog,
  toggleBlog,
  toggleKeyword,
  updateAiProvider,
  updateClaudeApiKey,
  updateDataLabKeys,
  updateOpenAiApiKey,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

type Keyword = { id: number; keyword: string; enabled: number };
type Blog = {
  id: number;
  alias: string;
  naver_id: string;
  blog_url: string;
  is_default: number;
  enabled: number;
  created_at: string;
};

export default function SettingsPage() {
  const db = getDb();
  const blogs = db.prepare("SELECT * FROM blogs ORDER BY is_default DESC, id").all() as Blog[];
  const keywords = db
    .prepare("SELECT * FROM monitor_keywords ORDER BY id")
    .all() as Keyword[];

  return (
    <div className="px-10 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">설정</h1>
        <p className="mt-1 text-sm text-zinc-500">
          블로그·키워드 관리. 변경 즉시 반영돼.
        </p>
      </header>

      {/* ─────────────────── 블로그 관리 ─────────────────── */}
      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">📡 대상 블로그 ({blogs.length}개)</h2>

        <ul className="mb-4 space-y-2">
          {blogs.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-4 py-3 dark:border-zinc-800"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{b.alias}</span>
                  {b.is_default === 1 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      기본
                    </span>
                  )}
                  {b.enabled === 0 && (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                      비활성
                    </span>
                  )}
                </div>
                <a
                  href={b.blog_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-zinc-500 hover:text-blue-600"
                >
                  {b.blog_url}
                </a>
              </div>
              <div className="flex items-center gap-1">
                {b.is_default === 0 && (
                  <form action={setDefaultBlog}>
                    <input type="hidden" name="id" value={b.id} />
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-amber-50 hover:text-amber-700"
                    >
                      기본 지정
                    </button>
                  </form>
                )}
                <form action={toggleBlog}>
                  <input type="hidden" name="id" value={b.id} />
                  <button
                    type="submit"
                    className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                  >
                    {b.enabled ? "비활성화" : "활성화"}
                  </button>
                </form>
                {b.is_default === 0 && (
                  <form action={deleteBlog}>
                    <input type="hidden" name="id" value={b.id} />
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      삭제
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>

        <form action={addBlog} className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-4 sm:flex-row dark:bg-zinc-950">
          <input
            type="text"
            name="alias"
            placeholder="블로그 별명 (예: 포켓클래스 메인)"
            required
            className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="text"
            name="naver_id"
            placeholder="네이버 ID 또는 URL (예: pocketclass1212)"
            required
            className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ➕ 블로그 추가
          </button>
        </form>
      </section>

      {/* ─────────────────── 키워드 관리 ─────────────────── */}
      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">
          🔍 모니터링 키워드 ({keywords.length}개)
        </h2>

        <ul className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {keywords.map((kw) => (
            <li
              key={kw.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-4 py-3 dark:border-zinc-800"
            >
              <span className={`font-medium ${kw.enabled ? "" : "text-zinc-400 line-through"}`}>
                {kw.keyword}
              </span>
              <div className="flex items-center gap-1">
                <form action={toggleKeyword}>
                  <input type="hidden" name="id" value={kw.id} />
                  <button
                    type="submit"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      kw.enabled
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800"
                    }`}
                  >
                    {kw.enabled ? "활성" : "비활성"}
                  </button>
                </form>
                <form action={deleteKeyword}>
                  <input type="hidden" name="id" value={kw.id} />
                  <button
                    type="submit"
                    className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    삭제
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>

        <form action={addKeyword} className="flex gap-2 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-950">
          <input
            type="text"
            name="keyword"
            placeholder="새 키워드 (예: 의료기관 평가)"
            required
            className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ➕ 추가
          </button>
        </form>
      </section>

      {/* ─────────────────── 네이버 로그인 세션 ─────────────────── */}
      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold">🔐 네이버 로그인 세션</h2>
        <p className="mb-4 text-xs text-zinc-500">
          스크래핑/자동화에는 블로그별 로그인 세션이 필요해. 아래 명령어를 터미널에서 실행해 한 번 로그인하면 세션이 저장돼.
        </p>

        <ul className="space-y-3">
          {blogs.map((b) => {
            const info = getSessionInfo(b.id);
            return (
              <li
                key={b.id}
                className="rounded-lg border border-zinc-100 p-4 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.alias}</span>
                      <span className="font-mono text-xs text-zinc-400">
                        {b.naver_id}
                      </span>
                      {info.exists ? (
                        info.isStale ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            ⚠️ 만료 임박 ({Math.floor((info.ageHours ?? 0) / 24)}일 전)
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            ✅ 활성 ({Math.floor(info.ageHours ?? 0)}시간 전)
                          </span>
                        )
                      ) : (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                          ❌ 없음
                        </span>
                      )}
                    </div>
                    <code className="mt-2 block rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100">
                      npm run login -- {b.naver_id}
                    </code>
                  </div>
                  {info.exists && (
                    <form action={clearBlogSession}>
                      <input type="hidden" name="blog_id" value={b.id} />
                      <button
                        type="submit"
                        className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        세션 삭제
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ─────────────────── AI / DataLab ─────────────────── */}
      <AiSection />
      <DataLabSection />
    </div>
  );
}

function mask(key: string): string {
  if (!key) return "";
  if (key.length < 12) return "****";
  return key.slice(0, 7) + "..." + key.slice(-4);
}

function getSetting(k: string): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(k) as
    | { value: string }
    | undefined;
  return row?.value ?? "";
}

function AiSection() {
  const provider = getSetting("ai_provider");
  const claudeKey = getSetting("claude_api_key");
  const openaiKey = getSetting("openai_api_key");

  return (
    <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 text-lg font-semibold">🤖 AI 댓글 초안 생성</h2>
      <p className="mb-4 text-xs text-zinc-500">
        모니터링 키워드로 발견된 글에 AI가 댓글 초안을 만들어줘. 두 제공자 중 하나의 키만 등록해도 OK.
      </p>

      {/* 제공자 토글 */}
      <form action={updateAiProvider} className="mb-5">
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          AI 제공자
        </label>
        <div className="mt-2 flex gap-2">
          {(
            [
              { v: "claude", label: "🟣 Claude (Anthropic)" },
              { v: "openai", label: "🟢 OpenAI (GPT)" },
              { v: "", label: "⚪ 비활성 (fallback 템플릿)" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              type="submit"
              name="provider"
              value={opt.v}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                provider === opt.v
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          현재:{" "}
          <strong>
            {provider === "claude"
              ? "Claude"
              : provider === "openai"
                ? "OpenAI"
                : "비활성"}
          </strong>
          {" "}
          {provider === "claude" && !claudeKey && " — 아래 Claude 키 입력 필요"}
          {provider === "openai" && !openaiKey && " — 아래 OpenAI 키 입력 필요"}
        </p>
      </form>

      {/* Claude key */}
      <div className="mb-5 rounded-lg border border-zinc-100 p-4 dark:border-zinc-800">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">🟣 Anthropic Claude API Key</label>
          {claudeKey ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {mask(claudeKey)}
            </span>
          ) : (
            <span className="text-xs text-zinc-400">미설정</span>
          )}
        </div>
        <p className="mb-2 text-xs text-zinc-500">
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            console.anthropic.com
          </a>{" "}
          에서 발급. 모델: claude-haiku-4-5
        </p>
        <form action={updateClaudeApiKey} className="flex gap-2">
          <input
            type="password"
            name="key"
            placeholder="sk-ant-..."
            className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            저장
          </button>
        </form>
      </div>

      {/* OpenAI key */}
      <div className="rounded-lg border border-zinc-100 p-4 dark:border-zinc-800">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">🟢 OpenAI API Key</label>
          {openaiKey ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {mask(openaiKey)}
            </span>
          ) : (
            <span className="text-xs text-zinc-400">미설정</span>
          )}
        </div>
        <p className="mb-2 text-xs text-zinc-500">
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            platform.openai.com
          </a>{" "}
          에서 발급. 모델: gpt-4o-mini (저렴함). ChatGPT 구독과는 별도 결제.
        </p>
        <form action={updateOpenAiApiKey} className="flex gap-2">
          <input
            type="password"
            name="key"
            placeholder="sk-..."
            className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            저장
          </button>
        </form>
      </div>
    </section>
  );
}

function DataLabSection() {
  const cid = getSetting("datalab_client_id");
  const csec = getSetting("datalab_client_secret");
  const ready = Boolean(cid && csec);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 text-lg font-semibold">📈 네이버 DataLab API</h2>
      <p className="mb-4 text-xs text-zinc-500">
        검색어 트렌드(0~100 정규화) 수집용. 무료.{" "}
        <a
          href="https://developers.naver.com/apps/#/register"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          네이버 개발자 센터
        </a>
        에서 애플리케이션 등록 (API 선택: <strong>데이터랩 (검색어트렌드)</strong>) → Client ID/Secret 발급
      </p>

      <form
        action={updateDataLabKeys}
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
      >
        <div>
          <label className="text-xs text-zinc-500">Client ID</label>
          <input
            type="text"
            name="client_id"
            defaultValue={cid}
            placeholder="네이버 개발자 센터의 Client ID"
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Client Secret</label>
          <input
            type="password"
            name="client_secret"
            placeholder={csec ? mask(csec) : "Client Secret"}
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            저장
          </button>
        </div>
      </form>

      <div className="mt-3 text-xs">
        {ready ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            🟢 활성
          </span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-500 dark:bg-zinc-800">
            ⚪ 미설정 (둘 다 필요)
          </span>
        )}
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        💡 입력 후{" "}
        <a href="/insights" className="underline">
          키워드 인사이트
        </a>{" "}
        페이지에서 트렌드 차트 확인. 자동 수집은{" "}
        <a href="/schedule" className="underline">
          스케줄
        </a>
        의 fetchTrends 활성화.
      </p>
    </section>
  );
}
