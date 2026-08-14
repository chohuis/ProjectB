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
	# ⚠ **"패자 없음"의 표기가 둘이다.** 옛 세이브는 `null`, 이주한 코드는
	# 빈 문자열을 쓴다. 한쪽만 보면 무승부가 조용히 홈팀 승리로 기록된다 —
	# 실제로 `MatchReport`를 이을 때 여기서 걸렸다
	var is_draw: bool = loser == null or String(loser).is_empty()

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


## 일정에서 순위표를 만든다. **치른 경기만 센다.**
##
## ⚠ **여기가 정본이다.** 예전엔 `LeagueVm`만 이 계산을 갖고 있었고,
## 그래서 **시뮬 쪽에서 최종 순위를 알 방법이 없었다** — 구단 성향 갱신처럼
## 순위가 입력인 자리가 화면을 부를 수는 없다. 두 벌로 두면 언젠가 갈린다.
##
## 돌려주는 줄: `team_id · wins · losses · draws · win_pct · rank`
static func from_schedule(schedule: Array, league_id: String) -> Array:
	var table: Dictionary = {}
	for g in schedule:
		# ⚠ **다른 리그가 섞이면 안 된다.** 하루 83경기가 도는데 다 세면
		# 순위표가 뒤죽박죽이 된다
		if g.get("league_id", "") != league_id:
			continue
		# ⚠ **대회 경기는 리그 순위에 안 넣는다.** 넣으면 전국대회 한 판이
		# 리그 승률을 흔들고, 그 승률이 다음 대회 시드가 된다
		if g.get("is_tournament", false):
			continue
		# 안 치른 경기는 안 센다 — 세면 개막 전에 전 팀이 승률 0으로 뜬다
		var res = g.get("result", null)
		if res == null:
			continue

		var home: String = g.get("home", "")
		var away: String = g.get("away", "")
		_blank(table, home)
		_blank(table, away)

		# 득실 — 권역 시드가 동률을 이걸로 가른다
		var hs: int = int(res.get("home_score", 0))
		var as_: int = int(res.get("away_score", 0))
		table[home]["runs_for"] += hs
		table[home]["runs_against"] += as_
		table[away]["runs_for"] += as_
		table[away]["runs_against"] += hs

		var winner = res.get("winner_id", null)
		var loser = res.get("loser_id", null)
		# ⚠ **패자가 없으면 무승부다.** 표기가 둘(`null`·빈 문자열)이라
		# 한쪽만 보면 무승부가 조용히 홈 승리로 기록된다
		if loser == null or String(loser).is_empty():
			table[home]["draws"] += 1
			table[away]["draws"] += 1
		else:
			_blank(table, String(winner))
			_blank(table, String(loser))
			table[String(winner)]["wins"] += 1
			table[String(loser)]["losses"] += 1

	var rows: Array = []
	for tid in table:
		var r: Dictionary = table[tid]
		# ⚠ **무승부는 승률 분모에서 뺀다** — 야구의 관례다. 안 그러면
		# 무승부가 많은 팀이 순위에서 밀린다
		var decided: int = int(r["wins"]) + int(r["losses"])
		rows.append({
			"team_id": tid,
			"wins": r["wins"], "losses": r["losses"], "draws": r["draws"],
			"win_pct": float(r["wins"]) / float(decided) if decided > 0 else 0.0,
			"runs_for": r["runs_for"], "runs_against": r["runs_against"],
		})

	rows = sorted(rows)
	for i in rows.size():
		rows[i]["rank"] = i + 1
	return rows


static func _blank(table: Dictionary, team_id: String) -> void:
	if not table.has(team_id):
		table[team_id] = {"wins": 0, "losses": 0, "draws": 0,
			"runs_for": 0, "runs_against": 0}


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
