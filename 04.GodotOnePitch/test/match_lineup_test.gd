extends GdUnitTestSuite

## 경기 화면의 양 팀 타순 — M-2.
##
## 원본: `MatchPage.svelte:1515-1573`(패널) · `:123-124`(제목) ·
## `:144-145`(현재 타자 인덱스)
##
## ⚠ **투구 중에는 다음 타자를 알 방법이 없었다.** 브리핑(F-5)이 상대 타선
## 아홉을 보여주지만 **첫 공 전에만 뜨고 사라진다.** 데이터는
## `game_loop.gd:20-26`이 `away_lineup`/`home_lineup` + `away_index`/
## `home_index`로 이미 들고 있었다.
##
## ⚠ **공격 중인 팀만 현재 타자를 표시한다** — 02 `:144-145`가
## `half === "top" ? … : -1`이다. 수비 중인 팀에 "지금 타석"을 찍으면
## 이닝이 바뀐 걸 못 알아챈다.


func _state(extra: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"inning": 3, "half": "top", "outs": 1,
		"score": {"home": 2, "away": 1},
		"count": {"balls": 1, "strikes": 2},
		"runners": {}, "pitcher": {"id": "P1"},
		"away_lineup": [{"id": "A1"}, {"id": "A2"}, {"id": "A3"}],
		"home_lineup": [{"id": "H1"}, {"id": "H2"}],
		"away_index": 1,
		"home_index": 0,
	}
	s.merge(extra, true)
	return s


func _names() -> Dictionary:
	return {"A1": "김하나", "A2": "이둘", "A3": "박셋",
		"H1": "최홈", "H2": "정홈"}


func _vm(extra: Dictionary = {}) -> Dictionary:
	return MatchVm.build(_state(extra),
		{"my_side": "home", "my_id": "P1", "names": _names()})


func test_양_팀_타순이_사전에_실린다() -> void:
	var vm: Dictionary = _vm()
	assert_int((vm["away_lineup"] as Array).size()).is_equal(3)
	assert_int((vm["home_lineup"] as Array).size()).is_equal(2)


## ⚠ **이름을 화면이 찾지 않는다.** id만 주면 화면이 로스터를 뒤져야 하고,
## 그게 02에서 화면이 계산을 갖게 된 경로다
func test_이름표가_붙어_나온다() -> void:
	var rows: Array = _vm()["away_lineup"]
	assert_str(String(rows[0]["name"])).is_equal("김하나")
	assert_str(String(rows[2]["name"])).is_equal("박셋")


func test_타순_번호가_1부터다() -> void:
	var rows: Array = _vm()["away_lineup"]
	assert_int(int(rows[0]["no"])).is_equal(1)
	assert_int(int(rows[2]["no"])).is_equal(3)


## 02 `:144` — 초에는 원정이 공격이다
func test_초에는_원정만_타석_표시가_있다() -> void:
	var vm: Dictionary = _vm({"half": "top", "away_index": 1})
	var away: Array = vm["away_lineup"]
	var home: Array = vm["home_lineup"]
	assert_bool(bool(away[1]["is_at_bat"])).is_true()
	assert_bool(bool(away[0]["is_at_bat"])).is_false()
	# ⚠ **다음 타자도 마찬가지다.** `is_at_bat`만 보면 "수비 중인데 다음
	# 타자가 표시된다"를 놓친다 — 변이가 그걸 잡았다
	for r in home:
		assert_bool(bool(r["is_at_bat"])).override_failure_message(
			"수비 중인 팀에 타석 표시가 있다").is_false()
		assert_bool(bool(r["is_on_deck"])).override_failure_message(
			"수비 중인 팀에 다음 타자 표시가 있다").is_false()


func test_말에는_홈만_타석_표시가_있다() -> void:
	var vm: Dictionary = _vm({"half": "bottom", "home_index": 1})
	var home: Array = vm["home_lineup"]
	assert_bool(bool(home[1]["is_at_bat"])).is_true()
	for r in vm["away_lineup"]:
		assert_bool(bool(r["is_at_bat"])).is_false()
		assert_bool(bool(r["is_on_deck"])).is_false()


## 02 `:1517` — `on-deck`은 다음 타자다. **한 바퀴 돌면 처음으로 간다**
func test_다음_타자가_표시된다() -> void:
	var vm: Dictionary = _vm({"half": "top", "away_index": 1})
	var rows: Array = vm["away_lineup"]
	assert_bool(bool(rows[2]["is_on_deck"])).is_true()
	assert_bool(bool(rows[0]["is_on_deck"])).is_false()


func test_마지막_타자_다음은_첫_타자다() -> void:
	var vm: Dictionary = _vm({"half": "top", "away_index": 2})
	var rows: Array = vm["away_lineup"]
	assert_bool(bool(rows[2]["is_at_bat"])).is_true()
	assert_bool(bool(rows[0]["is_on_deck"])).override_failure_message(
		"아홉 번 타자 다음이 첫 타자가 아니다").is_true()


## ⚠ **인덱스가 타순 길이를 넘는다** — 한 바퀴를 돌면 3, 4, 5…가 된다.
## `%`를 안 하면 그 순간 아무도 타석에 없다
func test_인덱스가_한_바퀴를_넘어도_돈다() -> void:
	var vm: Dictionary = _vm({"half": "top", "away_index": 4})
	var rows: Array = vm["away_lineup"]
	assert_bool(bool(rows[1]["is_at_bat"])).override_failure_message(
		"인덱스 4가 세 명짜리 타순에서 두 번째로 안 돌아온다").is_true()


func test_타순이_비어도_안_죽는다() -> void:
	var vm: Dictionary = _vm({"away_lineup": [], "home_lineup": []})
	assert_array(vm["away_lineup"]).is_empty()
	assert_array(vm["home_lineup"]).is_empty()


## 02 `:123-124` 그대로
func test_제목이_02와_같다() -> void:
	var vm: Dictionary = _vm()
	assert_str(String(vm["away_lineup_title"])).is_equal("원정 라인업")
	assert_str(String(vm["home_lineup_title"])).is_equal("홈 라인업")


## 배선의 끝 — 화면이 실제로 그리나
func test_화면이_타순을_그린다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/match_screen.gd")
	assert_int(src.find("away_lineup")).override_failure_message(
		"경기 화면이 타순을 안 그린다").is_greater(-1)
