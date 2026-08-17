extends RefCounted
class_name RelationshipRunner

## 관계도 배선 — 세계에서 맥락을 모아 관계에 먹인다. B-2.
##
## 원본: `usecases/relationships.ts`
##
## ⚠ **02는 이 자리에서 주 인덱스를 하나 어긋나게 읽었다.** 주 경계 처리가
## `week === weekNum`으로 경기를 찾았는데 그 주는 **아직 안 치른 주**였다.
## 결과가 영영 `null`이라 **감독·동료 관계가 전 커리어에 걸쳐 한 번도 안
## 움직였다.** 훈련에 걸린 코치 관계는 멀쩡해서 "도는 것 같은데 이상하다"로만
## 보였고, 리그 경기 결과 소식은 한 통도 온 적이 없었다.
##
## 여기서는 `at_day`가 **방금 끝난 주의 마지막 날**이다(`DayEngine.week_end_days`가
## 그렇게 준다) — 그 주 경기는 이미 치러져 있다. 인덱스를 자기 손으로 세지 않는다.


## 관계 행이 사는 자리
const STATE_KEY: String = "relationships"
const LOG_KEY: String = "relation_log"

## 완봉 판정 — 9이닝 27아웃
const COMPLETE_GAME_OUTS: int = 27

const OUTS_PER_GAME: float = 27.0


static func rows_of(state: Dictionary) -> Array:
	return state.get(STATE_KEY, [])


static func row_of(state: Dictionary, person_id: String) -> Dictionary:
	for r in rows_of(state):
		if String(r["person_id"]) == person_id:
			return r
	return {}


