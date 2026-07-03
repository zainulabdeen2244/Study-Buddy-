import fs from "node:fs";

export interface VisionCaptionResult { text: string; confidence: number; provider: string; }
export interface VisionCaptionProvider {
  name: string;
  status(): Promise<{ ok: boolean; detail: string }>;
  caption(imagePath: string, context?: Record<string, unknown>): Promise<VisionCaptionResult>;
}

export class OpenAIVisionCaptionProvider implements VisionCaptionProvider {
  name = "openai-vision-caption";
  constructor(private apiKey = process.env.OPENAI_API_KEY, private model = process.env.FORGE_VIDEO_RAG_VISION_MODEL || "gpt-4o-mini") {}
  async status() {
    return { ok: !!this.apiKey, detail: this.apiKey ? `OPENAI_API_KEY configured for ${this.model}` : "OPENAI_API_KEY missing for vision captions" };
  }
  async caption(imagePath: string, context: Record<string, unknown> = {}): Promise<VisionCaptionResult> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY missing for OpenAI vision caption provider");
    const bytes = fs.readFileSync(imagePath);
    const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const b64 = Buffer.from(bytes).toString("base64");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Describe this video frame for retrieval. Mention visible UI text, diagrams, objects, actions, and context. Timestamp/context: ${JSON.stringify(context)}` },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }
          ]
        }]
      })
    });
    if (!res.ok) throw new Error(`OpenAI vision caption failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenAI vision caption returned empty content");
    return { text, confidence: 0.78, provider: this.name };
  }
}
