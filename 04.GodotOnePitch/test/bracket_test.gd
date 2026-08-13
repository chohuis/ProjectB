extends GdUnitTestSuite

## 포스트시즌 대진 — M1 기반 자료구조.
##
## 원본 검사: `02.SvelteElectron/apps/ui/src/shared/utils/__tests__/bracket.test.ts`
## 원본 로직: 같은 폴더 `bracket.ts`
##
## ⚠ **라운드 순서를 이름으로 정하면 안 된다.** "와일드카드"·"준플레이오프"는
## 리그마다 다른 말이고 KBL/ABL/JBL이 서로 다르게 부른다. **결승에서 거꾸로
## 세는 깊이**가 유일하게 리그와 무관한 기준이다.


func _sr(id: String, o: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"id": id, "league_id": "LEAGUE_KBL", "round": "라운드",
		"home_team_id": "H", "away_team_id": "A",
		"best_of": 5, "home_wins": 0, "away_wins": 0, "winner": "",
		"home_from": "", "away_from": "", "next_series_id": "", "next_series_slot": "",
	}
	s.merge(o, true)
	return s


## KBL식 4단계: 와일드카드 → 준PO → PO → 한국시리즈
func _kbl() -> Array:
	return [
		_sr("KS", {"round": "한국시리즈", "best_of": 7}),
		_sr("PO", {"round": "플레이오프", "best_of": 5, "next_series_id": "KS", "next_series_slot": "away"}),
		_sr("SPO", {"round": "준플레이오프", "best_of": 3, "next_series_id": "PO", "next_series_slot": "away"}),
		_sr("WC", {"round": "와일드카드", "best_of": 1, "next_series_id": "SPO", "next_series_slot": "away"}),
	]


func _labels(rounds: Array) -> Array:
	var out: Array = []
	for r in rounds:
		out.append(r["label"])
	return out


# ── 라운드 풀기 ────────────────────────────────────────────────────

func test_earliest_round_comes_first() -> void:
	assert_array(_labels(Bracket.to_rounds(_kbl()))).is_equal(
		["와일드카드", "준플레이오프", "플레이오프", "한국시리즈"])


func test_final_has_depth_zero() -> void:
	var rounds: Array = Bracket.to_rounds(_kbl())
	assert_int(rounds[rounds.size() - 1]["depth"]).is_equal(0)
	assert_int(rounds[0]["depth"]).is_equal(3)


func test_order_does_not_come_from_round_names() -> void:
	# ⚠ ABL식 — 같은 구조인데 이름만 다르다. 이름으로 정렬하면 뒤집힌다
	var abl: Array = [
		_sr("F", {"round": "월드시리즈"}),
		_sr("CS", {"round": "챔피언십", "next_series_id": "F"}),
		_sr("DS", {"round": "디비전", "next_series_id": "CS"}),
	]
	assert_array(_labels(Bracket.to_rounds(abl))).is_equal(["디비전", "챔피언십", "월드시리즈"])


func test_same_depth_series_share_a_round() -> void:
	var two: Array = [
		_sr("F", {"round": "결승"}),
		_sr("S1", {"round": "4강", "next_series_id": "F"}),
		_sr("S2", {"round": "4강", "next_series_id": "F"}),
	]
	var rounds: Array = Bracket.to_rounds(two)
	assert_int(rounds.size()).is_equal(2)
	var ids: Array = []
	for s in rounds[0]["series"]:
		ids.append(s["id"])
	assert_array(ids).is_equal(["S1", "S2"])


func test_empty_bracket() -> void:
	assert_array(Bracket.to_rounds([])).is_empty()


func test_cycle_does_not_hang() -> void:
	# 데이터가 깨져도 화면은 살아야 한다. 무한 루프면 여기서 검사가 안 끝난다
	var loop: Array = [
		_sr("A", {"next_series_id": "B"}),
		_sr("B", {"next_series_id": "A"}),
	]
	var rounds: Array = Bracket.to_rounds(loop)
	assert_int(rounds.size()).is_greater(0)


func test_dangling_next_id_does_not_crash() -> void:
	# 앞 시리즈만 남고 뒤가 지워진 세이브가 있을 수 있다
	var broken: Array = [_sr("A", {"next_series_id": "GONE"})]
	assert_int(Bracket.to_rounds(broken).size()).is_equal(1)


