extends GdUnitTestSuite

## 프로 보직 배정 — P-8c.
##
## 🔴 **02는 보직 함수가 둘인데 04는 고교 것만 옮겼다.**
##
## | | 02 `player_engine.rs` | 04(전) |
## |---|---|---|
## | 고교 | `:136 assign_highschool_position` — 전체 투수 · `higher <= 2` | `assign_position` — 글자 그대로 같다 |
## | 프로 | `:99 assign_protagonist_role` — **선발 OVR만** · `rank <= 5` | **없었다** |
##
## 그래서 프로에서도 **팀 3위 안**을 요구했는데 `Rotation.size_of`는 프로에
## **5인**을 준다. `rotation.gd:77` 주석이 그 어긋남을 스스로 경고했다:
##
## > 이 둘이 어긋나면 **선발로 배정됐는데 로테이션에는 못 드는** 선수가
## > 생기고, 그러면 한 경기도 못 던진다
##
## 실측이 그 값이었다 — 프로 144경기에 **등판 7**(= 불펜 확률 5%).
##
## ⚠ **`RELIEVER_CHANCE`에 02 역할 이름이 이미 다 있었다** — 표만 있고
## 배정이 없었다(형태 ①).


# ── 선발 순위 (02 `rank <= 5`) ───────────────────────────────────

## 🔴 **5위 안이면 선발이다.** 04는 3위 안만 줬다
func test_다섯째까지_선발이다() -> void:
	# 나보다 센 선발이 넷 → 5선발
	assert_str(Rotation.assign_pro_role(70.0, [80.0, 78.0, 76.0, 74.0])) \
		.override_failure_message("나보다 센 선발이 넷인데 선발이 아니다") \
		.is_equal("5선발")
	# 나보다 센 선발이 다섯 → 로테 밖
	assert_str(Rotation.assign_pro_role(70.0, [80.0, 78.0, 76.0, 74.0, 72.0])) \
		.is_not_equal("6선발")


## 순위가 이름이 된다 — 02 `format!("{}선발", rank)`
func test_순위가_이름이_된다() -> void:
	assert_str(Rotation.assign_pro_role(90.0, [])).is_equal("1선발")
	assert_str(Rotation.assign_pro_role(70.0, [80.0])).is_equal("2선발")
	assert_str(Rotation.assign_pro_role(70.0, [80.0, 78.0])).is_equal("3선발")
	assert_str(Rotation.assign_pro_role(70.0, [80.0, 78.0, 76.0])).is_equal("4선발")


## ⚠ **로테 밖이면 OVR이 가른다** — 02: 60 이상 스윙맨, 아니면 롱릴리프
func test_로테_밖은_능력으로_갈린다() -> void:
	var six: Array = [90.0, 88.0, 86.0, 84.0, 82.0]
	assert_str(Rotation.assign_pro_role(60.0, six)).is_equal("스윙맨")
	assert_str(Rotation.assign_pro_role(59.9, six)).is_equal("롱릴리프")


## 🔴 **분모는 선발 OVR만이다** (02 `team_sp_ovrs`).
## 불펜까지 세면 순위가 밀려 선발이 훨씬 어려워진다 — 04가 그랬다
func test_분모가_선발만이다() -> void:
	# 선발 넷이 나보다 세다 → 5선발. 불펜 열 명이 더 세도 상관없다
	assert_str(Rotation.assign_pro_role(70.0, [80.0, 78.0, 76.0, 74.0])) \
		.is_equal("5선발")


## ⚠ **감독이 보는 나** — `ovr_bias`가 순위 비교에 들어간다(02와 같다).
## 실력이 아니라 관계다
func test_관계가_순위를_가른다() -> void:
	# ⚠ **순위가 아니라 "로테 안인가"로 본다.** 보정 5면 seen 75라
	# 76·78·80만 위여서 **4선발**이 된다 — 처음엔 5선발을 기대했다가 틀렸다
	var rivals: Array = [80.0, 78.0, 76.0, 74.0, 72.0]
	assert_bool(Rotation.is_starter_role(
		Rotation.assign_pro_role(70.0, rivals))) 		.override_failure_message("보정 없이 로테에 들었다").is_false()
	assert_bool(Rotation.is_starter_role(
		Rotation.assign_pro_role(70.0, rivals, 5.0))) 		.override_failure_message(
			"신뢰가 두터운데도 로테 밖이다 — %s"
			% Rotation.assign_pro_role(70.0, rivals, 5.0)).is_true()


# ── 불펜 보직 (02 `assign_protagonist_role`의 CP·RP 갈래) ────────

