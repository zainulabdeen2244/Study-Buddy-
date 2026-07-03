import type { EvidenceBundle } from "../../packages/video-rag-engine/src/retrieval/evidenceBundle.js";
import type { OsceStation, QuizPack, RevisionPlan } from "./studyBuddyTypes.js";

function itemText(bundle?: EvidenceBundle, limit = 10): string[] {
  return (bundle?.items || []).slice(0, limit).map((item: any) => `${item.timestamp || `${Math.round(item.startSec)}-${Math.round(item.endSec)}s`}: ${item.excerpt || item.text || ''}`);
}

function findEvidence(evidence: string[], re: RegExp): string | undefined { return evidence.find(e => re.test(e)); }

export function buildClinicalLesson(question: string, bundle?: EvidenceBundle): string {
  const evidence = itemText(bundle, 7);
  const hand = findEvidence(evidence, /hand hygiene|aseptic/i) || evidence[0] || "No strong timestamp evidence returned.";
  const sharps = findEvidence(evidence, /sharps|needle/i) || "Sharps safety evidence was not prominent in the retrieved context.";
  const identity = findEvidence(evidence, /identity|allerg/i) || "Identity/allergy evidence was not prominent in the retrieved context.";
  return [
    "## Direct Answer",
    question.toLowerCase().includes("where") ? `The strongest matching evidence is: ${hand}` : "Use this as supervised clinical-skills education only. Study-Buddy explains the uploaded video/SOP, not patient care.",
    "",
    "## Evidence-backed explanation",
    `1. Preparation and identity: ${identity}`,
    `2. Hand hygiene and aseptic preparation: ${hand}`,
    `3. Sharps and closure safety: ${sharps}`,
    "",
    "## Common mistakes to avoid",
    "- Skipping identity/allergy checks before preparation.",
    "- Performing hand hygiene but then touching non-sterile surfaces again.",
    "- Retouching a cleaned puncture site without sterile technique.",
    "- Recapping or leaving used sharps on the tray.",
    "",
    "## Exam tip",
    "In OSCE, verbalize safety steps while performing them: identity, consent, hand hygiene, aseptic field, sharps disposal, documentation, escalation.",
    "",
    "## Safety note",
    "Training-only. Real clinical procedures require local policy compliance and qualified supervision."
  ].join("\n");
}

export function generateOsce(bundle?: EvidenceBundle): OsceStation {
  const evidence = itemText(bundle, 12);
  return {
    title: "OSCE Station: IV Cannulation Preparation and Safety",
    timeMinutes: 7,
    candidateTask: "Demonstrate safe preparation for IV cannulation in a supervised clinical-skills station. Explain each safety step aloud.",
    examinerChecklist: [
      { item: "Introduces self and confirms patient identity with two identifiers", marks: 2, evidence: findEvidence(evidence, /identity/) },
      { item: "Checks allergies, explains procedure, and obtains consent according to local policy", marks: 2, evidence: findEvidence(evidence, /allerg|consent|explain/) },
      { item: "Prepares tray and checks required equipment before touching sterile items", marks: 2, evidence: findEvidence(evidence, /tray|equipment|prepare/) },
      { item: "Performs visible hand hygiene before aseptic preparation", marks: 3, evidence: findEvidence(evidence, /hand hygiene|aseptic/) },
      { item: "Selects appropriate vein and avoids infected, bruised, swollen, injured, or restricted sites", marks: 3, evidence: findEvidence(evidence, /infected|bruised|swollen|injured|vein/) },
      { item: "Cleans site and avoids retouching the cleaned area", marks: 3, evidence: findEvidence(evidence, /clean|touch/) },
      { item: "Maintains aseptic non-touch technique and escalates concerns", marks: 2, evidence: findEvidence(evidence, /non-touch|supervisor|escalate/) },
      { item: "Disposes of sharps immediately in approved container without recapping", marks: 3, evidence: findEvidence(evidence, /sharps|recap|needle/) }
    ],
    vivaQuestions: [
      "Why do we confirm identity before procedure preparation?",
      "Why is hand hygiene required before sterile equipment handling?",
      "What should you do if the selected site is bruised or infected?",
      "Why should a cleaned puncture site not be touched again?",
      "What is the safest action after using a needle?"
    ],
    criticalFailPoints: ["No identity check", "No hand hygiene", "Contaminating cleaned site", "Unsafe sharps handling", "Attempting unsupervised practice"],
    modelAnswer: "A safe answer follows identity, allergies, explanation/consent, equipment preparation, visible hand hygiene, site assessment, aseptic cleaning, supervised technique, immediate sharps disposal, patient communication, documentation, and escalation.",
    evidenceUsed: evidence.slice(0, 8)
  };
}

