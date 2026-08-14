extends RefCounted
class_name SeasonRunner

## 시즌 종료를 **실제로 돌린다** — M9-4.
##
## `SeasonEnd`는 순서만 갖는다. 여기가 그 순서대로 세계를 바꾼다.
##
## ⚠ **02에선 이 자리가 세 분기에 각각 적혀 있었고 그중 어디도 안 타는
## 경로가 있었다.** 주인공이 지명된 해엔 세계 오프시즌이 통째로 건너뛰어져
## 그 해 NPC 사건이 `fa_signed 6`뿐이었고 드래프트·은퇴·이적·연도기록이
## 전부 없었으며 **주인공 나이도 안 올랐다.** 부르는 자리가 몇이든 여기
## 하나를 거치게 한다.

## 드래프트가 뽑아 가는 자리. 소속 없는 졸업생이 여기 모인다
const POOL_KEY: String = "draft_pool"

## 지명된 신인이 들어가는 리그. **02와 같이 국내 프로만**
const DRAFT_LEAGUE: String = "LEAGUE_KBL"

## 미지명자가 가는 곳. 02가 "대학 진학 · 독립 입단 · 은퇴"로 갈랐다
const INDY_LEAGUE: String = "LEAGUE_INDEPENDENT"
const UNIV_LEAGUE: String = "LEAGUE_UNIVERSITY"


## 세계의 모든 선수. **로스터와 드래프트 풀 둘 다** — 한쪽만 보면
## 졸업생이 나이를 안 먹거나 은퇴 판정을 안 받는다
static func all_players(state: Dictionary) -> Array:
	var out: Array = []
	for tid in state.get("world", {}).get("rosters", {}):
		out.append_array(state["world"]["rosters"][tid])
	out.append_array(state.get("world", {}).get(POOL_KEY, []))
	return out


