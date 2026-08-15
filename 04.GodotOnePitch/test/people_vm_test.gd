extends GdUnitTestSuite

## 인물(관계도) ViewModel — C-2.
##
## 원본: `pages/people/PeoplePage.svelte`
##
## ⚠ **관계값 숫자를 절대 보여주지 않는다.** 7단계 라벨과 방향 문장만 쓴다 —
## 효과도 "+4"가 아니라 "출전 기회에서 유리합니다"로 쓴다. 규칙 파일 수치를
## 고칠 때 화면 문자열이 거짓말이 되지 않게 하려는 것이기도 하다.


func _row(pid: String, kind: String, value: int,
		contact: String = Relationship.CONTACT_TOGETHER,
		specialty: String = "", met: int = 2030) -> Dictionary:
	return {"person_id": pid, "kind": kind, "value": value,
		"contact": contact, "specialty": specialty, "met_season": met,
		"met_team": "T1", "last_team": "T1", "memories": [], "updated_day": 1}


## 이름은 세계에서 찾는다 — 관계 행에는 id만 있다
func _state(rows: Array, staff: Array = [], roster: Array = []) -> Dictionary:
	return {
		"season_year": 2032,
		"protagonist": {"id": "ME", "team_id": "T1"},
		"relationships": rows,
		"world": {"staff": {"T1": staff}, "rosters": {"T1": roster}},
	}


func _texts(vm: Dictionary) -> String:
	return JSON.stringify(vm)


func _rows_of(vm: Dictionary, side: String) -> Array:
	return vm[side]["rows"]


func _find(vm: Dictionary, side: String, pid: String) -> Dictionary:
	for r in _rows_of(vm, side):
		if String(r["person_id"]) == pid:
			return r
	return {}


# ── 빈 상태 ───────────────────────────────────────────────────

func test_an_empty_world_says_so() -> void:
	var vm: Dictionary = PeopleVm.build(_state([]))
	assert_bool(vm["has_data"]).is_false()
	assert_str(String(vm["empty"])).contains("아직")


func test_an_empty_world_still_has_both_columns() -> void:
	var vm: Dictionary = PeopleVm.build(_state([]))
	assert_array(_rows_of(vm, "together")).is_empty()
	assert_array(_rows_of(vm, "past")).is_empty()


func test_rows_make_it_have_data() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_TEAMMATE, 20)]))
	assert_bool(vm["has_data"]).is_true()


# ── 두 갈래로 가른다 ──────────────────────────────────────────

## 좌: 지금 함께 있는 사람 · 우: 지난 인연. **재회 서사가 여기서 보인다**
func test_together_and_past_are_split_by_contact() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_TEAMMATE, 20),
		_row("P2", Relationship.KIND_MANAGER, 30, Relationship.CONTACT_APART),
		_row("P3", Relationship.KIND_COACH, 40, Relationship.CONTACT_ENDED),
	]))
	assert_int(_rows_of(vm, "together").size()).is_equal(1)
	assert_int(_rows_of(vm, "past").size()).is_equal(2)


func test_each_column_counts_itself() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_TEAMMATE, 20),
		_row("P2", Relationship.KIND_TEAMMATE, 10),
		_row("P3", Relationship.KIND_COACH, 40, Relationship.CONTACT_APART),
	]))
	assert_int(int(vm["together"]["count"])).is_equal(2)
	assert_int(int(vm["past"]["count"])).is_equal(1)


func test_each_column_has_its_own_empty_line() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_TEAMMATE, 20)]))
	assert_str(String(vm["together"]["empty"])).is_not_empty()
	assert_str(String(vm["past"]["empty"])).contains("헤어진")


## 헤어진 관계는 옅어지고 재회하면 그 자리에서 이어진다 — 그 규칙을 적어 준다
func test_the_past_column_explains_fading() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_TEAMMATE, 20, Relationship.CONTACT_APART)]))
	assert_str(String(vm["past"]["note"])).contains("옅어")


# ── 순서 ──────────────────────────────────────────────────────

## ⚠ **역할이 먼저다.** 감독·구단주가 위에 있어야 "누가 나를 쓰는가"가
## 먼저 보인다 — 동료 서른 명 밑에 감독이 묻히면 화면의 뜻이 없다
func test_together_is_ordered_by_role() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_TEAMMATE, 90),
		_row("P2", Relationship.KIND_COACH, 5),
		_row("P3", Relationship.KIND_OWNER, 1),
		_row("P4", Relationship.KIND_MANAGER, 0),
	]))
	var ids: Array = []
	for r in _rows_of(vm, "together"):
		ids.append(String(r["person_id"]))
	assert_array(ids).is_equal(["P4", "P3", "P2", "P1"])


