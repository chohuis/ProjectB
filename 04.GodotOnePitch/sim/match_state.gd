extends RefCounted
class_name MatchState

## 경기 상태 — 이닝 전환 · 득점 기록 · 종료 판정. M2-5a.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##
## 상태는 사전이다:
##   inning · half("top"/"bottom") · outs · count{balls,strikes} · runners
##   score{home,away} · inning_scores{home[],away[]} · inning_limit · is_finished
##
## ⚠ **초는 원정팀 공격, 말은 홈팀 공격이다.** 이걸 뒤집으면 득점이 통째로
## 상대 팀에 붙는데 합계는 맞아서 한참 안 보인다.


## 3아웃 전환. 주자·카운트를 비우고 반을 바꾼다.
##
## ⚠ **제자리에서 고친다** — 받은 사전을 그대로 바꾸고 같은 것을 돌려준다.
## 투구마다 상태를 복사하면 그것만으로 시간의 절반이 간다(실측 54.3 → 23.6초).
## **복사본이 필요하면 호출부가 직접 복사한다.**
static func flip_half(state: Dictionary) -> Dictionary:
	state["outs"] = 0
	state["count"] = {"balls": 0, "strikes": 0}
	state["runners"] = {"first": {}, "second": {}, "third": {}}
	if state.get("half", "top") == "top":
		state["half"] = "bottom"
	else:
		state["half"] = "top"
		state["inning"] = int(state.get("inning", 1)) + 1
	return state


## 득점을 합계와 이닝 칸에 같이 넣는다. **제자리에서 고친다**
##
## ⚠ **연장은 이닝 칸보다 회차가 크다.** 그대로 색인하면 범위를 벗어난다 —
## 마지막 칸에 몰아 넣는다
static func add_runs(state: Dictionary, runs: int) -> Dictionary:
	if runs <= 0:
		return state
	# 초 = 원정 공격
	var side: String = "away" if state.get("half", "top") == "top" else "home"
	state["score"][side] = int(state["score"].get(side, 0)) + runs

	var col: Array = state.get("inning_scores", {}).get(side, [])
	if not col.is_empty():
		var idx: int = clampi(int(state.get("inning", 1)) - 1, 0, col.size() - 1)
		col[idx] = int(col[idx]) + runs
	return state


# ── 종료 판정 ──────────────────────────────────────────────────────

## 콜드게임 — 5회 10점차 · 7회 7점차.
##
## ⚠ **말이 끝난 시점에만 본다.** 초가 끝난 시점엔 홈팀이 아직 안 쳤고,
## 거기서 끝내면 뒤집을 기회를 뺏는다. 실제 야구 규칙이 그렇다.
##
## ⚠ 호출은 **3아웃 전환 전**이어야 한다. 전환이 이닝을 올리고 반을 바꾸므로
## 뒤에서 보면 "말 종료"라는 조건이 이미 사라져 있다
static func is_cold_game(state: Dictionary) -> bool:
	if state.get("half", "top") != "bottom" or int(state.get("outs", 0)) < 3:
		return false
	var score: Dictionary = state.get("score", {})
	var diff: int = absi(int(score.get("home", 0)) - int(score.get("away", 0)))
	var inning: int = int(state.get("inning", 1))
	return (inning >= 5 and diff >= 10) or (inning >= 7 and diff >= 7)


static func should_finish(state: Dictionary) -> bool:
	var score: Dictionary = state.get("score", {})
	var home: int = score.get("home", 0)
	var away: int = score.get("away", 0)
	var inning: int = int(state.get("inning", 1))
	var limit: int = int(state.get("inning_limit", 9))

	# 끝내기 — 말에 홈이 앞서면 더 칠 이유가 없다.
	#
	# ⚠ 반대는 성립하지 않는다. 9회 말에 **원정이** 앞서 있으면 홈팀이
	# 아직 남았다 — 여기서 끝내면 9회말 역전이 통째로 사라진다
	if state.get("half", "top") == "bottom" and inning >= limit and home > away:
		return true
	# 연장 — 규정 이닝을 넘겼고 승부가 갈렸다
	if inning > limit and home != away:
		return true
	return is_cold_game(state)


static func finish_log(state: Dictionary) -> String:
	var score: Dictionary = state.get("score", {})
	var home: int = score.get("home", 0)
	var away: int = score.get("away", 0)
	var inning: int = int(state.get("inning", 1))

	if state.get("half", "top") == "bottom" and inning >= int(state.get("inning_limit", 9)) \
			and home > away:
		return "끝내기!"
	if is_cold_game(state):
		return "콜드게임 (%d회 종료, %d점차)" % [inning, absi(home - away)]
	return "규정 이닝 종료"
