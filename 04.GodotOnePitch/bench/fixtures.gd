extends RefCounted
class_name BenchFixtures

## 벤치·검사가 쓰는 가짜 데이터 — **한 곳에서만 만든다.**
##
## ⚠ 처음엔 `bench/season_bench.gd`와 `tools/run.gd`에 팀 생성이 각각 있었다.
## 그래서 같은 벤치가 954k 투구/초와 783k 투구/초로 다르게 나왔다 —
## 능력치 범위가 조금 달랐기 때문이다. **측정이 두 벌이면 비교가 안 된다.**
## 이 저장소가 반복해서 겪은 "정본이 둘"이라 처음부터 막는다.


## 팀 하나 — [투수 6명, 타자 9명]
##
## 배열 레이아웃
##   투수 [ovr, command, velocity, control, movement, stamina]
##   타자 [ovr, contact, power, eye, discipline, speed]
static func make_team(rng: RandomNumberGenerator) -> Array:
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


static func make_league(rng: RandomNumberGenerator, teams: int) -> Array:
	var out: Array = []
	for t in teams:
		out.append(make_team(rng))
	return out
