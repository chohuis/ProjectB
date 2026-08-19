extends GdUnitTestSuite

## 트레이드를 세계에 적용 — M9-15.
##
## `Trade`는 순수 계산이고 여기가 선수를 실제로 옮긴다.


const KBL_A: String = "TEAM_KBL_BUSAN_WAVES_1"
const KBL_B: String = "TEAM_KBL_CHANGWON_STARS_1"


func _player(id: String, over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": id, "name": id, "team_id": KBL_A, "league_id": "LEAGUE_KBL",
		"player_type": "pitcher", "position": "SP", "age": 27,
		"pitching": {"ovr": 65.0}, "batting": {"ovr": 40.0},
		"salary": 5000, "contract_years": 3, "pro_service_years": 6,
	}
	p.merge(over, true)
	return p


## ⚠ **얇은 fixture는 가드를 못 본다.** 두 팀 네 명으로는 제안이 몇 건 안
## 나와서 상한·정원·중복 방지가 **하나도 안 걸린다** — 변이 검증이 그걸
## 잡아 줬다. 리그 열 팀을 실제 모양으로 채운다.
##
## 짝수 팀은 SP가 남고 C가 모자라며, 홀수 팀은 반대다 — 맞바꿀 거리가 있다
func _state() -> Dictionary:
	var rosters: Dictionary = {}
	var teams: Array = World.teams_of("LEAGUE_KBL")
	for t in teams.size():
		var tid: String = String(teams[t]["id"])
		var many: String = "SP" if t % 2 == 0 else "C"
		var few: String = "C" if t % 2 == 0 else "SP"
		var roster: Array = []
		# 남는 자리 넷
		for i in 4:
			roster.append(_player("%s_%s%d" % [tid, many, i], {"team_id": tid,
				"position": many, "player_type": "pitcher" if many == "SP" else "batter",
				"pitching": {"ovr": 62.0 + float(i)},
				"batting": {"ovr": 62.0 + float(i)}}))
		# 모자란 자리 하나
		roster.append(_player("%s_%s0" % [tid, few], {"team_id": tid,
			"position": few, "player_type": "pitcher" if few == "SP" else "batter",
			"pitching": {"ovr": 66.0}, "batting": {"ovr": 66.0}}))
		# 계약이 한 해 남은 특급 하나 — 계약 만료 선점의 먹이다
		roster.append(_player("%s_EXP" % tid, {"team_id": tid, "position": "1B",
			"player_type": "batter", "batting": {"ovr": 86.0},
			"contract_years": 1}))
		# 유망주 둘 — seller·리빌딩 번들의 먹이다
		for i in 2:
			roster.append(_player("%s_KID%d" % [tid, i], {"team_id": tid,
				"position": "2B", "player_type": "batter",
				"batting": {"ovr": 60.0 - float(i)},
				"pro_service_years": 0, "age": 21}))
		rosters[tid] = roster

	# ⚠ **성향을 갈라 둔다.** 전 팀이 중립이면 seller·buyer·리빌딩 갈래가
	# 하나도 안 돌아서 **번들 거래가 아예 안 나온다** — 그러면 정원 가드가
	# 걸릴 일이 없고 검사가 아무것도 안 본다
	var world: Dictionary = {"rosters": rosters}
	for t in teams.size():
		var tid: String = String(teams[t]["id"])
		if t % 3 == 0:
			TeamProfile.patch(world, tid, {"win_now_pressure": 20.0})   # 리빌딩
		elif t % 3 == 1:
			TeamProfile.patch(world, tid, {"win_now_pressure": 80.0})   # 승부수

	return {"seed": 3, "season_year": 2027, "schedule": [], "world": world}


