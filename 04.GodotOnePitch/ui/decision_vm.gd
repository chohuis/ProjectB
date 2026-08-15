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
	"career_choice_hub", "career_results", "career_choice",
	"draft_observe", "draft_notification",
	"salary_negotiation", "option_clause", "fa_market", "trade",
]

## 한 번에 몇 곳까지 지원하나 — 화면이 보여주는 후보 수.
## 실제 상한은 `CareerDecision._clip`이 정본이다
const APPLY_SHOWN: int = 6


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
		"career_choice_hub":
			return _hub(state, a)
		"career_choice":
			return _choice(state, a)
		"fa_market":
			return _fa(state, a)
		"salary_negotiation":
			return _salary(state, a)
		"option_clause":
			return _option(state, a)
		"trade":
			return _trade(state, a)
	return {}


static func _of(t: String, title: String, body: String,
		choices: Array, kind: String = "one") -> Dictionary:
	return {"type": t, "title": title, "body": body, "choices": choices,
		"kind": kind, "submit_label": "제출한다"}


## 지원할 곳 고르기 — **여러 곳을 동시에 낸다.**
##
## ⚠ **지원할 수 있는 무대만 보여준다.** 대학생에게 "대학 지원"을 띄우면
## 두 번 입학이 되고, 엔진(`can_apply_university`)이 거절해서 아무 일도
## 안 일어난다 — 왜 안 되는지는 화면에 안 나온다
static func _hub(state: Dictionary, _a: Dictionary) -> Dictionary:
	var stage: String = String(state.get("protagonist", {}).get(
		"career_stage", ""))
	var choices: Array = []
	if CareerPath.can_apply_university(stage):
		for t in _teams("LEAGUE_UNIVERSITY"):
			choices.append({"id": "university:%s" % t["id"],
				"label": "%s 지원" % t["name"]})
	if CareerPath.can_apply_independent(stage):
		for t in _teams("LEAGUE_INDEPENDENT"):
			if not CareerPath.is_applicable_independent(String(t["id"])):
				continue
			choices.append({"id": "independent:%s" % t["id"],
				"label": "%s 입단 지원" % t["name"]})
	choices.append({"id": "draft", "label": "신인 드래프트 신청"})

	return _of("career_choice_hub", "진로 지원",
		"갈 곳을 고릅니다. 여러 곳에 동시에 낼 수 있습니다.", choices, "many")


static func _teams(league_id: String) -> Array:
	var out: Array = []
	for t in World.teams_of(league_id):
		out.append(t)
		if out.size() >= APPLY_SHOWN:
			break
	return out


## FA 시장.
##
## ⚠ **제안을 만드는 곳이 04에 없다.** `sign_fa_offer`는 offer를 인자로
## 받는데 그 offer를 세우는 코드가 없다 — `fa_market`을 대기줄에 올리는
## 자리만 셋이다. 그래서 지금은 기다리는 길만 준다. **없는 선택지를
## 지어내지 않는다** — 지어내면 그게 두 번째 정본이 된다
static func _fa(state: Dictionary, _a: Dictionary) -> Dictionary:
	var offers: Array = state.get("fa_offers", [])
	var choices: Array = []
	for i in offers.size():
		var o: Dictionary = offers[i]
		choices.append({"id": "offer:%d" % i,
			"label": "%s · 연봉 %s · %d년" % [
				_team(state, String(o.get("team_id", ""))),
				FinanceVm.won(int(o.get("salary", 0))),
				int(o.get("duration_years", 1))]})
	choices.append({"id": "wait", "label": "한 해 더 기다린다"})

	var body: String = "들어온 제안이 없습니다." if offers.is_empty() \
		else "제안 %d건이 들어왔습니다." % offers.size()
	return _of("fa_market", "FA 시장", body, choices)


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


## 진로 최종 선택 — **붙은 곳만 선택지가 된다.**
##
## ⚠ **떨어진 곳을 선택지로 두지 않는다.** 누르면 엔진이 거절하는 버튼이
## 되고, 사용자는 왜 안 되는지를 모른다
static func _choice(state: Dictionary, _a: Dictionary) -> Dictionary:
	var r: Dictionary = CareerDecision.of(state).get("results", {})
	var choices: Array = []
	if bool(r.get("drafted", false)):
		choices.append({"id": "draft", "label": "프로에 간다"})
	for t in r.get("university_passed", []):
		choices.append({"id": "university:%s" % t,
			"label": "%s에 진학한다" % _team(state, String(t))})
	for t in r.get("independent_passed", []):
		choices.append({"id": "independent:%s" % t,
			"label": "%s에 입단한다" % _team(state, String(t))})
	# 아무 데도 안 붙어도 길이 하나는 있어야 한다 — 그게 재수다
	choices.append({"id": "continue", "label": "지금 자리에 남는다"})
	return _of("career_choice", "진로 최종 선택",
		"어디로 갈지 정합니다. 되돌릴 수 없습니다.", choices)