func test_the_same_role_is_ordered_by_closeness() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_TEAMMATE, 10),
		_row("P2", Relationship.KIND_TEAMMATE, 70),
		_row("P3", Relationship.KIND_TEAMMATE, -40),
	]))
	var ids: Array = []
	for r in _rows_of(vm, "together"):
		ids.append(String(r["person_id"]))
	assert_array(ids).is_equal(["P2", "P1", "P3"])


func test_an_unknown_role_falls_to_the_bottom() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", "reporter", 90),
		_row("P2", Relationship.KIND_TEAMMATE, 1),
	]))
	assert_str(String(_rows_of(vm, "together")[1]["person_id"])).is_equal("P1")


## 지난 인연은 **진하게 남은 것부터** — 적대도 각별만큼 서사다
func test_the_past_is_ordered_by_intensity_either_way() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_TEAMMATE, 20, Relationship.CONTACT_APART),
		_row("P2", Relationship.KIND_TEAMMATE, -80, Relationship.CONTACT_APART),
		_row("P3", Relationship.KIND_TEAMMATE, 50, Relationship.CONTACT_ENDED),
	]))
	var ids: Array = []
	for r in _rows_of(vm, "past"):
		ids.append(String(r["person_id"]))
	assert_array(ids).is_equal(["P2", "P3", "P1"])


# ── 숫자를 안 보여준다 ────────────────────────────────────────

## ⚠ **이 화면의 원칙이다.** 값이 문자열 어디에도 새면 안 된다 —
## 숫자가 보이면 플레이어가 그 숫자를 최적화하기 시작한다
func test_the_raw_value_never_reaches_the_screen() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_TEAMMATE, 73, Relationship.CONTACT_TOGETHER,
			"", 2000),
		_row("P2", Relationship.KIND_MANAGER, -47, Relationship.CONTACT_APART,
			"", 2000),
	]))
	for side in ["together", "past"]:
		for r in _rows_of(vm, side):
			for key in r:
				if key == "person_id":
					continue
				assert_str(str(r[key])).override_failure_message(
					"%s의 %s에 관계값이 새어 나왔다: %s" % [side, key, r[key]]
					).not_contains("73").not_contains("47")


func test_the_row_carries_no_value_field() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_TEAMMATE, 73)]))
	assert_bool(_rows_of(vm, "together")[0].has("value")).override_failure_message(
		"행이 관계값을 그대로 들고 있다 — 화면이 언젠가 찍는다").is_false()


# ── 라벨과 색조 ───────────────────────────────────────────────

func test_the_label_comes_from_the_value() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_TEAMMATE, 80),
		_row("P2", Relationship.KIND_TEAMMATE, 0),
		_row("P3", Relationship.KIND_TEAMMATE, -80),
	]))
	assert_str(String(_find(vm, "together", "P1")["label"])).is_equal("각별")
	assert_str(String(_find(vm, "together", "P2")["label"])).is_equal("중립")
	assert_str(String(_find(vm, "together", "P3")["label"])).is_equal("적대")


func test_the_tone_comes_from_the_value() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_TEAMMATE, 80),
		_row("P2", Relationship.KIND_TEAMMATE, -80),
	]))
	assert_str(String(_find(vm, "together", "P1")["tone"])).is_equal("close")
	assert_str(String(_find(vm, "together", "P2")["tone"])).is_equal("hostile")


## 색조는 전부 테마에 있어야 한다 — 화면이 색을 직접 고르면 안 된다
func test_every_tone_has_a_theme_color() -> void:
	for b in Relationship.LABELS:
		assert_bool(AppTheme.TONE_COLOR.has(String(b[3]))).override_failure_message(
			"색조 %s에 테마 색이 없다" % b[3]).is_true()


## ⚠ **숫자를 안 보여주므로 색이 곧 눈금이다.** 두 단계가 같은 색이면
## 그 두 단계는 화면에서 구분이 안 된다
func test_no_two_tones_share_a_color() -> void:
	var seen: Dictionary = {}
	for b in Relationship.LABELS:
		var tone: String = String(b[3])
		var c: Color = AppTheme.TONE_COLOR.get(tone, Color.BLACK)
		assert_bool(seen.has(c)).override_failure_message(
			"%s와 %s가 같은 색이다" % [seen.get(c, ""), tone]).is_false()
		seen[c] = tone


