extends GdUnitTestSuite

## 진로 지원 화면이 **고를 근거를 보여주나** — 🔴 안 보여주고 있었다.
##
## 02 `UniversityApplyModal`(214줄)은 대학마다 이걸 낸다:
##  · **자격 충족** — 성적(`meetsAcademic`) · 야구(`meetsBaseball`), 색으로 갈림
##  · **팀 프로필** — 스타일 · 난이도 · 재정 · 강점 · 설명
##  · **로스터** — 총 인원 · 선수 수 · 명단
##
## 04 `_hub`는 **"○○ 지원"이라는 한 줄 버튼**이 전부였다. 어디에 낼지
## 고를 근거가 하나도 없었다 — **"합쳐 놓은 것"이 곧 "옮긴 것"은 아니다.**
##
## ⚠ **산식은 `CareerPath`가 정본이다.** 화면이 다시 세면 뜬 확률과 실제
## 판정이 갈린다 — 협상 화면이 같은 이유로 `Negotiation`을 그대로 쓴다.


func _state(gpa: float = 3.5) -> Dictionary:
	return {
		"day": 300, "season_year": 2027,
		"protagonist": {"id": "ME", "name": "김한결",
			"career_stage": "highschool", "grade": 3,
			"team_id": "TEAM_HS_AEWOL", "league_id": "LEAGUE_HIGHSCHOOL",
			"pitching": {"ovr": 70.0}, "career_records": [], "injury": null},
		"school": {"gpa": gpa},
		"pending": [{"type": "career_choice_hub"}], "mailbox": [],
	}


func _hub(s: Dictionary) -> Dictionary:
	return DecisionVm.build(s)


# ── 근거가 있나 ───────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 이름만 있으면 아무 데나 찍는 것과 같다
func test_대학마다_합격_확률이_붙는다() -> void:
	var d: Dictionary = _hub(_state())
	var found: bool = false
	for c in d.get("choices", []):
		if String(c.get("id", "")).begins_with("university:"):
			found = true
			assert_str(String(c.get("label", ""))).override_failure_message(
				"대학 선택지에 확률이 없다 — 고를 근거가 없다: %s"
				% c.get("label", "")).contains("%")
	assert_bool(found).override_failure_message("대학 선택지가 없다").is_true()


## ⚠ **화면이 확률을 다시 세지 않는다.** `CareerPath.university_chance`가
## 정본이다 — 다시 세면 뜬 값과 실제 판정이 갈린다
func test_확률이_정본과_같다() -> void:
	var s: Dictionary = _state()
	var d: Dictionary = _hub(s)
	var grade: int = CareerPath.grade_of_gpa(3.5)
	for c in d.get("choices", []):
		var id: String = String(c.get("id", ""))
		if not id.begins_with("university:"):
			continue
		var tid: String = id.trim_prefix("university:")
		var want: int = roundi(CareerPath.university_chance(
			World.team_field({}, tid, "power", null), grade, 0.0))
		assert_int(String(c["label"]).count("%d%%" % want)) \
			.override_failure_message(
				"%s: 화면 %s · 정본 %d%%" % [tid, c["label"], want]) \
			.is_greater(0)


## 학점이 좋아지면 확률이 오른다 — 값이 실제로 흐른다
func test_학점이_확률에_닿는다() -> void:
	var low: String = ""
	var high: String = ""
	for c in _hub(_state(1.0)).get("choices", []):
		if String(c.get("id", "")).begins_with("university:"):
			low = String(c["label"])
			break
	for c in _hub(_state(4.5)).get("choices", []):
		if String(c.get("id", "")).begins_with("university:"):
			high = String(c["label"])
			break
	assert_str(high).override_failure_message(
		"학점 1.0과 4.5의 화면이 같다 — 4년 관리한 게 뜻이 없다\n%s\n%s"
		% [low, high]).is_not_equal(low)


