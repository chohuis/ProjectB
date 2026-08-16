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

		# ⚠ **구종을 고르는 자리가 아예 없었다** (F-1). 02엔 훈련 화면에
		# 구종 탭이 있었다(보유 · 습득 중 · 해금 가능 · 조건 미충족).
		# 04는 성장 축 자체가 죽어 있어서 화면도 없었다
		"pitch": _pitch(p, plan),
	}


## 능력치 이름표. **`StatusVm.PITCHING_LABELS`가 정본이다** — 해금 문턱을
## "command 52"가 아니라 "커맨드 52"로 말해야 한다
static func _stat_label(stat: String) -> String:
	for pair in StatusVm.PITCHING_LABELS:
		if String(pair[0]) == stat:
			return String(pair[1])
	return stat


## 구종 — 지금 배우는 것과 고를 수 있는 것.
##
## ⚠ **못 고르는 것도 남긴다.** 02도 "조건 미충족"을 따로 보여줬다 —
## 빼 버리면 무엇을 올려야 열리는지 알 길이 없다.
##
## ⚠ **문턱을 숫자로 말한다.** "조건 미충족"만 뜨면 뭘 해야 하는지 모른다
static func _pitch(p: Dictionary, plan: Dictionary) -> Dictionary:
	var rows: Array = []
	for c in PitchDev.choices(p):
		var why: String = ""
		match String(c["why"]):
			"mastered":
				why = "이미 마스터"
			"full":
				why = "구종은 %d개까지" % PitchDev.max_learned()
			"locked":
				var parts := PackedStringArray()
				for cond in c.get("unlock", []):
					parts.append("%s %d" % [_stat_label(String(cond.get("stat", ""))),
						int(cond.get("value", 0))])
				why = "필요: " + " · ".join(parts)
		rows.append({
			"id": c["id"], "name": c["name"], "grade": c["grade"],
			"owned": c["owned"], "can_train": c["can_train"], "why": why,
			# 별로 보여준다 — 숫자 5는 등급인지 개수인지 헷갈린다
			"grade_label": "★".repeat(int(c["grade"])) if bool(c["owned"]) else "",
		})

	var ts: Dictionary = p.get("training_pitch_state", {})
	var learning: Dictionary = {}
	if not ts.is_empty():
		var id: String = String(ts.get("id", ""))
		learning = {
			"id": id,
			"name": String(PitchDev.entry_of(id).get("name", id)),
			"progress": float(ts.get("progress", 0.0)),
			"label": "%s %d%%" % [String(PitchDev.entry_of(id).get("name", id)),
				int(float(ts.get("progress", 0.0)))],
		}

	# ⚠ **계획에 구종 개발이 없으면 진행이 안 된다.** 구종을 골라 놓고
	# 훈련 슬롯을 안 채우면 영원히 0%인데 화면이 아무 말도 안 하면
	# "골랐는데 왜 안 늘지"가 된다
	var planned: bool = false
	for key in ["primary", "secondary", "secondary2"]:
		var prog: Dictionary = Training.program(String(plan.get(key, "")))
		if bool(prog.get("is_pitch_dev", false)):
			planned = true
			break

	return {
		"rows": rows,
		"learning": learning,
		"planned": planned,
		"note": "" if planned or learning.is_empty()
			else "훈련 슬롯에 '구종 개발'을 넣어야 진행됩니다.",
	}


static func _label_of(programs: Array, id: String) -> String:
	if id.is_empty():
		return "비움"
	for c in programs:
		if String(c.get("id", "")) == id:
			return String(c.get("name", id))
	return id
