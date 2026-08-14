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
		# ⚠ **투수 기록을 나눈다.** 한 줄에 쌓으면 양 팀 성적이 섞여 자책점이
		# 두 배가 되고 상대 삼진이 내 것이 된다. 교체가 붙은 뒤로는 **투수별**로
		# 나뉜다 — 구원의 자책점이 선발 것이 되면 안 된다
		bind_pitcher(s, before_half)

		var out: Dictionary = PitchStep.step(s, decide.call(s, rng), rng)
		s = out["state"]
		pitches += 1

		# 타석이 끝났으면 다음 타자로. **투구 전 카운트로 삼진을 가린다**
		var was_two_strikes: bool = int(before_count.get("strikes", 0)) == 2
		var is_k: bool = (out["code"] == "STRIKE_SWING" or out["code"] == "STRIKE_LOOK") \
			and was_two_strikes
		if is_k or MatchResult.is_at_bat_over(out["code"]):
			advance_lineup(s, before_half)
			# ⚠ **타석이 끝난 뒤에 바꾼다.** 타석 도중에 바꾸면 그 타석의
			# 기록이 두 투수에게 갈린다 — 02도 같은 자리다
			switch_if_needed(s, before_half)

	return {"state": s, "pitches": pitches}


# ── 투수 교체 (M2-6) ──────────────────────────────────────────

## 이닝 반쪽마다 **지금 던지는 투수와 그의 줄**을 상태에 꽂는다.
##
## ⚠ **큐가 없으면 예전 경로로 떨어진다** — 조각 검사가 그대로 돈다.
## 큐가 있으면 줄이 **투수별**이라 구원의 자책점이 선발 것이 안 된다
static func bind_pitcher(state: Dictionary, half: String) -> void:
	var side: String = "home" if half == "top" else "away"
	var qkey: String = "%s_queue" % side

	if not state.has(qkey):
		var team_key: String = "%s_pitcher_line" % side
		state["pitcher_line_key"] = team_key if state.has(team_key) else "pitcher_line"
		return

	var q: Dictionary = state[qkey]
	var i: int = int(q.get("current", 0))
	var pitchers: Array = q.get("pitchers", [])
	var lines: Array = q.get("lines", [])
	if i >= pitchers.size() or i >= lines.size():
		return

	state["pitcher"] = pitchers[i]
	state["%s_pitcher" % side] = pitchers[i]
	# 배열 안 사전이라 참조로 쌓인다 — 여기 꽂으면 기록이 그 투수 것이 된다
	state["active_pitcher_line"] = lines[i]
	state["pitcher_line_key"] = "active_pitcher_line"


## 타석이 끝났다 — 바꿀 때가 됐으면 바꾼다. 바꿨으면 참.
##
## 원본: `match_engine.rs`의 `switch_pitcher_if_needed`
##
## ⚠ **구원 스태미나를 100으로 리셋하면 안 된다.** 자기 능력과 무관하게
## 100으로 들어와서 교체하는 팀이 압도적으로 유리해졌다 — 02 실측
## 주인공 완투 ERA 3.83 vs 투수진 3명 교체 1.65
static func switch_if_needed(state: Dictionary, half: String) -> bool:
	var side: String = "home" if half == "top" else "away"
	var qkey: String = "%s_queue" % side
	if not state.has(qkey):
		return false

	var q: Dictionary = state[qkey]
	var cur: int = int(q.get("current", 0))
	var lines: Array = q.get("lines", [])
	# ⚠ **아웃을 줄에서 읽는다.** 따로 세면 그게 두 번째 정본이 되고,
	# 교체 뒤 새 투수 줄이 0에서 시작하는 것과 자동으로 맞아떨어진다
	if cur < lines.size():
		q["outs_by_current"] = int(lines[cur].get("outs", 0))

	if not PitcherSwitch.should_switch(q):
		return false

	var next_q: Dictionary = PitcherSwitch.advance(q)
	state[qkey] = next_q

	var i: int = int(next_q.get("current", 0))
	var pitchers: Array = next_q.get("pitchers", [])
	if i >= pitchers.size():
		return false

	var p: Dictionary = pitchers[i]
	state["%s_pitcher" % side] = p
	state["%s_stamina" % side] = PitcherSwitch.relief_start_stamina(
		float(p.get("stamina_cap", 50.0)))
	state["%s_mental" % side] = RELIEF_START_MENTAL

	var logs: Array = state.get("logs", [])
	logs.append("[%d회] 투수 교체 — %s" % [int(state.get("inning", 1)),
		p.get("name", p.get("id", "불펜"))])
	state["logs"] = logs
	return true


## 구원이 들어오는 멘탈. 선발 시작값과 같다
const RELIEF_START_MENTAL: float = 60.0
