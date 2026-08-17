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
## ⚠ **야수를 먼저 세우고, 모자라면 투수로 채운다** (F-5b).
## 02 `rosterEngine.ts:406-423` 그대로다.
##
## ⚠ **예전엔 "정렬이 같은 일을 한다"고 안 걸렀는데 틀렸다.** 투수의 타격이
## 야수보다 낮다는 전제가 진짜 세계에선 안 맞는다 — **112팀 전부** 타순에
## 투수가 끼었고 심하면 다섯 명이었다. 검사는 통과했는데, 가짜 로스터가
## 투수 타격 20 · 야수 40+이라 정렬만으로 걸러졌기 때문이다.
## 브리핑(F-5)이 화면에 4번 RP를 띄워서 눈에 보였다.
##
## ⚠ **모자랄 때 채우는 것은 필요하다.** 여덟 명짜리 타순으로 돌면 타석이
## 9/8배로 부풀어 **능력치가 아니라 출전량이 성적을 만든다** — 02가 실측으로
## 겪었다(경기당 7.1타석, 정상 4.7). 실제 야구도 야수가 모자라면 투수를
## 세운다
static func _lineup(players: Array) -> Array:
	var fielders: Array = []
	var pitchers: Array = []
	for p in players:
		if PlayerGen.is_pitcher(String(p.get("position", ""))):
			pitchers.append(p)
		else:
			fielders.append(p)

	var by_batting := func(a, b) -> bool:
		return float(a["batting"]["ovr"]) > float(b["batting"]["ovr"])
	fielders.sort_custom(by_batting)
	if fielders.size() >= LINEUP_SIZE:
		return fielders.slice(0, LINEUP_SIZE)

	# 타격이 나은 투수부터 채운다 — 아무나 세우면 비상 상황이 더 나빠진다
	pitchers.sort_custom(by_batting)
	var out: Array = fielders
	out.append_array(pitchers.slice(0, LINEUP_SIZE - fielders.size()))
	return out


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
		# ⚠ **OVR과 포지션을 싣는다** (F-5). 브리핑이 "어떤 타자인가"를
		# 말하려면 필요하다 — 없으면 화면에 OVR이 전부 0이고 포지션이 빈칸이다
		"ovr": b.get("ovr", 0.0),
		"position": p.get("position", ""),
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
		# ⚠ **OVR과 보직을 싣는다** (F-5). 브리핑이 상대 선발을 소개하려면
		# 필요하다 — 없으면 "OVR 0"으로 뜬다
		"ovr": q.get("ovr", 0.0),
		"position": p.get("position", ""),
		# ⚠ **구종 배열을 싣는다.** 안 실으면 배운 구종이 경기에 안 나오고
		# 숙련도가 결과에 안 닿는다 — 02가 그 상태였다.
		# NPC는 아직 배열이 없어서 `PitchStep`의 기준값(3)으로 굴러간다
		"pitches": p.get("pitches", []),
	}


## NPC 경기의 투구 선택 — **`PitchAi`가 정본이다.** P-1.
##
## ⚠ **여기 있던 것은 벤치마크용 자리표시자였다.** `GameBench._decide`와 같은
## 코드였고 주석도 "성능을 재는 게 목적이라 전술은 안 넣는다"였는데, 그게
## **리그 경기 수천 개**를 돌렸다. `OUT_OF_ZONE_RATE`가 0이라 존 밖을 한 번도
## 안 던졌고 **9이닝당 볼넷이 0.0**이었다(02는 3.3). 볼넷으로 끝날 타석이
## 삼진과 인플레이로 흘러가 삼진율·타율까지 같이 밀렸다.
##
## ⚠ **상태를 버리고 있었다.** 인자가 `(_state, rng)`인데 통째로 안 썼다 —
## 카운트도 투수도 안 보니 볼 3개든 스트라이크 2개든 같은 공이었고,
## **배운 구종은 마운드에 안 나왔다.**
##
## ⚠ **주인공 경기는 사람이 고른다**(`LiveMatch`). 여기는 나머지 수천 경기가
## 쓰는 자리다 — 여기가 야구가 아니면 리그 성적표 전체가 야구가 아니다
static func _decide(state: Dictionary, rng) -> Dictionary:
	return PitchAi.decide(state, rng)


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

	# ⚠ **오늘 등판하기로 한 사람을 불펜 앞에 세운다.** 안 넘기면 "오늘 등판"이
	# 화면에만 뜨고 실제로는 안 나온다
	# ⚠ **큐 전용 난수를 따로 쓴다.** 경기 난수기로 큐를 만들면 그만큼 흐름이
	# 밀려서 **손으로 던진 경기와 자동 시뮬이 갈린다** — 실제로 갈렸다.
	# 난수 흐름을 하나로 두지 않는다는 규칙이 여기서도 그대로다
	var queue_rng := RandomNumberGenerator.new()
	queue_rng.seed = Rng.mix(["queue", home_id, away_id,
		int(p.get("home_game_no", 0)), int(p.get("away_game_no", 0))])
	var state: Dictionary = _make_state(home, away, hp, ap, queue_rng,
		String(p.get("home_relief", "")), String(p.get("away_relief", "")))
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
	# 큐가 있으면 **투수별 줄이 거기 다 있다.** 없으면 예전처럼 팀 줄 하나 —
	# 조각 검사가 그대로 돈다
	state["my_pitcher_lines"] = state.get("home_queue", {}).get("lines",
		[state.get("home_pitcher_line", {})])
	state["opponent_pitcher_lines"] = state.get("away_queue", {}).get("lines",
		[state.get("away_pitcher_line", {})])

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


