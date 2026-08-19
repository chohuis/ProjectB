extends GdUnitTestSuite

## NPC 드래프트 실행 — M9-3.
##
## 원본: `npc_sim.rs`의 `run_draft` · `calc_draft_score` · `scout_bias`
##
## ⚠ **`Draft`와 다른 일을 한다.** 저쪽은 주인공 한 명이 몇 라운드인지를
## 실측 앵커로 판정하고, 여기는 후보 수백 명을 순번에 앉힌다.


func _c(id: String, ovr: float, age: int = 19, dev: float = 60.0) -> Dictionary:
	# ⚠ **실제 후보엔 이름과 포지션이 있다**(`player_gen`이 만든다).
	# fixture가 빠뜨리면 기록 검사가 "이름이 비었다"로 걸린다 —
	# 이번 회차에 라이벌·병역에 이어 **세 번째**다
	return {"id": id, "name": "후보%s" % id, "position": "SP",
		"age": age, "development_rate": dev,
		"player_type": "pitcher", "pitching": {"ovr": ovr}, "batting": {"ovr": 0.0},
		"league_id": Promotion.DRAFT_POOL, "team_id": "", "career_events": []}


func _teams(n: int = 10) -> Array:
	var out: Array = []
	for i in n:
		out.append("TEAM_%d" % i)
	return out


func _pool(n: int) -> Array:
	var out: Array = []
	for i in n:
		# OVR을 고르게 흩는다 — 40~85
		# ⚠ **점수가 겹치면 순서 검사가 헛돈다.** 같은 OVR이 여럿이면 어떤
		# 순서로 뽑아도 결과가 비슷해 보인다 — 실제로 변이가 안 잡혔다
		out.append(_c("N%03d" % i, 40.0 + float(i) * 45.0 / float(maxi(n - 1, 1)),
			19 + (i % 5)))
	return out


# ── 점수 ──────────────────────────────────────────────────────

func test_a_better_player_scores_higher() -> void:
	assert_float(NpcDraft.score_of(_c("A", 80.0))) \
		.is_greater(NpcDraft.score_of(_c("B", 60.0)))


## ⚠ **어린 선수에 프리미엄이 붙는다.** 없으면 대학 얼리(고OVR)가 보드를
## 채우고 19세 고졸은 경쟁이 안 됐다 — 실측에서 보드 220명 중 고졸이
## 5명까지 줄었고, 그게 주인공의 기본 경로다
func test_youth_is_worth_something() -> void:
	assert_float(NpcDraft.score_of(_c("A", 60.0, 19))) \
		.is_greater(NpcDraft.score_of(_c("B", 60.0, 24)))


## ⚠ **프리미엄이 능력치를 뒤집으면 안 된다.** +26까지 올렸더니
## OVR 55(19세)가 1순위, OVR 82(26세)가 미지명이 됐다
func test_youth_does_not_beat_a_big_gap_in_ability() -> void:
	assert_float(NpcDraft.score_of(_c("young", 55.0, 19))).override_failure_message(
		"19세 OVR 55가 26세 OVR 82를 이긴다 — 업사이드가 능력치를 덮는다") \
		.is_less(NpcDraft.score_of(_c("old", 82.0, 26)))


## 나이 프리미엄에 바닥이 있다 — 안 그러면 노장이 무한히 깎인다
func test_the_youth_penalty_has_a_floor() -> void:
	assert_float(NpcDraft.score_of(_c("A", 60.0, 40))) \
		.is_equal(NpcDraft.score_of(_c("B", 60.0, 30)))


func test_development_rate_counts() -> void:
	assert_float(NpcDraft.score_of(_c("A", 60.0, 19, 90.0))) \
		.is_greater(NpcDraft.score_of(_c("B", 60.0, 19, 50.0)))


# ── 스카우트 편차 ─────────────────────────────────────────────

## ⚠ **없으면 상위 110명이 매년 그대로 지명되고 111위 아래는 보드에
## 뜨기만 하고 영영 안 뽑힌다**
func test_the_bias_is_not_zero() -> void:
	var any: bool = false
	for i in 20:
		if absf(NpcDraft.scout_bias("N%03d" % i, 2027)) > 0.5:
			any = true
	assert_bool(any).is_true()


