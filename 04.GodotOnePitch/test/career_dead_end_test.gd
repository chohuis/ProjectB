extends GdUnitTestSuite

## 갈 곳이 없을 때의 진로 선택 — P-43.
##
## 🔴 **04가 02에 없는 갈래를 갖고 있었다.** `DecisionVm._choice`가
## `continue`("지금 자리에 남는다")를 **무대와 무관하게 항상** 붙였다.
##
## 그런데 엔진은 이미 무대를 가른다 — `CareerDecision.continue_current_stage`가
## 대학·독립이 아니면 `false`를 돌려주고 대기줄도 안 푼다. **그래서 고교
## 졸업반이 그걸 고르면 아무 일도 안 일어나고 같은 물음이 다음 해에 또
## 떴다.** 계측에서 **12해 내내 고교 3학년**이었다(형태 ② — 화면이 엔진이
## 받을 수 없는 것을 낸다).
##
## 02가 무엇을 주는지는 `CareerResultModal.svelte:75-113`이 정본이다:
##   · `canContinue` — **대학생만** (다음 학년 진급)
##   · `canContinueIndie` — **독립리그만**
##   · 합격·지명이 있으면 그것들
##   · **전원 탈락 + 미필 → "전원 탈락: 현역 입대"**
##
## ⚠ **04의 "조용히 입대시키지 않는다"(사용자 확정)와 안 부딪힌다** —
## 02도 조용히 보내지 않는다. **사용자가 그 선택지를 눌러서** 간다.

const HS: String = "TEAM_HS_AEWOL"
const UNIV: String = "TEAM_UNIV_BAEKJE"
const DAY: int = 340


func _hs_final() -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": HS})
	var p: Dictionary = s["protagonist"]
	p["career_stage"] = "highschool"
	p["grade"] = CareerRunner.HS_FINAL_GRADE
	p["age"] = 18
	# 전원 탈락 — 결과는 났는데 붙은 데가 없다
	var c: Dictionary = CareerDecision.of(s)
	c["submitted"] = false
	c["results"] = {"drafted": false, "university_passed": [],
		"independent_passed": []}
	Pending.push_once(s, {"type": "career_choice"})
	return s


func _ids(s: Dictionary) -> Array:
	var out: Array = []
	for ch in DecisionVm.build(s).get("choices", []):
		out.append(String(ch.get("id", "")))
	return out


# ── 무대가 갈래를 정한다 (02 규칙) ───────────────────────────────

## 🔴 **고교 졸업반에게 "남는다"를 주지 않는다.** 엔진이 못 받는다
func test_고교_졸업반에는_남는다가_없다() -> void:
	var ids: Array = _ids(_hs_final())
	assert_bool(ids.has("continue")).override_failure_message(
		"고교 졸업반에 continue가 떴다 — 엔진은 그걸 안 받아서 같은 물음이" +
		" 해마다 다시 뜬다 (실측 12해 내내 고교 3학년)").is_false()


## 🔴 **대신 병역이 남는다** — 02 "전원 탈락: 현역 입대"
func test_전원_탈락이면_병역이_남는다() -> void:
	var ids: Array = _ids(_hs_final())
	assert_bool(ids.has("military")).override_failure_message(
		"갈 곳도 없고 선택지도 없다 — 화면이 빈 물음을 띄운다: %s" % str(ids)) \
		.is_true()


## ⚠ **선택지가 하나도 없는 상태를 만들지 않는다** — 빈 물음은 얼어붙는다
func test_선택지가_비지_않는다() -> void:
	assert_int(_ids(_hs_final()).size()).is_greater(0)


## 붙은 데가 있으면 병역은 안 뜬다 — 02도 전원 탈락일 때만 준다
func test_붙은_데가_있으면_병역은_안_뜬다() -> void:
	var s: Dictionary = _hs_final()
	CareerDecision.of(s)["results"] = {"drafted": false,
		"university_passed": [UNIV], "independent_passed": []}
	var ids: Array = _ids(s)
	assert_bool(ids.has("university:%s" % UNIV)).is_true()
	assert_bool(ids.has("military")).override_failure_message(
		"붙은 데가 있는데 입대를 권한다").is_false()