# ── 효과 문장 ─────────────────────────────────────────────────

## ⚠ **방향만 문장으로.** 수치는 `relationship_rules.json`이 정본이고
## 여기 숫자를 적으면 튜닝할 때마다 화면이 거짓말이 된다
func test_the_effect_is_a_sentence_not_a_number() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_MANAGER, 70)]))
	var eff: String = String(_rows_of(vm, "together")[0]["detail"])
	assert_str(eff).contains("출전")
	assert_str(eff).not_contains("+")


func test_a_bad_relation_reads_the_other_way() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_MANAGER, -70)]))
	assert_str(String(_rows_of(vm, "together")[0]["detail"])).contains("밀릴")


func test_neutral_says_nothing_happens_yet() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_MANAGER, 3)]))
	assert_str(String(_rows_of(vm, "together")[0]["detail"])).contains("아직")


## ⚠ **헤어진 사람에게 효과 문장을 붙이지 않는다.** `effects_of`는 접촉
## 중인 관계만 센다 — 지난 인연에 "유리합니다"를 찍으면 화면이 없는
## 효과를 약속하는 것이고, 그 어긋남은 플레이어에게만 보인다
func test_a_past_relation_promises_no_effect() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_MANAGER, 70, Relationship.CONTACT_APART),
		_row("P2", Relationship.KIND_MANAGER, -70, Relationship.CONTACT_ENDED),
	]))
	for r in _rows_of(vm, "past"):
		assert_str(String(r["detail"])).override_failure_message(
			"헤어진 감독이 아직 내 보직을 정한다고 쓴다: %s" % r["detail"]
			).not_contains("출전").not_contains("밀릴")


## 중립 구간은 −10~10이다 — **라벨로 가른다.** 값 부호로 가르면
## +2가 "유리합니다"로 뜨는데 판정은 라벨로 하니 실제로는 아무 일도 없다
func test_the_effect_is_cut_by_the_label_not_the_sign() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_MANAGER, 10),
		_row("P2", Relationship.KIND_MANAGER, 11),
	]))
	assert_str(String(_find(vm, "together", "P1")["detail"])).contains("아직")
	assert_str(String(_find(vm, "together", "P2")["detail"])).contains("출전")


func test_every_kind_has_both_directions() -> void:
	for kind in PeopleVm.KIND_ORDER:
		var up: Dictionary = PeopleVm.build(_state([_row("X", String(kind), 80)]))
		var down: Dictionary = PeopleVm.build(_state([_row("X", String(kind), -80)]))
		var a: String = String(_rows_of(up, "together")[0]["detail"])
		var b: String = String(_rows_of(down, "together")[0]["detail"])
		assert_str(a).override_failure_message("%s에 좋은 쪽 문장이 없다" % kind
			).is_not_empty()
		assert_str(b).override_failure_message("%s에 나쁜 쪽 문장이 없다" % kind
			).is_not_empty()
		assert_str(a).override_failure_message(
			"%s는 좋을 때와 나쁠 때가 같은 문장이다" % kind).is_not_equal(b)


# ── 누구인가 ──────────────────────────────────────────────────

func test_the_name_comes_from_the_staff_table() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("S1", Relationship.KIND_MANAGER, 20)],
		[{"id": "S1", "name": "박감독", "role": "manager"}]))
	assert_str(String(_rows_of(vm, "together")[0]["name"])).is_equal("박감독")


func test_the_name_comes_from_the_roster_too() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("N1", Relationship.KIND_TEAMMATE, 20)], [],
		[{"id": "N1", "name": "이동료"}]))
	assert_str(String(_rows_of(vm, "together")[0]["name"])).is_equal("이동료")


## ⚠ **은퇴 등으로 세계에서 사라진 상대는 이름이 없다.** 빈칸으로 두면
## 지난 인연이 이름 없는 줄로 남는다 — 역할명으로 대신한다
func test_a_vanished_person_falls_back_to_the_role() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("GONE", Relationship.KIND_MANAGER, 20, Relationship.CONTACT_ENDED)]))
	assert_str(String(_rows_of(vm, "past")[0]["name"])).is_equal("(감독)")


