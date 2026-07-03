const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const STORAGE = {
  sessions: "study-buddy.sessions.v2",
  current: "study-buddy.currentSession.v2",
  settings: "study-buddy.settings.v2",
  skills: "study-buddy.skills.v2"
};

const DEFAULT_SKILLS = [
  ["workflow", "Workflow Orchestrator", "Plans, routes, reviews, and records safe workflow state."],
  ["videorag", "Clinical VideoRAG", "Grounds clinical-skills answers in transcript, SOP, and timestamped evidence."],
  ["last30days", "Last30Days Research", "Routes recent public discussion and pain-point research."],
  ["youtube", "External Video Notes", "Keeps YouTube/live video requests separate from clinical demo evidence."],
  ["github", "GitHub Repository Search", "Finds and explains active repositories with resources."],
  ["artifact", "Artifact Studio", "Creates DOCX, PDF, PPT, chart, and study-pack files."],
  ["safety", "Safety Reviewer", "Keeps medical boundaries, evidence gates, and warning states visible."],
  ["memory", "Memory and RAG", "Uses saved context and retrieved evidence instead of stale guesses."],
  ["evals", "Evaluation Scientist", "Favors tests, support audits, and replayable checks."],
  ["deepResearch", "Deep Research Analyst", "Triangulates sources, labels confidence, and improves research briefs."],
  ["sourceVerify", "Source Verification", "Prevents cross-source leakage between PubMed, GitHub, YouTube, and VideoRAG."],
  ["uxResearch", "UX Researcher", "Finds user friction and accessibility gaps in workflows."],
  ["uxArchitect", "UX Architect", "Keeps layout, responsive behavior, and information architecture stable."],
  ["uiDesigner", "UI Designer", "Maintains component consistency, focus states, and visual hierarchy."],
  ["brandGuardian", "Brand Guardian", "Protects Study-Buddy tone, logo, palette, and artifact brand quality."],
  ["inclusiveVisuals", "Inclusive Visuals", "Reviews visual prompts and assets for dignity and accessibility."],
  ["learningPsych", "Learning Psychologist", "Reduces cognitive load and makes feedback learner-friendly."],
  ["narrativeExplainer", "Narrative Explainer", "Shapes answers into clear setup, evidence, and takeaway flow."]
];

const SIDEBAR_NAV = [
  {
    id: "playground",
    label: "Playground",
    icon: "terminal-icon",
    action: "new-chat",
    items: [
      { label: "New chat", action: "new-chat" },
      { label: "History", action: "history" },
      { label: "Starred", action: "history" }
    ]
  },
  {
    id: "models",
    label: "Models",
    icon: "models-icon",
    action: "load-demo",
    items: [
      { label: "Load demo", action: "load-demo" },
      { label: "Clinical VideoRAG", action: "skills" },
      { label: "External video notes", action: "skills" }
    ]
  },
  {
    id: "documentation",
    label: "Documentation",
    icon: "docs-icon",
    action: "proof",
    items: [
      { label: "Proof", action: "proof" },
      { label: "Artifacts", action: "files" },
      { label: "Safety gates", action: "proof" }
    ]
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings-icon",
    action: "settings",
    items: [
      { label: "General", action: "settings" },
      { label: "Skills", action: "skills" },
      { label: "Thinking mode", action: "settings" }
    ]
  }
];

const THINKING_STAGES = [
  ["Plan", "Classifying intent, risk, tools, and artifact needs."],
  ["Retrieve", "Searching approved sources or checking VideoRAG evidence."],
  ["Use tools", "Calling the selected workflow tools with narrow scope."],
  ["Review", "Checking support, safety, and artifact readiness."],
  ["Compose", "Preparing one complete answer and attaching artifacts."]
];

