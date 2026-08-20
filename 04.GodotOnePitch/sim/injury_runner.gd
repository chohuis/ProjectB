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

## 본문에 몇 줄까지 — 02 `InjuryPanel`의 `PAGE = 100`에 대응한다.
##
## ⚠ **02는 거르개가 있어 100줄이 견딘다.** 04 본문은 글자뿐이라 더 짧다 —
## 실측에서 한 달치가 **114명**이었다
const BODY_ROWS: int = 20

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
		log.append({"day": at_day, "year": int(state.get("season_year", 0)),
			"kind": "warning",
			"fatigue": float(out["warning"]["fatigue"]),
			"risk": float(out["warning"]["risk"])})
		state["body_log"] = log

	return out


## 고를 게 있으면 **묻는다**.
##
## ⚠ **엔진만 만들면 또 도달 불가다** — 결정 화면 대조에서 본 형태 ②.
## 02가 가르는 부상 둘에서만 뜬다
static func ask_treatment(state: Dictionary) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	var cur = p.get("injury", null)
	if not (cur is Dictionary):
		return false
	if not String(cur.get("treatment_choice", "")).is_empty():
		return false
	var t: String = String(cur.get("type", ""))
	if Injury.treatments_for(t).is_empty():
		return false
	Pending.push_once(state, {"type": "injury_treatment", "injury_type": t})
	return true


## 치료를 고른다 — 02 `InjuryTreatmentModal`.
##
## 🔴 **고르는 자리가 없어서 `treatment_choice`가 늘 빈 문자열이었다.**
## `_heal_protagonist`가 그걸 읽어 후유증을 가르는데 늘 `default`로 떨어졌고,
## `trigger_chance`가 읽는 `prior_steroid_used`도 아무도 안 채웠다 —
## **스테로이드의 대가가 게임에 한 번도 안 나타났다.**
##
## ⚠ **한 번만 고른다.** 다시 고르면 비용만 또 빠진다.
## ⚠ **02가 가르는 부상 둘만이다** — 나머지는 고를 게 없다
static func choose_treatment(state: Dictionary, choice: String) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	var cur = p.get("injury", null)
	if cur == null or not (cur is Dictionary):
		return false
	if not String(cur.get("treatment_choice", "")).is_empty():
		return false

	var t: String = String(cur.get("type", ""))
	var opt: Dictionary = Injury.treatment_of(t, choice)
	if opt.is_empty():
		return false

	cur["treatment_choice"] = choice

	# 회복이 줄거나 는다. **0 아래로는 안 간다**
	var delta: int = int(opt.get("weeks_delta", 0))
	if delta != 0:
		cur["weeks_left"] = maxi(int(cur.get("weeks_left", 0)) + delta, 0)

	# 주당 비용은 재정 화면이 읽는다 — 완치 때 `_heal_protagonist`가 지운다
	p["treatment_weekly"] = int(opt.get("cost_weekly", 0))

	var once: int = int(opt.get("cost_once", 0))
	if once > 0:
		p["money"] = int(p.get("money", 0)) - once

	# ⚠ **뒤에 값을 치른다.** `Injury.trigger_chance`가 이걸 읽어 이후
	# 부상 확률을 올린다 — 안 남기면 대가 없는 선택이 된다
	if choice == "steroid":
		p["prior_steroid_used"] = true
	return true


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
	# ⚠ **치료비를 끊는다.** 안 끊으면 다 나은 뒤에도 재정 화면에서
	# 주마다 계속 빠진다 — 화면이 읽는 값이라 조용히 새는 자리다
	p["treatment_weekly"] = 0
	_clear(state, me)

	# ⚠ **등급을 같이 남긴다.** 드래프트가 부상 이력을 심각도로 가르는데
	# (수술 −18 · 중상 −10 · 중등도 −2), 자리를 비우고 나면 여기 말고는
	# 그 등급이 남는 데가 없다 — 안 남기면 부상 항이 늘 0이다
	# ⚠ **해를 같이 남긴다.** `day`는 시즌마다 1로 돌아가므로 날짜만으로는
	# 몇 해 것인지 알 수 없다 — 이력 화면이 옛 부상을 전부 올해로 띄운다
	var log: Array = state.get("body_log", [])
	log.append({"day": at_day, "year": int(state.get("season_year", 0)),
		"kind": "healed", "injury_type": t,
		"severity": String(cur.get("severity", "")), "penalty": penalty})
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


