extends SceneTree

## P0 게이트 — GDScript가 한 시즌을 감당하는가.
##
##   godot --headless --script bench/season_bench.gd
##
## 재는 것: 고교 한 시즌 규모(102팀 × 24경기 ≈ 1,224경기)를 투구 단위로
## 끝까지 돌리는 시간. 실측 기준선은 `02.SvelteElectron` 쪽이며, 거기서는
## 한 커리어(고교 3년)가 30회 병렬로 45분 걸렸다.
##
## **게이트: 데스크톱 2초 이하.**
## 못 넘으면 순서대로 ① 먼 리그 거칠게 ② 무거운 부분만 GDExtension ③ C# 재검토.
##
## ⚠ 배경 리그도 같이 잰다. 실제 한 주에 도는 건 고교만이 아니다 —
## 대학·독립·프로까지 합치면 경기 수가 배 이상이다. 고교만 재고 통과라고
## 하면 본 이주에서 다시 막힌다.

const HS_TEAMS: int = 102
const HS_GAMES_PER_TEAM: int = 24
## 다른 리그(대학·독립·KBL·2군·ABL·JBL) 몫 — 실제 규모의 어림
const OTHER_LEAGUE_GAMES: int = 900

func _init() -> void:
	var sim := MatchSim.new()
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260813

	# ── 로스터 생성 ────────────────────────────────────────────
	# 팀마다 만들면 측정에 생성 비용이 섞인다. 미리 만들어 돌려 쓴다
	var rosters: Array = []
	for t in HS_TEAMS:
		rosters.append(_make_team(rng))

	var hs_games: int = int(HS_TEAMS * HS_GAMES_PER_TEAM / 2.0)
	var total_games: int = hs_games + OTHER_LEAGUE_GAMES

	print("── P0 게이트: 한 시즌 시뮬 ──")
	print("  고교 %d경기 + 타리그 %d경기 = %d경기" % [hs_games, OTHER_LEAGUE_GAMES, total_games])
	print("  Godot %s" % Engine.get_version_info().string)
	print("")

	# 예열 — 첫 호출은 스크립트 컴파일·캐시가 섞인다
	for i in 20:
		var w: Array = rosters[i % HS_TEAMS]
		var l: Array = rosters[(i + 1) % HS_TEAMS]
		sim.sim_game(w[0], l[0], w[1], l[1], i)

	# ── 본 측정 ────────────────────────────────────────────────
	var t0: int = Time.get_ticks_usec()
	var total_pitches: int = 0
	var total_runs: int = 0

	for g in total_games:
		var h: Array = rosters[g % HS_TEAMS]
		var a: Array = rosters[(g * 7 + 3) % HS_TEAMS]
		var r: PackedInt32Array = sim.sim_game(h[0], a[0], h[1], a[1], g)
		total_runs += r[0] + r[1]
		total_pitches += r[2]

	var elapsed_us: int = Time.get_ticks_usec() - t0
	var elapsed_s: float = elapsed_us / 1_000_000.0

	print("  경과            %.3f초" % elapsed_s)
	print("  총 투구         %s" % _comma(total_pitches))
	print("  경기당 투구     %.1f" % (float(total_pitches) / total_games))
	print("  경기당 득점     %.2f" % (float(total_runs) / total_games))
	print("  투구 처리율     %s /초" % _comma(int(total_pitches / maxf(elapsed_s, 0.0001))))
	print("")
	var verdict := "통과" if elapsed_s <= 2.0 else "미달"
	print("  게이트 2.0초 → %s" % verdict)
	if elapsed_s > 2.0:
		print("  → ① 먼 리그 거칠게 ② 무거운 부분 GDExtension ③ C# 재검토")

	# 결과가 말이 되는지도 같이 본다 — 빠르기만 하고 야구가 아니면 의미 없다
	var pg: float = float(total_pitches) / total_games
	var rg: float = float(total_runs) / total_games
	if pg < 150.0 or pg > 400.0:
		print("  ⚠ 경기당 투구가 이상하다 (정상 250~330) — 시뮬이 조기 종료됐을 수 있다")
	if rg < 3.0 or rg > 20.0:
		print("  ⚠ 경기당 득점이 이상하다 (정상 6~12)")

	quit()


## 팀 하나 — [투수 6명, 타자 9명]
##
## 배열 레이아웃
##   투수 [ovr, command, velocity, control, movement, stamina]
##   타자 [ovr, contact, power, eye, discipline, speed]
func _make_team(rng: RandomNumberGenerator) -> Array:
	var pitchers: Array[PackedFloat32Array] = []
	for i in 6:
		# 선발이 좋고 뒤로 갈수록 떨어진다
		var base: float = 72.0 - i * 3.0 + rng.randf_range(-6.0, 6.0)
		var p := PackedFloat32Array()
		p.append(base)
		p.append(base + rng.randf_range(-5.0, 5.0))
		p.append(base + rng.randf_range(-5.0, 5.0))
		p.append(base + rng.randf_range(-5.0, 5.0))
		p.append(base + rng.randf_range(-5.0, 5.0))
		p.append(60.0 + rng.randf_range(-10.0, 15.0))
		pitchers.append(p)

	var batters: Array[PackedFloat32Array] = []
	for i in 9:
		var base: float = 68.0 + rng.randf_range(-8.0, 8.0)
		var b := PackedFloat32Array()
		b.append(base)
		b.append(base + rng.randf_range(-6.0, 6.0))
		b.append(base + rng.randf_range(-8.0, 8.0))
		b.append(base + rng.randf_range(-6.0, 6.0))
		b.append(base + rng.randf_range(-6.0, 6.0))
		b.append(base + rng.randf_range(-8.0, 8.0))
		batters.append(b)

	return [pitchers, batters]


func _comma(n: int) -> String:
	var s := str(n)
	var out := ""
	var c := 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		c += 1
		if c % 3 == 0 and i > 0:
			out = "," + out
	return out
