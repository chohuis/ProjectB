extends GdUnitTestSuite

## 경기 뒤 성장 배선 — F-9.
##
## 원본: `usecases/applyGameOutcome.ts:242-259`
##
## ⚠ **`GameGrowth`를 아무도 안 불렀다.** 한 경기가 능력·사기·명성·피로에
## 남기는 것이 통째로 없었다 — `grep GameGrowth`가 주석 두 줄만 줬다.
## **열네 번째 죽은 배선이고 지금까지 중 제일 크다.**
##
## ⚠ **`Staff.mods_of`의 `morale`·`fame`도 같이 죽어 있었다** — 소비처가
## 여기뿐이라 감독 동기부여·구단주 홍보력이 아무 일도 안 했다.

const ME: String = "PLY_PROTAGONIST"
const MY_TEAM: String = "TEAM_HS_AEWOL"


func _state() -> Dictionary:
	return World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": MY_TEAM})


## 주인공이 던진 경기 하나. `won`이면 내 팀이 이긴다
func _result(won: bool, diff: int = 3, k: int = 5) -> Dictionary:
	var opp: String = "TEAM_HS_HALLA"
	return {
		"home_score": diff if won else 0,
		"away_score": 0 if won else diff,
		"winner_id": MY_TEAM if won else opp,
		"loser_id": opp if won else MY_TEAM,
		"player_lines": [{
			"role": "pitcher", "player_id": ME,
			"ip": 6.0, "er": 1.0, "h": 4.0, "k": float(k), "bb": 1.0, "pc": 92,
		}],
		"events": [],
	}


## ⚠ **시작값이 02와 달랐다.** 04는 `fatigue 0`·`condition 100`으로
## 시작했는데 02 `NewGamePage:280-281`은 `10`·`80`이다 — 팔팔한 채로
## 시작하면 첫 몇 주 훈련 효율이 02보다 높다(`Growth.week_xp`가 둘 다 읽는다).
## 값을 못 박는다
func test_시작값이_02와_같다() -> void:
	var p: Dictionary = _state()["protagonist"]
	assert_float(float(p["fatigue"])).is_equal(10.0)
	assert_float(float(p["condition"])).is_equal(80.0)
	assert_float(float(p["morale"])).is_equal(70.0)


func test_이기면_사기가_오른다() -> void:
	var s: Dictionary = _state()
	var before: float = float(s["protagonist"]["morale"])
	MatchOutcome.apply(s, _result(true))
	assert_float(float(s["protagonist"]["morale"])).override_failure_message(
		"이겼는데 사기가 안 올랐다").is_greater(before)


func test_지면_사기가_내린다() -> void:
	var s: Dictionary = _state()
	var before: float = float(s["protagonist"]["morale"])
	MatchOutcome.apply(s, _result(false))
	assert_float(float(s["protagonist"]["morale"])).is_less(before)


## ⚠ **크게 지면 배울 게 없다** — 02 `blowout`은 5점차부터다.
## 접전 패배와 같게 두면 대패가 이득이 된다
func test_대패는_접전_패배보다_더_깎인다() -> void:
	var close: Dictionary = _state()
	MatchOutcome.apply(close, _result(false, 4))
	var blown: Dictionary = _state()
	MatchOutcome.apply(blown, _result(false, 5))
	assert_float(float(blown["protagonist"]["morale"])).override_failure_message(
		"5점차 대패가 4점차 패배와 같거나 낫다").is_less(
		float(close["protagonist"]["morale"]))


func test_경기를_하면_피로가_쌓인다() -> void:
	var s: Dictionary = _state()
	var before: float = float(s["protagonist"]["fatigue"])
	MatchOutcome.apply(s, _result(true))
	assert_float(float(s["protagonist"]["fatigue"])).override_failure_message(
		"경기를 던졌는데 피로가 그대로다").is_greater(before)


func test_경기를_하면_컨디션이_떨어진다() -> void:
	var s: Dictionary = _state()
	var before: float = float(s["protagonist"]["condition"])
	MatchOutcome.apply(s, _result(true))
	assert_float(float(s["protagonist"]["condition"])).is_less(before)


## ⚠ **명성은 스폰서 수입의 입력이다**(`Contract`가 읽는다).
## 탈삼진이 많을수록 더 알려진다 — 02 `fame_base + strikeouts * 0.3`
func test_탈삼진이_많으면_명성이_더_오른다() -> void:
	var few: Dictionary = _state()
	MatchOutcome.apply(few, _result(true, 3, 1))
	var many: Dictionary = _state()
	MatchOutcome.apply(many, _result(true, 3, 12))
	assert_float(float(many["protagonist"]["fame"])).override_failure_message(
		"탈삼진 12개가 1개와 명성이 같다").is_greater(
		float(few["protagonist"]["fame"]))


