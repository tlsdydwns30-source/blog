# blog-workflow-tool

네이버 여행 블로그 + CPA 제휴 마케팅 워크플로우를 반자동화하는 웹 도구.
키워드 조사 → 상위노출 분석 → 초안 생성 → 사진 배치 → 가격비교까지 한 곳에서 처리한다.

> 이 저장소는 [인수인계 문서](#인수인계-문서-요약)를 기반으로 실제 빌드를 시작한 상태입니다.
> **골든키워드 / 가격비교표** 탭은 완성되어 키 없이 바로 동작하고,
> **초안 생성**은 LLM API 키만 넣으면 동작합니다. 나머지(사진 매칭·상위글 분석·가격 스크래핑)는
> 실제 로직으로 이어갈 수 있도록 스캐폴드 + TODO를 넣어 두었습니다.

## 스택

- **프론트**: Next.js 14 (App Router), React 18, **빌드타임 Tailwind CSS** (Play CDN 아님)
- **서버**: Vercel Serverless Functions (Node 런타임) — `app/api/*/route.ts`
- **DB/스토리지/벡터**: Supabase (Postgres + pgvector) — 스키마는 `supabase/schema.sql`
- **디자인 토큰**: Pretendard, 스카이블루 `#0EA5E9`, 흰 배경

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 초안 생성 쓰려면 LLM 키만 채우면 됨
npm run dev                  # http://localhost:3000
```

- **골든키워드 / 가격비교표**: 키 없이 즉시 동작 (100% 클라이언트).
- **초안 생성**: `.env.local`에 `ANTHROPIC_API_KEY`(또는 `OPENAI_API_KEY`) 필요.

검증:

```bash
npm run typecheck   # 타입 체크
npm run build       # 프로덕션 빌드
npm run lint        # ESLint
```

## 기능별 상태

| 기능 | 위치 | 상태 |
| --- | --- | --- |
| 골든키워드 (경쟁지수 계산·정렬) | `components/GoldenKeyword.tsx`, `lib/keyword.ts` | ✅ 완성 (키 불필요) |
| 가격비교표 (최저가 + 마크다운) | `components/PriceCompare.tsx`, `lib/price.ts` | ✅ 완성 (키 불필요) |
| 초안 생성 | `components/DraftGenerator.tsx`, `app/api/draft/route.ts`, `lib/llm.ts` | ✅ 동작 (LLM 키 필요) |
| 사진 매칭 (pgvector) | `app/api/match-photos/route.ts`, `scripts/index-photos.ts` | 🚧 스캐폴드 (501) |
| 상위글 분석 | `app/api/analyze-top-posts/route.ts` | 🚧 스캐폴드 (LLM 연결됨, 붙여넣기 입력) |
| 가격 스크래핑 | `app/api/scrape-price/route.ts` | 🚧 스캐폴드 (501, 약관 검토 필요) |
| DB 스키마 | `supabase/schema.sql` | 🚧 작성 완료·미적용 |

## LLM provider 전환 (무료 티어)

Claude API에는 영구 무료 티어가 없습니다. 무료로 쓰려면 OpenAI 호환 무료 티어
(Google AI Studio/Gemini, Groq 등)로 교체하세요. `lib/llm.ts`가 환경변수로 전환합니다.

```bash
# 무료 티어 예시 (Groq)
LLM_PROVIDER=openai
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
DRAFT_MODEL=llama-3.3-70b-versatile
```

> 배포된 웹앱은 반드시 "호스팅된 API"가 필요합니다. 로컬 모델(Ollama)은 서버리스에서 호출 불가.

## Vercel 배포

1. 이 저장소를 Vercel에 임포트 (프레임워크 자동 감지: Next.js).
2. 환경변수(`.env.example` 참고)를 Vercel 프로젝트 설정에 추가.
3. 배포. `골든키워드/가격비교표`는 키 없이도 즉시 동작.

## Supabase 켜기 (다음 단계)

```bash
# 1) Supabase 프로젝트 생성 후 SQL Editor에 붙여넣어 실행
#    (또는 supabase db push)
supabase/schema.sql

# 2) 클라이언트 라이브러리 설치 후 lib/supabase.ts 의 createClient 주석 해제
npm i @supabase/supabase-js
```

## 다음 단계 (권장 순서)

1. Supabase 프로젝트 생성 + `schema.sql` 적용
2. **사진 매칭 먼저** (법적 리스크 없음, 효과 확실): `index-photos` → `match-photos` → 프론트 "문단별 사진 추천" 연결
3. 상위글 분석 연결 (초기엔 크롤링 대신 붙여넣기 입력)
4. 가격 스크래핑 (약관·봇차단 검토하며 신중히)
5. 뉴스 파이프라인 (합법 소스: RSS/라이선스 API에서 제목·요약만 → 원문은 새로 생성)

## 반드시 알아야 할 제약

- **가격 스크래핑**: 대상 3사(클룩/마이리얼트립/케이케이데이) JS 렌더 SPA + 봇 차단.
  우선순위 ① 공식 제휴 API → ② 내부 JSON 엔드포인트 → ③ 헤드리스(`playwright-core`+`@sparticuz/chromium`).
  상업적 반복 수집 전 **약관 검토 필수**.
- **상위노출 분석**: 네이버 랭킹은 비공개. 키워드 추출은 **상관관계 기반 추정**이지 인과가 아님.
- **뉴스 자동 글쓰기**: 기사 본문 재게시는 저작권 침해. 합법 소스에서 **제목·요약만** 받고 원문은 새로 생성.
- **임베딩 차원**: `vector(1536)`을 사용 임베딩 모델과 일치시킬 것 (`schema.sql`·`index-photos.ts` 동시 수정).

## 열린 설계 질문 (전문가 검토용)

- 가격 데이터를 합법·안정적으로 얻는 최선책 (공식 제휴 API 존재 여부)
- pgvector **ivfflat vs hnsw** 선택 — 수만 장 규모 검색 성능/정확도 트레이드오프
- LLM 비용 관리 (무료 티어 rate limit vs 유료 전환 시점, 캐싱)
- 다중 사용자(강의 수강생) 확장 시 키/쿼터/인증 설계

## 인수인계 문서 요약

- **CPA**: 제휴 판매. 링크로 구매 발생 시 수수료.
- **경쟁지수**: 문서수 ÷ 검색량. 낮을수록 황금 키워드.
- **상위노출**: 네이버 검색 상단 노출. 알고리즘 비공개(블랙박스).
- **비교 대상 플랫폼**: 클룩 / 마이리얼트립 / 케이케이데이.

## 라이선스

Private.
