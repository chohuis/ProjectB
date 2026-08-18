extends RefCounted
class_name GrowthMeasure

## NPC 주간 성장을 **진짜 세계로** 재 본다 — M9-8 계측.
##
## 두 가지를 본다:
##
## **① 얼마나 걸리나.** 주간 처리는 하루 진행이 끝난 뒤 한 번에 돈다 —
## 프레임 쪼개기 밖이라 그대로 사용자가 기다리는 시간이다.
##
## **② 세계가 실제로 자라나.** 검사는 한 사람을 본다. 7천 명이 몇 년 뒤에
## 어떤 분포가 되는지는 굴려야 보인다 — 02가 "노화가 통째로 사라진" 것을
## 이런 계측으로 잡았다.


## NPC가 구종을 몇 개나 갖고 있나 — D-3.
##
## 🔴 **이걸 안 내면 구종 성장이 도는지 알 수가 없다.** 04는 NPC `pitches`가
## 늘 비어서 마운드에서 포심만 던졌는데, 계측이 OVR만 내니 아무도 몰랐다
## (형태 ③ — 쌓고 안 읽는다).
##
## ⚠ **29세 이상으로 시작한 투수는 영영 0개다** — 새 구종은 나이가 막고
## 올릴 것도 없다. **02도 그렇다.** 그래서 "0개인 사람"을 따로 센다
static func _pitch_table(log_line: Callable, s: Dictionary,
		fail: Callable) -> void:
	var by_count: Dictionary = {}
	var pitchers: int = 0
	var young_empty: int = 0
	var in_training: int = 0
	var grades: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		if String(p.get("player_type", "")) != "pitcher":
			continue
		pitchers += 1
		var n: int = (p.get("pitches", []) as Array).size()
		by_count[n] = int(by_count.get(n, 0)) + 1
		if n == 0 and int(p.get("age", 0)) < NpcPitchDev.NEW_PITCH_AGE_MAX:
			young_empty += 1
		if not (p.get("pitch_training", {}) as Dictionary).is_empty():
			in_training += 1
		for e in p.get("pitches", []):
			var g: int = int(e.get("grade", 0))
			grades[g] = int(grades.get(g, 0)) + 1

	var line: String = ""
	for n in range(0, NpcPitchDev.MAX_PITCHES + 1):
		line += "%d개 %d명 · " % [n, int(by_count.get(n, 0))]
	log_line.call("")
	log_line.call("NPC 구종 (투수 %d명)" % pitchers)
	log_line.call("  %s" % line.trim_suffix(" · "))
	var gl: String = ""
	for g in range(1, NpcPitchDev.MAX_GRADE + 1):
		gl += "숙련도%d %d · " % [g, int(grades.get(g, 0))]
	log_line.call("  %s" % gl.trim_suffix(" · "))
	log_line.call("  익히는 중 %d명 · 29세 미만인데 0개 %d명"
		% [in_training, young_empty])

	# ⚠ **한 명도 안 배웠으면 배선이 끊긴 것이다.** 실측 없이 "돈다"고 못 한다
	if int(by_count.get(0, 0)) == pitchers:
		fail.call("투수 %d명 전원이 구종 0개다 — 구종 성장이 안 돈다" % pitchers)


