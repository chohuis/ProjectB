extends RefCounted
class_name CareerRunner

## 진로가 실제로 굴러가게 하는 배선. B-6f.
##
## 원본: `advanceWeek.ts`의 진로허브 트리거(W44·W42·W39)와 W47 결과 계산
##
## ⚠ **여기가 없으면 `CareerDecision`은 아무도 안 부르는 코드다.**
## 02가 겪은 결함 대부분이 "코드는 있는데 한 번도 안 돈 곳"이었다 —
## 실제로 주인공은 지명될 수 없었고 프로 콘텐츠 전부가 도달 불가였다.
##
## ⚠ **묻는 것까지가 여기 일이다.** 답을 적용하는 것은 `CareerDecision`이고
## 그건 사용자가 눌렀을 때만 돈다.


## 진로 지원을 여는 주차. **무대마다 시즌이 끝나는 때가 다르다** —
## 고교는 결승(W44) 뒤, 대학은 W42, 독립은 W39다
const HUB_WEEK: Dictionary = {
	"highschool": 44,
	"university": 42,
	"independent": 39,
}

## 결과가 나오는 주차. **드래프트가 끝난 뒤 전 무대가 같이 발표한다**
const RESULT_WEEK: int = 47

## 고교는 졸업반만 진로를 정한다 — 1·2학년은 그냥 진급한다
const HS_FINAL_GRADE: int = 3

## 진로 대기 종류 — 하나라도 떠 있으면 새로 안 연다
const CAREER_PENDINGS: Array[String] = ["career_choice_hub", "career_results",
	"career_choice", "draft_notification"]


## 한 주. 무슨 일이 일어났는지를 돌려준다 — `{opened, results, military}`
static func run(state: Dictionary, at_day: int) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty() or bool(p.get("retired", false)):
		return {}

	# ⚠ **복무가 제일 먼저다.** 군인은 진로를 정할 자리에 없다
	if String(p.get("career_stage", "")) == "military":
		return {"military": _serve(state, at_day)}

	# 은퇴 — 부상 강제와 노쇠 압박. **묻기만 한다**
	#
	# ⚠ **02엔 주인공 은퇴 경로가 아예 없었다.** 목표 커리어가 15~20시즌인
	# 게임인데 끝나지 않았다
	var rng := RandomNumberGenerator.new()
	# ⚠ **연도와 날짜를 같이 섞는다.** 씨앗만 쓰면 몇 해가 지나 같은 날에
	# 다시 수술을 받아도 **똑같은 답**이 나온다
	rng.seed = Rng.mix(["retire", int(state.get("seed", 0)),
		int(state.get("season_year", 0)), at_day])
	var asked: String = Retirement.check(state, at_day, rng)

	var week: int = Calendar.week_of(at_day)
	var out: Dictionary = {"opened": false, "results": {}, "retirement": asked,
		"military_ask": _ask_military(state, at_day)}
	if _should_open(state, p, week):
		Pending.push_once(state, {"type": "career_choice_hub"})
		out["opened"] = true
	elif week >= RESULT_WEEK:
		out["results"] = _decide(state)
	return out


## 병역을 물을 때면 대기줄에 올린다 — 02 `advanceWeek.ts:1952-2135`.
##
## 🔴 **04는 지금까지 안 물었다.** `career_decision`이 갈 곳이 없을 때 조용히
## 현역으로 보냈다 — 02는 **입대할지 묻고 상무에 지원할지도 묻는다**.
##
## ⚠ **여기서 `mark_*_asked`를 부르지 않는다.** 답을 받는 쪽이 부른다 —
## 여기서 적으면 대기줄에 올리자마자 "물었다"가 되어 **화면이 뜨기도 전에
## 그해가 닫힌다.**
##
## ⚠ **둘을 같은 주에 안 묻는다.** 체육부대는 2월 첫 주, 입대 확인은 시즌
## 마지막 주라 겹치지 않지만, 겹치면 상무를 먼저 본다 — 지원해 놓고 현역
## 입대를 묻는 건 방금 한 선택을 없던 일로 만든다
static func _ask_military(state: Dictionary, at_day: int) -> String:
	var picked: String = _sports_result(state, at_day)
	if not picked.is_empty():
		return picked
	if Military.should_ask_sports_unit(state):
		# ⚠ **소식도 같이 넣는다** (사용자 지적). 02는 후보 명단을 소식함에
		# 넣고 나서 모달을 띄운다(`advanceWeek.ts:2012-2025`) — 물음만 띄우면
		# **나중에 "그때 뭐였지"를 되짚을 자리가 없다.** 04 소식은 지나간
		# 결정을 다시 읽는 유일한 자리다
		Military.send_sports_candidates(state, _sports_rivals(state,
			String(state.get("protagonist", {}).get("id", ""))), at_day)
		Pending.push_once(state, {"type": "sports_unit_apply"})
		return "sports_unit_apply"
	if Military.should_ask_enlist(state):
		Pending.push_once(state, {"type": "military_enlist_ask"})
		return "military_enlist_ask"
	return ""


