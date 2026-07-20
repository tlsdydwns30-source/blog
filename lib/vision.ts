// 이미지 캡션 생성 helper (서버/스크립트 전용)
//
// 사진 1장 → "이 사진이 무엇인지" 한국어 캡션. (색인 시 사용)
// OpenAI 호환 vision 채팅 엔드포인트 사용 (OpenAI gpt-4o-mini, 또는 Gemini OpenAI 호환 등).
//
// 환경변수:
//   VISION_API_KEY   (없으면 OPENAI_API_KEY)
//   VISION_BASE_URL  기본 https://api.openai.com/v1
//   VISION_MODEL     기본 gpt-4o-mini
//
// dataUrl: "data:image/jpeg;base64,...." 형태

export async function captionImage(dataUrl: string): Promise<string> {
  const apiKey = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("VISION_API_KEY(또는 OPENAI_API_KEY) 미설정");
  const baseUrl = process.env.VISION_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.VISION_MODEL || "gpt-4o-mini";

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 120,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "이 사진을 검색에 쓸 수 있게 한국어로 한 문장으로 묘사해줘. 장소·사물·분위기·색감 키워드를 포함하되 25자~60자로 간결하게.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Vision API 오류 (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}
