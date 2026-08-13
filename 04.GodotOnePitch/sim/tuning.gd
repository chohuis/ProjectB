extends RefCounted
class_name Tuning

## 게임 수치의 **단일 정본**. 원본: `packages/engine-native/src/tuning.rs`
##
## ⚠ **이 파일이 있는 이유가 실제 결함이다.** 원본에서 도루 계수가
## `match_engine`(주인공 경기)에만 박혀 있고 `npc_sim`(리그 720경기)은
## `sb: 0`을 하드코딩했다. 그래서 **리그 전체 도루가 0**이었고 도루왕이
## 구조적으로 안 나왔다 — 규정타석 100명 전원의 sb가 0인 걸 수상 자격선
## 점검에서야 봤다. 능력치(`speed`·`instinct`·`hold_runners`)는 처음부터
## 있었고, 쓰는 곳이 한쪽뿐이었을 뿐이다.
##
## **두 모델이 같이 쓰는 수치는 전부 여기 둔다.**
##
## ⚠ **이주 중 밸런스는 동결이다.** 값은 원본 실측 결과 그대로다. 바꾸지 않는다.


# ── 계측용 손잡이 ──────────────────────────────────────────────────
#
# 원본은 이 넷을 환경변수(`PB_*`)로 덮을 수 있게 두고 밸런스를 재고 있었다.
# 이주 중에는 **기본값으로 굳힌다** — 두 변수를 동시에 움직이면 무엇이 원인인지
# 못 가린다. 계측을 다시 열 때 여기에 손잡이를 붙인다.

const PITCH_QUALITY_NOISE: float = 16.0
const PITCH_SKILL_SCALE: float = 1.0
## 밴드 표는 "동급 = 56"을 전제하는데 실측 평균이 48이다. 표를 다시 쓰는
## 대신 **입력을 옮긴다** — 오프셋은 여기 한 곳에서만 더한다
const CONTACT_Q_OFFSET: float = 0.0


# ── 투구 품질 ──────────────────────────────────────────────────────

## 구종별 바닥 품질
const PITCH_BASE: Dictionary = {
	"fastball": 59.0, "sinker": 57.0, "cutter": 56.0, "slider": 56.0,
	"curve": 54.0, "changeup": 53.0, "splitter": 54.0, "forkball": 53.0,
	"screwball": 52.0, "knuckleball": 50.0,
}

const STRATEGY_BONUS: Dictionary = {"aggressive": 2.0, "balanced": 0.0, "safe": -2.0}
const POWER_BONUS: Dictionary = {"low": -1.5, "normal": 0.0, "high": 2.8}

## 숙련도 → 품질.
##
## ⚠ **숙련도가 배우는 속도만 늦추던 시절엔 결과에 아예 안 닿았다.** 화면엔
## "숙련도 4/5"라고 적혀 있는데 던지면 차이가 없었다.
##
## ⚠ 폭을 넓게 잡았다가 1등급 패스트볼이 매 투구마다 −7.1을 먹었다. 품질은
## 여러 항의 **합**이고 다른 보정이 ±5 규모인데 혼자 그 이상을 움직였다 —
## 주인공 ERA가 8.78 → 19.86으로 튀었다
static func grade_quality_bonus(grade: int) -> float:
	match grade:
		0, 1:
			return -3.0
		2:
			return -1.5
		3:
			return 0.0
		4:
			return 1.5
		_:
			return 3.0


## 숙련도 → 선택 가중. 잘 다듬은 구종을 더 자주 던진다 — "주무기"가 생긴다
static func grade_pick_weight(grade: int) -> float:
	match grade:
		0, 1:
			return 0.5
		2:
			return 0.8
		3:
			return 1.0
		4:
			return 1.5
		_:
			return 2.0


# ── 제구 흩어짐 ────────────────────────────────────────────────────

const DISPERSION_BASE: float = 0.15
const DISPERSION_CONTROL_SCALE: float = 0.003
const DISPERSION_STAMINA_SCALE: float = 0.002
const DISPERSION_MENTAL_SCALE: float = 0.001
## 스트라이크존 바깥의 경계 폭 — 심판이 잡아줄 수도 있는 구간
const SHADOW_ZONE_HALF: float = 0.20
const SHADOW_UMPIRE_STRIKE_PROB: float = 0.45

## 겨냥한 곳의 난이도. 중앙은 벌점, 구석일수록 가점
const LOCATION_CENTER_PENALTY: float = -4.0
const LOCATION_DISTANCE_SCALE: float = 5.0


# ── 스윙 판단 ──────────────────────────────────────────────────────

const SWING_MARGIN_BASE: float = 0.18
const SWING_DISCIPLINE_SCALE: float = 0.003
const SWING_EYE_SCALE: float = 0.002
## 직구는 스윙을 부른다
const SWING_FASTBALL_BONUS: float = 0.08


# ── 장타 승격 ──────────────────────────────────────────────────────

const HIT_UPGRADE_SINGLE_TO_DOUBLE_BASE: float = 0.18
const HIT_UPGRADE_DOUBLE_TO_HR_BASE: float = 0.22


# ── 날씨·구장 ──────────────────────────────────────────────────────

static func weather_power_modifier(weather: String) -> float:
	match weather:
		"windyIn":
			return -0.1
		"windyOut":
			return 0.1
		_:
			return 0.0


