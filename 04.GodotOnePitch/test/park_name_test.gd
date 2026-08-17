extends GdUnitTestSuite

## 구장 이름 — F-4c.
##
## 원본: `refs.json`의 `stadiums` (id · name · parkFactor). 02는
## `TeamDetailModal.svelte:41-42`에서 그 표를 찾아 이름을 쓰고 없으면 id를 쓴다.
##
## ⚠ **국내 182팀의 구장이 전부 `STADIUM_SEOUL_ROYALS` 꼴로 화면에 샜다.**
## 이름 표를 안 옮겨서다 — 02 refs.json에 27개가 다 있었다.
##
## ⚠ **실측이 갈래를 정했다.** 238팀 중 182팀이 표에 있는 27개 중 하나이고
## 56팀이 한글 이름(해외)이다. **표에 없는 id꼴은 0팀**이라 02의
## `id.replace(/^STADIUM_/, "")` 갈래는 04에선 죽은 코드다 — 넣지 않았다.

const TEAMS_PATH: String = "res://data/teams.json"


func test_표에_있는_구장은_사람이_읽는_이름이다() -> void:
	# 값을 못 박는다 — 상수에서 끌어오면 표가 비어도 통과한다
	assert_str(ParkVm.name_of("STADIUM_SEOUL_ROYALS")).is_equal("로열파크")
	assert_str(ParkVm.name_of("STADIUM_SEOUL_COBRAS")).is_equal("코브라돔")
	assert_str(ParkVm.name_of("STADIUM_BUSAN_WAVES")).is_equal("웨이브스타디움")
	assert_str(ParkVm.name_of("STADIUM_HALLA")).is_equal("한라구장")
	assert_str(ParkVm.name_of("STADIUM_GEUMGANG_UNIV")).is_equal("금강구장")


func test_표가_27개_전부를_덮는다() -> void:
	var names: Dictionary = ParkVm.data().get("names", {})
	assert_int(names.size()).is_equal(27)
	# 좌표 표(tier_of)와 같은 27개여야 한다 — 한쪽만 늘면 이름이 빈다
	for id in ParkVm.data().get("tier_of", {}).keys():
		assert_bool(names.has(id)).override_failure_message(
			"좌표는 있는데 이름이 없다: %s" % id).is_true()


func test_해외_구장은_한글_이름이_그대로_나온다() -> void:
	# 표에 없다. 원문이 곧 사람이 읽는 이름이므로 지우면 안 된다
	assert_str(ParkVm.name_of("엠파이어 스타디움")).is_equal("엠파이어 스타디움")
	assert_str(ParkVm.name_of("하버 볼파크")).is_equal("하버 볼파크")


func test_구장이_없으면_빈_문자열() -> void:
	assert_str(ParkVm.name_of("")).is_equal("")


## 진짜 세계로 본다 — 가짜 표는 결함을 가린다
func test_238팀_전부_id꼴이_화면에_안_샌다() -> void:
	var f := FileAccess.open(TEAMS_PATH, FileAccess.READ)
	assert_object(f).is_not_null()
	var teams: Array = JSON.parse_string(f.get_as_text()).get("teams", [])
	assert_int(teams.size()).is_equal(238)

	var leaked: Array = []
	var named: int = 0
	for t in teams:
		var raw: String = String(t.get("stadium", ""))
		if raw.is_empty():
			continue
		var shown: String = ParkVm.name_of(raw)
		if _is_id_shaped(shown):
			leaked.append(raw)
		else:
			named += 1
	assert_array(leaked).override_failure_message(
		"id 꼴이 화면에 샌다: %s" % str(leaked.slice(0, 5))).is_empty()
	assert_int(named).is_equal(238)


## ASCII 대문자·숫자·밑줄만이면 id다. **`to_upper()`로 재면 안 된다** —
## 한글은 대문자가 자기 자신이라 "엠파이어 스타디움"까지 id로 잡힌다
func _is_id_shaped(s: String) -> bool:
	if s.is_empty():
		return false
	for i in s.length():
		var c: int = s.unicode_at(i)
		if not ((c >= 65 and c <= 90) or (c >= 48 and c <= 57) or c == 95):
			return false
	return true


func test_팀_상세가_구장_이름을_보여준다() -> void:
	var state: Dictionary = {
		"world": {"teams": [], "npcs": {}},
		"protagonist": {"id": "P", "team_id": "OTHER"},
	}
	var vm: Dictionary = TeamDetailVm.build(state, "TEAM_KBL_SEOUL_ROYALS_1")
	assert_str(String(vm.get("stadium", ""))).is_equal("로열파크")
