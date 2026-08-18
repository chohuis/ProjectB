extends GdUnitTestSuite

## NPC 구종 성장 — D-3.
##
## 🔴 **04의 NPC는 `pitches`가 없어 마운드에서 늘 포심만 던졌다.**
## `PitchAi.pick_from_arsenal`이 빈 배열에 `"fastball"`을 돌려주고,
## 그래서 `pitch_pattern_modifier`(같은 구종 반복 벌점)가 **NPC 경기 내내**
## 걸렸다 — 캡처 로그가 "1구 포심 · 2구 포심 … 6구 포심"이었다.
##
## ⚠ **초기 생성이 문제가 아니다.** 02의 NPC도 `pitches`가 빈 채로 시작하고
## 엔진에서 `[{fastball, 3}]`으로 떨어진다 — 04와 같다.
## **갈리는 건 주간 성장이다**: 02 `npc_sim.rs:2833-2877`·`3112-3155`가
## 해마다 구종을 늘린다. 04엔 그 자리가 통째로 없었다.
##
## 값은 전부 02 그대로다 — 지어낸 것이 없다.

const CATALOG: Array[String] = ["fastball", "slider", "curve", "changeup",
	"forkball", "cutter"]


func _pitcher(over := {}) -> Dictionary:
	var p: Dictionary = {
		"id": "NPC_1", "player_type": "pitcher", "position": "SP",
		"age": 24, "potential_hidden": 80.0,
		"pitching": {"ovr": 70.0, "velocity": 65.0},
		"pitches": [],
	}
	for k in over:
		p[k] = over[k]
	return p


# ── 목표 구종 수 (02 `npc_pitch_target`) ─────────────────────────

## ⚠ **구속이 빠르면 적게 갖는다** — 구위로 눌러서다.
## **주인공 표(`AutoTraining.pitch_target`)와 같은 값이어야 한다** — 두 벌로
## 두면 갈리고, 그 격차가 그대로 성적이 된다
func test_보직과_구속이_목표_수를_가른다() -> void:
	assert_int(NpcPitchDev.target_of("SP", 70.0)).is_equal(4)
	assert_int(NpcPitchDev.target_of("SP", 69.9)).is_equal(5)
	assert_int(NpcPitchDev.target_of("CP", 70.0)).is_equal(2)
	assert_int(NpcPitchDev.target_of("CP", 60.0)).is_equal(3)
	assert_int(NpcPitchDev.target_of("CP", 59.9)).is_equal(4)
	assert_int(NpcPitchDev.target_of("RP", 65.0)).is_equal(3)
	assert_int(NpcPitchDev.target_of("RP", 64.9)).is_equal(4)
	# 02는 SP·CP 말고 전부 RP 표를 쓴다 — 보직이 비어도 굴러가야 한다
	assert_int(NpcPitchDev.target_of("P", 65.0)).is_equal(3)


func test_주인공과_같은_표를_쓴다() -> void:
	for role in ["SP", "CP", "RP"]:
		for v in [55.0, 62.0, 67.0, 75.0]:
			assert_int(NpcPitchDev.target_of(role, v)).override_failure_message(
				"%s %.0f — NPC %d · 주인공 %d" % [role, v,
					NpcPitchDev.target_of(role, v),
					AutoTraining.pitch_target(role, v)]) \
				.is_equal(AutoTraining.pitch_target(role, v))


# ── 주당 진행 (02 `pitch_progress_per_week`) ─────────────────────

## 발견→1: 8주 · 1→2: 8주 · 2→3: 12주 · 3→4: 24주 · 4→5: 36주.
## **잘 익힌 구종일수록 느리다**
func test_숙련도가_높을수록_느리다() -> void:
	assert_float(NpcPitchDev.progress_per_week(0)).is_equal_approx(100.0 / 8.0, 0.001)
	assert_float(NpcPitchDev.progress_per_week(1)).is_equal_approx(100.0 / 8.0, 0.001)
	assert_float(NpcPitchDev.progress_per_week(2)).is_equal_approx(100.0 / 12.0, 0.001)
	assert_float(NpcPitchDev.progress_per_week(3)).is_equal_approx(100.0 / 24.0, 0.001)
	assert_float(NpcPitchDev.progress_per_week(4)).is_equal_approx(100.0 / 36.0, 0.001)
	# 5는 끝이다 — 안 막으면 마스터한 구종에 영원히 주가 쌓인다
	assert_float(NpcPitchDev.progress_per_week(5)).is_equal(0.0)


# ── 대상 고르기 (02 `decide_pitch_training`) ─────────────────────