## 난수를 안 받은 호출부(조각 검사)용. **경기 결과가 흔들리면 안 되므로
## 고정 씨앗이다** — 진짜 경기는 자기 난수기를 넘긴다
static func _fixed_rng() -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = 20260814
	return r


## 그 팀의 투수진. **선발이 맨 앞이고 나머지는 능력 순**이다.
##
## ⚠ **선발을 빼먹으면 안 된다.** 큐의 0번이 마운드에 서는 사람이라
## 어긋나면 경기 시작부터 다른 사람이 던진다
static func bullpen_of(roster: Array, starter: Dictionary,
		first_relief: String = "") -> Array:
	var out: Array = [starter]
	var rest: Array = []
	var wanted: Dictionary = {}
	for p in roster:
		if p.get("id", "") == starter.get("id", ""):
			continue
		if not PlayerGen.is_pitcher(p.get("position", "")):
			continue
		if p.get("id", "") == first_relief:
			wanted = p
			continue
		rest.append(p)
	rest.sort_custom(func(a, b) -> bool:
		return float(a.get("pitching", {}).get("ovr", 0.0)) \
			> float(b.get("pitching", {}).get("ovr", 0.0)))

	# ⚠ **오늘 등판하기로 한 사람을 맨 앞에 둔다.** 능력 순으로만 세우면
	# 주인공(OVR 51)이 뒤로 밀려 **화면엔 "오늘 등판"이 뜨는데 실제로는
	# 시즌 내내 한 경기도 안 나온다** — 실측 9경기 중 0경기였다
	if not wanted.is_empty():
		out.append(wanted)
		out.append_array(rest.slice(0, maxi(BULLPEN_SIZE - 1, 0)))
	else:
		out.append_array(rest.slice(0, BULLPEN_SIZE))
	return out


## 불펜에 몇 명까지 태우나. 02는 로스터 전체를 넣지만 그러면 큐가 30명이 되고
## `queue_max_outs`가 그만큼 난수를 뽑는다 — 실제로 쓰이는 건 앞의 몇이다
const BULLPEN_SIZE: int = 6


## 투수 큐 하나. `PitcherSwitch`가 먹는 모양이다
static func _queue_of(roster: Array, starter: Dictionary, rng,
		first_relief: String = "") -> Dictionary:
	var pitchers: Array = bullpen_of(roster, starter, first_relief)
	var mapped: Array = []
	var lines: Array = []
	for p in pitchers:
		mapped.append(_pitcher(p))
		lines.append({"player_id": p.get("id", ""),
			"outs": 0, "pc": 0, "k": 0, "bb": 0, "h": 0, "er": 0})
	return {
		"pitchers": mapped,
		"current": 0,
		"max_outs": PitcherSwitch.queue_max_outs(mapped, rng),
		"outs_by_current": 0,
		"lines": lines,
		"pitch_limit": 0.0,
	}


static func _make_state(home: Array, away: Array,
		hp: Dictionary, ap: Dictionary, rng = null,
		home_relief: String = "", away_relief: String = "") -> Dictionary:
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

		# ⚠ **스태미나를 팀별로 둔다.** 하나로 두면 한 팀 투수가 지칠 때
		# 상대 투수도 같이 지친다 — 02는 `npc_pitcher_stamina.my`/`.opponent`다.
		# 시작값 82는 02 그대로이고, 구원도 같은 기준으로 들어온다
		"home_stamina": 82.0, "away_stamina": 82.0,
		"home_mental": 60.0, "away_mental": 60.0,
		# 조각 검사와 옛 경로가 아직 읽는다 — 팀별 값이 없으면 여기로 떨어진다
		"stamina": 82.0, "mental": 60.0, "grade": 3,

		# 투수진. **선발이 0번**이고 교체는 여기서 다음 사람을 꺼낸다
		"home_queue": _queue_of(home, hp, rng if rng != null else _fixed_rng(), home_relief),
		"away_queue": _queue_of(away, ap, rng if rng != null else _fixed_rng(), away_relief),
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
		# ⚠ **오늘 등판하기로 한 주인공을 불펜 앞에 세운다.** 안 넘기면
		# "오늘 등판"이 화면에만 뜨고 실제로는 안 나온다
		var relief: String = ""
		if g.get("is_protagonist_game", false):
			relief = String(state.get("protagonist", {}).get("id", ""))
		var my_team: String = String(state.get("protagonist", {}).get("team_id", ""))
		var out: Dictionary = play(world, home, away, rng, {
			"league_id": g.get("league_id", ""),
			"home_game_no": int(counts.get(home, 0)),
			"away_game_no": int(counts.get(away, 0)),
			"home_relief": relief if home == my_team else "",
			"away_relief": relief if away == my_team else "",
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