## 시즌 종료 한 번. 이미 돈 해면 `{ran: false}`
##
## 돌린 단계와 무슨 일이 있었는지를 돌려준다 — 화면과 계측이 그걸 읽는다
static func run(state: Dictionary) -> Dictionary:
	var year: int = int(state.get("season_year", 0))
	var last: int = int(state.get("last_world_season_end_year", 0))
	if not SeasonEnd.should_run(last, year):
		return {"ran": false, "year": year, "phases": []}

	var world: Dictionary = state.get("world", {})
	if not world.has(POOL_KEY):
		world[POOL_KEY] = []

	var done: Array = []
	var summary: Dictionary = {"graduated": 0, "drafted": 0, "undrafted": 0,
		"retired": 0, "healed": 0, "aged": 0}

	# ⓪ 올해 최종 순위를 남긴다 — **일정이 아직 이 해의 결과를 들고 있을 때.**
	#
	# ⚠ **개나리기는 2주에 열린다.** 그때 올해 순위표를 보면 치른 경기가
	# 거의 없어 전 팀이 승률 0이고, 시드가 **팀ID 순**이 된다. 지난해 순위를
	# 여기서 안 남기면 그 대회는 매년 같은 대진으로 열린다
	TournamentRunner.remember_standings(state)

	# ① 진급·졸업·나이 — **드래프트보다 먼저.** 졸업생이 풀에 있어야 한다
	var promoted: Dictionary = Promotion.advance_grades(all_players(state), year)
	var graduates: Array = promoted["hs_graduated"] + promoted["univ_graduated"]
	summary["graduated"] = graduates.size()
	_move_to_pool(world, graduates)
	done.append("advance_grades")

	# ② NPC 드래프트 — **오프시즌보다 먼저.** 오프시즌이 미지명자를 흩는다
	var draft: Dictionary = _run_draft(state, world, year)
	summary["drafted"] = int(draft["drafted"])
	summary["undrafted"] = int(draft["undrafted"])
	done.append("npc_draft")

	# ③ 시즌 기록 — **오프시즌이 로스터를 흩기 전이어야 한다.**
	#
	# ⚠ 진급이 이미 만들어 둔 줄에 성적만 채운다. 새로 만들면 한 해가
	# 두 줄이 되고, 경력 화면과 드래프트 경로 판정이 그 배열을 읽는다
	var stats: Dictionary = state.get("season_stats", {})
	summary["recorded"] = SeasonHistory.apply(all_players(state), stats, year)
	done.append("season_history")

	# ④ 로스터 상한 — **초과분을 2군으로, 자리가 없으면 방출.**
	#
	# ⚠ **드래프트 뒤·진로 배정 앞이다.** 신인이 들어와 정원이 넘치고,
	# 밀려난 사람은 미지명자와 **같은 로직**으로 진로를 정한다.
	# 없으면 프로가 매년 지명 수만큼 불어난다 — 실측 8년에 7,337 → 8,216명
	var cap: Dictionary = _normalize_rosters(world, year)
	summary["demoted"] = int(cap["demoted"])
	summary["released"] = int(cap["released"])

	# ④ 미지명자 진로 — **대학 진학 · 독립 입단 · 은퇴.**
	#
	# ⚠ **안 배정하면 드래프트 풀이 무한히 쌓인다.** 실측으로 5년에
	# 4,221명이 소속 없이 떠다녔다. 02는 여기가 12단계 배정인데 뼈대만
	# 옮긴다 — 세부(재수·군·해외)는 아직이다
	# ④b 2단계 방출 — **정원 안이어도** 성적·연봉·뎁스로 걸러낸다.
	#
	# ⚠ **1단계(정원 초과) 뒤·진로 배정 앞이다.** 방출된 사람은 미지명자와
	# **같은 경로**로 갈 곳을 정한다 — 02도 그렇다(실측 release → 2군 132 ·
	# 독립 10). 뒤에 두면 그해엔 소속 없이 떠돈다
	var cut: Dictionary = _release_second_stage(state, world, year)
	summary["released"] = int(summary.get("released", 0)) + int(cut["released"])

	var placed: Dictionary = _place_undrafted(state, world, year)
	summary["placed"] = int(placed["placed"])
	summary["gave_up"] = int(placed["gave_up"])
	summary["by_league"] = placed.get("by_league", {})

	# ⑤ 리그 오프시즌 — 부상 회복·은퇴
	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix([state.get("seed", 0), "offseason", year])
	var off: Dictionary = Offseason.run(all_players(state), year, rng)
	summary["retired"] = off["retired"].size()
	summary["healed"] = int(off["healed"])
	_remove_retired(world)
	done.append("league_offseason")

	# ⑥ 주인공 시즌 기록 — **자동 진행에서도 쌓인다.**
	#
	# ⚠ 02는 결산 화면이 유일한 호출부라 화면을 열어야만 쌓였고, 자동
	# 진행에선 은퇴할 때까지 한 줄도 없었다
	var mine: Dictionary = SeasonHistory.protagonist_record(state, year)
	summary["my_record"] = 0 if mine.is_empty() else 1
	done.append("protagonist_record")

	# ⑦ 수상 — **기록이 만들어진 뒤여야 얹을 자리가 있다**
	var awards: Dictionary = SeasonHistory.awards_of(all_players(state), stats)
	var all_awards: Dictionary = state.get("season_awards", {})
	all_awards[str(year)] = awards
	state["season_awards"] = all_awards
	summary["awarded"] = SeasonHistory.attach_awards(all_players(state), awards, year)
	done.append("awards")

	# ⑧ 나이 — **진급 뒤다.** 먼저 올리면 졸업 판정이 한 살 많은 선수를 본다
	var alive: Array = all_players(state)
	Promotion.advance_ages(alive)
	summary["aged"] = alive.size()
	done.append("aging")

	# ⑨ 구단 성향 — **팀이 개성을 갖는 유일한 경로.**
	#
	# ⚠ 02는 이걸 구현해 놓고 아무도 안 불렀다. 전 팀이 정확히 50이라
	# 트레이드 buyer 조건(`상위 30% · 압박 > 60`)을 **구조적으로 아무도
	# 못 넘었고**, 실측 트레이드가 9 → 8 → 2 → 1 → 1 → 0으로 말랐다.
	# 승강·방출·FA 입찰도 같은 프로필을 읽으므로 전부 중립 판단이었다
	summary["profiles"] = TeamProfile.update_all(state)
	done.append("team_profiles")

	# ⑩ 계약 — **연차가 오르고 계약이 한 해 줄어든다.**
	#
	# ⚠ **FA보다 먼저다.** 안 줄이면 아무도 계약이 끝나지 않아 시장이 영영
	# 비어 있다. 계약이 없는 사람(신인·이적자)에게는 여기서 붙인다
	Contract.advance_year(all_players(state))
	summary["contracts"] = Contract.ensure_world(state)
	done.append("contracts")

	# ⑪ FA — **구단 성향 뒤다.** 입찰이 성적 압박을 읽는다
	var fa: Dictionary = FaRunner.run(state)
	summary["fa_signed"] = int(fa["signings"])
	summary["fa_unsigned"] = int(fa["unsigned"])
	# ⚠ **미계약자를 그냥 두면 안 된다.** 계약이 0인 채로 팀에 남아 해마다
	# 같은 사람이 시장에 나온다 — 실측에서 110~130명이 그렇게 쌓였다.
	# 미지명자와 **같은 진로 배정**을 탄다
	var fa_out: Dictionary = _place_fa_unsigned(world, year)
	summary["fa_placed"] = int(fa_out["placed"])
	summary["gave_up"] = int(summary.get("gave_up", 0)) + int(fa_out["gave_up"])
	# 미지명자와 같은 칸에 합친다 — 진로는 한 경로다
	var merged: Dictionary = summary.get("by_league", {})
	for lid in fa_out.get("by_league", {}):
		merged[lid] = int(merged.get(lid, 0)) + int(fa_out["by_league"][lid])
	summary["by_league"] = merged
	done.append("free_agency")

	# ⑫ 트레이드 — **FA 뒤다.** 시장에서 못 채운 자리를 거래로 메운다.
	#
	# ⚠ 구단 성향이 서야 buyer/seller가 갈린다 — 02는 전 팀이 중립이라
	# **buyer가 구조적으로 0팀**이었고 거래가 9 → 8 → 2 → 1 → 1 → 0으로 말랐다
	var trades: Dictionary = TradeRunner.run(state)
	summary["trades"] = int(trades["done"])
	summary["trade_moved"] = int(trades["moved"])
	done.append("trades")

	# ⑬ 신입생 충원 — **없으면 세계가 마른다.** 실측으로 고교가 5년 만에
	# 텅 비었다(졸업만 하고 들어오는 사람이 없다)
	summary["freshmen"] = _intake(state, world, year)
	done.append("background")

	# ⚠ **가드 연도는 반드시 상태에 넣는다.** 02는 이게 스토어 안에만 있어서
	# 앱을 껐다 켜면 없던 일이 됐다 — 결과는 영구인데 가드만 세션 한정이었다
	state["last_world_season_end_year"] = year
	state["last_draft_year"] = year

	return {"ran": true, "year": year, "phases": done, "summary": summary}


