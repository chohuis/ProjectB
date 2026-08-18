extends RefCounted
class_name FaOffers

## 주인공에게 오는 FA 제안 — 02 `player_engine.rs:354-410` `generate_fa_offers`.
##
## 🔴 **04에 이게 없었다.** 리그 전체 FA(`FaMarket`·`FaRunner`)는 도는데
## **주인공 몫을 만드는 코드가 없어서** `fa_market` 화면이 "한 해 더
## 기다린다" 하나만 줬다 — FA가 돼도 고를 게 없었다.
##
## ⚠ **`thread_rng`를 그대로 안 옮긴다.** 02는 매번 다른 제안이 오지만
## 04는 같은 세이브를 다시 열면 같은 제안이 와야 한다 — `Rng`를 거친다.

## 기본액 — 02 `1800 + max(ovr-50,0)*220 + fame*28`
const BASE: float = 1800.0
const OVR_PIVOT: float = 50.0
const OVR_WEIGHT: float = 220.0
const FAME_WEIGHT: float = 28.0

## 미계약이 길수록 값이 떨어진다. **0.72에서 멈춘다**
const UNSIGNED_DROP: float = 0.04
const UNSIGNED_FLOOR: float = 0.72

## 몇 팀이 부르나
const PICKS_MIN: int = 3
const PICKS_MAX: int = 5

## 성적 압박이 지갑을 연다
const WIN_SPAN: float = 0.30

## 안정된 구단은 길게, 흔들리는 구단은 짧게
const STABLE_HIGH: float = 65.0
const STABLE_LOW: float = 35.0

## 계약금 = 연봉 * (bonus_mult + r*0.08)
const BONUS_BASE: float = 0.08
const BONUS_APPEAL: float = 0.12
const BONUS_NOISE: float = 0.08

## 스카우트가 약할수록 값을 잘못 본다
const SCOUT_NOISE: float = 0.25

## 제시 배수 — 02 `0.85 + r*0.35`
const MULT_MIN: float = 0.85
const MULT_SPAN: float = 0.35

## 계약 연수 — 02 `rand(1..4) + year_bias`, 1~5로 자른다
const YEARS_MIN: int = 1
const YEARS_MAX: int = 4
const YEARS_CLAMP_MAX: int = 5

## 조항 확률
const TEAM_OPTION_P: float = 0.35
const PLAYER_OPTION_P: float = 0.25
const NO_TRADE_P: float = 0.20

## 팀 성향을 모를 때 — 02의 `else` 갈래
const NO_PROFILE_BONUS: float = 0.12
const NO_PROFILE_NOISE: float = 0.15


## 시장가. **리그 배수는 `Contract`가 정본이다** — 여기서 표를 또 적으면
## 언젠가 갈린다
static func market_of(ovr: float, fame: float, league_id: String) -> float:
	var base: float = BASE + maxf(ovr - OVR_PIVOT, 0.0) * OVR_WEIGHT \
		+ fame * FAME_WEIGHT
	return base * Contract.league_mult(league_id)


## 미계약 기간에 따른 감가
static func unsigned_drop(weeks: int) -> float:
	return maxf(1.0 - float(weeks) * UNSIGNED_DROP, UNSIGNED_FLOOR)


## 부를 만한 팀들 — **같은 리그 · 자기 팀 제외.**
##
## ✅ **02가 겪은 2군 함정이 04엔 없다.** 02는 실측으로 당했다
## (`faEngine.ts:36-41`): *"KBL은 1군(`_1`)과 2군(`_2`)이 같은 leagueId를
## 쓴다. 그대로 넘기면 FA 제안에 2군이 섞이고 실제로 그리로 이적한다
## (실측: `..._STARS_2`와 3년 계약)."*
##
## **04는 `World.teams_of`가 이미 거른다**(`world.gd:101-106`) — 2군은
## `LEAGUE_*_FARM`이라는 별도 리그로 파생된다. 여기서 또 거르면 **늘 참인
## 죽은 가드**가 된다. 검사가 그 구조를 못 박는다.
##
## ⚠ **처음엔 02를 그대로 옮겨 `_1` 필터를 넣었다** — 04 구조를 안 보고
## 함정만 보고 옮긴 것이다. 검사가 "KBL에 2군이 없다"로 잡았다
static func candidates(league_id: String, my_team: String) -> Array:
	var out: Array = []
	for t in World.teams_of(league_id):
		var id: String = String(t["id"])
		if id == my_team:
			continue
		out.append(id)
	out.sort()
	return out


