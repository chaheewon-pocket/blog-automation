import { getDb } from "@/lib/db";
import WritingForm from "@/components/WritingForm";

export const dynamic = "force-dynamic";

type Blog = { id: number; alias: string; naver_id: string };

export default function WritingPage() {
  const db = getDb();
  const blogs = db
    .prepare(
      "SELECT id, alias, naver_id FROM blogs WHERE enabled = 1 ORDER BY is_default DESC, id",
    )
    .all() as Blog[];
  const keywords = (
    db
      .prepare("SELECT keyword FROM monitor_keywords WHERE enabled = 1 ORDER BY id")
      .all() as { keyword: string }[]
  ).map((r) => r.keyword);

  if (blogs.length === 0) {
    return (
      <div className="px-10 py-8">
        <h1 className="text-3xl font-bold tracking-tight">✍️ 글 작성</h1>
        <p className="mt-4 text-sm text-zinc-500">
          활성화된 블로그가 없어. <a href="/settings" className="text-blue-600 underline">설정</a>에서 추가해줘.
        </p>
      </div>
    );
  }

  return (
    <div className="px-10 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">✍️ 글 작성</h1>
        <p className="mt-1 text-sm text-zinc-500">
          주제·톤·길이·키워드 입력하면 AI가 자연스러운 블로그 글 초안을 만들어줘. 자동 저장된 후{" "}
          <a href="/drafts" className="underline">/drafts</a> 에서 편집·게시 가능.
        </p>
      </header>

      <WritingForm blogs={blogs} suggestedKeywords={keywords} />
    </div>
  );
}
