# 네이버 블로그 자동화 웹앱 — 설계 문서

> 작성일: 2026-05-07
> 작성: 포비
> 프로젝트명: **PocketBlog Insight** (가칭)

---

## 1. 프로젝트 목표

포켓클래스 블로그 운영을 효율화하기 위한 **로컬 웹 대시보드**.
다음 세 가지를 한 화면에서 처리한다.

1. **내 블로그 분석** — 어떤 글이 어떤 키워드로 검색되어 들어오는지, 유입경로별 비중을 실시간으로 시각화
2. **키워드 인사이트** — 네이버에서 많이 검색되는 키워드 트렌드 모니터링 (DataLab 연동은 Phase 2)
3. **반자동 댓글 봇** — 댓글 달 만한 글을 추천하고 AI가 초안을 생성, 사람이 확인 후 게시 버튼으로 등록

---

## 2. 기술 스택

| 영역 | 기술 | 선정 이유 |
|------|------|-----------|
| 프레임워크 | **Next.js 15 (App Router)** | 풀스택 한 번에, API Routes로 백엔드까지 |
| 언어 | TypeScript | 타입 안정성, IDE 자동완성 |
| 스크래핑 | **Playwright (Node)** | 네이버 로그인 세션 유지, JS 렌더링 페이지 처리 |
| DB | **better-sqlite3** | 파일 1개로 끝, 동기 API로 단순, 백업 쉬움 |
| 차트 | **Recharts** | React 친화적, 가볍고 한국어 지원 |
| 스케줄러 | **node-cron** | 1시간마다 통계 수집, 6시간마다 댓글 추천 갱신 |
| AI (댓글 초안) | **Claude API (claude-haiku-4-5)** | 빠르고 저렴, 한국어 자연스러움 |
| 스타일링 | Tailwind CSS | 빠른 프로토타이핑 |

**왜 Python 안 쓰나:** 사용자 PC에 Node.js만 설치돼 있고, Python 추가 설치 없이 한 가지 런타임으로 끝낼 수 있어서.

---

