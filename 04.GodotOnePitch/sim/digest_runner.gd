extends RefCounted
class_name DigestRunner

## 야구계 소식(다이제스트) 배선.
##
## 🔴 **`sim/digest.gd`는 362줄인데 아무도 안 불렀다.** `Digest.build`를
## 부르는 곳이 **자기 검사 하나뿐**이라, 게임을 아무리 굴려도 플레이어에게
## 한 번도 안 왔다.
##
## ⚠ **왜 안 붙어 있었는지 알아냈다.** `Digest.build`가 바라는 입력이
## **04 상태에 없다** — 04는 `state["standings"]`도 `league_state`도 없고
## **순위표를 일정에서 파생한다**(`achievements.gd:91` · `Standings.from_schedule`).
## 02 모양 그대로 옮겨 놓고 먹일 것을 못 만들어 그대로 굳은 것이다.
## 여기가 그 **번역기**다.
##
## ⚠ **이번 루프에서 같은 모양을 세 번째 만났다** — 소식 본문 · 월간 부상
## 리포트 · 다이제스트. **쓰는 쪽을 만들면 읽는 쪽이 있는지 센다.**


## `[다른 무대]`에 실을 리그 — **내 리그는 조립기가 뺀다**
static func _other_leagues(my_league: String) -> Array:
	var out: Array = []
	for lid in Digest.LEAGUE_NAMES:
		if String(lid) != my_league:
			out.append(String(lid))
	return out


## 04 상태 → `Digest.build`가 먹는 사전.
##
## ⚠ **내 순위표는 최상위(`my_standings`)고 `league_state`엔 내가 안 뛰는
## 리그만 담는다.** 뒤집어 담으면 조립기가 내 자리를 못 찾는다 —
## `digest_test.gd:57-59`가 그 표본 실수를 적어 뒀다
static func input_of(state: Dictionary, at_day: int) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var my_league: String = String(p.get("league_id", "LEAGUE_HIGHSCHOOL"))
	var schedule: Array = state.get("schedule", [])
	var year: int = int(state.get("season_year", 0))

	var league_state: Dictionary = {}
	for lid in _other_leagues(my_league):
		var rows: Array = Standings.from_schedule(schedule, lid)
		if not rows.is_empty():
			league_state[lid] = {"standings": rows}

	var date: Dictionary = Calendar.date_of(year, maxi(at_day, 1))
	return {
		"week_num": Calendar.week_of(at_day),
		"season_year": year,
		"month_label": "%d월" % int(date["month"]),
		"career_stage": CareerPath.stage_of(p),
		# 🔴 **04는 학년을 `grade`로 든다.** `hs_grade`는 `Digest.build`의
		# 입력 이름일 뿐이다 — 주인공에서 그 이름으로 읽어서 **늘 0**이었고,
		# 그래서 3학년인데도 `tier_of`가 `hs1`로 갈렸다.
		# **02 이름과 04 이름을 헷갈린 자리다**
		"hs_grade": int(p.get("grade", 0)),
		"my_team_id": String(p.get("team_id", "")),
		"my_league_id": my_league,
		"my_standings": Standings.from_schedule(schedule, my_league),
		"league_state": league_state,
		# 🔴 **권역을 안 먹여서 `[내 자리]`가 통째로 안 나왔다.**
		# 고교 갈래는 `calc_my_rank(my_standings, my_team, regions)`가 빈
		# 사전을 내면 **섹션 자체를 안 만든다** — 제일 중요한 줄이 없어지고
		# 미리보기가 `[다른 무대]`로 떨어진다. 그건 02가 고쳐 둔 결함이다
		# ("남의 리그가 먼저 떠서 열어볼 이유가 안 보였다").
		#
		# ⚠ **04에 권역이 있다** — `Tournament.regions_of`가 구장에서
		# 파생한다(`teams.json`의 `stadium`이 정본). 없는 줄 알고 빈 사전을
		# 줄 뻔했다
		"regions": Tournament.regions_of(my_league),
		# 🔴 **이름을 안 먹여서 소식 본문에 id가 그대로 찍혔다** —
		# `HS_AEWOL  HALLA 1위 / 6팀`. `Digest`는 일부러 표를 안 갖는다
		# (`digest.gd:104`가 "손으로 표를 만들지 않는다. 이름은 호출부가
		# 넘긴다"고 적어 뒀다) — **넘기는 쪽이 없었다.** 02가 같은 자리에서
		# `YEONGSAN권역`을 찍은 적이 있다.
		#
		# ⚠ **둘 다 04에 있다** — 팀 이름은 `World.team_names()`,
		# 구장 이름은 `ParkVm.name_of`(`parks.json`의 27개).
		#
		# ⚠ **상태에 든 `team_names`를 안 쓰고 데이터에서 다시 낸다.**
		# 손으로 만든 상태(검사·계측)가 그 키를 빠뜨리면 소식이 조용히
		# id로 나온다 — 표는 데이터에서 늘 같게 나오니 여기서 낸다
		"team_names": World.team_names(),
		"region_names": _region_names(my_league),
		"scout_score": int(p.get("scout_score", 0)),
	}


## 그 리그 권역의 사람 이름. **구장이 곧 권역이다**(`Tournament.regions_of`).
##
## ⚠ **없는 구장은 안 담는다** — 폴백은 `Digest`가 갖고 있고, 빈 문자열을
## 담으면 이름이 사라진 채로 줄이 나온다
static func _region_names(league_id: String) -> Dictionary:
	var out: Dictionary = {}
	for stadium_id in Tournament.regions_of(league_id):
		var label: String = ParkVm.name_of(String(stadium_id))
		if label != String(stadium_id):
			out[stadium_id] = label
	return out


## 한 주. **다이제스트 주에만 실제로 돈다.**
##
## ⚠ **같은 주에 두 번 굴려도 한 통이다.** id가 겹치면 소식 목록에서 하나가
## 조용히 사라진다 — 02는 그걸로 **세이브가 아예 안 열렸다**
static func run(state: Dictionary, at_day: int = -1) -> Dictionary:
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	if not Digest.DIGEST_WEEKS.has(Calendar.week_of(day)):
		return {}

	var msg: Dictionary = Digest.build(input_of(state, day))
	if msg.is_empty():
		return {}

	var id: String = String(msg.get("id", ""))
	var mailbox: Array = state.get("mailbox", [])
	for m in mailbox:
		if String(m.get("id", "")) == id:
			return {}

	# 소식함이 바라는 모양으로 맞춘다 — `Digest`는 02 모양(`created_at`·
	# `read_at`)을 그대로 갖고 있다
	msg["day"] = day
	msg["read"] = false
	msg["decision"] = null
	mailbox.append(msg)
	state["mailbox"] = mailbox
	return msg