## 졸업생을 로스터에서 빼 드래프트 풀로. **양쪽을 같이 고쳐야 한다** —
## 한쪽만 하면 같은 선수가 두 군데에 있거나 통째로 사라진다
static func _move_to_pool(world: Dictionary, graduates: Array) -> void:
	if graduates.is_empty():
		return
	var ids: Dictionary = {}
	for g in graduates:
		ids[g.get("id", "")] = true

	for tid in world.get("rosters", {}):
		var kept: Array = []
		for p in world["rosters"][tid]:
			if not ids.has(p.get("id", "")):
				kept.append(p)
		world["rosters"][tid] = kept

	for g in graduates:
		g["team_id"] = ""
	world[POOL_KEY] = world.get(POOL_KEY, []) + graduates


## 은퇴자를 로스터에서 뺀다. **풀에서도 뺀다** — 미지명 노장이 남는다
static func _remove_retired(world: Dictionary) -> void:
	for tid in world.get("rosters", {}):
		var kept: Array = []
		for p in world["rosters"][tid]:
			if p.get("career_status", "") != "retired":
				kept.append(p)
		world["rosters"][tid] = kept

	var pool: Array = []
	for p in world.get(POOL_KEY, []):
		if p.get("career_status", "") != "retired":
			pool.append(p)
	world[POOL_KEY] = pool


