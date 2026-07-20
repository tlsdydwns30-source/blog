// 텍스트 임베딩 helper (서버 전용)
//
// 주의: 임베딩은 LLM(초안용 Groq)과 별개 서비스예요.
//  - Groq 은 임베딩을 제공하지 않으므로 임베딩 전용 키가 필요합니다.
//  - OpenAI 호환 /embeddings 엔드포인트를 사용 (OpenAI, 또는 호환 제공자).
//
// 환경변수:
//   EMBED_API_KEY    임베딩 API 키 (없으면 OPENAI_API_KEY 사용)
//   EMBED_BASE_URL   기본 https://api.openai.com/v1
//   EMBED_MODEL      기본 text-embedding-3-small (1536차원 → schema.sql 과 일치)
//
// ⚠️ 임베딩 차원(vector(1536))은 사용 모델과 반드시 일치시킬 것.

export async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.EMBED_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("EMBED_API_KEY(또는 OPENAI_API_KEY) 미설정");
  const baseUrl = process.env.EMBED_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.EMBED_MODEL || "text-embedding-3-small";

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text.slice(0, 8000) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`임베딩 API 오류 (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const v = data.data?.[0]?.embedding;
  if (!v) throw new Error("임베딩 응답이 비었습니다.");
  return v;
}