## 두 팀만 있는 작은 세계 — 한 거래를 자세히 볼 때 쓴다
func _pair_state() -> Dictionary:
	var a: Array = []
	for i in 3:
		a.append(_player("A_SP%d" % i, {"position": "SP"}))
	a.append(_player("A_C0", {"position": "C", "player_type": "batter",
		"batting": {"ovr": 66.0}}))

	var b: Array = []
	for i in 3:
		b.append(_player("B_C%d" % i, {"team_id": KBL_B, "position": "C",
			"player_type": "batter", "batting": {"ovr": 66.0}}))
	b.append(_player("B_SP0", {"team_id": KBL_B, "position": "SP"}))

	return {"seed": 3, "season_year": 2027, "schedule": [],
		"world": {"rosters": {KBL_A: a, KBL_B: b}}}


func _team_of(state: Dictionary, id: String) -> String:
	for tid in state["world"]["rosters"]:
		for p in state["world"]["rosters"][tid]:
			if String(p.get("id", "")) == id:
				return tid
	return ""


func _count(state: Dictionary, id: String) -> int:
	var n: int = 0
	for tid in state["world"]["rosters"]:
		for p in state["world"]["rosters"][tid]:
			if String(p.get("id", "")) == id:
				n += 1
	return n


# ── 자산 ──────────────────────────────────────────────────────

## 🔴 **옛 약속을 갈아끼웠다** (P-24).
##
## 여기는 "주인공은 자산 풀에서 뺀다 — 진로는 사용자가 정한다"였다.
## **그 이유는 맞았는데 방법이 틀렸다** — 빼 버리니 `trade` 결정 갈래가
## **도달 불가**가 됐다(화면·받는 코드·`AutoAdvance` 항목이 다 있는데
## 게임에 한 번도 안 나타났다).
##
## **02는 주인공을 자산으로 넣고 걸리면 묻는다**(`market.ts:351-368`,
## `:543-560`). 그래야 "진로는 사용자가 정한다"가 **실제로** 지켜진다 —
## 빼는 게 아니라 **묻는 것**이 사용자가 정하는 방법이다.
##
## ⚠ **노트레이드 조항이 있으면 그때 뺀다.**
func test_the_protagonist_is_an_asset_but_gets_asked() -> void:
	var roster: Array = [_player("ME", {"is_protagonist": true}), _player("N1")]
	var ids: Array = []
	for a in TradeRunner.assets_of(roster):
		ids.append(String(a["id"]))
	assert_bool(ids.has("ME")).override_failure_message(
		"주인공이 자산에 없다 — 제안에 실릴 수가 없어 `trade`가 도달 불가가 된다") \
		.is_true()


## 노트레이드 조항이 있으면 뺀다 — 조항을 따 놓고 팔려 가면 장식이 된다
func test_a_no_trade_clause_removes_the_protagonist() -> void:
	var roster: Array = [
		_player("ME", {"is_protagonist": true, "no_trade": true}),
		_player("N1")]
	var ids: Array = []
	for a in TradeRunner.assets_of(roster):
		ids.append(String(a["id"]))
	assert_array(ids).is_equal(["N1"])


## 야수는 타격 OVR로 값이 매겨진다 — 뒤바뀌면 야수가 늘 헐값이다
func test_an_asset_reads_the_right_ovr() -> void:
	var bat: Dictionary = _player("B", {"player_type": "batter",
		"pitching": {"ovr": 20.0}, "batting": {"ovr": 80.0}})
	assert_float(float(TradeRunner.assets_of([bat])[0]["ovr"])).is_equal(80.0)


func test_the_payroll_adds_up() -> void:
	assert_int(TradeRunner.payroll_of([_player("A"), _player("B")])).is_equal(10000)


## 모자란 자리를 찾는다 — 트레이드 가치에 얹힌다
func test_it_finds_what_the_team_lacks() -> void:
	var assets: Array = TradeRunner.assets_of([
		_player("S1", {"position": "SP"}), _player("S2", {"position": "SP"}),
		_player("S3", {"position": "SP"}), _player("C1", {"position": "C"}),
	])
	var needs: Array = TradeRunner.needs_of(assets)
	assert_array(needs).contains(["C", "1B"])
	assert_array(needs).override_failure_message(
		"세 명 있는 자리를 모자란다고 봤다").not_contains(["SP"])


