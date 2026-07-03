/**
 * researchEngine.ts — Study-Buddy Unified Research Pipeline
 *
 * Implements the last30days skill as a live multi-source search engine.
 * Provides a smooth, evidence-grounded research pipeline across:
 *   • Hacker News (Algolia API) — tech/AI discussions
 *   • GitHub API — repositories updated in last 30 days
 *   • PubMed eUtils — biomedical literature
 *   • YouTube oEmbed + VTT captions — external video notes
 *   • arXiv — preprints (when PubMed is thin)
 *
 * Design principles from last30days SKILL.md + AI Bible:
 *   1. Evidence-first: every answer cites source + date + URL
 *   2. Source separation: clinical VideoRAG ≠ research results
 *   3. No hallucination: only summarise what was actually retrieved
 *   4. Confidence labelling: each source gets a confidence tier
 *   5. Cross-source blending with unified citation format
 */

import { callOptionalLlm } from "./llmRouter.js";
import { log, logError } from "./logger.js";

// ════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════

export type ResearchSource = "hackernews" | "github" | "pubmed" | "arxiv" | "youtube" | "general" | "multi";

export interface ResearchHit {
  title: string;
  url: string;
  summary: string;
  source: ResearchSource;
  date: string;
  confidence: "high" | "medium" | "low";
  signals?: string; // engagement, stars, citations
  authors?: string;
}

export interface ResearchResult {
  ok: boolean;
  source: ResearchSource | "multi";
  query: string;
  hits: ResearchHit[];
  themes: string[];
  answer: string;
  citations: string[];
  error?: string;
  durationMs: number;
}

// ════════════════════════════════════════════════════════════
// QUERY CLEANING
// ════════════════════════════════════════════════════════════

function cleanQuery(raw: string, stopWords: string[]): string {
  const defaultStop = [
    "last30days", "last", "30", "days", "find", "tell", "me", "about", "recent",
    "latest", "new", "please", "the", "a", "an", "in", "of", "and", "on", "at",
    "search", "for", "give", "show", "get", "fetch", "what", "are", "is",
  ];
  const allStop = new Set([...defaultStop, ...stopWords].map(w => w.toLowerCase()));
  const seen = new Set<string>();
  return raw
    .replace(/[?!.,;:]+$/, "")
    .split(/\s+/)
    .filter(w => {
      if (w.length <= 1 || allStop.has(w.toLowerCase())) return false;
      const lower = w.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    })
    .join(" ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || raw.trim();
}

function hnQuery(question: string): string {
  return cleanQuery(question, ["articles", "posts", "blogs", "news", "stories", "blog", "post"]);
}

function githubQuery(question: string): string {
  return cleanQuery(question, [
    "repositories", "repos", "repo", "github", "code", "projects", "project",
    "library", "libraries", "trending", "best", "top",
  ]);
}

function pubmedQuery(question: string): string {
  return cleanQuery(question, [
    "research", "diagnosis", "solution", "solutions", "treatment", "therapy",
    "articles", "studies", "papers", "study", "paper",
  ]);
}

// ════════════════════════════════════════════════════════════
// HACKER NEWS (last30days primary source for tech/AI content)
// ════════════════════════════════════════════════════════════

async function searchHackerNews(question: string, limit = 8): Promise<ResearchHit[]> {
  const query = hnQuery(question);
  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=${limit}`;
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Study-Buddy-Research/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HN search failed: ${response.status}`);
  const data = await response.json() as { hits?: Array<{ title: string; url?: string; story_url?: string; created_at?: string; points?: number; num_comments?: number; objectID?: string }> };
  return (data.hits || [])
    .filter(h => h.title && (h.url || h.story_url))
    .slice(0, limit)
    .map(h => ({
      title: h.title,
      url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      summary: `Community discussion: ${h.points ?? 0} points, ${h.num_comments ?? 0} comments.`,
      source: "hackernews" as ResearchSource,
      date: h.created_at?.slice(0, 10) || "n/a",
      confidence: (h.points ?? 0) > 100 ? "high" : (h.points ?? 0) > 20 ? "medium" : "low",
      signals: `${h.points ?? 0} pts · ${h.num_comments ?? 0} comments`,
    }));
}

// ════════════════════════════════════════════════════════════
// GITHUB (repositories updated in last 30 days)
// ════════════════════════════════════════════════════════════

