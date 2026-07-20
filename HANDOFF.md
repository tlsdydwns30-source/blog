# 다용블 — 프로젝트 인수인계 (진행 요약)

네이버 블로그 키워드 조사 + 글쓰기 자동화 웹도구. **여러 분야**(여행·경제·IT·맛집·뷰티·건강·육아) 대응.

## 접속 / 저장소 / 배포
- **라이브**: https://puzzleblog.vercel.app  (제목: "다용블")
- **저장소**: github.com/tlsdydwns30-source/blog · 브랜치 `claude/blog-automation-handoff-695chq` · PR #1(→main)
- **배포**: Vercel 프로젝트 `puzzleblog`(계정 syj30). **GitHub 연결됨 → 이 브랜치에 push하면 자동 프로덕션 배포.** (Production Branch = 위 브랜치)
- **스택**: Next.js 14(App Router)+TypeScript, Tailwind, Vercel 서버리스 함수

## 완성된 기능 (7개 탭, 전부 작동)
1. **🔥 키워드 추천** — 네이버 검색광고(연관키워드+월검색량) + **문서수·경쟁지수(문서수/검색량)** + 황금키워드 Top5 + **드릴다운**(키워드 클릭 시 재조회) + **글감**(제목5·후속질문5·관련뉴스3)
2. **📊 분야별 인기** — 7분야 **월간** 검색량 Top10 (+글감)
3. **📈 오늘의 트렌드** — 구글 트렌드 RSS(한국 급상승, 키 불필요). *실시간이지만 뉴스·연예 위주라 참고용*
4. **🧑‍🏫 내 블로그 코칭** — 블로그 URL → RSS 최근글 분석 → 니치 + **노출 강도**(자기 글이 자기 제목 검색 상위 뜨는지) → 수준 맞춤 글감5
5. **🔑 골든키워드** — 키워드마스터 표 붙여넣기 → 경쟁지수 계산·정렬 (100% 클라이언트)
6. **💰 가격비교표** — 사이트별 가격 → 최저가 + 마크다운
7. **✍️ 초안 생성** — 키워드/문체 → **1500~2000자** 한국어 글(첫인사→목차→본문→마무리), 한자 자동 제거

## 설정된 환경변수 (Vercel Production)
- **LLM(초안·글감·후속질문)**: `LLM_PROVIDER=openai`, `OPENAI_API_KEY`=Groq키, `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `DRAFT_MODEL`
  - Groq **무료**. 코드에 모델 자동 폴백 체인(kimi→gpt-oss→qwen→llama). 무료 TPM 6000 제한 때문에 max_tokens 4000.
- **네이버 검색광고 API**(검색량·연관키워드): `NAVER_AD_API_KEY`, `NAVER_AD_SECRET_KEY`, `NAVER_AD_CUSTOMER_ID`  (searchad.naver.com → SA API)
- **네이버 개발자 검색 API**(문서수·뉴스·블로그RSS): `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`  (developers.naver.com)
  - ⚠️ 개발자센터 검색API는 2027-06-30 종료 예정(NAVER API HUB로 이관). 지금 발급분은 그때까지 사용 가능.

## 발급 완료한 외부 계정/키
Groq(무료 LLM) · 네이버 검색광고(SA API) · 네이버 개발자센터(검색) · Vercel(syj30, GitHub연동) · 무료도메인 puzzleblog.vercel.app

## 핵심 결정 / 제약
- **네이버 자동발행 안 함** — 계정 정지 위험(공식 API 없음). **수동 복붙 발행** 방식.
- **네이버 검색량 = 월간**(실시간 아님). 실시간은 구글 트렌드(전체 분야).
- 무료 Groq는 한국어에 가끔 한자 섞임 → 코드에서 제거. 더 좋은 품질 원하면 Claude API($5) 교체 가능(코드 지원됨).

## 🚧 미완성 / 다음 할 일
### A. 사진 매칭 (최종 목표) — **백엔드 코드 완성, 미가동**
목적: 내 사진 1만장(현재 여자친구 폰) 중 **글에 맞는 사진 자동 추천/배치** → 복붙 후 발행만.
- 코드 준비됨: `lib/supabase.ts`, `lib/embed.ts`, `lib/vision.ts`, `app/api/match-photos/route.ts`, `scripts/index-photos.ts`, `supabase/schema.sql`
- **남은 셋업**:
  1. **Supabase 프로젝트 생성**(사용자 계정) → `supabase/schema.sql` 적용(photos 테이블 + match_photos RPC, pgvector)
  2. 여자친구 폰 사진 → **공유 클라우드**(구글포토/드라이브 공유 앨범) → 폴더로 확보
  3. **임베딩·비전 키**(OpenAI 또는 Gemini무료) → `EMBED_*`, `VISION_*` 환경변수
  4. `npm run index-photos -- <폴더>` 실행 (무료 ~1000장/일·열흘 or 유료 $5~20·반나절)
  5. `/api/match-photos` 로 매칭, 프론트 "사진 추천" UI 연결
### B. 매일 자동 루틴 (마지막 순위) — 미착수
- 매일 키워드5개/글감 자동 → 이메일(Resend 무료키) 발송 or 사이트 표시 (Vercel Cron)
### (선택) 데이터랩 "상승중" 배지, 유튜브 트렌드(무료 API키)

## 개발/배포 방법
코드 수정 → `git push origin claude/blog-automation-handoff-695chq` → Vercel 자동배포(약 1분).
환경변수 변경은 Vercel → Settings → Environment Variables (변경 후 재배포 필요).
검증: `npm run typecheck` + `npm run build` (route 파일은 GET/POST/config 외 export 금지 주의).
