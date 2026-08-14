extends RefCounted
class_name MatchDay

## 경기 하루 — M7-6a. **세계의 로스터로 실제 경기를 돌린다.**
##
## 여기가 잇는 것:
##   `World`(로스터) → `Roster`(편성) → `GameLoop`(경기)
##   → `MatchReport`(어댑터) → `Standings`·`SeasonStats`
##
## ⚠ **모듈 하나하나는 다 통과하는데 이어 붙이면 안 도는 자리가 있다.**
## 02에서 `MatchReport`를 순위표에 이을 때 무승부 표기가 어긋나 **없던
## 승리가 생겼다** — 그래서 검사가 두 계약을 직접 본다.
##
## ⚠ **여기는 앱 루트가 아니다.** 상태를 안 들고, 넘겨받은 세계와 일정만
## 본다 — 그래야 계측과 검사가 화면 없이 부를 수 있다.


## 타순에 세울 인원. 02와 같다
const LINEUP_SIZE: int = 9


## 그 팀의 타순과 선발. **`Roster`가 정본이다** — 여기서 따로 고르면
## 편성 규칙이 두 벌이 된다
static func _lineup(players: Array) -> Array:
	# ⚠ **투수를 따로 거르지 않는다.** 정렬이 같은 일을 한다 — 투수의 타격
	# 능력치가 야수보다 낮으므로 저절로 뒤로 밀린다. 거르는 줄을 두면
	# **야수가 아홉이 안 되는 팀**(2군 극단)에서 빈 타순이 되고, 그걸 막으려고
	# 또 채우는 줄을 붙이게 된다 — 둘 다 정렬 하나로 없어진다
	var batters: Array = players.duplicate()
	batters.sort_custom(func(a, b) -> bool:
		return float(a["batting"]["ovr"]) > float(b["batting"]["ovr"]))
	return batters.slice(0, LINEUP_SIZE)


## 그 팀의 이번 경기 선발. **로테이션이 정한다** — 매번 제일 센 투수를
## 고르면 에이스가 전 경기를 던지고 나머지는 표본이 0이 된다
static func starter_of(players: Array, league_id: String, game_no: int) -> Dictionary:
	var rotation: Array = Rotation.build(players, league_id)
	var pid: String = Rotation.starter_at(rotation, game_no)
	for p in players:
		if p.get("id", "") == pid:
			return p
	return {}


## 경기 엔진이 먹는 타자 사전. **키 이름이 엔진과 같아야 한다** —
## 다르면 능력치가 0으로 읽혀 조용히 약해진다
static func _batter(p: Dictionary) -> Dictionary:
	var b: Dictionary = p.get("batting", {})
	return {
		"id": p.get("id", ""),
		"contact": b.get("contact", 50.0),
		"power": b.get("power", 50.0),
		"eye": b.get("eye", 50.0),
		"discipline": b.get("discipline", 50.0),
		"speed": b.get("speed", 50.0),
		"instinct": b.get("base_instinct", 50.0),
		"batting_clutch": b.get("batting_clutch", 50.0),
	}


static func _pitcher(p: Dictionary) -> Dictionary:
	var q: Dictionary = p.get("pitching", {})
	return {
		"id": p.get("id", ""),
		"command": q.get("command", 50.0),
		"velocity": q.get("velocity", 50.0),
		"control": q.get("control", 50.0),
		"movement": q.get("movement", 50.0),
		"clutch": q.get("clutch", 50.0),
		"mental_resil": q.get("mentality", 50.0),
		"hold_runners": q.get("hold_runners", 50.0),
		"stamina_cap": q.get("stamina", 50.0),
		# ⚠ **구종 배열을 싣는다.** 안 실으면 배운 구종이 경기에 안 나오고
		# 숙련도가 결과에 안 닿는다 — 02가 그 상태였다.
		# NPC는 아직 배열이 없어서 `PitchStep`의 기준값(3)으로 굴러간다
		"pitches": p.get("pitches", []),
	}


## 아주 단순한 투구 선택. **전술은 M7-6c(경기 화면)에서 붙인다** —
## 소비자 없는 자리를 미리 만들지 않는다
static func _decide(_state: Dictionary, rng) -> Dictionary:
	return {
		"pitch_type": "fastball" if rng.randf() < 0.55 else "slider",
		"location": 1 + int(rng.randf() * 9.0),
		"strategy": "balanced", "power": "normal",
	}


