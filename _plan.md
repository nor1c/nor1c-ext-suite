# Backup and Import Settings Feature

## Goal
Add a backup/import mechanism that lets users export all extension settings to a JSON file and restore them later from a file, covering every toggle, exclusion list, hidden rule, and custom selector.

## Storage Keys to Cover

| Key | Type | Description |
|-----|------|-------------|
| imageBlocker | bool | Block all images |
| gifBlocker | bool | Block GIF images |
| videoControls | bool | Force HTML5 video controls |
| videoDownload | bool | Auto-detect videos for download |
| adLinkBypass | bool | Auto-close ad tab popups |
| smoothScroll | bool | Smooth scrolling |
| elementHider | bool | Element hider toggle |
| classBlocker | bool | Class/ID blocker toggle |
| videoControlsExcluded | string[] | Domains excluded from video controls |
| hiddenRules | object | Per-domain hidden element rules |
| blockedSelectors | string | Comma-separated blocked selectors |

## Files to Touch

1. src/popup.html - Add backup/import card below all toggles
2. src/popup.css - Add styles for backup/import section
3. src/popup.js - Add export/import logic

## Steps

1. Add a collapsible "Settings Management" card in popup.html after class-blocker section, with Export and Import buttons and a hidden file input.
2. Add CSS styles in popup.css for the new section (backup-card, backup-buttons, file input styling).
3. In popup.js DOMContentLoaded:
   - Add click handler for Export button: read all 11 keys from chrome.storage.sync, wrap in { version: 1, exportedAt: <ISO>, data: {...} }, create a Blob download via object URL.
   - Add change handler for hidden file input: read uploaded JSON, validate structure (version, data keys), write each key to chrome.storage.sync, then reload the popup to reflect restored state.
   - Add click handler for Import button that triggers the hidden file input.

## Expected Behavior

- Export: Downloads a .json file named nor1c-suite-settings-{YYYY-MM-DD}.json containing all current settings.
- Import: User picks a valid exported JSON file -> all settings overwritten -> popup reloads with restored state.
- Validation: Reject files with missing version field or non-object data. Show error via alert.

## Acceptance Criteria

- All 11 settings keys are exported and importable.
- Export file is valid JSON and can be inspected manually.
- Import overwrites all previous settings atomically.
- Popup reflects imported settings after reload.
- No secrets/keys stored in plaintext (none exist in this project).
- UI is consistent with existing design (toggle-card style, muted colors).