const state = {
  sessions: [],
  currentId: null,
  settings: { darkMode: false, extendedThinking: true, thinkingMs: 2200, sidebarCollapsed: false },
  enabledSkills: {},
  demoLoaded: false,
  lastAnswer: "",
  lastResult: null,
  lastTrace: [],
  thinkingTimer: null,
  attachments: [],
  activeNav: "playground",
  openNavGroups: { playground: true }
};

function nowIso() { return new Date().toISOString(); }
function uid(prefix) { return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`; }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function pretty(x) { return JSON.stringify(x, null, 2); }

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch { return fallback; }
}

function saveState() {
  localStorage.setItem(STORAGE.sessions, JSON.stringify(state.sessions));
  localStorage.setItem(STORAGE.current, state.currentId || "");
}

function saveSettings() {
  localStorage.setItem(STORAGE.settings, JSON.stringify(state.settings));
  localStorage.setItem(STORAGE.skills, JSON.stringify(state.enabledSkills));
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { "content-type": "application/json" }, ...opts });
  const txt = await r.text();
  let data;
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

function inlineFormat(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const html = [];
  let list = null;
  const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(3, heading[1].length + 1);
      html.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      if (list !== "ol") { closeList(); list = "ol"; html.push("<ol>"); }
      html.push(`<li>${inlineFormat(numbered[2])}</li>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (list !== "ul") { closeList(); list = "ul"; html.push("<ul>"); }
      html.push(`<li>${inlineFormat(bullet[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inlineFormat(line)}</p>`);
  }
  closeList();
  return html.join("");
}

function firstWords(text, fallback = "New chat") {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean ? clean.split(" ").slice(0, 7).join(" ") : fallback;
}

function createSession(title = "New chat") {
  const id = uid("chat");
  const session = { id, title, createdAt: nowIso(), updatedAt: nowIso(), messages: [] };
  state.sessions.unshift(session);
  state.currentId = id;
  saveState();
  renderAll();
  return session;
}

function currentSession() {
  let session = state.sessions.find(s => s.id === state.currentId);
  if (!session) session = createSession();
  return session;
}

function touchSession(session) {
  session.updatedAt = nowIso();
  state.sessions = [session, ...state.sessions.filter(s => s.id !== session.id)];
  saveState();
}

function updateSessionTitle(session, text) {
  if (session.title === "New chat") session.title = firstWords(text);
}

function artifactCardHtml(a) {
  const kb = a.sizeBytes ? `${(a.sizeBytes / 1024).toFixed(1)} KB` : "ready";
  return `<article class="artifact-card"><b>${esc(a.title || "Artifact")}</b><p>${esc(String(a.kind || "file").toUpperCase())} - ${kb}<br>checksum ${esc(a.checksum || "").slice(0, 16)}${a.checksum ? "..." : ""}</p><a href="${esc(a.url)}" target="_blank" download>Open artifact</a></article>`;
}

function artifactCards(list = []) {
  if (!list.length) return "";
  return `<div class="artifact-inline"><div class="artifact-inline-title">Artifacts attached</div>${list.map(artifactCardHtml).join("")}</div>`;
}

function sessionArtifacts(session = currentSession()) {
  return session.messages.flatMap(m => m.artifacts || []);
}

function renderArtifactButton() {
  const count = sessionArtifacts().length;
  const badge = $("#artifactCount");
  if (badge) badge.textContent = String(count);
  if (!count) $("#layout")?.classList.remove("artifacts-open");
}