func test_모자라면_새_구종을_고른다() -> void:
	var d: Dictionary = NpcPitchDev.decide(_pitcher(), CATALOG)
	assert_bool(d.is_empty()).is_false()
	assert_bool(bool(d["is_new"])).is_true()
	assert_array(CATALOG).contains([String(d["pitch_id"])])


## ⚠ **이미 가진 것은 다시 안 고른다** — 안 거르면 같은 구종을 영원히 배운다
func test_가진_것은_다시_안_고른다() -> void:
	var p: Dictionary = _pitcher({"pitches": [
		{"id": "fastball", "grade": 3}, {"id": "slider", "grade": 3}]})
	for i in 20:
		p["id"] = "NPC_%d" % i
		var d: Dictionary = NpcPitchDev.decide(p, CATALOG)
		if bool(d.get("is_new", false)):
			assert_str(String(d["pitch_id"])).is_not_equal("fastball")
			assert_str(String(d["pitch_id"])).is_not_equal("slider")


## 목표를 채웠으면 **제일 낮은 숙련도**를 올린다.
##
## ⚠ **구속 70을 준다.** 65로 뒀다가 실패했는데, SP·65는 목표가 **5**라
## 넷으로는 아직 안 찬 것이었다 — 검사가 틀렸지 코드가 아니었다
func test_다_채웠으면_제일_낮은_것을_올린다() -> void:
	var p: Dictionary = _pitcher({
		"pitching": {"ovr": 70.0, "velocity": 70.0}, "pitches": [
		{"id": "fastball", "grade": 4}, {"id": "slider", "grade": 1},
		{"id": "curve", "grade": 3}, {"id": "changeup", "grade": 2}]})
	var d: Dictionary = NpcPitchDev.decide(p, CATALOG)
	assert_bool(bool(d["is_new"])).is_false()
	assert_str(String(d["pitch_id"])).is_equal("slider")


## 전부 마스터하면 더 할 게 없다 — 죽은 갈래를 두지 않는다.
##
## ⚠ **여기도 구속 70이다**(목표 4). 65로 두면 목표가 5라 **넷을 다
## 마스터해도 다섯째를 배우러 간다** — 02도 그렇다. 검사가 재려던 것은
## "목표를 채웠고 더 올릴 것도 없다"는 자리다
func test_다_마스터하면_안_고른다() -> void:
	var p: Dictionary = _pitcher({
		"pitching": {"ovr": 70.0, "velocity": 70.0}, "pitches": [
		{"id": "fastball", "grade": 5}, {"id": "slider", "grade": 5},
		{"id": "curve", "grade": 5}, {"id": "changeup", "grade": 5}]})
	assert_bool(NpcPitchDev.decide(p, CATALOG).is_empty()).is_true()


## 02 자격 셋 — 33세 이상 · 잠재력 대비 70% 미만 · 새 구종은 29세 미만.
##
## ⚠ **32세에게 구종 하나를 준다.** 빈 손으로 주면 새 구종은 나이가 막고
## 올릴 것도 없어서 빈 사전이 나온다 — **02도 그렇다**
func test_나이가_많으면_안_배운다() -> void:
	var one: Array = [{"id": "fastball", "grade": 2}]
	assert_bool(NpcPitchDev.decide(
		_pitcher({"age": 33, "pitches": one}), CATALOG).is_empty()) \
		.override_failure_message("33세가 구종을 배운다").is_true()
	assert_bool(NpcPitchDev.decide(
		_pitcher({"age": 32, "pitches": one}), CATALOG).is_empty()) \
		.override_failure_message("32세가 있는 구종도 못 올린다").is_false()


## 🔴 **29세 이상으로 시작한 NPC는 영영 구종이 없다** — 새 것은 나이가 막고
## 올릴 것도 없다. **02도 똑같다**(`decide_pitch_training`이 그 순서다).
## 그런 투수는 엔진에서 포심 하나로 떨어진다.
##
## ⚠ **이 검사는 결함을 지키는 게 아니라 사실을 적어 둔다.** 값을 만지고
## 싶어지면 여기가 "02가 그렇다"고 말한다 — 밸런스는 동결이다
func test_스물아홉에_빈_손이면_영영_못_배운다() -> void:
	assert_bool(NpcPitchDev.decide(_pitcher({"age": 29}), CATALOG).is_empty()) \
		.is_true()
	assert_bool(NpcPitchDev.decide(_pitcher({"age": 28}), CATALOG).is_empty()) \
		.override_failure_message("28세도 못 배운다 — 문턱이 어긋났다").is_false()


## ⚠ **29세부터는 새 구종을 못 얻고 있는 것만 올린다** — 02가 그렇게 갈랐다
func test_스물아홉부터는_있는_것만_올린다() -> void:
	var p: Dictionary = _pitcher({"age": 29, "pitches": [
		{"id": "fastball", "grade": 2}]})
	var d: Dictionary = NpcPitchDev.decide(p, CATALOG)
	assert_bool(bool(d["is_new"])).override_failure_message(
		"29세가 새 구종을 얻는다").is_false()
	assert_str(String(d["pitch_id"])).is_equal("fastball")


