-- blog-workflow-tool · Supabase 스키마
-- 적용: Supabase 프로젝트 생성 후 SQL Editor에 붙여넣어 실행하거나
--       supabase db push (CLI 마이그레이션)로 반영.
--
-- ⚠️ 임베딩 차원(vector(1536))은 사용하는 임베딩 모델과 반드시 일치시킬 것.
--    예) OpenAI text-embedding-3-small = 1536. 모델 변경 시 여기와 index-photos 둘 다 수정.

-- pgvector 확장
create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────
-- 1) keywords : 골든키워드 조사 결과 (선택적 저장)
--    ratio 는 generated column (문서수 ÷ 검색량, 낮을수록 황금)
-- ─────────────────────────────────────────────────────────────
create table if not exists keywords (
  id          bigint generated always as identity primary key,
  keyword     text not null,
  search_vol  integer not null,
  doc_count   integer not null,
  ratio       numeric generated always as (
                case when search_vol > 0
                     then doc_count::numeric / search_vol
                     else null end
              ) stored,
  created_at  timestamptz not null default now(),
  unique (keyword)
);
create index if not exists keywords_ratio_idx on keywords (ratio);

-- ─────────────────────────────────────────────────────────────
-- 2) prices : 가격 스냅샷 (매일 누적)
-- ─────────────────────────────────────────────────────────────
create table if not exists prices (
  id          bigint generated always as identity primary key,
  product     text not null,
  site        text not null,
  price       integer,
  scraped_at  timestamptz not null default now()
);
create index if not exists prices_product_idx on prices (product, scraped_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3) top_posts : 상위노출 글 분석 결과
-- ─────────────────────────────────────────────────────────────
create table if not exists top_posts (
  id          bigint generated always as identity primary key,
  keyword     text not null,
  rank        integer,
  title       text,
  url         text,
  analysis    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists top_posts_keyword_idx on top_posts (keyword, rank);

-- ─────────────────────────────────────────────────────────────
-- 4) photos : 사진 라이브러리 (캡션 + 임베딩)
-- ─────────────────────────────────────────────────────────────
create table if not exists photos (
  id            bigint generated always as identity primary key,
  storage_path  text not null unique,   -- Supabase Storage 경로
  caption       text,
  location      text,                    -- 지역 필터용 (예: "오사카"). GPS→역지오코딩 자동 태깅
  lat           double precision,        -- EXIF GPS 위도 (있으면)
  lng           double precision,        -- EXIF GPS 경도 (있으면)
  embedding     vector(1536),
  created_at    timestamptz not null default now()
);

-- 수만 장 규모: ivfflat (코사인). 대량 데이터 적재 후 인덱스 생성 권장.
--   lists 는 √(행수) 근처에서 시작해 튜닝. hnsw 대비 색인 빠르고 메모리 적음.
--   (정확도/지연이 중요하면 hnsw 로 교체 검토 — README 9번 항목 참고)
create index if not exists photos_embedding_idx
  on photos using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index if not exists photos_location_idx on photos (location);

-- ─────────────────────────────────────────────────────────────
-- 5) posts : 생성된 초안
-- ─────────────────────────────────────────────────────────────
create table if not exists posts (
  id            bigint generated always as identity primary key,
  main_keyword  text not null,
  sub_keywords  text[] default '{}',
  body          text,
  photo_ids     bigint[] default '{}',
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 6) match_photos RPC : 코사인 유사도 사진 검색
--    filter_location 이 주어지면 해당 지역으로 사전 필터.
-- ─────────────────────────────────────────────────────────────
create or replace function match_photos(
  query_embedding  vector(1536),
  match_count      int default 3,
  filter_location  text default null
)
returns table (
  id            bigint,
  storage_path  text,
  caption       text,
  location      text,
  similarity    float
)
language sql stable
as $$
  select
    p.id,
    p.storage_path,
    p.caption,
    p.location,
    1 - (p.embedding <=> query_embedding) as similarity
  from photos p
  where p.embedding is not null
    and (filter_location is null or p.location = filter_location)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
