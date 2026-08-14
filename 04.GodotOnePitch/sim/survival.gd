extends RefCounted
class_name Survival

## 독립 생존리그 — 4단계로 좁혀 간다. B-4c.
##
## 원본: `survival.rs` · `usecases/survivalLeague.ts` · `utils/survivalLeague.ts`
##
## ⚠ **리그도 대회도 아닌 제3의 형식이다.** 정규시즌과 포스트시즌이 분리된
## 고교·대학과 달리 **매 단계 하위권이 통째로 탈락하며 좁혀진다:**
##
##   1차 10팀 더블RR 18경기 → 하위 2 탈락
##   2차  8팀 더블RR 14경기 → 하위 4 탈락
##   3차  4팀 싱글RR  3경기 → 최종 정규 순위
##   4차  4팀 사다리 (준PO 단판 → PO 단판 → 챔결 3전2승)
##
## ⚠ **단계마다 순위표를 리셋한다.** 각 단계는 이전 대진을 이어받지 않고
## 생존팀끼리 새로 돈다 — 누적을 쓰면 1차에서 벌어놓은 승수로 3차 순위가
## 정해져 "매 단계 새 승부"가 무의미해진다.


const RULES_PATH: String = "res://data/survival_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("생존리그 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


static func league_id() -> String:
	return String(rules().get("league_id", ""))


static func stages() -> Array:
	return rules().get("stages", [])


static func stage_def(stage: int) -> Dictionary:
	for s in stages():
		if int(s["stage"]) == stage:
			return s
	return {}


## 경기 요일.
##
## ⚠ **JSON 숫자는 float로 온다.** `Array.has()`는 형이 다르면 안 맞는다 —
## `[2.0].has(2)`가 **false**다. 그대로 넘기면 경기일이 0일이 되고
## "기간이 모자라다"로만 보인다.
##
## **정수로 바꾸는 건 `PackedInt32Array`다** — 담을 때 알아서 자른다.
## 여기 `int()`를 또 씌우면 아무도 안 읽는 줄이 된다
static func weekdays() -> PackedInt32Array:
	var out := PackedInt32Array()
	for w in rules().get("weekdays", []):
		out.append(w)
	return out


## 마지막 정규 단계 번호 (독립 = 3). 그 다음이 사다리다
static func last_regular_stage() -> int:
	var last: int = 0
	for s in stages():
		last = maxi(last, int(s["stage"]))
	return last


## 이 주차에 시작하는 단계. 없으면 0
static func stage_starting_at(week: int) -> int:
	for s in stages():
		if int(s["start_week"]) == week:
			return int(s["stage"])
	return 0


## 경기 id 앞머리 — 그 단계 경기만 골라내는 근거다
static func match_prefix(stage: int) -> String:
	return "INDS%d_" % stage


# ── 한 단계 일정 ──────────────────────────────────────────────

## 생존팀끼리 새 라운드로빈. `Schedule.build`가 정본이다 —
## 홈 균형·기간 배분을 두 벌로 두면 언젠가 갈린다
static func stage_schedule(stage: int, teams: Array, season_year: int,
		protagonist_team_id: String) -> Array:
	var d: Dictionary = stage_def(stage)
	if d.is_empty() or teams.size() < 2:
		return []

	var games: Array = Schedule.build({
		"league_id": league_id(), "teams": teams, "season_year": season_year,
		"games_per_team": int(d["target_games"]),
		"start_day": (int(d["start_week"]) - 1) * Calendar.DAYS_PER_WEEK + 1,
		"end_day": int(d["end_week"]) * Calendar.DAYS_PER_WEEK,
		"weekdays": Array(weekdays()),
	})

	var out: Array = []
	for i in games.size():
		var g: Dictionary = games[i]
		out.append({
			# ⚠ **단계 번호가 id에 들어간다.** 그게 "그 단계 경기만" 세는 근거다
			"id": "%sY%d_%03d" % [match_prefix(stage), season_year, i],
			"day": int(g["day"]), "league_id": league_id(),
			"home": String(g["home"]), "away": String(g["away"]),
			"is_protagonist_game": String(g["home"]) == protagonist_team_id
				or String(g["away"]) == protagonist_team_id,
			"is_tournament": false, "survival_stage": stage, "result": null,
		})
	return out


# ── 단계 순위 ─────────────────────────────────────────────────

