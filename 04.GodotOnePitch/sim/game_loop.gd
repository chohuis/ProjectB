extends RefCounted
class_name GameLoop

## 경기 하나를 끝까지 돌린다. M2-7.
##
## 원본: `packages/engine-native/src/match_engine.rs`의 `auto_simulate_to_game_end`
##
## ⚠ **상한을 둔다.** 동점이면 경기가 스스로 안 끝나므로(연장 조건이
## `home != away`) 상한이 없으면 무한 루프다. 세이브 하나 때문에 게임이
## 멈추는 것보다 이상한 경기 하나가 낫다.


## 한 경기 최대 투구 수. 실제 경기가 250~330구다
const MAX_PITCHES: int = 2000
## 무승부로 끊는 이닝 — KBO 12회
const TIE_INNING_LIMIT: int = 12


## 타순에서 지금 타자를 뽑는다
static func current_batter(state: Dictionary) -> Dictionary:
	var is_top: bool = state.get("half", "top") == "top"
	var lineup: Array = state.get("away_lineup", []) if is_top else state.get("home_lineup", [])
	if lineup.is_empty():
		return {}
	var idx: int = int(state.get("away_index", 0)) if is_top else int(state.get("home_index", 0))
	return lineup[idx % lineup.size()]


## 타석이 끝났으면 타순을 넘긴다. **초·말을 각각 센다**
static func advance_lineup(state: Dictionary, before_half: String) -> void:
	if before_half == "top":
		var away: Array = state.get("away_lineup", [])
		if not away.is_empty():
			state["away_index"] = (int(state.get("away_index", 0)) + 1) % away.size()
	else:
		var home: Array = state.get("home_lineup", [])
		if not home.is_empty():
			state["home_index"] = (int(state.get("home_index", 0)) + 1) % home.size()


## 지금 마운드에 선 투수 — 수비 중인 쪽이다
static func current_pitcher(state: Dictionary) -> Dictionary:
	# 초에는 홈팀이 수비한다
	var key: String = "home_pitcher" if state.get("half", "top") == "top" else "away_pitcher"
	return state.get(key, {})


## 경기를 끝까지 돌린다. `{state, pitches}`
static func play(state: Dictionary, rng, decide: Callable) -> Dictionary:
	var s: Dictionary = state
	var pitches: int = 0

	while not s.get("is_finished", false) and pitches < MAX_PITCHES:
		# 무승부로 끊는다 — 안 그러면 동점 경기가 영원히 안 끝난다
		if int(s.get("inning", 1)) > TIE_INNING_LIMIT:
			s = s.duplicate(true)
			s["is_finished"] = true
			break

		var before_half: String = s.get("half", "top")
		var before_count: Dictionary = s.get("count", {}).duplicate()
		s["batter"] = current_batter(s)
		s["pitcher"] = current_pitcher(s)
		# ⚠ **투수 기록을 팀별로 나눈다.** 한 줄에 쌓으면 양 팀 성적이 섞여
		# 자책점이 두 배가 되고 상대 삼진이 내 것이 된다. 초에는 홈 투수가
		# 던진다.
		#
		# 그 줄이 상태에 없으면 예전처럼 `pitcher_line` 하나로 떨어진다 —
		# 조각 검사가 그대로 돈다
		var side_key: String = "home_pitcher_line" if before_half == "top" \
			else "away_pitcher_line"
		s["pitcher_line_key"] = side_key if s.has(side_key) else "pitcher_line"

		var out: Dictionary = PitchStep.step(s, decide.call(s, rng), rng)
		s = out["state"]
		pitches += 1

		# 타석이 끝났으면 다음 타자로. **투구 전 카운트로 삼진을 가린다**
		var was_two_strikes: bool = int(before_count.get("strikes", 0)) == 2
		var is_k: bool = (out["code"] == "STRIKE_SWING" or out["code"] == "STRIKE_LOOK") \
			and was_two_strikes
		if is_k or MatchResult.is_at_bat_over(out["code"]):
			advance_lineup(s, before_half)

	return {"state": s, "pitches": pitches}
