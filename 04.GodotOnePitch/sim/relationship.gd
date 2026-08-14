extends RefCounted
class_name Relationship

## 관계도 — 감독·코치·구단주·동료·라이벌. B-2.
##
## 원본: `relationship.rs` · `usecases/relationships.ts`
##
## 주인공 기준 1:N. **NPC끼리의 관계는 만들지 않는다.**
##
## ⚠ **이것이 구 감정 시스템(9축)을 대체한 이유**가 02에 적혀 있다. 9축은
## 라이벌 서사엔 풍부했지만 **판정에 쓸 단일 근거가 없었다** — "감독이 날
## 쓰는가"를 물으면 trust인지 dependence인지 매번 정해야 했다. 여기선 값
## 하나로 판정하고, 서사는 기억(memories)과 상대 성향이 맡는다.
##
## 값 −100~100. **플레이어에게 숫자를 보여주지 않는다** — 라벨만 보인다.


const RULES_PATH: String = "res://data/relationship_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("관계 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


# ── 라벨 (여기가 정본) ────────────────────────────────────────
#
# ⚠ **규칙 파일이 아니라 코드에 둔다.** 경계는 튜닝 수치가 아니라 구조다.
# 화면·판정·소식이 전부 이 표를 읽으므로 한쪽만 고치면 "화면엔 신뢰인데
# 감독은 안 쓰는" 상태가 되고, 그건 조용히 굴러간다.

## `[하한, 상한, 라벨, 색조]`
const LABELS: Array[Array] = [
	[-100, -61, "적대", "hostile"],
	[-60, -31, "불신", "distrust"],
	[-30, -11, "서먹", "cold"],
	[-10, 10, "중립", "neutral"],
	[11, 34, "우호", "friendly"],
	[35, 64, "신뢰", "trusted"],
	[65, 100, "각별", "close"],
]

## 중립이 몇 번째인가 — `label_step`이 여기서 거리를 잰다
const NEUTRAL_INDEX: int = 3

const VALUE_MIN: int = -100
const VALUE_MAX: int = 100


static func clamp_value(v: float) -> int:
	return clampi(int(roundf(v)), VALUE_MIN, VALUE_MAX)


static func label_of(value: int) -> String:
	var v: int = clampi(value, VALUE_MIN, VALUE_MAX)
	for b in LABELS:
		if v >= int(b[0]) and v <= int(b[1]):
			return String(b[2])
	return String(LABELS[NEUTRAL_INDEX][2])


static func tone_of(value: int) -> String:
	var v: int = clampi(value, VALUE_MIN, VALUE_MAX)
	for b in LABELS:
		if v >= int(b[0]) and v <= int(b[1]):
			return String(b[3])
	return String(LABELS[NEUTRAL_INDEX][3])


## 중립을 0으로 둔 라벨 거리. −3(적대) ~ +3(각별).
##
## ⚠ **효과 배선은 값이 아니라 이 단계로 센다.** 관계값은 플레이어에게
## 안 보이고 라벨만 보이므로, 판정도 라벨로 해야 "각별인데 왜 안 써주지"가
## 안 생긴다
static func label_step(value: int) -> int:
	var v: int = clampi(value, VALUE_MIN, VALUE_MAX)
	for i in LABELS.size():
		if v >= int(LABELS[i][0]) and v <= int(LABELS[i][1]):
			return i - NEUTRAL_INDEX
	return 0


# ── 상대 성향 ─────────────────────────────────────────────────
#
# 구 감정 엔진의 disposition을 그대로 가져왔다. **같은 사건에 사람마다
# 다르게 반응하게 만드는 유일한 축**이라 관계도에서도 필요하다.

const DISPOSITION_FIELDS: PackedStringArray = [
	"competitive", "prideful", "nurturing", "territorial", "volatile",
]
const DISPOSITION_MAX: int = 100