## 경기 하나. `{ok, error, result, pitches}`
##
## ⚠ **로스터가 비면 안 돌린다.** 억지로 돌리면 빈 타순으로 돌아 이상한
## 결과가 순위표에 들어간다
static func play(world: Dictionary, home_id: String, away_id: String,
		rng: RandomNumberGenerator, p: Dictionary = {}) -> Dictionary:
	var home: Array = World.roster_of(world, home_id)
	var away: Array = World.roster_of(world, away_id)
	if home.is_empty() or away.is_empty():
		return {"ok": false, "error": "로스터가 비었다: %s(%d) %s(%d)"
			% [home_id, home.size(), away_id, away.size()],
			"result": {}, "pitches": 0}

	# ⚠ **팀마다 자기 경기 순번을 쓴다.** 하나로 쓰면 홈·원정의 로테이션이
	# 같이 돌아서 늘 같은 짝이 붙는다
	var league_id: String = p.get("league_id", "")
	var hp: Dictionary = starter_of(home, league_id, int(p.get("home_game_no", 0)))
	var ap: Dictionary = starter_of(away, league_id, int(p.get("away_game_no", 0)))
	if hp.is_empty() or ap.is_empty():
		return {"ok": false, "error": "선발 투수가 없다", "result": {}, "pitches": 0}

	var state: Dictionary = _make_state(home, away, hp, ap)
	var out: Dictionary = GameLoop.play(state, rng, MatchDay._decide)
	_to_report_shape(out["state"])

	return {
		"ok": true, "error": "",
		"result": MatchReport.to_match_result(out["state"], home_id, away_id),
		"pitches": out["pitches"],
	}


## 엔진이 쌓은 모양 → 어댑터가 읽는 모양.
##
## ⚠ **여기가 없어서 리그 성적표가 통째로 비었다.** 엔진은 `batter_accum`
## (선수 id 사전)과 팀별 투수 줄에 쌓는데, `MatchReport`는 `*_bat_lines`·
## `*_pitcher_lines` 배열을 읽는다. **모듈 검사는 양쪽 다 통과했다** —
## 각자 자기 모양으로 손수 만든 사전을 봤기 때문이다.
##
## ⚠ 투수 교체가 붙으면 엔진이 여러 줄을 쌓게 되고, 그때 이 옮기기는
## 배열을 그대로 넘기는 것으로 줄어든다
static func _to_report_shape(state: Dictionary) -> void:
	state["my_pitcher_lines"] = [state.get("home_pitcher_line", {})]
	state["opponent_pitcher_lines"] = [state.get("away_pitcher_line", {})]

	# ⚠ **홈·원정을 안 가른다.** `MatchReport`가 두 배열을 훑어 하나로 합치므로
	# 어디에 넣든 같다 — 가르는 줄을 두면 "여기서 갈린다"고 오해하게 된다.
	# 갈라야 할 일이 생기면(승패 결정 등) 그때 넣는다
	var lines: Array = []
	for pid in state.get("batter_accum", {}):
		var acc: Dictionary = state["batter_accum"][pid].duplicate()
		acc["player_id"] = pid
		lines.append(acc)
	state["home_bat_lines"] = lines
	state["away_bat_lines"] = []


static func _make_state(home: Array, away: Array,
		hp: Dictionary, ap: Dictionary) -> Dictionary:
	var home_lineup: Array = []
	for p in _lineup(home):
		home_lineup.append(_batter(p))
	var away_lineup: Array = []
	for p in _lineup(away):
		away_lineup.append(_batter(p))

	var zeros: Array = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	return {
		"inning": 1, "half": "top", "outs": 0,
		"count": {"balls": 0, "strikes": 0},
		"runners": {"first": {}, "second": {}, "third": {}},
		"score": {"home": 0, "away": 0},
		"inning_scores": {"home": zeros.duplicate(), "away": zeros.duplicate()},
		"inning_limit": 9, "is_finished": false, "pitch_count": 0,
		"home_lineup": home_lineup, "away_lineup": away_lineup,
		"home_index": 0, "away_index": 0,
		"home_pitcher": _pitcher(hp), "away_pitcher": _pitcher(ap),
		"stamina": 82.0, "mental": 60.0, "grade": 3,
		"fielders": [], "last_pitch_types": [],
		"weather": "sunny", "park": "neutral",
		"defense": {"errors": 0, "assists": 0, "throw_outs": 0, "throw_safes": 0},
		# ⚠ **투수 줄을 팀별로 둔다.** 하나로 두면 양 팀 성적이 섞인다
		"home_pitcher_line": {"player_id": hp.get("id", ""),
			"outs": 0, "pc": 0, "k": 0, "bb": 0, "h": 0, "er": 0},
		"away_pitcher_line": {"player_id": ap.get("id", ""),
			"outs": 0, "pc": 0, "k": 0, "bb": 0, "h": 0, "er": 0},
		"batter_accum": {}, "logs": [],
	}


