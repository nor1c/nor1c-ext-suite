# Task for reviewer

[Read from: F:\CODES\Personal\extensions\nor1c-suite-ext\src\popup.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\popup.html, F:\CODES\Personal\extensions\nor1c-suite-ext\src\tab-switcher.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\tab-switcher.html, F:\CODES\Personal\extensions\nor1c-suite-ext\src\youtube-control-panel.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\youtube-control-panel.html, F:\CODES\Personal\extensions\nor1c-suite-ext\src\content\youtube-control-panel.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\content\youtube-panel-overlay.js]

Read-only audit of UI and YouTube flows in F:/CODES/Personal/extensions/nor1c-suite-ext. Inspect popup, tab switcher, youtube panel top-level and content variants, HTML/CSS as needed. Find concrete functional, security, browser compatibility, accessibility only if it breaks operation. Exact file:line and failure path. Do not edit.

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