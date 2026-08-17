extends GdUnitTestSuite

## 복무 중 계급 — 02 `MilitaryStatusPanel.svelte:12-18`.
##
## ⚠ **문턱 넷은 02에 있다. 지어내지 않았다.**
##   이병 ≤ 8주 · 일병 ≤ 34 · 상병 ≤ 60 · 그 위 병장
##
## ⚠ **처음 조사에서 병역을 통째로 "없다"로 적었는데 틀렸다.** 04엔
## `StatusVm.military_of`가 이미 있고 진행 막대도 그린다 — **파일 이름으로
## 대응시킨 탓**이다. 항목으로 다시 세니 없는 건 계급 하나였다.


func _serving(weeks: int) -> Dictionary:
	return {
		"military_status": Military.STATUS_SERVING,
		"military_service_weeks": weeks,
		"military_unit": "sports",
		"military_enlist_year": 2033,
	}


func test_문턱_넷이_02_그대로다() -> void:
	assert_str(String(StatusVm.military_of(_serving(0))["rank"])).is_equal("이병")
	assert_str(String(StatusVm.military_of(_serving(8))["rank"])).is_equal("이병")
	assert_str(String(StatusVm.military_of(_serving(9))["rank"])).is_equal("일병")
	assert_str(String(StatusVm.military_of(_serving(34))["rank"])).is_equal("일병")
	assert_str(String(StatusVm.military_of(_serving(35))["rank"])).is_equal("상병")
	assert_str(String(StatusVm.military_of(_serving(60))["rank"])).is_equal("상병")
	assert_str(String(StatusVm.military_of(_serving(61))["rank"])).is_equal("병장")


## ⚠ **경계에서 갈려야 한다.** 8과 9가 같으면 문턱이 죽은 것이다
func test_경계에서_갈린다() -> void:
	for w in [8, 34, 60]:
		assert_str(String(StatusVm.military_of(_serving(w))["rank"])) \
			.override_failure_message("%d주와 %d주가 같은 계급이다" % [w, w + 1]) \
			.is_not_equal(String(StatusVm.military_of(_serving(w + 1))["rank"]))


## 복무를 마쳤으면 계급을 안 보여준다 — 전역자에게 "병장"은 지금 뜻이 아니다
func test_다녀왔으면_계급이_없다() -> void:
	var done: Dictionary = StatusVm.military_of({
		"military_status": Military.STATUS_DONE,
		"military_service_weeks": 70, "military_served_unit": "sports"})
	assert_str(String(done.get("rank", ""))).override_failure_message(
		"전역했는데 계급이 남아 있다").is_empty()


## 미필이면 병역 칸 자체가 없다 — 이 검사가 그 약속을 지킨다
func test_미필이면_빈_사전이다() -> void:
	assert_bool(StatusVm.military_of({}).is_empty()).is_true()


## 배선의 끝 — 화면이 계급을 그리나
func test_화면이_계급을_그린다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/status_screen.gd")
	assert_int(src.find("rank")).override_failure_message(
		"병역 카드가 계급을 안 그린다").is_greater(-1)
