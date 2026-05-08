"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/posts", label: "포스트 분석", icon: "📝" },
  { href: "/writing", label: "글 작성", icon: "✍️" },
  { href: "/drafts", label: "초안 보관함", icon: "📂" },
  { href: "/comments", label: "댓글 검토", icon: "💬" },
  { href: "/neighbors", label: "서로이웃", icon: "🤝" },
  { href: "/insights", label: "키워드 인사이트", icon: "📈" },
  { href: "/schedule", label: "스케줄", icon: "⏰" },
  { href: "/settings", label: "설정", icon: "⚙️" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white px-4 py-6 dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="mb-8 flex items-center gap-2 px-2">
        <span className="text-2xl">🐾</span>
        <div>
          <div className="text-base font-semibold tracking-tight">
            PocketBlog
          </div>
          <div className="text-xs text-zinc-500">Insight by 포비</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        <div className="font-medium">M1 — 더미 데이터</div>
        <div className="mt-1">스크래퍼 연결은 M2에서 진행</div>
      </div>
    </aside>
  );
}
