extends RefCounted
class_name CareerDecision

## 진로 결정 — 지원 → 결과 → 선택 → 계약. B-6d.
##
## 원본: `usecases/careerDecision.ts` · `advanceWeek.ts`의 W47 결과 계산
##
## ⚠ **02는 이 로직이 전부 `.svelte` 안에 있었다.** 그래서 헤드리스로 못
## 불렀고 **고교 졸업 이후 경로가 통째로 자동 검증에서 비어 있었다** —
## 지명 거부(대안 셋)도, 프로 트레이드 윈도우도 한 번도 안 돌아봤다.
##
## ⚠ **여기 있는 함수는 사용자가 눌렀을 때 일어나는 일이다.** 자동으로
## 부르면 안 된다 — 부르는 쪽이 "눌렀다"를 책임진다.
##
## ⚠ **02에는 `draftDrafted`를 true로 만드는 곳이 어디에도 없었다.**
## 보드는 이미 true여야 주인공을 끼워 넣었고(순환), 판정 함수를 부르던
## 유일한 자리는 죽은 코드가 됐다. **주인공은 절대 지명될 수 없었고,
## 프로 콘텐츠 전부가 도달 불가였다.** 그 호출이 `build_results`다.


## 진로 상태가 사는 자리 — `{applications, submitted, results, final_choice}`
const KEY: String = "career"

## 지망은 갈래마다 셋까지
const MAX_CHOICES: int = 3

const KBL: String = "LEAGUE_KBL"
const UNIVERSITY: String = "LEAGUE_UNIVERSITY"
const INDEPENDENT: String = "LEAGUE_INDEPENDENT"


static func of(state: Dictionary) -> Dictionary:
	if not state.has(KEY):
		state[KEY] = _blank()
	return state[KEY]


static func _blank() -> Dictionary:
	return {"applications": {}, "submitted": false,
		"results": {}, "final_choice": ""}


## 진로 기록을 비운다 — **무대를 옮길 때 부른다** (P-42).
##
## ⚠ **사전을 갈아끼우지 않고 안을 비운다.** 화면·계측이 `of(state)`로 받은
## 참조를 들고 있을 수 있다 — 갈아끼우면 그쪽은 옛 사전을 본다
static func reset_decision(state: Dictionary) -> void:
	var c: Dictionary = of(state)
	for k in _blank():
		c[k] = _blank()[k]


# ── 지원 ──────────────────────────────────────────────────────

