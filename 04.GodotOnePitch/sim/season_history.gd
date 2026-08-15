extends RefCounted
class_name SeasonHistory

## 시즌 기록·수상 — M9-7b.
##
## 원본: `usecases/seasonCareerRecord.ts` · `seasonAwards.ts`
##
## ⚠ **02는 결산 화면이 유일한 호출부였다.** 화면을 열어야만 기록이 쌓였고
## 자동 진행에선 은퇴할 때까지 한 줄도 없었다. 여기는 시즌 종료가 부른다.


## 경력 표에 한 줄로 뜨는 요약. **화면이 다시 만들지 않는다**
static func stat_line_of(st: Dictionary) -> String:
	if st.is_empty():
		return ""
	if st.get("type", "") == "pitcher":
		return "%d승 %d패 ERA %.2f %.1f이닝 %dK" % [
			int(st.get("w", 0)), int(st.get("l", 0)), float(st.get("era", 0.0)),
			float(st.get("ip", 0.0)), int(st.get("k", 0))]
	if st.get("type", "") == "batter":
		return "타율 %s %d홈런 %d타점" % [_pct(float(st.get("avg", 0.0))),
			int(st.get("hr", 0)), int(st.get("rbi", 0))]
	return ""


## `.312` — 앞의 0을 뗀다. 02와 같은 표기
static func _pct(v: float) -> String:
	return ("%.3f" % v).trim_prefix("0")


## 그 해 성적을 연도 기록에 적는다. **이미 있는 해는 안 덮는다** —
## 진급이 먼저 만들어 둔 줄에 성적만 채운다.
##
## ⚠ **한 해에 두 줄이 생기면 안 된다.** 02는 연도 기록을 네 곳이 각자
## 썼고, 경력 화면과 **드래프트 경로 판정**(마지막 기록으로 고졸·대졸을
## 가른다)이 이 배열을 읽으므로 중복은 그대로 오작동이 된다
static func apply(players: Array, stats: Dictionary, year: int) -> int:
	var n: int = 0
	for p in players:
		var st: Dictionary = stats.get(p.get("id", ""), {})
		if st.is_empty():
			continue

		var history: Array = p.get("career_history", [])
		var found: Dictionary = {}
		for h in history:
			if int(h.get("year", 0)) == year:
				found = h
				break

		if found.is_empty():
			history.append({
				"year": year,
				"league_id": p.get("league_id", ""),
				"team_id": p.get("team_id", ""),
				"stat_line": stat_line_of(st),
				# ⚠ **숫자도 같이 남긴다.** 문자열 요약만 두면 통산을 셀 길이
				# 없다 — `season_stats`는 해가 바뀌면 비워지고, 업적·인생 기록이
				# 통산을 물으면 그때 답할 게 아무것도 안 남는다
				"stats": st.duplicate(true),
				"highlights": [],
			})
			p["career_history"] = history
		else:
			# ⚠ **진급이 만든 줄에 성적만 채운다.** 새로 만들면 두 줄이 된다
			found["stat_line"] = stat_line_of(st)
			found["stats"] = st.duplicate(true)
		n += 1
	return n


## 리그별 수상.
##
## ⚠ **리그를 합치면 안 된다.** 프로 MVP와 고교 MVP가 같은 저울에
## 올라간다 — `Awards`가 그 자리에 그렇게 적어 뒀다
static func awards_of(players: Array, stats: Dictionary) -> Dictionary:
	var by_league: Dictionary = {}
	for p in players:
		var st: Dictionary = stats.get(p.get("id", ""), {})
		if st.is_empty():
			continue
		var lid: String = String(p.get("league_id", ""))
		if not by_league.has(lid):
			by_league[lid] = {}
		by_league[lid][p.get("id", "")] = st

	var out: Dictionary = {}
	for lid in by_league:
		var winners: Array = Awards.compute(by_league[lid])
		if winners.is_empty():
			continue
		out[lid] = {"awards": winners, "mvp": Awards.mvp_ids(by_league[lid])}
	return out


## 수상을 선수의 연도 기록에 얹는다. **기록이 만들어진 뒤여야 한다** —
## 그게 `SeasonEnd.PHASES`가 수상을 기록 뒤에 둔 이유다
static func attach_awards(players: Array, awards: Dictionary, year: int) -> int:
	var titles: Dictionary = {}
	for lid in awards:
		for a in awards[lid].get("awards", []):
			var pid: String = String(a.get("player_id", ""))
			var list: Array = titles.get(pid, [])
			list.append(String(a.get("title", a.get("label", ""))))
			titles[pid] = list
		for pid in awards[lid].get("mvp", []):
			var list2: Array = titles.get(String(pid), [])
			list2.append("MVP")
			titles[String(pid)] = list2

	var n: int = 0
	for p in players:
		var got: Array = titles.get(p.get("id", ""), [])
		if got.is_empty():
			continue
		for h in p.get("career_history", []):
			if int(h.get("year", 0)) == year:
				h["highlights"] = got
				n += 1
				break
	return n