func run(log_line: Callable, fail: Callable, weeks: int = 52,
		seed_value: int = 20270101, play_games: bool = false) -> int:
	var s: Dictionary = World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var people: int = SeasonRunner.all_players(s).size()

	log_line.call("NPC 주간 성장 계측 — %d주 · 씨앗 %d · 선수 %d명"
		% [weeks, seed_value, people])
	log_line.call("")
	_ovr_table(log_line, s, "시작")

	var worst: float = 0.0
	var total: float = 0.0
	var leveled: int = 0
	var aged: int = 0
	for w in weeks:
		# ⚠ **기본은 경기 없이 돈다.** 여기서 재려는 건 성장 자체의 비용이다 —
		# 경기까지 넣으면 `bench:day`와 같은 것을 두 번 재게 된다.
		#
		# ⚠ **그런데 그러면 성적 항이 영영 안 걸린다** (D-2, 2026-08-17).
		# `perf_window`는 치른 경기 줄을 읽는데 경기가 없으니 늘 빈 사전이고,
		# 성장은 **전부 `NO_PERF_BASE` 갈래로만** 돈다 — 실제 게임과 다른
		# 경로를 재고 있었다. `--games`로 진짜 경로를 켠다
		if play_games:
			var day_out: Dictionary = DayEngine.advance_to(s, Calendar.DAYS_PER_WEEK)
			for g in day_out.get("games_today", []):
				GameSim.play(g, day_out)
			day_out.erase("games_today")
			day_out.erase("weeks_crossed")
			s = day_out
		s["day"] = (w + 1) * Calendar.DAYS_PER_WEEK
		var t0: int = Time.get_ticks_usec()
		var out: Dictionary = NpcGrowth.run(s)
		var ms: float = float(Time.get_ticks_usec() - t0) / 1000.0
		worst = maxf(worst, ms)
		total += ms
		leveled += int(out["leveled"])
		aged += int(out["aged"])

	log_line.call("")
	log_line.call("한 주  평균 %.0fms · 최악 %.0fms" % [total / maxf(weeks, 1), worst])
	log_line.call("%d주 합계  능력 +%d칸 · 노화 %d건" % [weeks, leveled, aged])
	log_line.call("사람당 한 해 %.2f칸" % (float(leveled) / maxf(people, 1)))
	log_line.call("")
	_ovr_table(log_line, s, "%d주 뒤" % weeks)
	_age_growth_table(log_line, s)
	_pitch_table(log_line, s, fail)

	# ⚠ **주간 처리는 프레임 쪼개기 밖이다.** 하루 진행(게이트 1.0초)에
	# 얹히는 값이라 여기서 크면 그대로 멈칫거림이 된다
	if worst > 300.0:
		fail.call("주간 성장 최악 %.0fms — 기준 300ms" % worst)
	# 아무도 안 자라면 배선이 끊긴 것이다. 실측 없이 "돈다"고 못 한다
	if leveled == 0:
		fail.call("%d주를 돌렸는데 아무도 안 자랐다" % weeks)

	# ⚠ **노화를 잴 대상이 세계에 없다.** 새 게임 세계는 리그마다 나이가
	# 한 값으로 고정이라(`World.RULES`의 `age`) 프로가 전원 26·27세다 —
	# 30세 이상이 0명이라 노화가 도는지 여기선 못 본다.
	# **세계 생성 쪽 빚이고 검사(`npc_growth_test`)가 대신 본다**
	var old: int = 0
	var in_debt: int = 0
	for p in SeasonRunner.all_players(s):
		if int(p.get("age", 0)) < NpcGrowth.AGING_FROM:
			continue
		old += 1
		if not p.get("aging_debt", {}).is_empty():
			in_debt += 1
	log_line.call("")
	log_line.call("30세 이상 %d명 · 노화 빚이 쌓인 사람 %d명" % [old, in_debt])
	if old == 0:
		fail.call("30세 이상이 0명이다 — 세계 생성이 나이를 안 흩었다")
		return 0
	# ⚠ **한 칸 내리는 데 11~21주가 걸린다.** 주당 감퇴가 1보다 작아서
	# 빚으로 쌓이기 때문이다 — 짧게 돌리면 "안 내렸다"가 정상이다
	if in_debt == 0:
		fail.call("30세 이상 %d명인데 노화 빚이 하나도 안 쌓였다" % old)
	elif weeks >= 26 and aged == 0:
		fail.call("30세 이상 %d명인데 %d주 동안 한 번도 안 내렸다" % [old, weeks])
	return 0


func _ovr_of(p: Dictionary) -> float:
	if String(p.get("player_type", "pitcher")) == "pitcher":
		return float(p.get("pitching", {}).get("ovr", 0.0))
	return float(p.get("batting", {}).get("ovr", 0.0))


## 리그별 평균 OVR — **리그 사이 간격이 유지되는지**가 여기 보인다.
## 좁아지면 승격이 뜻을 잃는다
func _ovr_table(log_line: Callable, s: Dictionary, label: String) -> void:
	var sum: Dictionary = {}
	var cnt: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		var l: String = String(p.get("league_id", "없음"))
		sum[l] = float(sum.get(l, 0.0)) + _ovr_of(p)
		cnt[l] = int(cnt.get(l, 0)) + 1

	var keys: Array = sum.keys()
	keys.sort()
	log_line.call("%s — 리그 평균 OVR" % label)
	for k in keys:
		log_line.call("  %-20s %5.1f  (%d명)" % [k, sum[k] / cnt[k], cnt[k]])


## 나이대별 한 해 변화. **30대가 안 내려가면 노화가 안 도는 것이다**
func _age_growth_table(log_line: Callable, s: Dictionary) -> void:
	var by: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		var b: int = int(p.get("age", 0)) / 5 * 5
		var e: Array = by.get(b, [0.0, 0])
		by[b] = [e[0] + _ovr_of(p), e[1] + 1]

	var keys: Array = by.keys()
	keys.sort()
	log_line.call("")
	log_line.call("나이대별 평균 OVR")
	for k in keys:
		var e: Array = by[k]
		log_line.call("  %2d~%2d  %5.1f  (%d명)" % [k, k + 4, e[0] / e[1], e[1]])