## 원서를 낸다.
##
## ⚠ **학적 역행을 여기서 막는다.** 02는 지원 화면에서만 걸렀고, 구 세이브에
## 남은 지원 기록이 결과 계산으로 흘러들어 **대학 두 번 입학**이 성립했다
static func submit_applications(state: Dictionary, opts: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var stage: String = String(p.get("career_stage", ""))

	var univ: Array = []
	if CareerPath.can_apply_university(stage):
		univ = _clip(opts.get("university_choices", []))
	var indie: Array = []
	if CareerPath.can_apply_independent(stage):
		indie = _clip(opts.get("independent_choices", []))

	var apps: Dictionary = {
		"draft_applied": bool(opts.get("draft", false)),
		"university_choices": univ,
		"independent_choices": indie,
	}
	var c: Dictionary = of(state)
	c["applications"] = apps
	c["submitted"] = true
	c["results"] = {}
	Pending.resolve(state, "career_choice_hub")
	return apps


static func _clip(choices) -> Array:
	var out: Array = []
	for x in choices:
		if out.size() >= MAX_CHOICES:
			break
		out.append(String(x))
	return out


# ── 드래프트 후보 만들기 ──────────────────────────────────────

## `Draft.score`가 보는 입력 한 벌.
##
## ⚠ **또래를 같이 넘긴다.** 안 넘기면 판정이 OVR을 백분위처럼 쓰는
## 폴백으로 떨어지고, 그건 세계 전력이 바뀌면 어긋나는 옛 동작이다
static func draft_candidate(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var mine: float = Contract.core_ovr(p)
	var hs: Dictionary = _hs_inputs(p.get("career_records", []))
	var inj: Dictionary = _injury_counts(state)
	return {
		"percentile": _percentile(state, mine),
		"pitching_ovr": mine,
		"team_ace_rank": _team_ace_rank(state, mine),
		"tournament_score": hs["tournament_score"],
		"award_titles": hs["award_titles"],
		"award_mvps": hs["award_mvps"],
		"moderate_injuries": inj.get("moderate", 0),
		"severe_injuries": inj.get("severe", 0),
		"surgery_injuries": inj.get("surgery", 0),
		"scout_score": float(p.get("scout_score", CampusRunner.BASE_SCOUT_SCORE)),
	}


## 같은 리그·같은 학년 투수들 사이에서 몇 등인가(0~100).
##
## ⚠ **나를 분모에서 뺀다.** 자기 자신을 넣으면 인원수만큼 낮게 나온다
static func _percentile(state: Dictionary, mine: float) -> float:
	var p: Dictionary = state.get("protagonist", {})
	var league: String = String(p.get("league_id", ""))
	var grade: int = int(p.get("grade", 0))
	var me: String = String(p.get("id", ""))

	var below: int = 0
	var total: int = 0
	for team_id in state.get("world", {}).get("rosters", {}):
		for q in state["world"]["rosters"][team_id]:
			if String(q.get("id", "")) == me:
				continue
			if String(q.get("league_id", "")) != league:
				continue
			if grade > 0 and int(q.get("grade", 0)) != grade:
				continue
			if not PlayerGen.is_pitcher(String(q.get("position", ""))):
				continue
			total += 1
			if Contract.core_ovr(q) < mine:
				below += 1
	# 또래가 없으면 가운데로 본다 — 0으로 두면 세계가 얇은 검사에서
	# 전원 미지명이 된다
	return 50.0 if total == 0 else float(below) / float(total) * 100.0


## 팀 안에서 몇 번째 투수인가. **나보다 나은 사람 수 + 1**
static func _team_ace_rank(state: Dictionary, mine: float) -> int:
	var p: Dictionary = state.get("protagonist", {})
	var me: String = String(p.get("id", ""))
	var rank: int = 1
	for q in World.roster_of(state.get("world", {}), String(p.get("team_id", ""))):
		if String(q.get("id", "")) == me:
			continue
		if not PlayerGen.is_pitcher(String(q.get("position", ""))):
			continue
		if Contract.core_ovr(q) > mine:
			rank += 1
	return rank


## 고교 시즌이 준 것 — 대회 성적 평균과 수상 수.
##
## ⚠ **평균이다.** 합으로 두면 한 해 더 다닌 사람이 유리해진다
static func _hs_inputs(records: Array) -> Dictionary:
	var r: Dictionary = CareerPath.rules().get("hs_baseball", {})
	var seasons: int = 0
	var tour: float = 0.0
	var titles: int = 0
	var mvps: int = 0
	for rec in records:
		if String(rec.get("league_id", "")) != "LEAGUE_HIGHSCHOOL":
			continue
		seasons += 1
		# 미진출·기록없음도 바닥값을 받는다
		tour += float(r.get(String(rec.get("ps_result", "")),
			r.get("not_qualified", 10)))
		for a in rec.get("awards", []):
			if String(a.get("id", "")) == "mvp":
				mvps += 1
			else:
				titles += 1
	if seasons == 0:
		return {"tournament_score": Draft.TOURNAMENT_BASE,
			"award_titles": 0, "award_mvps": 0}
	return {"tournament_score": tour / float(seasons),
		"award_titles": titles, "award_mvps": mvps}


## 지나간 부상을 심각도로 센다.
##
## ⚠ **심각도로 가른다.** 02는 중등도 이상을 건당 −12로 뭉쳤고 상한도 없어
## 감점이 −252까지 갔다 — 30커리어 중 6명이 이 항 하나로 미지명이었다
static func _injury_counts(state: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for row in state.get("body_log", []):
		if String(row.get("kind", "")) != "healed":
			continue
		var sev: String = String(row.get("severity", ""))
		if sev.is_empty():
			continue
		out[sev] = int(out.get(sev, 0)) + 1
	return out


# ── 결과 ──────────────────────────────────────────────────────

## 진로 결과를 정한다. 지원을 안 냈으면 빈 사전.
##
## ⚠ **한 번만 정한다.** 다시 부르면 이미 정해진 결과를 그대로 준다 —
## 안 그러면 결과 화면을 다시 열 때마다 지명 순위가 바뀐다
static func build_results(state: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var c: Dictionary = of(state)
	if not bool(c.get("submitted", false)):
		return {}
	var prev = c.get("results", {})
	if prev is Dictionary and not prev.is_empty():
		return prev

	var apps: Dictionary = c.get("applications", {})
	var draft_out: Dictionary = {"drafted": false, "round": 0, "pick": 0,
		"team_id": "", "breakdown": {}}
	if bool(apps.get("draft_applied", false)):
		draft_out = Draft.evaluate(draft_candidate(state), _kbl_team_ids(), rng)

	var adm: Dictionary = CareerPath.admissions({
		"ovr": Contract.core_ovr(state.get("protagonist", {})),
		# ⚠ **학점이 여기까지 와야 4년 관리한 게 뜻을 갖는다** — 안 넘기면
		# 전원이 최하 등급으로 지원한다
		"gpa": float(state.get("school", {}).get("gpa", 0.0)),
		"hs_baseball_score": CareerPath.hs_baseball_score(
			state.get("protagonist", {}).get("career_records", [])),
		"university_choices": apps.get("university_choices", []),
		"independent_choices": apps.get("independent_choices", []),
	}, rng)

	var results: Dictionary = {
		"drafted": bool(draft_out["drafted"]),
		"draft_team_id": String(draft_out["team_id"]),
		"draft_round": int(draft_out["round"]),
		"draft_pick": int(draft_out["pick"]),
		"breakdown": draft_out.get("breakdown", {}),
		"university_passed": adm["university_passed"],
		"independent_passed": adm["independent_passed"],
	}
	c["results"] = results
	Pending.push_once(state, {"type": "career_results"})
	return results


static func _kbl_team_ids() -> Array:
	var ids: Array = []
	for t in World.teams_of(KBL):
		ids.append(String(t["id"]))
	return ids


## 결과를 다 봤다 → 최종 선택으로
# ── 병역 ──────────────────────────────────────────────────────
#
# 🔴 **04는 지금까지 안 물었다.** 02는 둘을 묻는다 —
# `SportsUnitApplicationModal`(상무 지원) · `MilitaryEnlistAskModal`(입대 확인).
#
# ⚠🔴 **어느 쪽으로 답하든 `mark_*_asked`를 부른다.** "미룬다"·"이번엔
# 아니오"는 상태를 안 바꾸므로, 안 적으면 다음 진행에서 조건이 또 참이 되어
# **같은 자리를 무한히 돈다.** 02가 실측으로 두 번 겪었다 — 매년 그 주에서
# 멈췄고, 다른 하나는 2038년에 자동 진행이 1000회 반복 상한에 걸렸다.

## 상무에 지원한다 / 안 한다. 결과는 시즌 마지막 주에 나온다
static func answer_sports_unit(state: Dictionary, apply: bool) -> bool:
	if not Pending.resolve(state, "sports_unit_apply"):
		return false
	var p: Dictionary = state.get("protagonist", {})
	if apply:
		p["sports_unit_applied"] = true
	Military.mark_sports_unit_asked(state)
	return true


## 입대한다 / 미룬다.
##
## ⚠ **입대 처리는 `Military`가 정본이다.** 02도 그 자리에 "네 경로가 각자
## 적고 있었고 그중 둘이 오프시즌 처리를 빠뜨렸다"고 적어 뒀다
static func answer_enlist(state: Dictionary, enlist: bool, at_day: int) -> bool:
	if not Pending.resolve(state, "military_enlist_ask"):
		return false
	Military.mark_enlist_asked(state)
	if enlist:
		Military.enlist(state, "general", at_day)
	return true


static func confirm_results(state: Dictionary) -> bool:
	if not Pending.resolve(state, "career_results"):
		return false
	Pending.push_once(state, {"type": "career_choice"})
	return true


# ── 지금 무대를 계속한다 ──────────────────────────────────────

## 진급하거나 독립리그를 한 해 더. 계속할 수 있으면 `true`.
##
## ⚠ **4학년은 계속할 수 없다 — 5학년은 없다.** 02는 이 판정이 화면에만
## 있어서 헤드리스는 그냥 계속 눌렀고 **주인공이 7년째 대학생(29세)** 이 됐다.
##
## ⚠ **학점이 모자라면 졸업을 못 한다** — 그때는 한 해 더 다닌다.
## 그 갈래에서 **중간에 반환하면 안 된다**: 아래 해소를 건너뛰면
## `career_choice`가 남아 같은 주가 무한 반복된다
static func continue_current_stage(state: Dictionary) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	var stage: String = String(p.get("career_stage", ""))

	if stage == "university" and CareerPath.is_university_final_year(
			int(p.get("grade", 0)), int(p.get("university_week", 0))):
		if Academics.can_graduate(state.get("school", {})):
			_graduate(state, p)
			return false                  # 졸업 — 진로를 정해야 한다
		# 학점 미달 — 한 해 더 다닌다. 아래로 내려간다
	elif stage != "university" and stage != "independent":
		return false

	var c: Dictionary = of(state)
	c["submitted"] = false
	c["results"] = {}
	Pending.resolve(state, "career_choice")
	return true


## 갈 곳이 하나도 없어 병역으로 간다 — P-43.
##
## 🔴 **02의 "전원 탈락: 현역 입대"다**(`CareerResultModal.svelte:108-112`).
## 고교 졸업반은 대학·독립·지명이 전부 떨어지면 남는 길이 이것뿐이다 —
## 04는 그때 `continue`("지금 자리에 남는다")를 줬는데 엔진이 그걸 안 받아서
## **같은 물음이 해마다 다시 떴다**(실측 12해 내내 고교 3학년).
##
## ⚠ **"조용히 입대시키지 않는다"(사용자 확정)와 안 부딪힌다** — 여기는
## **사용자가 선택지를 눌러서** 오는 자리다. `Military.should_ask_enlist`가
## 묻는 자리(프로·독립의 W52)와는 다르다.
##
## ⚠ **`Military.enlist`가 자격을 다시 본다** — 군필이면 `false`다.
## 02는 화면에만 가드가 있어서 **군 복무를 세 번 하는 커리어**가 나왔다
static func enlist_after_failing(state: Dictionary, at_day: int) -> bool:
	if not Military.enlist(state, "general", at_day):
		return false
	var c: Dictionary = of(state)
	c["submitted"] = false
	c["results"] = {}
	c["final_choice"] = "general"
	Pending.resolve(state, "career_choice")
	return true


## 졸업. **기록만 남긴다** — 취업 경로 화면은 엔딩과 같이 만든다.
## 4년을 관리한 결과가 여기서 처음 뜻을 갖는다
static func _graduate(state: Dictionary, p: Dictionary) -> void:
	var school: Dictionary = state.get("school", {})
	var gpa: float = float(school.get("gpa", 0.0))
	_add_event(p, {
		"year": int(state.get("season_year", 0)),
		"type": "graduation",
		"from_team_id": String(p.get("team_id", "")),
		"from_league_id": UNIVERSITY,
		"detail": "졸업 · %s · 학점 %.2f" % [school.get("major", ""), gpa],
	})


# ── 최종 선택 ─────────────────────────────────────────────────

## 지명을 받아들이기로 한다 → **계약 통보를 띄운다.**
##
## 계약 표는 규칙 파일에서 온다 — NPC 신인과 같은 표를 써야 나란히 떴을 때
## 안 어긋난다
static func choose_draft(state: Dictionary) -> Dictionary:
	var c: Dictionary = of(state)
	var r: Dictionary = c.get("results", {})
	if not bool(r.get("drafted", false)):
		return {}

	var p: Dictionary = state.get("protagonist", {})
	var team_id: String = String(r.get("draft_team_id", ""))
	var pick: int = int(r.get("draft_pick", 0))
	var deal: Dictionary = draft_contract(pick,
		team_index(state.get("world", {}), team_id))

	Pending.resolve(state, "career_choice")
	var action: Dictionary = {
		"type": "draft_notification",
		"team_id": team_id, "league_id": KBL,
		"round": int(r.get("draft_round", 0)), "pick": pick,
		"salary": int(deal["salary"]),
		"duration_years": int(deal["duration_years"]),
		"signing_bonus": int(deal["signing_bonus"]),
		# ⚠ **대안은 지금 단계가 갈 수 있는 곳만 담는다** — 대학 재학생에게
		# 대학 대안을 주면 거부할 때 두 번 입학이 된다
		"alt_university_team_id": _first(r.get("university_passed", []))
			if CareerPath.can_apply_university(String(p.get("career_stage", ""))) else "",
		"alt_independent_team_id": _first(r.get("independent_passed", [])),
	}
	Pending.push_once(state, action)
	c["final_choice"] = "draft"
	return action


## 진학 · 독립 입단
static func choose_school_or_independent(state: Dictionary, kind: String,
		team_id: String) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	var stage: String = String(p.get("career_stage", ""))
	# ⚠ **진학은 `can_transition`으로 못 막는다.** 그 표는 같은 단계 유지를
	# 허용한다(재계약·팀 이동) — 대학생의 "대학 진학"이 그리로 새면
	# **두 번 입학**이다. 입학은 지원 자격으로 판정한다
	var allowed: bool = CareerPath.can_apply_university(stage) \
		if kind == "university" else CareerPath.can_transition(stage, kind)
	if not allowed:
		return false

	var league: String = UNIVERSITY if kind == "university" else INDEPENDENT
	_move_to(state, p, kind, league, team_id)

	var c: Dictionary = of(state)
	c["submitted"] = false
	c["final_choice"] = kind
	Pending.resolve(state, "career_choice")

	if kind == "university":
		# 대학 재학 주차가 여기서 시작한다 — 학년의 정본이다
		p["university_week"] = 1
		p["grade"] = 1
	else:
		Pending.push_once(state, independent_offer(state, team_id))
	return true


## 독립리그 입단 제안. **1년 단기 계약 고정이라 min=max=1이다** —
## 02에서 이 세 필드가 빠져 협상 화면이 빈 값을 읽었다
static func independent_offer(state: Dictionary, team_id: String) -> Dictionary:
	var r: Dictionary = CareerPath.rules().get("independent_offer", {})
	var ovr: float = Contract.core_ovr(state.get("protagonist", {}))
	var years: int = int(r.get("duration_years", 1))
	return {
		"type": "salary_negotiation",
		"team_id": team_id, "league_id": INDEPENDENT,
		"offered_salary": maxi(int(r.get("floor", 800)),
			int(roundf((ovr - float(r.get("ovr_base", 40))) * float(r.get("per_ovr", 60))))),
		"duration_years": years,
		"min_duration_years": years, "max_duration_years": years,
		"signing_bonus": 0,
		"context": "initial",
	}


# ── 지명 통보에 답한다 ────────────────────────────────────────

## 지명을 **거부**하고 대안으로 간다. 어디로 갔는지를 돌려준다.
##
## ⚠ **02에서 이 경로는 한 번도 검증된 적이 없다** — 화면 안에 있어서
## 수락 경로만 헤드리스로 밟혔다. 갈래가 셋이라 커리어가 크게 갈린다
static func reject_draft_offer(state: Dictionary, action: Dictionary,
		at_day: int) -> String:
	Pending.resolve(state, "draft_notification")
	var p: Dictionary = state.get("protagonist", {})
	var stage: String = String(p.get("career_stage", ""))
	var c: Dictionary = of(state)
	c["submitted"] = false

	var univ: String = String(action.get("alt_university_team_id", ""))
	var indie: String = String(action.get("alt_independent_team_id", ""))

	# 대학 대안은 고교생만 — 대학 재학생이 여기로 오면 두 번 입학이다
	if not univ.is_empty() and CareerPath.can_apply_university(stage):
		_move_to(state, p, "university", UNIVERSITY, univ)
		p["university_week"] = 1
		p["grade"] = 1
		c["final_choice"] = "university"
		return "university"

	if not indie.is_empty():
		_move_to(state, p, "independent", INDEPENDENT, indie)
		c["final_choice"] = "independent"
		Pending.push_once(state, independent_offer(state, indie))
		return "independent"

	# 갈 곳이 없다 — 병역이 남는다.
	#
	# 🔴 **여기서 조용히 입대시키지 않는다** (2026-08-18, 사용자 확정).
	# 예전엔 `Military.enlist(state, "general", at_day)`를 바로 불렀는데,
	# 02는 **입대할지 묻고**(`MilitaryEnlistAskModal`) **상무에 지원할지도
	# 묻는다**(`SportsUnitApplicationModal`). 04가 대신 정하면 사용자가
	# 고를 것을 잃고, **체육부대 갈래는 영영 안 걸린다** — `sim/military.gd`가
	# 네 곳에서 `"sports"`를 갈라 쓰는데 입구가 없었다.
	#
	# 이제 `Military.should_ask_*`가 때를 정하고 대기줄이 물으며
	# 입대 처리는 사용자의 답을 받은 뒤에 돈다.
	c["final_choice"] = "military_pending"
	return "military_pending"


## 지명 계약을 **수락**한다. 프로가 된다
static func accept_draft_offer(state: Dictionary, action: Dictionary) -> bool:
	# 학적 판정은 여기서 다시 안 한다 — 통보가 뜨는 경로(`choose_draft`)가
	# 진로 선택 대기에서만 오고, 그 자리에 설 수 있는 단계는 전부 프로로
	# 갈 수 있다. 여기 조건을 하나 더 두면 절대 안 걸리는 죽은 가드가 된다
	var p: Dictionary = state.get("protagonist", {})
	var league: String = String(action.get("league_id", KBL))
	_move_to(state, p, "pro_kbl", league, String(action.get("team_id", "")))
	p["salary"] = int(action.get("salary", 0))
	p["contract_years"] = int(action.get("duration_years", 0))
	p["signing_bonus"] = int(action.get("signing_bonus", 0))
	p["pro_service_years"] = 0
	# 계약금은 그 자리에서 자산이 된다 — 안 더하면 화면에만 있는 숫자다
	p["money"] = int(p.get("money", 0)) + int(action.get("signing_bonus", 0))
	p["draft_round"] = int(action.get("round", 0))
	p["draft_year"] = int(state.get("season_year", 0))

	_add_event(p, {
		"year": int(state.get("season_year", 0)), "type": "drafted",
		"to_team_id": String(action.get("team_id", "")),
		"to_league_id": league,
		"detail": "%d라운드 %d순위" % [int(action.get("round", 0)),
			int(action.get("pick", 0))],
	})

	var c: Dictionary = of(state)
	c["submitted"] = false
	c["results"] = {}
	c["final_choice"] = "draft"
	Pending.resolve(state, "draft_notification")
	return true


# ── 신인 계약 ─────────────────────────────────────────────────

## 지명 순위가 정하는 신인 계약. **연봉은 균일이고 계약금이 차등을 진다**
static func draft_contract(pick_no: int, index: float = 1.0) -> Dictionary:
	var r: Dictionary = CareerPath.rules().get("draft_contract", {})
	var rows: Array = r.get("by_pick", [])
	if rows.is_empty():
		return {"salary": 0, "duration_years": 0, "signing_bonus": 0}

	var row: Dictionary = rows[rows.size() - 1]
	for x in rows:
		if pick_no <= int(x["until_pick"]):
			row = x
			break

	var idx: float = clampf(index, float(r.get("team_index_min", 0.85)),
		float(r.get("team_index_max", 1.15)))
	return {
		"salary": int(row["salary"]),
		"duration_years": int(r.get("duration_years", 3)),
		# 백만원 자리에서 끊는다 — 02와 같다
		"signing_bonus": int(roundf(float(row["bonus"]) * idx / 100.0)) * 100,
	}


## 구단의 씀씀이를 계약금 배수로. **중립(50)이 1.0이다**
static func team_index(world: Dictionary, team_id: String) -> float:
	var r: Dictionary = CareerPath.rules().get("draft_contract", {})
	var lo: float = float(r.get("team_index_min", 0.85))
	var hi: float = float(r.get("team_index_max", 1.15))
	var w: float = float(TeamProfile.of(world, team_id).get(
		"owner_spending_willingness", 50.0))
	return lo + (hi - lo) * clampf(w / 100.0, 0.0, 1.0)


# ── 도우미 ────────────────────────────────────────────────────

## 무대를 옮긴다. **전이표를 이미 통과한 뒤에만 부른다**
static func _move_to(state: Dictionary, p: Dictionary, stage: String,
		league: String, team_id: String) -> void:
	var from_team: String = String(p.get("team_id", ""))
	# 🔴 **진로 기록을 통째로 비운다** (P-42). 안 비우면 고교에서 채운
	# `results`가 그대로 남아 `CareerRunner._should_open`의
	# "결과가 있으면 안 연다"에 **매년 걸린다** — 실측 20해에서 주인공이
	# 2032년부터 15해를 대학 4학년에 멈춰 있었다.
	#
	# ⚠ **02가 같은 증상을 겪고 적어 뒀다**(`game.ts:1768`):
	# "실측: 2032 진학 → 2038까지 7년째 대학생(29세), 매년 W42 진로 허브만
	# 반복." 02는 무대를 옮길 때 `careerApplications`·`careerResults`·
	# `careerApplicationsSubmitted`·`careerFinalChoice`를 다 비운다.
	#
	# ⚠ **여기가 정본이다** — 무대가 바뀌는 길이 셋(지명 수락·진학·독립)인데
	# 각자 비우면 하나를 빠뜨린다. 02가 그 실수를 했다
	reset_decision(state)
	p["career_stage"] = stage
	p["league_id"] = league
	p["team_id"] = team_id
	p["team_name"] = String(World.team_field({}, team_id, "name", team_id))
	# 학년은 학생일 때만 뜻이 있다
	if stage != "university" and stage != "highschool":
		p.erase("grade")
		p.erase("university_week")
	move_roster(state, p, from_team, team_id)


## 🔴 **로스터도 같이 옮긴다** (P-14).
##
## 20해를 굴렸더니 대학 진학 시즌부터 **18해 연속 주인공을 못 찾았다** —
## 여기서 `team_id`만 바꾸고 로스터를 안 건드렸기 때문이다.
##
## ⚠ **04는 주인공도 로스터에 산다**(`world.gd:280`). `relink_protagonist`가
## **새 팀 로스터에서** 찾으므로 안 넣으면 영영 못 찾고, 못 찾으면 학년·성장·
## 관계가 전부 그 위에 선다. 02는 주인공을 로스터 밖에 뒀으므로 대응 코드가
## 없다 — **04 자기 규칙을 04가 안 지키던 것이다.**
##
## ⚠ **양쪽 배열을 같이 고친다.** 한쪽만 하면 같은 사람이 두 팀에 있거나
## 통째로 사라진다 — `FaRunner._move`가 같은 자리에 그렇게 적어 뒀다.
##
## ⚠ **주인공만이다.** NPC 이동은 `FaRunner._move`·승강이 따로 맡는다
static func move_roster(state: Dictionary, p: Dictionary,
		from_team: String, to_team: String) -> void:
	if not bool(p.get("is_protagonist", false)) or from_team == to_team:
		return
	var rosters: Dictionary = state.get("world", {}).get("rosters", {})
	var id: String = String(p.get("id", ""))

	var old: Array = rosters.get(from_team, [])
	for i in range(old.size() - 1, -1, -1):
		if String(old[i].get("id", "")) == id:
			old.remove_at(i)

	# ⚠ **같은 사전을 넣는다.** 복사본이면 로스터 쪽과 `protagonist` 쪽이
	# 갈려서 한쪽만 자란다 — 04가 이미 한 번 데인 자리다
	if not rosters.has(to_team):
		rosters[to_team] = []
	rosters[to_team].append(p)


static func _first(list) -> String:
	return String(list[0]) if list is Array and not list.is_empty() else ""


static func _add_event(p: Dictionary, event: Dictionary) -> void:
	var events: Array = p.get("career_events", [])
	events.append(event)
	p["career_events"] = events
