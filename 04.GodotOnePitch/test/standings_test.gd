extends GdUnitTestSuite

## 순위표·연승·최근10 — M1 기반 자료구조.
##
## 원본 검사: `02.SvelteElectron/apps/ui/src/shared/utils/__tests__/season-helpers.test.ts`
##
## ⚠ **검사를 로직보다 먼저 옮긴다.** 이 파일이 먼저 빨간불이 되고,
## `sim/standings.gd`를 만들면 초록불이 된다. 순서를 뒤집으면 옮기면서
## 놓친 걸 못 잡는다.
##
## 원본이 담고 있던 것 중 이 검사가 지키는 것:
##   · 무승부는 승/패 어느 쪽도 안 올린다 (`loserId == null`이 무승부 표시다)
##   · 승률 분모에 무승부가 안 들어간다
##   · 득실은 홈/원정을 뒤집어 넣는다
##   · 최근 10경기는 **구형 압축 포맷("W3L2")도 읽는다** — 옛 세이브 때문이다


# ── 연승 ───────────────────────────────────────────────────────────

func test_streak_starts_fresh() -> void:
	assert_str(Standings.update_streak("", "W")).is_equal("W1")
	assert_str(Standings.update_streak("", "L")).is_equal("L1")


func test_streak_increments_on_same_result() -> void:
	assert_str(Standings.update_streak("W3", "W")).is_equal("W4")
	assert_str(Standings.update_streak("L2", "L")).is_equal("L3")


func test_streak_resets_when_result_changes() -> void:
	assert_str(Standings.update_streak("W3", "L")).is_equal("L1")
	assert_str(Standings.update_streak("L5", "W")).is_equal("W1")
	assert_str(Standings.update_streak("W2", "D")).is_equal("D1")


func test_streak_handles_two_digit_counts() -> void:
	# 10연승을 넘기면 "W10"이다 — 한 글자만 잘라 읽으면 W1이 된다
	assert_str(Standings.update_streak("W10", "W")).is_equal("W11")


# ── 최근 10경기 ────────────────────────────────────────────────────

func test_last10_appends() -> void:
	assert_str(Standings.update_last10("", "W")).is_equal("W")
	assert_str(Standings.update_last10("WWWWW", "L")).is_equal("WWWWWL")


func test_last10_drops_oldest_past_ten() -> void:
	assert_str(Standings.update_last10("WWWWWWWWWW", "L")).is_equal("WWWWWWWWWL")


func test_last10_reads_old_compressed_format() -> void:
	# ⚠ 옛 세이브가 "W3L2" 같은 압축 형태를 갖고 있다.
	# 그대로 이어붙이면 숫자가 섞여 이후 계산이 통째로 어긋난다
	assert_str(Standings.update_last10("W3L2", "W")).is_equal("WWWLLW")


# ── 순위표 ─────────────────────────────────────────────────────────

func _standing(team: String) -> Dictionary:
	return {
		"team_id": team, "wins": 0, "losses": 0, "draws": 0, "win_pct": 0.0,
		"runs_for": 0, "runs_against": 0, "streak": "", "last10": "",
	}


func _result(home: int, away: int, winner: String, loser) -> Dictionary:
	return {"home_score": home, "away_score": away, "winner_id": winner, "loser_id": loser}


func test_win_and_loss_are_recorded() -> void:
	var st: Array = [_standing("A"), _standing("B")]
	var out: Array = Standings.apply_result(st, _result(5, 3, "A", "B"), "A", "B")
	assert_int(out[0]["wins"]).is_equal(1)
	assert_int(out[0]["losses"]).is_equal(0)
	assert_int(out[1]["wins"]).is_equal(0)
	assert_int(out[1]["losses"]).is_equal(1)


func test_draw_counts_neither_win_nor_loss() -> void:
	# ⚠ `loser_id`가 없으면 무승부다. 이걸 놓치면 무승부가 홈팀 승리가 된다
	var st: Array = [_standing("A"), _standing("B")]
	var out: Array = Standings.apply_result(st, _result(4, 4, "A", null), "A", "B")
	for s in out:
		assert_int(s["wins"]).is_equal(0)
		assert_int(s["losses"]).is_equal(0)
		assert_int(s["draws"]).is_equal(1)


func test_win_pct_excludes_draws() -> void:
	# 1승 1무면 승률 1.000이다 — 무승부를 분모에 넣으면 0.500이 된다
	var st: Array = [_standing("A"), _standing("B")]
	st = Standings.apply_result(st, _result(5, 3, "A", "B"), "A", "B")
	st = Standings.apply_result(st, _result(4, 4, "A", null), "A", "B")
	assert_float(st[0]["win_pct"]).is_equal_approx(1.0, 0.001)


func test_runs_are_swapped_for_away_team() -> void:
	# 홈 5 : 원정 3이면 원정팀은 득점 3 · 실점 5다
	var st: Array = [_standing("A"), _standing("B")]
	var out: Array = Standings.apply_result(st, _result(5, 3, "A", "B"), "A", "B")
	assert_int(out[0]["runs_for"]).is_equal(5)
	assert_int(out[0]["runs_against"]).is_equal(3)
	assert_int(out[1]["runs_for"]).is_equal(3)
	assert_int(out[1]["runs_against"]).is_equal(5)


func test_untouched_teams_stay_the_same() -> void:
	# 경기에 안 나온 팀이 바뀌면 리그 전체가 어긋난다
	var st: Array = [_standing("A"), _standing("B"), _standing("C")]
	var out: Array = Standings.apply_result(st, _result(5, 3, "A", "B"), "A", "B")
	assert_int(out[2]["wins"]).is_equal(0)
	assert_int(out[2]["runs_for"]).is_equal(0)
	assert_str(out[2]["streak"]).is_empty()


func test_streak_and_last10_update_together() -> void:
	var st: Array = [_standing("A"), _standing("B")]
	st = Standings.apply_result(st, _result(5, 3, "A", "B"), "A", "B")
	st = Standings.apply_result(st, _result(6, 2, "A", "B"), "A", "B")
	assert_str(st[0]["streak"]).is_equal("W2")
	assert_str(st[0]["last10"]).is_equal("WW")
	assert_str(st[1]["streak"]).is_equal("L2")
	assert_str(st[1]["last10"]).is_equal("LL")


func test_sort_orders_by_win_pct_then_wins() -> void:
	var st: Array = [
		{"team_id": "A", "win_pct": 0.500, "wins": 5},
		{"team_id": "B", "win_pct": 0.600, "wins": 3},
		{"team_id": "C", "win_pct": 0.500, "wins": 8},
	]
	var out: Array = Standings.sorted(st)
	assert_str(out[0]["team_id"]).is_equal("B")
	# 승률이 같으면 승수가 많은 쪽이 위다
	assert_str(out[1]["team_id"]).is_equal("C")
	assert_str(out[2]["team_id"]).is_equal("A")


func test_sort_does_not_mutate_input() -> void:
	# 순위표를 화면이 정렬해 보여주는데, 그게 원본을 바꾸면 저장까지 흔들린다
	var st: Array = [
		{"team_id": "A", "win_pct": 0.1, "wins": 1},
		{"team_id": "B", "win_pct": 0.9, "wins": 9},
	]
	Standings.sorted(st)
	assert_str(st[0]["team_id"]).is_equal("A")
