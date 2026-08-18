extends RefCounted
class_name TeamMarkVm

## 팀 마크 배정 — U-1. 원본: 02 `shared/utils/teamMark.ts`
##
## ⚠ **해시로만 고르면 같은 권역에서 겹친다**(02 주석). 그래서 그룹
## (리그 · 고교는 권역) 안에서 **자리 번호로 배정**한다. 02가 그 이유를
## 적어 뒀다 — 가장 큰 그룹이 대학 50팀이고 `lcm(5, 12) = 60`이라
## (외곽, 문양) 짝이 그룹 안에서 안 겹친다.
##
## ⚠ **04는 문양이 아직 없다**(외곽 5 × 띠 4 = 20). 그래서 20팀이 넘는
## 그룹에서는 짝이 돈다 — 실측: 고교 권역 최대 20팀 · 대학 50팀.
## **대학은 겹친다.** 문양 12종을 옮기면 60으로 늘어난다. 지금 적어 둔다.
##
## ⚠ **1군과 2군은 같은 마크다**(02와 같다) — `_1`·`_2`를 떼고 같은 키로 본다.
##
## ⚠ **색은 데이터가 정한다** — `teams.json`의 `colors` 두 개.
## 없으면 `AppTheme`의 중립색으로 떨어진다(화면이 비지 않게)

## 02 `SHELL_ORDER` 그대로
const SHELLS: Array[String] = ["shield", "circle", "hex", "wedge", "rhomb"]
const BANDS: int = 4

## 색이 없는 팀 — 04에만 있는 특수 팀(상무 등)이 그렇다
const FALLBACK_PRIMARY: String = "#2b3a55"
const FALLBACK_ACCENT: String = "#cbd5e1"


## 1군·2군을 한 팀으로 본다 — 02 `markKey`
static func mark_key(team_id: String) -> String:
	if team_id.ends_with("_1") or team_id.ends_with("_2"):
		return team_id.substr(0, team_id.length() - 2)
	return team_id


## 데이터를 찾을 때 쓰는 id.
##
## 🔴 **2군은 `World.teams_of`가 거른다.** 그래서 `_2` 팀은 그룹 목록에
## 없고 자리 번호를 못 찾아 **폴백 해시로 떨어졌다** — 1군과 다른 마크가
## 나왔다(실측이 잡았다). 같은 구단이면 같은 마크여야 한다
static func _ref_id(team_id: String) -> String:
	if team_id.ends_with("_2"):
		return mark_key(team_id) + "_1"
	return team_id


## 그 팀이 속한 그룹. **고교는 권역(구장)이 그룹이다** — 02와 같다.
## 한 화면에 같이 뜨는 것들이 서로 달라야 한다
static func group_of(team_id: String) -> String:
	var league: String = String(World.team_field({}, _ref_id(team_id), "league_id", ""))
	if league == "LEAGUE_HIGHSCHOOL":
		return String(World.team_field({}, _ref_id(team_id), "stadium", league))
	return league


## 그룹 안 자리 번호. **id 순으로 센다** — 데이터 순서는 흔들릴 수 있다
static func slot_of(team_id: String) -> int:
	var key: String = mark_key(team_id)
	var group: String = group_of(team_id)
	var keys: Array = []
	for t in World.teams_of(String(World.team_field({}, _ref_id(team_id), "league_id", ""))):
		var tid: String = String(t["id"])
		if group_of(tid) != group:
			continue
		var k: String = mark_key(tid)
		if not keys.has(k):
			keys.append(k)
	keys.sort()
	var i: int = keys.find(key)
	# 그룹을 못 찾으면 해시로 — 02도 배정표에 없는 팀엔 폴백을 쓴다
	return i if i >= 0 else absi(Rng.mix(["mark", key])) % (SHELLS.size() * BANDS)


## 화면이 그릴 마크 한 벌
static func build(team_id: String) -> Dictionary:
	var slot: int = slot_of(team_id)
	var colors: Array = World.team_field({}, _ref_id(team_id), "colors", [])
	return {
		"team_id": team_id,
		# ⚠ **외곽과 띠를 다른 눈금으로 돌린다** — 같은 눈금이면 5팀마다
		# 같은 짝이 나온다
		"shell": SHELLS[slot % SHELLS.size()],
		"band": (slot / SHELLS.size()) % BANDS,
		"primary": String(colors[0]) if colors.size() > 0 else FALLBACK_PRIMARY,
		"accent": String(colors[1]) if colors.size() > 1 else FALLBACK_ACCENT,
	}
