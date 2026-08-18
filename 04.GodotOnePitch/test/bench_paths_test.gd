extends GdUnitTestSuite

## 계측이 게임 경로를 타나 — P-5c · P-16b.
##
## 🔴 **이 저장소에서 제일 자주 밟은 함정이다(열두 번).** 계측이 게임이 쓰는
## 함수를 안 부르고 제 손으로 다시 짓거나 한 단계를 건너뛰면, 재는 것이
## **게임이 아니라 계측 자신**이 된다. 그리고 그 숫자로 게임을 판정한다.
##
## 실제로 두 번 크게 걸렸다:
##   · FA — 계측이 `run_market`의 시장 조립을 복제했다. 게임 쪽 분모를
##     고쳤는데 계측이 안 따라와 "고쳤는데 그대로"로 읽혔다
##   · 관계 — 계측이 `AutoTraining.apply`를 안 불렀다. 첫 주 계획이 그대로
##     굳어 피로가 95를 넘어도 고강도를 밀었고, **6해 중 79%가 부상**이었다.
##     그 상태의 OVR 하락을 "성장이 막혔다"로 읽어 P-16을 잘못 세웠다.
##     걸고 나니 부상 17% · OVR 해마다 +1.0
##
## ⚠ **소스 문자열로 본다.** 계측은 십 분 넘게 도는 것이 있어 검사에서 못
## 돌린다. 문자열이라 우회할 수 있지만, **여기서 막고 싶은 건 우회가 아니라
## 무심코 지나침**이다 — 지금까지 열두 번 다 그랬다


## 🔴 **주석을 걷어내고 본다.** 처음엔 통째로 읽었는데, 이 파일들은 그
## 함수를 **주석에서도 이름으로 부른다** — 변이로 호출을 지웠더니 주석이
## 남아 검사가 그대로 통과했다. **검사가 코드가 아니라 설명을 읽고 있었다**
func _code(path: String) -> String:
	var f: FileAccess = FileAccess.open(path, FileAccess.READ)
	assert_object(f).override_failure_message("%s를 못 연다" % path).is_not_null()
	var out: String = ""
	for line in f.get_as_text().split("
"):
		if line.strip_edges().begins_with("#"):
			continue
		out += line + "
"
	return out


## 🔴 **관계 계측이 매주 훈련 계획을 갱신한다** — `auto_advance.gd:205`와 같다
func test_관계_계측이_훈련_계획을_갱신한다() -> void:
	assert_str(_code("res://bench/relations_measure.gd")) \
		.override_failure_message(
			"관계 계측이 AutoTraining.apply를 안 부른다 — 첫 주 계획이 굳어서" +
			" 피로가 95를 넘어도 고강도를 민다. 6해 중 79%가 부상이었다") \
		.contains("AutoTraining.apply")


## 🔴 **FA 계측은 시장을 다시 돌리지 않는다** (P-5b).
##
## 예전엔 조립만 게임 함수를 쓰고 `FaMarket.resolve`는 계측이 직접 불렀다.
## 그런데 warmup을 다 돌린 뒤에 부르니 **게임이 이미 계약을 마쳐 자격자가
## 0이었고, "계약 0명"이 나왔다** — 끝난 시장을 재고 있었다.
##
## 지금은 `SeasonRunner.run`이 낸 값을 그대로 읽는다. **게임이 한 것을
## 읽으므로 갈릴 수가 없다** — 조립을 같이 쓰는 것보다 강한 약속이다
func test_fa_계측이_게임이_낸_값을_읽는다() -> void:
	var src: String = _code("res://bench/fa_measure.gd")
	assert_str(src).override_failure_message(
		"FA 계측이 시장을 제 손으로 돌린다 — warmup 뒤엔 자격자가 0이라" +
		" \"계약 0명\"이 나온다") 		.not_contains("FaMarket.resolve")
	assert_str(src).override_failure_message(
		"FA 계측이 게임의 시즌 종료를 안 탄다").contains("SeasonRunner.run")
	for k in ["fa_signed", "fa_grades", "fa_transfers"]:
		assert_str(src).override_failure_message(
			"계측이 %s를 안 읽는다 — 게임이 낸 값을 버리고 다시 센다" % k) 			.contains(k)


## ⚠ **게임이 그 값을 실제로 담아야 한다.** 계측만 읽고 게임이 안 담으면
## 조용히 0이 된다 — `summary`가 안에 있는 걸 몰라 실제로 0이 나왔다
func test_시즌_종료가_fa_결과를_담는다() -> void:
	var src: String = _code("res://sim/season_runner.gd")
	for k in ["fa_grades", "fa_transfers", "fa_compensations"]:
		assert_str(src).override_failure_message(
			"시즌 종료가 %s를 안 담는다" % k).contains(k)


## ⚠ **게임 쪽에도 그 함수가 있어야 한다.** 계측만 부르고 `run_market`이
## 제 손으로 지으면 한 곳으로 모은 뜻이 사라진다
func test_게임도_같은_함수를_쓴다() -> void:
	var src: String = _code("res://sim/fa_runner.gd")
	for fn in ["market_players_of(", "market_teams_of("]:
		# 정의 한 번 + `run_league`가 부르는 것 한 번 = 최소 두 번
		assert_int(src.count(fn)).override_failure_message(
			"fa_runner.gd에 %s가 %d번뿐이다 — run_market이 안 부른다"
			% [fn, src.count(fn)]).is_greater_equal(2)


## ⚠ **계측이 하루 진행을 직접 짜지 않는다.** `DayEngine.advance_*`를 거쳐야
## 등판 정지·주 경계가 게임과 같다 — 예전에 `MatchDay.play_day`를 직접 불러
## 시즌 성적이 안 쌓인 적이 있다
func test_관계_계측이_하루_진행_엔진을_거친다() -> void:
	var src: String = _code("res://bench/relations_measure.gd")
	assert_str(src).override_failure_message(
		"관계 계측이 DayEngine을 안 거친다").contains("DayEngine.advance_")
	assert_str(src).override_failure_message(
		"관계 계측이 주간 처리를 직접 짰다 — WeekRunner.run이 정본이다") \
		.contains("WeekRunner.run")