## 그날 남은 경기를 다 돌리고 결과를 **일정에 되꽂는다**. 돌린 경기 수를 준다.
##
## ⚠ **이미 치른 경기는 건너뛴다.** 다시 돌리면 순위표에 승패가 두 번 들어간다
static func play_day(state: Dictionary, day: int, rng: RandomNumberGenerator) -> int:
	var world: Dictionary = state.get("world", {})
	var counts: Dictionary = team_game_counts(state, day)
	var n: int = 0
	for g in state.get("schedule", []):
		if int(g.get("day", -1)) != day or g.get("result", null) != null:
			continue
		var home: String = g.get("home", "")
		var away: String = g.get("away", "")
		var out: Dictionary = play(world, home, away, rng, {
			"league_id": g.get("league_id", ""),
			"home_game_no": int(counts.get(home, 0)),
			"away_game_no": int(counts.get(away, 0)),
		})
		if not out["ok"]:
			continue
		g["result"] = out["result"]
		# 같은 날 같은 팀이 두 경기를 하는 일정이 없으므로 여기서 순번을
		# 더 세지 않는다 — 더블헤더가 생기면 그때 붙인다
		n += 1
	return n


## 그날 **전까지** 각 팀이 몇 경기를 치렀나.
##
## ⚠ **인덱스를 상태에 안 들고 매번 센다.** 들고 있으면 저장·불러오기와
## 어긋나고, 하루 진행과 여러 날 진행이 달라진다 — 02가 그 인덱스 때문에
## 인자 자리가 밀린 결함을 겪었다
static func team_game_counts(state: Dictionary, before_day: int) -> Dictionary:
	var out: Dictionary = {}
	for g in state.get("schedule", []):
		if int(g.get("day", -1)) >= before_day:
			continue
		if g.get("result", null) == null:
			continue
		var h: String = g.get("home", "")
		var a: String = g.get("away", "")
		out[h] = int(out.get(h, 0)) + 1
		out[a] = int(out.get(a, 0)) + 1
	return out


## 이 경기에 주인공이 나오나. **일정의 `is_protagonist_game`이 이걸로 정해진다**
##
## ⚠ **로테이션에 못 들어도 나온다.** 불펜으로 나온다 — 안 그러면 주인공이
## 시즌 내내 한 경기도 못 던진다. 실제로 그 상태가 나왔다(고교 20경기 중 0).
##
## ⚠ **02는 불펜 판정에 `thread_rng()`를 썼다.** 같은 세이브·같은 시드라도
## 결과가 매번 달랐다 — 여기서는 경기 id로 시드를 만든다
static func is_my_start(world: Dictionary, game: Dictionary, my_id: String,
		my_team: String, game_no: int, seed_value: int = 0,
		role: String = "RP") -> bool:
	var home: String = game.get("home", "")
	var away: String = game.get("away", "")
	if home != my_team and away != my_team:
		return false
	var roster: Array = World.roster_of(world, my_team)
	if roster.is_empty():
		return false

	var league_id: String = game.get("league_id", "")
	if Rotation.starter_at(Rotation.build(roster, league_id), game_no) == my_id:
		return true

	# ⚠ **선발은 로테이션 차례에만 나온다.** 보직을 안 보면 선발이 쉬는
	# 날에도 불펜으로 나와서 등판이 부푼다 — 실측 20경기 중 17번(로테이션은 7번)
	if role != "RP":
		return false

	return Rotation.reliever_would_pitch({
		"role": Rotation.DEFAULT_RELIEF_ROLE,
		"roll": Rng.new(seed_value).value_for(["relief", game.get("id", "")]),
	})