## ⚠ **유망주는 자리 수에 안 센다.** 세면 유망주만 많은 자리를 "찼다"고 보고
## 보강 대상에서 뺀다 — 정작 뛸 사람이 없는 자리다
func test_prospects_do_not_fill_a_hole() -> void:
	var assets: Array = TradeRunner.assets_of([
		_player("K1", {"position": "SS", "pro_service_years": 0}),
		_player("K2", {"position": "SS", "pro_service_years": 0}),
		_player("K3", {"position": "SS", "pro_service_years": 0}),
	])
	assert_array(TradeRunner.needs_of(assets)).override_failure_message(
		"유망주 셋을 주전으로 셌다").contains(["SS"])


## ⚠ **연차·계약·연봉을 자산에 싣는다.** 하나라도 빠지면 그 판정이 통째로
## 죽는다 — 연차가 없으면 전원이 유망주고, 계약이 없으면 전원이 만료자다
func test_an_asset_carries_what_the_judgements_read() -> void:
	var a: Dictionary = TradeRunner.assets_of([_player("P", {
		"pro_service_years": 7, "contract_years": 4, "salary": 12345})])[0]
	assert_int(int(a["service_years"])).is_equal(7)
	assert_int(int(a["contract_years"])).is_equal(4)
	assert_int(int(a["salary"])).is_equal(12345)
	assert_bool(Trade.is_prospect(a)).override_failure_message(
		"7년차를 유망주로 봤다").is_false()


# ── 모드 ──────────────────────────────────────────────────────

## ⚠ **구단 성향이 모드를 정한다.** 전 팀이 중립이면 buyer가 0팀이고
## 그게 02에서 거래가 마른 모습이다
func test_the_mode_comes_from_the_profile() -> void:
	var w: Dictionary = {"rosters": {}}
	assert_str(TradeRunner.mode_of(w, KBL_A, 1, 10)).is_equal("neutral")

	TeamProfile.patch(w, KBL_A, {"win_now_pressure": 80.0})
	assert_str(TradeRunner.mode_of(w, KBL_A, 1, 10)).is_equal("buyer")
	# 같은 팀이라도 하위권이면 seller다
	assert_str(TradeRunner.mode_of(w, KBL_A, 9, 10)).is_equal("seller")


# ── 세계에 적용 ───────────────────────────────────────────────

## ⚠ **양쪽 배열을 같이 고쳐야 한다.** 한쪽만 하면 같은 선수가 두 군데
## 있거나 통째로 사라진다
func test_a_trade_moves_both_players_once() -> void:
	var s: Dictionary = _pair_state()
	var r: Dictionary = TradeRunner.run_league(s, "LEAGUE_KBL")
	assert_int(int(r["done"])).override_failure_message(
		"제안 %s건인데 성사가 0이다" % r["proposed"]).is_greater(0)

	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			assert_int(_count(s, String(p["id"]))).override_failure_message(
				"%s가 세계에 여러 명 있다" % p["id"]).is_equal(1)
			assert_str(String(p["team_id"])).override_failure_message(
				"배열은 옮겼는데 소속은 옛 팀이다").is_equal(tid)


func test_the_move_is_logged_in_the_career() -> void:
	var s: Dictionary = _pair_state()
	TradeRunner.run_league(s, "LEAGUE_KBL")

	var traded: int = 0
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			for e in p.get("career_events", []):
				if String(e["type"]) == "trade":
					traded += 1
	assert_int(traded).override_failure_message("트레이드가 경력에 안 남았다") \
		.is_greater(0)