static func _run_draft(state: Dictionary, world: Dictionary, year: int) -> Dictionary:
	var pool: Array = world.get(POOL_KEY, [])
	if pool.is_empty():
		return {"drafted": 0, "undrafted": 0}

	var teams: Array = []
	var league_of: Dictionary = {}
	for t in World.teams_of(DRAFT_LEAGUE):
		teams.append(t["id"])
		league_of[t["id"]] = DRAFT_LEAGUE
	if teams.is_empty():
		return {"drafted": 0, "undrafted": pool.size()}

	var by_id: Dictionary = {}
	for p in pool:
		by_id[p.get("id", "")] = p

	var out: Dictionary = NpcDraft.run(pool, teams, year)
	var n: int = NpcDraft.apply(out["picks"], by_id, league_of, year)

	# 지명된 선수를 팀 로스터로 옮긴다 — 안 옮기면 소속만 바뀌고
	# 실제로는 아무 팀에도 없다
	var drafted_ids: Dictionary = {}
	for p in out["picks"]:
		drafted_ids[p["npc_id"]] = p["team_id"]
	for id in drafted_ids:
		var player = by_id.get(id, null)
		if player == null:
			continue
		var tid: String = String(drafted_ids[id])
		if not world["rosters"].has(tid):
			world["rosters"][tid] = []
		world["rosters"][tid].append(player)

	var left: Array = []
	for p in pool:
		if not drafted_ids.has(p.get("id", "")):
			left.append(p)
	world[POOL_KEY] = left

	return {"drafted": n, "undrafted": left.size()}


## 미지명자 진로. **대학 → 프로 2군(육성) → 독립 → 포기.**
##
## ⚠ **판정은 `Placement`가 갖는다.** 예전엔 여기서 대학·독립 둘만 봤고,
## 그래서 매년 900명 안팎이 야구를 그만뒀다 — **2군이 빠져 있었다.**
## 02도 같은 결함을 겪었고(그해 미지명자 1,373명 중 2군행 0명) 원인은
## 육성선수 몫을 정원 밖으로 안 둔 것이었다
static func _place_undrafted(state: Dictionary, world: Dictionary,
		year: int) -> Dictionary:
	var pool: Array = world.get(POOL_KEY, [])

	# ⚠ **주인공은 NPC와 같이 밀려나면 안 된다.** 능력치 순 배정에서 뒤로
	# 밀려 자리가 없으면 야구를 그만두고, 그러면 **게임이 조용히 끝난다** —
	# 실측에서 3년차에 그렇게 사라졌다. 진로는 사용자가 정한다(미이관)
	var mine: Array = []
	var others: Array = []
	for p in pool:
		if p.get("is_protagonist", false):
			mine.append(p)
		else:
			others.append(p)

	var out: Dictionary = Placement.place_all(world, others, year,
		"draft_undrafted", "미지명")

	for p in mine:
		if not Placement.place(world, p, year, "draft_undrafted", "미지명", {}, {}):
			# 어디도 자리가 없다 — 그래도 야구를 그만두게 두지 않는다
			var fallback: String = String(World.teams_of(UNIV_LEAGUE)[0]["id"])
			p["career_status"] = "active"
			p["league_id"] = UNIV_LEAGUE
			p["team_id"] = fallback
			p["grade"] = 1
			if not world["rosters"].has(fallback):
				world["rosters"][fallback] = []
			world["rosters"][fallback].append(p)
		out["placed"] = int(out["placed"]) + 1

	world[POOL_KEY] = []
	return out