## 잠재력에 한참 못 미치면 구종을 늘릴 때가 아니다 — 02 `ovr/potential < 0.70`
func test_잠재력_대비_낮으면_안_배운다() -> void:
	var p: Dictionary = _pitcher({"potential_hidden": 90.0,
		"pitching": {"ovr": 62.0, "velocity": 65.0}})  # 0.689
	assert_bool(NpcPitchDev.decide(p, CATALOG).is_empty()).is_true()
	p["pitching"] = {"ovr": 63.0, "velocity": 65.0}  # 0.700
	assert_bool(NpcPitchDev.decide(p, CATALOG).is_empty()).is_false()


## 같은 사람은 같은 것을 고른다 — 재현이 안 되면 조사가 안 된다
func test_같은_사람은_같은_것을_고른다() -> void:
	var a: Dictionary = NpcPitchDev.decide(_pitcher(), CATALOG)
	var b: Dictionary = NpcPitchDev.decide(_pitcher(), CATALOG)
	assert_str(String(a["pitch_id"])).is_equal(String(b["pitch_id"]))


## ⚠ **사람마다 달라야 한다.** 다 같은 것을 배우면 리그 전체가 한 구종이다
func test_사람마다_다른_것을_고른다() -> void:
	var seen: Dictionary = {}
	for i in 40:
		var d: Dictionary = NpcPitchDev.decide(
			_pitcher({"id": "NPC_%d" % i}), CATALOG)
		seen[String(d["pitch_id"])] = true
	assert_int(seen.size()).override_failure_message(
		"40명이 %d종만 고른다 — %s" % [seen.size(), str(seen.keys())]) \
		.is_greater(2)


# ── 한 주 진행 (02 주간 루프 3112-3139) ──────────────────────────

## 8주면 새 구종이 숙련도 1로 들어온다
func test_여덟_주면_새_구종이_들어온다() -> void:
	var p: Dictionary = _pitcher()
	p["pitch_training"] = {"pitch_id": "slider", "progress": 0.0, "is_new": true}
	for i in 7:
		NpcPitchDev.advance_week(p)
		assert_int((p["pitches"] as Array).size()).override_failure_message(
			"%d주 만에 들어왔다 — 8주여야 한다" % (i + 1)).is_equal(0)
	NpcPitchDev.advance_week(p)
	assert_int((p["pitches"] as Array).size()).is_equal(1)
	assert_str(String(p["pitches"][0]["id"])).is_equal("slider")
	assert_int(int(p["pitches"][0]["grade"])).is_equal(1)
	# 끝나면 자리를 비운다 — 안 비우면 같은 구종을 영원히 배운다
	assert_bool((p.get("pitch_training", {}) as Dictionary).is_empty()).is_true()


## 숙련도 2 → 3 — **지금 숙련도로 속도가 정해진다**(주당 100/12).
##
## ⚠ **12주가 아니라 13주다.** `100/12`를 열두 번 더해도 부동소수 누적이라
## 100에 아주 조금 못 미친다. **02도 f64라 같은 값이 나온다** — 주석의
## "12주"는 뜻이고, 실제로 도는 값은 `100.0 / 12.0`이다.
## 검사를 실측에 맞춘다(값을 만지면 02와 갈린다)
func test_숙련도에_따라_주가_다르다() -> void:
	var p: Dictionary = _pitcher({"pitches": [{"id": "slider", "grade": 2}]})
	p["pitch_training"] = {"pitch_id": "slider", "progress": 0.0, "is_new": false}
	for i in 12:
		NpcPitchDev.advance_week(p)
		assert_int(int(p["pitches"][0]["grade"])).override_failure_message(
			"%d주 만에 올랐다 — 8주(숙련도 1)짜리 속도를 쓴 것이다" % (i + 1)) \
			.is_equal(2)
	NpcPitchDev.advance_week(p)
	assert_int(int(p["pitches"][0]["grade"])).is_equal(3)


## ⚠ **상한 다섯이다** (02 `pitches.len() < 5`). 안 막으면 무한히 는다
func test_다섯이_상한이다() -> void:
	var five: Array = []
	for id in ["fastball", "slider", "curve", "changeup", "forkball"]:
		five.append({"id": id, "grade": 1})
	var p: Dictionary = _pitcher({"pitches": five})
	p["pitch_training"] = {"pitch_id": "cutter", "progress": 99.0, "is_new": true}
	NpcPitchDev.advance_week(p)
	assert_int((p["pitches"] as Array).size()).is_equal(5)


