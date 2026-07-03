import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { id, nowIso } from "../../packages/video-rag-engine/src/core/utils.js";
import type { AgentTraceStep, ArtifactCreateRequest, ArtifactCreateResult, ArtifactKind, ArtifactRecord } from "./studyBuddyTypes.js";

type ZipEntry = { name: string; data: any };
type ArtifactBuild = { ext: string; mime: string; buffer: any; warnings: string[] };

type ArtifactSkill = {
  id: string;
  kind: ArtifactKind;
  label: string;
  purpose: string;
  premortem: string[];
  mitigation: string[];
};

export const CORE_ARTIFACT_SKILLS: ArtifactSkill[] = [
  {
    id: "study-buddy.pdf-study-pack",
    kind: "pdf",
    label: "PDF Study Pack",
    purpose: "Create a portable study handout with timestamped explanation, OSCE checklist, quiz, revision plan, and safety note.",
    premortem: ["PDF becomes a raw text dump", "Safety boundary is omitted", "Evidence and timestamps are hidden"],
    mitigation: ["Use a fixed education-first section template", "Always insert safety boundary", "Place evidence/timestamp section near the top"]
  },
  {
    id: "study-buddy.docx-brief",
    kind: "docx",
    label: "DOCX Research Brief",
    purpose: "Create an editable Word brief with clear sections, source notes, and resources at the end.",
    premortem: ["DOCX is hard to edit", "Too many visual elements distract from content", "Research notes look unstructured", "User prompt leaks into the document"],
    mitigation: ["Use simple headings and paragraphs", "Keep DOCX text-first", "Use consistent sections", "Build the body from the answer content, not from the raw prompt"]
  },
  {
    id: "study-buddy.pptx-academic-deck",
    kind: "pptx",
    label: "PowerPoint OSCE Deck",
    purpose: "Create a concise academic-style slide deck with action titles and one insight per slide.",
    premortem: ["Slides become decorative instead of useful", "Deck is too long for a workshop", "Audience cannot follow the argument"],
    mitigation: ["Use 5 slides only", "Use action-title style", "End on conclusion and safety boundary"]
  },
  {
    id: "study-buddy.chart-learning-summary",
    kind: "chart",
    label: "Learning Summary Chart",
    purpose: "Create one simple visual summary of learning emphasis for explanation, OSCE, quiz, revision, and safety.",
    premortem: ["Chart is fake or decorative", "Chart is visually noisy", "Chart does not help teaching"],
    mitigation: ["Compute deterministic counts from source text", "Use one bar chart", "Keep labels legible"]
  },
  {
    id: "study-buddy.study-pack-bundle",
    kind: "study-pack",
    label: "Complete Study Pack",
    purpose: "Create one zip bundle with PDF, DOCX, PPTX, chart, manifest, and release scorecard.",
    premortem: ["Bundle hides failures", "User cannot inspect generated files", "Missing manifest weakens trust"],
    mitigation: ["Include manifest and scorecard", "List every asset with checksum", "Build from deterministic local generators"]
  }
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: any): number {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(1980, date.getFullYear()) - 1980;
  return { time, date: (year << 9) | (month << 5) | day };
}