## 마무리는 보직이 정한다 — OVR과 무관하다
func test_마무리는_보직이_정한다() -> void:
	assert_str(Rotation.assign_pro_role(50.0, [], 0.0, "CP")).is_equal("마무리")
	assert_str(Rotation.assign_pro_role(95.0, [], 0.0, "CP")).is_equal("마무리")


## ⚠ **불펜은 OVR대로 갈린다** — 02 78 / 65 / 55
func test_불펜은_능력대로_갈린다() -> void:
	assert_str(Rotation.assign_pro_role(78.0, [], 0.0, "RP")).is_equal("셋업맨")
	assert_str(Rotation.assign_pro_role(77.9, [], 0.0, "RP")).is_equal("중간계투")
	assert_str(Rotation.assign_pro_role(65.0, [], 0.0, "RP")).is_equal("중간계투")
	assert_str(Rotation.assign_pro_role(64.9, [], 0.0, "RP")).is_equal("롱릴리프")
	assert_str(Rotation.assign_pro_role(55.0, [], 0.0, "RP")).is_equal("롱릴리프")
	assert_str(Rotation.assign_pro_role(54.9, [], 0.0, "RP")).is_equal("패전처리")


## 🔴 **내는 이름이 전부 `RELIEVER_CHANCE`에 있어야 한다.**
## 없으면 그 불펜은 등판 확률 0이라 한 경기도 못 던진다
func test_불펜_이름이_확률표에_다_있다() -> void:
	for ovr in [90.0, 78.0, 70.0, 60.0, 50.0]:
		for pos in ["RP", "CP"]:
			var role: String = Rotation.assign_pro_role(ovr, [], 0.0, pos)
			assert_bool(Rotation.RELIEVER_CHANCE.has(role)) \
				.override_failure_message(
					"%s(OVR %.0f)이 확률표에 없다 — 등판 확률 0이다"
					% [role, ovr]).is_true()
	# 로테 밖 선발도 마찬가지다
	var six: Array = [90.0, 88.0, 86.0, 84.0, 82.0]
	for ovr in [70.0, 50.0]:
		assert_bool(Rotation.RELIEVER_CHANCE.has(
			Rotation.assign_pro_role(ovr, six))).is_true()


# ── 고교는 안 바뀐다 ─────────────────────────────────────────────

## ⚠ **02도 고교는 다른 함수다** — 전체 투수 · 둘 이하.
## 프로 규칙을 고교에 씌우면 3인 로테와 어긋난다
func test_고교_규칙은_그대로다() -> void:
	assert_str(Rotation.assign_position(60.0, [70.0, 65.0])).is_equal("SP")
	assert_str(Rotation.assign_position(60.0, [70.0, 65.0, 62.0])).is_equal("RP")


# ── 무대로 갈라 부르나 (형태 ① — 만들고 안 부르면 없는 것과 같다) ──

## 🔴 **프로 무대면 새 함수를 탄다.** 안 그러면 만든 뜻이 없다
func test_시즌_롤오버가_무대로_갈라_부른다() -> void:
	var f: FileAccess = FileAccess.open("res://sim/season_runner.gd",
		FileAccess.READ)
	assert_object(f).is_not_null()
	var code: String = ""
	for line in f.get_as_text().split("\n"):
		if line.strip_edges().begins_with("#"):
			continue
		code += line + "\n"
	assert_str(code).override_failure_message(
		"시즌 롤오버가 assign_pro_role을 안 부른다 — 프로에서도 고교 규칙이다") \
		.contains("assign_pro_role")


## 🔴 **선발로 배정됐으면 로테이션에도 든다.** `rotation.gd:77`이 경고한
## 어긋남이다 — 배정과 선정이 다른 기준을 쓰면 한 경기도 못 던진다
func test_선발_배정과_로테이션이_어긋나지_않는다() -> void:
	var want: int = Rotation.size_of("LEAGUE_KBL")
	# 나보다 센 선발이 (want - 1)명이면 마지막 선발이다 — 로테 안이어야 한다
	var higher: Array = []
	for i in want - 1:
		higher.append(90.0 - float(i))
	var role: String = Rotation.assign_pro_role(70.0, higher)
	assert_str(role).override_failure_message(
		"센 선발 %d명 위에서 %s다 — 로테는 %d인인데"
		% [higher.size(), role, want]).is_equal("%d선발" % want)

	# 한 명 더 세면 로테 밖이다
	higher.append(85.0)
	assert_bool(Rotation.assign_pro_role(70.0, higher).ends_with("선발")) \
		.override_failure_message("로테 %d인인데 %d번째도 선발이다"
			% [want, higher.size() + 1]).is_false()
