extends GdUnitTestSuite

## 진로 최종 선택이 **정할 근거**를 주나 — 02 `CareerResultModal`(133) 대조.
##
## **되돌릴 수 없는 선택이다.** 02는 갈래마다 이렇게 적는다:
##  · `드래프트 지명: {팀} / {N}R {M}순위`
##  · `대학 합격: {팀}` · `독립리그 합격: {팀}`
##  · `다음 학년 진급 (N학년)` / `독립리그 계속` + 부제 *"드래프트 미지명 —"*
##
## 04 `_choice`는 이랬다:
##  · `"프로에 간다"` — 🔴 **어느 팀인지, 몇 라운드인지 없다**
##  · `"지금 자리에 남는다"` — 그게 진급인지 재수인지 안 말한다
##
## ⚠ **지원 화면(P-21b)엔 재정·인원·같은 자리를 붙였는데 최종 선택엔 없다.**
## "되돌릴 수 없이 정하는" 자리가 더 중요하다.


func _state(res: Dictionary, o: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": "ME", "name": "김한결",
		"career_stage": "highschool", "grade": 3,
		"team_id": "TEAM_HS_AEWOL", "league_id": "LEAGUE_HIGHSCHOOL",
		"pitching": {"ovr": 70.0}, "player_type": "pitcher",
		"injury": null, "retired": false}
	p.merge(o, true)
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2029,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["protagonist"].merge(p, true)
	s["career"] = {"applications": {}, "submitted": true,
		"results": res, "final_choice": ""}
	s["pending"] = []
	Pending.push_once(s, {"type": "career_choice"})
	return s


func _labels(s: Dictionary) -> Array:
	var out: Array = []
	for c in DecisionVm.build(s).get("choices", []):
		out.append(String(c.get("label", "")))
	return out


# ── 드래프트 갈래 ─────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 04는 `"프로에 간다"`뿐이라 **어느 팀인지 몰랐다**
func test_지명_팀과_순위가_나온다() -> void:
	var s: Dictionary = _state({"drafted": true,
		"draft_team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"draft_round": 2, "draft_pick": 21,
		"university_passed": [], "independent_passed": []})
	var joined: String = "\n".join(PackedStringArray(_labels(s)))
	assert_int(joined.find("부산 웨이브스")).override_failure_message(
		"지명 팀 이름이 없다 — 어디로 가는지 모르고 고른다: %s" % joined) \
		.is_greater(-1)
	assert_int(joined.find("2라운드")).override_failure_message(
		"라운드가 없다: %s" % joined).is_greater(-1)


## 지명이 없으면 그 선택지가 아예 없다 — 누르면 엔진이 거절하는 버튼을
## 두지 않는다
func test_지명이_없으면_선택지도_없다() -> void:
	var s: Dictionary = _state({"drafted": false,
		"university_passed": [], "independent_passed": []})
	for label in _labels(s):
		assert_int(label.find("라운드")).override_failure_message(
			"미지명인데 드래프트 선택지가 있다: %s" % label).is_equal(-1)


# ── 대학·독립 갈래 ────────────────────────────────────────────────

## 🔴 **P-21b에서 붙인 팀 정보가 최종 선택엔 없었다.**
## 되돌릴 수 없이 정하는 자리라 오히려 더 필요하다
func test_대학_선택지에_팀_정보가_붙는다() -> void:
	var s: Dictionary = _state({"drafted": false,
		"university_passed": ["TEAM_UNIV_ASAN"], "independent_passed": []})
	var joined: String = "\n".join(PackedStringArray(_labels(s)))
	assert_int(joined.find("아산대")).is_greater(-1)
	var n: int = World.roster_of(s["world"], "TEAM_UNIV_ASAN").size()
	assert_int(joined.find("%d명" % n)).override_failure_message(
		"대학 선택지에 인원이 없다 — 지원 화면엔 있는데: %s" % joined) \
		.is_greater(-1)
	assert_int(joined.find("같은 자리")).override_failure_message(
		"같은 자리 경쟁자가 없다: %s" % joined).is_greater(-1)


func test_독립_선택지에도_팀_정보가_붙는다() -> void:
	var s: Dictionary = _state({"drafted": false, "university_passed": [],
		"independent_passed": ["TEAM_IND_SEOUL_COMETS"]})
	var joined: String = "\n".join(PackedStringArray(_labels(s)))
	var n: int = World.roster_of(s["world"], "TEAM_IND_SEOUL_COMETS").size()
	if n > 0:
		assert_int(joined.find("%d명" % n)).override_failure_message(
			"독립 선택지에 인원이 없다: %s" % joined).is_greater(-1)


# ── 남는 갈래 ─────────────────────────────────────────────────────

## 🔴 **`"지금 자리에 남는다"`가 무엇을 뜻하는지 안 말했다.**
## 02는 고교/대학/독립마다 다르게 적는다 — 대학생은 **진급**이다
func test_대학생은_진급이라고_말한다() -> void:
	var s: Dictionary = _state({"drafted": false, "university_passed": [],
		"independent_passed": []},
		{"career_stage": "university", "league_id": "LEAGUE_UNIVERSITY",
		"team_id": "TEAM_UNIV_ASAN", "grade": 2})
	var joined: String = "\n".join(PackedStringArray(_labels(s)))
	assert_int(joined.find("3학년")).override_failure_message(
		"대학생에게 다음 학년을 안 알려준다: %s" % joined).is_greater(-1)


## 독립리그는 "계속"이다 — 학년이 없다
func test_독립은_계속이라고_말한다() -> void:
	var s: Dictionary = _state({"drafted": false, "university_passed": [],
		"independent_passed": []},
		{"career_stage": "independent", "league_id": "LEAGUE_INDEPENDENT",
		"team_id": "TEAM_IND_SEOUL_COMETS"})
	var joined: String = "\n".join(PackedStringArray(_labels(s)))
	assert_int(joined.find("학년")).override_failure_message(
		"독립리그인데 학년을 말한다: %s" % joined).is_equal(-1)
	assert_int(joined.find("계속")).override_failure_message(
		"계속 뛴다는 말이 없다: %s" % joined).is_greater(-1)


## 아무 데도 안 붙어도 길은 하나 있어야 한다
func test_아무_데도_안_붙어도_길이_있다() -> void:
	var s: Dictionary = _state({"drafted": false, "university_passed": [],
		"independent_passed": []})
	assert_int(_labels(s).size()).override_failure_message(
		"고를 게 하나도 없다 — 진행이 막힌다").is_greater(0)


## 화면 문구에 마크다운을 쓰지 않는다
func test_마크다운을_안_쓴다() -> void:
	var s: Dictionary = _state({"drafted": true,
		"draft_team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"draft_round": 1, "draft_pick": 3,
		"university_passed": ["TEAM_UNIV_ASAN"], "independent_passed": []})
	for label in _labels(s):
		assert_int(label.find("**")).is_equal(-1)
