# Task for reviewer

[Read from: F:\CODES\Personal\extensions\nor1c-suite-ext\src\background.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\background-video-downloader.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\manifest.chrome.json, F:\CODES\Personal\extensions\nor1c-suite-ext\src\manifest.firefox.json, F:\CODES\Personal\extensions\nor1c-suite-ext\build.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\convert-image.html, F:\CODES\Personal\extensions\nor1c-suite-ext\src\convert-image.js]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Read-only audit current browser extension background/downloader/build/manifest code for concrete correctness, security, compatibility, and performance bugs. Inspect src and current diff. Do not edit. Return only verified findings with severity, failure path, and exact file/line. Run static checks where useful.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```