## 주인공의 그 해 경력 한 줄. **자동 진행에서도 쌓여야 한다**
##
## ⚠ **한 해에 두 줄이 생기면 연도 선택·은퇴 결산이 전부 어긋난다.**
## 02는 결산 화면과 롤오버가 둘 다 불러서 실제로 그랬다
static func protagonist_record(state: Dictionary, year: int) -> Dictionary:
	var me: Dictionary = state.get("protagonist", {})
	if me.is_empty():
		return {}

	var records: Array = me.get("career_records", [])
	for r in records:
		if int(r.get("year", 0)) == year:
			return {}

	var st: Dictionary = state.get("season_stats", {}).get(me.get("id", ""), {})
	var team_id: String = String(me.get("team_id", ""))

	# 그 해 내 등판 기록 — **치른 경기만**
	var log: Array = []
	for g in state.get("schedule", []):
		if not g.get("is_protagonist_game", false) or g.get("result", null) == null:
			continue
		for l in g["result"].get("player_lines", []):
			if l.get("player_id", "") != me.get("id", "") \
					or l.get("role", "") != "pitcher":
				continue
			var is_home: bool = g.get("home", "") == team_id
			log.append({
				"day": int(g.get("day", 0)),
				"opponent_id": g.get("away", "") if is_home else g.get("home", ""),
				"my_score": int(g["result"].get("home_score" if is_home else "away_score", 0)),
				"opp_score": int(g["result"].get("away_score" if is_home else "home_score", 0)),
				"ip": float(l.get("ip", 0.0)), "er": float(l.get("er", 0.0)),
				"h": float(l.get("h", 0.0)), "k": float(l.get("k", 0.0)),
				"bb": float(l.get("bb", 0.0)), "pc": int(l.get("pc", 0)),
			})
			break

	var league_id: String = String(me.get("league_id", ""))
	var record: Dictionary = {
		"year": year,
		"league_id": league_id,
		"team_id": team_id,
		"stat_line": stat_line_of(st),
		"ovr": float(me.get("pitching", {}).get("ovr", 0.0)),
		"awards": [],
		# ⚠ **그 해 어디까지 갔나.** 읽는 쪽이 셋인데(대학 입시·드래프트
		# 판정·인생 기록) **채우는 자리가 없어서 전원이 미진출이었다** —
		# 고교 우승이 입시에 한 점도 안 실렸다
		"ps_result": Postseason.result_for(state, team_id, league_id),
		"game_log": log,
	}
	records.append(record)
	me["career_records"] = records
	return record


## 결산 화면이 읽는 사전. **롤오버 전에 찍는다** —
##
## ⚠ **롤오버가 순위표와 성적을 비운다.** 새 일정이 깔리고 `season_stats`가
## 초기화되므로, 그 뒤에 만들면 결산이 통째로 빈 화면이 된다
static func digest(state: Dictionary, year: int, summary: Dictionary) -> Dictionary:
	var me: Dictionary = state.get("protagonist", {})
	var league_id: String = String(me.get("league_id", ""))

	var record: Dictionary = {}
	for r in me.get("career_records", []):
		if int(r.get("year", 0)) == year:
			record = r

	var awards: Dictionary = state.get("season_awards", {}).get(str(year), {})
	var my_league_awards: Dictionary = awards.get(league_id, {})

	# 내가 받은 것 — 이름을 화면이 다시 찾지 않게 여기서 고른다
	var mine: Array = []
	for a in my_league_awards.get("awards", []):
		if String(a.get("player_id", "")) == String(me.get("id", "")):
			mine.append(String(a.get("title", a.get("label", ""))))
	for pid in my_league_awards.get("mvp", []):
		if String(pid) == String(me.get("id", "")):
			mine.append("MVP")

	return {
		"year": year,
		"summary": summary,
		"league_id": league_id,
		"team_id": String(me.get("team_id", "")),
		"team_name": String(me.get("team_name", "")),
		"my_record": record,
		"my_awards": mine,
		"awards": my_league_awards,
		# 순위표는 화면이 쓰는 것과 **같은 함수**로 만든다 — 두 벌이 되면
		# 결산과 리그 탭이 다른 순위를 보여준다
		"standings": LeagueVm.build(state),
	}
