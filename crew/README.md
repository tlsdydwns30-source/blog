# 크루(직원 자동화) — 네이버 블로그 글 생산 파이프라인

웹사이트가 아니라 **정해진 순서로 일하는 "직원"들**입니다. A→B→C→D 순서로 돌면
"바로 복사·붙여넣을 세트"(`crew/output/<날짜>-<제목>/PASTE.md`)가 나옵니다.

| 직원 | 파일 | 하는 일 |
|---|---|---|
| **A** | `a-analyze.ts` | 지정한 블로그의 **모든 글 수집 → 1~12월 월별 분류·분석** |
| **B** | `b-topics.ts` | **지금 시기에 맞는 글 주제 5개** 발굴(내 과거 시즌글 + 네이버 키워드/뉴스) |
| **C** | `c-write.ts` | 과거 글들을 **짜깁기해 새 초안** 작성(문장 모방 X, 골격만 + 경험·사진 슬롯 강제) |
| **D** | `d-photos.ts` | 초안의 `[사진:...]` 슬롯마다 **내 사진 1만 장에서 매칭** 추천 |
| **F** | *(미결정)* | 네이버 임시저장 — 지금은 수동 붙여넣기 안내까지. 자동화는 별도 결정 후. |

## 1) 설정 (한 번만)

```bash
cp crew/config.example.json crew/config.json
# config.json 의 "blog" 에 내 네이버 블로그 URL(또는 아이디)만 넣으면 됨
```

`config.json`:
- `blog`: 내 블로그 URL/아이디 **(필수)**
- `category`: 분야(여행/맛집…) — 키워드·글감 힌트
- `location`: 사진 지역 필터(선택, 예 `"오사카"`)
- `topicCount`: B가 뽑을 주제 수(기본 5)
- `bodySampleLimit`: 본문까지 분석할 최대 글 수(기본 120)
- `weaveCount`: C가 짜깁을 과거 글 수(기본 4)

## 2) 필요한 키 (`.env.local`, 루트 `.env.example` 참고)

| 기능 | 키 | 없으면 |
|---|---|---|
| A직원(글 수집) | **불필요**(공개 데이터) | — |
| B·C직원(주제·글쓰기) | `ANTHROPIC_API_KEY` 또는 `OPENAI_API_KEY` | B는 휴리스틱 저품질, C는 중단 |
| B직원 키워드 신호(선택) | `NAVER_AD_API_KEY` 등 | 키워드 신호 없이 진행 |
| D직원(사진 매칭) | `SUPABASE_*` + `EMBED_*` + 사진 색인 | 매칭 건너뛰고 슬롯만 남김 |

사진 색인(1만 장 → 캡션+임베딩 → Supabase)은 기존 스크립트 재사용:
```bash
npm run index-photos -- /사진폴더 [지역명]
```

## 3) 실행

> ⚠️ **A직원은 네이버 접속이 필요합니다.** Claude Code **웹(클라우드) 세션은 네이버를
> 네트워크 정책으로 차단**하므로 A직원이 못 돕니다(fetch·브라우저 모두 프록시에서 막힘).
> **내 PC에서 실행**하거나, 클라우드라면 환경 네트워크 허용목록에 네이버 호스트를
> 추가해야 합니다. (B·C는 Anthropic 키면 클라우드에서도 동작, Groq은 클라우드 차단.)

```bash
npm run crew          # A(7일 이상 지났으면)→B→C(1번 주제)→D → PASTE.md 생성
npm run crew:a        # A만: 전체 글 재수집·월별 분석
npm run crew:b        # B만: 이번 시기 주제 5개
npm run crew:c 2      # C만: 2번 주제로 초안
npm run crew:d        # D만: 최근 초안에 사진 매칭
```

### A직원 수집기 (브라우저 vs HTTP)
- 기본은 **브라우저(내 크롬)** — 네이버 본문이 iframe·JS라 더 안정적. 시스템 크롬을
  자동 사용(`channel:"chrome"`), 없으면 `npx playwright install chromium` 후 사용.
- `CREW_COLLECTOR=http npm run crew:a` — 순수 fetch로 수집(크롬 불필요, 파싱 취약).
- 브라우저 실행이 실패하면 자동으로 HTTP 폴백.

옵션(환경변수):
- `CREW_FORCE_ANALYZE=1` — A직원 강제 재수집
- `CREW_TOPIC=all` — 5개 주제 각각 초안 생성
- `CREW_TOPIC=2` — 2번 주제로

## 4) 산출물

- `crew/data/<blogId>/` — 수집·분석 데이터(posts / by-month / analysis / topics / drafts)
- `crew/output/<날짜>-<제목>/PASTE.md` — **본문 + 사진 배치 가이드 + 경험 슬롯 체크리스트**

`data/`·`output/`·`config.json` 은 개인 데이터라 git에 올리지 않습니다(`.gitignore`).

## 5) 매주 자동 실행

로컬/서버에서 크론 예시(매주 월요일 오전 9시):
```
0 9 * * 1  cd /path/to/blog && npm run crew >> crew/output/cron.log 2>&1
```
Claude Cowork에서는 주간 Routine으로 이 세션에 `npm run crew` 를 실행하도록 걸 수 있습니다.

## 원칙 (스펙 준수)

1. **골격은 빌리고 문장은 새로** — 과거 글을 그대로 복사하지 않음(유사문서 필터 회피).
2. **경험 슬롯은 사람이 채움** — `[내 경험:...]` 안 채우면 발행 금지(체크리스트로 강제).
3. **파서는 깨질 것을 전제** — 네이버 구조 변경 시 실패를 정상 케이스로 처리, 수집 중단 안 함.
4. **사람 속도 수집** — 요청 간 랜덤 딜레이 + User-Agent. 개인 분석 용도.
