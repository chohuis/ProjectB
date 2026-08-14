extends RefCounted
class_name TrainingVm

## 훈련 계획 — M7-9b.
##
## 원본: `pages/training/`
##
## ⚠ **미리보기와 실제가 같은 함수를 쓴다.** `Training.preview`가
## `plan_load`를 부르고, 주간 처리도 `TrainingGrowth`를 거쳐 같은 값을
## 쓴다 — 두 벌이 되면 "화면엔 −8인데 실제로는 −12"가 된다.

## 슬롯 셋. **키 이름이 `Training._slot_ids`와 같아야 한다** —
## 다르면 계획을 짜도 조용히 아무 일도 안 일어난다
const SLOTS: Array[Dictionary] = [
	{"id": "primary", "label": "1순위", "mult": "XP 2.5배"},
	{"id": "secondary", "label": "2순위", "mult": "XP 1.5배"},
	{"id": "secondary2", "label": "3순위", "mult": "XP 1.0배"},
]

## 피로 구간 이름표. **벼랑 앞에서 경고가 있어야 한다**
const ZONE_LABEL: Array[Dictionary] = [
	{"at": 90.0, "label": "탈진 직전", "warn": true},
	{"at": 80.0, "label": "매우 피곤", "warn": true},
	{"at": 70.0, "label": "피곤", "warn": true},
	{"at": 0.0, "label": "괜찮음", "warn": false},
]


static func zone_of(fatigue: float) -> Dictionary:
	for z in ZONE_LABEL:
		if fatigue >= float(z["at"]):
			return z
	return ZONE_LABEL[-1]


static func build(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var plan: Dictionary = state.get("training_plan", {})
	var programs: Array = Training.programs_for(String(p.get("player_type", "pitcher")))

	var fatigue: float = float(p.get("fatigue", 0.0))
	var condition: float = float(p.get("condition", 100.0))
	var pv: Dictionary = Training.preview(fatigue, condition, plan, Training.programs())

	var slots: Array = []
	for s in SLOTS:
		var chosen: String = String(plan.get(s["id"], ""))
		slots.append({
			"id": s["id"], "label": s["label"], "mult": s["mult"],
			"program_id": chosen,
			"program_label": _label_of(programs, chosen),
		})

	var options: Array = []
	for c in programs:
		options.append({
			"id": String(c.get("id", "")),
			"label": String(c.get("name", "")),
			"focus": String(c.get("focus_label", "")),
			"gains": String(c.get("gains_label", "")),
			# ⚠ **선수에게 일어나는 변화로 적는다.** 데이터는 "비용"이라
			# 회복 훈련이 음수인데, 그대로 "+%.1f"에 넣으면 `피로 +-10.0`이 된다
			"cost": "피로 %+.1f · 컨디션 %+.1f" % [
				float(c.get("fatigue_cost", 0.0)), -float(c.get("condition_cost", 0.0))],
		})

	var zone: Dictionary = zone_of(fatigue)
	var next_zone: Dictionary = zone_of(float(pv["projected_fatigue"]))

	return {
		"slots": slots,
		"options": options,

		"fatigue": fatigue,
		"condition": condition,
		"fatigue_label": "%.0f (%s)" % [fatigue, zone["label"]],
		"condition_label": "%.0f" % condition,

		# ⚠ **다음 주에 더 나빠지는지를 화면이 말해야 한다.** 지금 구간만
		# 보면 벼랑 바로 앞에서 아무 경고가 없다
		"projected_label": "다음 주 피로 %.0f (%s) · 컨디션 %.0f" % [
			float(pv["projected_fatigue"]), next_zone["label"],
			float(pv["projected_condition"])],
		"warns": bool(next_zone["warn"]) and not bool(zone["warn"]),
		"is_tired": bool(zone["warn"]),

		"delta_label": "이번 주 피로 %+.1f · 컨디션 %+.1f" % [
			float(pv["fatigue_delta"]), float(pv["condition_delta"])],
	}


static func _label_of(programs: Array, id: String) -> String:
	if id.is_empty():
		return "비움"
	for c in programs:
		if String(c.get("id", "")) == id:
			return String(c.get("name", id))
	return id
