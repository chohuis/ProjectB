extends RefCounted
class_name ContractDecision

## 계약 결정 — 협상 · 옵션 · FA · 트레이드. B-6e.
##
## 원본: `usecases/contractDecision.ts`
##
## ⚠ **02는 이 로직이 `ContractNegotiationModal` 안에 있었다.** 프로 커리어
## **매년** 도는 경로인데 한 번도 헤드리스로 안 돌아봤고, 바로 옆 코드에서
## "계약 기간 중이면 다음 시즌 경기가 0건"이 나왔다.
##
## ⚠ **재계약은 시즌 도중에 발효되지 않는다.** 소속이 중간에 바뀌면 그해
## 성적이 두 팀에 걸린다 — 넣어 뒀다가 새 해가 열릴 때 적용한다
## (`SeasonRunner.roll_over`가 `apply_pending_next_contract`를 부른다).


## 다음 시즌에 발효될 계약이 사는 자리
const NEXT_KEY: String = "pending_next_contract"

## 그 자리에서 바로 발효되는 계약 — 입단과 전역 복귀는 무대가 지금 열린다
const IMMEDIATE_CONTEXTS: Array[String] = ["military_return", "initial"]


static func is_immediate(context: String) -> bool:
	return IMMEDIATE_CONTEXTS.has(context)


# ── 연봉 협상 ─────────────────────────────────────────────────

## 계약에 서명한다.
##
## `contract`: `{team_id, league_id, salary, duration_years, signing_bonus}`
static func sign_negotiated(state: Dictionary, action: Dictionary,
		contract: Dictionary, at_day: int) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty():
		return false

	if is_immediate(String(action.get("context", ""))):
		_apply_contract(p, contract)
	else:
		state[NEXT_KEY] = contract.duplicate(true)
		_send(state, {
			"id": "msg-contract-signed-%d" % int(state.get("season_year", 0)),
			"category": "news", "sender": "에이전트",
			"subject": "계약 서명 완료",
			"preview": "새 시즌부터 적용됩니다.",
			"body": "\n".join([
				"%s와의 계약이 완료되었습니다."
					% World.team_field({}, String(contract.get("team_id", "")),
						"name", contract.get("team_id", "")),
				"연봉: %d만원 / %d년" % [int(contract.get("salary", 0)),
					int(contract.get("duration_years", 0))],
				"계약금: %d만원" % int(contract.get("signing_bonus", 0)),
				"",
				"새 시즌 시작 시 정식 적용됩니다.",
			]),
			"day": at_day, "read": false, "decision": null,
		})
	Pending.resolve(state, "salary_negotiation")
	return true


## 넣어 둔 계약을 발효시킨다. **새 해가 열릴 때 한 번**
static func apply_pending_next_contract(state: Dictionary) -> bool:
	var next = state.get(NEXT_KEY, null)
	if not (next is Dictionary) or next.is_empty():
		return false
	_apply_contract(state.get("protagonist", {}), next)
	state[NEXT_KEY] = {}
	return true


static func _apply_contract(p: Dictionary, contract: Dictionary) -> void:
	if p.is_empty():
		return
	var team_id: String = String(contract.get("team_id", ""))
	p["team_id"] = team_id
	p["league_id"] = String(contract.get("league_id", ""))
	p["team_name"] = String(World.team_field({}, team_id, "name", team_id))
	p["salary"] = int(contract.get("salary", 0))
	p["contract_years"] = int(contract.get("duration_years", 0))
	p["signing_bonus"] = int(contract.get("signing_bonus", 0))
	# 계약금은 그 자리에서 자산이 된다 — 안 더하면 화면에만 있는 숫자다
	p["money"] = int(p.get("money", 0)) + int(contract.get("signing_bonus", 0))


## 계약을 거절한다. 다음에 무슨 일이 일어나는지를 돌려준다.
##
## ⚠ **FA 자격이 없으면 갈 곳이 없다.** 02는 예전에 대기만 풀고 끝나서
## 소속도 계약도 없는 채로 다음 주가 왔다 — 지금은 그 상태를 알리고 남는다
static func reject_negotiated(state: Dictionary, action: Dictionary,
		at_day: int) -> String:
	Pending.resolve(state, "salary_negotiation")
	var p: Dictionary = state.get("protagonist", {})

	if Contract.is_fa_eligible(p):
		Pending.push_once(state, {"type": "fa_market"})
		return "fa_market"

	_send(state, {
		"id": "msg-contract-rejected-%d" % int(state.get("season_year", 0)),
		"category": "news", "sender": "에이전트",
		"subject": "계약 거절 — 미계약 상태",
		"preview": "FA 자격이 없어 다른 팀과 협상할 수 없습니다.",
		"body": "\n".join([
			"%s의 제안을 거절했습니다."
				% World.team_field({}, String(action.get("team_id", "")),
					"name", action.get("team_id", "")),
			"",
			"아직 FA 자격이 없어 다른 구단과 협상할 수 없습니다.",
			"구단이 다시 제안해 올 때까지 미계약 상태로 남습니다.",
		]),
		"day": at_day, "read": false, "decision": null,
	})
	return "unsigned"


# ── 옵션 조항 ─────────────────────────────────────────────────