export function generateQuiz(bundle?: EvidenceBundle): QuizPack {
  const evidence = itemText(bundle, 10);
  return {
    mcqs: [
      { question: "Which step should happen before touching sterile equipment?", options: ["Apply tourniquet", "Perform hand hygiene", "Secure dressing", "Document the attempt"], correct: "Perform hand hygiene", explanation: "Hand hygiene reduces contamination risk before aseptic preparation.", evidence: findEvidence(evidence, /hand hygiene/) },
      { question: "Which patient check is safety-critical before cannulation preparation?", options: ["Two identifiers", "Favorite food", "Height only", "Shoe size"], correct: "Two identifiers", explanation: "Identity confirmation helps prevent wrong-patient procedures.", evidence: findEvidence(evidence, /identity/) },
      { question: "After cleaning the puncture site, what should the student avoid?", options: ["Touching it again without sterile technique", "Letting it dry", "Explaining the next step", "Checking labels"], correct: "Touching it again without sterile technique", explanation: "Retouching can contaminate the cleaned site.", evidence: findEvidence(evidence, /clean|touch/) },
      { question: "Which site should usually be avoided?", options: ["Bruised or infected area", "Straight visible vein", "Supervisor-approved site", "Accessible vein"], correct: "Bruised or infected area", explanation: "SOP evidence warns against bruised, infected, swollen, injured, or restricted sites.", evidence: findEvidence(evidence, /bruised|infected/) },
      { question: "What is correct sharps safety?", options: ["Dispose immediately into approved sharps container", "Recap used needles", "Leave the needle on tray", "Pass it hand-to-hand"], correct: "Dispose immediately into approved sharps container", explanation: "Used sharps should not be recapped and should go into approved sharps containers.", evidence: findEvidence(evidence, /sharps|recap/) }
    ],
    flashcards: [
      { front: "Study-Buddy's healthcare boundary", back: "Education-only, supervised learning. Not diagnosis, prescription, or independent clinical procedure guidance.", evidence: evidence[0] },
      { front: "Visible OSCE step before sterile equipment", back: "Hand hygiene before aseptic preparation.", evidence: findEvidence(evidence, /hand hygiene/) },
      { front: "Two critical fail points", back: "No identity check and unsafe sharps handling.", evidence: findEvidence(evidence, /identity|sharps/) },
      { front: "Rule after site cleaning", back: "Do not retouch the cleaned area unless sterile technique is maintained.", evidence: findEvidence(evidence, /clean|touch/) }
    ]
  };
}

export function generateRevisionPlan(bundle?: EvidenceBundle): RevisionPlan {
  const stamps = (bundle?.items || []).slice(0, 5).map((i: any) => i.timestamp || `${Math.round(i.evidence.startSec)}-${Math.round(i.evidence.endSec)}s`);
  return {
    weakTopics: ["patient identity", "hand hygiene", "aseptic technique", "site cleaning", "sharps safety", "clinical documentation"],
    today: ["Re-watch the top timestamped evidence.", "Practice the OSCE checklist aloud once.", "Answer the five MCQs and justify each answer from evidence."],
    tomorrow: ["Repeat the critical fail points from memory.", "Redo missed MCQs.", "Run one 7-minute mock OSCE with the rubric."],
    recommendedTimestamps: stamps
  };
}