## 그 단계 경기만으로 낸 순위표.
##
## ⚠ **누적을 쓰면 안 된다.** 1차에서 벌어놓은 승수로 3차 순위가 정해지면
## "매 단계 새 승부"가 무의미해진다
static func stage_standings(stage: int, teams: Array, schedule: Array) -> Array:
	var acc: Dictionary = {}
	for t in teams:
		acc[String(t)] = {"team_id": String(t), "wins": 0, "losses": 0,
			"draws": 0, "win_pct": 0.0, "runs_for": 0, "runs_against": 0}

	var prefix: String = match_prefix(stage)
	for g in schedule:
		if not String(g.get("id", "")).begins_with(prefix):
			continue
		var res = g.get("result", null)
		if res == null:
			continue
		var home: String = String(g["home"])
		var away: String = String(g["away"])
		if not acc.has(home) or not acc.has(away):
			continue
		var hs: int = int(res.get("home_score", 0))
		var as_: int = int(res.get("away_score", 0))
		acc[home]["runs_for"] += hs
		acc[home]["runs_against"] += as_
		acc[away]["runs_for"] += as_
		acc[away]["runs_against"] += hs
		if hs > as_:
			acc[home]["wins"] += 1
			acc[away]["losses"] += 1
		elif hs < as_:
			acc[away]["wins"] += 1
			acc[home]["losses"] += 1
		else:
			acc[home]["draws"] += 1
			acc[away]["draws"] += 1

	var out: Array = []
	for tid in acc:
		var s: Dictionary = acc[tid]
		# 무승부는 승률 분모에서 뺀다 — 리그 순위표와 같은 규칙이다
		var decided: int = int(s["wins"]) + int(s["losses"])
		s["win_pct"] = float(s["wins"]) / float(decided) if decided > 0 else 0.0
		out.append(s)
	return out


## 단계 순위 — 승률 → 다득점 → 실점 적은 순 → 팀ID.
##
## ⚠ **기획서의 '승자승'은 못 쓴다** — 순위표에 상대별 전적이 없다. 그 자리에
## 다득점을 둔다(고교·대학 대회 시드와 같은 기준).
##
## ⚠ **팀ID까지 넣는다.** 완전 동률에서 순서가 흔들리면 **탈락 팀이 바뀐다**
static func rank(standings: Array) -> Array:
	var v: Array = standings.duplicate()
	v.sort_custom(func(a, b) -> bool:
		var pa: float = float(a.get("win_pct", 0.0))
		var pb: float = float(b.get("win_pct", 0.0))
		if pa != pb:
			return pa > pb
		var fa: int = int(a.get("runs_for", 0))
		var fb: int = int(b.get("runs_for", 0))
		if fa != fb:
			return fa > fb
		var aa: int = int(a.get("runs_against", 0))
		var ab: int = int(b.get("runs_against", 0))
		if aa != ab:
			return aa < ab
		return String(a.get("team_id", "")) < String(b.get("team_id", "")))

	var out: Array = []
	for s in v:
		out.append(String(s.get("team_id", "")))
	return out


## 단계 종료 — 생존·탈락. `{survivors, eliminated, ranked}`
static func cutoff(standings: Array, advance_count: int) -> Dictionary:
	# `slice`가 범위를 알아서 자른다 — 참가팀보다 큰 수를 따로 막지 않는다
	var ranked: Array = rank(standings)
	var n: int = maxi(advance_count, 0)
	return {"survivors": ranked.slice(0, n), "eliminated": ranked.slice(n),
		"ranked": ranked}


# ── 4차 사다리 ────────────────────────────────────────────────

static func ladder_rules() -> Dictionary:
	return rules().get("ladder", {})


## 3차 최종 순위 → 포스트시즌 사다리.
##
## ⚠ **02의 구 코드는 "1위 vs 2위 단판" 하나뿐이었다** — 4팀 사다리를
## 표현 못 했다. 준PO 승자가 PO의 원정 자리로, PO 승자가 챔결의 원정 자리로
## 올라간다
static func build_ladder(final_ranking: Array) -> Array:
	var r: Dictionary = ladder_rules()
	var need: int = 0
	for s in r.get("series", []):
		need = maxi(need, int(s.get("home_seed", 0)))
		need = maxi(need, int(s.get("away_seed", 0)))
	if final_ranking.size() < need:
		return []

	var out: Array = []
	for s in r.get("series", []):
		var home: String = ""
		if int(s.get("home_seed", 0)) > 0:
			home = String(final_ranking[int(s["home_seed"]) - 1])
		var away: String = ""
		if int(s.get("away_seed", 0)) > 0:
			away = String(final_ranking[int(s["away_seed"]) - 1])
		out.append({
			"id": String(s["id"]), "league_id": league_id(),
			"round": String(s["round"]),
			"home_team_id": home, "away_team_id": away,
			"best_of": int(s.get("best_of", 1)),
			"home_wins": 0, "away_wins": 0, "winner": "",
			"home_from": String(s.get("home_from", "")),
			"away_from": String(s.get("away_from", "")),
			"next_series_id": String(s.get("next", "")),
			"next_series_slot": String(s.get("next_slot", "")),
		})
	return out
