/**
 * DataLab 검색 트렌드 수집.
 * 사용법: npm run fetch-trends [-- --days=60]
 */
import { fetchAndStoreTrends } from "../src/lib/datalab/client";

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 30;

  console.log(`📈 DataLab 검색 트렌드 수집 (${days}일)\n`);
  try {
    const r = await fetchAndStoreTrends({ days });
    console.log(`\n✅ 결과:`);
    console.log(`   - 키워드 ${r.keywords}개 (${r.chunks}개 chunk)`);
    console.log(`   - 기간 ${r.startDate} ~ ${r.endDate}`);
    console.log(`   - 데이터 포인트 ${r.dataPoints}건`);
  } catch (err) {
    console.error(
      `\n❌ ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
  process.exit(0);
}

main();
