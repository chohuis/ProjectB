extends RefCounted
class_name Postseason

## 프로 포스트시즌 — 대진 만들기 · 시리즈 치르기. B-10b.
##
## 원본: `packages/engine-native/src/postseason_engine.rs` ·
##       `utils/postseasonEngine.ts` · `usecases/backgroundPostseason.ts`
##
## ⚠ **04엔 이게 통째로 없었다.** `Bracket`은 읽는 쪽 도구고(라운드 묶기·
## 우승팀 뽑기), 시리즈를 실제로 만드는 곳은 **생존리그 사다리 하나뿐**이었다.
## 그래서 KBL·2군은 정규시즌만 있고 한국시리즈가 없었다 — `ps_result`가
## 프로에서 영영 안 채워지고, 그건 진로 판정·수상·인생 기록이 읽는 값이다.
##
## ⚠ **시리즈 한 칸의 모양은 `Bracket`이 정본이다.** 거기가 읽는 열
## (`round` · `best_of` · `home_wins` · `next_series_id` …)을 그대로 만든다 —
## 다른 모양으로 만들면 화면이 대진을 못 그린다.


## 배경으로 돌리는 리그. **국내만이다** — 해외는 진출 전까지 안 돌린다
const BACKGROUND_LEAGUES: Array[String] = ["LEAGUE_KBL", "LEAGUE_KBL_FARM"]

## 대진이 사는 자리 — 리그마다 한 벌
const KEY: String = "postseason"


static func all_of(state: Dictionary) -> Dictionary:
	var d = state.get(KEY, {})
	return d if d is Dictionary else {}


static func of(state: Dictionary, league_id: String) -> Array:
	return all_of(state).get(league_id, [])


# ── 대진 만들기 ───────────────────────────────────────────────

## 이기려면 몇 승이 필요한가. **`Bracket`과 같은 식이어야 한다** —
## 두 벌로 두면 화면이 "3승 필요"인데 엔진은 2승에서 끝낸다
static func wins_needed(best_of: int) -> int:
	return Bracket.wins_needed(best_of)


## 순위표를 시드 순서로. 승률 → 승수
static func seed_order(standings: Array) -> Array:
	var rows: Array = standings.duplicate()
	rows.sort_custom(func(a, b) -> bool:
		var pa: float = float(a.get("win_pct", 0.0))
		var pb: float = float(b.get("win_pct", 0.0))
		if pa == pb:
			return int(a.get("wins", 0)) > int(b.get("wins", 0))
		return pa > pb)
	var out: Array = []
	for r in rows:
		out.append(String(r.get("team_id", "")))
	return out


static func _series(id: String, league: String, round_name: String,
		home: String, away: String, best_of: int, next_id: String,
		away_from: String = "", home_wins: int = 0) -> Dictionary:
	return {
		"id": id, "league_id": league, "round": round_name,
		"home_team_id": home, "away_team_id": away,
		"best_of": best_of, "home_wins": home_wins, "away_wins": 0,
		"winner": "", "home_from": "", "away_from": away_from,
		"next_series_id": next_id,
		"next_series_slot": "away" if not next_id.is_empty() else "",
	}


## 프로 1군 5강 와일드카드 사다리.
##
## ⚠ 02 v1은 6강이었고 **3위가 통째로 빠지는 결함**이 있었다 —
## WC(5vs6) → 준PO(4위) → PO(2위) → KS(1위)라서 3위가 어디에도 안 나왔다.
##
## WC의 "4위는 1승, 5위는 2승"(정규시즌 상위 어드밴티지)은 새 장치 없이
## **홈팀이 1승을 안고 시작하는 3전2승**으로 정확히 표현된다
static func build_kbl(standings: Array) -> Array:
	var t: Array = seed_order(standings)
	if t.size() < 5:
		return []
	return [
		_series("KBL_WC", "LEAGUE_KBL", "와일드카드", t[3], t[4], 3,
			"KBL_PREP", "", 1),
		_series("KBL_PREP", "LEAGUE_KBL", "준플레이오프", t[2], "", 5,
			"KBL_PO", "KBL_WC"),
		_series("KBL_PO", "LEAGUE_KBL", "플레이오프", t[1], "", 5,
			"KBL_KS", "KBL_PREP"),
		# 정규시즌 1위는 한국시리즈 직행 — 긴 정규시즌의 가장 큰 보상
		_series("KBL_KS", "LEAGUE_KBL", "한국시리즈", t[0], "", 7,
			"", "KBL_PO"),
	]


