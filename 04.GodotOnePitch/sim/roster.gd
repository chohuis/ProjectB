extends RefCounted
class_name Roster

## 로스터 편성 — 로테이션·불펜·라인업. M3-1.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/utils/rosterEngine.ts`
##
## ⚠ **모든 함수가 사전 인자를 받는다.** 원본은 위치 인자 10개였고, 그중
## 하나가 한 칸 밀려 들어가 로테이션이 통째로 안 돌았다 — 둘 다 number라
## 조용히 통과했고 소스 문자열 검사로는 못 잡았다.
##
## 선수 한 명은 사전이다:
##   id · team_id · role · status · player_type · position
##   pitching{ovr} · batting{ovr, eye, speed, power, contact}
##
## 컨디션:
##   fatigue · last_pitched_week · last_start_game_count
##   last_appearance_game_count · consecutive_appearances


## 타순에서 채우는 포지션 순서
const POSITION_PRIORITY: Array[String] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "UT"]

## 부상을 안고 뛸 때의 능력 배수
const PLAY_THROUGH_OVR_MULT: Dictionary = {"light": 0.88, "moderate": 0.70}

## RP는 2연투, CP는 3연투면 의무 휴식
const RP_MAX_CONSECUTIVE: int = 2
const CP_MAX_CONSECUTIVE: int = 3


## ⚠ **"아마추어 셋이 아니면 프로"로 가른다.** 프로 리그를 하나씩 적으면
## ABL·JBL이 빠지고 그 리그만 다른 규칙으로 돈다 — 02에서 승강·FA가
## `LEAGUE_KBL`에만 걸려 있었고, 해외를 열자 상한 34인 1군이 41명까지 불었다
static func _is_amateur(league_id: String) -> bool:
	return league_id == "LEAGUE_HIGHSCHOOL" or league_id == "LEAGUE_UNIVERSITY" \
		or league_id == "LEAGUE_INDEPENDENT"


static func rotation_size_for_league(league_id: String) -> int:
	if league_id == "LEAGUE_HIGHSCHOOL" or league_id == "LEAGUE_UNIVERSITY":
		return 3
	if league_id == "LEAGUE_INDEPENDENT":
		return 4
	return 5


## 선발 의무 휴식 경기 수
static func rotation_rest_games(league_id: String) -> int:
	return 2 if _is_amateur(league_id) else 4


# ── 선수 고르기 ────────────────────────────────────────────────────

## 피로·휴식을 반영한 능력. **로테이션 선발에는 안 쓴다** (아래 참고)
static func effective_ovr(base_ovr: float, condition: Dictionary, current_week: int) -> int:
	if condition.is_empty():
		return int(base_ovr)

	var fatigue: float = condition.get("fatigue", 100.0)
	var fat_f: float = 1.00 if fatigue >= 70.0 else (0.90 if fatigue >= 50.0
		else (0.80 if fatigue >= 30.0 else 0.65))

	var last: int = condition.get("last_pitched_week", 0)
	var weeks_rested: int = (current_week - last) if last > 0 else 99
	var rest_f: float = 1.00 if weeks_rested >= 2 else (0.85 if weeks_rested == 1 else 0.55)

	return int(roundf(base_ovr * fat_f * rest_f))


## 오래 쉰 선수를 앞세우는 보정. 감독 성향이 클수록 크게 걸린다
static func freshness_bonus(last_appearance: Variant, team_game_count: int,
		rotation_sense: float) -> float:
	var games_since: int = 99
	if last_appearance != null:
		games_since = team_game_count - int(last_appearance)
	return float(games_since) * (rotation_sense - 50.0) * 0.3


