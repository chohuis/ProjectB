extends RefCounted
class_name ParkVm

## 홈 팀 → 어느 구장 그림을 띄우고 어느 좌표를 쓰나 — M7-6e3.
##
## 원본: `shared/utils/parkView.ts` · `parkAnchors.ts`
##
## ⚠ **예전엔 프로 구장 하나가 하드코딩이었다.** 그래서 고교 경기도 대학
## 경기도 전부 프로 구장에서 열렸고, 구장 27개를 미리 정해 둔 설계가 화면에
## 하나도 반영되지 않았다.
##
## ⚠ **좌표가 티어마다 다르다.** 원본 구장 그림 세 장이 각각 따로 그려져
## 내야 다이아몬드 위치가 다르다 — 한 벌로 쓰면 수비수가 베이스에서 벗어난다.

const PATH: String = "res://data/parks.json"
const IMAGE_DIR: String = "res://assets/park"

## 구장을 못 정했을 때 — 프로 좌표. **02와 같은 기본값이다**
const DEFAULT_TIER: String = "pro"

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		var f := FileAccess.open(PATH, FileAccess.READ)
		if f == null:
			push_error("구장 표를 못 읽는다: %s" % PATH)
			return {}
		_data = JSON.parse_string(f.get_as_text())
	return _data


static func viewbox() -> Vector2:
	var v: Dictionary = data().get("viewbox", {})
	return Vector2(float(v.get("width", 1000)), float(v.get("height", 920)))


## 그 구장이 어느 티어인가. **모르는 구장은 프로로 본다** —
## 해외(ABL·JBL)는 구장을 한글 이름으로 참조하고 정의가 없다
static func tier_of(stadium_id: String) -> String:
	return String(data().get("tier_of", {}).get(stadium_id, DEFAULT_TIER))


## 사람이 읽는 구장 이름 — F-4c. 원본: `refs.json`의 `stadiums`
## (02 `TeamDetailModal.svelte:41-42`가 그 표를 찾아 쓴다).
##
## ⚠ **국내 182팀의 구장이 전부 `STADIUM_SEOUL_ROYALS` 꼴로 화면에 샜다.**
## 이름 표를 안 옮겨서다 — 02 refs.json에 27개가 다 있었다.
##
## ⚠ **폴백은 원문 그대로다.** 실측(238팀)에서 182팀이 표에 있고 56팀이
## 해외 한글 이름이며 **표에 없는 id꼴은 0팀**이다. 그래서 02의
## `id.replace(/^STADIUM_/, "")` 갈래는 04에선 절대 안 도는 죽은 코드다
static func name_of(stadium_id: String) -> String:
	return String(data().get("names", {}).get(stadium_id, stadium_id))


## 구장 성향 — "타자친화" · "투수친화" · "중립" (F-4d).
## 원본: `refs.json`의 `stadiums[].parkFactor` · 02 `NewGamePage:644`가 표시한다.
##
## ⚠ **표시용이다. 경기 엔진에 안 먹인다.** 02도 안 먹인다 —
## `parkFactor`는 타입 정의와 새 게임 화면 둘뿐이고 **Rust 엔진엔 0건**이다.
## 엔진의 `park`(`match_engine.rs:373`·`:680`)는 다른 축인데 그쪽도 죽어
## 있다: 값을 넘기는 `MatchPage:763`의 `matchPark`가 `"neutral"`로 시작해
## snapshot으로만 갱신되므로(`:655`·`:865`) **늘 중립이다.** 문자열을
## `ParkType`으로 바꾸는 코드도 없다. **먹이는 건 이주가 아니라 새 밸런스다.**
##
## ⚠ **표에 없으면 빈 문자열이다** — 해외 구장은 성향이 없다
static func factor_of(stadium_id: String) -> String:
	return String(data().get("factors", {}).get(stadium_id, ""))


## 전용 그림이 있나. 없으면 티어 기본 그림을 쓴다
static func has_own_image(stadium_id: String) -> bool:
	return data().get("images", []).has(stadium_id)


static func image_path(stadium_id: String) -> String:
	if has_own_image(stadium_id):
		return "%s/%s.png" % [IMAGE_DIR, stadium_id]
	return "%s/tier_%s.png" % [IMAGE_DIR, tier_of(stadium_id)]


## 티어 좌표. `{field: {home, first, second, third, mound}, defense: [...]}`
static func coords_of(tier: String) -> Dictionary:
	var all: Dictionary = data().get("coords", {})
	return all.get(tier, all.get(DEFAULT_TIER, {}))


static func _pt(d) -> Vector2:
	if typeof(d) != TYPE_DICTIONARY:
		return Vector2.ZERO
	return Vector2(float(d.get("x", 0.0)), float(d.get("y", 0.0)))


## 구장 하나. 화면은 이 사전만 보고 그린다
static func build(stadium_id: String) -> Dictionary:
	var tier: String = tier_of(stadium_id)
	var c: Dictionary = coords_of(tier)
	var field: Dictionary = c.get("field", {})

	var defense: Array = []
	for d in c.get("defense", []):
		defense.append({"pos": String(d.get("pos", "")), "point": _pt(d)})

	return {
		"stadium_id": stadium_id,
		"tier": tier,
		"image_path": image_path(stadium_id),
		"has_own_image": has_own_image(stadium_id),
		"viewbox": viewbox(),
		"home": _pt(field.get("home", {})),
		"first": _pt(field.get("first", {})),
		"second": _pt(field.get("second", {})),
		"third": _pt(field.get("third", {})),
		"mound": _pt(field.get("mound", {})),
		"defense": defense,
	}


## 홈 팀이 쓰는 구장. **홈 팀이 정본이다** — 원정 팀 구장에서 경기하지 않는다
static func for_home_team(world: Dictionary, home_team_id: String) -> Dictionary:
	return build(String(World.team_field(world, home_team_id, "stadium", "")))
