extends RefCounted
class_name Military

## 병역 — 입대 · 복무 · 전역. B-6c.
##
## 원본: `usecases/militaryDecision.ts` · `stores/game.ts`의
##       `enlistMilitary` · `completeMilitaryService`
##
## ⚠ **02는 입대 처리가 네 곳에 복제돼 있었고 서로 달랐다.** 오프시즌을
## 빠뜨린 두 경로에서는 복무 2년 동안 세계가 통째로 정체됐다. **여기 하나로
## 모은다** — 어느 경로로 들어와도 같은 일이 일어난다.
##
## ⚠ **전역 분기는 도달할 수 없는 자리에 있었다.** 조건이
## `currentWeek + 1 > totalWeeks`인데 자동 진행은 그보다 먼저 멈춰서,
## 입대하면 군 시즌을 새로 열고 또 열어 **영원히 군대에 있었다** —
## 실측 2029년 입대 → 2036년 복무 700주(13.5년), 26세.


## 총 복무 기간(주). **52주 시즌 두 번에 나눠 흐른다.**
##
## ⚠ 02는 100주짜리 시즌을 하나 열었다가 "1시즌 = 52주"가 깨져서
## **복무 2년 동안 세계는 1년만 흘렀다**(연도도 나이도 한 번만 올랐다)
const SERVICE_WEEKS: int = 100

## 복무 중 소속. **경기가 없다** — 일정을 짜는 쪽이 팀이 없는 걸 보고 비운다
const LEAGUE: String = "LEAGUE_MILITARY"

## 복귀 적응 주차. 체육부대는 실전 감각을 유지한다
const RECOVERY_SPORTS: int = 2
const RECOVERY_GENERAL: int = 6

## 계약이 남아 있으면 복무 기간만큼 미룬다 — 군대에서 만료되면 전역하자마자
## 무소속이다
const CONTRACT_HOLD_YEARS: int = 2

const STATUS_UNSERVED: String = "미필"
const STATUS_SERVING: String = "현역"
const STATUS_DONE: String = "군필"


## 복무 형태 이름. **여기가 정본이다** — 소식에도 화면에도 같은 말이 떠야 한다.
##
## ⚠ **모르는 값을 빈칸으로 두지 않는다.** 형태가 늘었는데 화면이 조용히
## 비면 아무도 모른다
static func unit_label(unit: String) -> String:
	if unit == "sports":
		return "체육부대"
	if unit.is_empty():
		return ""
	return "일반병"


## 아직 안 다녀왔나. **되돌릴 수 없는 전이라 여기서도 막는다** —
## 02는 화면에만 가드가 있어서 다른 호출부가 그대로 통과했고,
## **군 복무를 세 번 하는 커리어**가 실제로 나왔다
static func is_eligible(p: Dictionary) -> bool:
	return String(p.get("military_status", STATUS_UNSERVED)) == STATUS_UNSERVED


## 계약이 붙는 무대인가 — 학생에겐 미룰 계약이 없다
static func _has_contract_stage(stage: String) -> bool:
	return Finance.is_pro(stage) or stage == "independent"


# ── 입대 ──────────────────────────────────────────────────────

## 입대한다. **어느 경로로 들어와도 같은 일이 일어난다**
static func enlist(state: Dictionary, unit: String, at_day: int) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty() or not is_eligible(p):
		return false

	var stage: String = String(p.get("career_stage", ""))
	var year: int = int(state.get("season_year", 0))

	# ⚠ **유효한 계약만 미룬다.** 이미 만료된 계약을 늘리면 없던 계약이
	# 되살아난다
	if _has_contract_stage(stage) and int(p.get("contract_years", 0)) > 0:
		p["contract_years"] = int(p["contract_years"]) + CONTRACT_HOLD_YEARS

	# ⚠ **어디서 떠났는지를 남긴다.** 안 남기면 프로가 전역할 때 돌아갈
	# 곳을 잃는다
	p["military_hiatus_stage"] = stage
	p["military_hiatus_team_id"] = String(p.get("team_id", ""))
	p["military_hiatus_league_id"] = String(p.get("league_id", ""))

	p["career_stage"] = "military"
	p["military_unit"] = unit
	p["military_status"] = STATUS_SERVING
	p["military_service_weeks"] = 0
	p["military_enlist_year"] = year
	p["league_id"] = LEAGUE
	p["team_id"] = ""

	var label: String = "%s 입대" % unit_label(unit)
	_add_event(p, {
		"year": year, "type": "military_enlist",
		"from_team_id": String(p["military_hiatus_team_id"]),
		"from_league_id": String(p["military_hiatus_league_id"]),
		"detail": label,
	})
	_send(state, {
		"id": "msg-military-enlist-%d" % year,
		"category": "news", "sender": "병무청",
		"subject": label,
		"preview": "%d주 동안 그라운드를 떠난다." % SERVICE_WEEKS,
		"body": "\n".join([
			"%s했습니다." % label,
			"",
			"복무 기간은 %d주입니다." % SERVICE_WEEKS,
			"체육부대에서는 실전 감각을 유지할 수 있습니다." if unit == "sports"
				else "그동안 경기에 나설 수 없습니다.",
		]),
		"day": at_day, "read": false, "decision": null,
	})
	return true


# ── 복무 ──────────────────────────────────────────────────────