# ── 시리즈 상태 ────────────────────────────────────────────────────

func test_series_is_live_when_both_sides_are_set() -> void:
	assert_str(Bracket.series_state(_sr("x", {"home_wins": 1, "away_wins": 1}))).is_equal("live")


func test_series_waits_until_the_feeder_finishes() -> void:
	# 한쪽이라도 비면 앞 시리즈 대기다
	assert_str(Bracket.series_state(_sr("x", {"away_team_id": ""}))).is_equal("waiting")
	assert_str(Bracket.series_state(_sr("x", {"home_team_id": ""}))).is_equal("waiting")


func test_series_is_done_when_a_winner_exists() -> void:
	assert_str(Bracket.series_state(_sr("x", {"winner": "H"}))).is_equal("done")


# ── 시리즈 형식 ────────────────────────────────────────────────────

func test_wins_needed() -> void:
	assert_int(Bracket.wins_needed(1)).is_equal(1)
	assert_int(Bracket.wins_needed(3)).is_equal(2)
	assert_int(Bracket.wins_needed(5)).is_equal(3)
	assert_int(Bracket.wins_needed(7)).is_equal(4)


func test_best_of_label() -> void:
	assert_str(Bracket.best_of_label(1)).is_equal("단판")
	assert_str(Bracket.best_of_label(5)).is_equal("5전 3선승")
	assert_str(Bracket.best_of_label(7)).is_equal("7전 4선승")


# ── 우승팀 ─────────────────────────────────────────────────────────

func test_champion_is_the_final_winner() -> void:
	var done: Array = []
	for s in _kbl():
		if s["id"] == "KS":
			s["winner"] = "TEAM_X"
		done.append(s)
	assert_str(Bracket.champion(done)).is_equal("TEAM_X")


func test_champion_does_not_depend_on_list_order() -> void:
	# ⚠ **결승이 목록 첫 칸이라는 보장이 없다.** 세이브에 담긴 순서는 대진
	# 순서가 아니다. 첫 칸을 결승으로 치면 순서가 바뀐 세이브에서 우승팀이
	# 통째로 사라진다 — 깊이로 찾아야 순서와 무관하다
	var done: Array = []
	for s in _kbl():
		if s["id"] == "KS":
			s["winner"] = "TEAM_X"
			s["away_team_id"] = "TEAM_Y"
			s["home_team_id"] = "TEAM_X"
		done.append(s)
	done.reverse()  # 와일드카드가 맨 앞으로 온다
	assert_str(Bracket.champion(done)).is_equal("TEAM_X")
	assert_str(Bracket.finalists(done)["runner_up"]).is_equal("TEAM_Y")


func test_champion_is_empty_until_the_final_ends() -> void:
	assert_str(Bracket.champion(_kbl())).is_empty()
	assert_str(Bracket.champion([])).is_empty()


func test_finalists_come_from_the_bracket() -> void:
	# ⚠ **정본은 대진이다.** 시즌 롤오버가 배경 리그 우승팀을 `standings[0]`
	# 즉 **정규시즌 1위**로 적고 있었다. 브래킷이 바로 옆에 있는데 안 썼고
	# 준우승은 빈칸이었다 — 과거 기록의 "우승"과 그 아래 대진표 승자가 서로
	# 다를 수 있었다. 우승팀을 두 군데서 각자 정하면 반드시 어긋난다
	var done: Array = []
	for s in _kbl():
		if s["id"] == "KS":
			s["home_team_id"] = "TEAM_X"
			s["away_team_id"] = "TEAM_Y"
			s["winner"] = "TEAM_X"
		done.append(s)
	var f: Dictionary = Bracket.finalists(done)
	assert_str(f["champion"]).is_equal("TEAM_X")
	assert_str(f["runner_up"]).is_equal("TEAM_Y")


func test_finalists_reads_the_loser_from_either_side() -> void:
	# 원정팀이 우승하면 준우승은 홈이다
	var one: Array = [_sr("F", {"home_team_id": "H1", "away_team_id": "A1", "winner": "A1"})]
	var f: Dictionary = Bracket.finalists(one)
	assert_str(f["champion"]).is_equal("A1")
	assert_str(f["runner_up"]).is_equal("H1")


func test_finalists_is_empty_until_the_final_ends() -> void:
	assert_dict(Bracket.finalists(_kbl())).is_empty()