## ⚠ **한 선수는 한 해에 한 번만.** 없으면 같은 사람이 팀을 세 번 옮긴다
func test_nobody_moves_twice_in_a_year() -> void:
	var s: Dictionary = _state()
	TradeRunner.run(s)
	var moved: Dictionary = s["traded_this_year"]
	assert_int(moved.size()).override_failure_message(
		"아무도 안 옮겼다 — 검사가 아무것도 안 본다").is_greater(0)

	# 다시 돌려도 그 사람들은 안 움직인다
	var before: Dictionary = {}
	for id in moved:
		before[id] = _team_of(s, String(id))
	for i in 3:
		TradeRunner.run_league(s, "LEAGUE_KBL")
	for id in before:
		assert_str(_team_of(s, String(id))).override_failure_message(
			"%s가 한 해에 두 번 옮겼다" % id).is_equal(String(before[id]))


## ⚠ **정원을 넘기면 안 된다.** 번들 거래(하나 주고 둘 받기)가 **제안한
## 팀을 한 명 늘린다** — 정원에 딱 찬 팀은 그 거래를 못 한다.
##
## ⚠ **전 팀을 채우면 안 된다.** 그러면 애초에 성사되는 거래가 없어서
## 가드를 빼도 결과가 같다 — 한 팀만 채우고 나머지는 여유를 준다
func test_a_full_team_cannot_grow_by_a_bundle() -> void:
	var s: Dictionary = _state()
	var limit: int = RosterMaintenance.roster_max_of("LEAGUE_KBL")
	var full: String = String(World.teams_of("LEAGUE_KBL")[0]["id"])

	for tid in s["world"]["rosters"]:
		var roster: Array = s["world"]["rosters"][tid]
		var want: int = limit if tid == full else limit - 6
		while roster.size() < want:
			roster.append(_player("%s_X%d" % [tid, roster.size()],
				{"team_id": tid, "position": "1B"}))

	TradeRunner.run(s)
	for tid in s["world"]["rosters"]:
		assert_int(s["world"]["rosters"][tid].size()).override_failure_message(
			"%s가 %d명이다 (상한 %d)" % [tid, s["world"]["rosters"][tid].size(), limit]) \
			.is_less_equal(limit)


## ⚠ **실제로 성사되는 번들을 만들어야 가드가 걸린다.**
##
## 번들은 받는 쪽이 **둘 주고 하나 받는** 거래라 보통 거절당한다 — 그래서
## 앞의 검사들은 정원 가드를 한 번도 안 건드렸다. 성사되려면 세 가지가
## 겹쳐야 한다: 제안 팀이 리빌딩(압박 20) · 받는 팀이 승부수(압박 80) ·
## 내주는 유망주가 약하고(52) 받는 베테랑이 특급(90)
func test_a_bundle_that_would_break_the_cap_is_blocked() -> void:
	var limit: int = RosterMaintenance.roster_max_of("LEAGUE_KBL")
	var teams: Array = World.teams_of("LEAGUE_KBL")
	var full: String = String(teams[0]["id"])
	var other: String = String(teams[1]["id"])

	# 리빌딩 팀 — SP가 남고 정원이 꽉 찼다
	var a: Array = []
	for i in 4:
		a.append(_player("%s_SP%d" % [full, i], {"team_id": full, "position": "SP",
			"pitching": {"ovr": 90.0}, "age": 28, "pro_service_years": 8}))
	while a.size() < limit:
		a.append(_player("%s_X%d" % [full, a.size()],
			{"team_id": full, "position": "1B"}))

	# 승부수 팀 — SP가 모자라고 약한 유망주 둘이 있다
	var b: Array = [_player("%s_SP0" % other, {"team_id": other, "position": "SP"})]
	for i in 2:
		b.append(_player("%s_KID%d" % [other, i], {"team_id": other, "position": "2B",
			"player_type": "batter", "batting": {"ovr": 55.0},
			"age": 21, "pro_service_years": 0}))

	var world: Dictionary = {"rosters": {full: a, other: b}}
	TeamProfile.patch(world, full, {"win_now_pressure": 20.0})
	TeamProfile.patch(world, other, {"win_now_pressure": 80.0})
	var s: Dictionary = {"seed": 3, "season_year": 2027, "schedule": [],
		"world": world}

	# 이 거래는 받는 쪽이 **받아들인다** — 가드가 없으면 정원을 넘긴다
	assert_bool(Trade.accepts(
		[{"id": "k1", "ovr": 55.0, "age": 21, "service_years": 0,
			"position": "2B", "salary": 5000},
		 {"id": "k2", "ovr": 55.0, "age": 21, "service_years": 0,
			"position": "2B", "salary": 5000}],
		[{"id": "v", "ovr": 90.0, "age": 28, "service_years": 8,
			"position": "SP", "salary": 5000}],
		TeamProfile.of(world, other), 50000)).override_failure_message(
		"번들이 애초에 거절돼서 정원 가드를 시험 못 한다").is_true()

	TradeRunner.run_league(s, "LEAGUE_KBL")
	assert_int(s["world"]["rosters"][full].size()).override_failure_message(
		"%s가 %d명이다 (상한 %d) — 번들이 정원을 밀어 올렸다"
		% [full, s["world"]["rosters"][full].size(), limit]).is_less_equal(limit)


