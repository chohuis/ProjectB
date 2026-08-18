extends GdUnitTestSuite

## 고교 유망주 월간 TOP 10 — 02 `top10Engine.ts`. **04엔 통째로 없었다.**
##
## 02는 고교 시절 **4주마다** 랭킹을 소식으로 보내고, 그 순위가 인기·스카우트
## 점수·사기에 **실제로 닿는다**(`rankEffect`). 04는 고교 3년 내내 자기
## 위치를 알 방법이 없었고 그 효과도 없었다.
##
## ⚠ **02는 본문에 아무것도 안 담는다**(`body: subject`) — 내용이 전부
## `metadata`에 있어 `ProspectTop10Panel`이 없으면 빈 소식이다.
## 04는 본문 상세가 생겼으니 **본문에 명단을 적는다**.


func _me(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"id": "ME", "name": "김한결", "is_protagonist": true,
		"career_stage": "highschool", "grade": 3, "team_id": "TEAM_HS_AEWOL",
		"league_id": "LEAGUE_HIGHSCHOOL", "player_type": "pitcher",
		"pitching": {"ovr": 70.0}, "scout_score": 50.0,
		"popularity": 0.0, "morale": 50.0, "injury": null}
	d.merge(o, true)
	return d


func _npc(i: int, ovr: float, grade: int = 3) -> Dictionary:
	return {"id": "N%d" % i, "name": "선수%02d" % i, "grade": grade,
		"career_stage": "highschool", "league_id": "LEAGUE_HIGHSCHOOL",
		"player_type": "pitcher", "pitching": {"ovr": ovr},
		"scout_score": 40.0}


func _state(n: int, me: Dictionary = {}, week: int = 8) -> Dictionary:
	var rosters: Dictionary = {}
	for i in n:
		rosters["T%d" % i] = [_npc(i, 40.0 + float(i))]
	return {
		"day": (week - 1) * Calendar.DAYS_PER_WEEK + 1,
		"season_year": 2027, "season_days": Calendar.DAYS_PER_SEASON,
		"protagonist": _me(me), "mailbox": [], "season_stats": {},
		"world": {"rosters": rosters},
	}


# ── 02 산식 ───────────────────────────────────────────────────────

## 성적이 없으면 `ovr * 0.80 + 스카우트 * 0.20` — 02 `calcProspectScore`
func test_성적이_없으면_능력치와_스카우트뿐이다() -> void:
	assert_float(ProspectTop10.score_of(_me())) \
		.is_equal_approx(70.0 * 0.8 + 50.0 * 0.2, 0.01)


## ⚠ **표본이 적으면 성적 무게가 0이다.** 한 경기 던지고 방어율 0이라고
## 1위가 되면 안 된다 — 02가 `ip < 10 → 0`으로 막는다
func test_표본이_적으면_성적을_안_본다() -> void:
	var small: float = ProspectTop10.score_of(_me(),
		{"type": "pitcher", "ip": 5.0, "era": 0.0, "k": 20.0})
	assert_float(small).override_failure_message(
		"5이닝짜리 성적이 점수를 흔들었다") \
		.is_equal_approx(ProspectTop10.score_of(_me()), 0.01)


## 표본이 쌓이면 무게가 0.15 → 0.30
func test_표본이_쌓이면_성적이_무거워진다() -> void:
	var base: float = ProspectTop10.score_of(_me())
	var mid: float = ProspectTop10.score_of(_me(),
		{"type": "pitcher", "ip": 20.0, "era": 1.0, "k": 30.0})
	var full: float = ProspectTop10.score_of(_me(),
		{"type": "pitcher", "ip": 40.0, "era": 1.0, "k": 60.0})
	# ⚠ `is_not_equal_approx`는 GdUnit4에 없다 — 차이를 직접 잰다
	assert_float(absf(mid - base)).override_failure_message(
		"20이닝이 점수를 안 바꿨다").is_greater(0.01)
	assert_float(absf(full - base)).override_failure_message(
		"40이닝이 20이닝보다 덜 움직였다").is_greater(absf(mid - base))


