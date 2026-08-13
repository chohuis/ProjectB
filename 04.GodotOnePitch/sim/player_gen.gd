extends RefCounted
class_name PlayerGen

## 선수 생성 — M8-1.
##
## 원본: `npc_sim.rs`의 `generate_league_roster` · `tuning.rs`의 재능 분포
##
## ⚠ **여기서 몇 % 어긋나면 리그가 몇 시즌 뒤에 무너진다.** 02가 겪은 것이
## 전부 그 형태다 — 생성이 조금 틀리고, 세대 교체가 그걸 증폭한다:
##
##   · 투수 비율 0.30 → 리그가 30%로 수렴 (로스터는 45%로 만드는데)
##   · 선발 비중 0.55 → 6시즌에 리그 선발 57 → 112명
##   · 천장 고정 → 신입생 전원이 같은 천장
##   · 시드가 학교 이름 길이 → 같은 길이 학교가 같은 난수열
##
## **전부 조용하다.** 오류도 로그도 안 나고, 몇 시즌 뒤에 "리그가 이상하다"로
## 나타난다. 그래서 검사가 큰 표본으로 비율을 직접 잰다.


## 야수 자리. 지명타자는 따로 뽑지 않는다 — 02와 같다
const POSITIONS: Array[String] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]
const PITCHER_POSITIONS: Array[String] = ["SP", "RP", "CP", "P"]

## 투수 중 **선발** 비중.
##
## ⚠ **생성과 충원이 같은 값을 써야 한다.** 02는 신입생 폴백이 0.55,
## `neededPositions`가 0.67이라 선발이 매년 불어나 6시즌에 리그 57 → 112명이
## 됐다(로테이션은 5~6인데 두 배).
##
## 그러면 명목상 선발이 각자 짧게 던져 ERA가 운에 흔들리고, **능력치가
## 성적을 만드는 정도가 무너진다** — 실측 OVR–ERA 상관이 선발 57명일 때
## −0.61인데 112명일 때 −0.19였다
const SP_SHARE_OF_PITCHERS: float = 0.45

## 기본 투수 비율.
##
## ⚠ **여기가 파이프라인 전체의 투수 비율을 정한다.** 0.30이었을 때 고교
## 투수가 23/102팀 미달이었고, 그 부족이 대학·독립·드래프트를 거쳐 프로까지
## 내려가 구단당 투수 총량이 11~13명(하한 21)이 됐다.
## **상류가 마르면 하류에서 아무리 퍼도 안 찬다**
const DEFAULT_PITCHER_RATIO: float = 0.45

## 재능 분포. **천장 배수와 성장 속도를 같이 뽑는다** — 예전엔 속도만 균등
## 난수였고 천장은 고정이라 신입생 전원이 같은 천장이었다
const POT_MULT_MIN: float = 1.05
const POT_MULT_MAX: float = 1.25

## 꼬리에 드는 비율. 고교 신입생 1,020명이면 한 해 약 30명이고, 그중
## 프로까지 가는 건 진로 탈락을 거쳐 훨씬 적다
const TAIL_RATE: float = 0.03
const TAIL_POT_MULT_MIN: float = 1.28
const TAIL_POT_MULT_MAX: float = 1.42
## 꼬리는 **천장과 속도를 같이** 받아야 한다. 천장만 높고 속도가 평범하면
## 전성기가 끝날 때까지 못 닿는다 (실측 25~27세 +1.45/시즌, 28~30세 +0.36)
const TAIL_DEV_MIN: float = 82.0
const TAIL_DEV_MAX: float = 95.0

## 세부 능력치의 흩어짐 — OVR 기준 ±6
const SPREAD: float = 12.0

## 투구 능력치의 OVR 대비 치우침과 가중치. 정본은 여기 하나다
const PITCH_OFFSET: Dictionary = {
	"stamina": -2.0, "velocity": 4.0, "command": -5.0, "control": -3.0,
	"movement": -4.0, "mentality": 0.0, "recovery": -6.0,
	"clutch": -8.0, "hold_runners": -10.0,
}
const PITCH_WEIGHT: Dictionary = {
	"velocity": 2.5, "command": 2.5, "control": 2.0, "movement": 1.5,
	"stamina": 1.5, "mentality": 1.0, "recovery": 0.5,
	"clutch": 0.3, "hold_runners": 0.2,
}
const PITCH_DIVISOR: float = 12.0