## 한 주. 복무 중이 아니면 아무 일도 안 일어난다
static func advance_week(state: Dictionary) -> int:
	var p: Dictionary = state.get("protagonist", {})
	if String(p.get("career_stage", "")) != "military":
		return 0
	p["military_service_weeks"] = int(p.get("military_service_weeks", 0)) + 1
	return int(p["military_service_weeks"])


static func is_service_done(p: Dictionary) -> bool:
	return int(p.get("military_service_weeks", 0)) >= SERVICE_WEEKS


# ── 전역 ──────────────────────────────────────────────────────

## 전역한다. 복무가 안 끝났으면 `false`.
##
## ⚠ **학교로는 안 돌아간다.** 02는 입대 전 학적을 그대로 복구해서
## **2년 복무한 21세가 고등학교로 돌아갔다.** 학생 신분에서 입대했으면
## 갈 곳은 독립리그다
static func discharge(state: Dictionary, at_day: int) -> bool:
	# ⚠ **이 한 줄이 "복무 중이고 기간을 채웠나"를 다 본다.** 복무 주차는
	# 군인일 때만 오르고(`advance_week`) 전역할 때 0으로 되돌아가므로,
	# 단계를 또 보는 줄은 절대 안 걸리는 죽은 가드가 된다
	var p: Dictionary = state.get("protagonist", {})
	if not is_service_done(p):
		return false

	var hiatus: String = String(p.get("military_hiatus_stage", ""))
	var stage: String = hiatus
	if hiatus == "highschool" or hiatus == "university" or hiatus.is_empty():
		stage = "independent"

	var unit: String = String(p.get("military_unit", ""))
	p["career_stage"] = stage
	p["military_served_unit"] = unit
	p["military_unit"] = ""
	p["military_status"] = STATUS_DONE
	p["military_service_weeks"] = 0
	p["military_recovery_weeks"] = RECOVERY_SPORTS if unit == "sports" \
		else RECOVERY_GENERAL
	p["military_hiatus_stage"] = ""

	# ⚠ **학년은 학생일 때만 뜻이 있다.** 안 지우면 독립리그 선수가 학년을
	# 달고 다니고 결산 화면 머리글이 그걸 먼저 읽는다
	p.erase("grade")

	if stage == "independent":
		p["league_id"] = "LEAGUE_INDEPENDENT"
		var dest: Array = discharge_teams()
		p["team_id"] = String(dest[0]) if not dest.is_empty() else ""
	else:
		p["league_id"] = String(p.get("military_hiatus_league_id", ""))
		p["team_id"] = String(p.get("military_hiatus_team_id", ""))
	p["team_name"] = String(World.team_field({}, String(p["team_id"]), "name",
		p["team_id"]))

	var year: int = int(state.get("season_year", 0))
	_add_event(p, {
		"year": year, "type": "military_discharge",
		"to_team_id": String(p["team_id"]),
		"to_league_id": String(p["league_id"]),
		"detail": "전역",
	})

	# ⚠ **복귀 계약을 여기서 밀어 준다.** 안 밀면 전역만 하고 무소속인 채로
	# 다음 주가 온다
	if int(p.get("contract_years", 0)) > 0:
		Pending.push_once(state, {
			"type": "salary_negotiation",
			"team_id": String(p["team_id"]),
			"league_id": String(p["league_id"]),
			# ⚠ **구단이 금액을 다시 낸다** (F-7). 옛 연봉을 그대로 주면
			# 2년 복무 동안 성장한 것도, 구단주가 바뀐 것도 반영이 안 된다
			"offered_salary": ContractDecision.offer_salary_for(state, p),
			"duration_years": maxi(int(p.get("contract_years", 1)), 1),
			"min_duration_years": 1, "max_duration_years": 2,
			"signing_bonus": 0,
			"context": "military_return",
		})
	else:
		Pending.push_once(state, {"type": "fa_market"})

	_send(state, {
		"id": "msg-military-discharge-%d" % year,
		"category": "news", "sender": "병무청",
		"subject": "전역",
		"preview": "병역 의무를 마쳤습니다.",
		"body": "\n".join([
			"병역 의무를 마치고 전역했습니다.",
			"",
			"체육부대에서 실전 감각을 유지했습니다. 복귀 적응이 빠릅니다."
				if unit == "sports"
				else "오랜 공백이 있었습니다. 감각을 되찾는 데 시간이 필요합니다.",
		]),
		"day": at_day, "read": false, "decision": null,
	})
	return true


## 전역자가 갈 수 있는 독립팀. **상무는 복무 중인 선수의 자리다** —
## 전역자가 갈 팀이 아니다
static func discharge_teams() -> Array:
	var ids: Array = []
	for t in World.teams_of("LEAGUE_INDEPENDENT"):
		var id: String = String(t["id"])
		if CareerPath.is_applicable_independent(id):
			ids.append(id)
	ids.sort()
	return ids


# ── 도우미 ────────────────────────────────────────────────────

static func _add_event(p: Dictionary, event: Dictionary) -> void:
	var events: Array = p.get("career_events", [])
	events.append(event)
	p["career_events"] = events


## 소식함에 넣는다. **같은 id는 안 넣는다** — 소식 목록이 id를 키로 잡아서
## 겹치면 화면이 죽는다
static func _send(state: Dictionary, message: Dictionary) -> bool:
	var mailbox: Array = state.get("mailbox", [])
	for m in mailbox:
		if String(m.get("id", "")) == String(message["id"]):
			return false
	mailbox.append(message)
	state["mailbox"] = mailbox
	return true
