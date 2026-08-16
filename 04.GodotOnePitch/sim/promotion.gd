extends RefCounted
class_name Promotion

## 학년 진급·졸업·나이 — M9-1.
##
## 원본: `packages/engine-native/src/npc_sim.rs`의 `advance_all_grades` ·
## `advance_all_ages`
##
## ⚠ **드래프트보다 먼저 돈다.** 졸업생이 드래프트 풀에 있어야 뽑을
## 사람이 있다 — 순서는 `SeasonEnd.PHASES`가 정본이다.

## 졸업생이 모이는 자리. 드래프트가 여기서 뽑는다
const DRAFT_POOL: String = "LEAGUE_DRAFT_POOL"
const RETIRED_LEAGUE: String = "LEAGUE_RETIRED"

## 학년이 있는 리그와 졸업 학년. **고교 3년 · 대학 4년**
const SCHOOL_LEAGUES: Dictionary = {
	"LEAGUE_HIGHSCHOOL": 3,
	"LEAGUE_UNIVERSITY": 4,
}


## 같은 해를 두 번 넣지 않는다.
##
## ⚠ **02는 연도 기록을 네 곳이 각자 썼고 방어가 한 곳에만 있었다.** 그래서
## 고교생은 같은 해가 두 줄로 남았다. 경력 화면과 **드래프트 경로 판정**
## (마지막 기록으로 고졸·대졸을 가른다)이 이 배열을 읽으므로 중복은 그대로
## 오작동이 된다
static func push_year_once(history: Array, entry: Dictionary) -> Array:
	for h in history:
		if int(h.get("year", 0)) == int(entry.get("year", 0)):
			return history
	history.append(entry)
	return history


## 한 해 진급. `{hs_graduated, univ_graduated}`
##
## ⚠ **사전을 제자리에서 고친다.** 학년이 오른 사람 목록(`updated`)을 같이
## 돌려주고 있었는데 **부르는 곳이 안 읽었다**(`season_runner.gd:60`은
## 졸업생 둘만 쓴다). 배열에 뭘 담든 결과가 같아 변이가 안 잡혔고,
## 그게 죽은 갈래라는 증거였다
##
## ⚠ **부상 중이어도 학년은 오른다.** 02는 `active`만 진급시켜서 부상
## 선수가 학년이 안 오르고 졸업도 안 됐다 — 나이만 매 시즌 +1 되어
## 20~21세 고교생이 쌓였다. 자리를 비우는 건 은퇴뿐이다
static func advance_grades(npcs: Array, season_year: int) -> Dictionary:
	var hs_graduated: Array = []
	var univ_graduated: Array = []

	for npc in npcs:
		var league: String = String(npc.get("league_id", ""))
		if not SCHOOL_LEAGUES.has(league) \
				or npc.get("career_status", "") == "retired" \
				or npc.get("grade", null) == null:
			continue

		var grade: int = int(npc["grade"])
		var entry: Dictionary = {
			"year": season_year,
			"league_id": league,
			"team_id": npc.get("team_id", ""),
			"stat_line": "-",
			"highlights": [],
		}
		npc["career_history"] = push_year_once(npc.get("career_history", []), entry)

		if grade >= int(SCHOOL_LEAGUES[league]):
			# ⚠ **주인공의 소속은 세계가 정하지 않는다.** 진로 결정이
			# 정본이다(`CareerDecision._move_to` — 거기선 무대·리그·팀을
			# **함께** 바꾼다). 여기서 같이 쓸어 담으면 리그만 바뀌고
			# `career_stage`가 안 따라가서, 실측에서 리그는
			# `LEAGUE_UNIVERSITY`인데 무대는 `"highschool"`로 남았다 —
			# 그 값을 읽는 곳이 파일 아홉이라 **대학생이 고교 생활비를 쓴다.**
			#
			# ⚠ **학년은 위에서 이미 올렸다.** 주인공도 학년은 올라야 한다 —
			# 거르는 것은 졸업 뒤 소속 배정뿐이다
			if bool(npc.get("is_protagonist", false)):
				continue
			npc["grade"] = null
			# ⚠ **덮기 전에 어디서 왔는지를 박아 둔다.** 여기서 안 남기면
			# 드래프트 보드가 출신을 물을 때 **전원이 "재수"**로 나온다 —
			# 화면을 띄워 보고 알았다.
			#
			# **매번 덮어쓰는 게 맞다.** 고교를 나와 대학에 갔다가 지명되면
			# 그 사람의 출신은 대학이다 — 첫 졸업만 남기면 4년 뒤에도
			# "고교"로 뜬다
			npc["origin_league_id"] = league
			npc["league_id"] = DRAFT_POOL
			if league == "LEAGUE_HIGHSCHOOL":
				hs_graduated.append(npc)
			else:
				univ_graduated.append(npc)
		else:
			npc["grade"] = grade + 1

	return {"hs_graduated": hs_graduated,
		"univ_graduated": univ_graduated}


## 전원 나이 +1. **진급 뒤에 돈다** — 먼저 올리면 졸업 판정이 한 살 많은
## 선수를 본다
static func advance_ages(npcs: Array) -> Array:
	for n in npcs:
		if n.get("career_status", "") == "retired" \
				or n.get("league_id", "") == RETIRED_LEAGUE:
			continue
		n["age"] = int(n.get("age", 0)) + 1
	return npcs
