extends RefCounted
class_name AutoTraining

## 훈련 계획 자동 추천 — F-1b.
##
## 원본: `runAutoAdvance.ts:274-306` (`applyRecommendedTraining`) ·
## `:246-272` (`ensurePitchTraining`)
##
## ⚠ **04에 이게 없었다.** 자동 진행이 훈련 계획을 세우지 않아서, 계획을
## 직접 안 짜면 여덟 해를 굴려도 훈련을 하나도 안 했다. F-1 계측이
## `TRN_PITCH_DEV`를 손으로 박아 돌린 이유가 그것이다 — **계측이 게임에
## 없는 경로를 재고 있었다.**
##
## ⚠ **02가 여기서 크게 데었다.** 세 갈래 어디에도 구종 개발이 없어서
## 자동 진행을 쓰면 구종을 영영 못 배웠고, 구종 하나 차이가 ERA 9.07 vs
## 4.52였다. 60회 조사가 그걸 잡았다.

## 갈래 문턱 — 02 그대로
const FATIGUE_HIGH: float = 70.0
const MORALE_LOW: float = 50.0

const RECOVERY: String = "TRN_RECOVERY"
const MENTAL: String = "TRN_MENTAL_P"
const CTRL: String = "TRN_CTRL_CMD"
const VEL: String = "TRN_VEL"
const PITCH_DEV: String = "TRN_PITCH_DEV"

## 목표 구종 수 — 02 `npc_pitch_target("SP"|"CP"|나머지, velocity)`.
## **구속이 빠르면 적게 갖는다** — 구위로 눌러서다
const SP_FAST_VELOCITY: float = 70.0
const CP_FAST_VELOCITY: float = 70.0
const CP_MID_VELOCITY: float = 60.0
const RP_FAST_VELOCITY: float = 65.0


## 그 보직이 몇 개를 목표로 하나. **NPC와 같은 표다** — 주인공만 다른 수를
## 목표하면 격차가 그대로 성적이 된다
static func pitch_target(position: String, velocity: float) -> int:
	if position == "SP":
		return 4 if velocity >= SP_FAST_VELOCITY else 5
	if position == "CP":
		if velocity >= CP_FAST_VELOCITY:
			return 2
		return 3 if velocity >= CP_MID_VELOCITY else 4
	return 3 if velocity >= RP_FAST_VELOCITY else 4


## 구종 개발 대상을 정한다. 정해졌으면 `true` — **그때만 `TRN_PITCH_DEV`가
## 의미가 있다.** 대상 없이 프로그램만 걸면 그 슬롯이 통째로 빈다.
##
## ⚠ **04는 잠긴 구종을 못 고른다.** 02 `startPitchTraining`은 5개 상한만
## 보고 문턱을 안 보는데 04 `PitchDev.start`가 한 번 더 막는다(화면 가드만
## 있던 02에서 다른 호출부가 그대로 통과한 적이 있어서다). 그래서 카탈로그
## 전체가 아니라 **고를 수 있는 것 중에서** 난이도가 낮은 것을 잡는다
static func ensure_pitch_target(p: Dictionary) -> bool:
	# 이미 익히는 중이면 그대로 둔다 — 매주 갈아타면 아무것도 못 끝낸다
	if not (p.get("training_pitch_state", {}) as Dictionary).is_empty():
		return true

	var owned: int = (p.get("pitches", []) as Array).size()
	var target: int = pitch_target(String(p.get("position", "")),
		float(p.get("pitching", {}).get("velocity", 0.0)))

	var choices: Array = PitchDev.choices(p)
	if owned < target:
		# 난이도 오름차순 — 쉬운 것부터 익힌다(02와 같다).
		# **`can_train`이 상한·잠금을 이미 본다** — 여기서 다시 세지 않는다
		var best: Dictionary = {}
		for c in choices:
			if bool(c["owned"]) or not bool(c["can_train"]):
				continue
			if best.is_empty() or int(c["form_difficulty"]) < int(best["form_difficulty"]):
				best = c
		if not best.is_empty():
			return PitchDev.start(p, String(best["id"]))

	# 목표를 채웠으면 등급이 제일 낮은 것을 올린다
	var lowest: Dictionary = {}
	for c in choices:
		if not bool(c["owned"]) or not bool(c["can_train"]):
			continue
		if lowest.is_empty() or int(c["grade"]) < int(lowest["grade"]):
			lowest = c
	if lowest.is_empty():
		return false
	return PitchDev.start(p, String(lowest["id"]))


## 이번 주 계획을 세운다.
##
## ⚠ **사용자가 정한 계획은 안 건드린다** (02 사용자 확정 2026-08-09).
## 예전엔 매주 무조건 덮어써서 플레이어가 고른 육성 방향이 조용히 사라졌다
static func apply(state: Dictionary) -> void:
	var plan: Dictionary = state.get("training_plan", {})
	if bool(plan.get("user_set", false)):
		return

	var p: Dictionary = state.get("protagonist", {})
	var primary: String
	var sub1: String
	var sub2: String

	# ⚠ **피로를 사기보다 먼저 본다.** 뒤집으면 탈진한 채로 멘탈을 돌린다
	if float(p.get("fatigue", 0.0)) >= FATIGUE_HIGH:
		primary = RECOVERY
		sub1 = MENTAL
		sub2 = CTRL
	# ⚠ **기본값을 다른 모듈과 맞춘다.** `CoachReport`·`GameGrowth`가 50을
	# 쓰는데 여기만 0을 쓰면 축이 빈 세이브에서 **늘 "사기가 낮다"로 읽힌다**
	elif float(p.get("morale", 50.0)) < MORALE_LOW:
		primary = MENTAL
		sub1 = CTRL
		sub2 = RECOVERY
	else:
		primary = CTRL
		sub1 = VEL
		sub2 = PITCH_DEV if ensure_pitch_target(p) else RECOVERY

	state["training_plan"] = {
		"primary": primary, "secondary": sub1, "secondary2": sub2,
		"user_set": false,
	}
