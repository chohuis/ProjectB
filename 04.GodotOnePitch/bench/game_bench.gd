extends RefCounted
class_name GameBench

## 진짜 엔진으로 경기를 돌려 성능과 야구다움을 같이 본다.
##
## ⚠ **P0 게이트는 던져버릴 뼈대로 잰 값이다.** 그건 속도만 보려고 만든
## 것이고 지금 엔진은 규칙이 훨씬 두껍다. **다시 재지 않으면 그 0.659초는
## 아무 뜻이 없다.**
##
## ⚠ 빠르기만 하고 야구가 아니면 의미 없다 — P0에서 실제로 겪었다.
## 첫 벤치가 0.805초로 더 빨랐는데 경기당 득점이 0.89였다.


## 기준 — 한 시즌(2,124경기)을 이 안에 끝내야 한다
const SEASON_GAMES: int = 2124
const GATE_SECONDS: float = 2.0


static func _pitcher(rng: RandomNumberGenerator, base: float) -> Dictionary:
	return {
		"command": base + rng.randf_range(-5.0, 5.0),
		"velocity": base + rng.randf_range(-5.0, 5.0),
		"control": base + rng.randf_range(-5.0, 5.0),
		"movement": base + rng.randf_range(-5.0, 5.0),
		"clutch": 50.0, "mental_resil": 50.0, "hold_runners": 50.0,
		"stamina_cap": 60.0 + rng.randf_range(-10.0, 15.0),
	}


static func _batter(rng: RandomNumberGenerator, idx: int, side: String) -> Dictionary:
	var base: float = 68.0 + rng.randf_range(-8.0, 8.0)
	return {
		"id": "%s%d" % [side, idx],
		"contact": base + rng.randf_range(-6.0, 6.0),
		"power": base + rng.randf_range(-8.0, 8.0),
		"eye": base + rng.randf_range(-6.0, 6.0),
		"discipline": base + rng.randf_range(-6.0, 6.0),
		"speed": base + rng.randf_range(-8.0, 8.0),
		"instinct": 70.0, "batting_clutch": 50.0,
	}


static func make_state(rng: RandomNumberGenerator) -> Dictionary:
	var home: Array = []
	var away: Array = []
	for i in 9:
		home.append(_batter(rng, i, "H"))
		away.append(_batter(rng, i, "A"))
	var zeros: Array = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	return {
		"inning": 1, "half": "top", "outs": 0,
		"count": {"balls": 0, "strikes": 0},
		"runners": {"first": {}, "second": {}, "third": {}},
		"score": {"home": 0, "away": 0},
		"inning_scores": {"home": zeros.duplicate(), "away": zeros.duplicate()},
		"inning_limit": 9, "is_finished": false, "pitch_count": 0,
		"home_lineup": home, "away_lineup": away, "home_index": 0, "away_index": 0,
		"home_pitcher": _pitcher(rng, 72.0), "away_pitcher": _pitcher(rng, 72.0),
		"stamina": 82.0, "mental": 60.0, "grade": 3,
		"fielders": [], "last_pitch_types": [],
		"weather": "sunny", "park": "neutral",
		"defense": {"errors": 0, "assists": 0, "throw_outs": 0, "throw_safes": 0},
		"pitcher_line": {"outs": 0, "pc": 0, "k": 0, "bb": 0, "h": 0, "er": 0},
		"batter_accum": {}, "logs": [],
	}


## 아주 단순한 투구 선택 — 성능을 재는 게 목적이라 전술은 안 넣는다
static func _decide(_state: Dictionary, rng) -> Dictionary:
	return {
		"pitch_type": "fastball" if rng.randf() < 0.55 else "slider",
		"location": 1 + int(rng.randf() * 9.0),
		"strategy": "balanced", "power": "normal",
	}


func run(log_line: Callable, fail: Callable, games: int, seed_value: int) -> int:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value

	# 예열 — 첫 호출은 스크립트 컴파일이 섞인다
	for i in 5:
		GameLoop.play(GameBench.make_state(rng), rng, GameBench._decide)

	var t0: int = Time.get_ticks_usec()
	var pitches: int = 0
	var runs: int = 0
	var unfinished: int = 0
	for g in games:
		var out: Dictionary = GameLoop.play(GameBench.make_state(rng), rng, GameBench._decide)
		pitches += int(out["pitches"])
		var sc: Dictionary = out["state"]["score"]
		runs += int(sc["home"]) + int(sc["away"])
		if int(out["pitches"]) >= GameLoop.MAX_PITCHES:
			unfinished += 1
	var sec: float = (Time.get_ticks_usec() - t0) / 1_000_000.0

	var per_game: float = float(pitches) / float(games)
	var runs_per_game: float = float(runs) / float(games)
	var season: float = sec / float(games) * float(SEASON_GAMES)

	log_line.call("  %d경기  %.3f초  %d 투구/초" % [games, sec, int(pitches / maxf(sec, 0.0001))])
	log_line.call("  경기당 투구 %.1f · 득점 %.2f" % [per_game, runs_per_game])
	log_line.call("  한 시즌(%d경기) 환산 %.3f초  (기준 %.1f초)" % [SEASON_GAMES, season, GATE_SECONDS])

	if unfinished > 0:
		fail.call("상한에 걸려 안 끝난 경기 %d개 — 종료 조건을 다시 본다" % unfinished)
	# ⚠ 빠르기만 하고 야구가 아니면 의미 없다
	if per_game < 150.0 or per_game > 400.0:
		fail.call("경기당 투구 %.1f — 야구가 아니다 (150~400)" % per_game)
	if runs_per_game < 4.0 or runs_per_game > 20.0:
		fail.call("경기당 득점 %.2f — 야구가 아니다 (4~20)" % runs_per_game)
	if season > GATE_SECONDS:
		fail.call("한 시즌 %.3f초 — 게이트 %.1f초를 넘었다" % [season, GATE_SECONDS])
	return 0
