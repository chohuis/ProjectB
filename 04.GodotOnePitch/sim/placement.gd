extends RefCounted
class_name Placement

## 진로 배정 — 갈 곳이 없는 사람을 어디로 보내나. M9-14.
##
## 원본: `draft.rs`의 `Placer`
##
## 대학 → **프로 2군(육성선수)** → 독립 → 포기. 04는 앞의 셋 중 2군이 빠져
## 있었고, 그래서 매년 900명 안팎이 야구를 그만뒀다.
##
## ⚠ **02가 여기서 비싸게 배운 것 넷을 전부 옮긴다:**
##
## **① 대학은 한 해에 받을 수 있는 인원이 따로 있다.** 팀 정원만 보면 어느
## 해에 왕창 받고 4년 뒤 그 코호트가 한꺼번에 빠져나가는 주기가 생긴다 —
## 실측 대학 유입이 194~558로 진동했고 저점 해의 졸업생은 갈 곳이 없어
## 대량으로 그만뒀다(포기 630~1,163명). **어느 해에 태어났느냐가 운명을
## 가르면 안 된다.**
##
## **② 육성선수는 정원 밖 인원이다.** 정식 정원을 그대로 쓰면 로스터가 찬
## 순간 자리가 사라진다 — 실측 KBL 2군 10팀 여유가 5자리라 그해 미지명자
## 1,373명 중 **2군에 간 사람이 0명**이었다(그만둠 919).
##
## **③ 2군이 독립리그보다 먼저다.** 2군은 유입이 하위 라운드 지명뿐인데
## 1군이 콜업으로 계속 빼간다 — 실측에서 야수 29명에 **투수 6명**이 됐다.
## 현실에서도 방출된 프로 선수는 독립보다 다른 팀 팜과 계약하는 게 자연스럽다.
##
## **④ 대학은 고교 졸업자만 간다.** 남는 자리부터 채우면 대졸 미지명자가
## 대학 1학년으로 다시 입학한다.


## 야구를 그만둔 사람에게 붙는 이벤트
const QUIT_EVENT: String = "quit_baseball"

## 대학 팀당 정원 · **한 해 정원**.
##
## 02 `placementRulesFrom`이 `rosterSize / gradeMax`로 계산한다 — 고교
## 신입생 생성의 `perYear`와 같은 식이다. 대학은 32 ÷ 4 = 8
const UNIVERSITY_MAX: int = 40
const UNIVERSITY_ANNUAL_MAX: int = 8

## 독립 팀당 정원과 나이 상한. 서른 넘은 사람을 받으면 독립 로스터가
## 은퇴 직전 선수로만 채워진다
const INDEPENDENT_MAX: int = 45
const INDEPENDENT_AGE_MAX: int = 31

## 팀당 육성선수 보유 상한. **정식 정원(34) 위에 얹는다** — KBO에서도
## 정식 등록 외 인원이다. 02 `developmentPlayerRules.intakeMax`.
##
## ⚠ **0이면 제도가 없는 것과 같다.** 실측에서 KBL 2군 10팀이
## [32,33,33,33,34,34,34,34,34,34]로 여유가 5자리였고, 그해 미지명자
## 1,373명 중 **2군에 간 사람이 0명**이었다(그만둠 919).
##
## ⚠ **반대로 크게 잡으면** 2군이 육성선수로 채워져 드래프트 지명의 가치가
## 사라진다. 10팀 × 10 = 시즌당 최대 100명 흡수
const DEVELOPMENT_MAX: int = 10

## 육성선수 연봉(만원). 02 `developmentPlayerRules.salary`.
##
## ⚠ **최저연봉(3000)보다 낮아야 한다.** 같거나 높으면 계약금이 붙는 하위
## 라운드 지명이 무의미해져서 "지명 안 되는 게 낫다"가 된다.
## KBO 육성선수도 최저연봉 보장이 없다 — 02 실측 연봉 중앙값이 2000이다
const DEVELOPMENT_SALARY: int = 2000