## ⚠ **끝 글자만 다른 id가 같은 편차를 받으면 안 된다.** 02가 그 결함을
## 겪었다 — `N000`~`N005` 여섯이 모두 −3.93이었다
func test_neighbouring_ids_get_different_biases() -> void:
	var seen: Array = []
	for i in 6:
		var b: float = NpcDraft.scout_bias("N%03d" % i, 2027)
		for s in seen:
			assert_float(absf(b - float(s))).override_failure_message(
				"이웃한 id가 같은 편차를 받는다: %.4f" % b).is_greater(0.01)
		seen.append(b)


## 같은 해·같은 선수면 늘 같다 — 재현이 무너지면 조사가 안 된다
func test_the_bias_is_stable() -> void:
	assert_float(NpcDraft.scout_bias("N001", 2027)) \
		.is_equal(NpcDraft.scout_bias("N001", 2027))


func test_the_bias_changes_by_year() -> void:
	assert_float(NpcDraft.scout_bias("N001", 2027)) \
		.is_not_equal(NpcDraft.scout_bias("N001", 2028))


## 편차가 한쪽으로 쏠리면 안 된다 — 평균이 0 언저리여야 한다
func test_the_bias_is_centred() -> void:
	var sum: float = 0.0
	for i in 400:
		sum += NpcDraft.scout_bias("N%03d" % i, 2027)
	assert_float(absf(sum / 400.0)).override_failure_message(
		"편차 평균이 %.3f다" % (sum / 400.0)).is_less(0.6)


# ── 지명 ──────────────────────────────────────────────────────

func test_it_fills_every_slot() -> void:
	var out: Dictionary = NpcDraft.run(_pool(600), _teams(10), 2027)
	assert_int(out["picks"].size()).is_equal(110)


## 라운드·순번이 순서대로 매겨진다
func test_the_picks_are_numbered_in_order() -> void:
	var picks: Array = NpcDraft.run(_pool(600), _teams(10), 2027)["picks"]
	for i in picks.size():
		assert_int(int(picks[i]["pick"])).is_equal(i + 1)
	assert_int(int(picks[0]["round"])).is_equal(1)
	assert_int(int(picks[10]["round"])).is_equal(2)


## ⚠ **한 선수가 두 번 뽑히면 안 된다**
func test_nobody_is_picked_twice() -> void:
	var seen: Dictionary = {}
	for p in NpcDraft.run(_pool(600), _teams(10), 2027)["picks"]:
		assert_bool(seen.has(p["npc_id"])).override_failure_message(
			"%s가 두 번 뽑혔다" % p["npc_id"]).is_false()
		seen[p["npc_id"]] = true


## 팀마다 라운드당 하나씩
func test_each_team_picks_once_per_round() -> void:
	var picks: Array = NpcDraft.run(_pool(600), _teams(10), 2027)["picks"]
	var count: Dictionary = {}
	for p in picks:
		count[p["team_id"]] = int(count.get(p["team_id"], 0)) + 1
	for t in _teams(10):
		assert_int(int(count[t])).is_equal(11)


## ⚠ **보드를 지명 수의 두 배로 좁힌다.** 후보 전원에서 뽑으면 점수 가중이
## 의미를 잃어 **최고 유망주가 지명될 확률이 약 9%**였다
func test_the_board_is_narrowed() -> void:
	var out: Dictionary = NpcDraft.run(_pool(1600), _teams(10), 2027)
	assert_int(out["board"].size()).is_equal(220)


func test_a_small_pool_uses_everyone() -> void:
	var out: Dictionary = NpcDraft.run(_pool(50), _teams(10), 2027)
	assert_int(out["board"].size()).is_equal(50)
	assert_int(out["picks"].size()).is_equal(50)
	assert_array(out["undrafted_ids"]).is_empty()


func test_the_leftovers_are_undrafted() -> void:
	var out: Dictionary = NpcDraft.run(_pool(600), _teams(10), 2027)
	assert_int(out["undrafted_ids"].size()).is_equal(600 - 110)


## ⚠ **최고점이 뽑혀야 한다.** 예전엔 점수 비례 추첨이라 최상위도 30%쯤
## 미지명으로 샜다 — 실측에서 OVR 82가 미지명이고 OVR 72가 지명됐다
func test_the_best_prospect_gets_drafted() -> void:
	var pool: Array = _pool(600)
	pool.append(_c("STAR", 95.0, 19, 95.0))
	var out: Dictionary = NpcDraft.run(pool, _teams(10), 2027)
	assert_array(out["undrafted_ids"]).override_failure_message(
		"최고 유망주가 미지명이다").not_contains(["STAR"])


