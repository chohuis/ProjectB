extends RefCounted
class_name LiveMatch

## 주인공 경기를 **한 구씩** 돌린다 — M7-6e1.
##
## ⚠ **`MatchDay`와 같은 경기를 만든다.** 자동 시뮬과 직접 던지기가 다른
## 상태에서 시작하면, 화면에서 본 경기와 기록에 남는 경기가 달라진다.
##
## ⚠ **여기는 화면을 모른다.** 상태와 씨앗만 받는다 — 그래야 검사가
## 화면 없이 부를 수 있다.


## 주인공 경기 하나를 연다. `{ok, error, state, ctx, rng}`
static func open(game_state: Dictionary, game: Dictionary) -> Dictionary:
	var world: Dictionary = game_state.get("world", {})
	var home_id: String = game.get("home", "")
	var away_id: String = game.get("away", "")

	var home: Array = World.roster_of(world, home_id)
	var away: Array = World.roster_of(world, away_id)
	if home.is_empty() or away.is_empty():
		return {"ok": false, "error": "로스터가 비었다", "state": {}, "ctx": {}}

	var league_id: String = game.get("league_id", "")
	var counts: Dictionary = MatchDay.team_game_counts(game_state, int(game.get("day", 0)))
	var hp: Dictionary = MatchDay.starter_of(home, league_id, int(counts.get(home_id, 0)))
	var ap: Dictionary = MatchDay.starter_of(away, league_id, int(counts.get(away_id, 0)))
	if hp.is_empty() or ap.is_empty():
		return {"ok": false, "error": "선발 투수가 없다", "state": {}, "ctx": {}}

	var names: Dictionary = {}
	for p in home + away:
		names[p.get("id", "")] = p.get("name", p.get("id", ""))

	var state: Dictionary = MatchDay._make_state(home, away, hp, ap)
	# ⚠ **첫 투구 전에도 누구 대 누구인지 보여야 한다.** `GameLoop`은 매
	# 투구마다 세팅하므로 던지기 전엔 비어 있다 — 화면이 빈칸으로 뜬다
	state["batter"] = GameLoop.current_batter(state)
	state["pitcher"] = GameLoop.current_pitcher(state)

	var team_names: Dictionary = game_state.get("team_names", {})
	return {
		"ok": true, "error": "",
		"state": state,
		"ctx": {
			"names": names,
			# ⚠ **주인공이 마운드에 있을 때만 공을 고른다.** 상대가 던질 땐
			# 고를 게 없는데 선택 화면이 뜨면 내가 던지는 줄 안다
			"my_id": String(game_state.get("protagonist", {}).get("id", "")),
			"me": game_state.get("protagonist", {}),
			# 내 팀이 홈인가 원정인가 — 화면이 어느 투수 줄을 보여줄지 정한다
			"my_side": "home" if home_id == game_state.get("protagonist", {})
				.get("team_id", "") else "away",
			"home_name": team_names.get(home_id, home_id),
			"away_name": team_names.get(away_id, away_id),
			# ⚠ **홈 팀 구장에서 경기한다.** 02는 프로 구장 하나가 하드코딩이라
			# 고교 경기도 대학 경기도 전부 프로 구장에서 열렸다
			"stadium_id": String(World.team_field(world, home_id, "stadium", "")),
			"log": [],
		},
		# ⚠ **경기 id로 씨앗을 만든다.** 자동 시뮬과 같은 규칙이라
		# 직접 던지다 중간에 자동으로 넘겨도 흐름이 안 어긋난다
		"seed": Rng.mix([game_state.get("seed", 0), "game", game.get("id", "")]),
	}


## 한 구. 상태를 **제자리에서** 고치고 무슨 일이 있었는지 돌려준다
##
## `decision`이 비면 자동으로 고른다 — **그래야 자동 시뮬과 같은 경기가 된다.**
## 사용자가 구종·코스를 고르면 당연히 달라지는데, 그건 사용자가 고른 결과다
static func pitch(state: Dictionary, ctx: Dictionary, rng: RandomNumberGenerator,
		decision: Dictionary = {}) -> String:
	if state.get("is_finished", false):
		return "GAME_OVER"

	# ⚠ **`GameLoop`과 같은 순서로 준비한다.** 여기서 빠뜨리면 화면에서 던진
	# 경기와 자동으로 돌린 경기가 달라진다 — 조용히 갈린다
	var before_half: String = state.get("half", "top")
	var before_count: Dictionary = state.get("count", {}).duplicate()
	state["batter"] = GameLoop.current_batter(state)
	state["pitcher"] = GameLoop.current_pitcher(state)
	state["pitcher_line_key"] = "home_pitcher_line" if before_half == "top" \
		else "away_pitcher_line"

	var d: Dictionary = decision if not decision.is_empty() \
		else MatchDay._decide(state, rng)
	var out: Dictionary = PitchStep.step(state, d, rng)
	var code: String = out["code"]

	# 타석이 끝났으면 다음 타자로. **투구 전 카운트로 삼진을 가린다**
	var was_two: bool = int(before_count.get("strikes", 0)) == 2
	var is_k: bool = (code == "STRIKE_SWING" or code == "STRIKE_LOOK") and was_two
	if is_k or MatchResult.is_at_bat_over(code):
		GameLoop.advance_lineup(state, before_half)

	var log: Array = ctx.get("log", [])
	# 무슨 공을 던져 어떻게 됐는지 — 구종을 빼면 왜 맞았는지 알 수가 없다
	log.append("%d구 %s %s" % [int(state.get("pitch_count", 0)),
		PitchVm.pitch_label(d.get("pitch_type", "")), MatchVm.code_label(code)])
	ctx["log"] = log
	return code


## 남은 이닝을 끝까지. 돌린 투구 수를 준다
static func finish(state: Dictionary, ctx: Dictionary, rng: RandomNumberGenerator) -> int:
	var n: int = 0
	while not state.get("is_finished", false) and n < GameLoop.MAX_PITCHES:
		if int(state.get("inning", 1)) > GameLoop.TIE_INNING_LIMIT:
			state["is_finished"] = true
			break
		pitch(state, ctx, rng)
		n += 1
	return n


## 끝난 경기를 리그가 먹는 모양으로
static func to_result(state: Dictionary, home_id: String, away_id: String) -> Dictionary:
	MatchDay._to_report_shape(state)
	return MatchReport.to_match_result(state, home_id, away_id)
