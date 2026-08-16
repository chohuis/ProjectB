extends RefCounted
class_name PromotionMeasure

## 승강 대조 계측 — 02 `scripts/measure-promotion.cjs`와 **같은 항목**을 낸다.
##
## ① 시즌 주 수 · 정기 / 상시 횟수
## ② 총 이동 건수 (정기 / 상시)
## ③ 움직인 선수 수 / 전체
## ④ 이동 횟수 분포
## ⑤ 왕복(방향 전환) 횟수 · 최다
##
## **진짜 세계·진짜 경로**로 잰다 — `PromotionRunner.run`을 `app_root`가
## 부르는 그대로 주 경계마다 부른다.
##
## ⚠ **분모가 02와 다르다.** 02는 1군 300 · 2군 340(합성 로스터 KBL만)이고
## 04는 진짜 세계다. **비율로 견준다.**
##
## ⚠ **여기서 판정하지 않는다.** 02 값과 나란히 놓는 건 사람이 한다


## 02와 같은 구간. 02는 26주를 "정규시즌 근사"로 썼다
const SEASON_WEEKS: int = 26


func run(log_line: Callable, _fail: Callable, seed_value: int) -> int:
	var s: Dictionary = World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var world: Dictionary = s.get("world", {})

	var pro: int = 0
	var farm: int = 0
	for league_id in RosterMaintenance.active_pro_leagues():
		for t in World.teams_of(league_id):
			pro += World.roster_of(world, String(t["id"])).size()
			farm += World.roster_of(world,
				String(t["id"]) + World.FARM_SUFFIX).size()
	log_line.call("  1군 %d명 · 2군 %d명 · 씨앗 %d" % [pro, farm, seed_value])

	# 어디 있었는지로 이동을 센다 — 러너가 세는 수를 그대로 믿지 않는다
	var where: Dictionary = {}
	for league_id in RosterMaintenance.active_pro_leagues():
		for t in World.teams_of(league_id):
			for p in World.roster_of(world, String(t["id"])):
				where[String(p["id"])] = false
			for p2 in World.roster_of(world,
					String(t["id"]) + World.FARM_SUFFIX):
				where[String(p2["id"])] = true

	var moves: Dictionary = {}
	var updown: Dictionary = {}
	var regular_runs: int = 0
	var urgent_runs: int = 0
	var regular_moves: int = 0
	var urgent_moves: int = 0

	for w in range(1, SEASON_WEEKS + 1):
		var day: int = w * Calendar.DAYS_PER_WEEK

		# ⚠ **경기를 실제로 돌린다.** 상시 승강은 부상 대체·부진 대체 사유만
		# 받는데, 경기가 없으면 `npc_injuries`가 비고 `perf`도 없다 —
		# 처음엔 이걸 빼고 재서 **상시가 0건**으로 나왔다.
		# `measure:relations`와 같은 경로다
		var step: Dictionary = DayEngine.advance_to(s, Calendar.DAYS_PER_WEEK)
		for g in step.get("games_today", []):
			GameSim.play(g, step)
		step.erase("games_today")
		step.erase("weeks_crossed")
		s = step
		s["day"] = day

		var out: Dictionary = PromotionRunner.run(s, day)
		var regular: bool = bool(out["regular"])
		if regular:
			regular_runs += 1
		else:
			urgent_runs += 1

		# ⚠ **세계를 매주 다시 잡는다.** `advance_to`가 상태를 깊은 복사하므로
		# 위에서 잡아 둔 `world`는 그 순간 옛 사전이 된다 — 그걸 세면
		# 첫 주 이후 아무 이동도 안 잡힌다
		var now_world: Dictionary = s.get("world", {})
		# 이번 주에 소속이 바뀐 사람을 센다
		var now: Dictionary = {}
		for league_id in RosterMaintenance.active_pro_leagues():
			for t in World.teams_of(league_id):
				for p in World.roster_of(now_world, String(t["id"])):
					now[String(p["id"])] = false
				for p2 in World.roster_of(now_world,
						String(t["id"]) + World.FARM_SUFFIX):
					now[String(p2["id"])] = true
		for pid in now:
			if not where.has(pid) or where[pid] == now[pid]:
				continue
			moves[pid] = int(moves.get(pid, 0)) + 1
			if not updown.has(pid):
				updown[pid] = []
			updown[pid].append("down" if now[pid] else "up")
			if regular:
				regular_moves += 1
			else:
				urgent_moves += 1
		where = now

	log_line.call("")
	log_line.call("  시즌 %d주 · 정기 %d회 · 상시 %d회"
		% [SEASON_WEEKS, regular_runs, urgent_runs])
	log_line.call("  총 이동 %d건 (정기 %d · 상시 %d)"
		% [regular_moves + urgent_moves, regular_moves, urgent_moves])
	log_line.call("  움직인 선수 %d명 / 전체 %d명" % [moves.size(), where.size()])

	var dist: Dictionary = {}
	for pid in moves:
		var n: int = int(moves[pid])
		dist[n] = int(dist.get(n, 0)) + 1
	var counts: Array = dist.keys()
	counts.sort()
	var line: String = ""
	for n in counts:
		line += "%d회 %d명 · " % [n, dist[n]]
	log_line.call("  이동 횟수 분포: %s" % line.trim_suffix(" · "))

	var round_trips: int = 0
	var worst: int = 0
	var worst_id: String = ""
	for pid in updown:
		var seq: Array = updown[pid]
		var rt: int = 0
		for i in range(1, seq.size()):
			if seq[i] != seq[i - 1]:
				rt += 1
		round_trips += rt
		if rt > worst:
			worst = rt
			worst_id = pid
	log_line.call("  왕복(방향 전환) %d회 · 최다 %d회 (%s)"
		% [round_trips, worst, worst_id])

	var churn: int = 0
	for pid in moves:
		if int(moves[pid]) >= 4:
			churn += 1
	log_line.call("  시즌 4회 이상 오르내린 선수: %d명" % churn)
	return 0
