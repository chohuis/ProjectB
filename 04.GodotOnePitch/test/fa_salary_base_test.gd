extends GdUnitTestSuite

## FA 등급의 분모는 **프로 전체 연봉**이다 — P-5.
##
## 원본: `weekPhases/market.ts:1279-1283`.
## > 연봉 기준선도 프로 전체에서 — 리그 하나만 보면 해외 시세가 안 잡힌다
##
## ⚠ **04는 리그 하나만 봤다.** 그래서 FA 자격자(근속 쌓인 베테랑)가 자기
## 리그 안에서 전부 상위 30%에 들어 **A등급만 나왔다** — `protected_count 25`
## (B)와 `0`(C) 갈래가 도달 불가였다.
##
## ⚠ **등급 표는 안 건드린다.** 02와 글자 그대로 같다(A 30%/보호20/보상200 ·
## B 60%/25/100 · C 100%/0/150). 갈리는 건 **분모**다.
##
## ⚠ **새 게임 세계로는 못 잰다** — 시작 시점엔 연봉이 한 명도 없다.
## 리그마다 시세가 다른 세계를 손으로 세운다


## KBL은 시세가 낮고 JBL은 높다 — **리그 하나만 보면 이 차이가 안 잡힌다**
func _world() -> Dictionary:
	var rosters: Dictionary = {}
	rosters["TEAM_KBL_A_1"] = _roster("K", "LEAGUE_KBL", 20, 3000, 100)
	rosters["TEAM_ABL_A_1"] = _roster("A", "LEAGUE_ABL", 20, 8000, 300)
	rosters["TEAM_JBL_A_1"] = _roster("J", "LEAGUE_JBL", 20, 15000, 500)
	# 아마추어 — 연봉이 없다
	rosters["TEAM_HS_A"] = _roster("H", "LEAGUE_HS_JEJU", 20, -1, 0)
	return {"rosters": rosters}


func _roster(tag: String, league: String, n: int, base: int, step: int) -> Array:
	var out: Array = []
	for i in n:
		var p: Dictionary = {"id": "%s%d" % [tag, i], "league_id": league,
			"age": 27, "pro_service_years": 4, "contract_years": 2}
		if base >= 0:
			p["salary"] = base + i * step
		out.append(p)
	return out


## 프로 세 리그를 다 모은다 — 하나만 보면 분모가 3분의 1이다
func test_프로_세_리그를_다_모은다() -> void:
	var w: Dictionary = _world()
	assert_int(FaRunner.pro_salaries(w).size()).override_failure_message(
		"프로 60명을 다 안 모았다").is_equal(60)


## ⚠ **리그 하나보다 확실히 크다** — 같으면 한 리그만 보고 있는 것이다
func test_리그_하나보다_크다() -> void:
	var w: Dictionary = _world()
	assert_int(FaRunner.pro_salaries(w).size()).override_failure_message(
		"프로 전체가 KBL 하나와 같다") \
		.is_greater(FaRunner.league_salaries(w, "LEAGUE_KBL").size())


## 아마추어는 안 센다 — 고교 선수가 섞이면 분모가 아래로 늘어
## FA 자격자가 전부 상위로 밀린다
func test_아마추어는_안_센다() -> void:
	assert_int(FaRunner.pro_salaries(_world()).size()).override_failure_message(
		"아마추어까지 셌다").is_equal(60)


## ⚠ **이게 P-5의 전부다.** KBL 최고연봉(4900)은 자기 리그에선 백분위 0
## (=A등급)이지만 프로 전체에서는 ABL·JBL 40명이 위에 있어 아래 등급이다
func test_분모가_넓어지면_등급이_갈린다() -> void:
	var w: Dictionary = _world()
	var top_kbl: int = 3000 + 19 * 100

	var one: String = String(FaMarket.grade_of(FaMarket.salary_percentile(
		top_kbl, FaRunner.league_salaries(w, "LEAGUE_KBL")))["grade"])
	var all: String = String(FaMarket.grade_of(FaMarket.salary_percentile(
		top_kbl, FaRunner.pro_salaries(w)))["grade"])

	assert_str(one).override_failure_message(
		"KBL 최고연봉이 자기 리그에서 A가 아니다").is_equal("A")
	assert_str(all).override_failure_message(
		"분모를 넓혔는데 등급이 그대로 %s다 — 리그 하나만 보고 있다" % all) \
		.is_not_equal("A")


## 진짜 최고연봉은 분모가 넓어져도 A다 — 넓히기가 등급을 전부 밀어내면 안 된다
func test_진짜_최고는_그래도_A다() -> void:
	var w: Dictionary = _world()
	var top: int = 15000 + 19 * 500
	assert_str(String(FaMarket.grade_of(FaMarket.salary_percentile(
		top, FaRunner.pro_salaries(w)))["grade"])).is_equal("A")


## 배선의 끝 — 시장이 프로 전체 분모를 받나
func test_시장이_프로_전체를_받는다() -> void:
	var src := FileAccess.get_file_as_string("res://sim/fa_runner.gd")
	assert_int(src.find("pro_salaries(world)")).override_failure_message(
		"FA 시장이 아직 리그 하나만 본다").is_greater(-1)