## ⚠ **전력 등급을 같이 적는다.** 확률만 보면 약한 대학이 늘 유리해 보인다 —
## 강한 대학은 스카우트 가산이 크다(`scout_bonus_of_power`)
func test_전력과_가산이_붙는다() -> void:
	var d: Dictionary = _hub(_state())
	var body: String = String(d.get("body", ""))
	var joined: String = body
	for c in d.get("choices", []):
		joined += "\n" + String(c.get("label", ""))
	assert_bool(joined.contains("전력") or joined.contains("★")) \
		.override_failure_message("전력 등급이 어디에도 없다").is_true()
	assert_bool(joined.contains("스카우트")).override_failure_message(
		"스카우트 가산이 없다 — 강한 대학에 갈 이유가 안 보인다").is_true()


## 독립리그도 같은 대접 — 02도 전용 모달(167줄)이 있었다
func test_독립리그에도_근거가_붙는다() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = "highschool"
	var any: bool = false
	for c in _hub(s).get("choices", []):
		if String(c.get("id", "")).begins_with("independent:"):
			any = true
			assert_str(String(c.get("label", ""))).override_failure_message(
				"독립리그 선택지에 확률이 없다: %s" % c.get("label", "")) \
				.contains("%")
	assert_bool(any).override_failure_message("독립리그 선택지가 없다").is_true()


## ⚠ **내 값을 머리에 적는다.** 학점 등급과 야구 점수를 모르면 확률이
## 왜 그런지 알 수 없다
func test_내_값이_머리에_있다() -> void:
	var body: String = String(_hub(_state()).get("body", ""))
	assert_bool(body.contains("학업")).override_failure_message(
		"내 학업 등급이 없다: %s" % body).is_true()
	assert_bool(body.contains("야구")).override_failure_message(
		"내 야구 점수가 없다: %s" % body).is_true()


## 화면 문구에 마크다운을 쓰지 않는다 — `Label`은 `**`를 글자로 찍는다
func test_마크다운을_안_쓴다() -> void:
	var d: Dictionary = _hub(_state())
	var joined: String = String(d.get("body", ""))
	for c in d.get("choices", []):
		joined += String(c.get("label", ""))
	assert_int(joined.find("**")).override_failure_message(
		"화면 문구에 마크다운이 있다").is_equal(-1)


# ── 도달 가능한가 ─────────────────────────────────────────────────

## 🔴 **대학 50곳 중 앞 여섯만 보였다 — 44곳이 도달 불가였다.**
##
## 화면에 스크롤이 없어 `APPLY_SHOWN = 6`으로 잘랐고, 가나다순 앞에서
## 잘리니 **뒤쪽 대학은 게임 내내 한 번도 지원할 수 없었다.**
func test_모든_대학이_보인다() -> void:
	var n: int = 0
	for c in _hub(_state()).get("choices", []):
		if String(c.get("id", "")).begins_with("university:"):
			n += 1
	assert_int(n).override_failure_message(
		"대학이 %d곳만 보인다 — 나머지는 영영 지원할 수 없다" % n) \
		.is_equal(World.teams_of("LEAGUE_UNIVERSITY").size())


## ⚠ **강한 곳부터 세운다.** 가나다순은 고를 근거가 아니다
func test_전력_순으로_선다() -> void:
	var last: float = 999.0
	for c in _hub(_state()).get("choices", []):
		var id: String = String(c.get("id", ""))
		if not id.begins_with("university:"):
			continue
		var pw = World.team_field({}, id.trim_prefix("university:"), "power", null)
		var f: float = float(pw) if pw != null else 0.0
		assert_float(f).override_failure_message(
			"전력이 %.0f 다음에 %.0f가 왔다 — 정렬이 안 됐다" % [last, f]) \
			.is_less_equal(last)
		last = f


## 화면이 그 목록을 실제로 그리나 — **스크롤 안에 붙어야 한다**
func test_화면이_스크롤에_붙인다() -> void:
	var src := CodeText.of("res://ui/screens/decision_screen.gd")
	assert_int(src.find("Pad/Center/Col/Scroll/Choices")).override_failure_message(
		"선택지가 스크롤 밖에 있다 — 50곳이 화면을 넘친다").is_greater(-1)


## 죽은 상수를 남기지 않는다
func test_죽은_상한이_없다() -> void:
	assert_bool(CodeText.lacks("res://ui/decision_vm.gd", "APPLY_SHOWN: int")) \
		.override_failure_message("APPLY_SHOWN이 아직 있다").is_true()


