# Task for reviewer

[Read from: F:\CODES\Personal\extensions\nor1c-suite-ext\package.json, F:\CODES\Personal\extensions\nor1c-suite-ext\build.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\manifest.chrome.json, F:\CODES\Personal\extensions\nor1c-suite-ext\src\manifest.firefox.json, F:\CODES\Personal\extensions\nor1c-suite-ext\src\background.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\background-video-downloader.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\background-video-downloader-worker.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\lib\storage.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\content\video-downloader-filter.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\content\video-downloader-inject.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\content\video-playing-tracker.js, F:\CODES\Personal\extensions\nor1c-suite-ext\src\content\video-play-reset.js]

Read-only audit of background/build/manifests/storage in F:/CODES/Personal/extensions/nor1c-suite-ext. Find concrete correctness, security, compatibility, and integration bugs. Verify each against code; report severity, exact file:line, failure path. Do not edit. Inspect package/build and src/background*.js, manifests, src/lib/storage.js, downloader popup/worker/filter/inject/tracker/reset as relevant.

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