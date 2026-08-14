extends RefCounted
class_name Slots

## 세이브 슬롯 — M7-6d.
##
## 원본: `features/save-slots/` · `slotdb.cjs`
##
## ⚠ **목록이 세이브를 통째로 읽으면 안 된다.** 슬롯마다 0.57MB를 풀면
## 목록 하나 여는 데 몇 초가 걸린다 — `SaveGame.read_header`만 부른다.
##
## ⚠ **깨진 슬롯이 목록을 죽이면 안 된다.** 한 슬롯이 상했다고 나머지를
## 못 보면 복구할 방법이 없다 — 02에서 소식 id가 겹쳤을 때 **세이브가 아예
## 안 열렸고 로드 화면에서 멈춘 채 단서가 없었다.**


## 슬롯 수. **고정이다** — 늘고 줄면 사용자가 "3번이 어디 갔지"를 겪는다
const COUNT: int = 3

const DIR := "user://saves"


static func path_of(slot: int) -> String:
	return "%s/slot%d.sav" % [DIR, slot]


static func _valid(slot: int) -> bool:
	return slot >= 1 and slot <= COUNT


## 슬롯 목록. **머리말만 읽는다**
static func list() -> Array:
	var out: Array = []
	for i in range(1, COUNT + 1):
		out.append(_row(i))
	return out


static func _row(slot: int) -> Dictionary:
	var path: String = path_of(slot)
	if not FileAccess.file_exists(path):
		return {"slot": slot, "empty": true, "broken": false,
			"label": "비어 있음", "player_name": "", "team_name": "", "day": 0}

	var h: Dictionary = SaveGame.read_header(path)
	if not String(h.get("error", "")).is_empty():
		# ⚠ **비어 있음으로 뭉개지 않는다.** 그러면 사용자가 세이브가
		# 사라진 줄 알고 그 위에 새로 덮어쓴다
		return {"slot": slot, "empty": false, "broken": true,
			"label": "읽을 수 없음 (%s)" % h["error"],
			"player_name": "", "team_name": "", "day": 0}

	var year: int = int(h.get("season_year", 0))
	var day: int = int(h.get("day", 1))
	var d: Dictionary = Calendar.date_of(year, maxi(day, 1))
	return {
		"slot": slot, "empty": false, "broken": false,
		"label": "%d년 %d월 %d일 · %s · %s" % [d["year"], d["month"], d["day"],
			h.get("player_name", ""), h.get("team_name", "")],
		"player_name": h.get("player_name", ""),
		"team_name": h.get("team_name", ""),
		"day": day,
	}


static func save(slot: int, state: Dictionary) -> Error:
	if not _valid(slot):
		return ERR_INVALID_PARAMETER
	DirAccess.make_dir_recursive_absolute(DIR)
	return SaveGame.write(path_of(slot), state)


static func load_slot(slot: int) -> Dictionary:
	if not _valid(slot):
		return {"error": "슬롯 번호가 범위 밖이다: %d" % slot, "state": {}}
	return SaveGame.read(path_of(slot))


## 범위를 따로 안 본다 — 범위 밖 슬롯의 파일은 애초에 없으므로
## 아래 존재 검사가 이미 막는다
static func delete(slot: int) -> void:
	var path: String = path_of(slot)
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


## 검사용 — 전부 지운다
static func clear_all() -> void:
	for i in range(1, COUNT + 1):
		delete(i)