const UNIVERSITY: String = "LEAGUE_UNIVERSITY"
const INDEPENDENT: String = "LEAGUE_INDEPENDENT"
const FARM: String = "LEAGUE_KBL_FARM"
const HIGHSCHOOL: String = "LEAGUE_HIGHSCHOOL"


# ── 자리 찾기 ─────────────────────────────────────────────────

## 그 팀에 이 사람이 들어갈 자리가 있나.
##
## `limit`는 정원, `annual`은 그 해에 받을 수 있는 인원(없으면 -1)
static func _has_room(world: Dictionary, team_id: String, limit: int,
		annual: int, intake: Dictionary) -> bool:
	if World.roster_of(world, team_id).size() >= limit:
		return false
	if annual >= 0 and int(intake.get(team_id, 0)) >= annual:
		return false
	return true


## ⚠ **투수와 야수를 가려 받는다.** 안 가리면 한 리그가 한쪽으로 쏠린다 —
## 02에서 2군이 야수 29명 대 투수 6명이 됐다
static func _pitcher_share(world: Dictionary, team_id: String) -> float:
	var roster: Array = World.roster_of(world, team_id)
	if roster.is_empty():
		return 0.0
	var pit: int = 0
	for p in roster:
		if String(p.get("player_type", "")) == "pitcher":
			pit += 1
	return float(pit) / float(roster.size())


## 그 리그에서 이 사람을 받을 팀. 없으면 빈 문자열.
##
## **모자란 보직을 가진 팀이 먼저 받는다** — 자리 수만 보면 쏠림이 안 풀린다
static func find_team(world: Dictionary, league_id: String, is_pitcher: bool,
		limit: int, annual: int = -1, intake: Dictionary = {}) -> String:
	var best: String = ""
	var best_need: float = -1.0
	for t in World.teams_of(league_id):
		var tid: String = String(t["id"])
		if not _has_room(world, tid, limit, annual, intake):
			continue
		# 투수가 모자란 팀일수록 투수를 반긴다(야수는 반대)
		var share: float = _pitcher_share(world, tid)
		var need: float = (PlayerGen.DEFAULT_PITCHER_RATIO - share) if is_pitcher \
			else (share - PlayerGen.DEFAULT_PITCHER_RATIO)
		if need > best_need:
			best_need = need
			best = tid
	return best


# ── 배정 ──────────────────────────────────────────────────────

## 마지막 소속 리그. 대학 진학 자격을 가른다
static func last_league_of(p: Dictionary) -> String:
	var history: Array = p.get("career_history", [])
	if history.is_empty():
		return ""
	return String(history[history.size() - 1].get("league_id", ""))


## 한 사람의 진로. `{league_id, team_id}` — 갈 곳이 없으면 빈 사전.
##
## ⚠ **순서가 곧 규칙이다.** 대학(고졸만) → 2군 → 독립 → 포기
static func route_for(world: Dictionary, p: Dictionary,
		univ_intake: Dictionary, dev_count: Dictionary) -> Dictionary:
	var is_pitcher: bool = String(p.get("player_type", "")) == "pitcher"

	# ① 대학 — **고교 졸업자만.** 대졸·독립 출신이 1학년으로 다시 입학하면 안 된다
	if last_league_of(p) == HIGHSCHOOL:
		var univ: String = find_team(world, UNIVERSITY, is_pitcher,
			UNIVERSITY_MAX, UNIVERSITY_ANNUAL_MAX, univ_intake)
		if not univ.is_empty():
			return {"league_id": UNIVERSITY, "team_id": univ}

	# ② 프로 2군 — **육성선수 몫은 정식 정원 위에 얹는다**
	var farm_limit: int = RosterMaintenance.roster_max_of(FARM) + DEVELOPMENT_MAX
	var farm: String = find_team(world, FARM, is_pitcher, farm_limit,
		DEVELOPMENT_MAX, dev_count)
	if not farm.is_empty():
		return {"league_id": FARM, "team_id": farm}

	# ③ 독립 — 나이 상한이 있다
	if int(p.get("age", 0)) <= INDEPENDENT_AGE_MAX:
		var indy: String = find_team(world, INDEPENDENT, is_pitcher, INDEPENDENT_MAX)
		if not indy.is_empty():
			return {"league_id": INDEPENDENT, "team_id": indy}

	return {}


