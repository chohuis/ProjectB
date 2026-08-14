extends RefCounted
class_name Training

## 훈련 계획 — 피로·컨디션 변화와 미리보기. M4-2.
##
## 원본: `packages/engine-native/src/growth_engine.rs`의 `plan_load` · `preview_training`
##
## ⚠ **정본이 하나다.** 실제 계산과 훈련 화면 미리보기가 같은 함수를 쓴다.
## 원본에서 화면이 자기 식을 갖고 있었고 — 슬롯 배수도 구간 승수도 몰라서 —
## **화면은 "피로 +7"이라 하고 엔진은 −4.25를 적용했다. 부호가 반대였다.**
##
## ⚠ 여기 `fatigue`는 **100 = 탈진**이다 (주인공 축). 리그 쪽 `freshness`와
## 방향이 반대다.
##
## 계획: `{primary, secondary, secondary2}` — 프로그램 id, 빈 문자열이면 안 씀
## 프로그램: `{id, fatigue_cost, condition_cost}`


## 슬롯별 (XP 배수, 피로 배수).
##
## ⚠ 피로 1당 XP가 주 2.50 · 보조1 3.00 · 보조2 2.00이라 **"주" 슬롯이
## 최적이 아니다.** 원본에 "의도인지 미확정"이라 적혀 있다 — 밸런스 동결이라
## 그대로 옮긴다
const SLOT_XP_MULT: Array[float] = [2.5, 1.5, 1.0]
const SLOT_FATIGUE_MULT: Array[float] = [1.0, 0.5, 0.5]

## 주간 자동 피로 회복. **없으면 한 번 지친 뒤 영영 못 돌아온다**
const WEEKLY_AUTO_RECOVERY: float = -5.0


static func _slot_ids(plan: Dictionary) -> Array[String]:
	return [plan.get("primary", ""), plan.get("secondary", ""), plan.get("secondary2", "")]


static func _find(programs: Array, id: String) -> Dictionary:
	for c in programs:
		if c.get("id", "") == id:
			return c
	return {}


## 이번 주 계획이 주는 피로·컨디션 변화. `{fatigue_delta, condition_delta}`
static func plan_load(fatigue: float, plan: Dictionary, programs: Array) -> Dictionary:
	var zone: float = Growth.fatigue_zone_mult(fatigue)

	var fat: float = WEEKLY_AUTO_RECOVERY
	# 컨디션 자동 회복 — 지쳤을수록 더디게 돌아온다
	var cond: float = 1.0 if fatigue >= 80.0 else (3.0 if fatigue >= 60.0 else 5.0)

	var ids: Array[String] = _slot_ids(plan)
	for i in ids.size():
		# 빈 슬롯과 세이브에 없는 id는 `_find`가 빈 사전을 주고, 아래 `.get`의
		# 기본값 0이 흡수한다 — 가드를 따로 두면 죽은 코드가 된다
		var cfg: Dictionary = _find(programs, ids[i])
		var fat_mult: float = SLOT_FATIGUE_MULT[i]
		var cost: float = cfg.get("fatigue_cost", 0.0)
		if cost > 0.0:
			fat += cost * fat_mult * zone
		else:
			# ⚠ **회복 훈련에는 구간 승수를 안 건다.** 걸면 지쳤을 때 회복이
			# 네 배가 되어 벼랑 끝에서 오히려 이득이 된다 — 관리의 뜻이 뒤집힌다
			fat += cost * fat_mult
		cond -= cfg.get("condition_cost", 0.0) * fat_mult

	return {"fatigue_delta": fat, "condition_delta": cond}


## 훈련 화면 미리보기. **실제 계산과 같은 `plan_load`를 쓴다** —
## 화면이 다시 계산하면 그게 또 하나의 정본이 된다
static func preview(fatigue: float, condition: float, plan: Dictionary,
		programs: Array) -> Dictionary:
	var load: Dictionary = plan_load(fatigue, plan, programs)
	var next_fatigue: float = clampf(fatigue + load["fatigue_delta"], 0.0, 100.0)
	return {
		"fatigue_delta": load["fatigue_delta"],
		"condition_delta": load["condition_delta"],
		"projected_fatigue": next_fatigue,
		"projected_condition": clampf(condition + load["condition_delta"], 0.0, 100.0),
		"fatigue_zone_mult": Growth.fatigue_zone_mult(fatigue),
		# ⚠ **다음 주에 더 나빠지는지를 화면이 알려줄 근거다.** 지금 구간만
		# 보면 벼랑 바로 앞에서 아무 경고가 없다
		"next_zone_mult": Growth.fatigue_zone_mult(next_fatigue),
	}


# ── 프로그램 데이터 (M7-9) ────────────────────────────────────

const PROGRAMS_PATH: String = "res://data/training_programs.json"

## 파일을 한 번만 읽는다
static var _programs_cache: Array = []


## 훈련 프로그램 12종. **02 `programs.json` 그대로다** — 키 이름만 04 규칙.
##
## ⚠ **이게 없으면 훈련 화면이 빈칸이고 성장이 0이다.** 계획을 짜도
## `_find`가 아무것도 못 찾아서 조용히 아무 일도 안 일어난다
static func programs() -> Array:
	if not _programs_cache.is_empty():
		return _programs_cache
	var f := FileAccess.open(PROGRAMS_PATH, FileAccess.READ)
	if f == null:
		push_error("훈련 프로그램을 못 읽는다: %s" % PROGRAMS_PATH)
		return []
	var parsed = JSON.parse_string(f.get_as_text())
	_programs_cache = parsed.get("programs", []) if parsed is Dictionary else []
	return _programs_cache


## 그 선수가 할 수 있는 훈련. **`both`는 누구나 할 수 있다**
static func programs_for(player_type: String) -> Array:
	var out: Array = []
	for p in programs():
		var t: String = String(p.get("player_type", "both"))
		if t == "both" or t == player_type:
			out.append(p)
	return out
