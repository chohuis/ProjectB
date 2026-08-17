extends GdUnitTestSuite

## 훈련 계획 자동 추천 — F-1b.
##
## 원본: `runAutoAdvance.ts:274-306` (`applyRecommendedTraining`) ·
## `:246-272` (`ensurePitchTraining`)
##
## ⚠ **04에 이게 아예 없었다.** 자동 진행이 훈련 계획을 안 세운다 —
## 계획을 직접 안 짜면 **여덟 해를 굴려도 훈련을 하나도 안 한다.**
## F-1 계측이 `TRN_PITCH_DEV`를 손으로 박아 돌린 이유가 그것이다.
##
## ⚠ **02가 여기서 크게 데었다.** 세 갈래 어디에도 구종 개발이 없어서
## 자동 진행을 쓰면 구종을 영영 못 배웠고, 구종 하나 차이가 ERA 9.07 vs
## 4.52였다. 그 교훈이 `sub2`에 박혀 있다.

const RECOVERY: String = "TRN_RECOVERY"
const MENTAL: String = "TRN_MENTAL_P"
const CTRL: String = "TRN_CTRL_CMD"
const VEL: String = "TRN_VEL"
const PITCH_DEV: String = "TRN_PITCH_DEV"


func _state(extra: Dictionary = {}) -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	(s["protagonist"] as Dictionary).merge(extra, true)
	return s


## ⚠ **사기 축이 통째로 비어 있었다.** 읽는 쪽은 셋인데(`CoachReport` ·
## `GameGrowth` · `AutoTraining`) **채우는 쪽이 없었다** — 그래서 자동 훈련이
## 여덟 해 내내 "사기가 낮다" 갈래만 돌았고 구종을 하나도 안 배웠다.
## 02 `NewGamePage:282`가 70이다
func test_주인공이_사기를_갖고_시작한다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	assert_bool((s["protagonist"] as Dictionary).has("morale")).override_failure_message(
		"주인공에 사기 축이 없다 — 읽는 쪽 기본값에 기대게 된다").is_true()
	assert_float(float(s["protagonist"]["morale"])).is_equal(70.0)
	# 그 값으로 시작하면 기본 갈래를 탄다 — 구종을 배울 수 있다
	AutoTraining.apply(s)
	assert_str(String(s["training_plan"]["primary"])).is_equal(CTRL)


## ⚠ **기본값이 모듈마다 다르면 축이 빈 세이브에서 갈린다.**
## `CoachReport`·`GameGrowth`가 50을 쓴다 — 여기만 0이면 늘 "사기 낮음"이다
func test_사기가_없으면_50으로_읽는다() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	(s["protagonist"] as Dictionary).erase("morale")
	AutoTraining.apply(s)
	# 50은 `< 50`이 아니다 — 기본 갈래다
	assert_str(String(s["training_plan"]["primary"])).is_equal(CTRL)


func test_피로하면_회복이_1순위다() -> void:
	# 02 `p.fatigue >= 70`
	var s: Dictionary = _state({"fatigue": 70.0})
	AutoTraining.apply(s)
	var plan: Dictionary = s["training_plan"]
	assert_str(String(plan["primary"])).is_equal(RECOVERY)
	assert_str(String(plan["secondary"])).is_equal(MENTAL)
	assert_str(String(plan["secondary2"])).is_equal(CTRL)


func test_문턱_바로_아래는_회복이_아니다() -> void:
	# 69면 아직 기본 갈래다 — 부등호가 뒤집히면 여기서 걸린다
	var s: Dictionary = _state({"fatigue": 69.0, "morale": 70.0})
	AutoTraining.apply(s)
	assert_str(String(s["training_plan"]["primary"])).is_not_equal(RECOVERY)


func test_사기가_낮으면_멘탈이_1순위다() -> void:
	# 02 `p.morale < 50`
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 49.0})
	AutoTraining.apply(s)
	var plan: Dictionary = s["training_plan"]
	assert_str(String(plan["primary"])).is_equal(MENTAL)
	assert_str(String(plan["secondary"])).is_equal(CTRL)
	assert_str(String(plan["secondary2"])).is_equal(RECOVERY)


func test_사기_50은_기본_갈래다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 50.0})
	AutoTraining.apply(s)
	assert_str(String(s["training_plan"]["primary"])).is_equal(CTRL)


## ⚠ **피로가 사기보다 먼저다.** 02가 그 순서로 본다 — 뒤집으면
## 탈진한 채로 멘탈 훈련을 돌린다
func test_둘_다면_피로가_이긴다() -> void:
	var s: Dictionary = _state({"fatigue": 80.0, "morale": 20.0})
	AutoTraining.apply(s)
	assert_str(String(s["training_plan"]["primary"])).is_equal(RECOVERY)


