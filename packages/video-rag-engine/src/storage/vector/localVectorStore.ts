import { VectorRow } from "../../core/types.js";

export interface VectorSearchHit { vector: VectorRow; score: number; }

function cosine(a: number[], b: number[]): number {
  let dot = 0, an = 0, bn = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; an += a[i] * a[i]; bn += b[i] * b[i]; }
  return dot / ((Math.sqrt(an) || 1) * (Math.sqrt(bn) || 1));
}

export class LocalVectorStore {
  private rows: VectorRow[] = [];
  constructor(initialRows: VectorRow[] = []) { this.rows = [...initialRows]; }
  upsert(rows: VectorRow[]): void {
    const byId = new Map(this.rows.map(r => [r.id, r]));
    for (const row of rows) byId.set(row.id, row);
    this.rows = [...byId.values()];
  }
  search(collectionId: string, queryVector: number[], topK = 10): VectorSearchHit[] {
    return this.rows
      .filter(r => r.collectionId === collectionId)
      .map(vector => ({ vector, score: cosine(queryVector, vector.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
