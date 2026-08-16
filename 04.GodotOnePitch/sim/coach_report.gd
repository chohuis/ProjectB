extends RefCounted
class_name CoachReport

## 코치 리포트 — F-8. **선택지가 든 소식을 만드는 유일한 자리.**
##
## 원본: `usecases/advanceWeek.ts:1400-1484`
##
## ⚠ **04엔 `decision`이 든 소식을 만드는 곳이 없었다.** 채우는 건
## `fixtures.gd`뿐인데 **읽는 쪽은 셋이다** — `DayEngine.stop_reason`이
## 그걸 보고 진행을 막고, `AutoAdvance.pick_choice`가 대신 답하고,
## `NewsVm`이 걸러 낸다. 셋 다 실제 게임에서 한 번도 안 돌았다.
##
## ⚠ **값은 02 그대로다.** 3주마다 · 네 갈래 · 효과 수치까지.

## 몇 주마다 오나 — 02 `weekInYear % 3 === 0`
const EVERY_WEEKS: int = 3

## 갈래를 가르는 문턱 — 02 그대로
const FATIGUE_HIGH: float = 65.0
const CONDITION_GOOD: float = 82.0
const MORALE_GOOD: float = 68.0
const MORALE_LOW: float = 40.0

## 피로 꼬리표 문턱
const FATIGUE_TAG_DANGER: float = 70.0
const FATIGUE_TAG_WARN: float = 50.0

## 복무 중인 단계 이름. **`military.gd`가 리터럴로 쓴다**(87·124줄) —
## 04에 상수가 없어서 여기 적는다. 그쪽이 바뀌면 검사가 잡는다
const STAGE_MILITARY: String = "military"


## 이번 주에 오나. **복무 중엔 안 온다** — 코치가 없다
static func due(state: Dictionary, week: int) -> bool:
	if week <= 0 or week % EVERY_WEEKS != 0:
		return false
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty() or bool(p.get("retired", false)):
		return false
	return String(p.get("career_stage", "")) != STAGE_MILITARY


## 지금 상태에서 어느 갈래인가. `{recommendation, choices}`
##
## ⚠ **순서가 곧 우선순위다.** 피로가 먼저다 — 지쳐 있는데 "집중 훈련
## 적기"라고 하면 코치가 몸 상태를 안 보는 것이 된다
static func advice(p: Dictionary) -> Dictionary:
	var fatigue: float = float(p.get("fatigue", 0.0))
	var condition: float = float(p.get("condition", 0.0))
	var morale: float = float(p.get("morale", 50.0))

	if fatigue >= FATIGUE_HIGH:
		return {
			"recommendation": "피로도 %d — 회복 최우선 권고." % roundi(fatigue),
			"choices": [
				{"id": "rest", "label": "회복에 집중한다",
					"hint": "피로 −8 · 컨디션 +4",
					"fatigue_delta": -8.0, "condition_delta": 4.0},
				{"id": "push", "label": "훈련을 유지한다", "hint": "변화 없음"},
			],
		}
	if condition >= CONDITION_GOOD and morale >= MORALE_GOOD:
		return {
			"recommendation": "컨디션·사기 양호 — 집중 훈련 적기.",
			"choices": [
				{"id": "intensive", "label": "강도를 높여 훈련한다",
					"hint": "커맨드 경험치 +3 · 피로 +4",
					"fatigue_delta": 4.0, "xp": {"command": 3.0}},
				{"id": "steady", "label": "지금 루틴을 유지한다", "hint": "변화 없음"},
			],
		}
	if morale <= MORALE_LOW:
		return {
			"recommendation": "사기 저하 감지 — 멘탈 관리 병행 권고.",
			"choices": [
				{"id": "mental", "label": "멘탈 케어를 병행한다",
					"hint": "사기 +6", "morale_delta": 6.0},
				{"id": "grind", "label": "훈련에만 집중한다", "hint": "변화 없음"},
			],
		}
	return {
		"recommendation": "현재 상태 안정적 — 루틴 유지 권장.",
		"choices": [
			{"id": "balance", "label": "지금 루틴을 유지한다", "hint": "변화 없음"},
			{"id": "recover", "label": "회복 세션을 더한다",
				"hint": "피로 −4 · 컨디션 +2",
				"fatigue_delta": -4.0, "condition_delta": 2.0},
		],
	}


static func fatigue_tag(fatigue: float) -> String:
	if fatigue >= FATIGUE_TAG_DANGER:
		return "위험"
	if fatigue >= FATIGUE_TAG_WARN:
		return "주의"
	return "정상"