## ⚠ **받는 쪽도 정원을 넘길 수 있다.** 둘 주고 하나 받으면 받는 팀이
## 한 명 는다 — 한쪽만 보면 그 방향이 샌다
func test_the_receiving_side_is_checked_too() -> void:
	var limit: int = RosterMaintenance.roster_max_of("LEAGUE_KBL")
	# `_fits`를 직접 본다 — 어느 쪽이 차 있든 거절해야 한다
	var world: Dictionary = {"rosters": {}}
	world["rosters"][KBL_A] = []
	world["rosters"][KBL_B] = []
	for i in limit:
		world["rosters"][KBL_A].append(_player("A%d" % i))
	for i in limit - 5:
		world["rosters"][KBL_B].append(_player("B%d" % i, {"team_id": KBL_B}))

	# 제안한 팀(A)이 한 명 느는 거래 — A가 꽉 찼으니 안 된다
	assert_bool(TradeRunner._fits(world, KBL_A, KBL_B, "LEAGUE_KBL", 1)) \
		.override_failure_message("꽉 찬 팀이 한 명 더 받았다").is_false()
	# 받는 팀(B)이 한 명 느는 거래 — B는 여유가 있다
	assert_bool(TradeRunner._fits(world, KBL_A, KBL_B, "LEAGUE_KBL", -1)).is_true()

	# 반대로 B가 꽉 차면 그 방향이 막혀야 한다
	while world["rosters"][KBL_B].size() < limit:
		world["rosters"][KBL_B].append(
			_player("BX%d" % world["rosters"][KBL_B].size(), {"team_id": KBL_B}))
	assert_bool(TradeRunner._fits(world, KBL_A, KBL_B, "LEAGUE_KBL", -1)) \
		.override_failure_message("받는 쪽 정원을 안 봤다").is_false()
	# 1:1은 양쪽 다 안 늘어나므로 된다
	assert_bool(TradeRunner._fits(world, KBL_A, KBL_B, "LEAGUE_KBL", 0)).is_true()


## ⚠ **주인공은 세계가 못 옮긴다.** 사용자가 정할 일이다 —
## 자산 풀에서 빠지므로 제안에 아예 안 실린다
func test_the_protagonist_is_never_traded() -> void:
	var s: Dictionary = _state()
	var me: Dictionary = _player("ME", {"is_protagonist": true, "position": "SP"})
	s["world"]["rosters"][KBL_A].append(me)

	TradeRunner.run(s)
	assert_str(_team_of(s, "ME")).override_failure_message(
		"주인공이 트레이드됐다").is_equal(KBL_A)