const LEAGUE_LABEL: Dictionary = {
	UNIVERSITY: "대학리그", FARM: "2군", INDEPENDENT: "독립리그",
}


## 한 사람을 실제로 보낸다. **제자리에서 고친다.** 갔으면 `true`
static func place(world: Dictionary, p: Dictionary, year: int,
		event_type: String, reason: String,
		univ_intake: Dictionary, dev_count: Dictionary) -> bool:
	var from_team: String = String(p.get("team_id", ""))
	var to: Dictionary = route_for(world, p, univ_intake, dev_count)
	var events: Array = p.get("career_events", [])

	if to.is_empty():
		events.append({"year": year, "type": QUIT_EVENT,
			"from_team_id": from_team, "to_team_id": "",
			"detail": "%s → 야구를 그만둔다" % reason})
		p["career_events"] = events
		p["career_status"] = "retired"
		p["league_id"] = Promotion.RETIRED_LEAGUE
		p["team_id"] = ""
		return false

	var league: String = String(to["league_id"])
	var tid: String = String(to["team_id"])
	events.append({"year": year, "type": event_type,
		"from_team_id": from_team, "to_team_id": tid,
		"to_league_id": league,
		"detail": "%s → %s" % [reason, LEAGUE_LABEL.get(league, league)]})
	p["career_events"] = events
	p["league_id"] = league
	p["team_id"] = tid
	# 대학에 가면 1학년부터다
	if league == UNIVERSITY:
		p["grade"] = 1
		univ_intake[tid] = int(univ_intake.get(tid, 0)) + 1
	else:
		p.erase("grade")

	# ⚠ **2군으로 갔으면 드래프트 지명자와 다른 신분이다.** 계약금이 없고
	# 연봉이 최저연봉 아래고 단년이다. **소속이 아니라 신분을 남긴다** —
	# 강등된 정식 선수도 2군에 있으므로 리그로 판정하면 그 사람까지 육성선수가 된다
	if league == FARM:
		p["salary"] = DEVELOPMENT_SALARY
		p["contract_years"] = 1
		p["development_since"] = year
		dev_count[tid] = int(dev_count.get(tid, 0)) + 1
	else:
		p["salary"] = 0
		p["contract_years"] = 0

	if not world["rosters"].has(tid):
		world["rosters"][tid] = []
	world["rosters"][tid].append(p)
	return true


## 여러 사람을 한 번에. **능력치 높은 순** — 좋은 선수가 먼저 자리를 잡는다.
##
## `{placed, gave_up, by_league}`
static func place_all(world: Dictionary, people: Array, year: int,
		event_type: String, reason: String) -> Dictionary:
	var sorted: Array = people.duplicate()
	# ⚠ **능력 → id 순.** 뒤 갈래가 없으면 같은 능력치에서 순서가 흔들려
	# 재현이 무너진다
	sorted.sort_custom(func(a, b) -> bool:
		var oa: float = Offseason.core_ovr(a)
		var ob: float = Offseason.core_ovr(b)
		if oa != ob:
			return oa > ob
		return String(a.get("id", "")) < String(b.get("id", "")))

	var univ_intake: Dictionary = {}
	var dev_count: Dictionary = {}
	var placed: int = 0
	var gave_up: int = 0
	var by_league: Dictionary = {}
	for p in sorted:
		if place(world, p, year, event_type, reason, univ_intake, dev_count):
			placed += 1
			var l: String = String(p["league_id"])
			by_league[l] = int(by_league.get(l, 0)) + 1
		else:
			gave_up += 1
	return {"placed": placed, "gave_up": gave_up, "by_league": by_league}
