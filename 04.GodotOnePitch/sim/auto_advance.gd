extends RefCounted
class_name AutoAdvance

## 자동 진행 정책 — **무엇을 대신 답하고 무엇 앞에서 멈추나.** B-11.
##
## 원본: `usecases/runAutoAdvance.ts`
##
## ⚠ **여기가 02에서 결정을 조용히 버린 자리다.** 정지 목록에 없는 종류를
## `default:`가 그냥 해소해서 이런 일이 실제로 났다:
##
##   · 지명 통보가 목록 밖  → **지명을 받고도 계약 없이 고교에 남았다**
##   · 계약 셋이 목록 밖    → 재계약 제안이 사라지고 **2031년에 만료된
##                            계약이 2038년까지 남았다**(25시즌 실측)
##   · 트레이드가 "알림성"  → **통보만 사라지고 팀은 그대로**였다
##
## 분류 기준은 **"결과가 상태에 남는가"**다. 남으면 멈춘다.
##
## ⚠ **여기는 정책만 정한다.** 실제로 며칠을 진행하는 것은 `DayRunner`고,
## 그 반복을 도는 것은 화면이다 — 정책을 반복문 안에 적으면 화면마다
## 다른 규칙이 생긴다.


## 자동 진행이 대신 답하면 안 되는 것들.
##
## ⚠ **커리어가 갈리는 지점은 자동 진행이 대신 결정하면 안 된다.**
## 여기 없으면 조용히 버려진다
const STOPPING: Array[String] = [
	"career_choice_hub", "career_results", "career_choice",
	"draft_observe", "draft_notification",
	# 은퇴는 커리어가 끝나는 결정이다
	"retirement_ask",
	# 계약 — 지명 통보는 멈추는데 재계약은 안 멈출 이유가 없다
	"salary_negotiation", "option_clause", "fa_market",
	# 트레이드 — 소속이 바뀌고, 노트레이드 조항이 있으면 거부도 가능하다
	"trade", "injury_treatment",
	# 병역 — 커리어가 2년 가까이 멈추는 결정이다. 자동으로 정하면 안 된다.
	# ⚠ **04는 여기까지 아예 안 물었다** — `career_decision`이 갈 곳이 없을 때
	# 조용히 현역으로 보냈다. 02는 둘을 묻는다
	"sports_unit_apply", "military_enlist_ask",
]

## 멈춘 이유를 사람 말로. **빈 문자열은 안 돌려준다** — 그러면 화면에
## "정지: "만 뜬다
const LABELS: Dictionary = {
	"career_choice_hub": "대학·드래프트 지원 선택",
	"career_results": "진로 결과 확인",
	"career_choice": "진로 최종 선택",
	"draft_observe": "드래프트 관전",
	"draft_notification": "지명 계약 수락 여부",
	"retirement_ask": "은퇴 여부 결정",
	"salary_negotiation": "연봉 협상",
	"option_clause": "옵션 조항 확인",
	"fa_market": "FA 시장",
	"trade": "트레이드 통보",
	"injury_treatment": "부상 치료 선택",
	"sports_unit_apply": "체육부대 입대 신청",
	"military_enlist_ask": "입대 여부 결정",
	"game": "등판",
	"message": "소식 확인",
	"retired": "은퇴",
	"season_end": "시즌 종료",
}

## 여기 오면 멈춘다 — 시즌이 끝나 가는 자리를 그냥 지나치지 않는다
const STOP_WEEKS: Array[int] = [40, 51]

## 헛도는 것을 막는 상한. **없으면 세이브 하나 때문에 게임이 멈춘다**
const MAX_STEPS: int = 1000


static func is_stopping(type: String) -> bool:
	return STOPPING.has(type)


static func label_of(type: String) -> String:
	return String(LABELS.get(type, "결정 대기"))


## 자동 진행을 멈추는 첫 결정. **알림 뒤에 숨어 있어도 찾는다**
static func blocking(state: Dictionary) -> Dictionary:
	for a in Pending.all(state):
		if is_stopping(String(a.get("type", ""))):
			return a
	return {}


## 이번 주에 멈춰야 하나 — `from_week`에서 `to_week`으로 가는 길에
## 정지 주차를 지나쳤으면 그 주차.
##
## ⚠ **지나쳤는지를 본다.** "지금이 40주인가"로 물으면 한 번에 여러 주를
## 건너뛸 때 그 자리를 그냥 지나간다
static func stop_week_between(from_week: int, to_week: int) -> int:
	for w in STOP_WEEKS:
		if from_week < w and to_week >= w:
			return w
	return 0


# ── 선택지 고르기 ─────────────────────────────────────────────

## 지쳤을 때 고르는 말 / 팔팔할 때 고르는 말
const REST_WORDS: Array[String] = ["휴식", "거절", "패스", "쉬", "무시"]
const ACTIVE_WORDS: Array[String] = ["훈련", "수락", "참가", "도전", "시작"]

## 지침 정도는 **주인공 피로다** — 100이 탈진이다(`CLAUDE.md`의 두 축)
const TIRED_AT: float = 70.0
const FRESH_AT: float = 30.0


## 소식 선택지를 자동으로 고른다. 고른 것의 id.
##
## ⚠ **지쳤으면 쉬는 쪽, 팔팔하면 나서는 쪽.** 늘 첫 번째를 고르면
## 자동 진행이 피로를 무시하고 부상으로 간다
static func pick_choice(choices: Array, fatigue: float) -> String:
	# 하나뿐일 때를 따로 빼지 않는다 — 어느 갈래로 가든 그 하나가 나오므로
	# 절대 안 걸리는 죽은 지름길이 된다
	if choices.is_empty():
		return "ok"

	if fatigue >= TIRED_AT:
		var rest: String = _find(choices, REST_WORDS)
		if not rest.is_empty():
			return rest
	elif fatigue <= FRESH_AT:
		var active: String = _find(choices, ACTIVE_WORDS)
		if not active.is_empty():
			return active
	return String(choices[0].get("id", "ok"))


