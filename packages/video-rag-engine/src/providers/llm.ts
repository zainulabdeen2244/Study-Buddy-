import { Answer, Evidence } from "../core/types.js";

export interface AnswerGeneratorProvider {
  name: string;
  status(): Promise<{ ok: boolean; detail: string }>;
  generate(question: string, evidence: Evidence[], draft: Answer): Promise<Answer>;
}

export class OpenAIAnswerProvider implements AnswerGeneratorProvider {
  name = "openai-grounded-answer";
  constructor(private apiKey = process.env.OPENAI_API_KEY, private model = process.env.FORGE_VIDEO_RAG_ANSWER_MODEL || "gpt-4o-mini") {}
  async status() { return { ok: !!this.apiKey, detail: this.apiKey ? `OPENAI_API_KEY configured for ${this.model}` : "OPENAI_API_KEY missing for grounded LLM answers" }; }
  async generate(question: string, evidence: Evidence[], draft: Answer): Promise<Answer> {
    if (!this.apiKey) return draft;
    const evidenceText = evidence.slice(0, 12).map((ev, i) => `[${i+1}] ${ev.modality} ${Math.round(ev.startSec)}-${Math.round(ev.endSec)}s: ${ev.text.slice(0, 700)}`).join("\n");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: "Answer only from provided video evidence. If evidence is weak, say insufficient evidence. Do not invent timestamps or claims." },
          { role: "user", content: `Question: ${question}\n\nEvidence:\n${evidenceText}\n\nWrite a concise grounded answer.` }
        ]
      })
    });
    if (!res.ok) return { ...draft, verifierNotes: [...draft.verifierNotes, `LLM answer provider failed: ${res.status}`] };
    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return draft;
    return { ...draft, answer: text, verifierNotes: [...draft.verifierNotes, `Answer drafted by ${this.name} using ${evidence.length} evidence items.`] };
  }
}