## 후유증을 **세부 능력치에** 먹인다.
##
## ⚠ **`ovr`만 깎으면 다음 성장 주에 지워졌다** (D-4). `NpcGrowth`는 능력치가
## 오르거나 노화가 걸리면 `stats`에서 **OVR을 다시 만든다** — 그 순간 후유증이
## 사라지고, 후유증은 `penalty_applied`로 **한 번만** 먹이므로 영영 안 돌아온다.
## 02도 같은 자리에서 능력치를 깎고 나서 OVR을 다시 만든다
## (`advanceWeek.ts:516-533`).
##
## ⚠ **어느 능력치를 얼마나 깎을지는 지어내지 않는다.** `pitching_ovr`은 가중
## 평균이라 **전부 같은 비율로 줄이면 OVR도 같은 비율로 준다** — 목표 OVR에
## 맞는 비율 하나면 되고, 표를 새로 만들 필요가 없다
## ⚠ **`delta == 0`을 여기서 다시 막지 않는다.** 부르는 자리가 이미
## `if delta != 0.0`으로 거른다 — 여기 또 두면 **아무 때도 안 걸리는 가드**다
static func _apply_npc_penalty(p: Dictionary, delta: float) -> void:
	var is_pitcher: bool = String(p.get("player_type", "pitcher")) == "pitcher"
	var stats: Dictionary = p.get("pitching" if is_pitcher else "batting", {})
	if stats.is_empty():
		return

	var before: float = float(stats.get("ovr", 0.0))
	if before <= 0.0:
		return
	var ratio: float = maxf(before + delta, 1.0) / before
	# ⚠ **`ovr` 칸을 따로 건너뛰지 않는다** — 바로 아래에서 다시 만들므로
	# 건너뛰든 말든 같다. 아무 때도 안 걸리는 갈래를 두지 않는다
	for k in stats:
		if stats[k] is float or stats[k] is int:
			stats[k] = maxf(float(stats[k]) * ratio, 1.0)

	stats["ovr"] = PlayerGen.pitching_ovr(stats) if is_pitcher \
		else PlayerGen.batting_ovr(stats)


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
		# 🔴 **이름을 같이 담는다.** 안 담았더니 월간 부상 리포트에
		# `GEN_TEAM_KBL_DAEJEON_PHANTOMS_1_20270101_Y2027_025` 같은 **원본 ID가
		# 그대로 찍혔다** — 02도 같은 결함을 겪고 고쳤다
		# (`top10Engine.ts:62-66` "표에 없는 팀이 ID로 찍혔다").
		#
		# ⚠ **그 사람이 여기 이미 있다**(`p`) — 나중에 id로 되찾으려면
		# 복무·은햇로 로스터를 떠난 사람을 못 찾는다
		_push_news(state, {"player_id": pid, "injury_type": String(o["injury_type"]),
			"severity": severity, "weeks": int(o["recovery_weeks"]),
			"day": at_day, "team_id": String(p.get("team_id", "")),
			"name": String(p.get("name", "")), "age": int(p.get("age", 0)),
			"position": String(p.get("position", ""))})
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