static func _find(choices: Array, words: Array) -> String:
	for c in choices:
		var label: String = String(c.get("label", ""))
		for w in words:
			if label.contains(String(w)):
				return String(c.get("id", ""))
	return ""


# ── 다음에 무엇을 하나 ────────────────────────────────────────

## 자동 진행이 지금 할 일. `{kind, ...}`
##
##   `stop`     — 사용자가 답해야 한다. `reason` · `label`
##   `answer`   — 대신 답할 수 있다. `action`
##   `advance`  — 더 갈 수 있다
##
## ⚠ **순서가 곧 정책이다.** 은퇴·시즌 끝을 먼저 보고, 그다음 멈추는 결정,
## 그다음 대신 답할 것, 마지막이 진행이다
static func next_step(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	if bool(p.get("retired", false)):
		return {"kind": "stop", "reason": "retired", "label": label_of("retired")}
	if int(state.get("day", 0)) >= int(state.get("season_days", 0)):
		return {"kind": "stop", "reason": "season_end", "label": label_of("season_end")}

	# ⚠ **대기줄 전체를 훑는다.** 아래 `stop_reason`은 줄의 **머리 하나**만
	# 보므로, 멈춰야 할 결정이 알림 뒤에 숨어 있으면 못 본다
	var block: Dictionary = blocking(state)
	if not block.is_empty():
		var bt: String = String(block["type"])
		return {"kind": "stop", "reason": bt, "label": label_of(bt), "action": block}

	# ⚠ **진행을 막는 게 대기줄만이 아니다.** 미결정 소식은 `mailbox`에,
	# 등판은 `schedule`에 있다 — 대기줄만 보면 여기서 "가도 된다"고 하는데
	# `DayEngine`은 하루도 안 민다. **자동 진행이 그 자리에서 상한까지
	# 헛돈다.** 무엇이 날을 막는지는 `DayEngine.stop_reason`이 정본이고,
	# 진행 버튼도 그걸 본다(`main_vm.gd:70`) — 여기서 따로 세면 갈린다
	var stop = DayEngine.stop_reason(state)
	if stop == null:
		return {"kind": "advance"}

	var t: String = String(stop.get("type", ""))
	return {"kind": "answer", "action": stop, "label": label_of(t)}


# ── 돌린다 ────────────────────────────────────────────────────

## 멈출 때까지 돈다. `{stopped, steps}`
##
## `advance`는 상태를 하루(혹은 며칠) 밀고, `answer`는 알림 하나를 대신
## 답한다 — **둘 다 부르는 쪽이 준다.** 화면은 화면 방식으로, 계측은
## 계측 방식으로 진행하되 **정책은 여기 하나다.**
##
## ⚠ **상한이 있다.** `answer`가 줄을 안 줄이면 여기서 영원히 돈다 —
## 세이브 하나 때문에 게임이 멈추면 안 된다
##
## ⚠ **`advance`·`answer`가 코루틴이어도 된다.** 화면 쪽 진행은
## `DayRunner`가 프레임을 넘기며 도는 코루틴이라 안 기다리면 **한 걸음이
## 끝나기 전에 다음 걸음이 시작된다.** 동기 함수를 넘겨도 그대로 돈다
## (재서 확인했다). 대신 `run` 자체가 코루틴이 되므로 부르는 쪽은 `await`를
## 붙여야 하고, 안 붙이면 파스 오류가 난다 — 조용히 어긋나지 않는다
static func run(state: Dictionary, advance: Callable, answer: Callable,
		max_steps: int = MAX_STEPS) -> Dictionary:
	var steps: int = 0
	while steps < max_steps:
		# ⚠ **훈련 계획을 여기서 세운다** (F-1b). 04엔 이게 없어서 자동
		# 진행이 여덟 해를 굴려도 훈련을 하나도 안 했다. 매 걸음 부르는 건
		# 02 `runAutoAdvance`와 같다 — 피로·사기가 오르내리므로 한 번 정하고
		# 두면 탈진한 채로 구속을 올린다. **사용자가 정한 계획은 안 건드린다.**
		#
		# ⚠ **`next_step`에 넣었다가 검사 셋이 깨졌다.** 그건 "지금 할 일이
		# 뭐냐"를 묻는 조회 함수라 화면도 부른다 — **물어보기만 해도 계획이
		# 덮였다.** 상태를 바꾸는 일은 루프 본체에 둔다(02도 그렇다)
		AutoTraining.apply(state)

		var step: Dictionary = next_step(state)
		var kind: String = String(step["kind"])
		if kind == "stop":
			return {"stopped": step, "steps": steps}

		steps += 1
		if kind == "answer":
			await answer.call(state, step["action"])
			continue

		# ⚠ **지나친 정지 주차를 잡는다.** 진행 뒤에 물어야 한다 —
		# 앞에서 물으면 그 주에 들어서기 전에 멈춘다
		var before: int = Calendar.week_of(int(state.get("day", 1)))
		await advance.call(state)
		var week: int = stop_week_between(before,
			Calendar.week_of(int(state.get("day", 1))))
		if week > 0:
			return {"steps": steps, "stopped": {"kind": "stop",
				"reason": "stop_week", "label": "W%d 도달" % week, "week": week}}

	return {"steps": steps, "stopped": {"kind": "stop", "reason": "max_steps",
		"label": "최대 반복 초과"}}