## 3. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App (localhost:3000)             │
├─────────────────────────────────────────────────────────────┤
│  Frontend (App Router Pages)                                │
│  ├─ /              대시보드 (요약 카드 + 차트)              │
│  ├─ /posts         포스트별 키워드/유입 분석                │
│  ├─ /keywords      키워드 트렌드 (Phase 2)                  │
│  └─ /comments      댓글 추천 + 초안 검토                    │
│                                                             │
│  API Routes (/api/*)                                        │
│  ├─ /api/stats/refresh    수동 새로고침 트리거              │
│  ├─ /api/comments/draft   AI 댓글 초안 생성                 │
│  └─ /api/comments/post    승인된 댓글 게시                  │
├─────────────────────────────────────────────────────────────┤
│  Background Jobs (node-cron, 서버 시작 시 등록)             │
│  ├─ [매시간 정각]   블로그 통계 스크래핑 → SQLite 저장      │
│  └─ [6시간마다]     댓글 후보 글 수집 → AI 초안 생성        │
├─────────────────────────────────────────────────────────────┤
│  Scrapers (Playwright)                                      │
│  ├─ blogStatsScraper.ts   blog.naver.com 통계 페이지        │
│  └─ commentTargetScraper  연관 키워드 검색 결과 수집        │
├─────────────────────────────────────────────────────────────┤
│  Storage                                                    │
│  ├─ data/blog.sqlite      메트릭 시계열 DB                  │
│  ├─ data/session.json     네이버 로그인 세션 (암호화)       │
│  └─ .env.local            API 키 (gitignore)                │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 데이터베이스 스키마 (SQLite)

```sql
-- 포스트 메타데이터
CREATE TABLE posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  log_no          TEXT UNIQUE NOT NULL,        -- 네이버 글 번호
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  published_at    TEXT NOT NULL,                -- ISO8601
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 시계열 통계 스냅샷 (매시간 적재)
CREATE TABLE post_stats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id         INTEGER REFERENCES posts(id),
  collected_at    TEXT NOT NULL,                -- ISO8601
  views           INTEGER NOT NULL DEFAULT 0,
  visitors        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(post_id, collected_at)
);

-- 검색 유입 키워드별 카운트 (포스트 단위)
CREATE TABLE keyword_inflows (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id         INTEGER REFERENCES posts(id),
  collected_at    TEXT NOT NULL,
  keyword         TEXT NOT NULL,
  count           INTEGER NOT NULL,
  UNIQUE(post_id, collected_at, keyword)
);

-- 유입 경로 (네이버 검색/구글/직접/SNS 등)
CREATE TABLE referrers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id         INTEGER REFERENCES posts(id),
  collected_at    TEXT NOT NULL,
  source          TEXT NOT NULL,                -- "naver_search", "google", "direct", ...
  count           INTEGER NOT NULL
);

-- 댓글 추천 후보 (다른 사람 글 중 댓글 달 만한 것)
CREATE TABLE comment_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url      TEXT UNIQUE NOT NULL,
  source_title    TEXT NOT NULL,
  source_keyword  TEXT NOT NULL,                -- 어떤 검색어로 발견했는지
  draft_comment   TEXT,                         -- AI가 생성한 초안
  status          TEXT DEFAULT 'pending',       -- pending/approved/posted/rejected
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  posted_at       TEXT
);
```

---

## 5. 페이지별 화면 설계

### 5.1 `/` 대시보드 (메인)
- **상단 카드 4개**: 오늘 방문자 / 주간 방문자 / 인기 포스트 TOP1 / 검토 대기 댓글 수
- **차트 1**: 최근 30일 일별 방문자 추이 (라인)
- **차트 2**: 검색 유입 vs 직접 유입 vs SNS 유입 (도넛)
- **표**: 인기 포스트 TOP 10 (제목, 조회수, 주요 유입 키워드)

### 5.2 `/posts/[logNo]` 포스트 상세
- 시간대별 조회 추이
- 이 포스트로 유입된 키워드 워드클라우드
- 유입경로 비중

### 5.3 `/comments` 댓글 검토
- 카드 리스트: [원글 제목] [발견 키워드] [AI 초안] [✅게시 / ✏️수정 / ❌버림]
- "게시" 버튼은 새 탭으로 원글 페이지를 열고 클립보드에 초안 복사 (반자동, 안전)

### 5.4 `/settings`
- 네이버 로그인 (최초 1회, 세션 저장)
- 모니터링할 키워드 등록/삭제
- Claude API 키 입력

---

## 6. 스크래핑 전략 (가장 중요)

### 6.1 네이버 블로그 통계
- 페이지: `https://blog.naver.com/BlogManageStatic.naver` (로그인 필요)
- **방식**: Playwright headful 모드로 최초 로그인 → `storageState`로 세션 저장 → 이후 headless로 재사용
- **2단계 인증**: 휴대폰 인증은 자동화 불가. 최초 로그인은 사용자가 직접 수행 (앱은 브라우저만 띄워줌)
- **수집 주기**: 1시간 (네이버 통계 페이지 자체 갱신 주기 고려)

### 6.2 댓글 후보 수집
- 등록한 키워드를 `https://search.naver.com/search.naver?where=blog&query=...` 로 조회
- 상위 10~20개 글의 URL/제목 수집
- 이미 댓글 단 글, 본인 글, 너무 오래된 글(7일 이상) 필터링

### 6.3 약관·리스크 관리
- **본인 통계 조회는 안전** (자기 데이터 접근)
- **검색 결과 스크래핑은 회색지대** — 요청 간격 3~5초, User-Agent 정상 브라우저로, 일일 수집량 제한
- **댓글 자동 게시는 절대 안 함** — 클립보드 복사 + 수동 게시까지만
- robots.txt 존중

---

## 7. 댓글 초안 생성 로직 (AI)

```
입력: 원글 제목, 원글 본문 일부 (스크래핑), 발견 키워드
프롬프트:
  "너는 포켓클래스라는 의료기관 교육 LMS 회사의 마케팅 담당자야.
   아래 블로그 글에 자연스럽게 댓글을 달아야 해.
   - 광고처럼 보이지 않게
   - 글 내용에 진심으로 공감/호응
   - 마지막 한 줄에 포켓클래스 관련 가벼운 언급 (강요X)
   - 2~3문장, 존댓말, 이모지 1개 이내"
출력: 댓글 초안 텍스트
```

검토 화면에서 사람이 수정/거절/승인.

---

## 8. 보안 고려사항

| 항목 | 처리 방식 |
|------|----------|
| 네이버 ID/PW | 저장 안 함. 최초 로그인 후 세션 쿠키만 보관 |
| 세션 파일 | `data/session.json`, OS 사용자 권한으로 보호 |
| Claude API 키 | `.env.local`, `.gitignore` 등록 |
| 외부 노출 | localhost:3000만 바인딩, 외부 접근 불가 |
| DB | 로컬 SQLite, 백업은 사용자가 수동 |

---

## 9. 구현 마일스톤

| 단계 | 범위 | 예상 산출물 |
|------|------|-------------|
| **M1** | Next.js 초기 세팅 + DB 스키마 + 빈 페이지 | 화면은 보이지만 데이터는 더미 |
| **M2** | Playwright 로그인 + 통계 스크래퍼 | `/posts` 에 실제 데이터 표시 |
| **M3** | 스케줄러 + 시계열 차트 | 대시보드 완성, 1시간마다 자동 갱신 |
| **M4** | 댓글 후보 수집 + AI 초안 + 검토 UI | 반자동 댓글 워크플로우 완성 |
| **M5** | (선택) DataLab API 연동, 키워드 트렌드 페이지 | 인사이트 페이지 추가 |

---

## 10. 폴더 구조 (예정)

```
포비와 함께/blog-automation/
├─ DESIGN.md                ← 이 문서
├─ README.md                 ← 실행 방법
├─ .env.local                ← API 키 (gitignore)
├─ .gitignore
├─ package.json
├─ next.config.ts
├─ tsconfig.json
├─ tailwind.config.ts
├─ data/
│  ├─ blog.sqlite
│  └─ session.json
├─ src/
│  ├─ app/                   ← Next.js App Router
│  │  ├─ page.tsx            ← 대시보드
│  │  ├─ posts/
│  │  ├─ comments/
│  │  ├─ settings/
│  │  └─ api/
│  ├─ lib/
│  │  ├─ db.ts               ← SQLite 클라이언트
│  │  ├─ scrapers/
│  │  │  ├─ blogStats.ts
│  │  │  └─ commentTargets.ts
│  │  ├─ scheduler.ts        ← node-cron 등록
│  │  └─ ai/
│  │     └─ commentDrafter.ts ← Claude API 호출
│  └─ components/            ← 차트, 카드 등 UI
└─ scripts/
   └─ initDb.ts              ← DB 초기화 스크립트
```

---

## 11. 검토 포인트 (사용자 확인 필요)

다음 항목을 확정하면 바로 M1부터 구현 시작 가능:

1. **블로그 주소** — 통계 스크래핑할 블로그 URL (예: `blog.naver.com/pocketclass`)
2. **모니터링 키워드** — 댓글 봇이 검색할 키워드 (예: "의료기관 교육", "급성기병원 인증" 등 5~10개)
3. **Claude API 키** — 댓글 초안 생성용. 없으면 Phase 2로 미루고 더미 텍스트로 진행
4. **댓글 톤** — 위에 적은 프롬프트가 마음에 드는지, 더 캐주얼/공식적으로 바꿀지
5. **마일스톤 순서** — 위 M1~M5 순서대로 진행하면 되는지

---
