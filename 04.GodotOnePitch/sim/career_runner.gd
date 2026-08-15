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

	var week: int = Calendar.week_of(at_day)
	var out: Dictionary = {"opened": false, "results": {}}
	if _should_open(state, p, week):
		Pending.push_once(state, {"type": "career_choice_hub"})
		out["opened"] = true
	elif week >= RESULT_WEEK:
		out["results"] = _decide(state)
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