# ── 값이 맞나 (변이가 살아남은 자리) ──────────────────────────────

## ⚠ **"글자가 있나"로만 재면 값이 0이어도 통과한다** — 변이 넷이 살아남았다.
## **정본과 같은 값인지**를 본다


func _labels(s: Dictionary, prefix: String) -> Array:
	var out: Array = []
	for c in _hub(s).get("choices", []):
		if String(c.get("id", "")).begins_with(prefix):
			out.append({"id": String(c["id"]).trim_prefix(prefix),
				"label": String(c["label"])})
	return out


## 야구 점수가 실제로 확률에 닿는다 — 고교 우승 기록을 넣으면 달라져야 한다
func test_야구_점수가_확률에_닿는다() -> void:
	var plain: Array = _labels(_state(), "university:")
	var s: Dictionary = _state()
	s["protagonist"]["career_records"] = [
		{"league_id": "LEAGUE_HIGHSCHOOL", "ps_result": "우승", "awards": ["MVP"]},
		{"league_id": "LEAGUE_HIGHSCHOOL", "ps_result": "우승", "awards": ["MVP"]},
	]
	var strong: Array = _labels(s, "university:")
	assert_float(float(CareerPath.hs_baseball_score(
		s["protagonist"]["career_records"]))).override_failure_message(
		"픽스처의 야구 점수가 0이다 — 검사가 아무것도 안 본다").is_greater(0.0)
	var same: bool = true
	for i in plain.size():
		if plain[i]["label"] != strong[i]["label"]:
			same = false
	assert_bool(same).override_failure_message(
		"고교 우승 두 번이 화면을 하나도 안 바꿨다 — 야구 점수가 안 흐른다") \
		.is_false()


## 스카우트 가산이 **정본 값**이어야 한다 — 0으로 굳으면 강한 대학에 갈
## 이유가 사라진다
func test_스카우트_가산이_정본과_같다() -> void:
	var any_nonzero: bool = false
	for e in _labels(_state(), "university:"):
		var want: int = CareerPath.scout_bonus_of_power(
			World.team_field({}, e["id"], "power", null))
		if want != 0:
			any_nonzero = true
		assert_int(String(e["label"]).count("스카우트 %+d" % want)) \
			.override_failure_message("%s: 화면 %s · 정본 %+d"
			% [e["id"], e["label"], want]).is_greater(0)
	assert_bool(any_nonzero).override_failure_message(
		"모든 대학의 가산이 0이다 — 고를 이유가 없다").is_true()


## 요구 조건이 **정본 값**이어야 한다
func test_요구_조건이_정본과_같다() -> void:
	var any_nonzero: bool = false
	for e in _labels(_state(), "university:"):
		var req: Dictionary = CareerPath.requirement_of_power(
			World.team_field({}, e["id"], "power", null))
		if int(req["min_academic_grade"]) != 0:
			any_nonzero = true
		assert_int(String(e["label"]).count("요구 학업 %d등급 · 야구 %d"
			% [int(req["min_academic_grade"]), int(req["min_baseball_score"])])) \
			.override_failure_message("%s: 화면 %s" % [e["id"], e["label"]]) \
			.is_greater(0)
	assert_bool(any_nonzero).is_true()


## 독립리그 확률도 **정본 값** — 0으로 굳으면 고를 근거가 없다
func test_독립_확률이_정본과_같다() -> void:
	var s: Dictionary = _state()
	var ovr: float = Contract.core_ovr(s["protagonist"])
	var order: int = 0
	var any_nonzero: bool = false
	for e in _labels(s, "independent:"):
		var want: int = roundi(CareerPath.independent_chance(
			World.team_field({}, e["id"], "power", null), ovr, order))
		if want != 0:
			any_nonzero = true
		assert_int(String(e["label"]).count("입단 %d%%" % want)) \
			.override_failure_message("%s: 화면 %s · 정본 %d%%"
			% [e["id"], e["label"], want]).is_greater(0)
		order += 1
	assert_bool(any_nonzero).override_failure_message(
		"모든 독립팀 확률이 0이다").is_true()
