"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#a855f7",
  "#f97316",
  "#ef4444",
  "#0ea5e9",
  "#84cc16",
  "#ec4899",
];

export type ChartRow = { date: string } & Record<string, number | string>;

export default function KeywordTrendChart({
  data,
  keywords,
}: {
  data: ChartRow[];
  keywords: string[];
}) {
  return (
    <div className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(s: string) => s.slice(5)}
            interval={Math.floor(data.length / 8) || 0}
          />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          {keywords.map((kw, i) => (
            <Line
              key={kw}
              type="monotone"
              dataKey={kw}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
