extends RefCounted
class_name Pending

## 결정 대기줄 — 세계가 멈추고 사용자에게 묻는 자리. B-6b.
##
## 원본: `stores/season.ts`의 `pendingActions`
##
## ⚠ **줄은 이미 있었다** — `state["pending"]`을 `DayEngine.stop_reason`이 읽고
## `SeasonRunner`가 해마다 비운다. **새 키를 만들지 않는다.** 만들면 "멈추는
## 이유"의 정본이 둘이 되고, 한쪽에만 넣은 결정은 영영 안 물어본다.
##
## ⚠ **줄은 상태 안에 있다.** 02는 "한 해에 한 번" 가드를 스토어에만 두고
## 세이브에 안 넣어서, 막으려는 결과는 영구인데 가드는 세션 한정이었다 —
## 앱을 껐다 켜면 없던 일이 됐다.
##
## ⚠ **여기는 줄만 관리한다.** 무엇을 물을지·답을 어떻게 적용할지는
## `CareerDecision` · `ContractDecision` · `Military`가 한다.


const KEY: String = "pending"


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