## 상무 선발 결과 — 시즌 마지막 주. 02 `advanceWeek.ts:2034-2090`.
##
## ⚠ **떨어지면 곧바로 입대 확인을 묻는다.** 안 이으면 지원했다가 떨어진
## 사람은 그해에 아무 일도 안 일어난다 — 02도 `reason: "rejected"`로 잇는다.
##
## ⚠ **`sports_unit_applied`를 지운다.** 안 지우면 다음 해에 `should_ask_enlist`가
## "지원 중"으로 보고 영영 입대를 안 묻는다
static func _sports_result(state: Dictionary, at_day: int) -> String:
	var p: Dictionary = state.get("protagonist", {})
	if not bool(p.get("sports_unit_applied", false)):
		return ""
	if at_day <= Calendar.DAYS_PER_SEASON - Calendar.DAYS_PER_WEEK:
		return ""

	var me_id: String = String(p.get("id", ""))
	# 🔴 **여기서 따로 뽑지 않는다.** 예전엔 주인공 경로가 자기 풀을 만들어
	# 자기 정원으로 뽑았다 — 그러면 NPC 경로와 **정원이 갈라진다**(02의 결함).
	# `Military.resolve_sports_unit`이 한 해에 한 번만 뽑고, 먼저 부른 쪽이
	# 뽑아 두면 여기서는 그 명단을 읽기만 한다
	var picked: Array = Military.resolve_sports_unit(state)

	p.erase("sports_unit_applied")
	if picked.has(me_id):
		Military.enlist(state, "sports", at_day)
		return "sports_unit_selected"

	Military.mark_enlist_asked(state)
	Pending.push_once(state, {"type": "military_enlist_ask",
		"reason": "rejected"})
	return "sports_unit_rejected"


## 같이 겨루는 사람들 — 미필이고 학생이 아닌 프로 선수.
##
## ⚠ **주인공만 넣고 뽑으면 늘 붙는다.** 겨룰 상대가 없으면 정원 13이
## 아무 뜻이 없다
static func _sports_rivals(state: Dictionary, me_id: String) -> Array:
	var out: Array = []
	var world: Dictionary = state.get("world", {})
	for tid in world.get("rosters", {}):
		for q in world["rosters"][tid]:
			if String(q.get("id", "")) == me_id:
				continue
			if String(q.get("military_status", Military.STATUS_UNSERVED)) \
					!= Military.STATUS_UNSERVED:
				continue
			var stage: String = String(q.get("career_stage", ""))
			if stage == "highschool" or stage == "university" \
					or stage == "military":
				continue
			out.append({"id": String(q.get("id", "")),
				"ovr": Contract.core_ovr(q), "team_id": String(tid)})
	return out


## 복무 한 주. 기간을 채웠으면 전역까지 여기서 한다.
##
## ⚠ **02는 전역 분기가 도달할 수 없는 자리에 있었다** — 조건이
## `currentWeek + 1 > totalWeeks`인데 자동 진행은 그보다 먼저 멈춰서
## **입대하면 영원히 군대에 있었다**(실측 복무 700주, 13.5년)
static func _serve(state: Dictionary, at_day: int) -> Dictionary:
	var weeks: int = Military.advance_week(state)
	var discharged: bool = false
	if Military.is_service_done(state.get("protagonist", {})):
		discharged = Military.discharge(state, at_day)
	return {"weeks": weeks, "discharged": discharged}


## 지금 진로 지원을 열 때인가.
##
## ⚠ **이미 물어본 것을 또 묻지 않는다.** 02는 이 확인이 여러 조건으로
## 흩어져 있었고, 빠뜨린 자리에서 같은 주가 무한 반복됐다
static func _should_open(state: Dictionary, p: Dictionary, week: int) -> bool:
	var stage: String = String(p.get("career_stage", ""))
	if not HUB_WEEK.has(stage):
		return false
	if week != int(HUB_WEEK[stage]):
		return false
	# 고교는 졸업반만이다
	if stage == "highschool" and int(p.get("grade", 0)) != HS_FINAL_GRADE:
		return false

	var c: Dictionary = CareerDecision.of(state)
	if bool(c.get("submitted", false)):
		return false
	if not c.get("results", {}).is_empty():
		return false
	for t in CAREER_PENDINGS:
		if Pending.has(state, t):
			return false
	return true


## 결과를 정한다.
##
## "원서를 냈나 · 이미 정해졌나"는 `CareerDecision.build_results`가 본다 —
## 여기서 또 물으면 정본이 둘이 되고, 한쪽만 고치면 갈린다. 이미 정해진
## 뒤에 다시 불러도 그때 정한 결과를 그대로 돌려준다
static func _decide(state: Dictionary) -> Dictionary:
	# ⚠ **씨앗을 연도와 섞는다.** 하나로 두면 어느 해에 지원하든 같은
	# 결과가 나온다
	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["career", int(state.get("season_year", 0)),
		int(state.get("seed", 0))])
	return CareerDecision.build_results(state, rng)
