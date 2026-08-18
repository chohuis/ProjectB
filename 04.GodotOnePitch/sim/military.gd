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
## 복무 주차 → 계급. **02 `MilitaryStatusPanel.svelte:12-18` 값 그대로다.**
##
## ⚠ **여기 두는 이유는 정본을 하나로 두려는 것이다.** 화면에 두면 나중에
## 소식·인물 화면이 각자 문턱을 적게 되고 한쪽이 조용히 갈린다.
##
## ⚠ **`SERVICE_WEEKS`(100)보다 문턱이 낮다.** 02는 복무가 72주였는데 04는
## 100주다 — **문턱을 04에 맞춰 늘리지 않았다.** 늘리면 그건 02 값이 아니라
## 내가 정한 값이 된다. 병장으로 39주를 보내는 게 지금 모습이다
const RANK_BANDS: Array[Array] = [[8, "이병"], [34, "일병"], [60, "상병"]]
const RANK_TOP: String = "병장"


static func rank_of(weeks: int) -> String:
	for b in RANK_BANDS:
		if weeks <= int(b[0]):
			return String(b[1])
	return RANK_TOP


# ── 언제 묻나 ─────────────────────────────────────────────────
#
# 02 `advanceWeek.ts:1952-2135`. **04는 지금까지 안 물었다** — 갈 곳이 없을 때
# `career_decision`이 조용히 현역으로 보냈다. 02는 둘을 묻는다.
#
# ⚠ **02의 주차를 그대로 안 옮긴다.** 02는 `weekInYear` 50·52로 재는데 04엔
# 진짜 달력이 있다(3월 1일 시작 · 364일). **뜻으로 옮긴다:**
#   W50(시즌 종료 3주 전) → **2월 첫 주**
#   W52(시즌 마지막 주)   → **시즌 마지막 주** (`DAYS_PER_SEASON`에서 파생)
# 주차 숫자를 여기 적으면 시즌 길이가 바뀔 때 조용히 어긋난다.
#
# ⚠🔴 **가드 둘이 없으면 게임이 얼어붙는다.** 물음은 주를 안 넘기고 대기줄만
# 밀어넣으므로 "물었다"를 기억하지 않으면 다음 진행에서 조건이 또 참이 된다.
# 02가 실측으로 두 번 겪었다 — 매년 그 주에서 멈췄고, 다른 하나는 2038년에
# 자동 진행이 1000회 반복 상한에 걸렸다. **04는 자동 진행이 "다음 결정까지"
# 가므로 거기서 무한히 선다.**

## 02 `age <= 27`
const SPORTS_UNIT_MAX_AGE: int = 27
## 02 `age >= 28` — 입영 기간 만료
const ENLIST_AGE: int = 28
## 체육부대 후보가 공개되는 달. 02의 W50이 04 달력에서 2월 첫 주다
const SPORTS_UNIT_MONTH: int = 2

## "물었다"를 해마다 기억하는 자리. **이게 없으면 얼어붙는다**
const SPORTS_ASKED_KEY: String = "sports_unit_prompted_year"
const ENLIST_ASKED_KEY: String = "military_asked_year"


## 병역이 아직 남아 있나 — 02 `:1959-1961`의 공통 전제.
##
## ⚠ **고교생은 뺀다.** 안 빼면 고교 3년 내내 해마다 묻는다
static func _open(p: Dictionary) -> bool:
	if String(p.get("military_status", STATUS_UNSERVED)) != STATUS_UNSERVED:
		return false
	var stage: String = String(p.get("career_stage", ""))
	return stage != "military" and stage != "highschool"


static func _same_year(p: Dictionary, key: String, state: Dictionary) -> bool:
	return int(p.get(key, 0)) == int(state.get("season_year", 0))