## 좋은 선수가 앞 라운드에 몰려야 한다 — 라운드가 평평하면 순서가 없는 것이다
func test_early_rounds_take_better_players() -> void:
	var pool: Array = _pool(600)
	var by_id: Dictionary = {}
	for c in pool:
		by_id[c["id"]] = c

	var sums: Dictionary = {}
	var counts: Dictionary = {}
	for p in NpcDraft.run(pool, _teams(10), 2027)["picks"]:
		var r: int = int(p["round"])
		sums[r] = float(sums.get(r, 0.0)) + Offseason.core_ovr(by_id[p["npc_id"]])
		counts[r] = int(counts.get(r, 0)) + 1

	var first: float = float(sums[1]) / float(counts[1])
	var last: float = float(sums[11]) / float(counts[11])
	assert_float(first).override_failure_message(
		"1R 평균 %.1f · 11R 평균 %.1f — 라운드가 평평하다" % [first, last]) \
		.is_greater(last + 3.0)


## 같은 세계를 다시 열면 같은 결과다
func test_the_draft_is_reproducible() -> void:
	var a: Array = NpcDraft.run(_pool(600), _teams(10), 2027)["picks"]
	var b: Array = NpcDraft.run(_pool(600), _teams(10), 2027)["picks"]
	assert_array(a).is_equal(b)


func test_a_different_year_gives_a_different_draft() -> void:
	assert_array(NpcDraft.run(_pool(600), _teams(10), 2027)["picks"]) \
		.is_not_equal(NpcDraft.run(_pool(600), _teams(10), 2028)["picks"])


func test_an_empty_pool_does_not_break() -> void:
	var out: Dictionary = NpcDraft.run([], _teams(10), 2027)
	assert_array(out["picks"]).is_empty()


func test_no_teams_means_no_draft() -> void:
	var out: Dictionary = NpcDraft.run(_pool(50), [], 2027)
	assert_array(out["picks"]).is_empty()
	assert_int(out["undrafted_ids"].size()).is_equal(50)


# ── 적용 ──────────────────────────────────────────────────────

func test_applying_moves_the_player_to_his_team() -> void:
	var pool: Array = _pool(50)
	var by_id: Dictionary = {}
	for c in pool:
		by_id[c["id"]] = c

	var out: Dictionary = NpcDraft.run(pool, _teams(10), 2027)
	var n: int = NpcDraft.apply(out["picks"], by_id,
		{"TEAM_0": "LEAGUE_KBL", "TEAM_1": "LEAGUE_KBL"}, 2027)
	assert_int(n).is_equal(out["picks"].size())

	var first: Dictionary = by_id[out["picks"][0]["npc_id"]]
	assert_str(first["team_id"]).is_equal("TEAM_0")
	assert_str(first["league_id"]).is_equal("LEAGUE_KBL")
	assert_int(int(first["draft_round"])).is_equal(1)


## ⚠ **지명이 경력 사건으로 남아야 한다.** 안 남기면 경력 화면에 드래프트가
## 안 뜨고, 사건 집계로 세대교체를 볼 수도 없다
func test_a_pick_leaves_a_career_event() -> void:
	var pool: Array = _pool(50)
	var by_id: Dictionary = {}
	for c in pool:
		by_id[c["id"]] = c

	var out: Dictionary = NpcDraft.run(pool, _teams(10), 2027)
	NpcDraft.apply(out["picks"], by_id, {"TEAM_0": "LEAGUE_KBL"}, 2027)
	var e: Dictionary = by_id[out["picks"][0]["npc_id"]]["career_events"][0]
	assert_str(e["type"]).is_equal("drafted")
	assert_str(e["detail"]).contains("1라운드")
	# 어디서 왔는지도 남는다
	assert_str(e["from_league_id"]).is_equal(Promotion.DRAFT_POOL)


func test_applying_an_unknown_id_is_skipped() -> void:
	assert_int(NpcDraft.apply([{"round": 1, "pick": 1, "team_id": "T",
		"npc_id": "GHOST"}], {}, {}, 2027)).is_equal(0)


