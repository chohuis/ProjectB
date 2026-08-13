extends RefCounted
class_name MatchReport

## 결과 어댑터 — 끝난 경기를 리그가 먹는 모양으로. M2-6.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##       (`collect_player_lines` · `to_match_result` · `to_sim_game_result`)
##
## ⚠ **여기가 경기와 리그를 잇는 유일한 지점이다.** 원본에서 교체된 투수들의
## 성적이 안 남아 있었고, 그대로 통합하면 리그 순위표·성적표가 통째로 빈다.
##
## 나오는 것이 두 계약을 만족해야 한다:
##   `SeasonStats.accumulate`  선수 줄
##   `Standings.apply_result`  경기 결과


## 아웃당 깎이는 신선도. **리그 시뮬과 같은 값이다** — 다르면 한쪽 리그만 투수가
## 빨리 지친다
const FRESHNESS_PER_OUT: float = 2.7


## 아웃 수를 야구식 이닝으로. **소수 이닝으로 넘기면 통산 합산이 어긋난다** —
## 20아웃은 6.67이 아니라 6과 2/3, 표기로 6.2다
static func _outs_to_innings(outs: int) -> float:
	return CareerSummary.outs_to_innings(outs)


## 이 경기에 나온 선수들의 줄. `SeasonStats.accumulate`가 그대로 먹는다
static func player_lines(state: Dictionary) -> Array:
	var out: Array = []

	for key in ["my_pitcher_lines", "opponent_pitcher_lines"]:
		for l in state.get(key, []):
			# 안 던진 투수는 안 넣는다 — 넣으면 그 0이 시즌 경기 수에 쌓여
			# 등판 없는 투수가 100경기를 뛴 것으로 나온다
			if int(l.get("outs", 0)) == 0 and int(l.get("pc", 0)) == 0:
				continue
			out.append({
				"role": "pitcher",
				"player_id": l.get("player_id", ""),
				"ip": _outs_to_innings(int(l.get("outs", 0))),
				"er": float(l.get("er", 0)),
				"h": float(l.get("h", 0)),
				"k": float(l.get("k", 0)),
				"bb": float(l.get("bb", 0)),
				"pc": int(l.get("pc", 0)),
				# ⚠ 승패는 리그 쪽이 정한다 — 여기서 만들면 두 곳이 달라진다
				"decision": "",
				"risp_ab": int(l.get("risp_ab", 0)),
				"risp_h": int(l.get("risp_h", 0)),
			})

	for key in ["home_bat_lines", "away_bat_lines"]:
		for b in state.get(key, []):
			# 안 나온 타자도 마찬가지다. 볼넷만 골라도 나온 것이다
			if int(b.get("ab", 0)) == 0 and int(b.get("bb", 0)) == 0:
				continue
			out.append({
				"role": "batter",
				"player_id": b.get("player_id", ""),
				"ab": int(b.get("ab", 0)), "h": int(b.get("h", 0)),
				"hr": int(b.get("hr", 0)), "rbi": int(b.get("rbi", 0)),
				"bb": int(b.get("bb", 0)), "k": int(b.get("k", 0)),
				"sb": int(b.get("sb", 0)),
				"risp_ab": int(b.get("risp_ab", 0)),
				"risp_h": int(b.get("risp_h", 0)),
			})

	return out


## 끝난 경기 → 순위표가 먹는 결과.
##
## ⚠ **동점이면 패자가 없다.** 원본은 `home >= away`로 갈라 **동점을 홈
## 승리로 적었다.** 정상 흐름에서는 동점으로 안 끝나지만, 무승부 규정으로
## 경기를 끊으면 없던 승리가 생긴다. 순위표는 `loser_id`가 비어 있는 것을
## 무승부로 읽으므로 여기서 맞춰 준다
static func to_match_result(state: Dictionary, home_team_id: String, away_team_id: String) -> Dictionary:
	var score: Dictionary = state.get("score", {})
	var home: int = int(score.get("home", 0))
	var away: int = int(score.get("away", 0))

	var winner: String = ""
	var loser: String = ""
	if home > away:
		winner = home_team_id
		loser = away_team_id
	elif away > home:
		winner = away_team_id
		loser = home_team_id
	else:
		# 무승부 — 순위표가 홈·원정 양쪽을 다 찾으려면 승자 자리에 하나는 있어야 한다
		winner = home_team_id

	return {
		"home_score": home, "away_score": away,
		"winner_id": winner, "loser_id": loser,
		"player_lines": player_lines(state),
		"events": [],
	}


# ── 투수 피로 ──────────────────────────────────────────────────────

## ⚠ **안 넘기면 투수가 무한정 던진다.** 범위를 벗어난 피로는 그 뒤 등판
## 판정을 통째로 무너뜨린다
static func next_freshness(previous: float, outs: int) -> float:
	return clampf(previous - float(outs) * FRESHNESS_PER_OUT, 0.0, 100.0)


## 이 경기에 던진 투수들의 다음 컨디션. **안 던진 투수는 안 건드린다**
static func pitcher_conditions(state: Dictionary, previous: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for key in ["my_pitcher_lines", "opponent_pitcher_lines"]:
		for l in state.get(key, []):
			if int(l.get("outs", 0)) == 0 and int(l.get("pc", 0)) == 0:
				continue
			var pid: String = l.get("player_id", "")
			# 처음 등판하는 투수는 이전 기록이 없다
			var prev: float = previous.get(pid, {}).get("freshness", 100.0)
			out[pid] = {"freshness": next_freshness(prev, int(l.get("outs", 0)))}
	return out
