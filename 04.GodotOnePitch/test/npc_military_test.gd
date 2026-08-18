extends GdUnitTestSuite

## NPC 병역 — P-18. **사용자 확정.**
##
## > NPC도 상무 영향을 받아야 한다. 그래야 주인공이 신청하는 해에 경쟁이
## > 빡세기도 하고 아니기도 하다.
##
## 🔴 **04는 주인공만 입대했다.** `Military.enlist`를 부르는 곳이 주인공 경로
## 셋뿐이라 미필 풀이 **영영 안 줄었다** — 경쟁 상대가 늘 같으니 당락이 내
## OVR 순위 하나로 고정됐다.
##
## 02 원본: `npc_sim.rs:2590-2624` `calc_early_enlist_decisions`.
## **확률은 더해서 0.85에서 자른다** — 값을 지어내지 않았다.


func _c(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"id": "N1", "age": 24, "ovr_rank_pct": 0.9,
		"playing_time_pct": 0.9, "contract_years_left": 3}
	d.merge(o, true)
	return d


# ── 조기 입대 확률 ────────────────────────────────────────────

## 02 나이 보정 — 27세 0.20 · 26세 0.12 · 25세 0.05 · 그 밖 0
func test_나이_보정이_02_그대로다() -> void:
	assert_float(NpcMilitary.early_enlist_prob(_c({"age": 27}))) \
		.is_equal_approx(0.20, 0.001)
	assert_float(NpcMilitary.early_enlist_prob(_c({"age": 26}))) \
		.is_equal_approx(0.12, 0.001)
	assert_float(NpcMilitary.early_enlist_prob(_c({"age": 25}))) \
		.is_equal_approx(0.05, 0.001)
	assert_float(NpcMilitary.early_enlist_prob(_c({"age": 24}))) \
		.is_equal_approx(0.0, 0.001)


## OVR 하위권 — 20% 미만 0.35 · 35% 미만 0.20
func test_실력이_밀리면_확률이_오른다() -> void:
	assert_float(NpcMilitary.early_enlist_prob(_c({"ovr_rank_pct": 0.1}))) \
		.is_equal_approx(0.35, 0.001)
	assert_float(NpcMilitary.early_enlist_prob(_c({"ovr_rank_pct": 0.3}))) \
		.is_equal_approx(0.20, 0.001)


## 출장 시간 부족 — 20% 미만 0.30 · 35% 미만 0.15
func test_못_뛰면_확률이_오른다() -> void:
	assert_float(NpcMilitary.early_enlist_prob(_c({"playing_time_pct": 0.1}))) \
		.is_equal_approx(0.30, 0.001)
	assert_float(NpcMilitary.early_enlist_prob(_c({"playing_time_pct": 0.3}))) \
		.is_equal_approx(0.15, 0.001)


## 계약 만료 임박 — 1년 이하 0.20
func test_계약이_끝나가면_확률이_오른다() -> void:
	assert_float(NpcMilitary.early_enlist_prob(_c({"contract_years_left": 1}))) \
		.is_equal_approx(0.20, 0.001)
	assert_float(NpcMilitary.early_enlist_prob(_c({"contract_years_left": 2}))) \
		.is_equal_approx(0.0, 0.001)


## ⚠ **더한 뒤 0.85에서 자른다.** 안 자르면 최악의 경우가 1.05로 확실해진다
func test_확률이_085를_안_넘는다() -> void:
	assert_float(NpcMilitary.early_enlist_prob(_c({
		"age": 27, "ovr_rank_pct": 0.1, "playing_time_pct": 0.1,
		"contract_years_left": 1}))).override_failure_message(
		"0.20+0.35+0.30+0.20 = 1.05인데 안 잘랐다").is_equal_approx(0.85, 0.001)


## 잘하고 잘 뛰고 계약이 남았으면 안 간다
func test_잘하면_안_간다() -> void:
	assert_float(NpcMilitary.early_enlist_prob(_c())).is_equal_approx(0.0, 0.001)


# ── 세계에 적용 ───────────────────────────────────────────────