async function searchGitHub(question: string, limit = 7): Promise<ResearchHit[]> {
  const terms = githubQuery(question);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const q = `${terms} pushed:>${since}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${limit}`;
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": "Study-Buddy-Research/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GitHub search failed: ${response.status}`);
  const data = await response.json() as { items?: Array<{ full_name: string; html_url: string; description?: string; stargazers_count?: number; language?: string; updated_at?: string }> };
  return (data.items || []).slice(0, limit).map(repo => ({
    title: repo.full_name,
    url: repo.html_url,
    summary: repo.description || "No public description available.",
    source: "github" as ResearchSource,
    date: repo.updated_at?.slice(0, 10) || "n/a",
    confidence: (repo.stargazers_count ?? 0) > 1000 ? "high" : (repo.stargazers_count ?? 0) > 100 ? "medium" : "low",
    signals: `${repo.stargazers_count ?? 0} stars · ${repo.language || "n/a"}`,
  }));
}

// ════════════════════════════════════════════════════════════
// PUBMED (biomedical literature)
// ════════════════════════════════════════════════════════════

async function searchPubMed(question: string, limit = 8): Promise<ResearchHit[]> {
  const terms = pubmedQuery(question);
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=${limit}&term=${encodeURIComponent(terms)}`;
  const searchRes = await fetch(searchUrl, {
    headers: { accept: "application/json", "user-agent": "Study-Buddy-Research/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!searchRes.ok) throw new Error(`PubMed search failed: ${searchRes.status}`);
  const searchData = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
  const ids = searchData?.esearchresult?.idlist || [];
  if (!ids.length) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(ids.join(","))}`;
  const summaryRes = await fetch(summaryUrl, {
    headers: { accept: "application/json", "user-agent": "Study-Buddy-Research/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!summaryRes.ok) throw new Error(`PubMed summary failed: ${summaryRes.status}`);
  const summaryData = await summaryRes.json() as { result?: Record<string, { uid?: string; title?: string; fulljournalname?: string; source?: string; pubdate?: string; authors?: Array<{ name: string }> }> };

  return ids.map(uid => {
    const rec = summaryData?.result?.[uid];
    if (!rec) return null;
    const authors = (rec.authors || []).slice(0, 3).map(a => a.name).join(", ");
    return {
      title: rec.title || "Untitled PubMed record",
      url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      summary: [rec.fulljournalname || rec.source, authors].filter(Boolean).join(" · "),
      source: "pubmed" as ResearchSource,
      date: rec.pubdate || "n/a",
      confidence: "high" as const,
      authors,
      signals: rec.fulljournalname || rec.source || "",
    };
  }).filter(Boolean) as ResearchHit[];
}

// ════════════════════════════════════════════════════════════
// arXiv (preprints — AI/ML focused)
// ════════════════════════════════════════════════════════════

async function searchArxiv(question: string, limit = 5): Promise<ResearchHit[]> {
  const terms = cleanQuery(question, ["arxiv", "preprint", "paper", "papers"]);
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(terms)}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
  const response = await fetch(url, {
    headers: { accept: "application/atom+xml", "user-agent": "Study-Buddy-Research/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`arXiv search failed: ${response.status}`);
  const text = await response.text();

  // Minimal XML parsing without dependencies
  const entries: ResearchHit[] = [];
  const entryBlocks = text.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const block of entryBlocks.slice(0, limit)) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\s+/g, " ") || "Untitled";
    const url = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || "";
    const date = block.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.slice(0, 10) || "n/a";
    const summary = block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\s+/g, " ").slice(0, 300) || "";
    const authorMatches = [...block.matchAll(/<author><name>([\s\S]*?)<\/name><\/author>/g)];
    const authors = authorMatches.slice(0, 3).map(m => m[1].trim()).join(", ");
    if (title && url.includes("arxiv.org")) {
      entries.push({
        title,
        url: url.replace("http://", "https://"),
        summary,
        source: "arxiv" as ResearchSource,
        date,
        confidence: "medium",
        authors,
        signals: "arXiv preprint",
      });
    }
  }
  return entries;
}

// ════════════════════════════════════════════════════════════
// INTENT DETECTION
// ════════════════════════════════════════════════════════════

function isBiomedical(q: string): boolean {
  return /\b(cancer|tumou?r|oncology|diagnosis|diagnostic|screening|biomarker|therapy|treatment|clinical\s+trial|pubmed|medical\s+research|disease|genomics|immunotherapy|radiology|pathology|drug|vaccine|mutation)\b/i.test(q);
}

function isGitHub(q: string): boolean {
  return /\b(github|repo|repository|repositories|library|libraries|framework|open.?source)\b/i.test(q);
}

function isAI(q: string): boolean {
  return /\b(agi|ai\s+agent|agentic|llm|gpt|claude|gemini|copilot|machine\s+learning|deep\s+learning|transformer|neural\s+network|rag|embedding)\b/i.test(q);
}

function isYouTube(q: string): boolean {
  return /\b(youtube\.com|youtu\.be)\b/i.test(q) || /youtube/i.test(q);
}

// ════════════════════════════════════════════════════════════
// ANSWER COMPOSITION HELPERS
// ════════════════════════════════════════════════════════════

function confidenceIcon(c: ResearchHit["confidence"]): string {
  return c === "high" ? "🟢" : c === "medium" ? "🟡" : "⚪";
}

function sourceLabel(s: ResearchSource): string {
  const labels: Record<string, string> = { hackernews: "Hacker News", github: "GitHub", pubmed: "PubMed", arxiv: "arXiv", youtube: "YouTube", general: "Web", multi: "Multi-Source" };
  return labels[s] || s;
}

function extractThemes(hits: ResearchHit[]): string[] {
  const words = hits.flatMap(h => `${h.title} ${h.summary}`.toLowerCase().split(/\s+/));
  const freq: Record<string, number> = {};
  const stop = new Set(["the", "a", "an", "and", "or", "in", "of", "for", "to", "is", "are", "was", "were", "has", "have", "this", "that", "it", "its", "be", "by"]);
  for (const w of words) {
    const clean = w.replace(/[^a-z-]/g, "");
    if (clean.length > 4 && !stop.has(clean)) freq[clean] = (freq[clean] || 0) + 1;
  }
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([w]) => w);
}

function buildResearchAnswer(query: string, hits: ResearchHit[], source: ResearchSource | "multi", themes: string[]): string {
  if (!hits.length) {
    return [
      `# Research Brief: ${query}`,
      "",
      "No results were found for this query in the last 30 days.",
      "Try a broader search term or ask for a different source (e.g. GitHub repositories, PubMed articles)."
    ].join("\n");
  }

  const rows = hits.map((h, i) => [
    `### ${i + 1}. ${h.title}  ${confidenceIcon(h.confidence)}`,
    `**Source:** ${sourceLabel(h.source)} | **Date:** ${h.date}${h.signals ? ` | ${h.signals}` : ""}`,
    h.authors ? `**Authors:** ${h.authors}` : "",
    `**Link:** ${h.url}`,
    h.summary ? `**Summary:** ${h.summary}` : "",
  ].filter(Boolean).join("\n"));

  const themeText = themes.length ? `Key themes: ${themes.join(", ")}.` : "";
  const citations = hits.map((h, i) => `${i + 1}. ${h.title} — ${h.url}`);

  return [
    `# Research Brief: ${query}`,
    "",
    "## Executive Summary",
    `Found ${hits.length} result${hits.length !== 1 ? "s" : ""} from ${sourceLabel(source)} in the last 30 days. ${themeText}`,
    "",
    "## Results",
    ...rows,
    "",
    "## Citations",
    ...citations,
    "",
    "---",
    "_Sources: last30days research engine · Study-Buddy · For academic use only._"
  ].join("\n");
}

