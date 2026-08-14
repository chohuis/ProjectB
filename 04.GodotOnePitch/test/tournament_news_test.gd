extends GdUnitTestSuite

## 대회 소식 — 개막·라운드·우승. B-4b.


const ME: String = "T003"


func _def(over: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"id": "TOUR_TEST", "league_id": "LEAGUE_HIGHSCHOOL",
		"name": "개나리기", "flower": "개나리", "start_week": 2, "end_week": 3,
		"total_slots": 8, "wildcard_slots": 0}
	d.merge(over, true)
	return d


func _teams(n: int) -> Array:
	var out: Array = []
	for i in n:
		out.append("T%03d" % i)
	return out


func _names(n: int) -> Dictionary:
	var out: Dictionary = {}
	for i in n:
		out["T%03d" % i] = "%d번고" % i
	return out


## 전 라운드를 홈 승리로 밀어 완주시킨다
func _finish(bracket: Dictionary, me: String = ME) -> void:
	for round in range(1, int(bracket["total_rounds"]) + 1):
		var inputs: Array = []
		for g in Tournament.round_schedule(bracket, round):
			inputs.append({"match_id": String(g["id"]), "winner": String(g["home"])})
		Tournament.advance_round(bracket, round, inputs, me)


func _advance_one(bracket: Dictionary, round: int, winner_of: Callable,
		me: String = ME) -> void:
	var inputs: Array = []
	for g in Tournament.round_schedule(bracket, round):
		inputs.append({"match_id": String(g["id"]), "winner": winner_of.call(g)})
	Tournament.advance_round(bracket, round, inputs, me)


# ── 라운드 이름 ───────────────────────────────────────────────

## ⚠ **결승에서 거꾸로 센다.** 앞에서 세면 32팀 대회의 1라운드와 128팀
## 대회의 1라운드가 같은 이름이 된다
func test_the_round_name_counts_back_from_the_final() -> void:
	assert_str(TournamentNews.round_name(5, 5)).is_equal("결승")
	assert_str(TournamentNews.round_name(4, 5)).is_equal("4강")
	assert_str(TournamentNews.round_name(3, 5)).is_equal("8강")
	assert_str(TournamentNews.round_name(2, 5)).is_equal("16강")
	assert_str(TournamentNews.round_name(1, 5)).is_equal("32강")
	# 128팀 대회면 1라운드가 32강이 아니다
	assert_str(TournamentNews.round_name(1, 7)).is_equal("1라운드")
	assert_str(TournamentNews.round_name(3, 7)).is_equal("32강")
	# 8팀 대회는 1라운드가 곧 8강
	assert_str(TournamentNews.round_name(1, 3)).is_equal("8강")


## ⚠ **32강부터 명단을 보낸다.** 그 앞은 팀이 너무 많아 소식이 안 된다 —
## 102팀 대회면 1회전만 51경기다
func test_only_the_late_rounds_are_listed() -> void:
	assert_bool(TournamentNews.is_listable(3, 7)).is_true()
	assert_bool(TournamentNews.is_listable(2, 7)).override_failure_message(
		"64강 명단을 보낸다 — 팀이 너무 많다").is_false()
	assert_bool(TournamentNews.is_listable(1, 3)).is_true()


# ── 개막 ──────────────────────────────────────────────────────

func test_the_opening_says_who_is_in() -> void:
	var joined: Dictionary = TournamentNews.opening(_def(), _teams(8), ME, 8, 2027)
	assert_str(String(joined["subject"])).contains("8팀 참가")
	assert_str(String(joined["subject"])).contains("2027")
	assert_str(String(joined["preview"])).contains("우리 팀도")
	assert_str(String(joined["body"])).contains("W2 ~ W3")
	assert_str(String(joined["category"])).is_equal("news")
	assert_str(String(joined["sender"])).is_equal("고교야구연맹")
	assert_int(int(joined["day"])).is_equal(8)
	assert_bool(bool(joined["read"])).is_false()

	var missed: Dictionary = TournamentNews.opening(_def(), _teams(8),
		"NOBODY", 8, 2027)
	assert_str(String(missed["preview"])).override_failure_message(
		"출전도 못 했는데 나간다고 한다").contains("출전하지 못했다")