## 최근 성적을 0~100 평판으로. **50이 평균**이고 방출 점수가 그 기준에서
## 모자란 만큼을 센다.
##
## ⚠ **기록이 없으면 50이다.** 0으로 보면 안 뛴 사람이 전부 방출 후보가 된다 —
## 2군·신인이 통째로 갈린다
static func _recent_rating(p: Dictionary, stats: Dictionary) -> float:
	var s: Dictionary = stats.get(String(p.get("id", "")), {})
	if s.is_empty():
		return Release.PERF_BASE
	if String(s.get("type", "")) == "pitcher":
		var era: float = float(s.get("era", 0.0))
		if float(s.get("ip", 0.0)) <= 0.0:
			return Release.PERF_BASE
		if era < 2.5:
			return 80.0
		if era < 3.5:
			return 65.0
		if era < 4.5:
			return 50.0
		if era < 6.0:
			return 35.0
		return 20.0
	if int(s.get("ab", 0)) <= 0:
		return Release.PERF_BASE
	var avg: float = float(s.get("avg", 0.0))
	if avg > 0.300:
		return 80.0
	if avg > 0.270:
		return 65.0
	if avg > 0.240:
		return 50.0
	if avg > 0.200:
		return 35.0
	return 20.0


## 2단계 방출 — **정원 안이어도** 성적·연봉·뎁스로 걸러낸다.
##
## ⚠ **방출된 사람을 드래프트 풀로 보낸다.** 그래야 미지명자와 같은 진로
## 배정을 탄다 — 팀에서 빼기만 하면 소속 없이 떠도는 유령이 된다
static func _release_second_stage(state: Dictionary, world: Dictionary,
		year: int) -> Dictionary:
	# ⚠ **올해 성적을 본다.** 안 넘기면 전원이 평균(50) 취급이라 성적 항이
	# 죽고, 남는 건 나이·연봉뿐이 된다
	var stats: Dictionary = state.get("season_stats", {})
	var released: int = 0
	if not world.has(POOL_KEY):
		world[POOL_KEY] = []

	for tid in world.get("rosters", {}).keys():
		var roster: Array = world["rosters"][tid]
		if roster.is_empty():
			continue
		var league: String = String(roster[0].get("league_id", ""))
		# **프로만이다** — 학교·독립엔 방출이 없다. `ROSTER_LIMITS`가 프로의
		# 정본이다(`is_pro_league`는 1군만 참이라 2군을 빠뜨린다)
		if not RosterMaintenance.ROSTER_LIMITS.has(league):
			continue

		var profile: Dictionary = TeamProfile.of(world, tid)
		var depth: Dictionary = Release.depth_of(roster)
		# 판정에 필요한 두 값을 붙인다 — 없으면 전원이 평균 취급이라
		# 아무도 안 걸린다
		for p in roster:
			p["recent_rating"] = _recent_rating(p, stats)
			p["market_value"] = Contract.market_value(Contract.core_ovr(p), league,
				int(p.get("pro_service_years", 0)), int(p.get("age", 25)))

		for r in Release.pick(roster, profile, depth):
			var p: Dictionary = r["player"]
			roster.erase(p)
			var events: Array = p.get("career_events", [])
			events.append({"year": year, "type": "release",
				"from_team_id": tid, "from_league_id": league,
				"detail": "방출 (점수 %.0f)" % r["score"]})
			p["career_events"] = events
			p["team_id"] = ""
			p["league_id"] = Promotion.DRAFT_POOL
			world[POOL_KEY].append(p)
			released += 1

	return {"released": released}


