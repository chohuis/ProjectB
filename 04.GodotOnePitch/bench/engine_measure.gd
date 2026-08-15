extends RefCounted
class_name EngineMeasure

## 경기 엔진 대조 계측 — 02 `scripts/audit-engine.cjs`와 **같은 항목**을 낸다.
##
## ⚠ **대조를 하려면 같은 것을 세야 한다.** 02는 경기당 이닝·득점,
## 9이닝당 피안타·탈삼진·볼넷, ERA, 타율, 삼진율·볼넷율, 홈런을 낸다 —
## 04도 그 아홉을 같은 정의로 센다.
##
## ⚠ **02는 모델이 둘이었다** — NPC 시즌 모델(`season.ts`)과 주인공
## 경기(`match_engine.rs`). 04는 **하나다**(`GameLoop`). 그래서 02의
## "두 모델이 같은 야구를 하는가" 검사는 04에 대응물이 없고, 04의 값은
## 02 두 모델 사이 어딘가에 떨어지는 게 맞다.


static func _pct(v: float) -> String:
	return ("%.3f" % v).trim_prefix("0")


func run(log_line: Callable, fail: Callable, games: int, seed_value: int) -> int:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value

	var outs: int = 0
	var er: float = 0.0
	var h: float = 0.0
	var k: float = 0.0
	var bb: float = 0.0
	var runs: int = 0
	var hr: int = 0
	var pa: int = 0
	var pitches: int = 0

	# ⚠ **진짜 로스터·진짜 경로로 잰다.** 02의 감사도 생성된 로스터로
	# 돌린다 — 합성 선수로 재면 분포가 그 합성값의 그림자다
	var world: Dictionary = World.new_game({"seed": seed_value,
		"season_year": 2027, "name": "김한결",
		"team_id": "TEAM_HS_AEWOL"}).get("world", {})
	var teams: Array = []
	for tid in world.get("rosters", {}):
		if not World.roster_of(world, String(tid)).is_empty():
			teams.append(String(tid))
	if teams.size() < 2:
		fail.call("로스터가 있는 팀이 %d개다" % teams.size())
		return 1

	for g in games:
		var out: Dictionary = MatchDay.play(world,
			String(teams[g % teams.size()]),
			String(teams[(g * 7 + 3) % teams.size()]), rng)
		if not bool(out.get("ok", false)):
			continue
		var res: Dictionary = out["result"]
		pitches += int(out["pitches"])
		runs += int(res.get("home_score", 0)) + int(res.get("away_score", 0))

		# ⚠ **투수 줄과 타자 줄을 각각 센다.** 이닝·실점은 투수 줄이,
		# 홈런·타석은 타자 줄이 정본이다 — 02도 두 줄을 따로 세고
		# "같은 경기를 말하는가"를 대사로 검사한다
		for l in res.get("player_lines", []):
			if String(l.get("role", "")) == "pitcher":
				outs += int(roundf(float(l["ip"]) * 3.0))
				er += float(l["er"])
				h += float(l["h"])
				k += float(l["k"])
				bb += float(l["bb"])
			else:
				hr += int(l.get("hr", 0))
				pa += int(l.get("ab", 0)) + int(l.get("bb", 0))

	var ip: float = float(outs) / 3.0
	if ip <= 0.0:
		fail.call("이닝이 0이다 — 경기가 안 돌았다")
		return 1

	var per9: float = 9.0 / ip
	var gf: float = float(games)
	var ab: float = float(pa) - bb

	log_line.call("  %d경기 · 투구 %d" % [games, pitches])
	log_line.call("  경기당 이닝        %.1f" % (ip / gf))
	log_line.call("  경기당 득점(양팀)   %.1f" % (float(runs) / gf))
	log_line.call("  9이닝당 피안타      %.1f" % (h * per9))
	log_line.call("  9이닝당 탈삼진      %.1f" % (k * per9))
	log_line.call("  9이닝당 볼넷        %.1f" % (bb * per9))
	log_line.call("  리그 ERA          %.2f" % (er * per9))
	if ab > 0.0:
		log_line.call("  타율              %s" % _pct(h / ab))
	if pa > 0:
		log_line.call("  타석당 삼진율      %.2f" % (k / float(pa)))
		log_line.call("  타석당 볼넷율      %.2f" % (bb / float(pa)))
	log_line.call("  경기당 홈런(양팀)   %.1f" % (float(hr) / gf))

	# ⚠ **여기서 판정하지 않는다.** 대조는 사람이 02 값과 나란히 놓고 한다 —
	# 04만의 기대 구간을 여기 적으면 그게 두 번째 기준이 된다
	return 0
