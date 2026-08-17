extends GdUnitTestSuite

## 관전 중 안내 — M-4.
##
## 원본: `MatchPage.svelte:1776-1783`(패널) · `:559-560`(모드 라벨) ·
## `:1452`(머리 칩)
##
## ⚠ **내가 안 던질 때 화면이 아무 말도 안 했다.** 04는 `is_my_pitch`로
## 선택 화면을 접기만 하고 **대신 뜨는 말이 없다** — 빈 자리만 남는다.
##
## ⚠ **02가 그 자리에 근거를 적어 뒀다**: "비활성화가 아니라 **접는 것**이다 —
## 눌리지 않는 버튼 10개가 그대로 떠 있으면 '내가 뭘 해야 하는데 안 되는
## 건가'로 읽힌다." 04는 접기까진 했는데 **접고 나서 설명을 안 했다.**

const ME: String = "P_ME"


func _state(extra: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"inning": 3, "half": "bottom", "outs": 1,
		"score": {"home": 2, "away": 1},
		"count": {"balls": 1, "strikes": 2},
		"runners": {}, "batter": {"id": "B1"},
		"pitcher": {"id": "OTHER"},
		"home_queue": {"current": 1, "lines": [
			{"player_id": ME, "outs": 6, "pc": 84, "k": 5, "bb": 1, "h": 4, "er": 1},
			{"player_id": "RELIEF", "outs": 1, "pc": 12},
		]},
	}
	s.merge(extra, true)
	return s


func _vm(extra: Dictionary = {}) -> Dictionary:
	return MatchVm.build(_state(extra), {"my_side": "home", "my_id": ME})


## 내가 던지는 중 — 02 `onMound`
func _on_mound() -> Dictionary:
	return _vm({"pitcher": {"id": ME}})


func test_던지는_중이면_등판_중이다() -> void:
	var vm: Dictionary = _on_mound()
	assert_bool(bool(vm["is_my_pitch"])).is_true()
	assert_str(String(vm["mode_label"])).is_equal("등판 중")
	assert_bool(bool(vm["is_watching"])).is_false()


func test_안_던지면_관전이다() -> void:
	var vm: Dictionary = _vm()
	assert_bool(bool(vm["is_my_pitch"])).is_false()
	assert_str(String(vm["mode_label"])).is_equal("관전")
	assert_bool(bool(vm["is_watching"])).is_true()


## 02 `:1779` — 던진 적이 있으면 "교체돼 벤치에 있다"
func test_던진_뒤_교체됐으면_그렇게_말한다() -> void:
	assert_str(String(_vm()["watch_note"])).is_equal("교체돼 벤치에 있다.")


## ⚠ **아직 안 던진 것과 교체된 것은 다르다.** 하나로 뭉치면 "왜 내가
## 안 나오지"와 "이미 내 몫은 끝났다"가 구분이 안 된다
func test_아직_안_던졌으면_그렇게_말한다() -> void:
	var vm: Dictionary = _vm({"home_queue": {"current": 0, "lines": [
		{"player_id": "STARTER", "outs": 3, "pc": 40}]}})
	assert_str(String(vm["watch_note"])).is_equal("아직 등판하지 않았다.")


## ⚠ **줄은 있는데 한 구도 안 던진 경우가 있다.** 로스터에 이름만 올라간
## 상태다 — 그걸 "교체됐다"로 읽으면 안 나온 투수가 이미 던진 것이 된다
func test_줄만_있고_안_던졌으면_아직이다() -> void:
	var vm: Dictionary = _vm({"home_queue": {"current": 0, "lines": [
		{"player_id": ME, "outs": 0, "pc": 0}]}})
	assert_str(String(vm["watch_note"])).override_failure_message(
		"한 구도 안 던졌는데 교체됐다고 한다").is_equal("아직 등판하지 않았다.")


## 02 `:1781` — 이닝과 점수를 같이 준다. 관전 중에도 상황은 알아야 한다
func test_관전_중에도_이닝과_점수를_보여준다() -> void:
	var sub: String = String(_vm()["watch_sub"])
	assert_str(sub).contains("3회말")
	assert_str(sub).contains("2")
	assert_str(sub).contains("1")


## ⚠ **경기가 끝나면 던질 수 없다** — 02도 `onMound`가 거짓이 된다.
##
## ⚠ **내가 마운드에 선 채로 끝난 상태로 재야 한다.** 남이 던지는 중에
## 끝내면 "끝났으니까"가 아니라 "내가 아니니까" 관전이라 **`finished` 항을
## 빼도 결과가 같다** — 변이가 그걸 잡았다
func test_끝난_경기는_내가_마운드에_있어도_관전이다() -> void:
	var vm: Dictionary = _vm({"pitcher": {"id": ME}, "is_finished": true})
	assert_bool(bool(vm["is_watching"])).override_failure_message(
		"경기가 끝났는데 등판 중이라고 한다").is_true()
	assert_str(String(vm["mode_label"])).is_equal("관전")
	assert_bool(bool(vm["is_my_pitch"])).is_false()


## 배선의 끝 — 화면이 실제로 띄우나
func test_화면이_관전_안내를_띄운다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/match_screen.gd")
	assert_int(src.find("watch_note")).override_failure_message(
		"관전 중인데 화면이 아무 말도 안 한다").is_greater(-1)