## 이 팀에서 지금 뛸 수 있는 선수들. 부상 강행은 능력을 깎아서 넣는다
static func team_players(p: Dictionary) -> Array:
	var team_id: String = p.get("team_id", "")
	var injuries: Dictionary = p.get("injuries", {})
	var retired: Array = p.get("retired", [])
	var out: Array = []

	for e in p.get("entities", []):
		if e.get("role", "") != "player" or e.get("team_id", "") != team_id:
			continue
		if retired.has(e.get("id", "")):
			continue
		# 복무 중인 선수는 소속 팀 로스터에 안 뜬다 — 상무에서만 보인다
		if e.get("status", "active") != "active":
			continue

		var inj: Dictionary = injuries.get(e.get("id", ""), {})
		if inj.is_empty():
			out.append(e)
			continue
		if not inj.get("is_playing_through", false):
			continue
		var mult: float = PLAY_THROUGH_OVR_MULT.get(inj.get("severity", ""), 1.0)
		if is_equal_approx(mult, 1.0):
			out.append(e)
			continue
		var patched: Dictionary = e.duplicate(true)
		if patched.has("pitching"):
			patched["pitching"]["ovr"] = int(roundf(float(patched["pitching"].get("ovr", 50)) * mult))
		if patched.has("batting"):
			patched["batting"]["ovr"] = int(roundf(float(patched["batting"].get("ovr", 50)) * mult))
		out.append(patched)
	return out


static func _pitch_ovr(e: Dictionary) -> float:
	return float(e.get("pitching", {}).get("ovr", 0))


static func _bat_ovr(e: Dictionary) -> float:
	return float(e.get("batting", {}).get("ovr", 0))


# ── 로테이션 ───────────────────────────────────────────────────────

## 선발 명단. **순서는 능력순 고정이고 회전은 `build`가 한다.**
##
## ⚠ **컨디션으로 뽑지 않는다.** 원본은 매 경기 "휴식 완료된 선발을 컨디션
## 반영 능력순"으로 다시 뽑았다. 그 값은 매주 흔들리므로 **상위 5명 집합이
## 계속 바뀐다** — 선발이 12명이면 12명이 돌아가며 각자 7~12번만 던졌다.
##
## 실제 야구는 로테이션이 시즌 내내 고정이고 다섯이 각자 28번 던진다.
## 표본이 네 배 두꺼워야 ERA가 능력치를 반영한다 — 실측 OVR–ERA 상관이
## 선발 61명일 때 −0.63인데 96명일 때 **+0.12**(양수)까지 갔다.
##
## 부상자는 `team_players`가 이미 뺐고, 5인 로테이션이면 등판 간격이 자연히
## 네 경기라 휴식 조건도 저절로 맞는다
static func team_rotation(p: Dictionary) -> Array:
	var players: Array = team_players(p)
	var max_rotation: int = p.get("max_rotation", 5)

	var starters: Array = []
	var others: Array = []
	for e in players:
		if e.get("player_type", "") != "pitcher":
			continue
		if e.get("position", "") == "SP":
			starters.append(e)
		else:
			others.append(e)

	starters.sort_custom(func(a, b) -> bool: return _pitch_ovr(a) > _pitch_ovr(b))
	var rotation: Array = []
	for i in mini(max_rotation, starters.size()):
		rotation.append(starters[i]["id"])

	# 로테이션이 안 차면(부상·인원 부족) 남은 선발에서 **가장 오래 쉰 순**으로
	# 메운다. 여기서도 컨디션 반영 능력을 쓰면 그 순간 좋은 선수가 끼어들어
	# 로테이션이 다시 흔들린다
	if rotation.size() < max_rotation:
		var conditions: Dictionary = p.get("conditions", {})
		var resting: Array = []
		for e in starters:
			if not rotation.has(e["id"]):
				resting.append(e)
		resting.sort_custom(func(a, b) -> bool:
			return int(conditions.get(a["id"], {}).get("last_start_game_count", 0)) \
				< int(conditions.get(b["id"], {}).get("last_start_game_count", 0))
		)
		for e in resting:
			if rotation.size() >= max_rotation:
				break
			rotation.append(e["id"])

	# 그래도 모자라면 불펜에서 능력순으로 채운다
	if rotation.size() < max_rotation:
		var current_week: int = p.get("current_week", 0)
		var conds: Dictionary = p.get("conditions", {})
		others.sort_custom(func(a, b) -> bool:
			return effective_ovr(_pitch_ovr(a), conds.get(a["id"], {}), current_week) \
				> effective_ovr(_pitch_ovr(b), conds.get(b["id"], {}), current_week)
		)
		for e in others:
			if rotation.size() >= max_rotation:
				break
			rotation.append(e["id"])

	return rotation


