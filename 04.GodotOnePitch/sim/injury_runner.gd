extends RefCounted
class_name InjuryRunner

## 부상 배선 — 세계와 주인공에게 부상을 먹인다. B-3.
##
## 원본: `weekPhases/injuries.ts` · `weekPhases/injuryNews.ts`
##
## ⚠ **02는 완치를 되돌리는 코드가 없었다.** 부상 나면 `careerStatus`를
## `injured`로 바꾸는데 나을 때 `active`로 안 되돌려서, **한 번 다친 NPC는
## 영구히 `injured`로 남았다.** 실측에서 고교 3,015명 중 **1,429명(47%)**이
## 그 상태였고, `active`만 보는 조회에서 절반이 빠지니 로스터·순위·승강·
## 트레이드·FA·드래프트 후보·성장에서 통째로 제외됐다. 시즌 종료에 초기화되면서
## "인원이 롤오버마다 2배가 된다"처럼 보였다.


## 부상 중인 **NPC**가 사는 자리.
##
## ⚠ **주인공 부상은 `protagonist.injury`에 산다.** `DayEngine.appearance_gate`가
## 이미 그 자리를 읽는다 — 여기에도 두면 두 정본이 되고, 언젠가 하나만 갱신된다
const STATE_KEY: String = "injuries"
## 한 달치 소식 버퍼
const NEWS_KEY: String = "injury_news"

const STATUS_ACTIVE: String = "active"
const STATUS_INJURED: String = "injured"

## 스태프가 아직 없다 — 부상 관리는 중립이다 (QUEUE B-2b)
const NEUTRAL_INJURY_MGMT: float = 50.0


static func all_of(state: Dictionary) -> Dictionary:
	return state.get(STATE_KEY, {})


static func _is_me(state: Dictionary, player_id: String) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	return not p.is_empty() and String(p.get("id", "")) == player_id


static func of(state: Dictionary, player_id: String) -> Dictionary:
	if _is_me(state, player_id):
		var inj = state["protagonist"].get("injury", null)
		return inj if inj is Dictionary else {}
	return all_of(state).get(player_id, {})


static func is_hurt(state: Dictionary, player_id: String) -> bool:
	return int(of(state, player_id).get("weeks_left", 0)) > 0


static func _put(state: Dictionary, player_id: String, row: Dictionary) -> void:
	if _is_me(state, player_id):
		state["protagonist"]["injury"] = row
		return
	var all: Dictionary = all_of(state)
	all[player_id] = row
	state[STATE_KEY] = all


static func _clear(state: Dictionary, player_id: String) -> void:
	if _is_me(state, player_id):
		state["protagonist"]["injury"] = null
		return
	var all: Dictionary = all_of(state)
	all.erase(player_id)
	state[STATE_KEY] = all


static func _push_news(state: Dictionary, event: Dictionary) -> void:
	var buf: Array = state.get(NEWS_KEY, [])
	buf.append(event)
	state[NEWS_KEY] = buf


# ── 주인공 ────────────────────────────────────────────────────

## 이번 주 훈련 강도 — 계획이 채운 칸 수로 본다. **회복 훈련은 안 센다**
static func training_intensity(state: Dictionary) -> float:
	var plan: Dictionary = state.get("training_plan", {})
	var filled: int = 0
	var slots: Array = ["primary", "secondary", "secondary2"]
	for key in slots:
		var pid: String = String(plan.get(key, ""))
		if pid.is_empty():
			continue
		if bool(Training.program(pid).get("is_recovery", false)):
			continue
		filled += 1
	return float(filled) / float(slots.size())