## 재계약 — **얼마를 주는지 먼저 말한다**
static func _salary(state: Dictionary, a: Dictionary) -> Dictionary:
	var body: String = "\n".join([
		"%s가 재계약을 제안했습니다." % _team(state, String(a.get("team_id", ""))),
		"연봉 %s · %d년" % [FinanceVm.won(int(a.get("offered_salary", 0))),
			int(a.get("duration_years", 1))],
	])
	return _of("salary_negotiation", "재계약 협상", body, [
		{"id": "sign", "label": "계약한다"},
		{"id": "reject", "label": "거절한다"},
	])


## 옵션 조항 — 구단이 행사하면 한 해 더, 아니면 계약이 끝난다
static func _option(state: Dictionary, a: Dictionary) -> Dictionary:
	var body: String = "\n".join([
		"%s의 옵션 조항입니다." % _team(state, String(a.get("team_id", ""))),
		"행사하면 연봉 %s로 한 해 더 뜁니다." % FinanceVm.won(
			int(a.get("next_salary", 0))),
	])
	return _of("option_clause", "옵션 조항", body, [
		{"id": "exercise", "label": "행사한다"},
		{"id": "decline", "label": "행사하지 않는다"},
	])


static func _team(state: Dictionary, team_id: String) -> String:
	return String(World.team_field(state.get("world", {}), team_id,
		"name", team_id))


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
		"career_choice_hub":
			return _apply_hub(state, choice_id)
		"career_choice":
			return _apply_choice(state, choice_id)
		"fa_market":
			if choice_id.begins_with("offer:"):
				var offers: Array = state.get("fa_offers", [])
				var i: int = int(choice_id.substr(6))
				if i < 0 or i >= offers.size():
					return false
				var o: Dictionary = offers[i]
				return ContractDecision.sign_fa_offer(state, o,
					int(o.get("salary", 0)), at_day)
			return ContractDecision.wait_fa_market(state) > 0
		"salary_negotiation":
			if choice_id == "sign":
				return ContractDecision.sign_negotiated(state, a,
					_contract_of(a), at_day)
			return not ContractDecision.reject_negotiated(state, a,
				at_day).is_empty()
		"option_clause":
			return not ContractDecision.apply_option_clause(state, a,
				choice_id == "exercise").is_empty()
		"trade":
			if choice_id == "accept":
				return ContractDecision.accept_trade(state, a)
			return ContractDecision.reject_trade(state)
	return false


## ⚠ **제안한 조건을 그대로 계약으로 만든다.** 화면이 숫자를 다시 지어내면
## "보여준 것과 다른 계약"이 된다 — 02가 반복해서 겪은 자리다
static func _contract_of(a: Dictionary) -> Dictionary:
	return {
		"salary": int(a.get("offered_salary", 0)),
		"years": int(a.get("duration_years", 1)),
		"signing_bonus": int(a.get("signing_bonus", 0)),
		"team_id": String(a.get("team_id", "")),
		"league_id": String(a.get("league_id", "")),
	}


## 켜 놓은 것들을 한 번에 낸다. `submit:university:U1,draft` 꼴이다.
##
## ⚠ **아무것도 안 고르고 내면 그것도 답이다** — 아무 데도 지원 안 하고
## 지금 자리에 남는 길이다. 막으면 대기줄이 그 자리에서 안 풀린다
static func _apply_hub(state: Dictionary, choice_id: String) -> bool:
	if not choice_id.begins_with("submit:"):
		return false
	var univ: Array = []
	var indie: Array = []
	var draft: bool = false
	for one in choice_id.substr(7).split(",", false):
		if one == "draft":
			draft = true
			continue
		var parts: PackedStringArray = one.split(":", true, 1)
		if parts.size() < 2:
			continue
		if parts[0] == "university":
			univ.append(parts[1])
		elif parts[0] == "independent":
			indie.append(parts[1])
	return not CareerDecision.submit_applications(state, {
		"draft": draft, "university_choices": univ,
		"independent_choices": indie}).is_empty()


## `university:TEAM_X` 처럼 갈래와 팀을 한 id에 담는다 — 화면이
## 선택지마다 다른 모양을 갖지 않게 하려는 것이다
static func _apply_choice(state: Dictionary, choice_id: String) -> bool:
	if choice_id == "draft":
		return not CareerDecision.choose_draft(state).is_empty()
	if choice_id == "continue":
		return CareerDecision.continue_current_stage(state)
	var parts: PackedStringArray = choice_id.split(":", true, 1)
	if parts.size() < 2:
		return false
	return CareerDecision.choose_school_or_independent(state,
		parts[0], parts[1])
