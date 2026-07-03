export interface LlmMessage { role: "system" | "user" | "assistant"; content: string; }
export interface LlmResult { used: boolean; provider: string; text?: string; error?: string; }
export interface LlmCallOptions { maxTokens?: number; temperature?: number; }

function jsonHeaders(key: string): Record<string, string> {
  return { "content-type": "application/json", "authorization": `Bearer ${key}` };
}

function safePositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function parseOpenAiCompatibleResponse(response: Response, provider: string): Promise<LlmResult> {
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    return { used: true, provider, error: data.error?.message || data.message || response.statusText || "LLM provider request failed" };
  }
  const text = data.choices?.[0]?.message?.content;
  return text ? { used: true, provider, text } : { used: true, provider, error: "LLM provider returned no answer text." };
}

export async function callOptionalLlm(messages: LlmMessage[], options: LlmCallOptions = {}): Promise<LlmResult> {
  if (process.env.STUDY_BUDDY_USE_LLM !== "true") return { used: false, provider: "deterministic", text: undefined };
  const provider = (process.env.STUDY_BUDDY_LLM_PROVIDER || "openai").toLowerCase();
  const model = process.env.STUDY_BUDDY_LLM_MODEL || "gpt-4.1-mini";
  const maxTokens = options.maxTokens ?? safePositiveInt(process.env.STUDY_BUDDY_LLM_MAX_TOKENS, 900, 128, 1600);
  const temperature = options.temperature ?? 0.2;
  const explicitBase = process.env.STUDY_BUDDY_LLM_BASE_URL;
  const explicitKey = process.env.STUDY_BUDDY_LLM_API_KEY;
  try {
    if (explicitBase && explicitKey) {
      const response = await fetch(`${explicitBase.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: jsonHeaders(explicitKey), body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }) });
      return parseOpenAiCompatibleResponse(response, "custom-openai-compatible");
    }
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: jsonHeaders(process.env.OPENAI_API_KEY), body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }) });
      return parseOpenAiCompatibleResponse(response, provider);
    }
    if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { ...jsonHeaders(process.env.OPENROUTER_API_KEY), "HTTP-Referer": `http://localhost:${process.env.PORT || 7860}`, "X-Title": "Study-Buddy" }, body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }) });
      return parseOpenAiCompatibleResponse(response, provider);
    }
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const system = messages.find(m => m.role === "system")?.content || "";
      const userMessages = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, system, messages: userMessages, max_tokens: maxTokens, temperature }) });
      const data = await response.json() as any;
      if (!response.ok || data.error) return { used: true, provider, error: data.error?.message || response.statusText || "Anthropic request failed" };
      return { used: true, provider, text: data.content?.map((c: any) => c.text).join("\n") || undefined };
    }
    if (provider === "google" && process.env.GOOGLE_API_KEY) {
      const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature } }) });
      const data = await response.json() as any;
      if (!response.ok || data.error) return { used: true, provider, error: data.error?.message || response.statusText || "Google request failed" };
      return { used: true, provider, text: data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n") || undefined };
    }
    return { used: false, provider, error: "Provider not configured. Deterministic evidence composer remains active." };
  } catch (error) {
    return { used: true, provider, error: error instanceof Error ? error.message : String(error) };
  }
}