## 주인공 한 주. `{}`면 아무 일도 없었다
static func run_protagonist(state: Dictionary, at_day: int,
		rng: RandomNumberGenerator) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty():
		return {}

	var me: String = String(p.get("id", ""))
	var cur: Dictionary = of(state, me)
	var input: Dictionary = {
		"fatigue": float(p.get("fatigue", 0.0)),
		"condition": float(p.get("condition", 100.0)),
		"age": int(p.get("age", 25)),
		"player_type": String(p.get("player_type", "pitcher")),
		"training_intensity": training_intensity(state),
		"consecutive_high_fatigue_weeks":
			int(p.get("consecutive_high_fatigue_weeks", 0)),
		"consecutive_low_morale_weeks":
			int(p.get("consecutive_low_morale_weeks", 0)),
		# 같은 곳을 또 다치는가 — 나은 적이 있는 부위를 본다
		"has_prior_injury_same_area": bool(p.get("has_prior_injury", false)),
		"prior_steroid_used": bool(p.get("prior_steroid_used", false)),
		"injury_prevention": float(p.get("injury_prevention", 1.0)),
		"recovery_boost": float(p.get("recovery_boost", 1.0)),
		"has_injury": not cur.is_empty(),
		"injury_type": String(cur.get("type", "")),
		"recovery_weeks_left": int(cur.get("weeks_left", 0)),
	}

	var out: Dictionary = Injury.calc(input, rng)
	p["consecutive_high_fatigue_weeks"] = int(out["consecutive_high_fatigue_weeks"])
	# ⚠ **부상 배수가 훈련·경기에 닿아야 한다.** 값만 두고 아무도 안 읽으면
	# 다쳤는데 아무 일도 안 일어난다
	p["injury_eff_mod"] = float(out["eff_mod"])

	if bool(out["just_healed"]):
		_heal_protagonist(state, p, me, cur, at_day)
		return out

	if out["injury"] != null:
		var inj: Dictionary = out["injury"]
		var row: Dictionary = {"type": String(inj["type"]),
			"severity": String(inj["severity"]),
			"weeks_left": int(inj["weeks_left"])}
		if bool(out["just_occurred"]):
			row["since_day"] = at_day
			row["total_weeks"] = int(inj["weeks_left"])
			row["source"] = String(out["source"])
			_push_news(state, {"player_id": me, "injury_type": row["type"],
				"severity": row["severity"], "weeks": row["weeks_left"],
				"day": at_day, "mine": true})
		else:
			row["since_day"] = int(cur.get("since_day", at_day))
			row["total_weeks"] = int(cur.get("total_weeks", inj["weeks_left"]))
			row["source"] = String(cur.get("source", ""))
		_put(state, me, row)

	if not out["warning"].is_empty():
		var log: Array = state.get("body_log", [])
		log.append({"day": at_day, "kind": "warning",
			"fatigue": float(out["warning"]["fatigue"]),
			"risk": float(out["warning"]["risk"])})
		state["body_log"] = log

	return out


## 완치 — 후유증을 먹이고 자리를 비운다.
##
## ⚠ **다시 다칠 확률이 오른 채로 남는다.** 그게 `has_prior_injury`다
static func _heal_protagonist(state: Dictionary, p: Dictionary, me: String,
		cur: Dictionary, at_day: int) -> void:
	var t: String = String(cur.get("type", ""))
	var penalty: Dictionary = Injury.permanent_penalty(t,
		String(cur.get("treatment_choice", "")))
	if not penalty.is_empty():
		var pitching: Dictionary = p.get("pitching", {})
		var batting: Dictionary = p.get("batting", {})
		for stat in penalty:
			if pitching.has(stat):
				pitching[stat] = maxf(float(pitching[stat])
					+ float(penalty[stat]), 1.0)
			if batting.has(stat):
				batting[stat] = maxf(float(batting[stat])
					+ float(penalty[stat]), 1.0)
		# ⚠ **OVR은 파생값이다.** 안 다시 내면 후유증이 능력치에만 남고
		# 드래프트·계약이 보는 숫자는 안 움직인다
		PlayerGen.refresh_ovr(pitching, batting)

	p["has_prior_injury"] = true
	_clear(state, me)

	var log: Array = state.get("body_log", [])
	log.append({"day": at_day, "kind": "healed", "injury_type": t,
		"penalty": penalty})
	state["body_log"] = log


# ── NPC ───────────────────────────────────────────────────────