## 프로 2군 축약 포스트시즌 — 상위 4팀 **단판 사다리.**
##
## 1군처럼 무겁게 가지 않는다. 독립 사다리와 모양은 같지만
## **결승도 단판**이라는 점이 다르다(독립 챔결은 3전2승)
static func build_farm(standings: Array) -> Array:
	var t: Array = seed_order(standings)
	if t.size() < 4:
		return []
	return [
		_series("FARM_SEMI", "LEAGUE_KBL_FARM", "준결승", t[2], t[3], 1,
			"FARM_PO"),
		_series("FARM_PO", "LEAGUE_KBL_FARM", "플레이오프", t[1], "", 1,
			"FARM_FINAL", "FARM_SEMI"),
		_series("FARM_FINAL", "LEAGUE_KBL_FARM", "퓨처스 결승", t[0], "", 1,
			"", "FARM_PO"),
	]


static func build(league_id: String, standings: Array) -> Array:
	if league_id == "LEAGUE_KBL":
		return build_kbl(standings)
	if league_id == "LEAGUE_KBL_FARM":
		return build_farm(standings)
	return []


# ── 시리즈 치르기 ─────────────────────────────────────────────

## 한 경기를 시리즈에 반영한다. **제자리에서 고친다**
static func apply_game(series: Dictionary, winner_id: String) -> Dictionary:
	if winner_id == String(series.get("home_team_id", "")):
		series["home_wins"] = int(series.get("home_wins", 0)) + 1
	elif winner_id == String(series.get("away_team_id", "")):
		series["away_wins"] = int(series.get("away_wins", 0)) + 1

	var needed: int = wins_needed(int(series.get("best_of", 1)))
	if int(series["home_wins"]) >= needed:
		series["winner"] = String(series.get("home_team_id", ""))
	elif int(series["away_wins"]) >= needed:
		series["winner"] = String(series.get("away_team_id", ""))
	return series


## 끝난 시리즈의 승자를 다음 시리즈 자리에 앉힌다
static func fill_next(bracket: Array, completed: Dictionary) -> void:
	var winner: String = String(completed.get("winner", ""))
	var next_id: String = String(completed.get("next_series_id", ""))
	if winner.is_empty() or next_id.is_empty():
		return
	var slot: String = String(completed.get("next_series_slot", "away"))
	for s in bracket:
		if String(s.get("id", "")) != next_id:
			continue
		if slot == "home":
			s["home_team_id"] = winner
		else:
			s["away_team_id"] = winner
		return


## 주인공이 없는 시리즈를 전부 치른다.
##
## ⚠ **안고 시작하는 승수를 그대로 이어받는다.** 0부터 다시 세면 1군
## 와일드카드의 "4위 1승 어드밴티지"가 조용히 사라진다.
##
## ⚠ **주인공 팀 시리즈는 건드리지 않는다** — 그건 사용자가 치른다
static func resolve_others(bracket: Array, protagonist_team_id: String,
		rng: RandomNumberGenerator) -> int:
	var done: int = 0
	# 승자가 다음 자리에 앉아야 그 시리즈가 열리므로 여러 번 훑는다.
	# **상한을 둔다** — 데이터가 깨져도 화면이 무한 루프에 빠지면 안 된다
	for _pass in range(bracket.size() + 1):
		var changed: bool = false
		for s in bracket:
			if not String(s.get("winner", "")).is_empty():
				continue
			var home: String = String(s.get("home_team_id", ""))
			var away: String = String(s.get("away_team_id", ""))
			if home.is_empty() or away.is_empty():
				continue
			if home == protagonist_team_id or away == protagonist_team_id:
				continue

			var needed: int = wins_needed(int(s.get("best_of", 1)))
			while int(s.get("home_wins", 0)) < needed \
					and int(s.get("away_wins", 0)) < needed:
				apply_game(s, home if rng.randf() < 0.5 else away)
			fill_next(bracket, s)
			done += 1
			changed = true
		if not changed:
			break
	return done


# ── 그 해 어디까지 갔나 ───────────────────────────────────────

## 경력 한 줄에 적히는 값. **읽는 쪽이 셋이다** — 대학 입시
## (`CareerPath.hs_baseball_score`) · 드래프트 판정 · 인생 기록.
##
## ⚠ **04엔 이걸 쓰는 곳이 없었다.** 읽는 코드만 셋이고 채우는 자리가
## 없어서 전원이 "미진출"이었다 — 고교 우승이 입시에 한 점도 안 실렸다
const CHAMPION: String = "champion"
const RUNNER_UP: String = "runner_up"
const SEMI_FINAL: String = "semi_final"
const NOT_QUALIFIED: String = "not_qualified"


