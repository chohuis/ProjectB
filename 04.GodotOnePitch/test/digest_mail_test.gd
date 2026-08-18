extends GdUnitTestSuite

## 야구계 소식(다이제스트)이 소식함에 닿나 — 🔴 **아무도 안 불렀다.**
##
## `sim/digest.gd`는 **362줄**이고 검사도 있는데, `Digest.build`를 부르는
## 곳이 **자기 검사 하나뿐**이었다. 게임을 아무리 굴려도 플레이어에게
## 한 번도 안 왔다.
##
## ⚠ **이번 루프에서 같은 모양을 세 번째 만났다:**
##  ① 소식 본문 — `sim/` 열여섯 자리가 쓰는데 화면이 안 그렸다
##  ② 월간 부상 리포트 — `injury_log`에 쌓기만 하고 아무도 안 읽었다
##  ③ 다이제스트 — 조립기를 아무도 안 불렀다
##
## **쓰는 쪽을 만들면 읽는 쪽이 있는지 센다.**


## ⚠ **04는 순위표를 상태에 안 들고 일정에서 파생한다**
## (`achievements.gd:91` · `Standings.from_schedule`). 그래서 픽스처도
## **치른 경기**를 만들어야 한다 — 처음엔 `standings`를 직접 넣었다가
## 빈 순위표를 받았다
## ⚠ **점수만 넣으면 전부 무승부로 잡힌다.** `Standings.from_schedule`은
## `winner_id`/`loser_id`로 센다 — 점수는 득실에만 쓴다. 처음에 점수만
## 넣었다가 승률이 전부 `.000`으로 나왔다
func _game(day: int, league: String, home: String, away: String,
		home_wins: bool) -> Dictionary:
	return {"id": "%s-%d-%s" % [league, day, home], "day": day,
		"league_id": league, "home": home, "away": away,
		"is_tournament": false,
		"result": {
			"home_score": 5 if home_wins else 2,
			"away_score": 2 if home_wins else 5,
			"winner_id": home if home_wins else away,
			"loser_id": away if home_wins else home}}


func _state(week: int) -> Dictionary:
	var day: int = (week - 1) * Calendar.DAYS_PER_WEEK + 1
	var schedule: Array = []
	for i in 12:
		# 고교 — 내 팀(TEAM_HS_AEWOL)이 9승 3패
		schedule.append(_game(i + 1, "LEAGUE_HIGHSCHOOL", "TEAM_HS_AEWOL", "TEAM_HS_HALLA",
			i % 4 != 0))
		# 프로 — 내가 안 뛰는 무대. KBL_1이 8승 4패
		schedule.append(_game(i + 1, "LEAGUE_KBL", "TEAM_KBL_1", "TEAM_KBL_2",
			i % 3 != 0))
	return {
		"day": day, "season_year": 2027, "season_days": Calendar.DAYS_PER_SEASON,
		"protagonist": {"id": "ME", "career_stage": "highschool", "hs_grade": 3,
			"team_id": "TEAM_HS_AEWOL", "league_id": "LEAGUE_HIGHSCHOOL",
			"injury": null},
		"schedule": schedule,
		"mailbox": [],
	}


func _digest_week() -> int:
	return int(Digest.DIGEST_WEEKS[0])


func _off_week() -> int:
	for w in range(1, Calendar.WEEKS_PER_SEASON):
		if not Digest.DIGEST_WEEKS.has(w):
			return w
	return 1


# ── 소식이 되나 ───────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 362줄이 굴러도 아무도 못 보면 없는 것과 같다
func test_다이제스트_주에_소식이_온다() -> void:
	var s: Dictionary = _state(_digest_week())
	DigestRunner.run(s, int(s["day"]))
	var found: bool = false
	for m in s.get("mailbox", []):
		if String(m.get("id", "")).begins_with("msg-digest-"):
			found = true
	assert_bool(found).override_failure_message(
		"다이제스트 주를 굴렸는데 소식이 안 왔다 — 362줄이 죽어 있다") \
		.is_true()


## 다이제스트 주가 아니면 안 온다 — 매주 오면 소식함이 그걸로 찬다
func test_다이제스트_주가_아니면_안_온다() -> void:
	var s: Dictionary = _state(_off_week())
	DigestRunner.run(s, int(s["day"]))
	assert_int(int(s.get("mailbox", []).size())).override_failure_message(
		"다이제스트 주가 아닌데 소식이 왔다").is_equal(0)


## 본문에 내용이 있어야 한다 — 껍데기만 오면 안 온 것과 같다
func test_본문에_내용이_있다() -> void:
	var s: Dictionary = _state(_digest_week())
	DigestRunner.run(s, int(s["day"]))
	var body: String = String(s["mailbox"][0].get("body", ""))
	assert_int(body.length()).override_failure_message(
		"본문이 %d글자다 — 껍데기다" % body.length()).is_greater(40)
	assert_int(body.find("야구계 소식")).is_greater(-1)