function renderSidebarNav() {
  const nav = $("#sidebarNav");
  if (!nav) return;
  const collapsed = $("#layout")?.classList.contains("sidebar-collapsed");
  nav.innerHTML = `<div class="sidebar-group-label">Platform</div>` + SIDEBAR_NAV.map(item => {
    const open = !!state.openNavGroups[item.id] && !collapsed;
    const children = open && item.items?.length
      ? `<div class="nav-submenu">${item.items.map(sub => `<button class="nav-subitem" type="button" data-sidebar-sub-action="${esc(sub.action)}">${esc(sub.label)}</button>`).join("")}</div>`
      : "";
    return `<div class="nav-group ${open ? "open" : ""}">
      <button class="nav-row ${state.activeNav === item.id ? "active" : ""}" type="button" data-sidebar-action="${esc(item.action)}" data-sidebar-group="${esc(item.id)}" aria-current="${state.activeNav === item.id ? "page" : "false"}" aria-expanded="${open ? "true" : "false"}" title="${esc(item.label)}">
        <span class="nav-icon ${esc(item.icon)}" aria-hidden="true"></span>
        <span>${esc(item.label)}</span>
        <span class="row-chevron" aria-hidden="true"></span>
      </button>
      ${children}
    </div>`;
  }).join("");
}

function renderSessionArtifacts() {
  const items = sessionArtifacts();
  const box = $("#artifactList");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<div class="artifact-card"><b>No files in this chat</b><p>Artifacts created in other chats stay with those chats.</p></div>';
    return;
  }
  box.innerHTML = items.map(artifactCardHtml).join("");
}

function artifactIntent(q) {
  const s = String(q || "").toLowerCase();
  if (!/(create|make|generate|build|export|word|docx|pdf|ppt|powerpoint|chart|file|artifact)/.test(s)) return "";
  if (/\b(word|docx|document)\b/.test(s)) return "docx";
  if (/\b(pdf)\b/.test(s)) return "pdf";
  if (/\b(ppt|pptx|powerpoint|slides?)\b/.test(s)) return "pptx";
  if (/\b(chart|graph)\b/.test(s)) return "chart";
  if (/\b(study pack|bundle|zip)\b/.test(s)) return "study-pack";
  if (/^(create|make|generate|build|export)\b/.test(s) && state.lastAnswer) return "docx";
  return "";
}

function messageHtml(msg) {
  if (msg.role === "user") return esc(msg.text || "");
  return renderMarkdown(msg.text || "") + artifactCards(msg.artifacts || []);
}

function renderEmptyState() {
  return `<div class="empty-state"><div class="empty-state-inner">
    <img src="/assets/study-buddy-logo.svg" alt="Study-Buddy" />
    <h2>How can Study-Buddy help?</h2>
    <p>Ask for clinical-skills evidence, recent research, repository analysis, or a polished artifact. Skills in the sidebar tune how the workflow behaves.</p>
    <div class="prompt-row">
      <button data-prompt="Find the best trending GitHub repositories about agentic AI agents and explain the use cases, then create a DOCX with resources at the end.">Repository brief</button>
      <button data-prompt="Tell me about AGI from recent posts, articles, and blogs.">Recent AGI</button>
      <button data-prompt="Load the golden demo and explain hand hygiene with timestamps.">Clinical demo</button>
      <button data-prompt="Generate an OSCE station from this video and SOP.">OSCE station</button>
    </div>
  </div></div>`;
}