## 지난 인연의 이름도 세계 어디서나 찾는다 — 다른 팀으로 간 옛 동료다
func test_a_person_on_another_team_is_still_named() -> void:
	var s: Dictionary = _state(
		[_row("N9", Relationship.KIND_TEAMMATE, 20, Relationship.CONTACT_APART)])
	s["world"]["rosters"]["T2"] = [{"id": "N9", "name": "옛동료"}]
	assert_str(String(_rows_of(PeopleVm.build(s), "past")[0]["name"])
		).is_equal("옛동료")


# ── 역할 라벨 ─────────────────────────────────────────────────

func test_the_kind_label_is_korean() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_MANAGER, 20),
		_row("P2", Relationship.KIND_OWNER, 20),
		_row("P3", Relationship.KIND_TEAMMATE, 20),
	]))
	assert_str(String(_find(vm, "together", "P1")["kind_label"])).is_equal("감독")
	assert_str(String(_find(vm, "together", "P2")["kind_label"])).is_equal("구단주")
	assert_str(String(_find(vm, "together", "P3")["kind_label"])).is_equal("동료")


## ⚠ **코치는 한 팀에 여덟 명까지 있다.** 전문 분야를 안 붙이면
## 여덟 줄이 전부 "코치"라 누가 내 훈련을 봐 주는지 못 가린다
func test_a_coach_shows_the_specialty() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("C1", Relationship.KIND_COACH, 20, Relationship.CONTACT_TOGETHER,
			"투수")]))
	assert_str(String(_rows_of(vm, "together")[0]["kind_label"])).contains("투수")


func test_a_coach_without_a_specialty_is_still_a_coach() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("C1", Relationship.KIND_COACH, 20)]))
	assert_str(String(_rows_of(vm, "together")[0]["kind_label"])).is_equal("코치")


## 끝난 관계는 그렇게 보여야 한다 — 값이 동결된 기록이다
func test_an_ended_relation_is_marked() -> void:
	var vm: Dictionary = PeopleVm.build(_state([
		_row("P1", Relationship.KIND_MANAGER, 20, Relationship.CONTACT_ENDED),
		_row("P2", Relationship.KIND_MANAGER, 20, Relationship.CONTACT_APART),
	]))
	assert_str(String(_find(vm, "past", "P1")["kind_label"])).contains("은퇴")
	assert_str(String(_find(vm, "past", "P2")["kind_label"])).not_contains("은퇴")
	assert_bool(_find(vm, "past", "P1")["ended"]).is_true()
	assert_bool(_find(vm, "past", "P2")["ended"]).is_false()


# ── 언제 만났나 ───────────────────────────────────────────────

func test_it_says_when_we_met() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_TEAMMATE, 20,
			Relationship.CONTACT_APART, "", 2029)]))
	assert_str(String(_rows_of(vm, "past")[0]["detail"])).is_equal("2029년에 만남")


func test_an_unknown_meeting_year_says_nothing() -> void:
	var vm: Dictionary = PeopleVm.build(_state(
		[_row("P1", Relationship.KIND_TEAMMATE, 20,
			Relationship.CONTACT_APART, "", 0)]))
	assert_str(String(_rows_of(vm, "past")[0]["detail"])).is_empty()


# ── 진짜 세계 ─────────────────────────────────────────────────

## ⚠ **손으로 만든 사전은 결함을 숨긴다.** C-1에서 드래프트 보드 출신이
## 전원 "재수"였던 게 검사에 안 걸린 이유가 그것이었다 — 여기서는 실제
## 세계를 세우고 감독·구단주·코치가 다 나타나는지 본다
func test_a_real_world_shows_every_role() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	RelationshipRunner.reconcile(s, 7)

	var vm: Dictionary = PeopleVm.build(s)
	var kinds: Dictionary = {}
	for r in _rows_of(vm, "together"):
		kinds[String(r["kind"])] = true
	for want in [Relationship.KIND_MANAGER, Relationship.KIND_OWNER,
			Relationship.KIND_COACH, Relationship.KIND_TEAMMATE]:
		assert_bool(kinds.has(String(want))).override_failure_message(
			"진짜 세계에 %s가 안 나타났다 — 배선이 끊겼다" % want).is_true()


## 이름이 다 붙는가 — 하나라도 "(감독)"으로 떨어지면 조회가 샌 것이다
func test_a_real_world_names_everyone() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	RelationshipRunner.reconcile(s, 7)

	for r in _rows_of(PeopleVm.build(s), "together"):
		assert_str(String(r["name"])).override_failure_message(
			"%s(%s)의 이름을 세계에서 못 찾았다" % [r["person_id"], r["kind"]]
			).not_contains("(")