static func _index(state: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for r in rows_of(state):
		out[String(r["person_id"])] = r
	return out


static func _append(state: Dictionary, rows: Array) -> void:
	var all: Array = rows_of(state)
	all.append_array(rows)
	state[STATE_KEY] = all


# ── 소속 맞추기 ───────────────────────────────────────────────

## 지금 팀에 함께 있는 사람들. **지금은 팀동료뿐이다** —
## 감독·코치·구단주는 04에 스태프가 아직 없다(QUEUE B-2b)
static func present_of(state: Dictionary) -> Array:
	var p: Dictionary = state.get("protagonist", {})
	# 소속이 없으면 아래 로스터 조회가 빈 배열을 준다 — 따로 막지 않는다
	var team: String = String(p.get("team_id", ""))
	var me: String = String(p.get("id", ""))
	var out: Array = []
	for q in World.roster_of(state.get("world", {}), team):
		if String(q.get("id", "")) == me:
			continue
		if String(q.get("career_status", "active")) != "active":
			continue
		out.append({"person_id": String(q.get("id", "")),
			"kind": Relationship.KIND_TEAMMATE})

	# 스태프 — 감독·코치·구단주.
	#
	# ⚠ **이게 없으면 관계도가 팀동료만 돈다.** 엔진은 다섯 갈래를 다 갖고
	# 검사도 다 돼 있는데 **행이 생기는 자리가 없어서** 감독·코치가 커리어
	# 내내 안 나타났다 — 보직 배정·훈련 효율·재계약이 전부 중립으로 돌았다
	for s in Staff.of(state.get("world", {}), team):
		out.append({
			"person_id": String(s.get("id", "")),
			"kind": String(s.get("role", "")),
			# 코치는 전문 분야가 있어야 훈련 종목과 이어진다
			"specialty": String(s.get("specialty", "")),
		})
	return out


## 관계도를 현재 소속과 맞춘다 — **주간 루프에서 매주 부른다.**
##
## ⚠ **팀이 바뀌는 자리마다 훅을 박지 않는다.** 주인공 `team_id`를 바꾸는
## 곳이 졸업·드래프트·재계약·이적·입대로 최소 다섯이고, **하나만 빠뜨려도
## 관계가 옛 팀에 남는다. 그리고 그 누락은 조용하다.**
##
## 여기서는 "together인데 `last_team`이 지금 팀이 아니다"를 팀 변경의
## 증거로 읽는다 — 어느 경로로 바뀌었든 다음 주에 스스로 복구된다
##
## `{created, reunited, left_behind}`
static func reconcile(state: Dictionary, at_day: int, draft_round: int = 0,
		drafted_context: bool = false) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var team: String = String(p.get("team_id", ""))
	if team.is_empty():
		return {"created": 0, "reunited": 0, "left_behind": 0}

	var left_behind: int = _leave_stale_teams(state, team)

	var by_id: Dictionary = _index(state)
	var present: Array = present_of(state)
	var unknown: Array = []
	var reunited: int = 0
	for x in present:
		var pid: String = String(x["person_id"])
		if not by_id.has(pid):
			unknown.append(x)
			continue
		var row: Dictionary = by_id[pid]
		if String(row["contact"]) == Relationship.CONTACT_APART:
			# ⚠ **재회다 — 값은 손대지 않는다.** 감쇠는 이동·오프시즌에 이미
			# 걸렸다. 감쇠된 값에서 재개되는 것이 "옛 감독을 프로에서 다시
			# 만나는" 서사를 살리는 지점이다
			row["contact"] = Relationship.CONTACT_TOGETHER
			row["last_team"] = team
			row["updated_day"] = at_day
			reunited += 1

	var created: Array = []
	if not unknown.is_empty():
		var season: int = int(state.get("season_year", 0))
		var seed_value: int = int(state.get("seed", 0))
		# ⚠ **전문 분야를 같이 옮긴다.** 여기서 빈 문자열로 못박으면
		# `effects_of(state, 전문분야)`가 영영 아무 코치도 못 찾는다 —
		# 훈련 종목과 코치를 잇는 유일한 끈이다
		var specialty_of: Dictionary = {}
		for x in unknown:
			specialty_of[String(x["person_id"])] = String(x.get("specialty", ""))

		for row in Relationship.init_values(seed_value, unknown, draft_round,
				drafted_context):
			created.append({
				"person_id": String(row["person_id"]),
				"kind": String(row["kind"]), "value": int(row["value"]),
				"contact": Relationship.CONTACT_TOGETHER,
				"specialty": String(specialty_of.get(String(row["person_id"]), "")),
				"met_season": season, "met_team": team, "last_team": team,
				"memories": [], "updated_day": at_day,
			})
		_append(state, created)

	return {"created": created.size(), "reunited": reunited,
		"left_behind": left_behind}


## 두고 온 팀 사람들 — 감쇠하고 `apart`로 넘긴다.
##
## ⚠ **감쇠를 먼저 하고 그 다음에 표시한다.** 뒤집으면 다음 주에도
## `together`가 아닌 채로 남거나 감쇠가 두 번 걸린다
static func _leave_stale_teams(state: Dictionary, team: String) -> int:
	var stale: Array = []
	for r in rows_of(state):
		if String(r["contact"]) != Relationship.CONTACT_TOGETHER:
			continue
		var last: String = String(r.get("last_team", ""))
		# 라이벌은 `last_team`이 비어 있다 — 소속으로 만난 사이가 아니다
		if last.is_empty() or last == team:
			continue
		stale.append(r)
	if stale.is_empty():
		return 0

	var by_id: Dictionary = {}
	for d in Relationship.move_decay(stale):
		by_id[String(d["person_id"])] = int(d["value"])
	for r in stale:
		var pid: String = String(r["person_id"])
		if by_id.has(pid):
			r["value"] = int(by_id[pid])
		r["contact"] = Relationship.CONTACT_APART
	return stale.size()


# ── 이번 주 맥락 ──────────────────────────────────────────────

## 훈련 슬롯 하나가 그 주의 영역이다.
##
## ⚠ **첫 칸만 본다.** 세 칸을 다 세면 코치 셋이 같이 오르고, 그러면
## "담당 영역일 때만"이라는 규칙이 사실상 없어진다
static func training_area_of(state: Dictionary) -> String:
	var plan: Dictionary = state.get("training_plan", {})
	var primary: String = String(plan.get("primary", ""))
	if primary.is_empty():
		return ""
	var program: Dictionary = Training.program(primary)
	return Relationship.training_area_of(String(program.get("focus", "")))


static func _plan_is_empty(plan: Dictionary) -> bool:
	for key in ["primary", "secondary", "secondary2"]:
		if not String(plan.get(key, "")).is_empty():
			return false
	return true


## 방금 끝난 주의 맥락. **`at_day`가 그 주의 마지막 날이다**
static func context_of(state: Dictionary, at_day: int,
		ovr_delta: float = 0.0) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var me: String = String(p.get("id", ""))
	var team: String = String(p.get("team_id", ""))
	var from_day: int = at_day - Calendar.DAYS_PER_WEEK + 1

	var pitched: bool = false
	var won: bool = false
	var team_played: bool = false
	var team_won: bool = false
	var shutout: bool = false
	var er: float = 0.0
	var outs: int = 0
	var faced: Array = []

	for g in state.get("schedule", []):
		var d: int = int(g.get("day", -1))
		if d < from_day or d > at_day:
			continue
		if String(g.get("home", "")) != team and String(g.get("away", "")) != team:
			continue
		var result = g.get("result", null)
		if result == null:
			continue
		team_played = true
		# 무승부는 `loser_id`가 비어 있다 — 승리로 세면 없던 승리가 생긴다
		var my_win: bool = String(result.get("winner_id", "")) == team \
			and not String(result.get("loser_id", "")).is_empty()
		if my_win:
			team_won = true

		# 맞대결 상대 = **실제로 나와 맞붙어 던진 투수**.
		#
		# ⚠ **상대 선발 하나만 잡는다.** 불펜까지 라이벌로 세면 관계가
		# 폭증한다 — 02가 이닝 최다 한 명으로 자른 이유가 그것이다.
		#
		# ⚠ **역할이 아니라 실측으로 잡는다.** 02의 옛 코드는 시나리오에
		# 박아 둔 `emotionRole="rival"` id를 봐서 **고교에서만 돌았다**
		var best_id: String = ""
		var best_outs: int = -1
		var pitched_here: bool = false
		# ⚠ **내 팀 투수는 상대가 아니다** (P-11). `player_lines`는 양 팀 줄을
		# 합쳐 놓아 어느 쪽인지가 사라진다 — 그래서 **우리 불펜이 나보다 많이
		# 던지면 그가 "라이벌"로 잡혔다.** 한 해 실측에서 아홉 번 중 다섯 번이
		# 그랬고, 그 자리를 뺏기는 만큼 **진짜 상대 선발이 안 잡혔다.**
		#
		# ⚠ **02도 같은 결함이 있다**(`advanceWeek.ts:1215-1222`는
		# `playerId !== protagonist.id`만 본다). 하지만 "라이벌"이라는 말 자체가
		# 상대편을 뜻한다 — 이건 옮길 값이 아니라 명백한 결함이라 고쳤다.
		#
		var mates: Dictionary = {}
		for mate in World.roster_of(state.get("world", {}), team):
			mates[String(mate.get("id", ""))] = true

		for line in result.get("player_lines", []):
			if String(line.get("role", "")) != "pitcher":
				continue
			var pid: String = String(line.get("player_id", ""))
			if pid != me and mates.has(pid):
				continue
			if pid != me:
				var outs_of: int = CareerSummary.innings_to_outs(
					float(line.get("ip", 0.0)))
				if outs_of > best_outs:
					best_outs = outs_of
					best_id = String(line.get("player_id", ""))
				continue
			pitched = true
			pitched_here = true
			# ⚠ **이닝은 야구 표기(6.1 = 6⅓)다.** 그냥 더하면 어긋난다
			var game_outs: int = CareerSummary.innings_to_outs(
				float(line.get("ip", 0.0)))
			var game_er: float = float(line.get("er", 0.0))
			er += game_er
			outs += game_outs
			if my_win:
				won = true
			if game_outs >= COMPLETE_GAME_OUTS and game_er == 0.0:
				shutout = true

		# ⚠ **내가 던진 그 경기만 맞대결이다.** 주 누적(`pitched`)으로 보면
		# 한 번이라도 던진 주에는 벤치에 앉은 날의 상대 선발까지 라이벌이
		# 된다 — 02도 그 경기의 `myLine`이 있을 때만 잡는다
		if pitched_here and not best_id.is_empty() and not faced.has(best_id):
			faced.append(best_id)

	var plan: Dictionary = state.get("training_plan", {})
	var skipped: bool = _plan_is_empty(plan)
	return {
		"pitched": pitched, "won": won,
		"era": (er * OUTS_PER_GAME / float(outs)) if outs > 0 else 0.0,
		"complete_shutout": shutout,
		"team_played": team_played, "team_won": team_won,
		"ovr_delta": ovr_delta,
		"training_done": not skipped, "training_skipped": skipped,
		"training_area": training_area_of(state),
		"faced_rivals": faced,
	}


# ── 주간 ──────────────────────────────────────────────────────

static func _apply(state: Dictionary, deltas: Array, at_day: int) -> void:
	if deltas.is_empty():
		return
	var by_id: Dictionary = _index(state)
	for d in deltas:
		var row: Dictionary = by_id.get(String(d["person_id"]), {})
		if row.is_empty():
			continue
		row["value"] = int(d["value"])
		row["updated_day"] = at_day


## ⚠ **라벨이 바뀐 것만 남긴다.** 값이 1 움직일 때마다 적으면 소식함이
## 관계 통보로 찬다
static func _log(state: Dictionary, deltas: Array, at_day: int,
		phase: String) -> void:
	var log: Array = state.get(LOG_KEY, [])
	var by_id: Dictionary = _index(state)
	for d in deltas:
		if not bool(d["label_changed"]):
			continue
		var row: Dictionary = by_id.get(String(d["person_id"]), {})
		log.append({"day": at_day, "phase": phase,
			"person_id": String(d["person_id"]),
			"kind": String(row.get("kind", "")),
			"label": String(d["label"]), "prev_label": String(d["prev_label"])})
	if not log.is_empty():
		state[LOG_KEY] = log


## 처음 맞붙은 상대의 행을 만든다. **사건이 관계의 시작이다**(02 확정).
##
## ⚠ **`reconcile`이 못 만든다.** 그쪽은 같은 팀에 있는 사람만 본다 —
## 라이벌은 상대 팀이라 영영 안 걸린다. 그래서 이 자리가 없으면
## `_rival_weekly`가 아무 행도 못 찾아 **라이벌이 0명으로 남는다.**
##
## ⚠ **`contact`는 `together`다.** 맞대결은 지금 일어난 일이라 감쇠 대상이
## 아니다 — `apart`로 두면 만든 그 주부터 식는다
static func _meet_rivals(state: Dictionary, faced: Array) -> int:
	if faced.is_empty():
		return 0
	var known: Dictionary = _index(state)
	var fresh: Array = []
	for pid in faced:
		if not known.has(String(pid)):
			fresh.append({"person_id": String(pid),
				"kind": Relationship.KIND_RIVAL})
	if fresh.is_empty():
		return 0

	var p: Dictionary = state.get("protagonist", {})
	var season: int = int(state.get("season_year", 0))
	var rows: Array = []
	# 지명 보정은 안 건다 — 감독에게만 붙는 값이라 라이벌엔 뜻이 없다
	for row in Relationship.init_values(int(state.get("seed", 0)), fresh):
		rows.append({
			"person_id": String(row["person_id"]),
			"kind": String(row["kind"]), "value": int(row["value"]),
			"contact": Relationship.CONTACT_TOGETHER,
			"specialty": "", "met_season": season,
			"met_team": String(p.get("team_id", "")),
			"last_team": String(p.get("team_id", "")),
			"memories": [], "updated_day": int(state.get("day", 0)),
		})
	_append(state, rows)
	return rows.size()


## 한 주의 관계 갱신. 소속 맞추기 → 맥락 → 갱신.
##
## `relation_mod`는 코치 소통력(스태프가 붙으면 채운다) — 없으면 중립
static func run(state: Dictionary, at_day: int = -1, ovr_delta: float = 0.0,
		relation_mod: float = 1.0) -> Array:
	if state.get("protagonist", {}).is_empty():
		return []
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))

	reconcile(state, day)
	var ctx: Dictionary = context_of(state, day, ovr_delta)
	_meet_rivals(state, ctx.get("faced_rivals", []))

	var rows: Array = rows_of(state)
	if rows.is_empty():
		return []

	var deltas: Array = Relationship.weekly(int(state.get("seed", 0)), rows,
		ctx, relation_mod)
	_apply(state, deltas, day)
	_log(state, deltas, day, "weekly")
	return deltas