const BAT_OFFSET: Dictionary = {
	"contact": -2.0, "power": -5.0, "eye": -3.0, "discipline": -4.0,
	"speed": 0.0, "base_instinct": -5.0, "bunting": -15.0,
	"fielding": -3.0, "arm": -5.0, "batting_clutch": -6.0,
}
const BAT_WEIGHT: Dictionary = {
	"contact": 2.0, "power": 1.8, "eye": 1.5, "discipline": 1.2,
	"speed": 1.3, "base_instinct": 0.7, "bunting": 0.3, "platoon": 0.3,
	"fielding": 1.3, "arm": 0.8, "batting_clutch": 0.6,
}
const BAT_DIVISOR: float = 11.8
## 플래툰은 능력이 아니라 성향이라 중립 고정이다 — OVR 공식엔 들어간다
const PLATOON_FIXED: float = 50.0


static func is_pitcher(position: String) -> bool:
	return PITCHER_POSITIONS.has(position)


static func clamp_stat(v: float) -> float:
	return clampf(roundf(v), 1.0, 99.0)


static func pitching_ovr(p: Dictionary) -> float:
	var w: float = 0.0
	for k in PITCH_WEIGHT:
		w += float(p.get(k, 0.0)) * float(PITCH_WEIGHT[k])
	return clampf(roundf(w / PITCH_DIVISOR), 1.0, 99.0)


static func batting_ovr(b: Dictionary) -> float:
	var w: float = 0.0
	for k in BAT_WEIGHT:
		w += float(b.get(k, PLATOON_FIXED if k == "platoon" else 0.0)) * float(BAT_WEIGHT[k])
	return clampf(roundf(w / BAT_DIVISOR), 1.0, 99.0)


## 로스터 하나를 만든다. **인자 사전 하나만 받는다**
static func roster(p: Dictionary) -> Array:
	# 0명·음수를 따로 막지 않는다 — 아래 `for`가 안 돈다
	var count: int = int(p.get("count", 0))
	var school: String = p.get("school_id", "")
	var year: int = p.get("season_year", 2026)

	# ⚠ **시드를 이름 길이로 만들면 안 된다.** 02가 그랬고, 같은 길이의 학교가
	# **같은 난수열**을 썼다 — 102팀에 길이는 몇 종류뿐이라 충돌이 심했고
	# 실측 투수 비율이 목표 45%인데 32.5%까지 갔다.
	# `Rng.mix`가 글자마다 섞으므로 학교마다 다른 스트림이 된다
	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["roster", school, p.get("team_id", ""), year])

	var pit_ratio: float = p.get("pitcher_ratio", DEFAULT_PITCHER_RATIO)
	var needed: Array = p.get("needed_positions", [])
	var offset: int = int(p.get("id_offset", 0))

	var pit_min: float = p.get("pitching_ovr_min", 45.0)
	var pit_max: float = p.get("pitching_ovr_max", 70.0)
	var bat_min: float = p.get("batting_ovr_min", 45.0)
	var bat_max: float = p.get("batting_ovr_max", 70.0)
	var dev_min: float = p.get("dev_rate_min", 45.0)
	var dev_max: float = p.get("dev_rate_max", 75.0)
	# 천장은 **시작 능력치와 다른 상한**을 쓸 수 있다 — 육성선수가 그 경우다
	# (약하게 시작하되 클 수 있어야 한다)
	var pot_base: float = p.get("potential_ovr_max", maxf(pit_max, bat_max))

	var out: Array = []
	for i in count:
		var pos: String = _position_at(needed, i, pit_ratio, rng)
		var pitcher: bool = is_pitcher(pos)

		var ovr_p: float = pit_min + rng.randf() * (pit_max - pit_min)
		var ovr_b: float = bat_min + rng.randf() * (bat_max - bat_min)

		var talent: Array = _sample_talent(dev_min, dev_max,
			rng.randf(), rng.randf(), rng.randf())
		var pot_mult: float = talent[0]
		var dev: float = talent[1]

		var pitching: Dictionary = _make(PITCH_OFFSET, ovr_p, rng)
		_align(pitching, ovr_p, PITCH_WEIGHT, PITCH_DIVISOR)
		pitching["ovr"] = pitching_ovr(pitching)

		var batting: Dictionary = _make(BAT_OFFSET, ovr_b, rng)
		batting["platoon"] = PLATOON_FIXED
		_align(batting, ovr_b, BAT_WEIGHT, BAT_DIVISOR)
		batting["ovr"] = batting_ovr(batting)

		# ⚠ **천장이 현재 능력치보다 낮으면 성장이 즉시 멈춘다**
		var cur: float = maxf(pitching["ovr"], batting["ovr"])
		var potential: float = clampf(pot_base * pot_mult, cur, 99.0)

		out.append({
			"id": "GEN_%s_Y%d_%03d" % [school, year, offset + i + 1],
			"position": pos,
			"player_type": "pitcher" if pitcher else "batter",
			"team_id": p.get("team_id", ""),
			"league_id": p.get("league_id", ""),
			"school_id": school,
			"age": int(p.get("age", 16)),
			"grade": int(p.get("grade", 1)),
			"career_status": "active",
			"pitching": pitching,
			"batting": batting,
			"potential": potential,
			"development_rate": dev,
			"fatigue": 0.0,
			"condition": 100.0,
		})

	return out


