extends GdUnitTestSuite

## 진로 지원에 **팀을 볼 근거**가 있나 — P-21의 남은 절반.
##
## 02 `UniversityApplyModal`(214줄)은 대학마다 이걸 더 낸다:
##  · **팀 프로필** — 스타일 · 난이도 · 재정 · 강점 · 설명
##  · **로스터** — 총 인원 · 선수 수 · 명단(이름 + 포지션)
##
## P-21에서 자격·확률·요구조건까지는 붙였는데 **어떤 팀인지는 아직 없다.**
##
## ⚠ **04 데이터에 없는 건 지어내지 않는다.** 대학 팀에 `power`·`resource`·
## `stadium`은 있고 `style`·`desc`·`strengths`는 **없다**(세어 봤다).
## 있는 것만 낸다 — `resource`(재정 성향)와 **로스터**다.


func _state(gpa: float = 3.5) -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2029,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["school"] = {"gpa": gpa}
	s["protagonist"]["career_records"] = [
		{"league_id": "LEAGUE_HIGHSCHOOL", "ps_result": "8강", "awards": []}]
	Pending.push_once(s, {"type": "career_choice_hub"})
	return s


func _uni_labels(s: Dictionary) -> Array:
	var out: Array = []
	for c in DecisionVm.build(s).get("choices", []):
		if String(c.get("id", "")).begins_with("university:"):
			out.append({"id": String(c["id"]).trim_prefix("university:"),
				"label": String(c["label"])})
	return out


# ── 어떤 팀인가 ───────────────────────────────────────────────────

## 🔴 **재정 성향을 낸다.** 02도 `funding`을 보여준다 — 04엔 `resource`가
## 그 축이다(`안정`·`풍족` 등)
func test_재정_성향이_붙는다() -> void:
	var s: Dictionary = _state()
	var any: bool = false
	for e in _uni_labels(s):
		var res: String = String(World.team_field({}, e["id"], "resource", ""))
		if res.is_empty():
			continue
		any = true
		assert_int(String(e["label"]).find(res)).override_failure_message(
			"%s의 재정(%s)이 화면에 없다: %s" % [e["id"], res, e["label"]]) \
			.is_greater(-1)
	assert_bool(any).override_failure_message(
		"재정 성향이 있는 대학이 하나도 없다 — 검사가 아무것도 안 본다").is_true()


## 🔴 **로스터 규모를 낸다.** 02는 총 인원과 선수 수를 보여준다 —
## 사람이 몇인지 모르면 "가면 뛸 수 있나"를 못 가늠한다
func test_로스터_인원이_붙는다() -> void:
	var s: Dictionary = _state()
	var any: bool = false
	for e in _uni_labels(s):
		var n: int = World.roster_of(s["world"], e["id"]).size()
		if n <= 0:
			continue
		any = true
		assert_int(String(e["label"]).find("%d명" % n)).override_failure_message(
			"%s의 인원(%d명)이 화면에 없다: %s" % [e["id"], n, e["label"]]) \
			.is_greater(-1)
	assert_bool(any).override_failure_message(
		"로스터가 있는 대학이 하나도 없다").is_true()


## ⚠ **같은 포지션 경쟁자 수가 더 중요하다.** 32명 중 투수가 몇인지가
## "가면 뛸 수 있나"를 가른다 — 02도 포지션을 명단에 적는다
func test_같은_포지션_경쟁자가_붙는다() -> void:
	var s: Dictionary = _state()
	var kind: String = String(s["protagonist"].get("player_type", "pitcher"))
	var any: bool = false
	for e in _uni_labels(s):
		var same: int = 0
		for q in World.roster_of(s["world"], e["id"]):
			if String(q.get("player_type", "pitcher")) == kind:
				same += 1
		if same <= 0:
			continue
		any = true
		assert_int(String(e["label"]).find("같은 자리 %d" % same)) \
			.override_failure_message(
				"%s의 같은 포지션 경쟁자(%d)가 화면에 없다: %s"
				% [e["id"], same, e["label"]]).is_greater(-1)
	assert_bool(any).is_true()


## ⚠ **없는 축을 지어내지 않는다** — 04 대학 데이터에 `style`·`desc`가 없다
func test_없는_축을_안_지어낸다() -> void:
	var src := CodeText.of("res://ui/decision_vm.gd")
	for key in ["\"style\"", "\"desc\"", "\"strengths\"", "\"difficulty\""]:
		assert_int(src.find(key)).override_failure_message(
			"04에 없는 축 %s를 화면이 읽는다 — 늘 빈칸이 된다" % key) \
			.is_equal(-1)


## 화면 문구에 마크다운을 쓰지 않는다
func test_마크다운을_안_쓴다() -> void:
	for e in _uni_labels(_state()):
		assert_int(String(e["label"]).find("**")).is_equal(-1)


## 독립리그에도 같은 대접 — 02도 전용 모달이 있었다
func test_독립리그에도_인원이_붙는다() -> void:
	var s: Dictionary = _state()
	var any: bool = false
	for c in DecisionVm.build(s).get("choices", []):
		var id: String = String(c.get("id", ""))
		if not id.begins_with("independent:"):
			continue
		var tid: String = id.trim_prefix("independent:")
		var n: int = World.roster_of(s["world"], tid).size()
		if n <= 0:
			continue
		any = true
		assert_int(String(c["label"]).find("%d명" % n)) \
			.override_failure_message(
				"%s의 인원이 화면에 없다: %s" % [tid, c["label"]]).is_greater(-1)
	assert_bool(any).is_true()


## ⚠ **로스터가 없으면 아무 말도 안 한다.** `0명 · 같은 자리 0`은 정보가
## 아니라 잡음이다 — 세계가 아직 안 만들어진 팀이 그렇게 보인다.
##
## ⚠ **실제 세계엔 빈 팀이 없어 변이가 살아남았다** — 빈 세계로 재야 잡힌다
func test_로스터가_없으면_안_적는다() -> void:
	var s: Dictionary = _state()
	s["world"] = {"rosters": {}}
	for e in _uni_labels(s):
		assert_int(String(e["label"]).find("명")).override_failure_message(
			"로스터가 없는데 인원을 적었다: %s" % e["label"]).is_equal(-1)
		assert_int(String(e["label"]).find("같은 자리")).is_equal(-1)
