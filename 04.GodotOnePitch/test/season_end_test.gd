extends GdUnitTestSuite

## 시즌 종료 순서 — M6-2.
##
## 원본: `usecases/seasonRollover.ts`의 `runWorldSeasonEnd`
##
## ⚠ **여기서 옮기는 건 계산이 아니라 순서다.** 02에서 이 순서가 세 분기에
## 각각 적혀 있었고 그중 어디도 안 타는 경로가 있었다 — 주인공이 지명된
## 해엔 세계 오프시즌이 통째로 건너뛰어졌고, 그 해 NPC 사건이 `fa_signed 6`
## 뿐이었으며 **주인공 나이도 안 올랐다**.


func _ids(phases: Array) -> Array:
	var out: Array = []
	for p in phases:
		out.append(p["id"])
	return out


func _at(id: String) -> int:
	return SeasonEnd.phase_index(id)


# ── 순서 ──────────────────────────────────────────────────────

func test_every_phase_has_an_id_and_a_reason() -> void:
	assert_bool(SeasonEnd.PHASES.size() > 0).is_true()
	for p in SeasonEnd.PHASES:
		assert_str(p["id"]).is_not_empty()
		assert_str(p["label"]).is_not_empty()


## ⚠ **목록 자체를 못박는다.** 순서 제약만 보면 **단계를 통째로 지운
## 것**을 못 잡는다 — 제약은 남은 것들 사이에서 여전히 참이기 때문이다.
##
## 02에서 실제로 두 단계가 이렇게 사라져 있었다: 주인공 시즌 기록은
## 결산 화면에만 있었고, 구단 성향 갱신은 구현돼 있는데 **아무도 안 불렀다**
func test_the_phase_list_is_exactly_this() -> void:
	assert_array(_ids(SeasonEnd.PHASES)).is_equal([
		"measure_hook",
		"advance_grades",
		"npc_draft",
		"season_history",
		"league_offseason",
		"protagonist_record",
		"awards",
		"aging",
		"team_profiles",
		"contracts",
		"free_agency",
		"background",
	])


## ⚠ **계약 갱신이 FA보다 먼저다.** 안 줄이면 아무도 계약이 끝나지 않아
## 시장이 영영 비어 있다
func test_contracts_run_before_free_agency() -> void:
	assert_int(_at("contracts")).is_less(_at("free_agency"))


## ⚠ **FA는 구단 성향 뒤다.** 입찰이 성적 압박과 구단주 씀씀이를 읽는다 —
## 앞에 두면 전 팀이 중립값으로 입찰한다
func test_free_agency_runs_after_the_profiles() -> void:
	assert_int(_at("team_profiles")).is_less(_at("free_agency"))


func test_phase_ids_are_unique() -> void:
	var ids: Array = _ids(SeasonEnd.PHASES)
	var seen: Dictionary = {}
	for i in ids:
		seen[i] = true
	assert_int(seen.size()).is_equal(ids.size())


## ⚠ **진급·졸업이 드래프트보다 먼저다.** 졸업 처리가 안 된 채 드래프트를
## 돌리면 **졸업생이 드래프트 풀에 없다** — 실측으로 그 해 `quit_baseball`이
## 정상(950)의 12%인 116건이었다
func test_graduation_comes_before_the_draft() -> void:
	assert_bool(_at("advance_grades") < _at("npc_draft")).is_true()


## ⚠ **드래프트가 오프시즌보다 먼저다.** 오프시즌이 미지명자 진로를
## 배정하므로, 드래프트가 뒤에 오면 이미 흩어진 뒤가 된다
func test_the_draft_comes_before_the_offseason() -> void:
	assert_bool(_at("npc_draft") < _at("league_offseason")).is_true()


## ⚠ **주인공 시즌 기록이 수상보다 먼저다.** 수상은 연도 기록 위에 얹는
## 것이라 기록이 없으면 얹을 자리가 없다.
##
## 02에선 이 기록을 `SeasonEndModal`만 불렀다 — **결산 화면을 열어야만
## `careerRecords`가 쌓였고** 자동 진행에선 은퇴할 때까지 한 줄도 없었다
func test_the_protagonist_record_comes_before_the_awards() -> void:
	assert_bool(_at("protagonist_record") < _at("awards")).is_true()


