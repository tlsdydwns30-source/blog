// LLM 호출 추상화 (서버 전용)
//
// 배경(핵심 제약):
//  - 배포된 웹앱은 "호스팅된 API"가 반드시 필요 (로컬 Ollama 등은 서버리스에서 호출 불가).
//  - Claude API는 영구 무료 티어가 없다. 무료로 가려면 OpenAI 호환 무료 티어
//    (Google AI Studio / Gemini, Groq 등)로 교체 가능.
//  - 그래서 provider를 환경변수로 전환할 수 있게 얇게 감싼다. (외부 SDK 의존성 없음 → fetch)
//
// 환경변수:
//   LLM_PROVIDER   = "anthropic" (기본) | "openai"
//   DRAFT_MODEL    = 모델 ID (provider별 기본값 있음)
//   ANTHROPIC_API_KEY               (anthropic)
//   OPENAI_API_KEY  / OPENAI_BASE_URL (openai 호환. base URL로 Gemini/Groq 등 교체)

export interface ChatOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

type Provider = "anthropic" | "openai";

function resolveProvider(): Provider {
  const p = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  return p === "openai" ? "openai" : "anthropic";
}

export function isConfigured(): boolean {
  return resolveProvider() === "openai"
    ? !!process.env.OPENAI_API_KEY
    : !!process.env.ANTHROPIC_API_KEY;
}

export async function chat(opts: ChatOptions): Promise<string> {
  const provider = resolveProvider();
  return provider === "openai" ? chatOpenAI(opts) : chatAnthropic(opts);
}

async function chatAnthropic(opts: ChatOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 가 설정되지 않았습니다.");
  const model = process.env.DRAFT_MODEL || "claude-sonnet-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });

  if (!res.ok) {
    const detail = await safeErr(res);
    throw new Error(`Anthropic API 오류 (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("")
    : "";
  return text.trim();
}

// 한국어 품질 좋은 순으로 시도. 계정에서 접근 안 되는(404) 모델은 건너뛰고
// 다음 모델로 자동 폴백한다. Groq 무료 티어 계정별 접근 모델이 달라서 필요.
const OPENAI_MODEL_CHAIN = [
  "moonshotai/kimi-k2-instruct",
  "openai/gpt-oss-120b",
  "qwen/qwen3-32b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

async function chatOpenAI(opts: ChatOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 가 설정되지 않았습니다.");
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  // DRAFT_MODEL 이 지정돼 있으면 그걸 최우선으로 시도한 뒤 체인으로 폴백.
  const preferred = process.env.DRAFT_MODEL?.trim();
  const models = [preferred, ...OPENAI_MODEL_CHAIN].filter(
    (m, i, a): m is string => !!m && a.indexOf(m) === i
  );

  let lastErr = "";
  for (const model of models) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return (data?.choices?.[0]?.message?.content ?? "").trim();
    }

    const detail = await safeErr(res);
    lastErr = `${model} (${res.status}): ${detail}`;
    // 인증 오류면 다른 모델을 시도해도 소용없음 → 중단.
    if (res.status === 401 || res.status === 403) break;
    // 그 외(404 model_not_found, 400, 429 등)는 다음 모델로 폴백.
  }

  throw new Error(`OpenAI 호환 API 오류 — 모든 후보 모델 실패. 마지막: ${lastErr}`);
}

async function safeErr(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return res.statusText;
  }
}
