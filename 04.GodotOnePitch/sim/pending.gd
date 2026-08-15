extends RefCounted
class_name Pending

## 결정 대기줄 — 세계가 멈추고 사용자에게 묻는 자리. B-6b.
##
## 원본: `stores/season.ts`의 `pendingActions` · `runAutoAdvance.ts`의 `STOP_PENDING`
##
## ⚠ **줄은 상태 안에 있다.** 02는 "한 해에 한 번" 가드를 스토어에만 두고
## 세이브에 안 넣어서, 막으려는 결과는 영구인데 가드는 세션 한정이었다 —
## 앱을 껐다 켜면 없던 일이 됐다.
##
## ⚠ **여기는 줄만 관리한다.** 무엇을 물을지·답을 어떻게 적용할지는
## `CareerDecision` · `ContractDecision` · `Military`가 한다.


const KEY: String = "pending_actions"


# ── 멈추는 결정 ───────────────────────────────────────────────

## 자동 진행이 대신 답하면 안 되는 것들.
##
## ⚠ **여기 없으면 조용히 버려진다.** 02는 목록 밖의 종류를 `default:`에서
## 그냥 해소했고, 그래서 이런 일이 실제로 났다:
##
##   · 지명 통보가 목록 밖 → **지명을 받고도 계약이 안 된 채 고교에 남았다**
##   · 계약 셋이 목록 밖 → 재계약 제안이 사라지고 **2031년에 만료된 계약이
##     2038년까지 남았다**(25시즌 헤드리스 실측)
##   · 트레이드가 "알림성"으로 분류 → **통보만 사라지고 팀은 그대로**였다
##
## 분류 기준은 "결과가 상태에 남는가"다 — 남으면 멈춘다
const STOPPING: Array[String] = [
	"career_choice_hub", "career_results", "career_choice",
	"draft_observe", "draft_notification",
	# 은퇴는 커리어가 끝나는 결정이다
	"retirement_ask",
	# 계약 — 지명 통보는 멈추는데 재계약은 안 멈출 이유가 없다
	"salary_negotiation", "option_clause", "fa_market",
	# 트레이드 — 소속이 바뀌고, 노트레이드 조항이 있으면 거부도 가능하다
	"trade",
]

## 멈춘 이유를 사람 말로. 없으면 뭉뚱그린 이름 — **빈 문자열은 안 돌려준다**
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
}


static func is_stopping(type: String) -> bool:
	return STOPPING.has(type)


static func label_of(type: String) -> String:
	return String(LABELS.get(type, "결정 대기"))


# ── 줄 ────────────────────────────────────────────────────────

static func all(state: Dictionary) -> Array:
	return state.get(KEY, [])


## 넣는다. 경기·소식처럼 **여럿이 정상인 것**에 쓴다
static func push(state: Dictionary, action: Dictionary) -> Dictionary:
	var q: Array = all(state)
	q.append(action)
	state[KEY] = q
	return action


## 같은 종류가 없을 때만 넣는다. 넣었으면 `true`.
##
## ⚠ **같은 결정을 두 번 쌓으면 같은 주가 무한 반복된다.** 02는 이 확인을
## 부르는 쪽마다 손으로 적었고, 빠뜨린 자리에서 실제로 반복이 났다 —
## 진로 결정은 전부 이쪽으로 넣는다
static func push_once(state: Dictionary, action: Dictionary) -> bool:
	if has(state, String(action.get("type", ""))):
		return false
	push(state, action)
	return true


static func has(state: Dictionary, type: String) -> bool:
	for a in all(state):
		if String(a.get("type", "")) == type:
			return true
	return false


## 그 종류의 첫 번째. 없으면 빈 사전
static func first(state: Dictionary, type: String) -> Dictionary:
	for a in all(state):
		if String(a.get("type", "")) == type:
			return a
	return {}


## 줄의 맨 앞. 없으면 빈 사전
static func next(state: Dictionary) -> Dictionary:
	var q: Array = all(state)
	return q[0] if not q.is_empty() else {}


## 자동 진행을 멈추는 첫 결정. **알림 뒤에 숨어 있어도 찾는다**
static func blocking(state: Dictionary) -> Dictionary:
	for a in all(state):
		if is_stopping(String(a.get("type", ""))):
			return a
	return {}


## 그 종류를 **하나** 뺀다. 뺐으면 `true`.
##
## ⚠ **한 번에 다 지우지 않는다** — 같은 종류가 여럿인 경기 대기가
## 통째로 사라진다
static func resolve(state: Dictionary, type: String) -> bool:
	var q: Array = all(state)
	for i in range(q.size()):
		if String(q[i].get("type", "")) == type:
			q.remove_at(i)
			state[KEY] = q
			return true
	return false


static func clear(state: Dictionary) -> void:
	state[KEY] = []
