extends RefCounted
class_name PitchVm

## 투구 선택 — M7-6e2. **이 게임의 핵심 조작.**
##
## 원본: `pages/match/MatchPage.svelte`의 존 클릭·구종 선택
##
## ⚠ **주인공이 던질 수 있는 구종만 보여준다.** 전부 보여주면 배우지 않은
## 공을 던지게 되고, 그러면 숙련도를 올릴 이유가 없어진다.
##
## ⚠ **숙련도가 결과에 닿아야 한다.** 02는 한때 숙련도가 배우는 속도만
## 늦추고 결과엔 안 닿았다 — 화면엔 "숙련도 4/5"라고 적혀 있는데 던지면
## 차이가 없었다. 여기서는 등급을 화면에 띄우고 엔진에 그대로 넘긴다.


## 구종 이름표. **엔진 키가 정본이고 여기는 표기만 준다**
const PITCH_LABEL: Dictionary = {
	"fastball": "포심", "sinker": "싱커", "cutter": "커터", "slider": "슬라이더",
	"curve": "커브", "changeup": "체인지업", "splitter": "스플리터",
	"forkball": "포크볼", "screwball": "스크루볼", "knuckleball": "너클볼",
}

## 전략·힘. 02 값 그대로다
const STRATEGY_LABEL: Dictionary = {
	"aggressive": "공격적", "balanced": "보통", "safe": "안전하게",
}
const POWER_LABEL: Dictionary = {"low": "빼서", "normal": "보통", "high": "전력"}

## 존 번호. 1~9가 스트라이크존, 0은 **의도적 볼**
const BALL_ZONE: int = 0

## 못 던지는 구종이 하나도 없을 때의 기본 — 누구나 직구는 던진다
const DEFAULT_PITCH := "fastball"


static func pitch_label(id: String) -> String:
	return PITCH_LABEL.get(id, id)


## 주인공이 던질 수 있는 구종. `[{id, label, grade}]`
##
## ⚠ **숙련도 순으로 준다.** 화면에서 제일 좋은 공을 먼저 보게 된다
static func repertoire(p: Dictionary) -> Array:
	var out: Array = []
	for x in p.get("pitches", []):
		var id: String = x.get("id", "")
		if id.is_empty():
			continue
		out.append({"id": id, "label": pitch_label(id),
			"grade": int(x.get("grade", 1))})

	# ⚠ **하나도 없으면 직구를 준다.** 빈 목록이면 던질 수가 없고,
	# 화면이 버튼 없이 뜬다
	if out.is_empty():
		out.append({"id": DEFAULT_PITCH, "label": pitch_label(DEFAULT_PITCH),
			"grade": 1})

	out.sort_custom(func(a, b) -> bool: return int(a["grade"]) > int(b["grade"]))
	return out


## 구종 칸 — M-6. 배운 것 뒤에 **빈 칸이 상한까지** 이어진다.
## 원본: `pitchSlots.ts:38-53`.
##
## ⚠ **빈 칸에 구종 이름을 적지 않는다**(02 주석) — 슬롯은 특정 구종의
## 자리가 아니라 **조건을 채운 것 중 아무거나 들어갈 칸**이다. 이름을 적으면
## 화면이 없는 규칙을 지어내는 것이 된다.
##
## ⚠ **상한을 넘으면 넘은 대로 보여준다** — 잘라 내면 "왜 여섯 번째 공이
## 안 보이지"가 된다
static func slots_of(pitches: Array) -> Array:
	var out: Array = []
	for i in pitches.size():
		out.append({"no": i + 1, "learned": true,
			"id": String(pitches[i]["id"]), "label": String(pitches[i]["label"]),
			"grade": int(pitches[i]["grade"])})
	for i in range(pitches.size(), PitchDev.max_learned()):
		out.append({"no": i + 1, "learned": false,
			"id": "", "label": "", "grade": 0})
	return out


static func build(p: Dictionary, sel: Dictionary = {},
		stamina: float = -1.0) -> Dictionary:
	var pitches: Array = repertoire(p)

	var pitch_id: String = sel.get("pitch_type", "")
	# 고른 구종이 목록에 없으면 첫 번째로 — 이적·성장으로 목록이 바뀔 수 있다
	var known: bool = false
	for x in pitches:
		if x["id"] == pitch_id:
			known = true
	if not known:
		pitch_id = pitches[0]["id"]

	var zone: int = int(sel.get("zone", 5))
	var strategy: String = sel.get("strategy", "balanced")
	var power: String = sel.get("power", "normal")

	var strategies: Array = []
	for k in STRATEGY_LABEL:
		strategies.append({"id": k, "label": STRATEGY_LABEL[k]})
	var powers: Array = []
	for k in POWER_LABEL:
		powers.append({"id": k, "label": POWER_LABEL[k]})

	# ⚠ **소모 식은 `Tuning`이 정본이다** — 여기서 다시 더하면 화면과 엔진이
	# 갈린다. 02도 같은 규칙 파일을 읽는다(`pitchCost.ts:55-64`).
	# **스태미나가 낮아도 구종을 막지 않는다** — 엔진이 그렇게 안 막고,
	# 02는 그 자리에 "화면이 없는 규칙을 지어내는 것"이라고 적어 뒀다
	var cost: float = Tuning.STAMINA_BASE \
		+ (Tuning.STAMINA_AGGRESSIVE_BONUS if strategy == "aggressive" else 0.0) \
		+ (Tuning.STAMINA_FASTBALL_BONUS if pitch_id == "fastball" else 0.0) \
		+ float(Tuning.STAMINA_POWER_COST.get(power, 0.15))

	return {
		"pitches": pitches,
		# 구종 칸 — M-6. **빈 칸까지 보여줘야 "몇 개 더 배울 수 있나"가 보인다**
		"slots": slots_of(pitches),
		"slot_label": "%d/%d" % [pitches.size(), PitchDev.max_learned()],
		"cost": cost,
		# ⚠ **스태미나를 모르면 남은 구수도 모른다.** 0으로 두면 "이제 못
		# 던진다"로 읽힌다 — 모르는 것과 바닥인 것을 가른다
		"has_pitches_left": stamina >= 0.0 and cost > 0.0,
		"pitches_left": int(floor(stamina / cost)) if stamina >= 0.0 and cost > 0.0 else 0,
		"pitch_type": pitch_id,
		"pitch_label": pitch_label(pitch_id),
		"zone": zone,
		# ⚠ **의도적 볼임을 화면이 말해야 한다.** 존 밖을 골라 놓고 왜
		# 스트라이크가 안 들어오는지 모르면 안 된다
		"is_intentional_ball": zone == BALL_ZONE,
		"zone_label": "존 밖 (거르기)" if zone == BALL_ZONE else "%d번" % zone,
		"strategy": strategy,
		"strategy_label": STRATEGY_LABEL.get(strategy, strategy),
		"strategies": strategies,
		"power": power,
		"power_label": POWER_LABEL.get(power, power),
		"powers": powers,
	}


## 엔진이 먹는 결정 사전. **키 이름이 엔진과 같아야 한다** —
## 다르면 기본값으로 떨어져서 무엇을 골라도 같은 공이 나간다
static func to_decision(vm: Dictionary) -> Dictionary:
	return {
		"pitch_type": vm.get("pitch_type", DEFAULT_PITCH),
		"location": int(vm.get("zone", 5)),
		"strategy": vm.get("strategy", "balanced"),
		"power": vm.get("power", "normal"),
	}