## 지명을 받아도 마찬가지다
func test_지명을_받으면_병역은_안_뜬다() -> void:
	var s: Dictionary = _hs_final()
	CareerDecision.of(s)["results"] = {"drafted": true,
		"draft_team_id": "TEAM_KBL_BUSAN_WAVES_1", "draft_round": 1,
		"draft_pick": 3, "university_passed": [], "independent_passed": []}
	var ids: Array = _ids(s)
	assert_bool(ids.has("draft")).is_true()
	assert_bool(ids.has("military")).is_false()


## ⚠ **대학생에게는 "진급"이 남는다** — 02 `canContinue`
func test_대학생에게는_진급이_남는다() -> void:
	var s: Dictionary = _hs_final()
	var p: Dictionary = s["protagonist"]
	p["career_stage"] = "university"
	p["grade"] = 2
	p["university_week"] = 1
	var ids: Array = _ids(s)
	assert_bool(ids.has("continue")).override_failure_message(
		"대학생에게 진급이 없다").is_true()
	assert_bool(ids.has("military")).override_failure_message(
		"대학생에게 입대를 권한다 — 02는 진급을 준다").is_false()


## ⚠ **독립리그에는 "계속"이 남는다** — 02 `canContinueIndie`
func test_독립리그에는_계속이_남는다() -> void:
	var s: Dictionary = _hs_final()
	var p: Dictionary = s["protagonist"]
	p["career_stage"] = "independent"
	p.erase("grade")
	var ids: Array = _ids(s)
	assert_bool(ids.has("continue")).is_true()
	assert_bool(ids.has("military")).is_false()


## 🔴 **군필에게 입대를 또 권하지 않는다.** 02가 그 자리에 적어 뒀다 —
## "60회 조사에서 한 커리어가 군 복무를 **세 번** 했다"
func test_군필에게는_입대를_안_권한다() -> void:
	var s: Dictionary = _hs_final()
	s["protagonist"]["military_status"] = Military.STATUS_DONE
	assert_bool(_ids(s).has("military")).override_failure_message(
		"군필에게 입대를 권한다 — 02가 세 번 복무로 데인 자리다").is_false()
	# 그래도 갈 곳은 있어야 한다
	assert_int(_ids(s).size()).is_greater(0)


# ── 고르면 실제로 도나 (형태 ① — 내기만 하면 소용없다) ───────────

## 🔴 **입대를 고르면 실제로 입대한다.** 대기줄도 풀린다
func test_입대를_고르면_입대한다() -> void:
	var s: Dictionary = _hs_final()
	assert_bool(DecisionVm.apply(s, "military", DAY)).is_true()

	var p: Dictionary = s["protagonist"]
	assert_str(String(p.get("military_status", ""))).override_failure_message(
		"입대를 골랐는데 병역 상태가 %s다" % p.get("military_status", "?")) \
		.is_not_equal(Military.STATUS_UNSERVED)
	assert_bool(Pending.has(s, "career_choice")).override_failure_message(
		"대기줄이 안 풀렸다 — 같은 물음이 다음 해에 또 뜬다").is_false()


## ⚠ **고른 것을 적는다** — 화면·기록이 "무엇을 골랐나"를 읽는다
func test_입대를_고른_것이_남는다() -> void:
	var s: Dictionary = _hs_final()
	DecisionVm.apply(s, "military", DAY)
	assert_str(String(CareerDecision.of(s).get("final_choice", ""))) \
		.is_not_equal("")


## ⚠ **두 번 입대하지 않는다** — 이미 다녀왔으면 안 받는다
func test_두_번_입대하지_않는다() -> void:
	var s: Dictionary = _hs_final()
	s["protagonist"]["military_status"] = Military.STATUS_DONE
	assert_bool(DecisionVm.apply(s, "military", DAY)).override_failure_message(
		"군필이 또 입대했다").is_false()
