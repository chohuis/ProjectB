# University Flow QA

## Scope
- High school grade 3: `W50 -> W51 -> W52`
- University year 4: `W52 draft`
- Fallback path: no draft + no admission -> general military

## Scenario 1: High School W50/W51/W52
1. Set protagonist to `highschool`, `grade=3`, week before `W50`.
2. Advance to `W50`, confirm pending `careerChoice`.
3. Choose `draft`.
4. Advance to `W51`, confirm pending `draft`.
5. If drafted: accept, confirm pending `salaryNegotiation`.
6. If not drafted: click `W52 지원 결과 보기`.
7. Advance to `W52`, confirm pending `careerChoice` fallback.
8. Select one passed route and verify stage/league/team update.

Expected:
- No duplicate `draft` pending in queue.
- Queue card details show stage context.

## Scenario 2: University Year 4 Draft
1. Set protagonist to `university`, `universityWeek` around final year.
2. Advance until `W52`.
3. Confirm pending `draft`.
4. If undrafted, verify both options are shown:
   - `독립리그 진입`
   - `군입대`
5. Select each option in separate runs and verify stage transition.

Expected:
- `independent` path updates league/team.
- `military` path sets military stage and enlistment state.

## Scenario 3: Full Fallback to General Military
1. High school draft fail at `W51`.
2. Force no pass result for all fallback admissions.
3. Advance to `W52`, open `careerChoice`.
4. Select `전원 탈락: 현역 입대`.

Expected:
- Stage becomes `military`.
- Fallback state fields are cleared.

## Regression Check
1. Queue tab counts are correct for `messages` and `messenger`.
2. `Next week` button does not advance when required pending exists.
3. `처리하기` click gates modal opening.
4. Manifest generation works: `node scripts/gen-manifest.mjs`.