## ⚠ **02가 크게 데었던 자리다.** 기본 갈래에 구종 개발이 없어서
## 자동 진행이 구종을 영영 안 배웠다
func test_기본_갈래에_구종_개발이_있다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	AutoTraining.apply(s)
	var plan: Dictionary = s["training_plan"]
	assert_str(String(plan["primary"])).is_equal(CTRL)
	assert_str(String(plan["secondary"])).is_equal(VEL)
	assert_str(String(plan["secondary2"])).is_equal(PITCH_DEV)
	# 대상까지 잡혀 있어야 한다 — 프로그램만 걸고 대상이 없으면 아무 일도 없다
	assert_bool((s["protagonist"]["training_pitch_state"] as Dictionary).is_empty()) \
		.override_failure_message("구종 개발을 걸어 놓고 대상을 안 정했다").is_false()


## ⚠ **쉬운 것부터 익힌다** — 02 `sort((a,b) => a.formDifficulty - b.formDifficulty)`.
## 여럿이 열려 있을 때만 갈리므로 능력치를 올려 여러 개를 연다.
## `sinker`(난이도 1)가 `slider`·`curve`(난이도 2)보다 먼저다
func test_난이도가_낮은_것부터_익힌다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	var p: Dictionary = s["protagonist"]
	var q: Dictionary = p["pitching"]
	q["velocity"] = 70.0   # sinker(1)·cutter(1)가 열린다
	q["command"] = 55.0    # slider(2)·cutter(1)
	q["movement"] = 52.0   # curve(2)
	q["control"] = 58.0    # splitter(2)·forkball(2)
	# 열린 게 여럿인지부터 본다 — 하나뿐이면 이 검사가 아무것도 안 본다
	var open: int = 0
	for c in PitchDev.choices(p):
		if bool(c["can_train"]) and not bool(c["owned"]):
			open += 1
	assert_int(open).override_failure_message(
		"열린 구종이 %d개뿐이라 난이도 순서를 볼 수 없다" % open).is_greater(2)

	AutoTraining.apply(s)
	var picked: String = String(p["training_pitch_state"]["id"])
	var diff: int = 9
	for c in PitchDev.choices(p):
		if String(c["id"]) == picked:
			diff = int(c["form_difficulty"])
	assert_int(diff).override_failure_message(
		"난이도 %d인 '%s'를 잡았다 — 더 쉬운 게 열려 있다" % [diff, picked]).is_equal(1)


## ⚠ **카탈로그가 난이도 오름차순이라 "첫 번째"와 "가장 쉬운 것"이 같다.**
## 그래서 정렬을 빼는 변이가 지금 데이터로는 **등가**다 — 죽은 코드처럼
## 보이지만 아니다. 02도 정렬하고, 카탈로그 순서가 바뀌면 갈린다.
## **그 전제를 여기서 못 박는다** — 깨지면 정렬 코드가 다시 살아난다
func test_카탈로그가_난이도_오름차순이다() -> void:
	var prev: int = -1
	for c in PitchDev.catalog():
		var d: int = int(c.get("form_difficulty", 0))
		assert_int(d).override_failure_message(
			"'%s'(난이도 %d)가 앞의 %d보다 쉽다 — 카탈로그 순서가 깨졌다"
			% [c.get("id", ""), d, prev]).is_greater_equal(prev)
		prev = d


## ⚠ **목표를 채우면 새로 배우는 대신 등급을 올린다.**
## 안 그러면 다섯 개를 3등급으로 늘어놓고 끝난다
func test_목표를_채우면_등급을_올린다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	var p: Dictionary = s["protagonist"]
	p["position"] = "CP"
	p["pitching"]["velocity"] = 70.0   # CP · 70 이상 → 목표 2개
	p["pitching"]["movement"] = 50.0   # curve를 열어 둔다
	assert_int(AutoTraining.pitch_target("CP", 70.0)).is_equal(2)
	p["pitches"] = [{"id": "fastball", "grade": 4}, {"id": "curve", "grade": 2}]

	AutoTraining.apply(s)
	# 목표(2)를 채웠으니 새 구종이 아니라 **등급이 낮은 curve**를 잡아야 한다
	assert_str(String(p["training_pitch_state"]["id"])).override_failure_message(
		"목표를 채웠는데 새 구종을 배운다").is_equal("curve")


