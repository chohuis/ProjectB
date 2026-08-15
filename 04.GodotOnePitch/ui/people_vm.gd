extends RefCounted
class_name PeopleVm

## 인물(관계도) — C-2.
##
## 원본: `pages/people/PeoplePage.svelte`
##
## ⚠ **관계값 숫자를 절대 보여주지 않는다.** 7단계 라벨과 방향 문장만 쓴다.
## 효과도 "+4"가 아니라 "출전 기회에서 유리합니다"로 쓴다 — 규칙 파일 수치를
## 고칠 때 화면 문자열이 거짓말이 되지 않게 하려는 것이기도 하다. 그래서
## 여기서 나가는 행에는 **`value` 자체가 없다.**
##
## ⚠ **관계 행에는 id만 있다.** 이름은 세계에서 찾아 여기서 붙인다 —
## 화면이 스태프표와 로스터를 뒤지게 두면 또 계산이 화면으로 샌다.


## 좌: 지금 함께 있는 사람 · 우: 지난 인연. 재회 서사가 여기서 보인다
const SUB: String = "관계는 경기 결과·훈련·이벤트로 조금씩 움직입니다."
const EMPTY: String = "아직 관계가 쌓인 인물이 없습니다. 한 주를 진행하면 팀 사람들과의 관계가 생깁니다."
const EMPTY_TOGETHER: String = "지금 팀에 관계가 쌓인 사람이 없습니다."
const EMPTY_PAST: String = "아직 헤어진 사람이 없습니다."
const NOTE_PAST: String = "헤어진 관계는 시즌이 지날수록 옅어집니다. 다시 만나면 그 자리에서 이어집니다."

const KIND_LABEL: Dictionary = {
	Relationship.KIND_MANAGER: "감독",
	Relationship.KIND_COACH: "코치",
	Relationship.KIND_OWNER: "구단주",
	Relationship.KIND_TEAMMATE: "동료",
	Relationship.KIND_RIVAL: "라이벌",
}

## ⚠ **역할이 먼저다.** 감독·구단주가 위에 있어야 "누가 나를 쓰는가"가
## 먼저 보인다 — 동료 서른 명 밑에 감독이 묻히면 화면의 뜻이 없다
const KIND_ORDER: Array = [
	Relationship.KIND_MANAGER, Relationship.KIND_OWNER,
	Relationship.KIND_COACH, Relationship.KIND_TEAMMATE,
	Relationship.KIND_RIVAL,
]

## 효과는 **방향만** 문장으로. 수치는 `data/relationship_rules.json`이 정본이고
## 여기 숫자를 적으면 튜닝할 때마다 화면이 거짓말이 된다
const EFFECT_UP: Dictionary = {
	Relationship.KIND_MANAGER: "출전 기회와 보직 배정에서 유리합니다.",
	Relationship.KIND_COACH: "담당 영역 훈련 효율이 오릅니다.",
	Relationship.KIND_OWNER: "재계약 협상에서 여유를 두고 봅니다.",
	Relationship.KIND_TEAMMATE: "팀 분위기와 동료 이벤트에 좋게 반영됩니다.",
	Relationship.KIND_RIVAL: "서로를 인정하는 사이입니다.",
}
const EFFECT_DOWN: Dictionary = {
	Relationship.KIND_MANAGER: "출전 기회 배정에서 뒤로 밀릴 수 있습니다.",
	Relationship.KIND_COACH: "담당 영역 훈련 효율이 떨어집니다.",
	Relationship.KIND_OWNER: "재계약·방출 판정이 냉정해집니다.",
	Relationship.KIND_TEAMMATE: "팀 분위기에 부담이 됩니다.",
	Relationship.KIND_RIVAL: "적대감이 짙습니다.",
}
const EFFECT_NEUTRAL: String = "아직 특별한 영향은 없습니다."


static func build(state: Dictionary) -> Dictionary:
	var rows: Array = RelationshipRunner.rows_of(state)
	var names: Dictionary = _names_of(state.get("world", {}), rows)

	var together: Array = []
	var past: Array = []
	for r in rows:
		if String(r.get("contact", Relationship.CONTACT_TOGETHER)) \
				== Relationship.CONTACT_TOGETHER:
			together.append(_row(r, names, true))
		else:
			past.append(_row(r, names, false))

	together.sort_custom(func(a, b) -> bool:
		if int(a["_rank"]) != int(b["_rank"]):
			return int(a["_rank"]) < int(b["_rank"])
		return int(a["_sort"]) > int(b["_sort"]))
	# 지난 인연은 **진하게 남은 것부터** — 적대도 각별만큼 서사다
	past.sort_custom(func(a, b) -> bool:
		return absi(int(a["_sort"])) > absi(int(b["_sort"])))

	for r in together + past:
		r.erase("_rank")
		r.erase("_sort")

	return {
		"sub": SUB,
		"has_data": not rows.is_empty(),
		"empty": EMPTY,
		"together": {"label": "지금 함께", "count": together.size(),
			"empty": EMPTY_TOGETHER, "rows": together},
		"past": {"label": "지난 인연", "count": past.size(),
			"empty": EMPTY_PAST, "note": NOTE_PAST, "rows": past},
	}