## ⚠ **받는 쪽이 손해면 거절한다.** 판단을 안 물으면 무엇이든 성사되고
## 트레이드가 능력치 세탁이 된다
## ⚠ **한 방향만 나오는 제안으로 재야 한다.** 자리 남음/모자람은 양쪽이
## 서로 제안해서, 한쪽이 손해면 반대쪽이 이득이라 결국 성사된다 —
## 계약 만료 선점은 A만 낼 수 있어서 거절을 깨끗이 볼 수 있다
func test_a_lopsided_deal_is_refused() -> void:
	# A는 계약 만료 60짜리 하나뿐 · B는 85짜리 유망주 하나뿐
	var a: Array = [_player("A_EXP", {"position": "1B", "player_type": "batter",
		"batting": {"ovr": 60.0}, "contract_years": 1})]
	var b: Array = [_player("B_KID", {"team_id": KBL_B, "position": "1B",
		"player_type": "batter", "batting": {"ovr": 85.0},
		"pro_service_years": 0, "age": 21})]
	var s: Dictionary = {"seed": 3, "season_year": 2027, "schedule": [],
		"world": {"rosters": {KBL_A: a, KBL_B: b}}}

	var r: Dictionary = TradeRunner.run_league(s, "LEAGUE_KBL")
	assert_int(int(r["proposed"])).override_failure_message(
		"제안이 없어서 거절을 시험 못 한다").is_equal(1)
	assert_int(int(r["done"])).override_failure_message(
		"60짜리를 주고 85짜리 유망주를 받는 거래가 성사됐다").is_equal(0)


## ⚠ **옛 경력을 지우지 않는다.** 지우면 이적할 때마다 커리어가 초기화된다
func test_a_trade_keeps_the_old_career() -> void:
	var s: Dictionary = _pair_state()
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			p["career_events"] = [{"year": 2020, "type": "draft_picked"}]

	TradeRunner.run_league(s, "LEAGUE_KBL")

	var checked: int = 0
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			var kinds: Array = []
			for e in p.get("career_events", []):
				kinds.append(String(e["type"]))
			if not kinds.has("trade"):
				continue
			checked += 1
			assert_array(kinds).override_failure_message(
				"이적하면서 옛 경력이 날아갔다").is_equal(["draft_picked", "trade"])
	assert_int(checked).is_greater(0)


## ⚠ **해가 바뀌면 '올해 옮긴 사람'을 비운다.** 안 비우면 **둘째 해부터
## 거래가 0건**이 된다 — 작년에 옮긴 사람이 영영 막힌다
## ⚠ **작은 세계로 재야 한다.** 열 팀이면 다른 짝의 거래가 남아 있어서
## 목록을 안 비워도 `done > 0`이 나온다 — 두 팀이면 그 한 건이 전부다
## **목록 자체를 본다.** "둘째 해에 거래가 있나"로 재면 세계가 이미 정리돼
## 거래거리가 없을 때 헷갈린다 — 작년 사람이 목록에 남아 있는지가 핵심이다
func test_a_new_year_clears_the_moved_list() -> void:
	var s: Dictionary = _pair_state()
	TradeRunner.run(s)
	var first: Array = s["traded_this_year"].keys()
	assert_int(first.size()).override_failure_message(
		"첫해에 아무도 안 옮겨서 시험이 안 된다").is_greater(0)

	s["season_year"] = 2028
	TradeRunner.run(s)
	for id in first:
		assert_bool(s["traded_this_year"].has(id)).override_failure_message(
			"%s가 작년 목록에 남았다 — 해가 바뀌어도 안 비웠다" % id).is_false()