## 목표를 채웠고 더 배울 게 없으면 회복으로 떨어진다 — 02 `: "TRN_RECOVERY"`
func test_배울_것도_올릴_것도_없으면_회복이다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	var p: Dictionary = s["protagonist"]
	# 다섯 개를 전부 5등급으로 채운다 — 상한이자 마스터다
	var full: Array = []
	for c in PitchDev.catalog().slice(0, 5):
		full.append({"id": String(c["id"]), "grade": 5})
	p["pitches"] = full
	AutoTraining.apply(s)
	assert_str(String(s["training_plan"]["secondary2"])).is_equal(RECOVERY)


## 02 `npc_pitch_target` — 보직과 구속으로 목표 구종 수가 갈린다
func test_목표_구종_수가_02와_같다() -> void:
	assert_int(AutoTraining.pitch_target("SP", 70.0)).is_equal(4)
	assert_int(AutoTraining.pitch_target("SP", 69.0)).is_equal(5)
	assert_int(AutoTraining.pitch_target("CP", 70.0)).is_equal(2)
	assert_int(AutoTraining.pitch_target("CP", 60.0)).is_equal(3)
	assert_int(AutoTraining.pitch_target("CP", 59.0)).is_equal(4)
	assert_int(AutoTraining.pitch_target("RP", 65.0)).is_equal(3)
	assert_int(AutoTraining.pitch_target("RP", 64.0)).is_equal(4)


## ⚠ **익히는 중이면 안 바꾼다.** 매주 갈아타면 아무것도 못 끝낸다
func test_익히는_중이면_대상을_안_바꾼다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	var p: Dictionary = s["protagonist"]
	p["training_pitch_state"] = {"id": "curveball", "progress": 40.0}
	AutoTraining.apply(s)
	assert_str(String(p["training_pitch_state"]["id"])).is_equal("curveball")
	assert_float(float(p["training_pitch_state"]["progress"])).is_equal(40.0)


## ⚠ **사용자가 정한 계획은 안 건드린다** (02 사용자 확정 2026-08-09).
## 예전엔 매주 덮어써서 플레이어가 고른 육성 방향이 조용히 사라졌다
func test_사용자가_정한_계획은_안_건드린다() -> void:
	var s: Dictionary = _state({"fatigue": 90.0})
	s["training_plan"] = {"primary": VEL, "user_set": true}
	AutoTraining.apply(s)
	assert_str(String(s["training_plan"]["primary"])).is_equal(VEL)


func test_자동으로_세운_계획은_다음_주에_다시_본다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	AutoTraining.apply(s)
	assert_bool(bool(s["training_plan"].get("user_set", false))).is_false()
	# 피로해지면 갈래가 바뀐다
	s["protagonist"]["fatigue"] = 85.0
	AutoTraining.apply(s)
	assert_str(String(s["training_plan"]["primary"])).is_equal(RECOVERY)


## ⚠ **04는 잠긴 구종을 못 고른다.** 02 `startPitchTraining`은 5개 상한만
## 보고 문턱을 안 보는데, 04 `PitchDev.start`가 한 번 더 막는다 —
## 고를 수 있는 것 중에서 난이도가 낮은 것을 잡아야 한다
func test_잠긴_구종을_안_고른다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	var p: Dictionary = s["protagonist"]
	AutoTraining.apply(s)
	var target: String = String(p["training_pitch_state"]["id"])
	assert_bool(PitchDev.is_unlocked(target, p)).override_failure_message(
		"잠긴 구종을 대상으로 잡았다: %s" % target).is_true()


## 배선의 끝 — 자동 진행이 실제로 계획을 세우나
func test_자동_진행이_계획을_세운다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	s.erase("training_plan")
	# 한 걸음만 돌린다 — 진행은 안 하고 계획만 보는 것이 목적이다
	await AutoAdvance.run(s, func(_st): pass, func(_st, _a): pass, 1)
	assert_bool((s.get("training_plan", {}) as Dictionary).is_empty()) \
		.override_failure_message("자동 진행이 훈련 계획을 안 세운다").is_false()


## ⚠ **`next_step`은 묻기만 한다.** 화면도 부르는 조회 함수라 거기서 계획을
## 세우면 **물어보기만 해도 상태가 바뀐다** — 검사 셋이 그렇게 깨졌다
func test_다음_할_일을_묻는_것만으로는_안_바뀐다() -> void:
	var s: Dictionary = _state({"fatigue": 10.0, "morale": 70.0})
	s.erase("training_plan")
	AutoAdvance.next_step(s)
	assert_bool((s.get("training_plan", {}) as Dictionary).is_empty()) \
		.override_failure_message("묻기만 했는데 계획이 생겼다").is_true()