## 시즌 기록을 남긴 뒤에 나이를 먹는다 — 순서가 뒤집히면 수상 판정이
## 이미 깎인 능력치를 본다
func test_aging_comes_after_the_awards() -> void:
	assert_bool(_at("awards") < _at("aging")).is_true()


## 리그 통계를 저장한 뒤에 오프시즌이 돈다 — 오프시즌이 로스터를 흩는다
func test_stats_are_saved_before_the_offseason() -> void:
	assert_bool(_at("season_history") < _at("league_offseason")).is_true()


func test_an_unknown_phase_has_no_index() -> void:
	assert_int(_at("no_such_phase")).is_equal(-1)


# ── 한 해에 한 번 가드 ────────────────────────────────────────

func test_it_runs_once_for_a_new_year() -> void:
	assert_bool(SeasonEnd.should_run(-1, 2027)).is_true()
	assert_bool(SeasonEnd.should_run(2026, 2027)).is_true()


## ⚠ **같은 해엔 두 번 안 돈다.** 두 번 돌면 NPC 전원이 나이를 두 살 먹고
## 학년이 두 번 오른다. 02에서 이 순서를 부르는 자리가 **둘**이었다 —
## 정상 롤오버와 진로 결정 경로
func test_it_does_not_run_twice_in_the_same_year() -> void:
	assert_bool(SeasonEnd.should_run(2027, 2027)).is_false()


## ⚠ **지나간 해로 되돌아가도 안 돈다.** 세이브를 되감아 부르는 경로가
## 있으면 이미 영구히 쓰인 결과 위에 또 쓴다
func test_it_does_not_run_for_a_past_year() -> void:
	assert_bool(SeasonEnd.should_run(2028, 2027)).is_false()


## ⚠ **가드는 반드시 저장한다.** 02에서 이 가드가 스토어 안에만 있었다 —
## 가드가 막으려는 결과(NPC 전원 진급·나이 +1)는 DB에 즉시 쓰여 영구인데
## **가드 자신은 세션 한정**이라, 앱을 껐다 켜면 없던 일이 됐다
func test_the_guard_year_is_a_saved_field() -> void:
	assert_bool(SeasonEnd.SAVED_FIELDS.has("last_world_season_end_year")).is_true()
	assert_bool(SeasonEnd.SAVED_FIELDS.has("last_draft_year")).is_true()


# ── 계획 ──────────────────────────────────────────────────────

func test_a_new_year_plans_every_phase() -> void:
	var plan: Array = SeasonEnd.plan(2026, 2027)
	assert_int(plan.size()).is_equal(SeasonEnd.PHASES.size())


func test_a_repeat_year_plans_nothing() -> void:
	assert_int(SeasonEnd.plan(2027, 2027).size()).is_equal(0)


func test_the_plan_keeps_the_canonical_order() -> void:
	assert_array(SeasonEnd.plan(2026, 2027)).is_equal(_ids(SeasonEnd.PHASES))


## ⚠ **계측 훅은 가드 뒤·처리 앞이다.** 가드 앞이면 같은 해에 두 번 잡히고,
## 진급 뒤면 이미 학년·나이가 지나 그 해 기록이 사라진다
func test_the_measurement_hook_runs_first_of_all_phases() -> void:
	assert_int(_at("measure_hook")).is_equal(0)
	assert_bool(_at("measure_hook") < _at("advance_grades")).is_true()


## 계측이 게임을 깨지 않는다 — 훅은 건너뛸 수 있어야 한다
func test_the_measurement_hook_is_optional() -> void:
	assert_bool(SeasonEnd.PHASES[0].get("optional", false)).is_true()
	for i in range(1, SeasonEnd.PHASES.size()):
		assert_bool(SeasonEnd.PHASES[i].get("optional", false)).is_false()