## ⚠ **능력치가 는다.** 경기 XP는 훈련 한 주보다 훨씬 작지만 0은 아니다
func test_경기로_능력치_경험치가_쌓인다() -> void:
	var s: Dictionary = _state()
	MatchOutcome.apply(s, _result(true))
	var xp: Dictionary = s["protagonist"].get("pitching_xp", {})
	assert_bool(xp.is_empty()).override_failure_message(
		"경기를 던졌는데 투구 경험치가 하나도 없다").is_false()
	assert_float(float(xp.get("velocity", 0.0))).is_greater(0.0)


## ⚠ **안 나온 경기는 아무것도 안 남긴다.** 팀이 이겼다고 벤치에 앉은
## 선수의 능력치가 늘면 안 된다
func test_안_나온_경기는_아무것도_안_바꾼다() -> void:
	var s: Dictionary = _state()
	var before_morale: float = float(s["protagonist"]["morale"])
	var before_fatigue: float = float(s["protagonist"]["fatigue"])
	var r: Dictionary = _result(true)
	r["player_lines"] = [{"role": "pitcher", "player_id": "PLY_OTHER",
		"ip": 6.0, "er": 1.0, "h": 4.0, "k": 5.0, "bb": 1.0, "pc": 92}]
	assert_bool(MatchOutcome.apply(s, r)).override_failure_message(
		"안 나왔는데 적용했다고 한다").is_false()
	assert_float(float(s["protagonist"]["morale"])).is_equal(before_morale)
	assert_float(float(s["protagonist"]["fatigue"])).is_equal(before_fatigue)


## ⚠ **무승부는 승리가 아니다.** 02 `won = !isDraw && winnerId === myTeamId` —
## 04 `to_match_result`는 무승부에 `loser_id`를 비우고 `winner_id`에 홈팀을
## 넣는다. 그걸 승리로 읽으면 홈 무승부마다 사기가 오른다
func test_무승부를_승리로_읽지_않는다() -> void:
	var s: Dictionary = _state()
	var before: float = float(s["protagonist"]["morale"])
	var r: Dictionary = _result(true, 0)
	r["home_score"] = 2
	r["away_score"] = 2
	r["loser_id"] = ""      # 무승부 — 04가 이렇게 낸다
	r["winner_id"] = MY_TEAM
	MatchOutcome.apply(s, r)
	assert_float(float(s["protagonist"]["morale"])).override_failure_message(
		"무승부인데 사기가 올랐다").is_less(before)


## ⚠ **입력을 세게 줘야 갈린다.** 고교엔 스태프가 없어 계수가 1.0이고,
## 그러면 계수를 안 걸어도 결과가 같다 — 변이가 그걸 잡았다.
## 좋은 감독·나쁜 감독을 직접 넣어 본다
func _with_manager(motivator: float, pr: float) -> Dictionary:
	var s: Dictionary = _state()
	var world: Dictionary = s["world"]
	var staff: Dictionary = world.get("staff", {})
	# ⚠ **능력치는 `stats` 하위 사전에 있다**(`Staff.stats_of:272`).
	# 평평하게 넣으면 `has(s)`가 거짓이라 **중립값이 그대로 남는다** —
	# 검사가 조용히 아무것도 안 보게 된다
	staff[MY_TEAM] = [
		{"id": "STF_M", "role": "manager", "name": "감독",
			"stats": {"motivator": motivator}},
		{"id": "STF_O", "role": "owner", "name": "구단주",
			"stats": {"pr_influence": pr, "staff_trust": 50.0}},
	]
	world["staff"] = staff
	return s


## ⚠ **감독 동기부여가 사기 변동폭을 민다** — `Staff.mods_of(...)["morale"]`.
## 소비처가 여기뿐이라 이 배선이 없으면 스태프 축 둘이 죽는다
func test_좋은_감독이_승리의_사기를_더_올린다() -> void:
	var good: Dictionary = _with_manager(95.0, 50.0)
	var bad: Dictionary = _with_manager(5.0, 50.0)
	# 계수가 실제로 갈리는지부터 본다 — 같으면 이 검사가 아무것도 안 본다
	assert_float(float(MatchOutcome.mods_for(good)["morale"])).override_failure_message(
		"감독을 바꿔도 사기 계수가 같다 — 입력이 약하다").is_not_equal(
		float(MatchOutcome.mods_for(bad)["morale"]))

	MatchOutcome.apply(good, _result(true))
	MatchOutcome.apply(bad, _result(true))
	assert_float(float(good["protagonist"]["morale"])).override_failure_message(
		"좋은 감독인데 승리의 사기가 더 안 올랐다").is_greater(
		float(bad["protagonist"]["morale"]))


