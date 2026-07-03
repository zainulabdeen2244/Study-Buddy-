import { StudyBuddyOrchestrator } from "../apps/api/studyBuddyOrchestrator.js";
const studyBuddy = new StudyBuddyOrchestrator({ workspaceRoot: process.cwd() });
console.log(JSON.stringify(await studyBuddy.dashboard(), null, 2));
