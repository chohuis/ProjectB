extends RefCounted
class_name NpcMilitary

## NPC 병역 — P-18. **사용자 확정.**
##
## > NPC도 상무 영향을 받아야 한다. 그래야 주인공이 신청하는 해에 경쟁이
## > 빡세기도 하고 아니기도 하다.
##
## 🔴 **04는 주인공만 입대했다.** `Military.enlist`를 부르는 곳이 주인공 경로
## 셋뿐이라 **미필 풀이 영영 안 줄었다** — 경쟁 상대가 늘 같으니 상무 당락이
## 주인공의 OVR 순위 하나로 고정됐고, 해마다 같은 답이 나왔다.
##
## 원본: `npc_sim.rs:2590-2624` `calc_early_enlist_decisions`.
##
## ⚠ **확률은 더한 뒤 0.85에서 자른다.** 안 자르면 최악의 경우가 1.05로
## **확실해진다** — 그러면 그 조건에 걸린 사람은 예외 없이 사라진다.
##
## ⚠ **주인공은 안 건드린다.** 주인공 병역은 사용자가 정한다(`CareerRunner`).

## 02 나이 보정 — 나이 들수록 미루는 게 손해다
const AGE_PROB: Dictionary = {27: 0.20, 26: 0.12, 25: 0.05}
## 주전 경쟁에서 밀림
const RANK_LOW: float = 0.20
const RANK_MID: float = 0.35
const RANK_LOW_PROB: float = 0.35
const RANK_MID_PROB: float = 0.20
## 사실상 벤치 신세
const TIME_LOW: float = 0.20
const TIME_MID: float = 0.35
const TIME_LOW_PROB: float = 0.30
const TIME_MID_PROB: float = 0.15
## 재계약이 불확실하다
const CONTRACT_SOON: int = 1
const CONTRACT_PROB: float = 0.20
## 확률 상한
const PROB_CAP: float = 0.85


## 조기 입대 확률 — 02 `calc_early_enlist_decisions` 그대로.
##
## `c`는 `{age, ovr_rank_pct, playing_time_pct, contract_years_left}`
static func early_enlist_prob(c: Dictionary) -> float:
	var prob: float = float(AGE_PROB.get(int(c.get("age", 0)), 0.0))

	var rank: float = float(c.get("ovr_rank_pct", 1.0))
	if rank < RANK_LOW:
		prob += RANK_LOW_PROB
	elif rank < RANK_MID:
		prob += RANK_MID_PROB

	var time: float = float(c.get("playing_time_pct", 1.0))
	if time < TIME_LOW:
		prob += TIME_LOW_PROB
	elif time < TIME_MID:
		prob += TIME_MID_PROB

	if int(c.get("contract_years_left", 99)) <= CONTRACT_SOON:
		prob += CONTRACT_PROB

	return minf(prob, PROB_CAP)


## 아직 안 다녀온 NPC 수 — 계측·검사가 이걸로 판정한다
static func unserved_count(state: Dictionary) -> int:
	var n: int = 0
	for q in _pool(state):
		n += 1
	return n


## 병역이 남은 NPC들. **주인공과 학생은 뺀다**
static func _pool(state: Dictionary) -> Array:
	var out: Array = []
	for tid in state.get("world", {}).get("rosters", {}):
		for q in state["world"]["rosters"][tid]:
			if bool(q.get("is_protagonist", false)):
				continue
			if String(q.get("military_status", Military.STATUS_UNSERVED)) \
					!= Military.STATUS_UNSERVED:
				continue
			var stage: String = String(q.get("career_stage", ""))
			if stage == "highschool" or stage == "university" \
					or stage == "military":
				continue
			out.append(q)
	return out


## 복무 중인 NPC들
static func _serving(state: Dictionary) -> Array:
	var out: Array = []
	for tid in state.get("world", {}).get("rosters", {}):
		for q in state["world"]["rosters"][tid]:
			if bool(q.get("is_protagonist", false)):
				continue
			if String(q.get("military_status", "")) == Military.STATUS_SERVING:
				out.append(q)
	return out


static func serving_count(state: Dictionary) -> int:
	return _serving(state).size()


