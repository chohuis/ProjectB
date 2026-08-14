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


static func _starter(players: Array) -> Dictionary:
	var best: Dictionary = {}
	for p in players:
		if not PlayerGen.is_pitcher(p.get("position", "")):
			continue
		if best.is_empty() or float(p["pitching"]["ovr"]) > float(best["pitching"]["ovr"]):
			best = p
	return best


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
		rng: RandomNumberGenerator) -> Dictionary:
	var home: Array = World.roster_of(world, home_id)
	var away: Array = World.roster_of(world, away_id)
	if home.is_empty() or away.is_empty():
		return {"ok": false, "error": "로스터가 비었다: %s(%d) %s(%d)"
			% [home_id, home.size(), away_id, away.size()],
			"result": {}, "pitches": 0}

	var hp: Dictionary = _starter(home)
	var ap: Dictionary = _starter(away)
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
	var n: int = 0
	for g in state.get("schedule", []):
		if int(g.get("day", -1)) != day or g.get("result", null) != null:
			continue
		var out: Dictionary = play(world, g.get("home", ""), g.get("away", ""), rng)
		if not out["ok"]:
			continue
		g["result"] = out["result"]
		n += 1
	return n