## ⚠ **사람마다 독립 스트림이다.** 한 흐름으로 순차 생성하면 앞쪽 인원이
## 바뀔 때 뒤가 전부 흔들려 디버깅이 불가능해진다 (02 _ledger P6-4)
static func disposition(world_seed: int, person_id: String) -> Dictionary:
	var r := RandomNumberGenerator.new()
	r.seed = Rng.mix([world_seed, "disposition", person_id])
	var out: Dictionary = {}
	for k in DISPOSITION_FIELDS:
		out[k] = r.randi_range(0, DISPOSITION_MAX)
	return out


# ── 효과 ──────────────────────────────────────────────────────

const NEUTRAL_LABEL: String = "중립"

## 관계가 판정을 얼마나 바꾸는가. `{role_ovr_bias, training_bonus, ...}`
static func effects(manager_value: int, coach_value: int,
		owner_value: int) -> Dictionary:
	var e: Dictionary = rules().get("effect", {})
	var m: int = label_step(manager_value)
	var c: int = label_step(coach_value)
	var o: int = label_step(owner_value)
	return {
		"role_ovr_bias": float(m) * float(e.get("manager_role_ovr_per_step", 0.0)),
		"training_bonus": float(c) * float(e.get("coach_training_per_step", 0.0)),
		"contract_bonus": float(o) * float(e.get("owner_contract_per_step", 0.0)),
		"manager_step": m, "coach_step": c, "owner_step": o,
		"manager_label": label_of(manager_value),
		"coach_label": label_of(coach_value),
		"owner_label": label_of(owner_value),
	}


static func neutral_effects() -> Dictionary:
	return effects(0, 0, 0)


## 훈련 어휘 → 코치 전문 영역. 규칙 파일이 정본이다 — 매핑에 없으면 `""`
## (그 주는 어느 코치도 안 오른다)
static func training_area_of(focus: String) -> String:
	return String(rules().get("training_area", {}).get(focus, ""))


# ── 변화 한 건 ────────────────────────────────────────────────

## ⚠ **라벨 변화가 소식을 띄울 유일한 근거다.** 값이 1 움직일 때마다
## 알리면 소식함이 관계 통보로 찬다
static func _delta(person_id: String, prev: float, next_raw: float) -> Dictionary:
	var prev_i: int = clamp_value(prev)
	var next_i: int = clamp_value(next_raw)
	var label: String = label_of(next_i)
	var prev_label: String = label_of(prev_i)
	return {
		"person_id": person_id, "delta": next_i - prev_i,
		"value": next_i, "prev_value": prev_i,
		"label": label, "prev_label": prev_label,
		"label_changed": label != prev_label,
	}


# ── 초기값 ────────────────────────────────────────────────────

const KIND_MANAGER: String = "manager"
const KIND_COACH: String = "coach"
const KIND_OWNER: String = "owner"
const KIND_TEAMMATE: String = "teammate"
const KIND_RIVAL: String = "rival"

const CONTACT_TOGETHER: String = "together"
const CONTACT_APART: String = "apart"
const CONTACT_ENDED: String = "ended"


## 초기 편차 폭 — 검사가 "한 번도 안 움직였다"를 이걸로 가른다
static func init_spread() -> int:
	return int(rules().get("init", {}).get("personality_spread", 0))


static func _draft_bonus(draft_round: int, drafted_context: bool) -> float:
	if not drafted_context:
		return 0.0
	var b: Dictionary = rules().get("init", {}).get("draft_bonus", {})
	if draft_round == 1:
		return float(b.get("round1", 0.0))
	if draft_round == 2:
		return float(b.get("round2", 0.0))
	if draft_round >= 3:
		return float(b.get("round3plus", 0.0))
	return float(b.get("undrafted", 0.0))


