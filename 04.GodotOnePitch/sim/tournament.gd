extends RefCounted
class_name Tournament

## 전국대회 — 고교 5종 · 대학 3종. B-4.
##
## 원본: `tournament.rs` · `group_stage.rs` · `utils/tournament.ts`
##
## 리그와 달리 넉아웃은 **다음 대진이 이전 결과에 달려 있다.** 그래서 둘로
## 나눈다 — 뼈대(대진 슬롯·날짜)를 미리 짜고, 결과를 받아 다음 라운드를 채운다.
##
## ⚠ **부전승 규칙을 따로 만들지 않는다.** 표준 시드 순서(1↔N, 2↔N−1 …)에서
## **빈 시드가 곧 부전승**이고, 그 수가 기획서 표와 정확히 맞는다:
## 48팀 → 64대진·부전승 16 · 102팀 → 128대진·부전승 26 · 24팀 → 32대진·부전승 8.
##
## 여기는 **포스트시즌 대진(`Bracket`)과 다른 것**이다. 그쪽은 리그 상위권의
## 다전제 시리즈고 여기는 단판 넉아웃이다.


const RULES_PATH: String = "res://data/tournament_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("대회 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


static func defs() -> Array:
	return rules().get("tournaments", [])


static func def_of(tournament_id: String) -> Dictionary:
	for d in defs():
		if String(d["id"]) == tournament_id:
			return d
	return {}


static func defs_of(league_id: String) -> Array:
	var out: Array = []
	for d in defs():
		if String(d["league_id"]) == league_id:
			out.append(d)
	out.sort_custom(func(a, b) -> bool: return int(a["order"]) < int(b["order"]))
	return out


## 그 주에 열리는 대회. 겹치면 `order`가 앞선 것
static func at_week(week: int, league_id: String) -> Dictionary:
	for d in defs_of(league_id):
		if week >= int(d["start_week"]) and week <= int(d["end_week"]):
			return d
	return {}


# ── 권역 ──────────────────────────────────────────────────────

## ⚠ **권역은 구장에서 파생한다.** 02는 목록을 한 벌 더 적어 뒀는데
## 두 벌이 되면 언젠가 갈린다 — `teams.json`의 `stadium`이 정본이다
static func regions_of(league_id: String) -> Dictionary:
	var out: Dictionary = {}
	for t in World.teams_of(league_id):
		var key: String = String(t.get("stadium", ""))
		if not out.has(key):
			out[key] = []
		out[key].append(String(t["id"]))
	for key in out:
		out[key].sort()
	return out


## 순위표를 권역별로 쪼개 순위순으로.
##
## ⚠ **팀ID까지 넣어 정렬한다.** 동률에서 순서가 흔들리면 같은 시드에서
## 대진이 달라져 "결정적 세계"라는 전제가 깨진다
static func region_rankings(standings: Array, regions: Dictionary) -> Array:
	var by_team: Dictionary = {}
	for s in standings:
		by_team[String(s.get("team_id", ""))] = s

	var cmp := func(a: String, b: String) -> bool:
		var sa: Dictionary = by_team.get(a, {})
		var sb: Dictionary = by_team.get(b, {})
		var pa: float = float(sa.get("win_pct", 0.0))
		var pb: float = float(sb.get("win_pct", 0.0))
		if pa != pb:
			return pa > pb
		var fa: int = int(sa.get("runs_for", 0))
		var fb: int = int(sb.get("runs_for", 0))
		if fa != fb:
			return fa > fb
		var aa: int = int(sa.get("runs_against", 0))
		var ab: int = int(sb.get("runs_against", 0))
		if aa != ab:
			return aa < ab
		return a < b

	var ids: Array = regions.keys()
	ids.sort()
	var out: Array = []
	for rid in ids:
		var teams: Array = (regions[rid] as Array).duplicate()
		teams.sort_custom(cmp)
		out.append({"region_id": String(rid), "ranked_teams": teams})
	return out


static func win_pct_map(standings: Array) -> Dictionary:
	var out: Dictionary = {}
	for s in standings:
		out[String(s.get("team_id", ""))] = float(s.get("win_pct", 0.0))
	return out


# ── 참가팀 선발 ───────────────────────────────────────────────