## 대학 대회는 보내는 사람이 다르다
func test_the_sender_follows_the_league() -> void:
	var univ: Dictionary = TournamentNews.opening(
		_def({"league_id": "LEAGUE_UNIVERSITY"}), _teams(8), ME, 8, 2027)
	assert_str(String(univ["sender"])).is_equal("대학야구연맹")


## ⚠ **id에 연도를 넣는다.** 주차는 시즌마다 1로 돌아가서 해마다 겹치고,
## 소식 목록이 id를 키로 잡아 겹치면 화면이 죽는다
func test_the_message_id_carries_the_year() -> void:
	var a: Dictionary = TournamentNews.opening(_def(), _teams(8), ME, 8, 2027)
	var b: Dictionary = TournamentNews.opening(_def(), _teams(8), ME, 8, 2028)
	assert_str(String(a["id"])).is_not_equal(String(b["id"]))


# ── 내 경기 ───────────────────────────────────────────────────

func test_my_win_says_where_i_go_next() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), ME, 2027)
	_advance_one(b, 1, func(g): return String(g["home"]))

	var msg: Dictionary = TournamentNews.my_round(_def(), b, 1, ME, _names(8), 10)
	assert_bool(msg.is_empty()).override_failure_message(
		"내 경기 소식이 안 왔다").is_false()
	assert_str(String(msg["subject"])).contains("8강 통과")
	assert_str(String(msg["body"])).override_failure_message(
		"다음 라운드를 안 알려준다").contains("4강에 오른다")
	assert_str(String(msg["preview"])).contains("승리")
	# ⚠ **상대는 나 자신이 아니다.** 이름이 id가 아니라 이름으로 나온다
	var opponent: String = ""
	for m in b["matches"]:
		if int(m["round"]) != 1:
			continue
		if String(m["home"]) == ME:
			opponent = String(m["away"])
		elif String(m["away"]) == ME:
			opponent = String(m["home"])
	assert_str(opponent).is_not_empty()
	assert_str(String(msg["body"])).contains(_names(8)[opponent])
	assert_str(String(msg["body"])).override_failure_message(
		"상대 자리에 내 팀 이름이 들어갔다") \
		.not_contains("상대   %s" % _names(8)[ME])


## ⚠ **부전승은 경기가 아니다.** 소식으로 알리면 안 치른 경기의 결과가 뜬다
func test_a_bye_is_not_a_result() -> void:
	var teams: Array = _teams(24)
	# 1번 시드는 부전승을 받는다
	teams[0] = ME
	var b: Dictionary = Tournament.generate_bracket(_def({"total_slots": 24}),
		teams, ME, 2027)
	assert_dict(TournamentNews.my_round(_def(), b, 1, ME, _names(24), 10)) \
		.override_failure_message("부전승을 경기 결과로 알렸다").is_empty()


## 라운드마다 소식 id가 다르다 — 겹치면 소식 목록이 죽는다
func test_each_round_has_its_own_message_id() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), ME, 2027)
	var ids: Dictionary = {}
	for round in range(1, 4):
		_advance_one(b, round, func(g):
			if String(g["home"]) == ME or String(g["away"]) == ME:
				return ME
			return String(g["home"]))
		var msg: Dictionary = TournamentNews.my_round(_def(), b, round, ME,
			_names(8), 10 + round)
		assert_bool(msg.is_empty()).is_false()
		assert_bool(ids.has(String(msg["id"]))).override_failure_message(
			"%d라운드 소식 id가 앞 라운드와 같다" % round).is_false()
		ids[String(msg["id"])] = true


func test_my_loss_ends_the_tournament() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), ME, 2027)
	_advance_one(b, 1, func(g): return String(g["away"]))

	var msg: Dictionary = TournamentNews.my_round(_def(), b, 1, ME, _names(8), 10)
	assert_str(String(msg["subject"])).contains("8강 탈락")
	assert_str(String(msg["body"])).contains("여기서 대회를 마친다")
	assert_str(String(msg["preview"])).contains("패배")