func _world(n: int) -> Dictionary:
	var rosters: Dictionary = {}
	for i in n:
		rosters["T%d" % i] = [{
			"id": "N%d" % i, "age": 27, "career_stage": "pro",
			"league_id": "LEAGUE_KBL", "team_id": "T%d" % i,
			"military_status": Military.STATUS_UNSERVED,
			"pitching": {"ovr": 40.0}, "contract_years": 1,
		}]
	return {"protagonist": {"id": "ME", "is_protagonist": true},
		"season_year": 2033, "seed": 7, "world": {"rosters": rosters}}


## ⚠ **여기가 P-18의 요점이다.** 굴리면 미필 풀이 줄어야 한다
func test_굴리면_미필이_줄어든다() -> void:
	var s: Dictionary = _world(40)
	var before: int = NpcMilitary.unserved_count(s)
	NpcMilitary.run(s, 360)
	var after: int = NpcMilitary.unserved_count(s)
	assert_int(after).override_failure_message(
		"굴렸는데 미필이 %d명 그대로다 — 경쟁이 영영 고정된다" % after) \
		.is_less(before)


## ⚠ **주인공은 안 건드린다.** 주인공 병역은 사용자가 정한다
func test_주인공은_안_건드린다() -> void:
	var s: Dictionary = _world(40)
	s["world"]["rosters"]["MINE"] = [{
		"id": "ME", "is_protagonist": true, "age": 27, "career_stage": "pro",
		"military_status": Military.STATUS_UNSERVED,
		"pitching": {"ovr": 40.0}, "contract_years": 1}]
	NpcMilitary.run(s, 360)
	for q in s["world"]["rosters"]["MINE"]:
		assert_str(String(q["military_status"])).override_failure_message(
			"세계가 주인공을 대신 입대시켰다").is_equal(Military.STATUS_UNSERVED)


## 고교·대학생은 안 간다 — 02 공통 전제와 같다.
##
## ⚠ **`unserved_count`로 재면 안 된다.** 그건 **자격 있는 풀**을 세므로
## 학생은 애초에 0이다 — 상태를 직접 본다
func test_학생은_안_간다() -> void:
	var s: Dictionary = _world(30)
	for tid in s["world"]["rosters"]:
		s["world"]["rosters"][tid][0]["career_stage"] = "university"
	NpcMilitary.run(s, 360)
	for tid in s["world"]["rosters"]:
		assert_str(String(s["world"]["rosters"][tid][0]["military_status"])) \
			.override_failure_message("대학생이 입대했다") \
			.is_equal(Military.STATUS_UNSERVED)


## ⚠ **해마다 다르게 나온다.** 같으면 "빡세기도 하고 아니기도"가 안 생긴다
func test_해마다_숫자가_흔들린다() -> void:
	var counts: Array = []
	for year in [2033, 2034, 2035, 2036]:
		var s: Dictionary = _world(40)
		s["season_year"] = year
		var before: int = NpcMilitary.unserved_count(s)
		NpcMilitary.run(s, 360)
		counts.append(before - NpcMilitary.unserved_count(s))
	var same: bool = true
	for c in counts:
		if c != counts[0]:
			same = false
	assert_bool(same).override_failure_message(
		"해마다 %s로 똑같다 — 경쟁 강도가 안 흔들린다" % str(counts)).is_false()


## 시즌 마지막 주에만 돈다 — 아무 때나 입대시키면 시즌 도중에 사라진다
func test_시즌_마지막_주에만_돈다() -> void:
	var s: Dictionary = _world(40)
	var before: int = NpcMilitary.unserved_count(s)
	NpcMilitary.run(s, 100)
	assert_int(NpcMilitary.unserved_count(s)).override_failure_message(
		"6월인데 NPC가 입대했다").is_equal(before)


## 배선의 끝 — 주간 처리가 부르나
func test_주간_처리가_부른다() -> void:
	var src := FileAccess.get_file_as_string("res://sim/week_runner.gd")
	assert_int(src.find("NpcMilitary")).override_failure_message(
		"NPC 병역을 아무도 안 부른다 — 만들어 놓고 죽은 배선이 된다") \
		.is_greater(-1)
