import type { Answer } from "../../packages/video-rag-engine/src/core/types.js";
import type { EvidenceBundle } from "../../packages/video-rag-engine/src/retrieval/evidenceBundle.js";
import type { StudyBuddyRoute, MedicalRiskLevel, SafetyAudit } from "./studyBuddyTypes.js";

const diagnosisTerms = ["diagnose", "do i have", "does my patient have", "what disease", "symptoms mean", "interpret my report", "xray shows", "blood report", "lab report"];
const treatmentTerms = ["treat", "treatment should", "should i take", "should my patient take", "start medicine", "stop medicine", "prescribe", "antibiotic should", "medicine should"];
const dosageTerms = ["dose", "dosage", "mg", "milligram", "microgram", "units should", "how much", "give my patient", "give this patient", "calculate dose"];
const emergencyTerms = ["chest pain", "not breathing", "unconscious", "stroke", "seizure", "emergency", "bleeding badly", "suicide", "self harm", "poison", "anaphylaxis"];
const educationTerms = ["osce", "quiz", "mcq", "flashcard", "teach", "explain", "lecture", "video", "sop", "practice", "student", "training", "revision", "timestamp"];
export function classifyMedicalRisk(question: string): { riskLevel: MedicalRiskLevel; blocked: boolean; reason?: string } {
  const q = question.toLowerCase();
  if (dosageTerms.some(t => q.includes(t))) return { riskLevel: "high", blocked: true, reason: "Patient-specific dosage or medication instructions are blocked." };
  if (emergencyTerms.some(t => q.includes(t))) return { riskLevel: "high", blocked: true, reason: "Emergency or urgent patient-care decisions are blocked." };
  if (diagnosisTerms.some(t => q.includes(t))) return { riskLevel: "high", blocked: true, reason: "Patient-specific diagnosis or report interpretation is blocked." };
  if (treatmentTerms.some(t => q.includes(t))) return { riskLevel: "high", blocked: true, reason: "Patient-specific treatment advice is blocked." };
  if (q.includes("procedure") || q.includes("cannulation") || q.includes("injection") || q.includes("clinical") || q.includes("aseptic") || q.includes("sharps")) return { riskLevel: "medium", blocked: false };
  return { riskLevel: educationTerms.some(t => q.includes(t)) ? "low" : "low", blocked: false };
}

export function routeQuestion(question: string): StudyBuddyRoute {
  const q = question.toLowerCase();
  const risk = classifyMedicalRisk(question);
  let intent: StudyBuddyRoute["intent"] = "ASK_VIDEO";
  if (q.includes("where") || q.includes("timestamp") || q.includes("when")) intent = "FIND_TIMESTAMP";
  if (q.includes("step by step") || q.includes("teach") || q.includes("explain procedure") || q.includes("common mistake")) intent = "EXPLAIN_PROCEDURE";
  if (q.includes("osce") || q.includes("station") || q.includes("examiner") || q.includes("rubric")) intent = "GENERATE_OSCE";
  if (q.includes("mcq") || q.includes("quiz") || q.includes("question") || q.includes("test me")) intent = "GENERATE_QUIZ";
  if (q.includes("flashcard")) intent = "GENERATE_FLASHCARDS";
  if (q.includes("revision") || q.includes("study plan") || q.includes("weak")) intent = "REVISION_PLAN";

  const requiredTools = ["video.queryPlan", "video.search", "video.auditAnswer", "study-buddy.evidenceGate", "study-buddy.safetyGate"];
  const requiredAgents = ["RouterAgent", "VideoEvidenceAgent", "DocumentRagAgent", "AnswerComposerAgent", "SafetyReviewerAgent"];
  if (intent === "GENERATE_OSCE") { requiredTools.push("study-buddy.generateOSCE"); requiredAgents.push("OSCEExaminerAgent"); }
  if (intent === "GENERATE_QUIZ" || intent === "GENERATE_FLASHCARDS") { requiredTools.push("study-buddy.generateQuiz"); requiredAgents.push("QuizFlashcardAgent"); }
  if (intent === "REVISION_PLAN") { requiredTools.push("study-buddy.generateRevisionPlan"); requiredAgents.push("RevisionPlannerAgent"); }
  return { intent, riskLevel: risk.riskLevel, blocked: risk.blocked, blockReason: risk.reason, requiredTools, requiredAgents, needsVideoRag: true, needsDocumentRag: true, needsSafetyReview: true };
}

export function reviewAnswer(question: string, route: StudyBuddyRoute, answer?: Answer, bundle?: EvidenceBundle): SafetyAudit {
  const citations = answer?.citations?.length || 0;
  const supportScore = bundle?.supportScore;
  if (route.blocked) {
    return {
      decision: "blocked",
      riskLevel: route.riskLevel,
      unsafeClaims: [route.blockReason || "High-risk patient-specific request."],
      missingEvidence: [],
      requiredRevisions: ["Redirect to education-only explanation from uploaded learning material, or instruct the user to contact qualified clinical help."],
      finalSafetyNote: "I cannot provide diagnosis, dosage, emergency, or patient-specific treatment advice. For education, I can explain general concepts from uploaded learning material. For real care, contact a qualified clinician or emergency services.",
      evidenceGate: { minimumCitations: 1, actualCitations: citations, supportScore, passed: false }
    };
  }
  const missingEvidence: string[] = [];
  if (!answer || answer.status === "insufficient_evidence") missingEvidence.push("VideoRAG answer is insufficiently supported.");
  if (citations === 0) missingEvidence.push("No timestamped citations were returned.");
  if (bundle && bundle.supportScore < 0.42) missingEvidence.push(`Evidence bundle support score is low: ${bundle.supportScore}.`);
  const passed = missingEvidence.length === 0 && citations > 0;
  return {
    decision: passed ? "approved_with_warning" : "approved_with_warning",
    riskLevel: route.riskLevel,
    unsafeClaims: [],
    missingEvidence,
    requiredRevisions: passed ? [] : ["Use insufficient-evidence wording and ask for more uploaded material if needed."],
    finalSafetyNote: "Training-only: Study-Buddy explains uploaded learning material for supervised education and OSCE practice. It is not a diagnosis, prescription, emergency, or independent clinical-procedure tool.",
    evidenceGate: { minimumCitations: 1, actualCitations: citations, supportScore, passed }
  };
}

export function blockedAnswer(route: StudyBuddyRoute): string {
  return `I cannot help with that as a patient-specific medical decision. ${route.blockReason || "This request is outside Study-Buddy's education-only safety boundary."}\n\nFor education, I can explain general principles from uploaded videos, SOPs, or notes. For real patient care, contact a qualified clinician or emergency services.`;
}