## 우승은 꽃을 든다
func test_winning_the_final_lifts_the_flower() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), ME, 2027)
	# ME(T003)가 다 이기게 — 홈이든 원정이든
	for round in range(1, 4):
		_advance_one(b, round, func(g):
			if String(g["home"]) == ME or String(g["away"]) == ME:
				return ME
			return String(g["home"]))

	var msg: Dictionary = TournamentNews.my_round(_def(), b, 3, ME, _names(8), 20)
	# ⚠ **02는 여기서 대회 이름을 두 번 넣어 "개나리기 개나리기 우승"이었다**
	assert_str(String(msg["subject"])).is_equal("개나리기 우승")
	assert_str(String(msg["body"])).override_failure_message(
		"우승했는데 꽃 이야기가 없다").contains("개나리를 들어올렸다")


## 내가 안 나간 라운드는 소식이 없다
func test_no_message_when_i_am_not_there() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), ME, 2027)
	_advance_one(b, 1, func(g): return String(g["home"]))
	assert_dict(TournamentNews.my_round(_def(), b, 2, ME, _names(8), 12)) \
		.override_failure_message("탈락했는데 내 경기 소식이 왔다").is_empty()
	# 아예 미출전
	assert_dict(TournamentNews.my_round(_def(), b, 1, "NOBODY", _names(8), 10)) \
		.is_empty()
	assert_dict(TournamentNews.my_round(_def(), b, 1, "", _names(8), 10)).is_empty()


## 아직 안 끝난 경기는 소식이 없다
func test_no_message_before_the_game_is_played() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), ME, 2027)
	assert_dict(TournamentNews.my_round(_def(), b, 1, ME, _names(8), 10)).is_empty()


# ── 라운드 명단 ───────────────────────────────────────────────

## ⚠ **내 팀이 없어도 온다.** 02는 내 경기와 우승만 보내서, 우리가 안 나간
## 대회는 개막·우승 두 통뿐이라 **누가 올라갔는지 알 수 없었다**
func test_the_round_list_comes_even_without_me() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), "NOBODY",
		2027)
	_advance_one(b, 1, func(g): return String(g["home"]), "NOBODY")

	var msg: Dictionary = TournamentNews.round_progress(_def(), b, 1, "NOBODY",
		_names(8), 10)
	assert_bool(msg.is_empty()).override_failure_message(
		"내 팀이 없다고 명단 소식이 안 왔다").is_false()
	assert_str(String(msg["subject"])).contains("4강 진출 4팀")
	assert_str(String(msg["body"])).contains("8강 종료")
	assert_str(String(msg["body"])).contains("번고")


## ⚠ **내 팀이 그 라운드에 있으면 안 보낸다.** `my_round`가 이미 알린다 —
## 둘 다 보내면 같은 라운드가 두 통이 된다
func test_the_round_list_steps_aside_for_my_game() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), ME, 2027)
	_advance_one(b, 1, func(g): return String(g["home"]))
	assert_dict(TournamentNews.round_progress(_def(), b, 1, ME, _names(8), 10)) \
		.override_failure_message("내 경기가 있는 라운드에 명단까지 보냈다") \
		.is_empty()


## 결승은 우승 소식이 맡는다
func test_the_final_is_left_to_the_champion_message() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), "NOBODY",
		2027)
	_finish(b, "NOBODY")
	assert_dict(TournamentNews.round_progress(_def(), b, 3, "NOBODY",
		_names(8), 20)).is_empty()


## ⚠ **이른 라운드는 명단을 안 보낸다.** 102팀 대회면 1회전만 51경기라
## 명단이 소식이 안 된다
func test_an_early_round_sends_no_list() -> void:
	var d: Dictionary = _def({"total_slots": 128})
	var b: Dictionary = Tournament.generate_bracket(d, _teams(128), "NOBODY", 2027)
	assert_int(int(b["total_rounds"])).is_equal(7)
	_advance_one(b, 1, func(g): return String(g["home"]), "NOBODY")

	assert_dict(TournamentNews.round_progress(d, b, 1, "NOBODY", {}, 10)) \
		.override_failure_message("64강 명단을 보냈다 — 64경기짜리 목록이다") \
		.is_empty()
	# 32강(3라운드)부터는 보낸다
	_advance_one(b, 2, func(g): return String(g["home"]), "NOBODY")
	_advance_one(b, 3, func(g): return String(g["home"]), "NOBODY")
	assert_dict(TournamentNews.round_progress(d, b, 3, "NOBODY", {}, 12)) \
		.is_not_empty()