## ⚠ **부족한 자리부터 채운다.** 목록이 모자라면 무작위로 넘어간다 —
## 정본은 호출측이고(그쪽만 현재 로스터를 안다), 여기선 순서대로 쓴다.
##
## 빈 자리 이름은 건너뛴다 — 02가 빈 문자열을 넣었다
static func _position_at(needed: Array, i: int, pit_ratio: float,
		rng: RandomNumberGenerator) -> String:
	# ⚠ **어느 갈래든 정확히 두 번 뽑는다.** 갈래마다 소비가 다르면 앞 선수가
	# 무엇으로 뽑혔느냐에 따라 **뒤쪽 선수의 난수열이 통째로 밀린다** —
	# 같은 학교인데 충원 목록만 달라져도 전혀 다른 세대가 나오고,
	# 재현 조사가 무너진다. 처음에 투수 2회·야수 3회로 써서 실제로 밀렸다
	var r_kind: float = rng.randf()
	var r_pick: float = rng.randf()

	if i < needed.size():
		var want: String = String(needed[i])
		if not want.is_empty():
			return want

	if r_kind < pit_ratio:
		return "SP" if r_pick < SP_SHARE_OF_PITCHERS else "RP"
	return POSITIONS[int(r_pick * POSITIONS.size()) % POSITIONS.size()]


## 천장 배수와 성장 속도를 **함께** 뽑는다
static func _sample_talent(dev_min: float, dev_max: float,
		r_tail: float, r_pot: float, r_dev: float) -> Array:
	if r_tail < TAIL_RATE:
		return [
			TAIL_POT_MULT_MIN + r_pot * (TAIL_POT_MULT_MAX - TAIL_POT_MULT_MIN),
			TAIL_DEV_MIN + r_dev * (TAIL_DEV_MAX - TAIL_DEV_MIN),
		]
	return [
		POT_MULT_MIN + r_pot * (POT_MULT_MAX - POT_MULT_MIN),
		dev_min + r_dev * (dev_max - dev_min),
	]


static func _make(offsets: Dictionary, ovr: float, rng: RandomNumberGenerator) -> Dictionary:
	var out: Dictionary = {}
	for k in offsets:
		out[k] = clamp_stat(ovr + float(offsets[k]) + (rng.randf() - 0.5) * SPREAD)
	return out


## ⚠ **세부 능력치가 OVR과 맞아야 한다.** 어긋나면 화면의 OVR과 실제
## 경기력이 따로 논다 — "70인데 왜 이렇게 못 던지나"가 된다.
##
## 치우침·흩어짐을 준 뒤 가중합이 목표에서 벗어나므로, 그 차이를 **가중치에
## 비례해서** 되돌린다. 고정 항(플래툰)은 안 건드리므로 그만큼의 어긋남은
## 나머지가 흡수한다
static func _align(stats: Dictionary, target: float, weights: Dictionary,
		divisor: float) -> void:
	for _pass in 3:
		var w: float = 0.0
		var total_weight: float = 0.0
		for k in weights:
			var v: float = float(stats.get(k, PLATOON_FIXED if k == "platoon" else 0.0))
			w += v * float(weights[k])
			if stats.has(k) and k != "platoon":
				total_weight += float(weights[k])
		if total_weight <= 0.0:
			return
		var gap: float = target * divisor - w
		if absf(gap) < 0.5:
			return
		var delta: float = gap / total_weight
		for k in weights:
			if stats.has(k) and k != "platoon":
				stats[k] = clamp_stat(float(stats[k]) + delta)
