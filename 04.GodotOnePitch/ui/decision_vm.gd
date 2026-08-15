extends RefCounted
class_name DecisionVm

## 결정 화면 — 대기줄에 쌓인 결정을 사람이 답하는 자리.
##
## ⚠ **대기줄에 열 종류가 쌓이는데 받는 화면이 은퇴 하나뿐이었다.**
## 나머지는 밀어넣는 코드만 있고 받는 자리가 없어서, `AutoAdvance`가
## 그 자리에서 멈춘 채 안 풀린다 — **프로 커리어가 실제로 막힌다.**
##
## ⚠ **화면을 종류마다 만들지 않는다.** 결정은 "무엇을 묻고 · 고를 것이
## 무엇인가" 하나로 같다. 종류마다 화면을 만들면 열 개를 만들어야 하고,
## 새 결정이 생길 때마다 또 하나가 필요해진다.
##
## ⚠ **은퇴는 여기 안 넣는다.** 은퇴는 화면이 결산으로 바뀌는 특별한
## 흐름이라 자기 화면이 있다(`RetirementVm`).


## 여기서 받는 결정. **`AutoAdvance.STOPPING`의 부분집합이다** —
## 아직 안 만든 것은 목록에 없고, 그건 `pending_kinds` 검사가 지킨다
const HANDLED: Array[String] = [
	"career_results", "draft_observe", "draft_notification", "trade",
]


static func blocking(state: Dictionary) -> Dictionary:
	for a in Pending.all(state):
		if HANDLED.has(String(a.get("type", ""))):
			return a
	return {}


static func is_asking(state: Dictionary) -> bool:
	return not blocking(state).is_empty()


## 화면이 받는 사전. 물어볼 게 없으면 `{}`
static func build(state: Dictionary) -> Dictionary:
	var a: Dictionary = blocking(state)
	if a.is_empty():
		return {}
	var t: String = String(a["type"])
	match t:
		"career_results":
			return _results(state, a)
		"draft_observe":
			return _observe(state, a)
		"draft_notification":
			return _draft(state, a)
		"trade":
			return _trade(state, a)
	return {}


static func _of(t: String, title: String, body: String,
		choices: Array) -> Dictionary:
	return {"type": t, "title": title, "body": body, "choices": choices}


static func _results(state: Dictionary, _a: Dictionary) -> Dictionary:
	var c: Dictionary = CareerDecision.of(state)
	var r: Dictionary = c.get("results", {})
	var lines: Array = []
	var passed: Array = r.get("university_passed", [])
	lines.append("대학 합격 %d곳" % passed.size() if not passed.is_empty() \
		else "대학은 모두 불합격했습니다.")
	var indie: Array = r.get("independent_passed", [])
	if not indie.is_empty():
		lines.append("독립리그 합격 %d곳" % indie.size())
	if bool(r.get("draft_eligible", false)):
		lines.append("드래프트 신청이 받아들여졌습니다.")
	return _of("career_results", "진로 결과", "\n".join(lines),
		[{"id": "ok", "label": "확인"}])


static func _observe(_state: Dictionary, _a: Dictionary) -> Dictionary:
	return _of("draft_observe", "드래프트",
		"오늘 신인 드래프트가 열립니다.", [{"id": "ok", "label": "지켜본다"}])


## ⚠ **거부할 수 있다.** 02는 지명 통보가 알림이라 거부가 없었고,
## 그래서 지명을 받고도 계약 없이 고교에 남는 상태가 생겼다
static func _draft(state: Dictionary, a: Dictionary) -> Dictionary:
	var team: String = String(World.team_field(state.get("world", {}),
		String(a.get("team_id", "")), "name", String(a.get("team_id", ""))))
	var body: String = "\n".join([
		"%s가 %d라운드 %d순위로 지명했습니다." % [team,
			int(a.get("round", 0)), int(a.get("pick", 0))],
		"계약금 %s · 연봉 %s" % [
			FinanceVm.won(int(a.get("signing_bonus", 0))),
			FinanceVm.won(int(a.get("salary", 0)))],
	])
	return _of("draft_notification", "지명 통보", body, [
		{"id": "accept", "label": "계약한다"},
		{"id": "reject", "label": "거부한다"},
	])


## ⚠ **거부는 노트레이드 조항이 있을 때만이다** — 없으면 선택지를
## 안 만든다. 누를 수 없는 버튼을 띄우면 "왜 안 눌리지"가 된다
static func _trade(state: Dictionary, a: Dictionary) -> Dictionary:
	var to_team: String = String(World.team_field(state.get("world", {}),
		String(a.get("to_team_id", "")), "name", String(a.get("to_team_id", ""))))
	var body: String = "%s로 트레이드됩니다.\n%s" % [to_team,
		String(a.get("reason", ""))]
	var choices: Array = [{"id": "accept", "label": "받아들인다"}]
	if bool(state.get("protagonist", {}).get("no_trade", false)):
		choices.append({"id": "reject", "label": "거부한다 (노트레이드)"})
	return _of("trade", "트레이드 통보", body, choices)


# ── 답한다 ────────────────────────────────────────────────────

## 고른 것을 엔진에 넘긴다. **여기가 유일한 배선표다** —
## 화면이 종류별로 엔진을 직접 부르면 그게 두 번째 정본이 된다
static func apply(state: Dictionary, choice_id: String, at_day: int) -> bool:
	var a: Dictionary = blocking(state)
	if a.is_empty():
		return false
	match String(a["type"]):
		"career_results":
			return CareerDecision.confirm_results(state)
		"draft_observe":
			return Pending.resolve(state, "draft_observe")
		"draft_notification":
			if choice_id == "accept":
				return CareerDecision.accept_draft_offer(state, a)
			return not CareerDecision.reject_draft_offer(state, a,
				at_day).is_empty()
		"trade":
			if choice_id == "accept":
				return ContractDecision.accept_trade(state, a)
			return ContractDecision.reject_trade(state)
	return false