## ⚠ **프로 리그를 전부 돈다.** 국내만 돌면 해외 거래가 영영 없다
func test_every_pro_league_trades() -> void:
	var s: Dictionary = _state()
	# JBL 팀 둘에도 맞바꿀 거리를 둔다
	var jbl: Array = World.teams_of("LEAGUE_JBL")
	for t in jbl.size():
		var tid: String = String(jbl[t]["id"])
		var many: String = "SP" if t % 2 == 0 else "C"
		var few: String = "C" if t % 2 == 0 else "SP"
		var roster: Array = []
		for i in 4:
			roster.append(_player("%s_%s%d" % [tid, many, i], {"team_id": tid,
				"league_id": "LEAGUE_JBL", "position": many,
				"player_type": "pitcher" if many == "SP" else "batter",
				"pitching": {"ovr": 62.0 + float(i)},
				"batting": {"ovr": 62.0 + float(i)}}))
		roster.append(_player("%s_%s0" % [tid, few], {"team_id": tid,
			"league_id": "LEAGUE_JBL", "position": few,
			"player_type": "pitcher" if few == "SP" else "batter",
			"pitching": {"ovr": 66.0}, "batting": {"ovr": 66.0}}))
		s["world"]["rosters"][tid] = roster

	TradeRunner.run(s)
	var jbl_trades: int = 0
	for t in jbl:
		for p in World.roster_of(s["world"], String(t["id"])):
			for e in p.get("career_events", []):
				if String(e["type"]) == "trade":
					jbl_trades += 1
	assert_int(jbl_trades).override_failure_message(
		"JBL에서 거래가 한 건도 없다 — 국내만 돌았다").is_greater(0)


## ⚠ **한 번에 리그를 통째로 갈아엎지 않는다.** 상한이 없으면 제안이 나오는
## 대로 다 성사되어 로스터가 하루에 통째로 바뀐다
func test_a_league_has_a_trade_limit() -> void:
	var s: Dictionary = _state()
	var r: Dictionary = TradeRunner.run_league(s, "LEAGUE_KBL")
	assert_int(int(r["proposed"])).override_failure_message(
		"제안이 %s건뿐이라 상한을 시험 못 한다" % r["proposed"]).is_greater(20)
	assert_int(int(r["done"])).override_failure_message(
		"%s건이 성사됐다 — 상한 5를 안 걸었다" % r["done"]).is_equal(5)


## ⚠ **이득이 큰 제안부터 본다.** 순서가 뒤집히면 상한 5개가 **잡거래로
## 채워지고** 정작 좋은 거래가 밀린다
func test_the_best_deals_go_first() -> void:
	var s: Dictionary = _state()
	# 성사된 다섯 건이 전체 제안 중 상위 점수여야 한다
	var all: Array = []
	var teams: Array = World.teams_of("LEAGUE_KBL")
	for i in teams.size():
		for j in range(i + 1, teams.size()):
			var a_id: String = String(teams[i]["id"])
			var b_id: String = String(teams[j]["id"])
			var a: Dictionary = {"team_id": a_id, "win_now_pressure": 50.0}
			var b: Dictionary = {"team_id": b_id, "win_now_pressure": 50.0}
			all.append_array(Trade.between(a, b,
				TradeRunner.assets_of(World.roster_of(s["world"], a_id)),
				TradeRunner.assets_of(World.roster_of(s["world"], b_id)),
				"neutral", "neutral"))
	all.sort_custom(func(x, y) -> bool: return x["score"] > y["score"])
	var best: float = float(all[0]["score"])
	var worst: float = float(all[all.size() - 1]["score"])
	assert_float(best).override_failure_message(
		"제안 점수가 다 같아서 순서를 시험 못 한다").is_greater(worst)

	TradeRunner.run_league(s, "LEAGUE_KBL")
	var moved: Dictionary = s["traded_this_year"]
	# 제일 좋은 제안에 낀 선수는 반드시 움직였다
	var top_ids: Array = all[0]["offering_ids"] + all[0]["requesting_ids"]
	var hit: bool = false
	for id in top_ids:
		if moved.has(String(id)):
			hit = true
	assert_bool(hit).override_failure_message(
		"제일 좋은 거래가 밀렸다 — 약한 제안부터 봤다").is_true()


func test_an_empty_world_is_a_no_op() -> void:
	assert_int(int(TradeRunner.run({})["done"])).is_equal(0)


## 팀이 하나뿐인 리그는 거래가 없다 — 상대가 없다
func test_one_team_cannot_trade() -> void:
	var s: Dictionary = _pair_state()
	s["world"]["rosters"].erase(KBL_B)
	assert_int(int(TradeRunner.run_league(s, "LEAGUE_KBL")["done"])).is_equal(0)


