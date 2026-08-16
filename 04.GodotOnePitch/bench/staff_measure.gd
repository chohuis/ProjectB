extends RefCounted
class_name StaffMeasure

## 스태프 대조 계측 — 02 `scripts/test-staff-gen.cjs`가 찍는 **네 줄**을 낸다.
##
## ① 리그별 감독 수 · 평균 전술안목
## ② 고교 ★4+ 팀 vs ★2- 팀 감독 평균
## ③ 부유 구단주 vs 궁핍 구단주 예산지원 평균
## ④ 총원 (감독 · 구단주 · 코치)
##
## **진짜 세계로 잰다** (`World.new_game` → `Staff.ensure_world`).
##
## ⚠ **여기서 판정하지 않는다.** 02 값과 나란히 놓는 건 사람이 한다


static func _avg(vals: Array) -> float:
	if vals.is_empty():
		return 0.0
	var sum: float = 0.0
	for v in vals:
		sum += float(v)
	return sum / float(vals.size())


func run(log_line: Callable, _fail: Callable, seed_value: int) -> int:
	var s: Dictionary = World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var world: Dictionary = s.get("world", {})
	var all: Dictionary = Staff.all_of(world)

	log_line.call("  씨앗 %d" % seed_value)

	# 팀 전력★을 id로 찾을 수 있게 미리 모은다
	var power_of: Dictionary = {}
	var league_of: Dictionary = {}
	for lid in Staff.rules().get("leagues", []):
		for t in World.teams_of(String(lid)):
			power_of[String(t["id"])] = float(t.get("power", 2))
			league_of[String(t["id"])] = String(lid)

	var by_league: Dictionary = {}
	var hs_strong: Array = []
	var hs_weak: Array = []
	var rich: Array = []
	var poor: Array = []
	var counts: Dictionary = {"manager": 0, "owner": 0, "coach": 0}

	for tid in all:
		for p in all[tid]:
			var role: String = String(p.get("role", ""))
			counts[role] = int(counts.get(role, 0)) + 1
			var stats: Dictionary = p.get("stats", {})
			if role == "manager":
				var lid: String = String(p.get("league_id", ""))
				var iq: float = float(stats.get("tactical_iq", 0.0))
				if not by_league.has(lid):
					by_league[lid] = []
				by_league[lid].append(iq)
				if lid == "LEAGUE_HIGHSCHOOL":
					var star: float = float(power_of.get(tid, 3.0))
					if star >= 4.0:
						hs_strong.append(iq)
					elif star <= 2.0:
						hs_weak.append(iq)
			elif role == "owner":
				var w: float = float(TeamProfile.of(world, tid).get(
					"owner_spending_willingness", 50.0))
				var support: float = float(stats.get("budget_support", 0.0))
				# 씀씀이 등급이 정본이다 — 문턱을 계측이 다시 적으면 둘이 된다
				var tier: String = String(Staff.spending_tier(w).get("id", ""))
				if tier == "부유":
					rich.append(support)
				elif tier == "궁핍":
					poor.append(support)

	log_line.call("")
	log_line.call("리그별 감독 평균 전술안목")
	var leagues: Array = by_league.keys()
	leagues.sort()
	for lid in leagues:
		log_line.call("  %-20s 감독 %3d명  평균 %.1f"
			% [lid, (by_league[lid] as Array).size(), _avg(by_league[lid])])

	log_line.call("")
	log_line.call("  고교 ★4+ %d팀 평균 %.1f · ★2- %d팀 평균 %.1f"
		% [hs_strong.size(), _avg(hs_strong), hs_weak.size(), _avg(hs_weak)])
	log_line.call("  부유 구단주 %d명 예산지원 %.1f · 궁핍 %d명 %.1f"
		% [rich.size(), _avg(rich), poor.size(), _avg(poor)])

	log_line.call("")
	log_line.call("  총 %d명 (감독 %d · 구단주 %d · 코치 %d)"
		% [counts["manager"] + counts["owner"] + counts["coach"],
			counts["manager"], counts["owner"], counts["coach"]])
	return 0
