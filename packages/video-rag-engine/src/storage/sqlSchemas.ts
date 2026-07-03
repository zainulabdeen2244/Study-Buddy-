export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  duration_sec REAL NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  modality TEXT NOT NULL,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  text TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_collection_modality ON evidence(collection_id, modality);
CREATE INDEX IF NOT EXISTS idx_evidence_time ON evidence(video_id, start_sec, end_sec);
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_dedupe ON evidence(collection_id, video_id, fingerprint, start_sec);
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection_id);
CREATE TABLE IF NOT EXISTS memory_nodes (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  video_id TEXT,
  level TEXT NOT NULL,
  start_sec REAL,
  end_sec REAL,
  text TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  progress REAL NOT NULL,
  stage TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const POSTGRES_PGVECTOR_SCHEMA = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS forge_video_evidence (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  modality TEXT NOT NULL,
  start_sec DOUBLE PRECISION NOT NULL,
  end_sec DOUBLE PRECISION NOT NULL,
  text TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS forge_video_vectors (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL REFERENCES forge_video_evidence(id) ON DELETE CASCADE,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forge_video_vectors_hnsw ON forge_video_vectors USING hnsw (embedding vector_cosine_ops);
`;