static func weather_quality_modifier(weather: String, pitch_type: String) -> float:
	match weather:
		"rainy":
			# 비에는 변화구가 더 안 든다
			return -1.0 if pitch_type == "fastball" else -3.0
		"windyOut":
			return -2.0
		"windyIn":
			return 2.0
		"cloudy":
			return -0.5
		_:
			return 0.0


static func park_quality_modifier(park: String) -> float:
	match park:
		"pitcherPark":
			return 3.0
		"hitterPark":
			return -3.0
		_:
			return 0.0


# ── 병살 ───────────────────────────────────────────────────────────

const DOUBLE_PLAY_BASE_PROB: float = 0.22

## 직선타 병살 배수. 잡아서 주자를 묶는 경우라 땅볼보다 훨씬 드물다
const DOUBLE_PLAY_LINEDRIVE_MOD: float = 0.25


# ── 도루 ───────────────────────────────────────────────────────────
#
# ⚠ **계수가 "speed 50이 평균"을 전제했는데 실제 분포는 80 중심이었다.**
#
# 실측 리그 타자: speed p25 72 / 중앙 81 / p75 87 / p95 94, instinct 중앙 75.
# 옛 기준점(40)으로는 중앙 주자도 최고 주자도 전부 시도 상한에 붙어서
# **능력 차가 도루에 전혀 반영되지 않았다.** 기준점을 실측 중앙에 맞췄다.
#
# 성공률은 반대로 너무 낮았다. 중앙 주자 49.7%(KBO 68~72%)라 실패가 많았고,
# 그 아웃이 투수 이닝에 들어가 **리그 ERA를 4.71 → 3.98로 끌어내렸다.**

const OFFENSE_STEAL_MODIFIER: float = 0.006

const STEAL_HOLD_SCALE: float = 0.008
## 주루 판단의 기준점. **50으로 두면 전원이 1.5배가 된다** — 실측 중앙이 75다
const STEAL_INSTINCT_PIVOT: float = 75.0
const STEAL_HOLD_MIN: float = 0.4
const STEAL_HOLD_MAX: float = 1.6

# 1루 → 2루
const STEAL_2B_SPEED_PIVOT: float = 75.0
const STEAL_2B_ATTEMPT_SCALE: float = 0.008
const STEAL_2B_ATTEMPT_MAX: float = 0.30
const STEAL_2B_SUCCESS_BASE: float = 0.65   # KBO 도루 성공률 68~72%
const STEAL_2B_SUCCESS_PIVOT: float = 80.0
const STEAL_2B_SUCCESS_SCALE: float = 0.007
const STEAL_2B_SUCCESS_MIN: float = 0.40
const STEAL_2B_SUCCESS_MAX: float = 0.90

# 2루 → 3루 — 발이 아주 빠른 주자만 시도한다
const STEAL_3B_SPEED_GATE: float = 88.0     # 실측 p75 87 위 — 상위권만
const STEAL_3B_SPEED_PIVOT: float = 85.0
const STEAL_3B_ATTEMPT_SCALE: float = 0.006
const STEAL_3B_ATTEMPT_MAX: float = 0.16
const STEAL_3B_SUCCESS_BASE: float = 0.60   # 3루 도루는 2루보다 어렵다
const STEAL_3B_SUCCESS_PIVOT: float = 88.0
const STEAL_3B_SUCCESS_SCALE: float = 0.008
const STEAL_3B_SUCCESS_MIN: float = 0.35
const STEAL_3B_SUCCESS_MAX: float = 0.85


## 견제력이 도루 시도에 거는 배수. **두 모델이 같이 쓴다**
static func steal_hold_factor(hold_runners: float) -> float:
	return clampf(1.0 - (hold_runners - 50.0) * STEAL_HOLD_SCALE, STEAL_HOLD_MIN, STEAL_HOLD_MAX)


## 1루 주자의 [시도 확률, 성공 확률]
static func steal_second_probs(speed: float, instinct: float, hold_factor: float,
		manager_boost: float) -> Array:
	var attempt: float = clampf(
		(speed - STEAL_2B_SPEED_PIVOT) * STEAL_2B_ATTEMPT_SCALE
			* (instinct / STEAL_INSTINCT_PIVOT) * hold_factor + manager_boost,
		0.0, STEAL_2B_ATTEMPT_MAX)
	# 성공률은 견제와 무관하다 — 뛰고 나면 송구 싸움이다
	var success: float = clampf(
		STEAL_2B_SUCCESS_BASE + (speed - STEAL_2B_SUCCESS_PIVOT) * STEAL_2B_SUCCESS_SCALE,
		STEAL_2B_SUCCESS_MIN, STEAL_2B_SUCCESS_MAX)
	return [attempt, success]


## 2루 주자의 [시도 확률, 성공 확률]. **문턱 미만은 아예 시도하지 않는다**
static func steal_third_probs(speed: float, instinct: float, hold_factor: float,
		manager_boost: float) -> Array:
	if speed <= STEAL_3B_SPEED_GATE:
		return [0.0, 0.0]
	var attempt: float = clampf(
		(speed - STEAL_3B_SPEED_PIVOT) * STEAL_3B_ATTEMPT_SCALE
			* (instinct / STEAL_INSTINCT_PIVOT) * hold_factor + manager_boost,
		0.0, STEAL_3B_ATTEMPT_MAX)
	var success: float = clampf(
		STEAL_3B_SUCCESS_BASE + (speed - STEAL_3B_SUCCESS_PIVOT) * STEAL_3B_SUCCESS_SCALE,
		STEAL_3B_SUCCESS_MIN, STEAL_3B_SUCCESS_MAX)
	return [attempt, success]