function renderConversation() {
  const box = $("#conversation");
  const session = currentSession();
  if (!box) return;
  if (!session.messages.length) {
    box.innerHTML = renderEmptyState();
    wirePromptButtons(box);
    return;
  }
  box.innerHTML = session.messages.map(msg => {
    const body = messageHtml(msg);
    return msg.role === "user"
      ? `<article class="msg user" data-id="${esc(msg.id)}"><div class="bubble">${body}</div><span class="avatar">Y</span></article>`
      : `<article class="msg assistant" data-id="${esc(msg.id)}"><span class="avatar">M</span><div class="bubble">${body}</div></article>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

function renderHistory() {
  const list = $("#chatHistory");
  if (!list) return;
  list.innerHTML = state.sessions.map(s => `<button class="history-item ${s.id === state.currentId ? "active" : ""}" data-chat="${esc(s.id)}">
    <span class="history-icon" aria-hidden="true"></span>
    <span><b>${esc(s.title)}</b><small>${new Date(s.updatedAt).toLocaleString()}</small></span>
  </button>`).join("");
  $$("[data-chat]", list).forEach(btn => btn.addEventListener("click", () => {
    state.currentId = btn.dataset.chat;
    localStorage.setItem(STORAGE.current, state.currentId);
    state.lastAnswer = currentSession().messages.filter(m => m.role === "assistant").at(-1)?.text || "";
    renderAll();
  }));
}

function renderSkills() {
  const list = $("#skillsList");
  const strip = $("#activeSkillStrip");
  if (!list || !strip) return;
  const visibleSkills = DEFAULT_SKILLS.slice(0, 7);
  list.innerHTML = visibleSkills.map(([id, name, desc]) => {
    const enabled = state.enabledSkills[id] !== false;
    return `<button class="skill-card ${enabled ? "enabled" : ""}" data-skill="${id}">
      <span class="skill-mark" aria-hidden="true"></span><span><b>${esc(name)}</b><small>${esc(desc)}</small></span><span class="skill-toggle"></span>
    </button>`;
  }).join("") + `<button class="skill-card more-skills" type="button" data-sidebar-sub-action="skills">
    <span class="nav-icon more-icon" aria-hidden="true"></span><span><b>More skills</b><small>${DEFAULT_SKILLS.length - visibleSkills.length} advanced skills kept private</small></span><span></span>
  </button>`;
  $$("[data-skill]", list).forEach(btn => btn.addEventListener("click", () => {
    const id = btn.dataset.skill;
    state.enabledSkills[id] = !(state.enabledSkills[id] !== false);
    saveSettings();
    renderSkills();
  }));
  const enabled = DEFAULT_SKILLS.filter(([id]) => state.enabledSkills[id] !== false);
  $("#skillCount").textContent = `${enabled.length} on`;
  strip.innerHTML = enabled.slice(0, 5).map(([, name]) => `<span class="skill-chip">${esc(name)}</span>`).join("");
}

function renderSettings() {
  document.documentElement.dataset.theme = state.settings.darkMode ? "dark" : "light";
  $("#darkModeToggle").checked = !!state.settings.darkMode;
  $("#extendedThinkingToggle").checked = !!state.settings.extendedThinking;
  $("#thinkingPace").value = String(state.settings.thinkingMs || 2200);
}

function setSidebarCollapsed(collapsed) {
  const shell = $("#layout");
  if (!shell) return;
  shell.classList.toggle("sidebar-collapsed", !!collapsed);
  state.settings.sidebarCollapsed = !!collapsed;
  saveSettings();
  for (const btn of [$("#sidebarToggle")]) {
    btn?.setAttribute("aria-label", collapsed ? "Maximize sidebar" : "Minimize sidebar");
    btn?.setAttribute("title", collapsed ? "Maximize sidebar" : "Minimize sidebar");
  }
  renderSidebarNav();
}

function renderTitle() {
  const session = currentSession();
  $("#chatTitle").textContent = session.title;
}

function renderAll() {
  renderSidebarNav();
  renderTitle();
  renderHistory();
  renderSkills();
  renderSettings();
  renderConversation();
  renderArtifactButton();
  renderSessionArtifacts();
}

function addMessage(role, text, artifacts = []) {
  const session = currentSession();
  const msg = { id: uid("msg"), role, text, artifacts, createdAt: nowIso() };
  session.messages.push(msg);
  if (role === "user") updateSessionTitle(session, text);
  touchSession(session);
  renderAll();
  return msg;
}

function renderAttachments() {
  const strip = $("#attachmentStrip");
  if (!strip) return;
  strip.innerHTML = state.attachments.map((file, i) => `<span class="attachment-chip"><span class="attachment-file-icon" aria-hidden="true"></span>${esc(file.name)} <button type="button" data-remove-attachment="${i}" aria-label="Remove ${esc(file.name)}">x</button></span>`).join("");
  $$("[data-remove-attachment]", strip).forEach(btn => btn.addEventListener("click", () => {
    state.attachments.splice(Number(btn.dataset.removeAttachment), 1);
    renderAttachments();
  }));
}

async function attachmentContext() {
  const parts = [];
  for (const file of state.attachments) {
    if (/^(text\/|application\/json|application\/csv)/.test(file.type) || /\.(txt|md|csv|json|srt|vtt)$/i.test(file.name)) {
      try {
        const text = await file.text();
        parts.push(`Attached file: ${file.name}\n${text.slice(0, 12000)}`);
      } catch {
        parts.push(`Attached file: ${file.name} could not be read as text.`);
      }
    } else {
      parts.push(`Attached file: ${file.name} (${file.type || "binary"}). Text extraction is not available in this local browser path.`);
    }
  }
  return parts.join("\n\n");
}

function addThinkingDom() {
  const box = $("#conversation");
  if (!box) return null;
  if (!currentSession().messages.length) box.innerHTML = "";
  const article = document.createElement("article");
  article.className = "msg assistant thinking-msg";
  article.innerHTML = `<span class="avatar">M</span><div class="bubble"><div class="thinking-card">
    <div class="thinking-top"><span class="thinking-status"><span class="thinking-dot"></span>Thinking...</span><button class="thinking-toggle" type="button">Hide workflow</button></div>
    <div class="thinking-curtain" data-thinking-curtain></div>
  </div></div>`;
  box.appendChild(article);
  box.scrollTop = box.scrollHeight;
  const toggle = $(".thinking-toggle", article);
  const curtain = $("[data-thinking-curtain]", article);
  toggle?.addEventListener("click", () => {
    curtain.classList.toggle("collapsed");
    toggle.textContent = curtain.classList.contains("collapsed") ? "Show workflow" : "Hide workflow";
  });
  return article;
}

function setThinkingStage(host, index, finalSteps) {
  const curtain = host?.querySelector("[data-thinking-curtain]");
  if (!curtain) return;
  const source = finalSteps?.length ? finalSteps : THINKING_STAGES.map(([label, detail]) => ({ label, detail }));
  curtain.innerHTML = source.map((step, i) => {
    const cls = finalSteps?.length ? "done" : (i < index ? "done" : i === index ? "active" : "");
    return `<div class="workflow-step ${cls}"><span></span><b>${esc(step.label)}</b><small>${esc(step.detail)}</small></div>`;
  }).join("");
}

function startThinking(host) {
  if (!state.settings.extendedThinking) {
    host?.querySelector("[data-thinking-curtain]")?.classList.add("collapsed");
  }
  let i = 0;
  setThinkingStage(host, i);
  clearInterval(state.thinkingTimer);
  state.thinkingTimer = setInterval(() => {
    i = Math.min(i + 1, THINKING_STAGES.length - 1);
    setThinkingStage(host, i);
  }, 780);
}

function stopThinking() {
  clearInterval(state.thinkingTimer);
  state.thinkingTimer = null;
}

function safeWorkflow(items = []) {
  if (!items.length) return THINKING_STAGES.map(([label, detail]) => ({ label, detail }));
  return items.slice(-7).map(step => {
    const agent = String(step.agent || "");
    if (/RequestOrchestrator|Router/i.test(agent)) return { label: "Planned route", detail: "Intent, risk, and tool path selected." };
    if (/GitHub/i.test(agent)) return { label: "Searched repositories", detail: "Public repository search completed." };
    if (/Article|RecentPain/i.test(agent)) return { label: "Scanned recent sources", detail: "Recent public source workflow completed." };
    if (/Video|Evidence/i.test(agent)) return { label: "Retrieved evidence", detail: "Transcript, SOP, or evidence bundle checked." };
    if (/Safety|Audit/i.test(agent)) return { label: "Reviewed safety", detail: "Support and safety boundaries checked." };
    if (/Artifact/i.test(agent)) return { label: "Built artifact", detail: "File generated and attached to chat." };
    if (/LLM|Composer/i.test(agent)) return { label: "Composed answer", detail: "Answer polished through the configured composer." };
    return { label: "Workflow step", detail: "Completed safe workflow step." };
  });
}

function updateThinkingToAnswer(host, answer, artifacts, traceItems) {
  const bubble = host?.querySelector(".bubble");
  if (!bubble) return;
  const steps = safeWorkflow(traceItems);
  bubble.innerHTML = `<div class="thinking-card compact-thinking">
    <div class="thinking-top"><span class="thinking-status"><span class="thinking-dot"></span>Thought through workflow</span><button class="thinking-toggle" type="button">Show workflow</button></div>
    <div class="thinking-curtain collapsed" data-thinking-curtain>${steps.map(step => `<div class="workflow-step done"><span></span><b>${esc(step.label)}</b><small>${esc(step.detail)}</small></div>`).join("")}</div>
  </div>${renderMarkdown(answer || "No answer returned.")}${artifactCards(artifacts || [])}`;
  const toggle = $(".thinking-toggle", bubble);
  const curtain = $("[data-thinking-curtain]", bubble);
  toggle?.addEventListener("click", () => {
    curtain.classList.toggle("collapsed");
    toggle.textContent = curtain.classList.contains("collapsed") ? "Show workflow" : "Hide workflow";
  });
}

function artifacts(list = []) {
  renderSessionArtifacts();
  renderArtifactButton();
  if (!list.length) return;
  $("#layout").classList.add("artifacts-open");
}

function endpoint(q) {
  const s = q.toLowerCase();
  if (s.includes("osce")) return "/api/osce";
  if (s.includes("quiz") || s.includes("mcq") || s.includes("flashcard")) return "/api/quiz";
  if (s.includes("revision")) return "/api/revision";
  return "/api/ask";
}

async function ask(q) {
  q = q || $("#dockPrompt")?.value || $("#heroPrompt")?.value || "";
  if (!q.trim()) return;
  const requestedArtifact = artifactIntent(q);
  if (requestedArtifact && state.lastAnswer) {
    addMessage("user", q);
    await createArtifact(requestedArtifact, {
      kind: requestedArtifact,
      title: requestedArtifact === "docx" ? "Study-Buddy Word Brief" : `Study-Buddy ${requestedArtifact}`,
      prompt: "Create an artifact from the current chat answer.",
      sourceText: state.lastAnswer
    });
    const prompt = $("#dockPrompt");
    if (prompt) prompt.value = "";
    return;
  }
  const session = currentSession();
  const extraContext = await attachmentContext();
  const outboundQuestion = extraContext ? `${q}\n\nUploaded file context:\n${extraContext}` : q;
  addMessage("user", q);
  const thinking = addThinkingDom();
  startThinking(thinking);
  const started = Date.now();
  try {
    if (/load.*demo/i.test(q) && !state.demoLoaded) await loadDemo(true);
    const enabled = Object.fromEntries(DEFAULT_SKILLS.map(([id]) => [id, state.enabledSkills[id] !== false]));
    const request = api(endpoint(q), { method: "POST", body: JSON.stringify({ question: outboundQuestion, enabledSkills: enabled, sessionId: session.id }) });
    const [d] = await Promise.all([request, delay(Number(state.settings.thinkingMs || 2200))]);
    state.lastResult = d;
    state.lastAnswer = d.answer || "";
    state.lastTrace = d.agentTrace || [];
    if (state.lastTrace.length) console.debug("Study-Buddy raw trace", state.lastTrace);
    updateThinkingToAnswer(thinking, d.answer, d.artifacts || [], d.agentTrace || []);
    session.messages.push({ id: uid("msg"), role: "assistant", text: d.answer || "", artifacts: d.artifacts || [], createdAt: nowIso() });
    touchSession(session);
    renderHistory();
    renderTitle();
    if (d.artifacts?.length) artifacts(d.artifacts);
    else {
      renderSessionArtifacts();
      renderArtifactButton();
    }
    evidence(d);
    mini(d.ops || d);
    state.attachments = [];
    renderAttachments();
    toast(`Response ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (e) {
    updateThinkingToAnswer(thinking, `Request failed\n\n${e.message}`, [], []);
    session.messages.push({ id: uid("msg"), role: "assistant", text: `Request failed\n\n${e.message}`, artifacts: [], createdAt: nowIso() });
    touchSession(session);
    toast("Request failed");
  } finally {
    stopThinking();
    const prompt = $("#dockPrompt");
    if (prompt) prompt.value = "";
  }
}

async function createArtifact(kind, suggested) {
  const selected = kind || suggested?.kind || $("#artifactKind")?.value || "docx";
  const thinking = addThinkingDom();
  startThinking(thinking);
  try {
    const payload = suggested
      ? { ...suggested, kind: selected }
      : {
          kind: selected,
          title: $("#artifactTitle")?.value || `Study-Buddy ${selected}`,
          prompt: $("#artifactPrompt")?.value || "",
          sourceText: state.lastAnswer || currentSession().messages.filter(m => m.role === "assistant").at(-1)?.text || ""
        };
    const [r] = await Promise.all([
      api("/api/artifacts/create", { method: "POST", body: JSON.stringify(payload) }),
      delay(Number(state.settings.thinkingMs || 2200))
    ]);
    updateThinkingToAnswer(thinking, "Artifact ready.", r.artifacts || [], r.trace || []);
    currentSession().messages.push({ id: uid("msg"), role: "assistant", text: "Artifact ready.", artifacts: r.artifacts || [], createdAt: nowIso() });
    touchSession(currentSession());
    renderSessionArtifacts();
    renderArtifactButton();
    $("#layout").classList.add("artifacts-open");
    toast(`${selected.toUpperCase()} created`);
  } catch (e) {
    updateThinkingToAnswer(thinking, `Artifact failed\n\n${e.message}`, [], []);
    toast("Artifact failed");
  } finally {
    stopThinking();
  }
}

async function loadDemo(silent = false) {
  const thinking = silent ? null : addThinkingDom();
  if (!silent) startThinking(thinking);
  try {
    const d = await api("/api/demo/load", { method: "POST", body: "{}" });
    state.demoLoaded = true;
    mini(d);
    if (!silent) {
      updateThinkingToAnswer(thinking, "Golden demo loaded. Evidence is indexed. Ask a clinical question or request an artifact.", [], []);
      currentSession().messages.push({ id: uid("msg"), role: "assistant", text: "Golden demo loaded. Evidence is indexed. Ask a clinical question or request an artifact.", artifacts: [], createdAt: nowIso() });
      touchSession(currentSession());
    }
    toast("Demo ready");
  } catch (e) {
    if (!silent) updateThinkingToAnswer(thinking, `Demo load failed\n\n${e.message}`, [], []);
  } finally {
    if (!silent) stopThinking();
  }
}

async function proof() {
  try {
    const [s, p, g, pm] = await Promise.all([api("/api/status"), api("/api/provider-status"), api("/api/production-gate"), api("/api/premortem")]);
    $("#statusBox").textContent = pretty(s);
    $("#providerBox").textContent = pretty(p);
    $("#gateBox").textContent = pretty(g);
    $("#premortemBox").textContent = pretty(pm);
    addMessage("assistant", "Proof refreshed. Provider status, production gate, and premortem are available in the local hidden diagnostics panel.");
    toast("Proof refreshed");
  } catch (e) {
    addMessage("assistant", `Proof failed\n\n${e.message}`);
  }
}

function evidence(result) {
  $("#evidenceBox").textContent = pretty(result?.evidenceBundle || {});
  $("#safetyBox").textContent = pretty(result?.safetyAudit || {});
}

function mini(d) {
  $("#miniStatus").textContent = pretty(d || {});
}

async function loadArtifacts() {
  renderSessionArtifacts();
  renderArtifactButton();
}

function wirePromptButtons(root = document) {
  $$("[data-prompt]", root).forEach(b => b.addEventListener("click", () => ask(b.dataset.prompt)));
}

function wireEvents() {
  $("#dockForm")?.addEventListener("submit", e => { e.preventDefault(); ask($("#dockPrompt")?.value); });
  $("#heroForm")?.addEventListener("submit", e => { e.preventDefault(); ask($("#heroPrompt")?.value); });
  document.addEventListener("click", e => {
    const subTarget = e.target.closest("[data-sidebar-sub-action]");
    if (subTarget) {
      const action = subTarget.dataset.sidebarSubAction;
      if (action === "new-chat") createSession();
      if (action === "history") $("#chatHistory")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (action === "skills") $("#skillsList")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (action === "settings") $("#settingsPanel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (action === "files") $("#toggleArtifactsBtn")?.click();
      if (action === "load-demo") loadDemo();
      if (action === "proof") proof();
      return;
    }
    const target = e.target.closest("[data-sidebar-action]");
    if (!target) return;
    const action = target.dataset.sidebarAction;
    const group = target.dataset.sidebarGroup;
    state.activeNav = group || state.activeNav;
    if (group && !$("#layout")?.classList.contains("sidebar-collapsed")) {
      state.openNavGroups[group] = !state.openNavGroups[group];
    }
    if (action === "new-chat") {
      createSession();
      return;
    }
    if (action === "load-demo") {
      renderSidebarNav();
      loadDemo();
      return;
    }
    if (action === "proof") {
      renderSidebarNav();
      proof();
      return;
    }
    if (action === "settings") {
      renderSidebarNav();
      $("#settingsPanel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
  $("#sidebarToggle")?.addEventListener("click", () => {
    setSidebarCollapsed(!$("#layout")?.classList.contains("sidebar-collapsed"));
  });
  $("#clearHistoryBtn")?.addEventListener("click", () => {
    state.sessions = [];
    state.currentId = null;
    createSession();
    toast("Chat history cleared");
  });
  $("#toggleArtifactsBtn")?.addEventListener("click", () => {
    renderSessionArtifacts();
    $("#layout").classList.toggle("artifacts-open");
  });
  $("#makeArtifact")?.addEventListener("click", () => createArtifact());
  $("#attachBtn")?.addEventListener("click", () => $("#fileInput")?.click());
  $("#fileInput")?.addEventListener("change", e => {
    state.attachments = [...state.attachments, ...Array.from(e.target.files || [])];
    e.target.value = "";
    renderAttachments();
  });
  $("#darkModeToggle")?.addEventListener("change", e => {
    state.settings.darkMode = e.target.checked;
    saveSettings();
    renderSettings();
  });
  $("#extendedThinkingToggle")?.addEventListener("change", e => {
    state.settings.extendedThinking = e.target.checked;
    saveSettings();
  });
  $("#thinkingPace")?.addEventListener("change", e => {
    state.settings.thinkingMs = Number(e.target.value);
    saveSettings();
  });
}

function boot() {
  state.settings = { ...state.settings, ...loadJson(STORAGE.settings, {}) };
  const savedSkills = loadJson(STORAGE.skills, null);
  state.enabledSkills = savedSkills || Object.fromEntries(DEFAULT_SKILLS.map(([id]) => [id, true]));
  state.sessions = loadJson(STORAGE.sessions, []);
  state.currentId = localStorage.getItem(STORAGE.current) || state.sessions[0]?.id || null;
  if (!state.sessions.length || !state.currentId) createSession();
  state.lastAnswer = currentSession().messages.filter(m => m.role === "assistant").at(-1)?.text || "";
  setSidebarCollapsed(!!state.settings.sidebarCollapsed);
  wireEvents();
  renderAll();
  loadArtifacts();
  api("/api/status").then(mini).catch(() => {});
}

boot();