## 그 주에 뛴 사람과 연투 수. **최근 몇 주를 거슬러 센다**
##
## ⚠ **결과가 있는 경기만 센다.** 아직 안 치른 경기를 세면 안 뛴 사람이
## 연투로 잡힌다
static func appearances(schedule: Array, at_day: int,
		weeks: int = 6) -> Dictionary:
	var out: Dictionary = {}
	var from_day: int = maxi(1, at_day - weeks * Calendar.DAYS_PER_WEEK + 1)
	for g in schedule:
		var d: int = int(g.get("day", -1))
		if d < from_day or d > at_day:
			continue
		var result = g.get("result", null)
		if result == null:
			continue
		var week: int = Calendar.week_of(d)
		for line in result.get("player_lines", []):
			var pid: String = String(line.get("player_id", ""))
			if pid.is_empty():
				continue
			if not out.has(pid):
				out[pid] = {"role": String(line.get("role", "batter")),
					"weeks": {}}
			out[pid]["weeks"][week] = true
	return out


## 이번 주까지 몇 주 연속 뛰었나. **끊기면 거기서 멈춘다**
static func consecutive_weeks(weeks: Dictionary, this_week: int) -> int:
	var n: int = 0
	var w: int = this_week - 1
	while weeks.has(w):
		n += 1
		w -= 1
	return n


## 투수는 보직으로 가른다 — 선발과 불펜의 연투 문턱이 다르다
static func _role_of(player: Dictionary, line_role: String) -> String:
	if line_role != "pitcher":
		return "batter"
	var pos: String = String(player.get("role", player.get("position", "")))
	return pos if pos in ["SP", "RP", "CP"] else "RP"


## 세계의 NPC 한 주. `{occurred, healed, retired}`
static func run_npcs(state: Dictionary, at_day: int,
		rng: RandomNumberGenerator) -> Dictionary:
	var me: String = String(state.get("protagonist", {}).get("id", ""))
	var by_id: Dictionary = {}
	for p in SeasonRunner.all_players(state):
		by_id[String(p.get("id", ""))] = p

	var healed: int = _tick_npcs(state, by_id)
	var occurred: Array = _new_npc_injuries(state, by_id, me, at_day, rng)
	return {"occurred": occurred.size(), "healed": healed,
		"hurt_now": all_of(state).size()}


## 회복 틱다운. **나으면 반드시 `active`로 되돌린다**
static func _tick_npcs(state: Dictionary, by_id: Dictionary) -> int:
	# 주인공은 여기 없다 — `protagonist.injury`에 산다
	var all: Dictionary = all_of(state)
	var done: Array = []
	for pid in all:
		var row: Dictionary = all[pid]
		row["weeks_left"] = int(row["weeks_left"]) - 1
		if int(row["weeks_left"]) > 0:
			continue
		done.append(pid)

	for pid in done:
		var row: Dictionary = all[pid]
		var p: Dictionary = by_id.get(pid, {})
		if not p.is_empty():
			# ⚠ **여기가 02가 빠뜨린 줄이다.** 안 되돌리면 한 번 다친 NPC가
			# 영구히 `injured`로 남아 로스터·드래프트·성장에서 통째로 빠진다
			if String(p.get("career_status", STATUS_ACTIVE)) == STATUS_INJURED:
				p["career_status"] = STATUS_ACTIVE
			# 수술·중증은 나아도 흔적이 남는다. **한 번만** 먹인다
			var delta: float = Injury.npc_ovr_penalty(String(row["type"]))
			if delta != 0.0 and not bool(row.get("penalty_applied", false)):
				_apply_npc_penalty(p, delta)
			p["has_prior_injury"] = true
		all.erase(pid)

	state[STATE_KEY] = all
	return done.size()


static func _apply_npc_penalty(p: Dictionary, delta: float) -> void:
	var key: String = "pitching" \
		if String(p.get("player_type", "pitcher")) == "pitcher" else "batting"
	var stats: Dictionary = p.get(key, {})
	if stats.is_empty():
		return
	stats["ovr"] = maxf(float(stats.get("ovr", 0.0)) + delta, 1.0)