## 포스트시즌 대진(`Bracket` 모양)에서 그 팀이 어디까지 갔나
static func result_from_series(series: Array, team_id: String) -> String:
	if series.is_empty() or team_id.is_empty():
		return NOT_QUALIFIED
	var final_two: Dictionary = Bracket.finalists(series)
	if String(final_two.get("champion", "")) == team_id:
		return CHAMPION
	if String(final_two.get("runner_up", "")) == team_id:
		return RUNNER_UP

	# 결승 바로 앞 라운드까지 갔으면 4강이다 — 대진 깊이로 센다
	var rounds: Array = Bracket.to_rounds(series)
	if rounds.size() >= 2:
		for s in rounds[rounds.size() - 2]["series"]:
			if String(s.get("home_team_id", "")) == team_id \
					or String(s.get("away_team_id", "")) == team_id:
				return SEMI_FINAL
	return NOT_QUALIFIED


## 대회 대진(`Tournament` 모양)에서 그 팀이 어디까지 갔나.
##
## ⚠ **모양이 다르다.** 포스트시즌은 시리즈(다전제)고 대회는 단판 경기다 —
## 같은 함수로 읽으려다 열 이름이 어긋나면 전원이 미진출이 된다
static func result_from_matches(bracket: Dictionary, team_id: String) -> String:
	var total: int = int(bracket.get("total_rounds", 0))
	if total <= 0 or team_id.is_empty():
		return NOT_QUALIFIED

	var best: String = NOT_QUALIFIED
	for m in bracket.get("matches", []):
		var home: String = String(m.get("home", ""))
		var away: String = String(m.get("away", ""))
		if home != team_id and away != team_id:
			continue
		var round_no: int = int(m.get("round", 0))
		var won: bool = String(m.get("winner", "")) == team_id
		if round_no == total:
			return CHAMPION if won else RUNNER_UP
		if round_no == total - 1 and best == NOT_QUALIFIED:
			best = SEMI_FINAL
	return best


## 그 해 그 팀의 성적. **프로는 포스트시즌, 학교는 대회를 본다**
static func result_for(state: Dictionary, team_id: String,
		league_id: String) -> String:
	if BACKGROUND_LEAGUES.has(league_id):
		return result_from_series(of(state, league_id), team_id)

	# 학교는 그 해 대회 중 **제일 멀리 간 것**을 남긴다 — 대회가 여럿이라
	# 마지막 것만 보면 우승한 해가 미진출로 적힌다
	var best: String = NOT_QUALIFIED
	var rank: Dictionary = {NOT_QUALIFIED: 0, SEMI_FINAL: 1, RUNNER_UP: 2,
		CHAMPION: 3}
	for tid in TournamentRunner.all_of(state):
		var rec: Dictionary = TournamentRunner.all_of(state)[tid]
		if String(rec.get("league_id", "")) != league_id:
			continue
		var r: String = result_from_matches(rec.get("bracket", {}), team_id)
		if int(rank[r]) > int(rank[best]):
			best = r
	return best


# ── 배경 리그 ─────────────────────────────────────────────────

## 그 리그 정규시즌이 끝났는가 — **치를 경기가 남아 있으면 아직이다**
static func regular_season_done(schedule: Array, league_id: String) -> bool:
	var played: int = 0
	for g in schedule:
		if String(g.get("league_id", "")) != league_id:
			continue
		if g.get("result", null) == null:
			return false
		played += 1
	return played > 0


## 주인공이 없는 국내 리그의 포스트시즌을 통째로 치른다.
##
## ⚠ **주인공 리그는 건드리지 않는다** — 거기는 주인공 경기를 멈춰가며
## 진행해야 한다.
##
## ⚠ **이미 치른 리그는 다시 안 만든다.** 다시 만들면 우승팀이 바뀐다
static func run_background(state: Dictionary) -> Dictionary:
	var schedule: Array = state.get("schedule", [])
	var me: Dictionary = state.get("protagonist", {})
	var my_league: String = String(me.get("league_id", ""))
	var my_team: String = String(me.get("team_id", ""))
	var year: int = int(state.get("season_year", 0))

	var all: Dictionary = all_of(state)
	var out: Dictionary = {"leagues": [], "champions": {}}

	for league_id in BACKGROUND_LEAGUES:
		if league_id == my_league:
			continue
		if not all.get(league_id, []).is_empty():
			continue
		if not regular_season_done(schedule, league_id):
			continue

		var bracket: Array = build(league_id,
			Standings.from_schedule(schedule, league_id))
		if bracket.is_empty():
			continue

		var rng := RandomNumberGenerator.new()
		rng.seed = Rng.mix(["postseason", int(state.get("seed", 0)), year,
			league_id])
		resolve_others(bracket, my_team, rng)

		all[league_id] = bracket
		out["leagues"].append(league_id)
		out["champions"][league_id] = Bracket.champion(bracket)

	state[KEY] = all
	return out