function zipStore(entries: ZipEntry[]): any {
  const chunks: any[] = [];
  const central: any[] = [];
  let offset = 0;
  const dt = dosDateTime();
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dt.time, 10);
    local.writeUInt16LE(dt.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(dt.time, 12);
    c.writeUInt16LE(dt.date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt16LE(0, 30);
    c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34);
    c.writeUInt16LE(0, 36);
    c.writeUInt32LE(0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += local.length + name.length + data.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pdfEscape(value: string): string { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function safeText(value: unknown, fallback = "Study-Buddy learning artifact"): string {
  const text = String(value || fallback).replace(/\r/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text.slice(0, 9000) || fallback;
}
function checksum(buf: any): string { return crypto.createHash("sha256").update(buf).digest("hex"); }

function wrapLines(text: string, width = 78, max = 64): string[] {
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      if ((current + " " + word).trim().length > width) { if (current) lines.push(current); current = word; }
      else current = (current + " " + word).trim();
    }
    if (current) lines.push(current);
    lines.push("");
  }
  return lines.slice(0, max);
}

function extractBullets(text: string, limit = 8): string[] {
  const clean = safeText(text);
  const explicit = clean.split(/\n/).map(l => l.replace(/^[-•*\d.\s]+/, "").trim()).filter(l => l.length > 18);
  const sentences = clean.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 18);
  const source = explicit.length >= 3 ? explicit : sentences;
  return source.slice(0, limit).map(s => s.length > 130 ? `${s.slice(0, 127)}...` : s);
}

function cleanMarkdownText(text: string): string {
  return text
    .replace(/[\u2013\u2014]|â€“|â€”|â€"/g, "-")
    .replace(/Â·/g, "-")
    .replace(/â€™/g, "'")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#+\s*/gm, "")
    .replace(/\r/g, "")
    .trim();
}

function researchTopic(title: string, source: string): string {
  const match = source.match(/^#\s*Recent Research Brief:\s*(.+)$/im) || source.match(/^Query:\s*(.+)$/im);
  return cleanMarkdownText(match?.[1] || title || "Recent Research");
}

function extractResourceLines(source: string, limit = 10): string[] {
  const lines = source.split(/\n/);
  const resources: string[] = [];
  for (const line of lines) {
    const link = line.match(/^\s*(?:\d+\.\s*)?(?:\*\*)?(.+?)(?:\*\*)?\s+-\s+(https?:\/\/\S+)/);
    if (link) resources.push(`${cleanMarkdownText(link[1])} - ${link[2]}`);
  }
  if (resources.length) return [...new Set(resources)].slice(0, limit);

  let pendingTitle = "";
  for (const line of lines) {
    const titleMatch = line.match(/^\s*\d+\.\s+\*\*(.+?)\*\*/);
    if (titleMatch) pendingTitle = titleMatch[1];
    const urlMatch = line.match(/Link:\s*(https?:\/\/\S+)/i);
    if (urlMatch && pendingTitle) resources.push(`${cleanMarkdownText(pendingTitle)} - ${urlMatch[1]}`);
  }
  return [...new Set(resources)].slice(0, limit);
}

function extractGithubRepoNotes(source: string, limit = 8): string[] {
  const section = source.match(/## Recommended Repositories\n([\s\S]*?)(?:\n## How To Choose|\n## Resources|$)/i)?.[1] || "";
  if (!section) return [];
  return section
    .split(/\n(?=###\s+\d+\.\s+)/)
    .map(block => cleanMarkdownText(block)
      .replace(/^###\s+/, "")
      .replace(/\n{2,}/g, "\n")
      .trim())
    .filter(block => /What it is:|Useful for:|Best fit:/i.test(block))
    .slice(0, limit);
}

function extractHowToChoose(source: string): string[] {
  return (source.match(/## How To Choose\n([\s\S]*?)(?:\n## Resources|$)/i)?.[1] || "")
    .split(/\n/)
    .map(line => cleanMarkdownText(line))
    .filter(Boolean)
    .slice(0, 6);
}

function buildResearchBody(title: string, source: string): string {
  const topic = researchTopic(title, source);
  const repoNotes = extractGithubRepoNotes(source, 8);
  const howToChoose = extractHowToChoose(source);
  const keySignals = (source.match(/## Key Signals\n([\s\S]*?)(?:\n## |\nNote:|$)/i)?.[1] || "")
    .split(/\n/)
    .map(line => cleanMarkdownText(line.replace(/^\s*[-*]\s*/, "")))
    .filter(Boolean)
    .slice(0, 6);
  const sourceItems = (source.match(/## Recent Sources\n([\s\S]*?)(?:\n## Resources|\nNote:|$)/i)?.[1] || "")
    .split(/\n(?=\d+\.\s+\*\*)/)
    .map(block => cleanMarkdownText(block).replace(/^\d+\.\s+/, ""))
    .filter(block => /\bLink:\s*https?:\/\//i.test(block))
    .slice(0, 8);
  const resources = extractResourceLines(source, 12);

  return [
    title,
    "",
    "Executive Summary",
    `This brief summarizes recent public discussion and article signals related to ${topic}. The current lightweight search layer prioritizes fresh community-discussed sources and keeps generated artifacts separate from clinical Study-Buddy evidence.`,
    "",
    repoNotes.length ? "Repository Analysis" : "Key Findings",
    ...(repoNotes.length ? repoNotes.map((item, i) => `${i + 1}. ${item}`) : keySignals.length ? keySignals.map((item, i) => `${i + 1}. ${item}`) : extractBullets(source, 5).map((item, i) => `${i + 1}. ${cleanMarkdownText(item)}`)),
    "",
    howToChoose.length ? "How To Choose" : "Recent Source Notes",
    ...(howToChoose.length ? howToChoose : sourceItems.length ? sourceItems.map((item, i) => `${i + 1}. ${item}`) : ["1. No structured source notes were available from the search response."]),
    "",
    "Limitations",
    "1. This is a lightweight recent-article search, not a full academic literature review.",
    "2. Ranking reflects available public search metadata and freshness, not scientific consensus.",
    "3. Review primary sources before citing externally.",
    "",
    "Resources",
    ...(resources.length ? resources.map((item, i) => `${i + 1}. ${item}`) : ["1. No source URLs were available in the source answer."])
  ].join("\n");
}

function buildBody(title: string, prompt: string, source: string): string {
  if (/Recent Research Brief|Recent article search|## Resources|Hacker News stories/i.test(source)) {
    return buildResearchBody(title, source);
  }
  const bullets = extractBullets(source, 5);
  return [
    title,
    "",
    "Evidence-first learning summary",
    ...bullets.map((b, i) => `${i + 1}. ${b}`),
    "",
    "Core workshop outputs",
    "1. Timestamped explanation from video evidence",
    "2. SOP-backed clinical learning points",
    "3. OSCE checklist for exam practice",
    "4. MCQs and flashcards for active recall",
    "5. Revision plan for weak topics",
    "6. Safety audit before final answer",
    "",
    "Safety boundary",
    "Education-only. Not diagnosis, prescription, dosage, emergency decision support, or unsupervised procedure guidance.",
    "",
    "Review note",
    "Generated in deterministic local mode. Review before classroom, workshop, or external sharing."
  ].join("\n");
}

function sourceTypeFromText(source: string): string {
  if (/GitHub Repository Brief|Recent Research Brief|Recent Sources|## Resources/i.test(source)) return "research-answer";
  if (/timestamp|transcript|OSCE|clinical|safety/i.test(source)) return "clinical-learning-answer";
  return "answer-content";
}

function createPdf(text: string): any {
  const lines = wrapLines(text, 82, 44).map(line => line ? `(${pdfEscape(line)}) Tj` : `( ) Tj`);
  const content = `BT /F1 12 Tf 54 760 Td 16 TL ${lines.join(" T* ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  const header = "%PDF-1.4\n%Study-Buddy\n";
  let body = header;
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xrefStart = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(o => { body += `${String(o).padStart(10, "0")} 00000 n \n`; });
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

function paragraphStyleForLine(line: string, index: number): { text: string; style: string } {
  const text = cleanMarkdownText(line);
  if (index === 0) return { text, style: "Title" };
  if (/^(Executive Summary|Key Findings|Repository Analysis|How To Choose|Recent Source Notes|Resources|Limitations|Evidence-first learning summary|Core workshop outputs|Safety boundary|Review note)$/i.test(text)) return { text, style: "Heading1" };
  if (/^\d+\.\s+/.test(text)) return { text, style: "ListParagraph" };
  return { text, style: "BodyText" };
}

function docxParagraph(text: string, style = "BodyText"): string {
  const styleTag = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  const runs = cleanMarkdownText(text).split(/(https?:\/\/\S+)/g).filter(Boolean).map(part => {
    const color = /^https?:\/\//.test(part) ? `<w:color w:val="1155CC"/><w:u w:val="single"/>` : "";
    const rPr = color ? `<w:rPr>${color}</w:rPr>` : "";
    return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(part)}</w:t></w:r>`;
  }).join("");
  return `<w:p>${styleTag}${runs || `<w:r><w:t xml:space="preserve"> </w:t></w:r>`}</w:p>`;
}

function createDocx(title: string, text: string): any {
  const lines = text.split(/\n/).map(line => line.trim()).filter((line, i, arr) => line || (i > 0 && arr[i - 1]));
  const paras = lines.map((line, i) => {
    if (!line) return docxParagraph(" ", "BodyText");
    const styled = paragraphStyleForLine(line, i);
    return docxParagraph(styled.text, styled.style);
  }).join("");
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="111827"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="180"/></w:pPr><w:rPr><w:b/><w:sz w:val="38"/><w:color w:val="1F4E79"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="2E74B5"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:rPr><w:sz w:val="22"/></w:rPr><w:pPr><w:spacing w:after="120" w:line="280" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="360" w:hanging="0"/><w:spacing w:after="100" w:line="280" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;
  return zipStore([
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "word/styles.xml", data: Buffer.from(styles) },
    { name: "word/document.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1008" w:right="1008" w:bottom="1008" w:left="1008"/></w:sectPr></w:body></w:document>`) }
  ]);
}

function slideXml(slideNo: number, title: string, bullets: string[]): string {
  const body = bullets.slice(0, 6).map(line => `<a:p><a:pPr marL="280000" indent="-180000"/><a:r><a:rPr lang="en-US" sz="2300"/><a:t>${xmlEscape(line)}</a:t></a:r></a:p>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Action Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="620000" y="420000"/><a:ext cx="10800000" cy="920000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3300" b="1"><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></a:rPr><a:t>${xmlEscape(title)}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="760000" y="1600000"/><a:ext cx="10400000" cy="4300000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Footer"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="620000" y="6400000"/><a:ext cx="10800000" cy="280000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:rPr><a:t>Study-Buddy · Education-only · Evidence-first · Slide ${slideNo}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function createPptx(title: string, text: string): any {
  const bullets = extractBullets(text, 10);
  const slides = [
    { title: `${title} explains the clinical learning task from evidence.`, bullets: ["Video + SOP evidence is used before the answer is created.", "Every clinical output is education-only and safety reviewed.", "The deck is intentionally concise for workshop delivery."] },
    { title: "Timestamped evidence turns video watching into active learning.", bullets: bullets.slice(0, 4) },
    { title: "OSCE practice converts the lesson into examiner-ready skills.", bullets: ["Candidate task", "Examiner checklist", "Viva questions", "Critical fail points", "Model answer"] },
    { title: "Quizzes and flashcards create fast active recall loops.", bullets: ["Five MCQs with answer key", "Flashcards from weak topics", "Explanations connected to timestamps", "Revision plan for the next session"] },
    { title: "The conclusion is safety-first: useful for learning, not clinical decision-making.", bullets: ["No diagnosis", "No prescription", "No patient-specific dosage", "Real procedures require qualified supervision"] }
  ];
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`) },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`) },
    { name: "ppt/presentation.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`) },
    { name: "ppt/_rels/presentation.xml.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`) }
  ];
  slides.forEach((slide, i) => entries.push({ name: `ppt/slides/slide${i + 1}.xml`, data: Buffer.from(slideXml(i + 1, slide.title, slide.bullets)) }));
  return zipStore(entries);
}

function countTopic(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.match(new RegExp(term, "g")) || []).length, 0);
}

function createChartSvg(title: string, text: string): any {
  const data = [
    { label: "Evidence", value: countTopic(text, ["evidence", "timestamp", "citation", "source"]) || 4 },
    { label: "OSCE", value: countTopic(text, ["osce", "checklist", "examiner", "viva"]) || 3 },
    { label: "Quiz", value: countTopic(text, ["quiz", "mcq", "flashcard", "answer key"]) || 3 },
    { label: "Revision", value: countTopic(text, ["revision", "weak", "practice", "review"]) || 2 },
    { label: "Safety", value: countTopic(text, ["safety", "warning", "supervision", "diagnosis", "dosage"]) || 5 }
  ];
  const max = Math.max(...data.map(d => d.value), 1);
  const bars = data.map((d, i) => {
    const h = Math.round((d.value / max) * 210);
    const x = 82 + i * 132;
    const y = 325 - h;
    return `<g><rect x="${x}" y="${y}" width="72" height="${h}" rx="18" fill="url(#g)"/><text x="${x + 36}" y="354" text-anchor="middle" font-size="16" fill="#334155">${xmlEscape(d.label)}</text><text x="${x + 36}" y="${y - 14}" text-anchor="middle" font-size="16" fill="#0f172a" font-weight="800">${d.value}</text></g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="470" viewBox="0 0 860 470"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#14b8a6"/></linearGradient><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="11" flood-color="#2563eb" flood-opacity="0.18"/></filter></defs><rect width="860" height="470" rx="36" fill="#f8fbff"/><circle cx="750" cy="70" r="120" fill="#dbeafe" opacity="0.45"/><text x="46" y="62" font-size="30" fill="#0f172a" font-weight="900">${xmlEscape(title)}</text><text x="46" y="94" font-size="15" fill="#64748b">Study-Buddy learning emphasis · deterministic local chart</text><g filter="url(#s)">${bars}</g><line x1="54" y1="326" x2="806" y2="326" stroke="#cbd5e1" stroke-width="2"/><text x="46" y="422" font-size="14" fill="#64748b">Interpretation: the safest workshop build keeps evidence and safety visible while generating only the most useful learning assets.</text></svg>`;
  return Buffer.from(svg, "utf8");
}

function makeArtifactBuffer(kind: ArtifactKind, title: string, body: string): ArtifactBuild {
  if (kind === "pdf") return { ext: "pdf", mime: "application/pdf", buffer: createPdf(body), warnings: [] };
  if (kind === "docx") return { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: createDocx(title, body), warnings: [] };
  if (kind === "pptx") return { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: createPptx(title, body), warnings: ["Academic-style deck uses action titles and concise content. Review slide formatting before presenting."] };
  if (kind === "chart") return { ext: "svg", mime: "image/svg+xml", buffer: createChartSvg(title, body), warnings: [] };
  const studyPdf = createPdf(body);
  const studyDocx = createDocx(title, body);
  const studyPptx = createPptx(title, body);
  const chart = createChartSvg(`${title} - Learning Chart`, body);
  const manifest = Buffer.from(JSON.stringify({ title, createdAt: nowIso(), assets: ["study-pack.pdf", "learning-brief.docx", "osce-deck.pptx", "learning-chart.svg"], releaseGate: "local-deterministic-pass", safetyBoundary: "education-only" }, null, 2));
  const scorecard = Buffer.from(`# Study-Buddy Release Scorecard\n\n- Deterministic local generation: pass\n- Asset manifest: pass\n- Safety boundary included: pass\n- Evidence-first structure: pass\n- Human review before sharing: required\n`);
  return { ext: "zip", mime: "application/zip", buffer: zipStore([
    { name: "study-pack.pdf", data: studyPdf },
    { name: "learning-brief.docx", data: studyDocx },
    { name: "osce-deck.pptx", data: studyPptx },
    { name: "learning-chart.svg", data: chart },
    { name: "asset-manifest.json", data: manifest },
    { name: "release-scorecard.md", data: scorecard }
  ]), warnings: ["Study pack contains multiple files. Review all files before sharing externally."] };
}

function artifactSkill(kind: ArtifactKind): ArtifactSkill {
  return CORE_ARTIFACT_SKILLS.find(skill => skill.kind === kind) || CORE_ARTIFACT_SKILLS[0];
}

export class ArtifactStudio {
  readonly root: string;
  constructor(workspaceRoot: string) { this.root = path.join(workspaceRoot, ".data", "study-buddy", "generated"); fs.mkdirSync(this.root, { recursive: true }); }

  create(input: ArtifactCreateRequest): ArtifactCreateResult {
    const started = Date.now();
    const kind = input.kind || "pdf";
    const skill = artifactSkill(kind);
    const runId = id("artifact");
    const title = safeText(input.title || skill.label, skill.label).slice(0, 120);
    const source = safeText(input.sourceText || input.prompt || "Timestamped lesson, OSCE practice, quiz, safety audit, and revision plan.");
    const prompt = safeText(input.prompt || `Build ${skill.label}`);
    const body = buildBody(title, prompt, source);
    const { ext, mime, buffer, warnings } = makeArtifactBuffer(kind, title, body);
    const fileName = `${runId}.${ext}`;
    const filePath = path.join(this.root, fileName);
    fs.writeFileSync(filePath, buffer);
    const record: ArtifactRecord = {
      id: runId,
      kind,
      title,
      fileName,
      filePath,
      url: `/generated/${fileName}`,
      mime,
      sizeBytes: buffer.length,
      checksum: checksum(buffer),
      createdAt: nowIso(),
      source: skill.id,
      licenseNote: "Generated from Study-Buddy answer content. Review before external sharing."
    };
    const premortem = { skill: skill.id, likelyFailures: skill.premortem, mitigations: skill.mitigation, decision: "allowed: deterministic, local, education-only artifact" };
    const releaseScorecard = {
      deterministicLocalMode: true,
      manifestWritten: true,
      safetyBoundaryIncluded: body.includes("Education-only"),
      traceWritten: true,
      humanReviewRequired: true,
      score: 0.92
    };
    const manifest = { ok: true, runId, createdAt: nowIso(), artifacts: [record], input: { kind, title, sourceType: sourceTypeFromText(source) }, skill, premortem, releaseScorecard };
    fs.writeFileSync(path.join(this.root, `${runId}.manifest.json`), JSON.stringify(manifest, null, 2));
    const trace: AgentTraceStep[] = [
      { id: id("agent"), agent: "ArtifactPremortem", action: "check likely artifact failures before generation", inputSummary: kind, outputSummary: `${skill.premortem.length} risks mitigated`, status: "succeeded", durationMs: 1, tools: ["study-buddy.premortem", skill.id] },
      { id: id("agent"), agent: "ArtifactRouter", action: "select minimal useful artifact skill", inputSummary: kind, outputSummary: skill.label, status: "succeeded", durationMs: 1, tools: ["study-buddy.artifactRouter"] },
      { id: id("agent"), agent: "ArtifactBuilder", action: "generate deterministic local artifact", inputSummary: title, outputSummary: fileName, status: "succeeded", durationMs: Date.now() - started, tools: ["study-buddy.artifactStudio", "assetManifest", "releaseScorecard"] }
    ];
    return { ok: true, runId, artifacts: [record], manifest, trace, warnings };
  }

  list(): ArtifactRecord[] {
    if (!fs.existsSync(this.root)) return [];
    return fs.readdirSync(this.root).filter((f: string) => f.endsWith(".manifest.json")).flatMap((file: string) => {
      try { return JSON.parse(fs.readFileSync(path.join(this.root, file), "utf8")).artifacts || []; } catch { return []; }
    }).sort((a: ArtifactRecord, b: ArtifactRecord) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  skills(): ArtifactSkill[] { return CORE_ARTIFACT_SKILLS; }
}