## ⚠ **음수에는 역수를 쓴다.** 좋은 감독은 패배의 충격을 **줄인다** —
## 그냥 곱하면 정확히 반대로 동작한다
func test_좋은_감독이_패배의_충격을_줄인다() -> void:
	var good: Dictionary = _with_manager(95.0, 50.0)
	var bad: Dictionary = _with_manager(5.0, 50.0)
	MatchOutcome.apply(good, _result(false, 6))
	MatchOutcome.apply(bad, _result(false, 6))
	assert_float(float(good["protagonist"]["morale"])).override_failure_message(
		"좋은 감독인데 대패의 충격이 더 안 줄었다").is_greater(
		float(bad["protagonist"]["morale"]))


## ⚠ **구단주 홍보력이 명성 변동폭을 민다** — `Staff.mods_of(...)["fame"]`
func test_홍보력_있는_구단주가_명성을_더_올린다() -> void:
	var good: Dictionary = _with_manager(50.0, 95.0)
	var bad: Dictionary = _with_manager(50.0, 5.0)
	assert_float(float(MatchOutcome.mods_for(good)["fame"])).is_not_equal(
		float(MatchOutcome.mods_for(bad)["fame"]))

	MatchOutcome.apply(good, _result(true, 3, 12))
	MatchOutcome.apply(bad, _result(true, 3, 12))
	assert_float(float(good["protagonist"]["fame"])).override_failure_message(
		"홍보력이 높은데 명성이 더 안 올랐다").is_greater(
		float(bad["protagonist"]["fame"]))


## ⚠ **타자 줄의 `k`는 삼진당한 수다** — 같은 이름의 반대 뜻이다.
## 그걸 탈삼진으로 세면 많이 당할수록 유명해진다
func test_삼진당한_수를_탈삼진으로_안_센다() -> void:
	var s: Dictionary = _state()
	var before: float = float(s["protagonist"]["fame"])
	var r: Dictionary = _result(true)
	# 타자로 나와 네 번 삼진당했다 — 명성이 오를 이유가 없다
	r["player_lines"] = [{"role": "batter", "player_id": ME,
		"ab": 4, "h": 0, "hr": 0, "rbi": 0, "bb": 0, "k": 4, "sb": 0}]
	MatchOutcome.apply(s, r)
	var few: Dictionary = _state()
	var r2: Dictionary = _result(true)
	r2["player_lines"] = [{"role": "batter", "player_id": ME,
		"ab": 4, "h": 2, "hr": 0, "rbi": 1, "bb": 0, "k": 0, "sb": 0}]
	MatchOutcome.apply(few, r2)
	assert_float(float(s["protagonist"]["fame"])).override_failure_message(
		"네 번 삼진당한 쪽이 더 유명해졌다").is_equal(
		float(few["protagonist"]["fame"]))
	assert_float(float(s["protagonist"]["fame"])).is_not_equal(before)


## ⚠ **명성은 델타로 민다.** 캠퍼스·수상도 같은 키에 더하므로 덮어쓰면
## 그쪽이 지워진다. **시작값이 0이면 이 검사가 아무것도 안 본다** —
## 02는 `fame: 5`로 시작한다
func test_명성이_쌓인_것_위에_더해진다() -> void:
	var s: Dictionary = _state()
	assert_float(float(s["protagonist"]["fame"])).override_failure_message(
		"시작 명성이 0이면 덮어써도 티가 안 난다").is_equal(5.0)
	s["protagonist"]["fame"] = 40.0
	MatchOutcome.apply(s, _result(true, 3, 6))
	assert_float(float(s["protagonist"]["fame"])).override_failure_message(
		"명성이 델타가 아니라 덮어써졌다").is_greater(40.0)


## 배선의 끝 — 게임이 실제로 부르나
func test_경기_기록이_성장을_부른다() -> void:
	var src := FileAccess.get_file_as_string("res://ui/app_root.gd")
	assert_int(src.find("MatchOutcome.apply")).override_failure_message(
		"경기 결과를 남기는 자리가 성장을 안 부른다").is_greater(-1)