# ── 흔들림이 실제로 순서를 바꾸는가 ───────────────────────────

## 순수 점수 순위 — **편차 없이**
func _rank_by_score(pool: Array) -> Array:
	var ids: Array = []
	var by_id: Dictionary = {}
	for c in pool:
		ids.append(c["id"])
		by_id[c["id"]] = NpcDraft.score_of(c)
	ids.sort_custom(func(a, b) -> bool: return float(by_id[a]) > float(by_id[b]))
	return ids


## 엔진이 실제로 쓰는 순위 — **편차 포함.** 노이즈가 순서를 얼마나
## 흔드는지는 이것과 비교해야 보인다
func _rank_with_bias(pool: Array, year: int) -> Array:
	var ids: Array = []
	var by_id: Dictionary = {}
	for c in pool:
		ids.append(c["id"])
		by_id[c["id"]] = NpcDraft.score_of(c) + NpcDraft.scout_bias(c["id"], year)
	ids.sort_custom(func(a, b) -> bool: return float(by_id[a]) > float(by_id[b]))
	return ids


## ⚠ **지명 순서가 평가 순서 그대로면 안 된다.** 그러면 매 순번에서
## 흔들림이 아무 일도 안 하는 것이고, 구단 사정이 다르다는 게 사라진다
func test_the_noise_actually_shuffles_the_order() -> void:
	var pool: Array = _pool(600)
	var want: Array = _rank_with_bias(pool, 2027).slice(0, 110)

	var got: Array = []
	for p in NpcDraft.run(pool, _teams(10), 2027)["picks"]:
		got.append(p["npc_id"])

	assert_array(got).override_failure_message(
		"지명 순서가 평가 순서 그대로다 — 흔들림이 순서를 안 바꾼다") \
		.is_not_equal(want)


## ⚠ **라운드가 깊을수록 평가가 갈린다.** 노이즈가 안 커지면 뒤 라운드도
## 평가순 그대로라 구단 사정이 안 드러난다
func test_later_rounds_scatter_more() -> void:
	var pool: Array = _pool(600)
	var rank: Dictionary = {}
	var ordered: Array = _rank_with_bias(pool, 2027)
	for i in ordered.size():
		rank[ordered[i]] = i

	var picks: Array = NpcDraft.run(pool, _teams(10), 2027)["picks"]
	var off: Dictionary = {}
	for i in picks.size():
		var r: int = int(picks[i]["round"])
		# 평가 순위와 실제 지명 순번이 얼마나 벌어졌나
		off[r] = float(off.get(r, 0.0)) + absf(float(int(rank[picks[i]["npc_id"]]) - i))

	var early: float = float(off[1]) / 10.0
	var late: float = float(off[11]) / 10.0
	assert_float(late).override_failure_message(
		"1R 어긋남 %.1f · 11R 어긋남 %.1f — 라운드가 깊어져도 안 갈린다" % [early, late]) \
		.is_greater(early)


## ⚠ **상한이 없으면 뒤 라운드가 순수 난수가 된다.** 보드 전체에 흩어지면
## 능력치를 못 읽는다 — 실측에서 라운드별 OVR이 평평했다
func test_the_scatter_has_a_limit() -> void:
	var pool: Array = _pool(600)
	var rank: Dictionary = {}
	var ordered: Array = _rank_with_bias(pool, 2027)
	for i in ordered.size():
		rank[ordered[i]] = i

	var worst: int = 0
	for p in NpcDraft.run(pool, _teams(10), 2027)["picks"]:
		if int(p["round"]) <= 3:
			worst = maxi(worst, int(rank[p["npc_id"]]))
	assert_int(worst).override_failure_message(
		"3R까지의 지명자에 평가 %d위가 있다 — 흔들림이 신호를 덮는다" % worst) \
		.is_less(60)


## ⚠ **편차가 지명에 실제로 걸려야 한다.** 함수만 맞고 안 쓰면 보드가
## 순수 점수순이 되고, 그러면 111위 아래는 보드에 뜨기만 하고 영영 안 뽑힌다
func test_the_bias_reaches_the_draft() -> void:
	var pool: Array = _pool(600)
	var plain: Array = _rank_by_score(pool).slice(0, 220)
	var board: Array = NpcDraft.run(pool, _teams(10), 2027)["board"]
	assert_array(board).override_failure_message(
		"보드가 편차 없는 점수 순서 그대로다 — 편차가 안 걸렸다") \
		.is_not_equal(plain)