## 한 팀의 제안 하나
static func offer_of(world: Dictionary, team_id: String, league_id: String,
		market: float, drop: float, r: RandomNumberGenerator) -> Dictionary:
	var prof: Dictionary = TeamProfile.of(world, team_id)

	var win_mult: float = 1.0
	var year_bias: int = 0
	var bonus_mult: float = NO_PROFILE_BONUS
	var noise_span: float = NO_PROFILE_NOISE

	if not prof.is_empty():
		win_mult = 1.0 + (float(prof.get("win_now_pressure", 50.0)) - 50.0) \
			/ 100.0 * WIN_SPAN
		var stability: float = float(prof.get("stability", 50.0))
		year_bias = 1 if stability > STABLE_HIGH \
			else (-1 if stability < STABLE_LOW else 0)
		bonus_mult = BONUS_BASE \
			+ float(prof.get("market_appeal", 50.0)) / 100.0 * BONUS_APPEAL
		noise_span = (100.0 - float(prof.get("scouting_quality", 50.0))) \
			/ 100.0 * SCOUT_NOISE

		# 🔴 **지갑 여유 항은 04에서 안 걸린다.** 02는 여유(`cap - payroll`)가
		# 15% 아래면 압박에 0.6을 곱하는데, **04엔 급여 상한 축이 없다**
		# (`data/*.json`을 세어 봤다). 02도 상한을 모르면 여유를 0.5로 두고
		# (`player_engine.rs:380`) 그러면 문턱(0.15)을 넘으므로 **안 걸린다.**
		#
		# ⚠ **`if 0.5 < 0.15`를 적지 않는다** — 늘 거짓인 죽은 가드가 된다.
		# ⬜ 상한 축이 생기면 그때 이 갈래를 넣는다

	var noise: float = (r.randf() * 2.0 - 1.0) * noise_span
	var mult: float = (MULT_MIN + r.randf() * MULT_SPAN) * win_mult
	var salary: int = int(roundf(market * mult * (1.0 + noise) * drop))
	var years: int = clampi(
		r.randi_range(YEARS_MIN, YEARS_MAX) + year_bias,
		YEARS_MIN, YEARS_CLAMP_MAX)

	return {
		"team_id": team_id,
		"league_id": league_id,
		"salary": salary,
		"duration_years": years,
		"signing_bonus": int(roundf(float(salary)
			* (bonus_mult + r.randf() * BONUS_NOISE))),
		"team_option_years": 1 if r.randf() < TEAM_OPTION_P else 0,
		"player_option_years": 1 if r.randf() < PLAYER_OPTION_P else 0,
		"no_trade": r.randf() < NO_TRADE_P,
	}


## 주인공에게 오는 제안들.
##
## ⚠ **씨앗에 해와 미계약 주를 섞는다** — 한 해 더 기다리면 다른 제안이
## 와야 한다. 안 섞으면 기다릴 이유가 없다
static func generate(state: Dictionary) -> Array:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty():
		return []
	var league_id: String = String(p.get("league_id", ""))
	var pool: Array = candidates(league_id, String(p.get("team_id", "")))
	if pool.is_empty():
		return []

	var weeks: int = int(p.get("fa_unsigned_weeks", 0))
	var market: float = market_of(Contract.core_ovr(p),
		float(p.get("fame", 0.0)), league_id)
	var drop: float = unsigned_drop(weeks)

	var r := RandomNumberGenerator.new()
	r.seed = Rng.mix(["fa_offers", int(state.get("seed", 0)),
		int(state.get("season_year", 0)), weeks, String(p.get("id", ""))])

	var n: int = mini(r.randi_range(PICKS_MIN, PICKS_MAX), pool.size())
	# ⚠ **고르는 것도 난수다** — 늘 앞에서 n개를 쓰면 같은 팀만 부른다
	var picked: Array = pool.duplicate()
	for i in n:
		var j: int = r.randi_range(i, picked.size() - 1)
		var tmp = picked[i]
		picked[i] = picked[j]
		picked[j] = tmp

	var world: Dictionary = state.get("world", {})
	var out: Array = []
	for i in n:
		out.append(offer_of(world, String(picked[i]), league_id, market, drop, r))
	# 연봉 높은 순 — 화면이 정렬을 갖지 않는다
	out.sort_custom(func(a, b) -> bool:
		return int(a["salary"]) > int(b["salary"]))
	return out