## FA 미계약자를 진로 배정으로 보낸다.
##
## ⚠ **표시만 하고 두면 안 된다.** 계약이 0인 채로 팀에 남아 **해마다 같은
## 사람이 시장에 나온다** — 실측에서 110~130명이 그렇게 쌓였다
static func _place_fa_unsigned(world: Dictionary, year: int) -> Dictionary:
	var waiting: Array = []
	for tid in world.get("rosters", {}):
		for p in world["rosters"][tid]:
			if p.get("fa_unsigned", false) and not p.get("is_protagonist", false):
				waiting.append(p)
	if waiting.is_empty():
		return {"placed": 0, "gave_up": 0}

	# ⚠ **옛 팀에서 먼저 뺀다.** 안 빼면 같은 사람이 두 군데 있는다
	for p in waiting:
		p.erase("fa_unsigned")
		var roster: Array = world["rosters"].get(String(p.get("team_id", "")), [])
		for i in roster.size():
			if roster[i] == p:
				roster.remove_at(i)
				break

	return Placement.place_all(world, waiting, year, "fa_unsigned", "FA 미계약")


## 마지막 연도 기록의 리그. **고졸·대졸을 가르는 자리**다 —
## 02도 `career_history.last()`로 진로를 판정한다
static func _last_league_of(p: Dictionary) -> String:
	var h: Array = p.get("career_history", [])
	if h.is_empty():
		return ""
	return String(h[-1].get("league_id", ""))


## 그 리그에서 자리가 남은 팀 하나. 없으면 빈 문자열
static func _open_slot(world: Dictionary, league_id: String) -> String:
	var max_size: int = int(World.rules_of(league_id)["size"])
	for t in World.teams_of(league_id):
		var tid: String = String(t["id"])
		if world["rosters"].get(tid, []).size() < max_size:
			return tid
	return ""


## 학년제 리그 신입생 충원.
##
## ⚠ **없으면 세계가 마른다.** 졸업만 하고 들어오는 사람이 없어서 실측으로
## 고교가 5년 만에 텅 비었다. 02는 매년 정원까지 채운다
static func _intake(state: Dictionary, world: Dictionary, year: int) -> int:
	var made: int = 0
	for lid in World.RULES:
		var r: Dictionary = World.RULES[lid]
		if int(r.get("grade_max", 0)) <= 0:
			continue

		for t in World.teams_of(lid):
			var tid: String = String(t["id"])
			var roster: Array = world["rosters"].get(tid, [])
			var short: int = int(r["size"]) - roster.size()
			if short <= 0:
				continue

			# ⚠ **부족한 자리부터 채운다.** 안 그러면 포수 0명이 안 고쳐진다 —
			# 실측 고교 102팀 전부가 어느 해엔가 포지션 공백이었다
			var fresh: Array = PlayerGen.roster({
				"team_id": tid, "school_id": "%s_%d" % [tid, state.get("seed", 0)],
				"season_year": year + 1, "league_id": lid, "count": short,
				"id_offset": 1000 + made,
				# ⚠ **포지션 목록을 안 넘긴다.** 02도 신입생은 폴백 비율로
				# 뽑고, 자리 메우기는 로스터 유지가 맡는다 — 여기서 최소
				# 포지션 표를 새로 정하면 밸런스를 건드리는 것이 된다
				"pitching_ovr_min": r["ovr"][0], "pitching_ovr_max": r["ovr"][1],
				"batting_ovr_min": r["ovr"][0], "batting_ovr_max": r["ovr"][1],
				"dev_rate_min": r["dev"][0], "dev_rate_max": r["dev"][1],
				# 신입생은 **전원 1학년**이다 — 학년제 배분을 넘기면 안 된다
				"age": int(r.get("age_base", r["age"][0])) + 1, "grade": 1,
			})
			world["rosters"][tid] = roster + fresh
			made += fresh.size()
	return made


