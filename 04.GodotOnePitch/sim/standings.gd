extends RefCounted
class_name Standings

## 순위표 — 승패·승률·득실·연승·최근10.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/utils/season-helpers.ts`
##
## 순위표 한 줄은 사전이다:
##   team_id · wins · losses · draws · win_pct · runs_for · runs_against
##   streak("W3") · last10("WWLWL")
##
## ⚠ **무승부는 `loser_id`가 없는 것으로 표시한다.** 원본이 그렇고, 세이브
## 포맷도 그렇다. 이걸 놓치면 무승부가 홈팀 승리로 기록된다.


## 경기 결과를 순위표에 반영한다. **원본을 안 바꾸고 새 배열을 돌려준다.**
##
## 경기에 안 나온 팀은 그대로 통과시킨다 — 건드리면 리그 전체가 어긋난다.
static func apply_result(
	standings: Array,
	result: Dictionary,
	home_team_id: String,
	away_team_id: String,
) -> Array:
	var winner: String = result.get("winner_id", "")
	var loser = result.get("loser_id", null)
	var is_draw: bool = loser == null

	var out: Array = []
	for s in standings:
		var team: String = s.get("team_id", "")
		var involved: bool
		if is_draw:
			involved = team == home_team_id or team == away_team_id
		else:
			involved = team == winner or team == loser
		if not involved:
			out.append(s)
			continue

		var is_winner: bool = team == winner
		var wins: int = s.get("wins", 0) + (1 if is_winner and not is_draw else 0)
		var losses: int = s.get("losses", 0) + (1 if not is_winner and not is_draw else 0)
		var draws: int = s.get("draws", 0) + (1 if is_draw else 0)

		# ⚠ **분모는 승＋패다.** 무승부를 넣으면 1승 1무가 5할이 된다
		var decided: int = wins + losses
		var win_pct: float = (roundf(float(wins) / float(decided) * 1000.0) / 1000.0) if decided > 0 else 0.0

		var is_home: bool = team == home_team_id
		var hs: int = result.get("home_score", 0)
		var as_: int = result.get("away_score", 0)

		var mark: String = "D" if is_draw else ("W" if is_winner else "L")
		var n: Dictionary = s.duplicate()
		n["wins"] = wins
		n["losses"] = losses
		n["draws"] = draws
		n["win_pct"] = win_pct
		n["runs_for"] = s.get("runs_for", 0) + (hs if is_home else as_)
		n["runs_against"] = s.get("runs_against", 0) + (as_ if is_home else hs)
		n["streak"] = update_streak(s.get("streak", ""), mark)
		n["last10"] = update_last10(s.get("last10", ""), mark)
		out.append(n)
	return out


## 연승·연패 — "W3" 형태. 결과가 바뀌면 1부터 다시 센다
static func update_streak(current: String, result: String) -> String:
	if current.is_empty():
		return result + "1"
	var mark: String = current.substr(0, 1)
	# ⚠ **두 자리 이상을 읽어야 한다.** 10연승이면 "W10"이라
	# 한 글자만 잘라 읽으면 W1이 된다
	var n: int = current.substr(1).to_int()
	return result + str(n + 1) if mark == result else result + "1"


## 최근 10경기 — "WWLWL" 형태.
##
## ⚠ **구형 압축 포맷("W3L2")을 읽을 수 있어야 한다.** 옛 세이브가 그 형태를
## 갖고 있어서, 그대로 이어붙이면 숫자가 섞여 이후 계산이 통째로 어긋난다
static func update_last10(current: String, result: String) -> String:
	var expanded := ""
	var i := 0
	while i < current.length():
		var c := current[i]
		if c == "W" or c == "L" or c == "D":
			# 뒤에 숫자가 붙어 있으면 그만큼 편다
			var j := i + 1
			var digits := ""
			while j < current.length() and current[j] >= "0" and current[j] <= "9":
				digits += current[j]
				j += 1
			if digits.is_empty():
				expanded += c
				i += 1
			else:
				expanded += c.repeat(digits.to_int())
				i = j
		else:
			i += 1
	expanded += result
	return expanded.substr(maxi(0, expanded.length() - 10))


## 순위 정렬 — 승률 → 승수. **원본을 안 바꾼다**
##
## ⚠ 화면이 정렬해 보여주는데 그게 원본을 바꾸면 저장까지 흔들린다
static func sorted(standings: Array) -> Array:
	var out: Array = standings.duplicate()
	out.sort_custom(func(a, b) -> bool:
		var pa: float = a.get("win_pct", 0.0)
		var pb: float = b.get("win_pct", 0.0)
		if not is_equal_approx(pa, pb):
			return pa > pb
		return a.get("wins", 0) > b.get("wins", 0)
	)
	return out