## 새로 만난 사람들의 초기 관계값. 사용자 확정 **중립 0 + 소폭 편차**.
##
## `people`은 `[{person_id, kind}, ...]`
static func init_values(world_seed: int, people: Array, draft_round: int = 0,
		drafted_context: bool = false) -> Array:
	var init: Dictionary = rules().get("init", {})
	var base: float = float(init.get("base", 0.0))
	var spread: float = float(init.get("personality_spread", 0.0))
	var bonus: float = _draft_bonus(draft_round, drafted_context)

	var out: Array = []
	for person in people:
		var pid: String = String(person["person_id"])
		var disp: Dictionary = disposition(world_seed, pid)
		# 품이 넓으면(nurturing) 처음부터 호의적, 경계심(territorial)이 세면 서먹하다
		var lean: float = float(int(disp["nurturing"]) - int(disp["territorial"])) \
			/ float(DISPOSITION_MAX)
		var v: float = base + lean * spread
		# ⚠ **지명 보정은 감독에게만.** 코치·동료까지 붙이면 1라운드로 들어간
		# 신인이 라커룸 전체의 사랑을 받고 시작한다
		if String(person["kind"]) == KIND_MANAGER:
			v += bonus
		var value: int = clamp_value(v)
		out.append({"person_id": pid, "kind": String(person["kind"]),
			"value": value, "label": label_of(value)})
	return out


# ── 주간 ──────────────────────────────────────────────────────

## 코치 소통력이 관계 속도를 미는 폭
const MOD_MIN: float = 0.75
const MOD_MAX: float = 1.30


static func _manager_weekly(w: Dictionary, ctx: Dictionary, grew: bool) -> float:
	var m: Dictionary = w.get("manager", {})
	var d: float = 0.0
	if bool(ctx.get("pitched", false)):
		d += float(m.get("win", 0.0)) if bool(ctx.get("won", false)) \
			else float(m.get("loss", 0.0))
		var era: float = float(ctx.get("era", 0.0))
		if era < float(w.get("quality_era", 0.0)):
			d += float(m.get("quality_start", 0.0))
		if era > float(w.get("blowup_era", 0.0)):
			d += float(m.get("blowup", 0.0))
		if bool(ctx.get("complete_shutout", false)):
			d += float(m.get("complete_shutout", 0.0))
	if bool(ctx.get("training_skipped", false)):
		d += float(m.get("training_skip", 0.0))
	if grew:
		d += float(m.get("growth", 0.0))
	return d


static func _coach_weekly(w: Dictionary, ctx: Dictionary, grew: bool,
		specialty: String) -> float:
	var c: Dictionary = w.get("coach", {})
	var d: float = 0.0
	var area: String = String(ctx.get("training_area", ""))
	# ⚠ **담당 영역일 때만.** 전 코치에게 매주 붙이면 코치 여섯이 다 같이 오른다
	if bool(ctx.get("training_done", false)) and not area.is_empty() \
			and specialty == area:
		d += float(c.get("own_area_training", 0.0))
	if bool(ctx.get("training_skipped", false)):
		d += float(c.get("training_skip", 0.0))
	if grew:
		d += float(c.get("growth", 0.0))
	return d


static func _teammate_weekly(w: Dictionary, ctx: Dictionary, grew: bool) -> float:
	var t: Dictionary = w.get("teammate", {})
	var d: float = 0.0
	if bool(ctx.get("team_played", false)) and bool(ctx.get("team_won", false)):
		d += float(t.get("team_win", 0.0))
	# 나는 호투했는데 팀이 진 주 — 에이스가 고립되는 감각
	if bool(ctx.get("pitched", false)) and not bool(ctx.get("won", false)) \
			and float(ctx.get("era", 0.0)) < float(w.get("quality_era", 0.0)):
		d += float(t.get("isolated_ace", 0.0))
	if grew:
		d += float(t.get("growth", 0.0))
	return d