## 월간 부상 리포트를 **소식 한 통**으로.
##
## 🔴 **`build_news`가 만든 것을 아무도 안 읽고 있었다.** 줄·집계·미리보기를
## 다 만들어 `state["injury_log"]`에 넣는데 **`injury_log`를 읽는 코드가
## 하나도 없었다**(쓰는 자리 하나뿐). 바로 아래 세 줄에서 `BodyReport`는
## `mailbox`로 가는데 이것만 빠졌다.
##
## ⚠ **이번 루프에서 같은 모양을 두 번째 만났다** — 소식 본문도 열여섯
## 자리가 쓰기만 하고 읽는 쪽이 없었다.
##
## ⚠ **id에 달을 넣는다.** 안 넣으면 겹쳐서 소식함에서 하나가 조용히 사라진다.
##
## ⚠ **이미 만든 것을 넘길 수 있다.** `run`은 `build_news`를 이미 불렀는데
## 여기서 또 부르면 **버퍼를 비우는 줄이 위로 올라가는 순간 둘이 갈린다** —
## 그걸 막으려고 뒀던 `if not msg.is_empty()` 가드는 **도달할 수 없었다**
## (변이가 안 잡혔다). 가드를 두는 대신 **갈릴 수 없게** 만든다
static func news_message(state: Dictionary, at_day: int,
		built: Dictionary = {}) -> Dictionary:
	var news: Dictionary = built if not built.is_empty() \
		else build_news(state, at_day)
	if news.is_empty():
		return {}

	var lines: Array[String] = [String(news["preview"]), ""]
	# ⚠ **사람을 줄로 적는다.** 집계만 있으면 누가 다쳤는지 모른다 —
	# 02도 `InjuryPanel`에서 한 사람씩 편다
	#
	# 🔴 **실측에서 114줄이 통째로 나왔다.** 02는 그래서 등급 카드로 거르고
	# 100명씩 끊어 보여준다(`InjuryPanel`의 `PAGE`). 04 본문은 글자라
	# 거르개가 없으니 **상한을 두고 나머지를 센다**.
	#
	# ⚠ **내 팀을 위로 올린다.** 02는 `내 팀` 칩으로 거른다 — 전 리그에서
	# 부상자가 나오는데 관련성을 못 가리면 읽을 이유가 없다
	# ⚠ **1·2군을 한 구단으로 본다** (G-4). 02 `clubKeyOfTeam`이 그렇게 한다 —
	# 내가 1군인데 2군 동료가 다치면 그것도 내 팀 일이다
	var my_team: String = _club_of(
		String(state.get("protagonist", {}).get("team_id", "")))
	var rows: Array = news["rows"]
	rows.sort_custom(func(a, b) -> bool:
		var am: bool = _club_of(String(a.get("team_id", ""))) == my_team
		var bm: bool = _club_of(String(b.get("team_id", ""))) == my_team
		if am != bm:
			return am
		return int(a.get("weeks", 0)) > int(b.get("weeks", 0)))

	var names: Dictionary = state.get("team_names", {})
	for i in mini(rows.size(), BODY_ROWS):
		var r: Dictionary = rows[i]
		var tid: String = String(r.get("team_id", ""))
		# 🔴 **이름이 없으면 id가 그대로 찍힌다.** 실측에서
		# `GEN_TEAM_KBL_DAEJEON_PHANTOMS_1_20270101_Y2027_025`가 나왔다 —
		# 02도 같은 결함을 겪고 고쳤다(`top10Engine.ts:62-66`)
		# 🔴 **아는 사람인지 적는다** (G-4). 02는 `관계` 칩으로 거르는데
		# (`InjuryPanel.svelte:67` `knownCount`) 04 소식은 글자라 칩을 못 단다 —
		# **줄에 붙여서 같은 것을 알린다.** 전 리그에서 부상자가 나오는데
		# 관련성을 못 가리면 읽을 이유가 없다
		var tag: String = _relation_tag(state, String(r.get("player_id", "")))
		lines.append("%s%s  %s%s  %s  %s  %d주" % [
			"● " if _club_of(tid) == my_team else "  ",
			Injury.class_label(String(r.get("class", ""))),
			r.get("name", r.get("player_id", "")),
			"(%s)" % tag if not tag.is_empty() else "",
			r.get("position", ""),
			names.get(tid, tid),
			int(r.get("weeks", 0))])
	if rows.size() > BODY_ROWS:
		lines.append("")
		lines.append("그 밖 %d명." % (rows.size() - BODY_ROWS))

	var year: int = int(state.get("season_year", 0))
	return {
		"id": "msg-injury-%d-w%d" % [year, Calendar.week_of(at_day)],
		"category": "injury", "sender": "의무팀",
		"subject": "%d월 부상 리포트" % Calendar.date_of(year, maxi(at_day, 1))["month"],
		"preview": String(news["preview"]),
		"body": "\n".join(lines),
		"day": at_day, "read": false, "decision": null,
	}


