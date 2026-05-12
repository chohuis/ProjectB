# Event Data Operation Guide

## Naming Rules
- Event IDs:
  - High school: `EVT_HS_*`
  - University: `EVT_UNIV_*`
  - Global/system: `EVT_COND_*`, `EVT_RAND_*`
- Message template IDs:
  - High school: `MSG_HS_*`
  - University: `MSG_UNIV_*`
  - Shared/global: `MSG_COND_*`, `MSG_RAND_*`

## File Placement
- Mandatory: `resource/data/master/events/mandatory`
- Conditional: `resource/data/master/events/conditional`
- Random:
  - media: `.../random/media`
  - social: `.../random/social`
  - team_life: `.../random/team_life`

## Encoding Safety (Korean)
- Keep files as UTF-8.
- For message templates with Korean text, use escaped unicode text when needed to avoid mojibake in mixed tooling environments.
- After editing templates, reopen file and verify key text IDs are readable.

## Required Validation Steps
1. JSON parse check for edited files.
2. Regenerate manifest:
   - `node scripts/gen-manifest.mjs`
3. Build/type sanity:
   - `cmd /c npm run -s build:packages`
4. Check pending flow manually on key weeks:
   - HS `W50/W51/W52`
   - University `W52`

## Mapping Discipline
- Every `EVT_UNIV_*` should map to `MSG_UNIV_*` unless intentionally shared.
- Shared template usage must be documented in PR notes.

## Queue UX Policy
- All blocking gameplay actions route to `messages` tab.
- `messengerScript` routes to `messenger` tab only.
- Pending action should open only by explicit user action (`처리하기`), not on tab open.