## 권역 배분. `{region_id: 수}`
##
## ⚠ **권역마다 같은 수를 뽑으면 안 된다.** 크기가 6~20으로 갈려서, 6팀
## 권역은 상위 4팀(67%)이 전국대회에 나가고 20팀 권역은 20%만 나간다.
## **최대잔여법**으로 크기에 비례해 나눈다 — 단순 반올림은 합이 어긋나
## 대진이 깨진다
static func _quota(regions: Array, auto_slots: int, per_group_slots: int) -> Dictionary:
	var quota: Dictionary = {}
	var total_teams: int = 0
	for r in regions:
		total_teams += (r["ranked_teams"] as Array).size()

	if per_group_slots > 0:
		# 조 크기가 균등한 리그(대학 5조 × 10팀)
		for r in regions:
			quota[String(r["region_id"])] = mini(per_group_slots,
				(r["ranked_teams"] as Array).size())
		return quota

	# 전원 참가 대회(국화기)는 아래 배분이 알아서 권역 전원을 준다 —
	# `exact`가 권역 크기를 넘고 상한에 걸린다. 따로 가르지 않는다
	var remainders: Array = []
	var assigned: int = 0
	for r in regions:
		var size: int = (r["ranked_teams"] as Array).size()
		var exact: float = float(size) * float(auto_slots) / float(total_teams)
		# 권역당 최소 1 — 작은 권역이 통째로 빠지면 지역 서사가 죽는다
		var base: int = clampi(int(floorf(exact)), 1, size)
		quota[String(r["region_id"])] = base
		assigned += base
		remainders.append([exact - floorf(exact), String(r["region_id"])])

	# 소수부 내림차순, 동률은 권역ID로 — 시드마다 뒤바뀌면 안 된다
	remainders.sort_custom(func(a, b) -> bool:
		if float(a[0]) != float(b[0]):
			return float(a[0]) > float(b[0])
		return String(a[1]) < String(b[1]))

	var caps: Dictionary = {}
	for r in regions:
		caps[String(r["region_id"])] = (r["ranked_teams"] as Array).size()

	var i: int = 0
	while assigned < auto_slots and not remainders.is_empty():
		var rid: String = String(remainders[i % remainders.size()][1])
		if int(quota[rid]) < int(caps[rid]):
			quota[rid] = int(quota[rid]) + 1
			assigned += 1
		i += 1
		# 전 권역이 꽉 찼다
		if i > remainders.size() * 64:
			break
	return quota


## 참가팀을 시드 순으로. `{seeded_teams, region_quota, wildcards}`
static func select_entrants(regions: Array, tournament_def: Dictionary,
		win_pct: Dictionary) -> Dictionary:
	var total_slots: int = int(tournament_def.get("total_slots", 0))
	var wildcard_slots: int = int(tournament_def.get("wildcard_slots", 0))
	var auto_slots: int = maxi(total_slots - wildcard_slots, 0)
	var quota: Dictionary = _quota(regions, auto_slots,
		int(tournament_def.get("per_group_slots", 0)))

	# 권역 안에서 몇 위인가 — 승률 동률을 가르는 데 쓴다
	var rank_in_region: Dictionary = {}
	for r in regions:
		var list: Array = r["ranked_teams"]
		for i in list.size():
			rank_in_region[String(list[i])] = i

	var auto: Array = []
	for r in regions:
		var q: int = int(quota.get(String(r["region_id"]), 0))
		auto.append_array((r["ranked_teams"] as Array).slice(0, q))

	# 와일드카드 후보 — 자동 진출 밖. `wildcard_max_group_rank`가 있으면
	# 그 순위까지만(왕중왕전 = 조 2위까지)
	var max_rank: int = int(tournament_def.get("wildcard_max_group_rank", 0))
	var pool: Array = []
	for r in regions:
		var q: int = int(quota.get(String(r["region_id"]), 0))
		var list: Array = r["ranked_teams"]
		var upto: int = list.size() if max_rank <= 0 else mini(max_rank, list.size())
		if upto > q:
			pool.append_array(list.slice(q, upto))

	var by_strength := func(a: String, b: String) -> bool:
		var pa: float = float(win_pct.get(a, -1.0))
		var pb: float = float(win_pct.get(b, -1.0))
		if pa != pb:
			return pa > pb
		var ra: int = int(rank_in_region.get(a, 999))
		var rb: int = int(rank_in_region.get(b, 999))
		if ra != rb:
			return ra < rb
		return a < b

	pool.sort_custom(by_strength)
	var wildcards: Array = pool.slice(0, wildcard_slots)

	var seeded: Array = []
	if bool(tournament_def.get("auto_seeds_first", false)):
		# 자동 진출 블록이 통째로 위, WC 블록이 아래 — 기획서가 왕중왕전에만
		# 그렇게 못 박았다("조 1위 5팀 상위 시드, WC 3팀 하위 시드")
		var a1: Array = auto.duplicate()
		a1.sort_custom(by_strength)
		var w1: Array = wildcards.duplicate()
		w1.sort_custom(by_strength)
		seeded = a1 + w1
	else:
		# ⚠ **자동 시드가 WC보다 늘 위는 아니다** — 강한 권역 3위가 약한 권역
		# 1위보다 셀 수 있다
		seeded = auto + wildcards
		seeded.sort_custom(by_strength)

	return {"seeded_teams": seeded, "region_quota": quota, "wildcards": wildcards}


