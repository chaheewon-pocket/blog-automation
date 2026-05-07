"use client";

import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type ReferrerDatum = { name: string; value: number; color: string };

export default function DashboardCharts({
  referrerData,
}: {
  referrerData: ReferrerDatum[];
}) {
  if (referrerData.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
          📊 유입 경로 비중
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          아직 수집된 유입 데이터가 없어. 터미널에서:
        </p>
        <code className="mt-3 inline-block rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100">
          cmd /c "npm run scrape -- pocketclass1212 --referer"
        </code>
      </section>
    );
  }

  const total = referrerData.reduce((s, d) => s + d.value, 0);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-lg font-semibold">📊 유입 경로 비중</h2>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={referrerData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={100}
                paddingAngle={2}
              >
                {referrerData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value}건 (${((value / total) * 100).toFixed(1)}%)`,
                  name,
                ]}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 text-sm">
          {referrerData.map((d) => (
            <div key={d.name} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ background: d.color }}
                />
                <span className="truncate text-xs">{d.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-xs text-zinc-500">
                  {((d.value / total) * 100).toFixed(0)}%
                </span>
                <span className="font-mono text-xs font-medium">{d.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