## 옵션 결과를 적용하고 **다음 단계를 잇는다.**
##
## ⚠ 02는 구단 옵션·선수 옵션 두 갈래에 **같은 열다섯 줄을 두 번** 적어
## 뒀다. 한쪽만 고치면 "구단 옵션으로 들어온 해만 FA가 안 열린다"가 된다.
##
## ⚠ **다음을 안 밀어 주면 계약이 만료된 채 아무 일도 안 일어난다**
static func apply_option_clause(state: Dictionary, action: Dictionary,
		exercised: bool) -> String:
	var p: Dictionary = state.get("protagonist", {})
	if exercised:
		p["salary"] = int(action.get("next_salary", p.get("salary", 0)))
		p["contract_years"] = 1
	else:
		p["contract_years"] = 0
	Pending.resolve(state, "option_clause")

	# ⚠ **"미행사"를 또 묻지 않는다.** 행사됐으면 위에서 계약 연수가 1이
	# 되므로 `is_fa_eligible`이 이미 거짓이다 — 조건을 하나 더 두면 절대
	# 안 걸리는 죽은 가드가 된다
	if Contract.is_fa_eligible(p):
		Pending.push_once(state, {"type": "fa_market"})
		return "fa_market"

	Pending.push_once(state, {
		"type": "salary_negotiation",
		"team_id": String(p.get("team_id", "")),
		"league_id": String(p.get("league_id", "")),
		"offered_salary": int(action.get("next_salary", 0)),
		"duration_years": 1, "min_duration_years": 1, "max_duration_years": 3,
		"signing_bonus": 0,
		"context": "renewal",
	})
	return "salary_negotiation"


# ── FA 시장 ───────────────────────────────────────────────────

## FA 계약 체결 — 재계약과 같이 넣어 두고 새 해가 열릴 때 발효된다
static func sign_fa_offer(state: Dictionary, offer: Dictionary, salary: int,
		at_day: int) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty():
		return false
	var team_id: String = String(offer.get("team_id", ""))
	var contract: Dictionary = {
		"team_id": team_id,
		"league_id": String(offer.get("league_id", "")),
		"salary": salary,
		"duration_years": int(offer.get("duration_years", 1)),
		"signing_bonus": int(offer.get("signing_bonus", 0)),
	}
	state[NEXT_KEY] = contract

	var year: int = int(state.get("season_year", 0))
	var events: Array = p.get("career_events", [])
	events.append({"year": year, "type": "fa_signed",
		"to_team_id": team_id, "to_league_id": contract["league_id"],
		"detail": "FA 계약"})
	p["career_events"] = events

	_send(state, {
		# ⚠ **id에 실제 시각을 쓰지 않는다.** 02는 `Date.now()`를 써서
		# 같은 세이브를 다시 열면 id가 달라져 중복 소식이 생겼다
		"id": "msg-fa-signed-%d" % year,
		"category": "news", "sender": "에이전트",
		"subject": "FA 계약 서명 완료",
		"preview": "새 시즌부터 적용됩니다.",
		"body": "\n".join([
			"%s와 FA 계약이 완료되었습니다."
				% World.team_field({}, team_id, "name", team_id),
			"연봉: %d만원 / %d년" % [salary, int(contract["duration_years"])],
			"계약금: %d만원" % int(contract["signing_bonus"]),
		]),
		"day": at_day, "read": false, "decision": null,
	})
	p["fa_unsigned_weeks"] = 0
	Pending.resolve(state, "fa_market")
	return true


## 계약하지 않고 기다린다 — **미계약 주차가 쌓이면 제시 조건이 내려간다**
static func wait_fa_market(state: Dictionary) -> int:
	var p: Dictionary = state.get("protagonist", {})
	p["fa_unsigned_weeks"] = int(p.get("fa_unsigned_weeks", 0)) + 1
	Pending.resolve(state, "fa_market")
	return int(p["fa_unsigned_weeks"])


# ── 트레이드 통보 ─────────────────────────────────────────────

## 트레이드를 받아들인다 — **팀이 실제로 바뀐다.**
##
## ⚠ 02는 이 로직이 `TradeModal.svelte` 안에 있었고, 자동 진행은 트레이드를
## "결과가 상태에 남지 않는 알림성"으로 분류해 **그냥 해소했다** —
## 통보만 사라지고 팀은 그대로였다
static func accept_trade(state: Dictionary, action: Dictionary) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty():
		return false
	var from_team: String = String(p.get("team_id", ""))
	var from_league: String = String(p.get("league_id", ""))
	var to_team: String = String(action.get("to_team_id", ""))
	var to_league: String = String(action.get("to_league_id", from_league))

	p["team_id"] = to_team
	p["league_id"] = to_league
	p["team_name"] = String(World.team_field({}, to_team, "name", to_team))

	var events: Array = p.get("career_events", [])
	events.append({
		"year": int(state.get("season_year", 0)), "type": "trade",
		"from_team_id": from_team, "from_league_id": from_league,
		"to_team_id": to_team, "to_league_id": to_league,
		"detail": String(action.get("reason", "")),
	})
	p["career_events"] = events
	Pending.resolve(state, "trade")
	return true


## 트레이드를 거부한다 — **노트레이드 조항이 있을 때만 된다**
static func reject_trade(state: Dictionary) -> bool:
	if not bool(state.get("protagonist", {}).get("no_trade", false)):
		return false
	Pending.resolve(state, "trade")
	return true


# ── 도우미 ────────────────────────────────────────────────────

## 소식함에 넣는다. **같은 id는 안 넣는다**
static func _send(state: Dictionary, message: Dictionary) -> bool:
	var mailbox: Array = state.get("mailbox", [])
	for m in mailbox:
		if String(m.get("id", "")) == String(message["id"]):
			return false
	mailbox.append(message)
	state["mailbox"] = mailbox
	return true