## ⚠ **내 순위표는 최상위에 있고 `league_state`엔 내가 안 뛰는 리그만 있다.**
## 잘못 먹이면 조립기가 내 자리를 못 찾는다 — `digest_test.gd:57-59`가
## 그 표본 실수를 적어 뒀다.
##
## ⚠ **본문에 글자가 있는지로만 재면 안 된다** — 순위표를 통째로 안 줘도
## `[다른 무대]`가 남아서 변이가 살아남았다(0/1). **내 팀 전적**을 본다
func test_내_순위표를_먹인다() -> void:
	var s: Dictionary = _state(_digest_week())
	DigestRunner.run(s, int(s["day"]))
	var body: String = String(s["mailbox"][0].get("body", ""))
	assert_int(body.find("9승 3패")).override_failure_message(
		"내 팀 전적(9승 3패)이 본문에 없다 — 내 순위표가 안 먹혔다\n%s"
		% body).is_greater(-1)


## ⚠ **내 리그가 `[다른 무대]`에 또 나오면 안 된다.** 조립기가 빼 주긴
## 하지만 넣는 쪽이 안 빼면 같은 리그가 두 번 계산된다
func test_내_리그는_다른_무대에_없다() -> void:
	var inp: Dictionary = DigestRunner.input_of(_state(_digest_week()),
		(_digest_week() - 1) * Calendar.DAYS_PER_WEEK + 1)
	assert_bool(inp["league_state"].has("LEAGUE_HIGHSCHOOL")) \
		.override_failure_message(
			"내 리그가 다른 무대 목록에 들어갔다").is_false()
	assert_bool(inp["league_state"].has("LEAGUE_KBL")) \
		.override_failure_message("남의 리그가 빠졌다").is_true()


## ⚠ **주차를 안 주면 id가 `msg-digest-2027-w0`으로 굳는다** — 열한 번의
## 다이제스트가 한 통이 되어 열 통이 조용히 사라진다
func test_주차가_id에_들어간다() -> void:
	var s: Dictionary = _state(_digest_week())
	DigestRunner.run(s, int(s["day"]))
	var first: String = String(s["mailbox"][0]["id"])

	var later: int = int(Digest.DIGEST_WEEKS[1])
	var s2: Dictionary = _state(later)
	DigestRunner.run(s2, int(s2["day"]))
	assert_str(first).override_failure_message(
		"다른 주의 다이제스트 id가 %s로 같다 — 열 통이 사라진다" % first) \
		.is_not_equal(String(s2["mailbox"][0]["id"]))


## ⚠ **id에 연도가 있어야 한다.** `week_num`은 해마다 1로 리셋되므로
## 안 넣으면 3시즌째에 겹친다 — 원본에서 실제로 세이브가 안 열렸다
func test_해마다_id가_다르다() -> void:
	var a: Dictionary = _state(_digest_week())
	DigestRunner.run(a, int(a["day"]))
	var b: Dictionary = _state(_digest_week())
	b["season_year"] = 2028
	DigestRunner.run(b, int(b["day"]))
	assert_str(String(a["mailbox"][0]["id"])).override_failure_message(
		"두 해의 다이제스트 id가 같다 — 세이브가 안 열린다") \
		.is_not_equal(String(b["mailbox"][0]["id"]))


## 같은 주를 두 번 굴려도 두 통이 안 온다 — 겹친 id는 하나가 사라진다
func test_두_번_굴려도_한_통이다() -> void:
	var s: Dictionary = _state(_digest_week())
	DigestRunner.run(s, int(s["day"]))
	DigestRunner.run(s, int(s["day"]))
	var n: int = 0
	for m in s.get("mailbox", []):
		if String(m.get("id", "")).begins_with("msg-digest-"):
			n += 1
	assert_int(n).override_failure_message(
		"같은 주에 다이제스트가 %d통 왔다" % n).is_equal(1)


# ── 배선 ──────────────────────────────────────────────────────────

## ⚠ **주간 처리가 안 부르면 만들어 놓고 또 죽은 배선이 된다**
func test_주간_처리가_부른다() -> void:
	var src := CodeText.of("res://sim/week_runner.gd")
	assert_int(src.find("DigestRunner")).override_failure_message(
		"다이제스트를 아무도 안 부른다 — 또 죽은 배선이다").is_greater(-1)


## 🔴 **끝까지 굴려서 본다.** 문자열 검사만으론 인자가 틀린 걸 못 잡는다
func test_주간_처리를_굴리면_온다() -> void:
	var s: Dictionary = _state(_digest_week())
	WeekRunner.run(s, int(s["day"]))
	var found: bool = false
	for m in s.get("mailbox", []):
		if String(m.get("id", "")).begins_with("msg-digest-"):
			found = true
	assert_bool(found).override_failure_message(
		"주간 처리를 굴렸는데 다이제스트가 안 왔다").is_true()