## ⚠ **성향이 부호를 뒤집는다.** 승부욕·자존심이 센 상대는 내가 이기면
## 적개심이고, 품이 넓은 상대는 같은 사건이 인정이 된다
static func _rival_weekly(w: Dictionary, ctx: Dictionary, world_seed: int,
		person_id: String) -> float:
	var faced: Array = ctx.get("faced_rivals", [])
	if not faced.has(person_id):
		return 0.0
	var r: Dictionary = w.get("rival", {})
	var base: float = float(r.get("faced_and_won", 0.0)) \
		if bool(ctx.get("won", false)) else float(r.get("faced_and_lost", 0.0))
	var disp: Dictionary = disposition(world_seed, person_id)
	var hostile: bool = int(disp["competitive"]) + int(disp["prideful"]) \
		> int(disp["nurturing"]) * 2
	return -base if hostile else base


## 주간 관계 갱신. **`together`인 행만 움직인다** — 헤어진 상대는 시즌
## 단위로만 감쇠하고, 끝난 관계는 동결이다.
##
## `rows`는 `[{person_id, kind, value, contact, specialty}, ...]`
static func weekly(world_seed: int, rows: Array, ctx: Dictionary,
		relation_mod: float = 1.0) -> Array:
	var w: Dictionary = rules().get("weekly", {})
	var grew: bool = float(ctx.get("ovr_delta", 0.0)) \
		>= float(w.get("growth_threshold", 1.0))
	var mod: float = clampf(relation_mod, MOD_MIN, MOD_MAX)

	var out: Array = []
	for row in rows:
		if String(row.get("contact", CONTACT_TOGETHER)) != CONTACT_TOGETHER:
			continue
		var pid: String = String(row["person_id"])
		var kind: String = String(row["kind"])
		var d: float = 0.0

		match kind:
			KIND_MANAGER:
				d = _manager_weekly(w, ctx, grew)
			KIND_COACH:
				d = _coach_weekly(w, ctx, grew, String(row.get("specialty", "")))
			KIND_TEAMMATE:
				d = _teammate_weekly(w, ctx, grew)
			KIND_RIVAL:
				d = _rival_weekly(w, ctx, world_seed, pid)
			# 구단주는 주간 항목이 없다 — 시즌 성적으로만 움직인다

		if d == 0.0:
			continue
		# ⚠ **양수 변화에만 곱한다.** 소통 좋은 코치진이라고 미움도 빨리
		# 쌓이면 방향이 뒤집힌다
		if d > 0.0:
			d *= mod
		out.append(_delta(pid, float(row["value"]), float(row["value"]) + d))
	return out


# ── 시즌 종료 ─────────────────────────────────────────────────

## 성적을 좋음(1)·보통(0)·나쁨(−1)으로 접는다
static func _personal_grade(era: float, pitched_any: bool) -> int:
	if not pitched_any:
		return 0
	var c: Dictionary = rules().get("season", {}).get("criteria", {})
	if era <= float(c.get("good_era", 0.0)):
		return 1
	if era >= float(c.get("bad_era", 0.0)):
		return -1
	return 0


static func _team_grade(team_rank_pct: float) -> int:
	var c: Dictionary = rules().get("season", {}).get("criteria", {})
	if team_rank_pct <= float(c.get("good_rank_pct", 0.0)):
		return 1
	if team_rank_pct >= float(c.get("bad_rank_pct", 1.0)):
		return -1
	return 0


static func _season_together(kind: String, personal: int, team: int) -> float:
	var s: Dictionary = rules().get("season", {})
	match kind:
		# ⚠ **감독·코치는 개인 성적, 구단주는 팀 성적.** 구단주가 개인
		# 성적을 보면 약팀 에이스가 항상 사랑받는다
		KIND_MANAGER:
			if personal > 0:
				return float(s.get("manager_good", 0.0))
			return float(s.get("manager_bad", 0.0)) if personal < 0 else 0.0
		KIND_COACH:
			if personal > 0:
				return float(s.get("coach_good", 0.0))
			return float(s.get("coach_bad", 0.0)) if personal < 0 else 0.0
		KIND_OWNER:
			if team > 0:
				return float(s.get("owner_good", 0.0))
			return float(s.get("owner_bad", 0.0)) if team < 0 else 0.0
		KIND_TEAMMATE:
			# 한 시즌을 같이 났다는 것만으로 오른다
			return float(s.get("teammate_together", 0.0))
	return 0.0


