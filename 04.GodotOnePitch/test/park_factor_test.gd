extends GdUnitTestSuite

## 구장 성향(파크팩터) — F-4d.
##
## 원본: `refs.json`의 `stadiums[].parkFactor` · `NewGamePage.svelte:644`
##
## ⚠ **02도 엔진엔 안 먹인다.** 세어 보니 `parkFactor`는 두 곳에만 있다 —
## 타입 정의(`master.ts:82`)와 새 게임 화면 표시(`NewGamePage:644`).
## **Rust 엔진에는 0건**이다.
##
## ⚠ **엔진의 `park`는 다른 축이고 그쪽도 죽어 있다.** `match_engine.rs:373`이
## `opts.park`를 받아 `:680`에서 `park_quality_modifier`를 거는데, 그 값을
## 넘기는 `MatchPage:763`의 `matchPark`는 **`"neutral"`로 초기화되고
## snapshot에서만 갱신된다**(`:655`·`:865`) — 즉 **늘 중립이다.**
## 문자열 `parkFactor`를 `ParkType`으로 바꾸는 코드도 없다.
##
## **그래서 표시용으로만 옮겼다.** 엔진에 먹이는 건 02가 안 하는 일이라
## 그건 이주가 아니라 새 밸런스다.

const KINDS: Array[String] = ["타자친화", "투수친화", "중립"]


func test_27개_구장_전부_성향이_있다() -> void:
	var f: Dictionary = ParkVm.data().get("factors", {})
	assert_int(f.size()).is_equal(27)
	# 좌표 표(tier_of)와 같은 27개여야 한다 — 한쪽만 늘면 성향이 빈다
	for id in ParkVm.data().get("tier_of", {}).keys():
		assert_bool(f.has(id)).override_failure_message(
			"좌표는 있는데 성향이 없다: %s" % id).is_true()


## 02 값 그대로. **값을 못 박는다** — 표에서 끌어오면 아무것도 안 본다
func test_02_값_그대로다() -> void:
	assert_str(ParkVm.factor_of("STADIUM_BUSAN_WAVES")).is_equal("타자친화")
	assert_str(ParkVm.factor_of("STADIUM_CHANGWON_STARS")).is_equal("투수친화")
	assert_str(ParkVm.factor_of("STADIUM_SEOUL_ROYALS")).is_equal("중립")
	assert_str(ParkVm.factor_of("STADIUM_HALLA")).is_equal("투수친화")


## 02 실측 분포 — 타자친화 10 · 중립 9 · 투수친화 8
func test_분포가_02와_같다() -> void:
	var count: Dictionary = {}
	for id in ParkVm.data().get("factors", {}):
		var k: String = ParkVm.factor_of(String(id))
		count[k] = int(count.get(k, 0)) + 1
	assert_int(int(count.get("타자친화", 0))).is_equal(10)
	assert_int(int(count.get("중립", 0))).is_equal(9)
	assert_int(int(count.get("투수친화", 0))).is_equal(8)


## ⚠ **세 종류뿐이다.** 다른 말이 섞이면 화면이 모르는 값을 띄운다
func test_세_종류만_쓴다() -> void:
	for id in ParkVm.data().get("factors", {}):
		assert_array(KINDS).override_failure_message(
			"모르는 성향: %s" % ParkVm.factor_of(String(id))) \
			.contains([ParkVm.factor_of(String(id))])


## 해외 구장은 표에 없다 — **빈 문자열이고 화면이 줄을 안 만든다**
func test_표에_없으면_빈_문자열이다() -> void:
	assert_str(ParkVm.factor_of("엠파이어 스타디움")).is_equal("")
	assert_str(ParkVm.factor_of("")).is_equal("")


## ⚠ **엔진에 안 먹인다.** 02가 안 하는 일이고, 하면 밸런스가 바뀐다 —
## 그건 이주가 아니다. 검사가 그 선을 지킨다
func test_경기_엔진이_성향을_안_읽는다() -> void:
	for path in ["res://sim/pitch_outcome.gd", "res://sim/pitch_step.gd",
			"res://sim/match_day.gd", "res://sim/batted_ball.gd"]:
		var src := FileAccess.get_file_as_string(path)
		assert_int(src.find("factor_of")).override_failure_message(
			"%s가 파크팩터를 읽는다 — 02는 안 먹인다" % path).is_equal(-1)


## 배선의 끝 — 팀 상세가 구장 옆에 성향을 보여주나
func test_팀_상세가_성향을_보여준다() -> void:
	var state: Dictionary = {
		"world": {"teams": [], "npcs": {}},
		"protagonist": {"id": "P", "team_id": "OTHER"},
	}
	var vm: Dictionary = TeamDetailVm.build(state, "TEAM_KBL_SEOUL_ROYALS_1")
	assert_str(String(vm.get("park_factor", ""))).is_equal("중립")