## 체육부대 지원을 물을 때인가 — 02 W50.
static func should_ask_sports_unit(state: Dictionary) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if not _open(p) or int(p.get("age", 0)) > SPORTS_UNIT_MAX_AGE:
		return false
	if _same_year(p, SPORTS_ASKED_KEY, state):
		return false
	var d: Dictionary = Calendar.date_of(int(state.get("season_year", 0)),
		int(state.get("day", 0)))
	return int(d["month"]) == SPORTS_UNIT_MONTH \
		and int(d["day"]) <= Calendar.DAYS_PER_WEEK


## 입대할지 물을 때인가 — 02 W52.
##
## ⚠ **체육부대에 지원했으면 안 묻는다**(02 "미신청"). 결과를 기다리는
## 중인데 현역 입대를 물으면 방금 한 선택이 없던 일이 된다
static func should_ask_enlist(state: Dictionary) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if not _open(p) or int(p.get("age", 0)) < ENLIST_AGE:
		return false
	if bool(p.get("sports_unit_applied", false)):
		return false
	if _same_year(p, ENLIST_ASKED_KEY, state):
		return false
	return int(state.get("day", 0)) \
		> Calendar.DAYS_PER_SEASON - Calendar.DAYS_PER_WEEK


## 물었다고 적는다. **답을 어느 쪽으로 하든 그해엔 다시 안 묻는다** —
## "미룬다"가 상태를 안 바꾸므로 이걸 안 적으면 같은 자리를 무한히 돈다
static func mark_sports_unit_asked(state: Dictionary) -> void:
	_mark(state, SPORTS_ASKED_KEY)


static func mark_enlist_asked(state: Dictionary) -> void:
	_mark(state, ENLIST_ASKED_KEY)


static func _mark(state: Dictionary, key: String) -> void:
	var p: Dictionary = state.get("protagonist", {})
	if not p.is_empty():
		p[key] = int(state.get("season_year", 0))


# ── 상무 선발 ─────────────────────────────────────────────────
#
# 02 `utils/militaryRules.ts:34-43` — **정원은 파생값이다**:
#   연간 선발 = `rosterSize / serviceYears` = 26 / 2 = **13**
#   한 팀 최대 = **3**
#
# ⚠ **02의 누수는 안 물려받는다.** 02는 주인공(W52)과 NPC(오프시즌)를 **별개로
# 추첨**해서 둘 다 뽑히면 그해 입대가 정원 +1이고, 상무는 `career_status`가
# `military`라 오프시즌 로스터 캡이 안 걸려 **해마다 쌓인다** — 02가 그 자리에
# 그렇게 적어 뒀다. 04는 **한 자리에서 한 번만** 뽑는다.

const SPORTS_ROSTER: int = 26
const SPORTS_SERVICE_YEARS: int = 2
const SPORTS_MAX_PER_TEAM: int = 3


static func sports_annual_intake() -> int:
	return maxi(1, int(roundf(float(SPORTS_ROSTER) / float(SPORTS_SERVICE_YEARS))))


## 지원자 중 내가 뽑히나. `applicants`는 `[{id, ovr, team_id}, …]`.
##
## ⚠ **난수를 안 쓴다.** 02도 OVR 순으로 자른다 — 여기서 추첨을 넣으면
## 그건 02 값이 아니라 내가 정한 규칙이 된다.
##
## ⚠ **한 팀 상한을 먼저 본다.** 안 보면 강팀 하나가 정원을 독식한다
static func select_sports_unit(applicants: Array, me_id: String) -> bool:
	var ranked: Array = applicants.duplicate()
	ranked.sort_custom(func(a, b) -> bool:
		return float(a.get("ovr", 0.0)) > float(b.get("ovr", 0.0)))

	var per_team: Dictionary = {}
	var taken: int = 0
	var cap: int = sports_annual_intake()
	for a in ranked:
		if taken >= cap:
			return false
		var t: String = String(a.get("team_id", ""))
		if int(per_team.get(t, 0)) >= SPORTS_MAX_PER_TEAM:
			continue
		per_team[t] = int(per_team.get(t, 0)) + 1
		taken += 1
		if String(a.get("id", "")) == me_id:
			return true
	return false


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
