export type ProviderName = "openai" | "anthropic" | "google" | "aws-bedrock" | "openrouter" | "kimi" | "minimax" | "moonshot" | "custom-openai-compatible";

export interface ProviderRecord {
  name: ProviderName;
  label: string;
  configured: boolean;
  envKeys: string[];
  mode: "chat" | "embedding" | "transcription" | "foundation-model";
  note: string;
}

function has(keys: string[]): boolean { return keys.some(k => !!process.env[k]); }

export function providerVault(): ProviderRecord[] {
  return [
    { name: "openai", label: "OpenAI", configured: has(["OPENAI_API_KEY"]), envKeys: ["OPENAI_API_KEY"], mode: "chat", note: "Can power answer composition, embeddings, and transcription when enabled." },
    { name: "anthropic", label: "Anthropic", configured: has(["ANTHROPIC_API_KEY"]), envKeys: ["ANTHROPIC_API_KEY"], mode: "chat", note: "Can power answer composition through provider bridge." },
    { name: "google", label: "Google Gemini", configured: has(["GOOGLE_API_KEY"]), envKeys: ["GOOGLE_API_KEY"], mode: "chat", note: "Can power answer composition through provider bridge." },
    { name: "aws-bedrock", label: "AWS Bedrock", configured: has(["AWS_ACCESS_KEY_ID", "AWS_PROFILE"]), envKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"], mode: "foundation-model", note: "Provider status only in this no-dependency build; call bridge can be added with AWS SDK." },
    { name: "openrouter", label: "OpenRouter", configured: has(["OPENROUTER_API_KEY"]), envKeys: ["OPENROUTER_API_KEY"], mode: "chat", note: "OpenAI-compatible chat route." },
    { name: "kimi", label: "Kimi", configured: has(["KIMI_API_KEY"]), envKeys: ["KIMI_API_KEY"], mode: "chat", note: "Use STUDY_BUDDY_LLM_BASE_URL for exact hosted endpoint." },
    { name: "minimax", label: "MiniMax", configured: has(["MINIMAX_API_KEY"]), envKeys: ["MINIMAX_API_KEY"], mode: "chat", note: "Use STUDY_BUDDY_LLM_BASE_URL for exact hosted endpoint." },
    { name: "moonshot", label: "Moonshot AI", configured: has(["MOONSHOT_API_KEY"]), envKeys: ["MOONSHOT_API_KEY"], mode: "chat", note: "OpenAI-compatible when base URL is configured." },
    { name: "custom-openai-compatible", label: "Custom OpenAI-compatible", configured: has(["STUDY_BUDDY_LLM_API_KEY"]) && !!process.env.STUDY_BUDDY_LLM_BASE_URL, envKeys: ["STUDY_BUDDY_LLM_BASE_URL", "STUDY_BUDDY_LLM_API_KEY"], mode: "chat", note: "One switch for Kimi, Moonshot, OpenRouter, self-hosted gateways, etc." }
  ];
}