## 로스터 상한 정규화 — **초과분을 2군으로, 자리가 없으면 방출.**
##
## ⚠ **없으면 프로가 매년 지명 수만큼 불어난다.** 실측으로 8년에 7,337 →
## 8,216명이 됐다. 들어오는 문(드래프트)만 있고 나가는 문이 없었다.
##
## ⚠ **1군을 먼저 본다.** 1군 초과분이 2군으로 내려가면 2군이 늘어나므로,
## 2군을 먼저 세어두면 그 유입이 상한 검사를 통과해버린다 — 02가 겪은
## 결함이고 그쪽 주석이 "KBL 700명의 원인"이라고 적어 뒀다
static func _normalize_rosters(world: Dictionary, year: int) -> Dictionary:
	# 1군 먼저, 팜 나중. 나머지는 이름순 — HashMap 순회 순서에 기대지 않는다
	var team_ids: Array = world.get("rosters", {}).keys()
	team_ids.sort_custom(func(a, b) -> bool:
		var fa: bool = String(a).ends_with(World.FARM_SUFFIX)
		var fb: bool = String(b).ends_with(World.FARM_SUFFIX)
		if fa != fb:
			return not fa
		return String(a) < String(b))

	var demoted: int = 0
	var released: int = 0
	for tid in team_ids:
		var roster: Array = world["rosters"].get(tid, [])
		if roster.is_empty():
			continue
		# ⚠ **상한이 정의된 리그를 본다.** `is_pro_league`는 1군만 참이라
		# 그걸 쓰면 2군 상한이 영영 안 걸린다 — 강등자가 들어와도 아무도
		# 다시 안 보게 되고, 02가 겪은 "KBL 700명"이 그 형태다
		var league: String = String(roster[0].get("league_id", ""))
		if not RosterMaintenance.ROSTER_LIMITS.has(league):
			continue

		var over: int = roster.size() - RosterMaintenance.roster_max_of(league)
		if over <= 0:
			continue

		# ⚠ **주인공은 강등·방출 대상이 아니다.** 사용자가 정할 일을 세계가
		# 대신 정하면 안 된다 — 진로·이적은 별도 화면이 맡는다(미이관)
		var sorted: Array = []
		for p in roster:
			if not p.get("is_protagonist", false):
				sorted.append(p)
		over = mini(over, sorted.size())

		# ⚠ **약한 순 → 나이 많은 순 → id 순.** 마지막 두 갈래가 없으면
		# 같은 능력치에서 순서가 흔들려 재현이 무너진다
		sorted.sort_custom(func(a, b) -> bool:
			var oa: float = Offseason.core_ovr(a)
			var ob: float = Offseason.core_ovr(b)
			if oa != ob:
				return oa < ob
			var ga: int = int(a.get("age", 0))
			var gb: int = int(b.get("age", 0))
			if ga != gb:
				return ga > gb
			return String(a.get("id", "")) < String(b.get("id", "")))

		var farm_tid: String = tid + World.FARM_SUFFIX
		var farm_league: String = league + "_FARM"
		var has_farm: bool = World.RULES.has(farm_league)

		for i in over:
			var p: Dictionary = sorted[i]
			var events: Array = p.get("career_events", [])
			if has_farm:
				# ⚠ **리그도 같이 바꾼다.** 팀만 `_2`로 바꾸면 그 선수는
				# 여전히 1군 소속으로 집계돼 2군 상한이 영원히 안 걸린다
				events.append({"year": year, "type": "demote_roster",
					"from_team_id": tid, "to_team_id": farm_tid,
					"from_league_id": league, "to_league_id": farm_league,
					"detail": "1군 정원 초과"})
				p["career_events"] = events
				p["team_id"] = farm_tid
				p["league_id"] = farm_league
				if not world["rosters"].has(farm_tid):
					world["rosters"][farm_tid] = []
				world["rosters"][farm_tid].append(p)
				demoted += 1
			else:
				# 내릴 곳이 없으면 방출이다. **소속만 비운다** — 진로 배정이
				# 미지명자와 같은 로직으로 독립·은퇴를 정한다. 02는 예전에
				# 여기서 바로 은퇴시켜 22세 신인이 방출 한 번에 끝났다
				events.append({"year": year, "type": "release_roster",
					"from_team_id": tid, "from_league_id": league,
					"detail": "정원 초과 방출"})
				p["career_events"] = events
				p["team_id"] = ""
				p["league_id"] = Promotion.DRAFT_POOL
				world[POOL_KEY] = world.get(POOL_KEY, []) + [p]
				released += 1

		# ⚠ **주인공을 다시 넣는다.** 정렬 대상에서 뺐으므로 여기서 안 넣으면
		# 로스터에서 통째로 사라진다 — 소속 없는 현역이 되고 화면이 깨진다
		var kept: Array = []
		for p in roster:
			if p.get("is_protagonist", false):
				kept.append(p)
		for j in range(over, sorted.size()):
			kept.append(sorted[j])
		world["rosters"][tid] = kept

	return {"demoted": demoted, "released": released}