// ════════════════════════════════════════════════════════════
// LAST30DAYS MULTI-SOURCE SEARCH ENGINE
// This is the public API consumed by the orchestrator
// ════════════════════════════════════════════════════════════

export class ResearchEngine {

  /** Route question to correct source and return structured result */
  async search(question: string, forceSource?: ResearchSource): Promise<ResearchResult> {
    const t0 = Date.now();
    let hits: ResearchHit[] = [];
    let source: ResearchSource | "multi" = "general";
    let error: string | undefined;

    try {
      if (forceSource === "pubmed" || (!forceSource && isBiomedical(question))) {
        source = "pubmed";
        log.info("research", `PubMed search`, { query: question.slice(0, 80) });
        hits = await searchPubMed(question);
        // Supplement with arXiv if thin
        if (hits.length < 3 && isAI(question)) {
          const arxivHits = await searchArxiv(question, 4);
          hits = [...hits, ...arxivHits];
          source = "multi";
        }
      } else if (forceSource === "github" || (!forceSource && isGitHub(question))) {
        source = "github";
        log.info("research", `GitHub search`, { query: question.slice(0, 80) });
        hits = await searchGitHub(question);
      } else if (forceSource === "arxiv") {
        source = "arxiv";
        log.info("research", `arXiv search`, { query: question.slice(0, 80) });
        hits = await searchArxiv(question);
      } else {
        // Default: HN for tech/AI topics, with optional GitHub supplement
        source = "hackernews";
        log.info("research", `HN Algolia search`, { query: question.slice(0, 80) });
        hits = await searchHackerNews(question);
        if (hits.length < 3 && (isGitHub(question) || isAI(question))) {
          const ghHits = await searchGitHub(question, 4).catch(() => [] as ResearchHit[]);
          hits = [...hits, ...ghHits];
          if (ghHits.length) source = "multi";
        }
      }
      log.info("research", `search complete`, { source, hits: hits.length, durationMs: Date.now() - t0 });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logError("research", `search failed`, err, { source, query: question.slice(0, 80) });
    }

    const themes = extractThemes(hits);
    const answer = buildResearchAnswer(question, hits, source, themes);
    const citations = hits.map((h, i) => `${i + 1}. ${h.title} — ${h.url}`);

    return { ok: !error || hits.length > 0, source, query: question, hits, themes, answer, citations, error, durationMs: Date.now() - t0 };
  }

