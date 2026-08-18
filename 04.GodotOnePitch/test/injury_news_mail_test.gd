extends GdUnitTestSuite

## 월간 부상 리포트가 소식함에 닿나 — 🔴 **안 닿고 있었다.**
##
## `InjuryRunner.build_news`가 줄·집계·미리보기까지 다 만들어서
## `state["injury_log"]`에 넣는데 **`injury_log`를 읽는 코드가 하나도 없다**
## (쓰는 자리 하나뿐, 검사 빼고). 바로 아래 세 줄에서 `BodyReport`는
## `mailbox`로 가는데 부상 리포트만 빠졌다.
##
## ⚠ **이번 루프에서 같은 모양을 두 번째 만났다** — 소식 본문도 열여섯
## 자리가 쓰기만 하고 읽는 쪽이 없었다. **쓰는 쪽을 만들면 읽는 쪽이
## 있는지 센다.**
##
## 02는 이걸 소식으로 보내고 `InjuryPanel`로 편다
## (`NewsPage.svelte:253` · `InjuryPanel.svelte:19-23`).


func _hurt(id: String, weeks: int) -> Dictionary:
	return {"player_id": id, "name": "선수%s" % id, "weeks": weeks,
		"severity": "중증" if weeks >= 8 else "경미", "team_id": "TEAM_A"}


func _state(events: Array) -> Dictionary:
	return {
		"day": Calendar.DAYS_PER_SEASON / 2, "season_year": 2027,
		"season_days": Calendar.DAYS_PER_SEASON,
		"protagonist": {"id": "ME", "injury": null, "team_id": "TEAM_A"},
		"mailbox": [], InjuryRunner.NEWS_KEY: events,
	}


# ── 소식이 되나 ───────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 만들기만 하고 아무도 안 읽으면 없는 것과 같다
func test_리포트가_소식이_된다() -> void:
	var s: Dictionary = _state([_hurt("N1", 10), _hurt("N2", 2)])
	var m: Dictionary = InjuryRunner.news_message(s, 100)
	assert_bool(m.is_empty()).override_failure_message(
		"부상 리포트가 소식으로 안 나온다").is_false()
	assert_str(String(m.get("category", ""))).is_equal("injury")


## 담을 게 없으면 안 보낸다 — **빈 소식을 매달 보내지 않는다**
func test_담을_게_없으면_안_보낸다() -> void:
	assert_bool(InjuryRunner.news_message(_state([]), 100).is_empty()).is_true()


## 본문에 **사람이 줄로** 있어야 한다. 집계만 있으면 누가 다쳤는지 모른다
func test_본문에_사람이_줄로_있다() -> void:
	var s: Dictionary = _state([_hurt("N1", 10), _hurt("N2", 2)])
	var body: String = String(InjuryRunner.news_message(s, 100).get("body", ""))
	assert_int(body.find("선수N1")).override_failure_message(
		"다친 사람 이름이 본문에 없다 — 집계만으론 누군지 모른다").is_greater(-1)
	assert_int(body.find("선수N2")).is_greater(-1)


## ⚠ **긴 부상이 위다.** 급한 것부터 안 보이면 목록을 훑는 뜻이 없다
func test_긴_부상이_위에_온다() -> void:
	var s: Dictionary = _state([_hurt("짧다", 2), _hurt("길다", 12)])
	var lines: PackedStringArray = String(
		InjuryRunner.news_message(s, 100).get("body", "")).split("\n")
	var first: int = -1
	var second: int = -1
	for i in lines.size():
		if lines[i].contains("선수길다"):
			first = i
		if lines[i].contains("선수짧다"):
			second = i
	assert_int(first).override_failure_message("12주 부상이 본문에 없다") \
		.is_greater(-1)
	assert_int(first).override_failure_message(
		"2주 부상이 12주보다 위에 있다 — 급한 것부터 안 보인다").is_less(second)


## 미리보기는 집계 한 줄 — 02도 목록에서 그렇게 읽힌다
func test_미리보기가_집계다() -> void:
	var s: Dictionary = _state([_hurt("N1", 10)])
	var m: Dictionary = InjuryRunner.news_message(s, 100)
	assert_str(String(m.get("preview", ""))).override_failure_message(
		"미리보기가 비었다").is_not_empty()


## ⚠ **id가 겹치면 소식함에서 하나가 조용히 사라진다**(`news_vm`이 센다).
## 달마다 다른 id여야 한다
func test_달마다_id가_다르다() -> void:
	var a: String = String(InjuryRunner.news_message(
		_state([_hurt("N1", 10)]), 100).get("id", ""))
	var b: String = String(InjuryRunner.news_message(
		_state([_hurt("N1", 10)]), 200).get("id", ""))
	assert_str(a).override_failure_message(
		"두 달의 부상 소식 id가 %s로 같다 — 하나가 사라진다" % a).is_not_equal(b)


# ── 배선 ──────────────────────────────────────────────────────────

## 🔴 **`run`이 실제로 소식함에 넣나.** 함수만 만들고 안 부르면 그대로다
func test_run이_소식함에_넣는다() -> void:
	var s: Dictionary = _state([_hurt("N1", 10)])
	var day: int = -1
	for d in range(1, Calendar.DAYS_PER_SEASON):
		if Injury.is_news_week(Calendar.week_of(d)):
			day = d
			break
	assert_int(day).override_failure_message("소식 주가 한 해에 없다") \
		.is_greater(0)

	s["day"] = day
	InjuryRunner.run(s, day)
	var found: bool = false
	for m in s.get("mailbox", []):
		if String(m.get("category", "")) == "injury" \
				and String(m.get("sender", "")) == "의무팀":
			found = true
	assert_bool(found).override_failure_message(
		"소식 주를 굴렸는데 부상 리포트가 소식함에 없다 — 만들고 버린다") \
		.is_true()


## 소식 주가 아니면 안 넣는다 — 매주 오면 02가 고친 그 결함으로 돌아간다
func test_소식_주가_아니면_안_넣는다() -> void:
	var s: Dictionary = _state([_hurt("N1", 10)])
	var day: int = -1
	for d in range(1, Calendar.DAYS_PER_SEASON):
		if not Injury.is_news_week(Calendar.week_of(d)):
			day = d
			break
	s["day"] = day
	InjuryRunner.run(s, day)
	for m in s.get("mailbox", []):
		assert_str(String(m.get("sender", ""))).override_failure_message(
			"소식 주가 아닌데 부상 리포트가 왔다").is_not_equal("의무팀")


## ⚠ **쌓아 두는 자리(`injury_log`)를 아무도 안 읽으면 죽은 자리다.**
## 지금은 소식함이 읽는 쪽이다 — 둘 다 있어야 지난 달치를 되짚을 수 있다
func test_기록도_같이_쌓인다() -> void:
	var s: Dictionary = _state([_hurt("N1", 10)])
	for d in range(1, Calendar.DAYS_PER_SEASON):
		if Injury.is_news_week(Calendar.week_of(d)):
			s["day"] = d
			InjuryRunner.run(s, d)
			break
	assert_int(int(s.get("injury_log", []).size())).override_failure_message(
		"기록이 안 쌓인다").is_greater(0)