## 필요한 id만 세계에서 찾는다.
##
## ⚠ **세계 전체를 훑되 필요한 것만 담는다.** 지난 인연은 다른 팀에 가 있어서
## 지금 팀만 보면 옛 동료가 통째로 이름 없는 줄이 되므로 범위는 세계 전체다.
##
## ⚠ **찾을 것을 다 찾으면 그 자리에서 끝낸다.** 이 사전은 `MainVm`을 거쳐
## **화면을 다시 그릴 때마다** 만들어진다 — 관계 마흔 줄을 채우려고 선수
## 9,600명의 이름을 매번 담았더니 새로 그릴 때마다 6.45ms였다
static func _names_of(world: Dictionary, rows: Array) -> Dictionary:
	var wanted: Dictionary = {}
	for r in rows:
		wanted[String(r.get("person_id", ""))] = true

	var out: Dictionary = {}
	# 스태프가 먼저다 — 수가 적고 감독·코치가 목록 위에 오는 사람들이다
	var staff: Dictionary = Staff.all_of(world)
	for tid in staff:
		for s in staff[tid]:
			var sid: String = String(s.get("id", ""))
			if wanted.has(sid):
				out[sid] = String(s.get("name", ""))

	for tid in world.get("rosters", {}):
		for p in world["rosters"][tid]:
			var pid: String = String(p.get("id", ""))
			if wanted.has(pid):
				out[pid] = String(p.get("name", ""))
		if out.size() == wanted.size():
			return out
	return out


## ⚠ **헤어진 사람에게는 효과 문장을 붙이지 않는다.** `effects_of`가 접촉
## 중인 관계만 세므로, 지난 인연에 "출전 기회에서 유리합니다"를 찍으면
## 화면이 없는 효과를 약속한다 — 대신 언제 만났는지를 남긴다
static func _row(r: Dictionary, names: Dictionary, active: bool) -> Dictionary:
	var kind: String = String(r.get("kind", ""))
	var value: int = int(r.get("value", 0))
	var ended: bool = String(r.get("contact", Relationship.CONTACT_TOGETHER)) \
		== Relationship.CONTACT_ENDED
	var met: int = int(r.get("met_season", 0))
	return {
		"person_id": String(r.get("person_id", "")),
		"kind": kind,
		"name": _name_of(String(r.get("person_id", "")), kind, names),
		"kind_label": _kind_label(kind, String(r.get("specialty", "")), ended),
		"label": Relationship.label_of(value),
		"tone": Relationship.tone_of(value),
		"detail": _effect_of(kind, value) if active \
			else ("%d년에 만남" % met if met > 0 else ""),
		"ended": ended,
		"_rank": _rank_of(kind),
		"_sort": value,
	}


## ⚠ **은퇴 등으로 세계에서 사라진 상대는 이름이 없다.** 빈칸으로 두면
## 지난 인연이 이름 없는 줄로 남는다 — 역할명으로 대신한다
static func _name_of(pid: String, kind: String, names: Dictionary) -> String:
	var found: String = String(names.get(pid, ""))
	if not found.is_empty():
		return found
	return "(%s)" % String(KIND_LABEL.get(kind, "인물"))


## ⚠ **코치는 한 팀에 여덟 명까지 있다.** 전문 분야를 안 붙이면 여덟 줄이
## 전부 "코치"라 누가 내 훈련을 봐 주는지 못 가린다
static func _kind_label(kind: String, specialty: String, ended: bool) -> String:
	var out: String = String(KIND_LABEL.get(kind, kind))
	if not specialty.is_empty():
		out += " · %s" % specialty
	if ended:
		out += " · 은퇴"
	return out


static func _rank_of(kind: String) -> int:
	var i: int = KIND_ORDER.find(kind)
	return KIND_ORDER.size() if i < 0 else i


## ⚠ **라벨로 가른다, 부호가 아니라.** 중립은 −10~10이라 +2도 중립인데
## 부호로 가르면 "유리합니다"가 뜬다 — 판정도 라벨로 하므로 실제로는
## 아무 일도 안 일어나고, 그 어긋남은 플레이어에게만 보인다
static func _effect_of(kind: String, value: int) -> String:
	var step: int = Relationship.label_step(value)
	if step == 0:
		return EFFECT_NEUTRAL
	var table: Dictionary = EFFECT_UP if step > 0 else EFFECT_DOWN
	return String(table.get(kind, EFFECT_NEUTRAL))