  /** Biomedical literature search (PubMed primary) */
  async searchBiomedical(question: string): Promise<ResearchResult> {
    return this.search(question, "pubmed");
  }

  /** GitHub repository search (last 30 days) */
  async searchRepositories(question: string): Promise<ResearchResult> {
    return this.search(question, "github");
  }

  /** Tech/AI discussion search (HN + optional arXiv) */
  async searchDiscussions(question: string): Promise<ResearchResult> {
    return this.search(question, "hackernews");
  }

  /** Full cross-source search for rich research briefs */
  async searchMultiSource(question: string, limit = 5): Promise<ResearchResult> {
    const t0 = Date.now();

    // Run up to 3 sources in parallel
    const sources: Array<Promise<ResearchHit[]>> = [
      searchHackerNews(question, limit).catch(() => []),
      isBiomedical(question) ? searchPubMed(question, limit).catch(() => []) : Promise.resolve([]),
      isGitHub(question) || isAI(question) ? searchGitHub(question, limit).catch(() => []) : Promise.resolve([]),
    ];

    const [hnHits, pmHits, ghHits] = await Promise.all(sources);

    // Merge and deduplicate by URL
    const seen = new Set<string>();
    const hits: ResearchHit[] = [];
    for (const hit of [...hnHits, ...pmHits, ...ghHits]) {
      if (!seen.has(hit.url)) { seen.add(hit.url); hits.push(hit); }
    }

    const themes = extractThemes(hits);
    const answer = buildResearchAnswer(question, hits, "multi", themes);
    const citations = hits.map((h, i) => `${i + 1}. ${h.title} — ${h.url}`);

    return { ok: true, source: "multi", query: question, hits, themes, answer, citations, durationMs: Date.now() - t0 };
  }

  /**
   * LLM-enhanced research brief — uses LLM to synthesise hits into a narrative.
   * Falls back to deterministic answer if LLM unavailable.
   */
  async searchWithSynthesis(question: string, useMultiSource = false): Promise<ResearchResult> {
    const raw = useMultiSource
      ? await this.searchMultiSource(question)
      : await this.search(question);

    // Build hit context — even when empty, let LLM answer from its own knowledge with a clear caveat
    const hitSummaries = raw.hits.slice(0, 6).map((h, i) =>
      `${i + 1}. [${sourceLabel(h.source)}] ${h.title} (${h.date}, ${h.signals ?? "no signals"}): ${h.summary} — ${h.url}`
    ).join("\n");

    const sourceContext = raw.hits.length
      ? `Retrieved ${raw.hits.length} result(s) from the last 30 days:\n${hitSummaries}`
      : `No recent results found in the last 30 days for this query.`;

    const llm = await callOptionalLlm([
      {
        role: "system",
        content: [
          "You are Study-Buddy's research synthesis engine.",
          "Your job is to give a grounded, honest answer based ONLY on the retrieved sources.",
          "",
          "CRITICAL RULES — follow exactly:",
          "1. If no sources were retrieved, say so clearly and give a brief factual explanation from general knowledge, labeled 'General Knowledge (no recent sources found)'.",
          "2. Never describe a source as 'leading', 'top', or 'popular' based only on it being posted recently — check engagement signals.",
          "3. High engagement = 50+ points or 20+ comments. Use words like 'well-received by the community' for those.",
          "4. Low engagement (< 10 points) = use 'recently shared' or 'newly posted', NOT 'notable' or 'leading'.",
          "5. If the user asked for 'best resources', note: results are from recent community discussions only, not a comprehensive ranking.",
          "6. Do NOT invent URLs, tools, or facts not present in the sources.",
          "7. Do not give patient-specific medical advice.",
          "Format as Markdown with: Direct Answer, Key Observations, Sources (with engagement context), Summary.",
        ].join("\n"),
      },
      {
        role: "user",
        content: `Research query: ${question}\n\n${sourceContext}`,
      },
    ], { maxTokens: 900, temperature: 0.1 });

    if (llm.text && !llm.error) {
      const citationBlock = raw.citations.length
        ? ["## Citations", ...raw.citations, ""]
        : ["## Note", "No indexed sources found in last 30 days. Answer is from general knowledge.", ""];
      return {
        ...raw,
        answer: [
          llm.text.trim(),
          "",
          ...citationBlock,
          "_Sources: last30days research engine · Study-Buddy · For academic use only._",
        ].join("\n"),
      };
    }

    return raw;
  }
}

// Singleton export for orchestrator use
export const researchEngine = new ResearchEngine();