# ── 대진 ──────────────────────────────────────────────────────

## 표준 브래킷 시드 순서. size=4 → [1, 4, 3, 2]
##
## 크기 2n의 순서는 크기 n의 각 시드 s를 `[s, 2n+1−s]`로 펼친 것 —
## **1번과 2번이 결승 전까지 안 만난다**
static func seed_order(size: int) -> PackedInt32Array:
	var order := PackedInt32Array([1])
	while order.size() < size:
		var n: int = order.size() * 2
		var next := PackedInt32Array()
		for s in order:
			next.append(s)
			next.append(n + 1 - s)
		order = next
	return order


## 라운드 r(**0-based**)을 며칠째에 둘지. `[week, day_offset]`
##
## ⚠ **1-based로 착각하면 결승이 기간 안쪽으로 당겨지면서 1·2라운드가 같은
## 날에 겹친다** — 02가 실제로 그렇게 고쳤다가 되돌렸다
static func round_day(round: int, total_rounds: int, start_week: int,
		end_week: int) -> Array:
	var span_days: int = (maxi(end_week - start_week, 0) + 1) * Calendar.DAYS_PER_WEEK
	var last: int = maxi(span_days - 1, 0)
	var day: int = 0 if total_rounds <= 1 else (round * last) / (total_rounds - 1)
	return [start_week + day / Calendar.DAYS_PER_WEEK,
		day % Calendar.DAYS_PER_WEEK]


## 주차·요일 → 통산 일차
static func day_of(week: int, day_offset: int) -> int:
	return (week - 1) * Calendar.DAYS_PER_WEEK + day_offset + 1


## 전 라운드 뼈대. 부전승은 자동으로 다음 라운드에 오른다
static func generate_bracket(tournament_def: Dictionary, seeded_teams: Array,
		protagonist_team_id: String, season_year: int) -> Dictionary:
	var n: int = seeded_teams.size()
	var bracket_size: int = 1
	while bracket_size < n:
		bracket_size *= 2
	var total_rounds: int = 0
	var probe: int = bracket_size
	while probe > 1:
		probe /= 2
		total_rounds += 1

	var bracket: Dictionary = {
		"tournament_id": String(tournament_def["id"]),
		"league_id": String(tournament_def["league_id"]),
		"season_year": season_year, "bracket_size": bracket_size,
		"total_rounds": total_rounds, "bye_count": maxi(bracket_size - n, 0),
		"matches": [],
	}
	if total_rounds == 0:
		return bracket

	var start_week: int = int(tournament_def["start_week"])
	var end_week: int = int(tournament_def["end_week"])
	var order: PackedInt32Array = seed_order(bracket_size)

	for round in total_rounds:
		var in_round: int = bracket_size >> (round + 1)
		var wd: Array = round_day(round, total_rounds, start_week, end_week)
		var day: int = day_of(int(wd[0]), int(wd[1]))

		for slot in in_round:
			var home: String = ""
			var away: String = ""
			if round == 0:
				# 팀 수를 넘는 시드는 빈자리 = 상대의 부전승
				var hs: int = order[slot * 2] - 1
				var as_: int = order[slot * 2 + 1] - 1
				home = String(seeded_teams[hs]) if hs < n else ""
				away = String(seeded_teams[as_]) if as_ < n else ""
			var is_bye: bool = round == 0 and (home.is_empty() or away.is_empty())
			var winner: String = ""
			if is_bye:
				winner = home if not home.is_empty() else away
			var mine: bool = home == protagonist_team_id or away == protagonist_team_id

			bracket["matches"].append({
				"id": "%s_R%d_M%02d" % [tournament_def["id"], round + 1, slot],
				"round": round + 1, "slot": slot, "day": day,
				"home": home, "away": away, "is_bye": is_bye,
				"winner": winner,
				"is_protagonist_game": mine and not is_bye,
			})

	# ⚠ **1라운드 부전승은 즉시 올린다.** 치를 경기가 없으니 부르는 쪽이
	# 결과를 넘겨줄 방법이 없다
	propagate_round(bracket, 1, protagonist_team_id)
	return bracket