## ⚠ **무게 합이 1이다.** OVR 쪽에서 덜어 성적에 준다 — 안 그러면
## 성적이 쌓일수록 점수가 통째로 부푼다
func test_무게_합이_1이다() -> void:
	# 모든 축이 **만점**이면 어떤 표본에서도 점수가 100이어야 한다.
	#
	# ⚠ **성적도 만점이어야 한다.** 처음에 `ip 20 · k 100`을 줬는데
	# K/9가 90에서 걸려(만점은 `k/ip >= 5.56`) 99.4가 나왔다 — 산식이
	# 아니라 내 픽스처가 틀렸다
	var p: Dictionary = _me({"pitching": {"ovr": 100.0}, "scout_score": 100.0})
	for st in [{}, {"type": "pitcher", "ip": 20.0, "era": 0.0, "k": 200.0},
			{"type": "pitcher", "ip": 40.0, "era": 0.0, "k": 400.0}]:
		assert_float(ProspectTop10.score_of(p, st)).override_failure_message(
			"모든 축이 100인데 점수가 100이 아니다 — 무게 합이 1이 아니다") \
			.is_equal_approx(100.0, 0.01)


## 02 `rankEffect` 그대로
func test_순위_효과가_02_그대로다() -> void:
	assert_float(ProspectTop10.rank_effect(1)["popularity"]).is_equal_approx(10.0, 0.01)
	assert_float(ProspectTop10.rank_effect(3)["popularity"]).is_equal_approx(7.0, 0.01)
	assert_float(ProspectTop10.rank_effect(5)["popularity"]).is_equal_approx(5.0, 0.01)
	assert_float(ProspectTop10.rank_effect(10)["popularity"]).is_equal_approx(3.0, 0.01)
	assert_float(ProspectTop10.rank_effect(11)["popularity"]).is_equal_approx(0.0, 0.01)
	assert_float(ProspectTop10.rank_effect(1)["scout_score"]).is_equal_approx(5.0, 0.01)
	assert_float(ProspectTop10.rank_effect(1)["morale"]).is_equal_approx(5.0, 0.01)


# ── 명단 ──────────────────────────────────────────────────────────

func test_열_명까지다() -> void:
	assert_int(ProspectTop10.ranking(_state(40)).size()).is_equal(10)


## ⚠ **주인공을 같이 세운다.** 안 세우면 내 순위가 안 나와 효과가 영영 0이다
func test_주인공이_명단에_선다() -> void:
	var rows: Array = ProspectTop10.ranking(_state(5))
	assert_int(ProspectTop10.my_rank(rows)).override_failure_message(
		"주인공이 명단에 없다 — 효과가 영영 0이다").is_greater(0)


## 못 들면 0 — 그때 효과도 0이다
func test_못_들면_0이다() -> void:
	var s: Dictionary = _state(0)
	for i in 30:
		s["world"]["rosters"]["T%d" % i] = [_npc(i, 95.0)]
	assert_int(ProspectTop10.my_rank(ProspectTop10.ranking(s))) \
		.override_failure_message("OVR 70이 95짜리 30명을 제쳤다").is_equal(0)


## ⚠ **같은 종류끼리만 겨룬다** — 02도 투수는 투수끼리다
func test_타자는_투수_명단에_없다() -> void:
	var s: Dictionary = _state(0)
	for i in 12:
		var q: Dictionary = _npc(i, 99.0)
		q["player_type"] = "batter"
		s["world"]["rosters"]["T%d" % i] = [q]
	for r in ProspectTop10.ranking(s):
		assert_bool(String(r["id"]).begins_with("N")).override_failure_message(
			"타자가 투수 유망주 명단에 들어왔다").is_false()


## 고교가 아닌 선수는 안 센다
func test_고교_밖은_안_센다() -> void:
	var s: Dictionary = _state(0)
	for i in 12:
		var q: Dictionary = _npc(i, 99.0)
		q["league_id"] = "LEAGUE_KBL"
		s["world"]["rosters"]["T%d" % i] = [q]
	assert_int(ProspectTop10.ranking(s).size()).override_failure_message(
		"프로가 고교 유망주 명단에 들어왔다").is_equal(1)


## 학년으로 거를 수 있다 — 02는 통합·3학년·2학년·1학년 넷을 낸다
func test_학년으로_거른다() -> void:
	var s: Dictionary = _state(0)
	for i in 6:
		s["world"]["rosters"]["T%d" % i] = [_npc(i, 80.0, 1 + i % 3)]
	for r in ProspectTop10.ranking(s, {}, 2):
		assert_int(int(r["grade"])).override_failure_message(
			"2학년만 걸렀는데 %d학년이 있다" % int(r["grade"])).is_equal(2)


# ── 소식과 효과 ───────────────────────────────────────────────────

