extends RefCounted
class_name PitchDev

## 구종 습득 — 배우고 다듬는 자리. F-1.
##
## 원본: `growth_engine.rs:585-612`(진행·습득) ·
##       `stores/game.ts:2169-2199`(시작·완료) ·
##       `pitch_catalog.json` · `pitch_unlock_rules.json`
##
## ⚠ **이 축이 통째로 죽어 있었다.** `world.gd:280`이 직구 하나를 박고
## 끝이었고, `sim/` 어디에도 `pitches`에 `append`하거나 `grade`를 올리는 곳이
## 없었다. 소비처는 다 있었다 — `pitch_step`이 숙련도를 읽고
## `training_growth`가 성장 배수를 가른다. **생산처만 없었다.**
##
## ⚠ **`week_runner`가 진행률을 엉뚱한 데 쌓고 있었다.** `pitch_dev_gain`을
## `p["pitch_dev"]`라는 키에 더했는데 **읽는 곳이 0건**이고, 어느 구종을
## 배우는 중인지도 없어서 100을 넘겨도 아무 일이 안 일어났다.
##
## ⚠ **값은 02 그대로다.** 해금 문턱도 최대 보유 수도 시작 진행률도
## 여기서 새로 정하지 않았다 — `data/pitch_catalog.json`이 정본이다.

const PATH: String = "res://data/pitch_catalog.json"

## 시작할 때 진행률. **02가 5로 둔다** (`stores/game.ts:2176`) —
## 0이 아니라 5인 건 "시작했다"가 화면에 바로 보이게 하려는 것이다
const START_PROGRESS: float = 5.0

const MAX_GRADE: int = 5

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		var f := FileAccess.open(PATH, FileAccess.READ)
		if f == null:
			push_error("구종 표를 못 읽는다: %s" % PATH)
			return {}
		_data = JSON.parse_string(f.get_as_text())
	return _data


static func catalog() -> Array:
	return data().get("pitches", [])


static func max_learned() -> int:
	return int(data().get("max_learned", 5))


static func entry_of(pitch_id: String) -> Dictionary:
	for e in catalog():
		if String(e.get("id", "")) == pitch_id:
			return e
	return {}


## 그 선수가 지금 가진 등급. 없으면 0
static func grade_of(p: Dictionary, pitch_id: String) -> int:
	for e in p.get("pitches", []):
		if String(e.get("id", "")) == pitch_id:
			return int(e.get("grade", 0))
	return 0


static func owns(p: Dictionary, pitch_id: String) -> bool:
	return grade_of(p, pitch_id) > 0


## 능력치가 문턱을 넘었나.
##
## ⚠ **조건이 여럿이면 전부 넘어야 한다** (02 `multi_stat`). 하나만 보면
## 아직 못 던질 구종이 목록에 뜬다
static func is_unlocked(pitch_id: String, p: Dictionary) -> bool:
	var e: Dictionary = entry_of(pitch_id)
	if e.is_empty():
		return false
	var q: Dictionary = p.get("pitching", {})
	for cond in e.get("unlock", []):
		if float(q.get(String(cond.get("stat", "")), 0.0)) < float(cond.get("value", 0.0)):
			return false
	return true


## 훈련 화면이 받는 목록. `[{id, name, grade, owned, unlocked, can_train, why}]`
##
## ⚠ **못 고르는 것도 목록에 남긴다.** 02도 "조건 미충족"을 따로 보여줬다 —
## 빼 버리면 무엇을 올려야 열리는지 알 길이 없다
static func choices(p: Dictionary) -> Array:
	var owned_count: int = (p.get("pitches", []) as Array).size()
	var full: bool = owned_count >= max_learned()
	var out: Array = []
	for e in catalog():
		var id: String = String(e.get("id", ""))
		var grade: int = grade_of(p, id)
		var owned: bool = grade > 0
		var unlocked: bool = is_unlocked(id, p)

		# ⚠ **막힌 이유를 코드로 준다.** 문구는 화면 쪽 말이라 `TrainingVm`이
		# 만든다 — `sim`이 `ui`를 부르면 층이 거꾸로 선다
		var can: bool = true
		var why: String = ""
		if owned and grade >= MAX_GRADE:
			can = false
			why = "mastered"
		elif not owned and not unlocked:
			can = false
			why = "locked"
		elif not owned and full:
			# ⚠ **가진 걸 다듬는 건 그래도 된다** — 막는 건 새 구종뿐이다
			can = false
			why = "full"

		out.append({
			"id": id,
			"name": String(e.get("name", id)),
			"group": String(e.get("group", "")),
			"form_difficulty": int(e.get("form_difficulty", 0)),
			"grade": grade,
			"owned": owned,
			"unlocked": unlocked,
			"can_train": can,
			"why": why,
			# ⚠ **문턱을 그대로 싣는다.** "조건 미충족"만 있으면 무엇을 올려야
			# 열리는지 모른다 — 화면이 숫자로 말할 수 있어야 한다
			"unlock": e.get("unlock", []),
		})
	return out


## 훈련을 시작한다. 못 고르는 것이면 `false`.
##
## ⚠ **화면이 막아도 여기서 한 번 더 막는다.** 02는 화면에만 가드가 있어서
## 다른 호출부가 그대로 통과했다 — 군 복무를 세 번 하는 커리어가 그렇게 나왔다
static func start(p: Dictionary, pitch_id: String) -> bool:
	for c in choices(p):
		if String(c["id"]) != pitch_id:
			continue
		if not bool(c["can_train"]):
			return false
		p["training_pitch_state"] = {"id": pitch_id, "progress": START_PROGRESS}
		return true
	return false


## 훈련을 접는다 — 진행률은 버린다. 02도 남겨 두지 않는다
static func cancel(p: Dictionary) -> void:
	p["training_pitch_state"] = {}


## 한 주치 진행. 무엇이 일어났는지를 줄로 돌려준다.
##
## ⚠ **100을 넘으면 배우거나 등급이 오른다.** 새 구종은 1등급으로 들어오고
## (02 그대로) 이미 가진 것은 +1, **5를 안 넘는다.**
##
## ⚠ **배우고 나면 훈련 자리를 비운다.** 안 비우면 다음 주에 또 배운다
static func advance(p: Dictionary, gain: float) -> Array:
	if gain <= 0.0:
		return []
	var ts: Dictionary = p.get("training_pitch_state", {})
	if ts.is_empty():
		return []

	var id: String = String(ts.get("id", ""))
	var progress: float = float(ts.get("progress", 0.0)) + gain
	if progress < 100.0:
		p["training_pitch_state"] = {"id": id, "progress": progress}
		return []

	var name: String = String(entry_of(id).get("name", id))
	var logs: Array = []
	var pitches: Array = p.get("pitches", [])
	var found: bool = false
	for e in pitches:
		if String(e.get("id", "")) != id:
			continue
		found = true
		var g: int = int(e.get("grade", 0))
		if g >= MAX_GRADE:
			logs.append("%s 이미 마스터" % name)
		else:
			e["grade"] = g + 1
			logs.append("%s 숙련도 %d→%d" % [name, g, g + 1])
		break
	if not found:
		pitches.append({"id": id, "grade": 1})
		logs.append("%s 습득!" % name)
	p["pitches"] = pitches
	p["training_pitch_state"] = {}
	return logs