## 소식 하나. **`decision`이 붙어 있어 진행을 막는다** — 답해야 다음 주로 간다
static func build(state: Dictionary, week: int, at_day: int) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var a: Dictionary = advice(p)
	var pit: Dictionary = p.get("pitching", {})
	var fatigue: float = float(p.get("fatigue", 0.0))

	var lines: PackedStringArray = PackedStringArray([
		"■ 능력치",
		"  구위 %d  커맨드 %d  제구 %d  스태미나 %d" % [
			roundi(float(pit.get("velocity", 0.0))),
			roundi(float(pit.get("command", 0.0))),
			roundi(float(pit.get("control", 0.0))),
			roundi(float(pit.get("stamina", 0.0)))],
	])
	var era: String = _era_line(state, String(p.get("id", "")))
	if not era.is_empty():
		lines.append(era)
	lines.append_array(PackedStringArray([
		"",
		"■ 상태",
		"  컨디션 %d  ·  피로 %d [%s]  ·  사기 %d" % [
			roundi(float(p.get("condition", 0.0))), roundi(fatigue),
			fatigue_tag(fatigue), roundi(float(p.get("morale", 50.0)))],
		"",
		"■ 권고",
		"  %s" % a["recommendation"],
	]))

	return {
		"id": "msg-coach-report-w%d-y%d" % [week, int(state.get("season_year", 0))],
		"category": "coach",
		"sender": "투수코치",
		"subject": "[코치 리포트] %d주차 점검" % week,
		"preview": String(a["recommendation"]),
		"body": "\n".join(lines),
		"day": at_day, "read": false,
		# ⚠ **진행을 막지 않는다.** 02도 코치 리포트로는 `pendingAction`을
		# 안 민다(`advanceWeek.ts:1400-1484`) — 답을 안 해도 다음 주가 온다.
		#
		# ⚠ **막게 두면 게임이 3주차에서 멈춘다.** 04는 주간 처리가 진행이
		# **다 끝난 뒤** 몰려 돌아서, 한 번에 28일 가면 리포트가 나중에 생겨
		# 안 막히고 하루씩 가면 21일에 생겨 막힌다 — **같은 28일인데 22일과
		# 29일로 갈렸다.** 검사가 그걸 잡았다("천천히 진행하면 더 큰다")
		"decision": {
			"prompt": "이번 주 방향을 정하세요.",
			"choices": a["choices"],
			"selected": null,
			"blocking": false,
		},
	}


## 시즌 방어율 한 줄. 기록이 없으면 빈 문자열
static func _era_line(state: Dictionary, player_id: String) -> String:
	var st: Dictionary = state.get("season_stats", {}).get(player_id, {})
	if st.is_empty() or float(st.get("ip", 0.0)) <= 0.0:
		return ""
	var era: float = float(st.get("era", 0.0))
	var band: String = "최상위권" if era < 2.5 else (
		"안정권" if era < 3.5 else ("주의 필요" if era < 5.0 else "위험 수준"))
	return "  시즌 평균자책 %.2f  (%s)" % [era, band]


## 이번 주 리포트를 소식함에 넣는다. 넣었으면 `true`.
##
## ⚠ **같은 주에 두 번 안 넣는다.** id가 주차와 연도로 정해지므로 이미
## 있으면 건너뛴다 — 두 개가 쌓이면 진행이 두 번 막힌다
static func push(state: Dictionary, week: int, at_day: int) -> bool:
	if not due(state, week):
		return false
	var msg: Dictionary = build(state, week, at_day)
	var mailbox: Array = state.get("mailbox", [])
	for m in mailbox:
		if String(m.get("id", "")) == String(msg["id"]):
			return false
	mailbox.append(msg)
	state["mailbox"] = mailbox
	return true


## 고른 선택지의 효과를 적용한다. 적용했으면 `true`.
##
## ⚠ **여기가 유일한 적용 자리다.** 화면이 직접 상태를 고치면 자동 진행이
## 고른 답은 효과가 안 걸린다 — 두 입구가 다른 일을 한다
static func apply(state: Dictionary, message_id: String,
		option_id: String) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty():
		return false

	for m in state.get("mailbox", []):
		if String(m.get("id", "")) != message_id:
			continue
		var d = m.get("decision", null)
		if d == null or d.get("selected", null) != null:
			return false
		for c in d.get("choices", []):
			if String(c.get("id", "")) != option_id:
				continue
			d["selected"] = option_id
			m["read"] = true
			_apply_effects(p, c)
			return true
		return false
	return false


## ⚠ **범위를 벗어나지 않게 가둔다.** 피로가 음수면 그 뒤 판정이 전부 뒤집힌다
static func _apply_effects(p: Dictionary, choice: Dictionary) -> void:
	p["fatigue"] = clampf(float(p.get("fatigue", 0.0))
		+ float(choice.get("fatigue_delta", 0.0)), 0.0, 100.0)
	p["condition"] = clampf(float(p.get("condition", 0.0))
		+ float(choice.get("condition_delta", 0.0)), 0.0, 100.0)
	p["morale"] = clampf(float(p.get("morale", 50.0))
		+ float(choice.get("morale_delta", 0.0)), 0.0, 100.0)

	var xp: Dictionary = choice.get("xp", {})
	if xp.is_empty():
		return
	# 투구 경험치는 `TrainingGrowth`가 쓰는 그릇에 넣는다 — 따로 두면
	# 다음 성장에서 아무도 안 읽는다
	var bank: Dictionary = p.get("pitching_xp", {})
	for k in xp:
		bank[k] = float(bank.get(k, 0.0)) + float(xp[k])
	p["pitching_xp"] = bank
