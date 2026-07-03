import crypto from "node:crypto";
import { clamp, normalizeText } from "../core/utils.js";

export interface EmbeddingProvider {
  name: string;
  dims: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  name = "hash-embedding-local";
  constructor(public dims = 384) {}
  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dims).fill(0);
    const tokens = normalizeText(text).split(" ").filter(Boolean);
    for (const token of tokens) {
      const digest = crypto.createHash("sha256").update(token).digest();
      const idx = digest.readUInt32BE(0) % this.dims;
      const sign = digest[4] % 2 === 0 ? 1 : -1;
      vector[idx] += sign * (1 + clamp(token.length / 12, 0, 1));
    }
    const norm = Math.sqrt(vector.reduce((s, v) => s + v*v, 0)) || 1;
    return vector.map(v => v / norm);
  }
  async embedMany(texts: string[]): Promise<number[][]> { return Promise.all(texts.map(t => this.embed(t))); }
}

export class ExternalHttpEmbeddingProvider implements EmbeddingProvider {
  name = "external-http-embedding";
  constructor(public endpoint: string, public apiKey: string | undefined, public dims = 1536) {}
  async embed(text: string): Promise<number[]> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ input: text })
    });
    if (!res.ok) throw new Error(`Embedding endpoint failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { embedding?: number[]; data?: Array<{ embedding: number[] }> };
    const vector = data.embedding || data.data?.[0]?.embedding;
    if (!vector) throw new Error("Embedding endpoint returned no vector");
    return vector;
  }
  async embedMany(texts: string[]): Promise<number[][]> { return Promise.all(texts.map(t => this.embed(t))); }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = "openai-embedding";
  constructor(private apiKey = process.env.OPENAI_API_KEY, private model = process.env.FORGE_VIDEO_RAG_EMBED_MODEL || "text-embedding-3-small", public dims = Number(process.env.FORGE_VIDEO_RAG_OPENAI_EMBED_DIMS || 1536)) {}
  async status() { return { ok: !!this.apiKey, detail: this.apiKey ? `OPENAI_API_KEY configured for ${this.model}` : "OPENAI_API_KEY missing for OpenAI embeddings" }; }
  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY missing for OpenAI embeddings");
    const res = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, input: text }) });
    if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const vector = data.data?.[0]?.embedding;
    if (!Array.isArray(vector)) throw new Error("OpenAI embeddings returned no vector");
    return vector;
  }
  async embedMany(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY missing for OpenAI embeddings");
    if (texts.length === 0) return [];
    const res = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, input: texts }) });
    if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const rows = Array.isArray(data.data) ? data.data : [];
    if (rows.length !== texts.length) throw new Error("OpenAI embeddings returned unexpected row count");
    return rows.map((r: any) => r.embedding);
  }
}