# ── 시즌 종료 ─────────────────────────────────────────────────

## 시즌 총평. `team_rank_pct`는 0.0(1위) ~ 1.0(꼴찌)
static func run_season(state: Dictionary, era: float, team_rank_pct: float,
		pitched_any: bool, at_day: int = -1) -> Array:
	var rows: Array = rows_of(state)
	if rows.is_empty():
		return []
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	var deltas: Array = Relationship.season(rows, era, team_rank_pct, pitched_any)
	_apply(state, deltas, day)
	_log(state, deltas, day, "season")
	return deltas


# ── 조회 ──────────────────────────────────────────────────────

## 관계가 판정을 얼마나 바꾸는가. 화면·보직 배정·훈련이 이걸 읽는다
static func effects_of(state: Dictionary, coach_specialty: String = "") -> Dictionary:
	var manager: int = 0
	var owner: int = 0
	var coach: int = 0
	for r in rows_of(state):
		# 헤어진 사람이 내 보직을 정하지 않는다
		if String(r["contact"]) != Relationship.CONTACT_TOGETHER:
			continue
		match String(r["kind"]):
			Relationship.KIND_MANAGER:
				manager = int(r["value"])
			Relationship.KIND_OWNER:
				owner = int(r["value"])
			Relationship.KIND_COACH:
				# 이번 주 훈련 영역을 맡은 코치만 본다
				if not coach_specialty.is_empty() \
						and String(r.get("specialty", "")) == coach_specialty:
					coach = int(r["value"])
	return Relationship.effects(manager, coach, owner)


## 상대가 은퇴·소멸했다 — 값을 동결하고 기록으로 남긴다
static func end_for(state: Dictionary, person_ids: Array) -> int:
	var ended: int = 0
	for r in rows_of(state):
		if not person_ids.has(String(r["person_id"])):
			continue
		if String(r["contact"]) == Relationship.CONTACT_ENDED:
			continue
		r["contact"] = Relationship.CONTACT_ENDED
		ended += 1
	return ended


## 사건을 관계에 각인한다
static func add_memory(state: Dictionary, person_id: String,
		memory: Dictionary) -> bool:
	var row: Dictionary = row_of(state, person_id)
	if row.is_empty():
		return false
	var merged: Array = row.get("memories", [])
	merged.append(memory)
	row["memories"] = Relationship.trim_memories(merged)
	return true