## 헤어진 상대의 시즌 감쇠.
##
## ⚠ **반드시 0으로 수렴해야 한다.** 기하 감쇠는 정수 반올림에서 멈춘다
## (5 × 0.9 = 4.5 → 다시 5). 안 그러면 20년 전 헤어진 사람의 관계가
## 영원히 남는다
static func _apart_fade(value: float) -> float:
	var dec: Dictionary = rules().get("decay", {})
	var faded: float = value * float(dec.get("apart_per_season", 1.0))
	if clamp_value(faded) == clamp_value(value) and value != 0.0:
		faded = value - signf(value)
	# ±1이 끝까지 남지 않게 바닥에서 떨군다
	if absf(faded) < float(dec.get("apart_floor", 0.0)):
		return 0.0
	return faded


## 시즌 종료 — `together`는 총평 가산, `apart`는 감쇠, `ended`는 동결.
##
## ⚠ **주간과 분리한 이유:** "이번 시즌 어땠나"를 주 단위로 쪼개면 판정이
## 흐려진다
static func season(rows: Array, era: float, team_rank_pct: float,
		pitched_any: bool) -> Array:
	var personal: int = _personal_grade(era, pitched_any)
	var team: int = _team_grade(team_rank_pct)

	var out: Array = []
	for row in rows:
		var contact: String = String(row.get("contact", CONTACT_TOGETHER))
		var value: float = float(row["value"])
		var next: float
		if contact == CONTACT_TOGETHER:
			var d: float = _season_together(String(row["kind"]), personal, team)
			if d == 0.0:
				continue
			next = value + d
		elif contact == CONTACT_APART:
			next = _apart_fade(value)
		else:
			# ended는 기록이다 — 건드리지 않는다
			continue

		var delta: Dictionary = _delta(String(row["person_id"]), value, next)
		if int(delta["delta"]) == 0:
			continue
		out.append(delta)
	return out


# ── 팀 이동 ───────────────────────────────────────────────────

## 팀 이동 감쇠. 사용자 확정 **감쇠 후 보존** — 행은 남고 값만 0쪽으로
## 당긴다. 재회하면 이 값에서 재개되므로 "옛 감독을 프로에서 다시 만나는"
## 서사가 산다
static func move_decay(rows: Array) -> Array:
	var f: float = float(rules().get("decay", {}).get("on_move", 1.0))
	var out: Array = []
	for row in rows:
		# ended는 이미 끝난 기록이라 이동과 무관하다
		if String(row.get("contact", CONTACT_TOGETHER)) == CONTACT_ENDED:
			continue
		var delta: Dictionary = _delta(String(row["person_id"]),
			float(row["value"]), float(row["value"]) * f)
		if int(delta["delta"]) == 0:
			continue
		out.append(delta)
	return out


# ── 기억 ──────────────────────────────────────────────────────

const MAX_MEMORIES: int = 10


## 사건을 관계에 각인한다. 값과 별개로 서사 문구의 근거가 된다.
##
## ⚠ **넘치면 약한 것부터 버린다.** 오래된 것부터 버리면 데뷔전 완봉승 같은
## 인생 사건이 평범한 최근 경기에 밀린다
static func trim_memories(memories: Array) -> Array:
	if memories.size() <= MAX_MEMORIES:
		return memories
	var sorted: Array = memories.duplicate()
	sorted.sort_custom(func(a, b) -> bool:
		var ia: int = int(a.get("intensity", 0))
		var ib: int = int(b.get("intensity", 0))
		if ia != ib:
			return ia < ib
		var sa: int = int(a.get("season", 0))
		var sb: int = int(b.get("season", 0))
		if sa != sb:
			return sa < sb
		return int(a.get("week", 0)) < int(b.get("week", 0)))
	return sorted.slice(sorted.size() - MAX_MEMORIES)