## 안 끝난 라운드는 명단이 없다
func test_an_unfinished_round_has_no_list() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), "NOBODY",
		2027)
	assert_dict(TournamentNews.round_progress(_def(), b, 1, "NOBODY",
		_names(8), 10)).is_empty()


## 우리 권역 팀을 짚어 준다 — 없으면 남의 대회 명단은 읽을 이유가 없다
func test_it_points_out_my_region() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), "NOBODY",
		2027)
	_advance_one(b, 1, func(g): return String(g["home"]), "NOBODY")

	var winners: Array = []
	for m in b["matches"]:
		if int(m["round"]) == 1:
			winners.append(String(m["winner"]))
	var msg: Dictionary = TournamentNews.round_progress(_def(), b, 1, "NOBODY",
		_names(8), 10, [String(winners[0])])
	assert_str(String(msg["body"])).contains("← 우리 권역")
	assert_str(String(msg["preview"])).override_failure_message(
		"우리 권역이 올라갔는데 미리보기에 안 나온다").contains("우리 권역")


## 우리 권역이 떨어지면 그것도 알린다
func test_it_says_who_of_ours_fell() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), "NOBODY",
		2027)
	_advance_one(b, 1, func(g): return String(g["home"]), "NOBODY")

	var losers: Array = []
	for m in b["matches"]:
		if int(m["round"]) != 1:
			continue
		losers.append(String(m["away"]) if String(m["winner"]) == String(m["home"])
			else String(m["home"]))
	var msg: Dictionary = TournamentNews.round_progress(_def(), b, 1, "NOBODY",
		_names(8), 10, [String(losers[0])])
	assert_str(String(msg["body"])).contains("우리 권역 탈락")


# ── 우승 ──────────────────────────────────────────────────────

func test_the_champion_message_names_both() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), "NOBODY",
		2027)
	_finish(b, "NOBODY")

	var msg: Dictionary = TournamentNews.champion(_def(), b, "NOBODY",
		_names(8), 20)
	assert_bool(msg.is_empty()).is_false()
	assert_str(String(msg["subject"])).contains("우승")
	assert_str(String(msg["body"])).contains("🏆 우승")
	assert_str(String(msg["body"])).override_failure_message(
		"준우승이 안 나온다").contains("준우승")
	assert_str(String(msg["preview"])).contains("준우승")

	# ⚠ **준우승은 우승팀이 아니다.** 결승에서 진 쪽이다
	var champ: String = Tournament.champion(b)
	var runner_up: String = ""
	for m in b["matches"]:
		if int(m["round"]) != int(b["total_rounds"]):
			continue
		runner_up = String(m["away"]) if champ == String(m["home"]) \
			else String(m["home"])
	assert_str(runner_up).is_not_equal(champ)
	assert_str(String(msg["preview"])).override_failure_message(
		"준우승 자리에 우승팀 이름이 들어갔다") \
		.is_equal("준우승 %s" % _names(8)[runner_up])


## ⚠ **내 팀이 우승했으면 안 보낸다** — `my_round`가 이미 알렸다
func test_my_own_title_is_not_announced_twice() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), ME, 2027)
	_finish(b)
	var champ: String = Tournament.champion(b)
	assert_dict(TournamentNews.champion(_def(), b, champ, _names(8), 20)) \
		.override_failure_message("내가 우승했는데 리그 소식까지 왔다").is_empty()


## 결승이 안 끝났으면 우승 소식이 없다
func test_no_champion_before_the_final() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), "NOBODY",
		2027)
	_advance_one(b, 1, func(g): return String(g["home"]), "NOBODY")
	assert_dict(TournamentNews.champion(_def(), b, "NOBODY", _names(8), 20)) \
		.is_empty()


## 이름이 없으면 id를 그대로 쓴다 — 빈칸보다 낫다
func test_an_unknown_team_falls_back_to_its_id() -> void:
	var b: Dictionary = Tournament.generate_bracket(_def(), _teams(8), "NOBODY",
		2027)
	_finish(b, "NOBODY")
	var msg: Dictionary = TournamentNews.champion(_def(), b, "NOBODY", {}, 20)
	assert_str(String(msg["subject"])).contains("T000")