## 4주마다 — 02 `weekInYear % 4 === 0 && weekInYear >= 4`
func test_네_주마다_온다() -> void:
	assert_bool(ProspectRunner.is_ranking_week(4)).is_true()
	assert_bool(ProspectRunner.is_ranking_week(8)).is_true()
	assert_bool(ProspectRunner.is_ranking_week(5)).is_false()
	# 개막 직후엔 표본이 없다
	assert_bool(ProspectRunner.is_ranking_week(0)).is_false()


func test_랭킹_주에_소식이_온다() -> void:
	var s: Dictionary = _state(20)
	ProspectRunner.run(s, int(s["day"]))
	assert_int(int(s["mailbox"].size())).override_failure_message(
		"랭킹 주인데 소식이 안 왔다").is_equal(1)
	assert_str(String(s["mailbox"][0]["sender"])).is_equal("스포츠 매체")


func test_랭킹_주가_아니면_안_온다() -> void:
	var s: Dictionary = _state(20, {}, 5)
	ProspectRunner.run(s, int(s["day"]))
	assert_int(int(s["mailbox"].size())).is_equal(0)


## ⚠ **고교일 때만 돈다.** 02도 `careerStage === "highschool"`로 막는다
func test_고교가_아니면_안_온다() -> void:
	var s: Dictionary = _state(20, {"career_stage": "pro_kbl",
		"league_id": "LEAGUE_KBL"})
	ProspectRunner.run(s, int(s["day"]))
	assert_int(int(s["mailbox"].size())).override_failure_message(
		"프로인데 고교 유망주 랭킹이 왔다").is_equal(0)


## 🔴 **새 게임 주인공에겐 `career_stage`가 없다.**
##
## `World.new_game`이 그 칸을 안 채우고 `career_decision`이 처음 진로를
## 정할 때 비로소 넣는다. 그래서 `p.get("career_stage", "")`로 막으면
## **고교 3년 내내 한 통도 안 온다** — 실측에서 그렇게 걸렸다.
## **검사 픽스처가 그 칸을 직접 넣어서 안 보였다.**
func test_career_stage가_없어도_고교로_본다() -> void:
	var me: Dictionary = _me()
	me.erase("career_stage")
	assert_str(CareerPath.stage_of(me)).override_failure_message(
		"career_stage가 없으면 리그로 단계를 되찾아야 한다").is_equal("highschool")

	var s: Dictionary = _state(20)
	s["protagonist"].erase("career_stage")
	ProspectRunner.run(s, int(s["day"]))
	assert_int(int(s["mailbox"].size())).override_failure_message(
		"career_stage가 없다고 랭킹이 한 통도 안 왔다 — 새 게임이 그 상태다") \
		.is_equal(1)


## ⚠ **`career_stage`가 있으면 그쪽이 이긴다** — 리그보다 정확하다
func test_career_stage가_리그보다_우선이다() -> void:
	assert_str(CareerPath.stage_of({"career_stage": "military",
		"league_id": "LEAGUE_KBL"})).is_equal("military")


## 🔴 **04 고교 NPC에는 `scout_score`가 없다.** 전원 0으로 두면 점수가
## `ovr * 0.8`뿐이라 **상위 열 명이 전부 같은 값**으로 나온다 — 순위가
## 넣은 순서가 된다. 02도 이 축이 없어 **일부러 지어낸다**(`simNpcScout`)
func test_NPC_점수가_동점으로_뭉치지_않는다() -> void:
	var s: Dictionary = _state(0)
	for i in 40:
		var q: Dictionary = _npc(i, 70.0)
		q.erase("scout_score")
		s["world"]["rosters"]["T%d" % i] = [q]
	var rows: Array = ProspectTop10.ranking(s, {}, 0, 8)
	var same: int = 0
	for r in rows:
		if is_equal_approx(float(r["score"]), float(rows[0]["score"])):
			same += 1
	assert_int(same).override_failure_message(
		"OVR이 같은 NPC 열 명이 전부 같은 점수다 — 순위가 넣은 순서다") \
		.is_less(10)


## 지어낸 점수는 **02 범위(10~70)** 안이다
func test_지어낸_스카우트가_02_범위다() -> void:
	for i in 50:
		var v: float = ProspectTop10.npc_scout("N%d" % i, 8, 1)
		assert_float(v).is_between(ProspectTop10.NPC_SCOUT_MIN,
			ProspectTop10.NPC_SCOUT_MIN + ProspectTop10.NPC_SCOUT_SPAN)