## 숙련도 5는 더 안 오른다
func test_마스터는_더_안_오른다() -> void:
	var p: Dictionary = _pitcher({"pitches": [{"id": "slider", "grade": 5}]})
	p["pitch_training"] = {"pitch_id": "slider", "progress": 99.0, "is_new": false}
	NpcPitchDev.advance_week(p)
	assert_int(int(p["pitches"][0]["grade"])).is_equal(5)


## 진행 중인 것이 없으면 아무 일도 안 일어난다
func test_훈련이_없으면_아무_일도_없다() -> void:
	var p: Dictionary = _pitcher()
	NpcPitchDev.advance_week(p)
	assert_int((p["pitches"] as Array).size()).is_equal(0)


# ── 주간 성장에 붙었나 (형태 ① — 엔진만 있고 호출 0) ─────────────

## 🔴 **엔진만 만들고 아무도 안 부르면 없는 것과 같다.** 이 저장소에서
## 일곱 번 나온 형태다 — `NpcGrowth.grow_one`이 실제로 부르는지 본다
func test_주간_성장이_구종을_굴린다() -> void:
	var p: Dictionary = _pitcher()
	p["pitch_training"] = {"pitch_id": "slider", "progress": 90.0, "is_new": true}
	NpcGrowth.grow_one(p, "season", {}, 0.5)
	assert_int((p["pitches"] as Array).size()).override_failure_message(
		"주간 성장이 구종 훈련을 안 굴린다").is_equal(1)


## ⚠ **대상은 오프시즌에만 정한다** (02 `phase == "offseason"`).
## 시즌 중에 갈아타면 아무것도 못 끝낸다
func test_대상은_오프시즌에만_정한다() -> void:
	var p: Dictionary = _pitcher()
	NpcGrowth.grow_one(p, "season", {}, 0.5)
	assert_bool((p.get("pitch_training", {}) as Dictionary).is_empty()) \
		.override_failure_message("시즌 중에 대상을 정했다").is_true()
	NpcGrowth.grow_one(p, "offseason", {}, 0.5)
	assert_bool((p.get("pitch_training", {}) as Dictionary).is_empty()) \
		.override_failure_message("오프시즌인데 대상을 안 정했다").is_false()


## 타자는 구종을 안 배운다.
##
## ⚠ **`batting`을 줘야 이 검사가 무언가를 본다.** 처음엔 안 줬는데, 그러면
## `grow_one`이 능력치 사전이 없다고 **구종 자리에 닿기도 전에 돌아간다** —
## 변이로 "타자도 배운다"를 넣었는데 안 잡혀서 알았다.
## **통과하는데 아무것도 안 보는 검사**였다
func test_타자는_안_배운다() -> void:
	var bat: Dictionary = {"ovr": 70.0}
	for k in ["contact", "power", "eye", "discipline", "speed", "instinct",
			"bunting", "platoon", "fielding", "arm", "clutch"]:
		bat[k] = 65.0
	var p: Dictionary = _pitcher({"player_type": "batter", "position": "CF",
		"batting": bat})
	NpcGrowth.grow_one(p, "offseason", {}, 0.5)
	assert_bool((p.get("pitch_training", {}) as Dictionary).is_empty()) \
		.override_failure_message("타자가 구종을 배운다").is_true()


## 🔴 **여러 해를 굴리면 실제로 구종이 는다** — 표만 맞고 안 늘면 소용없다.
##
## ⚠ **능력치를 전부 채운다.** `{ovr, velocity}`만 주고 굴렸더니 성장이
## `PlayerGen.pitching_ovr`로 OVR을 다시 만들면서 **70이 20으로 떨어졌고**
## (나머지 칸이 0이라서다), 그 뒤로는 잠재력 대비 70%를 못 채워 구종을
## 영영 안 골랐다 — **코드가 아니라 fixture가 빈약했던 것이다**
func test_여러_해를_굴리면_구종이_는다() -> void:
	var full: Dictionary = {"ovr": 70.0}
	for k in ["velocity", "command", "control", "movement", "mentality",
			"stamina", "recovery", "clutch", "hold_runners"]:
		full[k] = 65.0
	var p: Dictionary = _pitcher({"pitching": full})
	# 4해 × 52주. 오프시즌은 해마다 한 번만 지나가게 준다
	for year in 4:
		NpcGrowth.grow_one(p, "offseason", {}, 0.5)
		for w in 51:
			NpcGrowth.grow_one(p, "season", {}, 0.5)
	assert_int((p["pitches"] as Array).size()).override_failure_message(
		"4해를 굴렸는데 구종이 %d개다" % (p["pitches"] as Array).size()) \
		.is_greater_equal(3)