## ⚠ **가운데가 두꺼운 분포다.** 균등분포면 큰 편차가 흔해져서 신호를 덮는다
func test_the_bias_is_bell_shaped() -> void:
	var sum_sq: float = 0.0
	var n: int = 800
	for i in n:
		var b: float = NpcDraft.scout_bias("N%04d" % i, 2027)
		sum_sq += b * b
	var sd: float = sqrt(sum_sq / float(n))
	# 두 균등합이면 magnitude/√6 ≈ 1.63 · 한 번만 뽑으면 magnitude/√3 ≈ 2.31
	assert_float(sd).override_failure_message(
		"편차 표준편차가 %.2f다 — 가운데가 두꺼운 분포가 아니다" % sd) \
		.is_between(1.3, 2.0)


## ⚠ **키가 없는 후보에게도 사건이 붙어야 한다.** `get`이 돌려준 빈 배열은
## 선수 사전에 안 달려 있다
func test_a_candidate_without_events_still_gets_one() -> void:
	var c: Dictionary = {"id": "N1", "age": 19, "development_rate": 60.0,
		"player_type": "pitcher", "pitching": {"ovr": 70.0},
		"league_id": Promotion.DRAFT_POOL}
	NpcDraft.apply([{"round": 1, "pick": 1, "team_id": "T", "npc_id": "N1"}],
		{"N1": c}, {"T": "LEAGUE_KBL"}, 2027)
	assert_bool(c.has("career_events")).override_failure_message(
		"경력 사건이 아예 안 달렸다").is_true()
	assert_int(c["career_events"].size()).is_equal(1)


# ── 기록에 남나 (G-6) ─────────────────────────────────────────

## 🔴 **누가 어디로 지명됐는지 남는다.** 개수만 반환하면 자동 진행을
## 돌려도 "지명 110건"까지만 보이고 누구인지 알 길이 없다
func test_a_draft_pick_is_written_to_the_log() -> void:
	var pool: Array = _pool(50)
	var by_id: Dictionary = {}
	for c in pool:
		by_id[c["id"]] = c
	var out: Dictionary = NpcDraft.run(pool, _teams(10), 2027)
	var league_of: Dictionary = {}
	for t in _teams(10):
		league_of[t] = "LEAGUE_KBL"

	var picked: Array = []
	NpcDraft.apply(out["picks"], by_id, league_of, 2027, picked)

	assert_int(picked.size()).override_failure_message(
		"지명이 한 줄도 안 담겼다").is_greater(0)
	var who: Dictionary = picked[0]
	assert_str(String(who["name"])).override_failure_message(
		"이름이 비었다").is_not_empty()
	assert_str(String(who["to_team"])).override_failure_message(
		"간 팀이 안 적혔다").is_not_empty()
	# 02는 라운드·순위를 적는다 — 1라운드와 8라운드는 다른 일이다
	assert_str(String(who["detail"])).override_failure_message(
		"라운드·순위가 없다: %s" % who["detail"]).contains("라운드")
	assert_str(String(who["detail"])).contains("순위")
	assert_str(String(who["detail"])).contains("OVR")


## ⚠ **지명 전 리그를 적는다.** `league_id`를 덮어쓴 뒤에 읽으면
## from과 to가 같아져 "고교에서 프로로 갔다"가 안 보인다
func test_the_draft_keeps_the_league_he_came_from() -> void:
	var pool: Array = _pool(50)
	var by_id: Dictionary = {}
	for c in pool:
		by_id[c["id"]] = c
	var out: Dictionary = NpcDraft.run(pool, _teams(10), 2027)
	var league_of: Dictionary = {}
	for t in _teams(10):
		league_of[t] = "LEAGUE_KBL"

	var picked: Array = []
	NpcDraft.apply(out["picks"], by_id, league_of, 2027, picked)
	var who: Dictionary = picked[0]
	assert_str(String(who["to_league"])).is_equal("LEAGUE_KBL")
	assert_str(String(who["from_league"])).override_failure_message(
		"떠난 리그와 간 리그가 같다 — 덮어쓴 뒤에 읽었다") \
		.is_not_equal(String(who["to_league"]))