## 한 주 전체. **소식 주에 버퍼를 비운다**
static func run(state: Dictionary, at_day: int = -1) -> Dictionary:
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	# 씨앗은 해와 주차로 — 같은 세이브를 다시 열어도 같은 부상이 난다
	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["injury", int(state.get("season_year", 0)),
		Calendar.week_of(day)])

	var mine: Dictionary = run_protagonist(state, day, rng)
	var npc: Dictionary = run_npcs(state, day, rng)

	# 🔴 **치료를 고를 자리가 없었다** — 후유증 표도 재정의 치료비 줄도
	# 다 있는데 아무도 안 채웠다. 02는 부상이 나면 모달로 묻는다
	ask_treatment(state)

	var news: Dictionary = {}
	if Injury.is_news_week(Calendar.week_of(day)):
		news = build_news(state, day)
		# 담을 게 없어도 버퍼는 비운다 — 안 비우면 다음 달에 지난달 것이 섞인다.
		#
		# ⚠ **읽은 자리에서 바로 비운다.** 아래로 내려 두면 소식을 만드는
		# 쪽이 버퍼를 다시 읽어도 되어 버려서, **다시 읽는 실수가 아무 티도
		# 안 난다**(변이가 안 잡혔다). 여기서 비우면 `news`를 넘기는 길만 남는다
		state[NEWS_KEY] = []
		if not news.is_empty():
			var log: Array = state.get("injury_log", [])
			log.append(news)
			state["injury_log"] = log
			# 🔴 **여기가 빠져 있었다.** 기록만 쌓고 소식함에 안 넣어서
			# 월간 부상 리포트를 아무도 못 봤다 — `injury_log`를 읽는
			# 코드가 하나도 없었다
			# ⚠ **이미 만든 `news`를 넘긴다.** 여기서 다시 만들면 버퍼를
			# 비우는 줄이 위로 올라가는 순간 둘이 갈린다 — 그걸 막는
			# 가드는 도달할 수가 없어 죽은 가드가 된다
			var mail: Array = state.get("mailbox", [])
			mail.append(news_message(state, day, news))
			state["mailbox"] = mail

		# ⚠ **내 몸도 같은 주기로 한 통에 담는다.** 04는 `body_log`를 쌓기만
		# 하고 읽는 곳이 진로 판정 하나뿐이라 경고도 완치도 플레이어에게는
		# 한 번도 안 보였다 — NPC 부상은 월간인데 내 몸만 안 왔다
		var body: Dictionary = BodyReport.message_of(state, day)
		if not body.is_empty():
			var mailbox: Array = state.get("mailbox", [])
			mailbox.append(body)
			state["mailbox"] = mailbox

	return {"protagonist": mine, "npc": npc, "news": news}


## 구단 열쇠 — **1군과 2군을 하나로 본다**. 02 `clubKeyOfTeam`.
## 내가 1군인데 2군 동료가 다치면 그것도 내 팀 일이다
static func _club_of(team_id: String) -> String:
	return team_id.trim_suffix(World.FARM_SUFFIX)


## 아는 사람인가 — 02 `relationTag`(`offseasonReport.ts:77`).
##
## ⚠ **라이벌·동료만이다.** 02 주석: "감독·코치·구단주는 선수 목록에
## 안 나온다" — 부상 소식은 선수 목록이라 그 셋은 여기 올 일이 없다
static func _relation_tag(state: Dictionary, person_id: String) -> String:
	if person_id.is_empty():
		return ""
	var row: Dictionary = RelationshipRunner.row_of(state, person_id)
	if row.is_empty():
		return ""
	var kind: String = String(row.get("kind", ""))
	if kind == Relationship.KIND_RIVAL:
		return "라이벌"
	if kind == Relationship.KIND_TEAMMATE:
		return "동료"
	return ""