static func _match_at(bracket: Dictionary, round: int, slot: int) -> Dictionary:
	for m in bracket.get("matches", []):
		if int(m["round"]) == round and int(m["slot"]) == slot:
			return m
	return {}


## 그 라운드 승자를 다음 라운드 자리에 채운다. 승자 없는 경기는 건너뛴다
static func propagate_round(bracket: Dictionary, round: int,
		protagonist_team_id: String) -> void:
	for m in bracket.get("matches", []):
		if int(m["round"]) != round:
			continue
		var winner: String = String(m.get("winner", ""))
		if winner.is_empty():
			continue
		var next: Dictionary = _match_at(bracket, round + 1, int(m["slot"]) / 2)
		if next.is_empty():
			continue
		if int(m["slot"]) % 2 == 0:
			next["home"] = winner
		else:
			next["away"] = winner
		next["is_protagonist_game"] = String(next["home"]) == protagonist_team_id \
			or String(next["away"]) == protagonist_team_id


## 한 라운드 결과를 반영하고 다음 대진을 채운다.
##
## `results`는 `[{match_id, winner}, ...]`
static func advance_round(bracket: Dictionary, round: int, results: Array,
		protagonist_team_id: String) -> Dictionary:
	for r in results:
		for m in bracket.get("matches", []):
			if String(m["id"]) != String(r["match_id"]):
				continue
			# ⚠ **참가하지 않은 팀이 승자로 올라오면 무시한다.** 조용히
			# 오염되면 나중에 "왜 이 팀이 4강에 있지"로 되돌아온다
			var w: String = String(r["winner"])
			if String(m["home"]) == w or String(m["away"]) == w:
				m["winner"] = w
			break
	propagate_round(bracket, round, protagonist_team_id)
	return bracket


## 우승팀. 마지막 라운드 승자가 정해졌을 때만
static func champion(bracket: Dictionary) -> String:
	for m in bracket.get("matches", []):
		if int(m["round"]) == int(bracket.get("total_rounds", 0)):
			return String(m.get("winner", ""))
	return ""


## 그 라운드에서 **실제로 치를 경기**만. 부전승·대진 미확정은 빠진다
static func round_schedule(bracket: Dictionary, round: int) -> Array:
	var out: Array = []
	for m in bracket.get("matches", []):
		if int(m["round"]) != round:
			continue
		# 부전승은 한쪽이 비어 있으므로 아래 검사에 같이 걸린다
		if String(m["home"]).is_empty() or String(m["away"]).is_empty():
			continue
		out.append({"id": String(m["id"]), "day": int(m["day"]),
			"league_id": String(bracket["league_id"]),
			"home": String(m["home"]), "away": String(m["away"]),
			"is_protagonist_game": bool(m["is_protagonist_game"]),
			"is_tournament": true})
	return out


# ── 조별예선 ──────────────────────────────────────────────────
#
# 은하기·여명기는 "조별예선 → 본선 8강"이라 순수 넉아웃으로 표현이 안 된다.
#   은하기 24팀 → 8조 × 3팀 → **조 1위만** 8팀 → 8강
#   여명기 20팀 → 4조 × 5팀 → **조 상위 2** 8팀 → 8강