# ── 불펜 ───────────────────────────────────────────────────────────

## `{bullpen, closer}`
##
## ⚠ **마무리가 비면 세이브가 리그 전체에서 0이 된다.** 호출측이 마무리 없이
## 넘기면 엔진이 세이브를 안 붙이고, 오류도 없이 조용히 사라진다 — 실측
## 규정투수 94~110명 전원의 sv가 0이었다. **없으면 제일 좋은 불펜을 쓴다** —
## 실제 구단도 그렇다
static func team_bullpen(p: Dictionary) -> Dictionary:
	var players: Array = team_players(p)
	var rotation: Array = p.get("rotation", [])
	var conditions: Dictionary = p.get("conditions", {})
	var team_game_count: int = p.get("team_game_count", 0)
	var rotation_sense: float = p.get("rotation_sense", 50.0)

	var score := func(e: Dictionary) -> float:
		var c: Dictionary = conditions.get(e["id"], {})
		var last = c.get("last_appearance_game_count", null)
		return _pitch_ovr(e) + freshness_bonus(last, team_game_count, rotation_sense)

	var all_cp: Array = []
	var free_rp: Array = []
	var free_cp: Array = []
	for e in players:
		if e.get("player_type", "") != "pitcher" or rotation.has(e["id"]):
			continue
		var pos: String = e.get("position", "")
		if pos != "RP" and pos != "CP":
			continue
		var consec: int = conditions.get(e["id"], {}).get("consecutive_appearances", 0)
		if pos == "CP":
			all_cp.append(e)
			if consec < CP_MAX_CONSECUTIVE:
				free_cp.append(e)
		elif consec < RP_MAX_CONSECUTIVE:
			free_rp.append(e)

	# 쉬어야 하는 마무리라도 아예 없는 것보다는 낫다
	var cp_pool: Array = free_cp if not free_cp.is_empty() else []
	cp_pool.sort_custom(func(a, b) -> bool: return score.call(a) > score.call(b))
	var rp_sorted: Array = free_rp.duplicate()
	rp_sorted.sort_custom(func(a, b) -> bool: return score.call(a) > score.call(b))

	var closer: String = ""
	if not cp_pool.is_empty():
		closer = cp_pool[0]["id"]
	elif not rp_sorted.is_empty():
		closer = rp_sorted[0]["id"]
	elif not all_cp.is_empty():
		closer = all_cp[0]["id"]

	var pool: Array = []
	for e in free_rp:
		if e["id"] != closer:
			pool.append(e)
	for e in free_cp:
		if e["id"] != closer:
			pool.append(e)
	pool.sort_custom(func(a, b) -> bool: return score.call(a) > score.call(b))

	var bullpen: Array = []
	for e in pool:
		bullpen.append(e["id"])
	return {"bullpen": bullpen, "closer": closer}


# ── 라인업 ─────────────────────────────────────────────────────────