## ⚠ **달마다 흔들려야 한다** — 안 그러면 랭킹을 볼 이유가 없다
func test_달마다_명단이_흔들린다() -> void:
	var s: Dictionary = _state(0)
	for i in 40:
		var q: Dictionary = _npc(i, 70.0)
		q.erase("scout_score")
		s["world"]["rosters"]["T%d" % i] = [q]
	var a: Array = ProspectTop10.ranking(s, {}, 0, 8)
	var b: Array = ProspectTop10.ranking(s, {}, 0, 12)
	var same: bool = true
	for i in a.size():
		if String(a[i]["id"]) != String(b[i]["id"]):
			same = false
	assert_bool(same).override_failure_message(
		"8주차와 12주차 명단이 똑같다 — 볼 이유가 없다").is_false()


## ⚠ **주인공 스카우트 점수가 없으면 0이 아니라 기본값이다.** 0으로 두면
## 지어낸 점수를 가진 NPC들에게 통째로 밀린다
func test_주인공_스카우트_기본값이_있다() -> void:
	var me: Dictionary = _me()
	me.erase("scout_score")
	assert_float(ProspectTop10.score_of(me)).override_failure_message(
		"스카우트 점수가 없을 때 0으로 읽었다").is_greater(
		Contract.core_ovr(me) * ProspectTop10.OVR_W)


## 🔴 **내 성적이 순위에 닿아야 한다.** 픽스처가 늘 빈 성적이라
## "성적을 안 먹인다" 변이가 살아남았다 — 잘 던지면 순위가 올라야 한다
func test_잘_던지면_순위가_오른다() -> void:
	var s: Dictionary = _state(0)
	# ⚠ **나보다 나은 NPC를 세운다.** 처음엔 나와 같은 OVR 70을 세웠는데
	# 기본 스카우트 점수 덕에 **성적 없이도 이미 1위**여서 오를 자리가
	# 없었다 — 검사가 아무것도 안 봤다
	for i in 20:
		s["world"]["rosters"]["T%d" % i] = [_npc(i, 76.0 + float(i) * 0.1)]

	var without: int = ProspectTop10.my_rank(
		ProspectTop10.ranking(s, {}, 0, 8))
	assert_int(without).override_failure_message(
		"성적 없이 이미 1위다 — 오를 자리가 없어 검사가 아무것도 안 본다") \
		.is_not_equal(1)

	s["season_stats"] = {"ME": {"type": "pitcher", "ip": 40.0, "era": 0.5,
		"k": 200.0}}
	ProspectRunner.run(s, int(s["day"]))
	var body: String = String(s["mailbox"][0]["body"])

	var with_stats: int = 0
	for line in body.split("\n"):
		if line.contains("← 나"):
			with_stats = int(line.strip_edges().split("위")[0])
			break
	assert_int(with_stats).override_failure_message(
		"성적을 먹였는데 명단에 안 든다\n%s" % body).is_greater(0)
	# ⚠ **0은 "명단 밖"이라 크기로 비교하면 뒤집힌다** — 밖이었다가 든 것도
	# 오른 것이다
	assert_bool(without == 0 or with_stats < without).override_failure_message(
		"방어율 0.50에 40이닝인데 순위가 %s → %d위로 안 올랐다"
		% ["명단 밖" if without == 0 else "%d위" % without, with_stats]) \
		.is_true()


## 내 학년 칸이 본문에 있어야 한다 — 1학년은 통합 10위에 못 든다.
##
## 🔴 실측에서 3,061명 중 통합 명단 밖이었다. **02가 학년별 칸을 내는
## 이유가 그것이다**
func test_내_학년_칸이_있다() -> void:
	var s: Dictionary = _state(20)
	ProspectRunner.run(s, int(s["day"]))
	var body: String = String(s["mailbox"][0]["body"])
	assert_int(body.find("[통합]")).override_failure_message(
		"통합 칸이 없다").is_greater(-1)
	assert_int(body.find("[3학년]")).override_failure_message(
		"내 학년 칸이 없다 — 통합에 못 들면 자기 위치를 영영 못 본다\n%s"
		% body).is_greater(-1)