static func has_group_stage(tournament_def: Dictionary) -> bool:
	return int(tournament_def.get("group_count", 0)) > 0 \
		and int(tournament_def.get("advance_per_group", 0)) > 0 \
		and int(tournament_def.get("qualify_weeks", 0)) > 0


static func group_labels() -> Array:
	return rules().get("group_labels", [])


## 조별 단일 라운드로빈. 3팀이면 3경기, 5팀이면 10경기
## 한 명 이하는 아래 루프가 안 돈다 — 따로 막지 않는다
static func single_round_robin(teams: Array) -> Array:
	var list: Array = teams.duplicate()
	# 홀수면 빈자리를 넣고 그 상대는 쉰다
	var odd: bool = list.size() % 2 != 0
	if odd:
		list.append("")
	var m: int = list.size()

	var rounds: Array = []
	for r in m - 1:
		var round: Array = []
		for i in m / 2:
			var a: String = String(list[i])
			var b: String = String(list[m - 1 - i])
			if a.is_empty() or b.is_empty():
				continue
			# 홈·원정을 라운드마다 뒤집는다 — 안 그러면 한 팀이 늘 원정이다
			round.append([a, b] if r % 2 == 0 else [b, a])
		if not round.is_empty():
			rounds.append(round)
		var last = list.pop_back()
		list.insert(1, last)
	return rounds


## 조 추첨 + 예선 일정.
##
## ⚠ **시드를 무시하고 섞는다.** 기획서가 "완전 랜덤 추첨(시드 없음)"이라
## 했고 그게 '죽음의 조' 드라마의 근거다. 다만 **시드 기반 결정적 셔플**이라
## 세이브를 다시 열면 같은 조가 나온다
static func build_group_stage(tournament_def: Dictionary, seeded_teams: Array,
		protagonist_team_id: String, season_year: int,
		world_seed: int) -> Dictionary:
	var n_groups: int = maxi(int(tournament_def.get("group_count", 1)), 1)
	var start_week: int = int(tournament_def["start_week"])
	var end_week: int = start_week \
		+ maxi(int(tournament_def.get("qualify_weeks", 1)) - 1, 0)

	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["group_draw", world_seed, tournament_def["id"], season_year])
	var pool: Array = seeded_teams.duplicate()
	# Fisher-Yates — 결정적이고 입력 순서와 무관하다
	for i in range(pool.size() - 1, 0, -1):
		var j: int = rng.randi_range(0, i)
		var tmp = pool[i]
		pool[i] = pool[j]
		pool[j] = tmp

	var labels: Array = group_labels()
	var groups: Array = []
	for i in n_groups:
		groups.append({"label": String(labels[i]) if i < labels.size() else "?",
			"teams": [], "standings": []})
	# 이미 섞였으므로 뱀 배분이 아니라 순차로 나눈다
	for i in pool.size():
		groups[i % n_groups]["teams"].append(String(pool[i]))

	for g in groups:
		(g["teams"] as Array).sort()
		for t in g["teams"]:
			g["standings"].append({"team_id": String(t), "wins": 0, "losses": 0,
				"draws": 0, "runs_for": 0, "runs_against": 0})

	var span: float = float(maxi(end_week - start_week, 0) + 1)
	var matches: Array = []
	for gi in groups.size():
		var g: Dictionary = groups[gi]
		var rounds: Array = single_round_robin(g["teams"])
		if rounds.is_empty():
			continue
		var step: float = span / float(rounds.size())
		for ri in rounds.size():
			var week: int = mini(start_week + int(roundf(float(ri) * step)), end_week)
			var round: Array = rounds[ri]
			for mi in round.size():
				var pair: Array = round[mi]
				var day_offset: int = (gi + mi) % Calendar.DAYS_PER_WEEK
				matches.append({
					"id": "%s_Q%s_R%d_M%d" % [tournament_def["id"], g["label"],
						ri + 1, mi + 1],
					"day": day_of(week, day_offset),
					"league_id": String(tournament_def["league_id"]),
					"home": String(pair[0]), "away": String(pair[1]),
					"is_protagonist_game": String(pair[0]) == protagonist_team_id
						or String(pair[1]) == protagonist_team_id,
					"is_tournament": true})

	return {"tournament_id": String(tournament_def["id"]),
		"league_id": String(tournament_def["league_id"]),
		"season_year": season_year, "groups": groups,
		"advance_per_group": int(tournament_def.get("advance_per_group", 1)),
		"start_week": start_week, "end_week": end_week, "matches": matches}