static func _new_npc_injuries(state: Dictionary, by_id: Dictionary, me: String,
		at_day: int, rng: RandomNumberGenerator) -> Array:
	var week: int = Calendar.week_of(at_day)
	var apps: Dictionary = appearances(state.get("schedule", []), at_day)
	var hurt: Dictionary = all_of(state)

	var candidates: Array = []
	for pid in apps:
		if pid == me or hurt.has(pid):
			continue
		var p: Dictionary = by_id.get(pid, {})
		if p.is_empty():
			continue
		if String(p.get("career_status", STATUS_ACTIVE)) != STATUS_ACTIVE:
			continue
		candidates.append({"player_id": pid,
			"role": _role_of(p, String(apps[pid]["role"])),
			"age": int(p.get("age", 25)),
			"consecutive_app": consecutive_weeks(apps[pid]["weeks"], week),
			"has_prior_injury": bool(p.get("has_prior_injury", false)),
			"playing_through_severity": ""})

	var occurred: Array = Injury.calc_npc(candidates, rng)
	for o in occurred:
		var pid: String = String(o["player_id"])
		var p: Dictionary = by_id.get(pid, {})
		var severity: String = String(o["severity"])
		# 관리가 낮은 팀은 참고 뛰게 한다 — 그러면 더 크게 다친다
		var through: bool = Injury.plays_through(severity, NEUTRAL_INJURY_MGMT)
		_put(state, pid, {"type": String(o["injury_type"]),
			"severity": severity, "weeks_left": int(o["recovery_weeks"]),
			"total_weeks": int(o["recovery_weeks"]), "since_day": at_day,
			"playing_through": through, "penalty_applied": false})
		# ⚠ **참고 뛰는 사람은 `injured`로 안 바꾼다.** 바꾸면 로스터에서
		# 빠지는데 실제로는 뛰고 있다
		if not through and not p.is_empty():
			p["career_status"] = STATUS_INJURED
		_push_news(state, {"player_id": pid, "injury_type": String(o["injury_type"]),
			"severity": severity, "weeks": int(o["recovery_weeks"]),
			"day": at_day, "team_id": String(p.get("team_id", ""))})
	return occurred


# ── 소식 ──────────────────────────────────────────────────────

## 시즌이 몇 주 남았나. **모르면 0** — 모르는 걸 안다고 하지 않는다
static func weeks_left_in_season(state: Dictionary, at_day: int) -> int:
	# 일정이 없으면 마지막 날이 0이고 `week_of(0)`이 1이라 아래 바닥이 0을
	# 준다 — 따로 막지 않는다
	var last: int = 0
	for g in state.get("schedule", []):
		last = maxi(last, int(g.get("day", 0)))
	return maxi(0, Calendar.week_of(last) - Calendar.week_of(at_day))


## 한 달치 부상 소식. 담을 게 없으면 `{}` — **빈 소식을 매달 보내지 않는다**
static func build_news(state: Dictionary, at_day: int) -> Dictionary:
	var events: Array = state.get(NEWS_KEY, [])
	if events.is_empty():
		return {}
	var left: int = weeks_left_in_season(state, at_day)
	var rows: Array = Injury.worst_by_person(events, left)
	var counts: Dictionary = Injury.count_by_class(rows)
	return {"day": at_day, "weeks_left_in_season": left,
		"preview": Injury.preview_line(counts), "counts": counts,
		"rows": rows, "total": rows.size()}


## 한 주 전체. **소식 주에 버퍼를 비운다**
static func run(state: Dictionary, at_day: int = -1) -> Dictionary:
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	# 씨앗은 해와 주차로 — 같은 세이브를 다시 열어도 같은 부상이 난다
	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["injury", int(state.get("season_year", 0)),
		Calendar.week_of(day)])

	var mine: Dictionary = run_protagonist(state, day, rng)
	var npc: Dictionary = run_npcs(state, day, rng)

	var news: Dictionary = {}
	if Injury.is_news_week(Calendar.week_of(day)):
		news = build_news(state, day)
		if not news.is_empty():
			var log: Array = state.get("injury_log", [])
			log.append(news)
			state["injury_log"] = log
		# 담을 게 없어도 버퍼는 비운다 — 안 비우면 다음 달에 지난달 것이 섞인다
		state[NEWS_KEY] = []

	return {"protagonist": mine, "npc": npc, "news": news}