## 🔴 **NPC 복무·전역이 없으면 리그가 마른다.**
##
## 처음엔 입대만 붙였더니 **8해에 자격자가 7,336 → 3,026으로 줄기만 했다** —
## 들어간 사람이 안 돌아오니 리그에서 선수가 영영 사라진다. 실측으로 잡았다.
##
## ⚠ **한 해에 `WEEKS_PER_SEASON`만큼 복무한다.** 주마다 세면 주간 처리가
## 그만큼 무거워지고, `Military.SERVICE_WEEKS`(100)는 두 시즌이라 해 단위로
## 세도 같은 곳에 떨어진다
## ⚠ **전역자의 포지션을 돌려준다** — 02 `select_sports_unit_ids`의 Phase 1이
## "그해 전역자가 비운 자리"를 먼저 채운다. 개수만 세면 그 단계가 죽는다
static func _serve_year(state: Dictionary) -> Array:
	var vacating: Array = []
	for q in _serving(state):
		var served: int = int(q.get("military_service_weeks", 0)) \
			+ Calendar.WEEKS_PER_SEASON
		if served >= Military.SERVICE_WEEKS:
			q["military_status"] = Military.STATUS_DONE
			q["military_served_unit"] = String(q.get("military_unit", ""))
			q["military_unit"] = ""
			q["military_service_weeks"] = 0
			vacating.append(String(q.get("position", "")))
		else:
			q["military_service_weeks"] = served
	return vacating


## 몇 명 전역했나 — 계측·검사가 이걸로 본다
static func discharged_count(state: Dictionary) -> int:
	return _serve_year(state).size()


## 체육부대로 간 NPC 수. **주인공과 정원을 나눠 쓴다** —
## `Military.resolve_sports_unit`이 유일한 선발 자리다.
##
## ⚠ **주인공은 여기서 안 보낸다.** 뽑혔는지 여부만 명단에 남고, 실제로
## 보내는 건 사용자 답을 받은 `CareerRunner`다
static func _run_sports(state: Dictionary, vacating: Array, year: int) -> int:
	var picked: Array = Military.resolve_sports_unit(state, vacating)
	if picked.is_empty():
		return 0

	var want: Dictionary = {}
	for id in picked:
		want[String(id)] = true

	var gone: int = 0
	for q in _pool(state):
		if not want.has(String(q.get("id", ""))):
			continue
		_enlist_npc(q, year)
		q["military_unit"] = "sports"
		gone += 1
	return gone


## 한 해분. **시즌 마지막 주에만 돈다** — 아무 때나 입대시키면 시즌 도중에
## 선수가 사라져 순위표·기록이 어긋난다.
##
## ⚠ **난수는 `Rng`를 거친다.** 해와 사람을 같이 섞어야 같은 해에 같은
## 사람만 뽑히지 않는다
static func run(state: Dictionary, at_day: int) -> int:
	if at_day <= Calendar.DAYS_PER_SEASON - Calendar.DAYS_PER_WEEK:
		return 0

	# ⚠ **전역을 먼저 돌린다.** 뒤에 두면 올해 입대한 사람이 그 자리에서
	# 한 해를 채운 것으로 잡힌다
	var vacating: Array = _serve_year(state)

	var year: int = int(state.get("season_year", 0))
	var seed_value: int = int(state.get("seed", 0))

	# ⚠ **체육부대를 일반병보다 먼저 뽑는다.** 뒤에 두면 상위권이 이미
	# 일반병으로 가 버려 **체육부대 정원이 하위권으로 채워진다** —
	# 02는 상위 29명이 지원자 풀이다
	var gone: int = _run_sports(state, vacating, year)

	var pool: Array = _pool(state)
	var ranked: Array = pool.duplicate()
	ranked.sort_custom(func(a, b) -> bool:
		return Contract.core_ovr(a) > Contract.core_ovr(b))

	for i in ranked.size():
		var q: Dictionary = ranked[i]
		var r := RandomNumberGenerator.new()
		r.seed = Rng.mix(["npc_enlist", seed_value, year,
			String(q.get("id", ""))])
		# 순위 백분위 — 0이 최상위다
		var pct: float = float(i) / float(maxi(ranked.size(), 1))
		var prob: float = early_enlist_prob({
			"age": int(q.get("age", 0)),
			"ovr_rank_pct": pct,
			# ⚠ **출장 시간이 04엔 아직 없다.** 없는 값을 지어내는 대신
			# 중립(1.0)으로 두어 **그 항이 안 걸리게** 한다 — 0으로 두면
			# 전원이 벤치로 잡혀 확률이 통째로 부푼다. ⬜ P-18b
			"playing_time_pct": 1.0,
			"contract_years_left": int(q.get("contract_years", 99)),
		})
		if r.randf() < prob:
			_enlist_npc(q, year)
			gone += 1
	return gone


## NPC 하나를 보낸다. **주인공 경로(`Military.enlist`)를 안 쓴다** —
## 그쪽은 대기줄·소식·팀 이탈까지 주인공 기준으로 처리한다
static func _enlist_npc(q: Dictionary, year: int) -> void:
	q["military_status"] = Military.STATUS_SERVING
	q["military_unit"] = "general"
	q["military_enlist_year"] = year
	q["military_service_weeks"] = 0
