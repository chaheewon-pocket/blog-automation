# 🐾 PocketBlog Insight — 실행 가이드

> 매일 어떻게 띄우는지 빠르게 보는 운영 매뉴얼.
> 자세한 설계는 `docs/DESIGN.md` 참고.

---

## 🚀 평소 실행 (가장 빠른 방법)

프로젝트 폴더에서 **`start-app.bat` 더블클릭**

자동으로 두 창이 열립니다:
1. **Dev Server** — http://localhost:3000 으로 브라우저 접속
2. **Scheduler** — 매일/매주 자동 수집 (cron 대기 중)

종료할 때는 두 창 모두 닫으면 끝.

> 💡 **개발자 모드**라 코드 수정 즉시 반영됨. 안정 운영용은 `start-prod.bat` 사용.

---

## 🔧 개별 명령 (필요할 때 직접 실행)

PowerShell에서 (`cmd /c "..."` 로 ExecutionPolicy 우회):

| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 (자동 리로드) |
| `npm run start` | 프로덕션 서버 (빌드 후 실행) |
| `npm run build` | 프로덕션 빌드 |
| `npm run scheduler` | cron 데몬 |
| `npm run init-db` | DB 처음 만들 때 |
| `npm run migrate` | DB 스키마 변경 시 |

### 데이터 수집 (수동)

| 명령 | 용도 |
|---|---|
| `npm run scrape -- pocketclass1212 --all` | 통계 전체 수집 |
| `npm run scrape -- pocketclass1212 --posts` | RSS 포스트만 |
| `npm run scrape -- pocketclass1212 --rank` | 일별 조회수 |
| `npm run scrape -- pocketclass1212 --referer` | 유입경로/검색어 |
| `npm run find-neighbors -- pocketclass1212` | 서로이웃 후보 |
| `npm run find-comments -- pocketclass1212` | 댓글 후보 + AI 초안 |
| `npm run fetch-trends` | DataLab 검색 트렌드 |
| `npm run login -- pocketclass1212` | 네이버 로그인 (헤드풀) |
| `npm run verify -- pocketclass1212` | 세션 검증 |

---

## 📂 페이지 가이드

| URL | 내용 |
|---|---|
| `/` | 대시보드 (요약 카드 + 유입 도넛 + 키워드 TOP + 인기 포스트) |
| `/posts` | 포스트별 조회수 |
| `/comments` | AI 댓글 초안 검토·게시 |
| `/neighbors` | 서로이웃 후보·신청 |
| `/insights` | DataLab 검색 트렌드 |
| `/schedule` | 자동 작업 스케줄·실행 로그 |
| `/settings` | 블로그·키워드·API 키 관리 |

---

## 🔑 API 키 등록 (선택)

`/settings` 페이지에서:

- **Claude API Key** — AI 댓글 초안 (없으면 fallback 템플릿)
- **OpenAI API Key** — Claude 대신 GPT 사용 가능 (둘 중 하나만 있어도 OK)
- **DataLab Client ID / Secret** — 검색 트렌드 (없으면 `/insights` 페이지 비활성)

키 모두 SQLite에 저장됨. `.env` 파일 안 씀.

---

## 🛡️ 안전장치

- 댓글 게시 / 서로이웃 신청은 **반자동** (클립보드 복사 + 새 탭 열기)
- 자동화 ON/OFF 토글, 일일 한도(기본 30건), 인터벌(기본 60초) 설정
- 자세한 정책은 `docs/DESIGN.md` 8장 참고

---

## 📁 데이터 위치

```
data/
├─ blog.sqlite           # 모든 데이터 (백업하려면 이 파일 복사)
├─ sessions/*.json       # 네이버 로그인 세션 (절대 공유 X)
└─ inspect/              # 디버그용 페이지 dump
```

> ⚠️ `data/` 폴더는 `.gitignore`에 등록되어 GitHub에 안 올라감.

---

## 🆘 문제 발생 시

| 증상 | 해결 |
|---|---|
| 페이지 500 에러 | `.next` 폴더 삭제 후 재시작 |
| 스크래핑 실패 | `npm run verify -- pocketclass1212` 로 세션 확인 후 필요 시 재로그인 |
| 한글 경로 Turbopack 패닉 | `package.json`의 dev 스크립트가 `next dev --webpack` 인지 확인 |
| 포트 3000 이미 사용 중 | `npx kill-port 3000` |