## 🔴 **본문에 명단이 있어야 한다.** 02는 `body: subject`라 패널이 없으면
## 빈 소식이다 — 04는 본문 상세가 있으니 거기 적는다
func test_본문에_명단이_있다() -> void:
	var s: Dictionary = _state(20)
	ProspectRunner.run(s, int(s["day"]))
	var body: String = String(s["mailbox"][0]["body"])
	assert_int(body.split("\n").size()).override_failure_message(
		"본문이 %d줄이다 — 명단이 없다\n%s" % [body.split("\n").size(), body]) \
		.is_greater_equal(10)
	assert_int(body.find("김한결")).override_failure_message(
		"명단에 내 이름이 없다").is_greater(-1)
	assert_int(body.find("← 나")).override_failure_message(
		"명단에서 내가 어디인지 표시가 없다").is_greater(-1)


## 🔴 **순위가 실제로 사람을 바꿔야 한다.** 안 걸면 순위가 장식이 된다
func test_순위가_인기와_스카우트를_올린다() -> void:
	var s: Dictionary = _state(3)
	var before_pop: float = float(s["protagonist"]["popularity"])
	var before_sc: float = float(s["protagonist"]["scout_score"])
	ProspectRunner.run(s, int(s["day"]))
	assert_float(float(s["protagonist"]["popularity"])).override_failure_message(
		"1위인데 인기가 안 올랐다 — 순위가 장식이다").is_greater(before_pop)
	assert_float(float(s["protagonist"]["scout_score"])) \
		.is_greater(before_sc)


## 명단 밖이면 안 올린다
func test_못_들면_안_올린다() -> void:
	var s: Dictionary = _state(0)
	for i in 30:
		s["world"]["rosters"]["T%d" % i] = [_npc(i, 95.0)]
	var before: float = float(s["protagonist"]["popularity"])
	ProspectRunner.run(s, int(s["day"]))
	assert_float(float(s["protagonist"]["popularity"])).override_failure_message(
		"명단 밖인데 인기가 올랐다").is_equal_approx(before, 0.01)


## ⚠ **상한을 둔다.** 고교가 3년이라 4주마다 최대 10씩 열두 번이면
## 인기가 120이 된다 — 축이 0~100이다
func test_상한을_안_넘는다() -> void:
	var s: Dictionary = _state(3, {"popularity": 98.0})
	ProspectRunner.run(s, int(s["day"]))
	assert_float(float(s["protagonist"]["popularity"])).override_failure_message(
		"인기가 100을 넘었다").is_less_equal(100.0)


## 같은 주를 두 번 굴려도 한 통 — 겹친 id는 하나가 조용히 사라진다.
##
## ⚠ **02는 id에 `Date.now()`를 써서 두 통이 된다.** 그대로 안 옮겼다
func test_두_번_굴려도_한_통이다() -> void:
	var s: Dictionary = _state(20)
	ProspectRunner.run(s, int(s["day"]))
	ProspectRunner.run(s, int(s["day"]))
	assert_int(int(s["mailbox"].size())).override_failure_message(
		"같은 주에 두 통이 왔다").is_equal(1)


## 두 번째로 굴려도 효과가 또 붙지 않는다 — 붙으면 새로고침으로 능력이 오른다
func test_두_번째는_효과도_안_붙는다() -> void:
	var s: Dictionary = _state(3)
	ProspectRunner.run(s, int(s["day"]))
	var once: float = float(s["protagonist"]["popularity"])
	ProspectRunner.run(s, int(s["day"]))
	assert_float(float(s["protagonist"]["popularity"])).override_failure_message(
		"두 번 굴리니 효과가 두 번 붙었다").is_equal_approx(once, 0.01)


# ── 배선 ──────────────────────────────────────────────────────────

func test_주간_처리가_부른다() -> void:
	var src := CodeText.of("res://sim/week_runner.gd")
	assert_int(src.find("ProspectRunner")).override_failure_message(
		"유망주 랭킹을 아무도 안 부른다 — 또 죽은 배선이다").is_greater(-1)


## 🔴 **끝까지 굴려서 본다.** 문자열 검사만으론 인자가 틀린 걸 못 잡는다
func test_주간_처리를_굴리면_온다() -> void:
	var s: Dictionary = _state(20)
	WeekRunner.run(s, int(s["day"]))
	var found: bool = false
	for m in s.get("mailbox", []):
		if String(m.get("id", "")).begins_with("msg-top10-"):
			found = true
	assert_bool(found).override_failure_message(
		"주간 처리를 굴렸는데 유망주 랭킹이 안 왔다").is_true()