## 타순 아홉.
##
## ⚠ **아홉을 못 채우면 남은 타자의 타석이 부푼다.** 타순을 `lineup[i % n]`으로
## 도는데 n=6이면 한 바퀴가 짧아져 타석이 1.5배가 되고, **능력치가 아니라
## 출전량이 성적을 만든다** — 실측 경기당 7.1타석(정상 4.7), OVR–ERA 상관
## −0.5 → −0.25.
##
## 원본은 야수가 **0명일 때만** 폴백했다. 8명이면 8명짜리 라인업이 그대로
## 나갔고 아무 신호도 없었다. 실제 야구도 모자라면 투수를 세운다
static func team_lineup(p: Dictionary) -> Array:
	var players: Array = team_players(p)
	var conditions: Dictionary = p.get("conditions", {})
	var team_game_count: int = p.get("team_game_count", 0)
	var rotation_sense: float = p.get("rotation_sense", 50.0)

	var batters: Array = []
	var rest: Array = []
	for e in players:
		var t: String = e.get("player_type", "")
		if t == "batter" or t == "twoWay":
			batters.append(e)
		else:
			rest.append(e)

	if batters.size() < 9:
		rest.sort_custom(func(a, b) -> bool: return _bat_ovr(a) > _bat_ovr(b))
		for e in rest:
			if batters.size() >= 9:
				break
			batters.append(e)

	var bat_score := func(e: Dictionary) -> float:
		var c: Dictionary = conditions.get(e["id"], {})
		var fatigue: float = c.get("fatigue", 100.0) if not c.is_empty() else 100.0
		var fat_f: float = 1.00 if fatigue >= 70.0 else (0.90 if fatigue >= 50.0 else 0.78)
		var last = c.get("last_appearance_game_count", null)
		return roundf(_bat_ovr(e) * fat_f) + freshness_bonus(last, team_game_count, rotation_sense)

	# 포지션마다 제일 나은 한 명 — 포수 둘에 유격수 0명이면 수비가 안 된다
	var used: Dictionary = {}
	var picked: Array = []
	for pos in POSITION_PRIORITY:
		var best: Dictionary = {}
		var best_score: float = -1e9
		for e in batters:
			if used.has(e["id"]) or e.get("position", "") != pos:
				continue
			var s: float = bat_score.call(e)
			if s > best_score:
				best_score = s
				best = e
		if not best.is_empty():
			used[best["id"]] = true
			picked.append(best["id"])
		if picked.size() >= 9:
			break

	if picked.size() < 9:
		var remaining: Array = []
		for e in batters:
			if not used.has(e["id"]):
				remaining.append(e)
		remaining.sort_custom(func(a, b) -> bool: return bat_score.call(a) > bat_score.call(b))
		for e in remaining:
			if picked.size() >= 9:
				break
			picked.append(e["id"])

	return _sort_batting_order(picked, players)


## 1번은 눈·발, 3·4번은 힘·컨택
static func _sort_batting_order(ids: Array, players: Array) -> Array:
	if ids.is_empty():
		return []
	var by_id: Dictionary = {}
	for e in players:
		by_id[e["id"]] = e

	var rows: Array = []
	for id in ids:
		var b: Dictionary = by_id.get(id, {}).get("batting", {})
		rows.append({
			"id": id,
			"lead": float(b.get("eye", 50)) + float(b.get("speed", 50)),
			"power": float(b.get("power", 50)) + float(b.get("contact", 50)),
		})

	var lead: Dictionary = rows[0]
	for r in rows:
		if r["lead"] > lead["lead"]:
			lead = r
	rows.erase(lead)
	rows.sort_custom(func(a, b) -> bool: return a["power"] > b["power"])

	var out: Array = [lead["id"]]
	for r in rows:
		out.append(r["id"])
	return out


# ── 조립 ───────────────────────────────────────────────────────────

## `{rotation, bullpen, closer, lineup}`
##
## ⚠ **회전은 여기서 한다.** `team_rotation`은 능력순 고정 명단을 준다
## (그건 의도다 — 매주 흔들리면 표본이 얇아져 ERA가 능력치를 못 따라간다).
## 그 명단을 **경기마다 회전시켜야** 선발이 돌아간다. 회전을 안 하면 1번이
## 매 경기 나간다 — 원본에서 인자가 한 칸 밀려 실제로 그랬다
static func build(p: Dictionary) -> Dictionary:
	var base: Array = team_rotation(p)
	var rot_idx: int = p.get("rot_idx", 0)

	var rotation: Array = base
	if not base.is_empty():
		var k: int = rot_idx % base.size()
		rotation = base.slice(k) + base.slice(0, k)

	var pen_params: Dictionary = p.duplicate()
	pen_params["rotation"] = rotation
	var pen: Dictionary = team_bullpen(pen_params)

	return {
		"rotation": rotation,
		"bullpen": pen["bullpen"],
		"closer": pen["closer"],
		"lineup": team_lineup(p),
	}