## ⚠ **연봉은 자산에 실리는 것으로 본다.** 수락 판정으로 재려 했더니
## 02의 연봉 부담 항이 능력치에 비해 너무 약해서(OVR 97 대 부담 2.8) 결과가
## 안 갈렸다 — 값이 실리는지는 `test_an_asset_carries_what_the_judgements_read`가
## 보고, 부담이 값을 깎는지는 `trade_test`의 `salary_drags_the_value_down`이 본다


## ⚠ **계약 연수를 안 실으면 전원이 만료자가 된다.** 계약 만료 선점이
## 리그 전체에 걸려 특급이 매년 유망주와 교환된다
func test_only_expiring_players_are_shopped_as_expiring() -> void:
	var s: Dictionary = _state()
	TradeRunner.run(s)

	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			for e in p.get("career_events", []):
				if String(e.get("type", "")) != "trade":
					continue
				# 계약이 3년 남은 사람이 만료 선점으로 오갈 수는 없다.
				# **오간 사람 중 계약 3년짜리 특급(86)이 있으면 안 된다**
				if float(p.get("batting", {}).get("ovr", 0.0)) >= 86.0:
					assert_int(int(p.get("contract_years", 99))) \
						.override_failure_message(
							"계약이 남은 특급이 만료 선점으로 오갔다") \
						.is_less_equal(1)


# ── 기록에 남나 (G-6) ─────────────────────────────────────────

## 🔴 **누가 어디로 갔는지 남는다.** 개수만 반환하면 자동 진행을 돌려도
## "이적 3건"까지만 보이고 누구인지 알 길이 없다.
## ⚠ **`run`을 부른다** — 기록은 리그마다 모아서 `run`이 남긴다
func test_a_trade_is_written_to_the_log() -> void:
	EventLog.clear()
	var s: Dictionary = _pair_state()
	TradeRunner.run(s)

	assert_int(EventLog.count_of("trade")).override_failure_message(
		"이적이 기록에 없다").is_greater(0)

	var ev: Dictionary = {}
	for e in EventLog.all():
		if String(e["type"]) == "trade":
			ev = e
			break
	# 🔴 **양방향이다.** `players[0]`만 보면 **받아온 선수가 기록에서 빠져도**
	# 통과한다 — 실제로 그 변이를 놓쳤다. 옮긴 사람 수와 맞춘다
	var total: int = 0
	for e in EventLog.all():
		if String(e["type"]) == "trade":
			total += e["players"].size()
	assert_int(total).override_failure_message(
		"한쪽 방향만 기록됐다 — 트레이드는 양쪽이 오간다").is_greater(1)
	var who: Dictionary = ev["players"][0]
	assert_str(String(who["name"])).override_failure_message(
		"이름이 비었다 — id만 남으면 화면에서 못 읽는다").is_not_empty()
	assert_str(String(who["from_team"])).is_not_empty()
	assert_str(String(who["to_team"])).override_failure_message(
		"간 팀이 안 적혔다").is_not_empty()
	assert_str(String(who["from_team"])).override_failure_message(
		"떠난 팀과 간 팀이 같다").is_not_equal(String(who["to_team"]))
	# 02는 detail을 "OVR:75 SP 28세" 꼴로 쓴다
	assert_str(String(who["detail"])).override_failure_message(
		"능력을 안 적었다 — 큰 이적인지 아닌지 모른다").contains("OVR")


## ⚠ **아무 이적도 없으면 안 적는다** — 시즌마다 도는 자리다.
## ⚠ `_state()`로는 못 본다 — 그 판은 이적이 성사된다. **로스터가 없는 판**을 쓴다
func test_no_trade_writes_nothing() -> void:
	EventLog.clear()
	TradeRunner.run({"season_year": 2030, "world": {"rosters": {}}})
	assert_int(EventLog.count_of("trade")).override_failure_message(
		"이적이 없는데 기록이 남았다").is_equal(0)