## 다음 해로 넘어간다 — **시즌 종료를 돌린 뒤에 부른다.**
##
## ⚠ **순서가 계약이다.** 롤오버를 먼저 하면 `SeasonEnd`의 가드가 새 연도를
## 보고 또 돌 수 있고, 진급 판정이 한 해 어긋난다.
##
## ⚠ **주인공 팀이 바뀌었을 수 있다.** 졸업·진학·지명이 방금 지났으므로
## 소속을 다시 읽는다 — 옛 팀으로 일정을 짜면 내 경기가 하나도 안 잡힌다
static func roll_over(state: Dictionary) -> Dictionary:
	var me: Dictionary = state.get("protagonist", {})
	var year: int = int(state.get("season_year", 0)) + 1
	var team_id: String = String(me.get("team_id", ""))

	state["season_year"] = year
	state["day"] = 1
	state["season_days"] = Calendar.DAYS_PER_SEASON

	# 팀 이름표를 다시 붙인다 — 진학·지명으로 바뀌었을 수 있다
	var names: Dictionary = state.get("team_names", {})
	me["team_name"] = names.get(team_id, team_id)

	# ⚠ **보직을 다시 정한다.** 팀이 바뀌면 나보다 센 투수의 수가 달라지고,
	# 그러면 선발이던 사람이 불펜이 된다. 안 다시 정하면 옛 팀 기준으로
	# 로테이션에 들어가 등판이 하나도 안 잡히는 해가 생긴다
	var team_ovrs: Array = []
	for q in World.roster_of(state.get("world", {}), team_id):
		if q.get("id", "") != me.get("id", "") \
				and PlayerGen.is_pitcher(q.get("position", "")):
			team_ovrs.append(q.get("pitching", {}).get("ovr", 0.0))
	me["role"] = Rotation.assign_position(
		float(me.get("pitching", {}).get("ovr", 0.0)), team_ovrs)
	me["position"] = me["role"]

	state["schedule"] = World.build_schedule(state.get("world", {}), year, me,
		team_id, int(state.get("seed", 0)))

	# 지난 시즌의 미결정은 남기지 않는다 — 지나간 선택지가 새 해를 막는다
	state["pending"] = []

	# ⚠ **시즌 성적을 비운다.** 안 비우면 지난 시즌 기록이 다음 해에 섞여
	# 수상·기록이 통째로 어긋난다 — 통산은 가 들고 있다
	state["season_stats"] = {}

	var mine: int = 0
	for g in state["schedule"]:
		if g.get("is_protagonist_game", false):
			mine += 1
	return {"year": year, "team_id": team_id, "role": me["role"],
		"games": state["schedule"].size(), "my_starts": mine}


## 시즌 종료 + 롤오버를 한 번에. **부르는 자리가 몇이든 여기 하나를 거친다**
static func finish_season(state: Dictionary) -> Dictionary:
	var out: Dictionary = run(state)
	if not out["ran"]:
		return out

	# ⚠ **결산을 롤오버 전에 찍는다.** 롤오버가 순위표와 성적을 비우므로
	# 그 뒤에 만들면 결산이 통째로 빈 화면이 된다
	out["digest"] = SeasonHistory.digest(state, int(out["year"]), out["summary"])
	out["rollover"] = roll_over(state)
	return out
