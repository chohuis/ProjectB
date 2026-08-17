extends RefCounted
class_name PlayerDetailVm

## 선수 상세 — F-4.
##
## 원본: `features/player/ui/PlayerDetailModal.svelte` (1,602줄)
##
## ⚠ **04는 선수를 눌러도 아무 일이 없었다.** 로스터에 서른 줄이 뜨는데
## 한 줄이 주는 건 포지션·이름·나이·OVR 넷이다 — **누가 어떤 선수인지를
## 알 방법이 없었다.** 트레이드도 드래프트도 "이름과 숫자 하나"로 판단해야
## 했다.
##
## ⚠ **주인공은 여기로 안 온다.** "나" 탭(`StatusVm`)이 훨씬 자세하고,
## 두 화면이 같은 사람을 다르게 그리면 어느 쪽이 맞는지 알 수 없다.
## 주인공을 누르면 "나" 탭이 정본이다 — `is_me`가 그걸 말한다.
##
## ⚠ **없는 것을 지어내지 않는다.** 02는 최근 5경기·팀 이력·수상·성격을
## 더 보여주는데 04엔 그 데이터가 없다. 빈 절을 만들어 두면 "아직 안 온 것"과
## "원래 없는 것"이 구분되지 않는다 — 데이터가 생기면 그때 붙인다.

## 표기는 **"나" 탭과 같아야 한다.** 여기 다시 적으면 같은 선수의 같은
## 능력치가 두 화면에서 다른 이름으로 뜬다
const PITCHING_LABELS: Array[Array] = StatusVm.PITCHING_LABELS

## 야수 능력치. 02 `PlayerDetailModal`의 "타격 능력치" · "주루 · 수비" 순서
## ⚠ **키 이름을 지어내면 그 줄이 조용히 빠진다.** `_stats`가 없는 축을
## 건너뛰기 때문에 오류도 안 난다 — `instinct`·`clutch`로 적었다가 실제
## 키가 `base_instinct`·`batting_clutch`였다(`player_gen.gd:80-82`)
const BATTING_LABELS: Array[Array] = [
	["contact", "컨택"], ["power", "파워"], ["eye", "선구안"],
	["discipline", "참을성"], ["batting_clutch", "승부처"], ["platoon", "좌우"],
	["speed", "주력"], ["base_instinct", "주루센스"], ["bunting", "번트"],
	["fielding", "수비"], ["arm", "송구"],
]


## 사람이 읽는 투구·타격 방향. 02 i18n의 `entity.handedness.L/R`이 "좌"/"우"이고
## `NewGamePage:334`가 거기에 "투"를 붙인다 — 야수는 던지는 손이 아니라
## 서는 쪽이 중요하므로 "타"를 붙인다.
##
## ⚠ **없으면 빈 문자열이다.** 옛 세이브에는 이 축이 없다 — "우투"로 채우면
## 실제로 없는 것과 오른손인 것이 구분되지 않는다
static func handedness_label(raw: String, pitcher: bool) -> String:
	if raw != "L" and raw != "R":
		return ""
	return ("좌" if raw == "L" else "우") + ("투" if pitcher else "타")


## 선수 하나. 못 찾으면 `{}`.
##
## ⚠ **로스터가 정본이다.** 여기서 세계를 다시 훑어 자기 목록을 만들면
## 그게 두 번째 정본이 된다 — 목록에 뜬 선수와 상세에 뜬 선수가 갈린다
static func build(state: Dictionary, player_id: String) -> Dictionary:
	if player_id.is_empty():
		return {}
	var p: Dictionary = _find(state, player_id)
	if p.is_empty():
		return {}

	var pos: String = String(p.get("position", ""))
	var pitcher: bool = PlayerGen.is_pitcher(pos)
	var me: String = String(state.get("protagonist", {}).get("id", ""))

	return {
		"id": player_id,
		"name": String(p.get("name", player_id)),
		"position": pos,
		# ⚠ **소속은 `StatusVm`이 정본이다** — 복무 중엔 팀이 없다(U-2b)
		"team_name": StatusVm.team_name_of(p),
		"league_label": String(StatusVm.LEAGUE_SHORT.get(
			String(p.get("league_id", "")), String(p.get("league_id", "")))),
		"age": int(p.get("age", 0)),
		"grade": int(p.get("grade", 0)),
		# ⚠ **투수는 투구 OVR, 야수는 타격 OVR** — `team_vm.gd:30-31`과 같다
		"ovr": int(roundf(float(p.get("pitching", {}).get("ovr", 0.0)) if pitcher
			else float(p.get("batting", {}).get("ovr", 0.0)))),
		"is_pitcher": pitcher,
		"handedness": handedness_label(String(p.get("handedness", "")), pitcher),
		# 주인공이면 "나" 탭이 정본이다 — 화면이 그리로 보낸다
		"is_me": player_id == me,
		"stats": _stats(p, pitcher),
		"contract": _contract(p),
		"military": StatusVm.military_of(p),
		"season": StatusVm.season_stats_of(state, player_id),
		"relation": _relation(state, player_id),
	}


## 로스터에서 찾는다. **주인공도 로스터에 있다**(`World.relink_protagonist`)
static func _find(state: Dictionary, player_id: String) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	for team_id in world.get("rosters", {}):
		for x in World.roster_of(world, String(team_id)):
			if String(x.get("id", "")) == player_id:
				return x
	return {}


## 능력치 줄. **투수면 투구, 야수면 타격이다** — 둘 다 보이면 절반이
## 언제나 20대로 뜨고 그건 "약하다"로 읽힌다
static func _stats(p: Dictionary, pitcher: bool) -> Array:
	var src: Dictionary = p.get("pitching" if pitcher else "batting", {})
	var labels: Array = PITCHING_LABELS if pitcher else BATTING_LABELS
	var out: Array = []
	for pair in labels:
		# ⚠ **없는 축은 줄을 안 만든다.** 0으로 채우면 "이 선수는 번트가
		# 0이다"로 읽히는데 실제로는 그 축을 안 만든 것이다
		if not src.has(pair[0]):
			continue
		out.append({"name": String(pair[1]), "value": float(src[pair[0]])})
	return out


## 소속·계약. 학교엔 계약이 없다
static func _contract(p: Dictionary) -> Dictionary:
	if not Contract.has_contract(String(p.get("league_id", ""))):
		return {}
	return {
		"salary": int(p.get("salary", 0)),
		"years_left": int(p.get("contract_years", 0)),
		"fa_eligible": Contract.is_fa_eligible(p),
	}


## 주인공과의 관계. **없으면 빈 사전** — 0으로 두면 "사이가 나쁘다"로 읽힌다.
##
## ⚠ **줄을 찾는 건 `RelationshipRunner`가 정본이다.** 여기서 목록을 직접
## 훑으면 키 이름(`person_id`)을 두 번 적게 되고, 한쪽만 바뀌면 관계가
## 조용히 안 뜬다
static func _relation(state: Dictionary, player_id: String) -> Dictionary:
	var r: Dictionary = RelationshipRunner.row_of(state, player_id)
	if r.is_empty():
		return {}
	var v: int = int(r.get("value", 0))
	return {"value": v, "label": Relationship.label_of(v),
		"tone": Relationship.tone_of(v)}