## 예선 결과를 조 순위에 반영한다.
##
## `results`는 `[{match_id, home_score, away_score}, ...]`
static func apply_group_results(stage: Dictionary, results: Array) -> Dictionary:
	var by_id: Dictionary = {}
	for m in stage.get("matches", []):
		by_id[String(m["id"])] = m

	for r in results:
		var m: Dictionary = by_id.get(String(r["match_id"]), {})
		if m.is_empty():
			continue
		var home: String = String(m["home"])
		var away: String = String(m["away"])
		var hs: int = int(r["home_score"])
		var as_: int = int(r["away_score"])
		for g in stage.get("groups", []):
			for st in g["standings"]:
				var tid: String = String(st["team_id"])
				if tid == home:
					_add_result(st, hs, as_)
				elif tid == away:
					_add_result(st, as_, hs)
	return stage


static func _add_result(st: Dictionary, my_runs: int, their_runs: int) -> void:
	st["runs_for"] = int(st["runs_for"]) + my_runs
	st["runs_against"] = int(st["runs_against"]) + their_runs
	if my_runs > their_runs:
		st["wins"] = int(st["wins"]) + 1
	elif my_runs < their_runs:
		st["losses"] = int(st["losses"]) + 1
	else:
		st["draws"] = int(st["draws"]) + 1


## 조 순위 — 승률 → 득실차 → 다득점 → 팀ID.
##
## ⚠ **팀ID까지 넣는다.** 동률에서 순서가 흔들리면 본선 대진이 달라져
## 결정성이 깨진다
static func rank_group(group: Dictionary) -> Array:
	var v: Array = (group.get("standings", []) as Array).duplicate()
	v.sort_custom(func(a, b) -> bool:
		var ga: int = int(a["wins"]) + int(a["losses"]) + int(a["draws"])
		var gb: int = int(b["wins"]) + int(b["losses"]) + int(b["draws"])
		var pa: float = float(a["wins"]) / float(ga) if ga > 0 else 0.0
		var pb: float = float(b["wins"]) / float(gb) if gb > 0 else 0.0
		if pa != pb:
			return pa > pb
		var da: int = int(a["runs_for"]) - int(a["runs_against"])
		var db: int = int(b["runs_for"]) - int(b["runs_against"])
		if da != db:
			return da > db
		if int(a["runs_for"]) != int(b["runs_for"]):
			return int(a["runs_for"]) > int(b["runs_for"])
		return String(a["team_id"]) < String(b["team_id"]))

	var out: Array = []
	for s in v:
		out.append(String(s["team_id"]))
	return out


## 예선 통과팀을 본선 시드 순으로.
##
## ⚠ **조 1위 블록 → 조 2위 블록 순이다.** 그래야 표준 시드에서 조 1위끼리
## 1라운드에 안 만난다
static func qualifiers(stage: Dictionary) -> Dictionary:
	var group_ranks: Dictionary = {}
	for g in stage.get("groups", []):
		group_ranks[String(g["label"])] = rank_group(g)

	var qualified: Array = []
	for pos in int(stage.get("advance_per_group", 1)):
		for g in stage.get("groups", []):
			var ranked: Array = group_ranks.get(String(g["label"]), [])
			if pos < ranked.size():
				qualified.append(String(ranked[pos]))
	return {"qualified": qualified, "group_ranks": group_ranks}


## 본선 브래킷 — 예선이 끝난 다음 주부터
static func final_bracket(tournament_def: Dictionary, qualified: Array,
		protagonist_team_id: String, season_year: int) -> Dictionary:
	var d: Dictionary = tournament_def.duplicate()
	d["start_week"] = int(tournament_def["start_week"]) \
		+ int(tournament_def.get("qualify_weeks", 0))
	return generate_bracket(d, qualified, protagonist_team_id, season_year)
