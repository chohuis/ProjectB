extends RefCounted
class_name NpcGrowth

## NPC 주간 성장·노화 — M9-8.
##
## 원본: `npc_sim.rs`의 `calc_weekly_npc_growth` · `usecases/weekPhases/growth.ts`
##
## ⚠ **주인공만 매주 자라고 있었다.** NPC는 시즌 종료 때 나이만 먹었다 —
## 몇 시즌 지나면 주인공이 세계에서 혼자 뛰어오르고, 드래프트 앵커·수상
## 자격선이 전부 그 어긋난 분포 위에 선다.
##
## ⚠ **여기는 주인공 경로(`TrainingGrowth`)와 다른 표를 쓴다.** 02가 실제로
## 둘로 나뉘어 있다 — 주인공은 `growth_engine.rs`, NPC는 `npc_sim.rs`.
## 값이 다른 자리가 셋이다:
##
##   · 천장 감쇠: 주인공은 바닥 0.10, NPC는 **1.0에 닿으면 0.00**
##   · 나이 계수: 주인공은 훈련 효율(1.00~0.45), NPC는 성장 속도(1.80~0.00)
##   · 노화: 주인공은 시즌 끝 한 번, NPC는 **매주 누적분(debt)으로**
##
## **하나로 합치지 않는다** — 밸런스 동결이라 값을 못 바꾸고, 합치면 어느
## 쪽 값을 버릴지부터 정해야 한다. 이주가 끝난 뒤에 볼 일이다.


# ── 나이 ──────────────────────────────────────────────────────
#
# ⚠ **33세부터 0이다.** 성장이 완전히 멈춘다는 뜻이고, 그때부터는 아래
# 노화만 남는다. 02 `generation_rules.json`의 `growthRules.xp.ageBands` 값.

## `[상한 나이, 계수]` — 위에서부터 처음 걸리는 것
const AGE_BANDS: Array[Array] = [
	[18, 1.80], [21, 1.41], [24, 0.71], [27, 0.52], [30, 0.22], [32, 0.08],
]
const AGE_FACTOR_OLD: float = 0.00


static func age_factor(age: int) -> float:
	for b in AGE_BANDS:
		if age <= int(b[0]):
			return float(b[1])
	return AGE_FACTOR_OLD


# ── 팀 환경 ───────────────────────────────────────────────────
#
# ⚠ **02는 `t.tier`를 읽었는데 국내 팀엔 그 필드가 없었다.** 182팀 전부
# "독립"(0.78)으로 떨어졌다. 리그에서 파생한다.
#
# ⚠ **대학(1.15)이 고교(1.05)보다 높다.** 예전엔 반대였고(대학 0.95),
# 고교 출신이 대학에 가면 성장이 오히려 느려져서 **대학 후보가 5년에 걸쳐
# 220 → 1로 말라붙었다.**

const FACILITY_FACTOR: Dictionary = {
	"1군": 1.00, "2군": 0.92, "대학": 1.15, "고교": 1.05,
}
const FACILITY_DEFAULT: float = 0.85

## 리그 → 시설 등급. `facilityTierOf`가 하던 일이다
const LEAGUE_TIER: Dictionary = {
	"LEAGUE_KBL": "1군", "LEAGUE_ABL": "1군", "LEAGUE_JBL": "1군",
	"LEAGUE_KBL_FARM": "2군", "LEAGUE_ABL_FARM": "2군", "LEAGUE_JBL_FARM": "2군",
	"LEAGUE_UNIVERSITY": "대학",
	"LEAGUE_HIGHSCHOOL": "고교",
}

## 스태프가 아직 없다. **식은 02 그대로 두고 값만 중립을 넣는다** — 나중에
## 감독·코치를 옮길 때 값만 바뀌고 모양은 안 바뀐다
const DEFAULT_MANAGER: float = 50.0
const DEFAULT_COACH: float = 50.0
const MANAGER_BASE: float = 0.75
const MANAGER_SCALE: float = 250.0
const COACH_BASE: float = 0.80
const COACH_SCALE: float = 200.0

## 시기 배수 — 오프시즌에 제일 많이 는다
const PHASE_TRAIN_MULT: Dictionary = {
	"offseason": 1.50, "preseason": 1.25, "postseason": 0.85, "season": 1.00,
}


static func facility_factor(league_id: String) -> float:
	return FACILITY_FACTOR.get(LEAGUE_TIER.get(league_id, ""), FACILITY_DEFAULT)


static func training_factor(league_id: String, phase: String,
		manager: float = DEFAULT_MANAGER, coach: float = DEFAULT_COACH) -> float:
	var fac: float = facility_factor(league_id)
	var mgr: float = MANAGER_BASE + manager / MANAGER_SCALE
	var cch: float = COACH_BASE + coach / COACH_SCALE
	return fac * mgr * cch * float(PHASE_TRAIN_MULT.get(phase, 1.00))


# ── 성적 ──────────────────────────────────────────────────────

## 성적이 좋으면 더 는다. 성적이 없으면 1.00 — 못한 게 아니라 모르는 것이다
static func quality_factor(perf: Dictionary, player_type: String) -> float:
	if player_type == "pitcher":
		if not perf.has("era"):
			return 1.00
		var era: float = float(perf["era"])
		if era < 2.5:
			return 1.40
		if era < 3.5:
			return 1.15
		if era < 4.5:
			return 1.00
		if era < 6.0:
			return 0.80
		return 0.60
	if not perf.has("avg"):
		return 1.00
	var avg: float = float(perf["avg"])
	if avg > 0.300:
		return 1.40
	if avg > 0.270:
		return 1.15
	if avg > 0.240:
		return 1.00
	if avg > 0.200:
		return 0.80
	return 0.60


const PHASE_WEIGHT: Dictionary = {
	"offseason": 0.70, "preseason": 0.80, "postseason": 0.85, "season": 1.00,
}
## 성적이 없을 때의 기준값
const NO_PERF_BASE: float = 0.70
## "성적 없음"을 나타내는 빈 사전. **읽기만 한다** — 루프에서 `{}`를 만들면
## 사람마다 할당이 하나씩 는다
const NO_PERF: Dictionary = {}
## 경기 수 포화점
const GAMES_FULL: float = 5.0


## ⚠ **02는 `gamesPlayed`를 늘 1로 넣었다.** 그래서 `games` 항이 언제나
## 0.2이고, 성적이 **있는** 선수의 기준값이 0.2×품질(최대 0.28)로 성적이
## **없는** 선수의 0.70보다 낮다 — 뛰면 손해다.
##
## 뒤집힌 게 맞다고 보지만 **밸런스 동결이라 그대로 옮긴다.** 이주 뒤에
## 볼 목록에 있다. 여기서 고치면 02 실측값과 대조가 안 된다
static func perf_factor(perf: Dictionary, phase: String, player_type: String) -> float:
	var weight: float = float(PHASE_WEIGHT.get(phase, 1.00))
	if perf.is_empty():
		return NO_PERF_BASE * weight
	var games: float = minf(float(perf.get("games_played", 0)) / GAMES_FULL, 1.0)
	return games * quality_factor(perf, player_type) * weight


# ── XP ────────────────────────────────────────────────────────

## 월간 2.5를 4.3주로 나눈 주간분
const BASE_WEEKLY_XP: float = 2.5 / 4.3
## 투/타 배율. 타자가 올려야 할 스탯이 많아 배율이 크다
const MULT_PITCHER: float = 30.0
const MULT_BATTER: float = 39.0
## 개인 편차
const RAND_MIN: float = 0.85
const RAND_SPAN: float = 0.30
## 성장률 기준선
const DEV_BASE: float = 50.0

## 잠재력 범위와 속도 배율 (0.80~1.20)
const POT_MIN: float = 60.0
const POT_MAX: float = 99.0
const SPEED_BASE: float = 0.80
const SPEED_SPAN: float = 0.40


static func speed_factor(potential: float) -> float:
	var p: float = clampf(potential, POT_MIN, POT_MAX)
	return SPEED_BASE + (p - POT_MIN) / (POT_MAX - POT_MIN) * SPEED_SPAN


## ⚠ **주인공 쪽(`Growth.potential_cap_factor`)과 다르다.** 여기는 천장에
## 닿으면 **0**이다 — NPC는 잠재력을 넘지 않는다. 주인공은 0.10을 열어 둔다
## (0이면 화면엔 "성장 중"인데 아무 일도 안 일어나서)
static func potential_cap(current: float, potential: float) -> float:
	if potential <= 0.0:
		return 1.0
	var ratio: float = current / potential
	if ratio >= 1.00:
		return 0.00
	if ratio < 0.75:
		return 1.00
	if ratio < 0.85:
		return 0.70
	if ratio < 0.95:
		return 0.35
	return 0.10


## 나이에 따라 **성장 방향이 바뀐다.** 어릴 땐 구속, 다음엔 제구, 나중엔
## 경험 — 이게 없으면 35세 투수가 구속을 올린다
const PITCH_XP_YOUNG: Array[Array] = [
	["velocity", 0.35], ["command", 0.30], ["control", 0.20], ["movement", 0.15]]
const PITCH_XP_PRIME: Array[Array] = [
	["command", 0.40], ["control", 0.35], ["velocity", 0.15], ["movement", 0.10]]
const PITCH_XP_OLD: Array[Array] = [
	["mentality", 0.50], ["recovery", 0.30], ["command", 0.20]]

const BAT_XP_YOUNG: Array[Array] = [
	["contact", 0.35], ["eye", 0.25], ["speed", 0.20], ["power", 0.20]]
const BAT_XP_PRIME: Array[Array] = [
	["contact", 0.40], ["power", 0.35], ["eye", 0.25]]
const BAT_XP_OLD: Array[Array] = [
	["eye", 0.50], ["discipline", 0.30], ["batting_clutch", 0.20]]

const XP_YOUNG_MAX: int = 23
const XP_PRIME_MAX: int = 28


static func xp_weights(player_type: String, age: int) -> Array[Array]:
	if player_type == "pitcher":
		if age <= XP_YOUNG_MAX:
			return PITCH_XP_YOUNG
		if age <= XP_PRIME_MAX:
			return PITCH_XP_PRIME
		return PITCH_XP_OLD
	if age <= XP_YOUNG_MAX:
		return BAT_XP_YOUNG
	if age <= XP_PRIME_MAX:
		return BAT_XP_PRIME
	return BAT_XP_OLD


# ── 노화 ──────────────────────────────────────────────────────

const AGING_FROM: int = 30

## `[상한 나이, {스탯: 연간 감퇴}]`
const AGING_PITCH: Array[Array] = [
	[32, {"velocity": 1.00, "stamina": 0.80, "recovery": 0.20,
		"command": 0.30, "control": 0.30}],
	[35, {"velocity": 2.50, "stamina": 2.00, "recovery": 0.50,
		"command": 3.20, "control": 3.00}],
	[999, {"velocity": 4.00, "stamina": 3.50, "recovery": 0.80,
		"command": 5.00, "control": 4.50}],
]
const AGING_BAT: Array[Array] = [
	[32, {"speed": 0.80, "power": 0.50}],
	[35, {"speed": 2.00, "power": 1.50}],
	[999, {"speed": 3.50, "power": 2.80}],
]

## 성적이 좋으면 덜 무너진다
const AGING_PERF_GOOD: float = 0.80
const AGING_PERF_BAD: float = 1.20
const AGING_OFFSEASON: float = 0.85
const WEEKS_PER_YEAR: float = 52.0


static func aging_yearly(player_type: String, age: int) -> Dictionary:
	var table: Array[Array] = AGING_PITCH if player_type == "pitcher" else AGING_BAT
	for b in table:
		if age <= int(b[0]):
			return b[1]
	return table[table.size() - 1][1]


## 노화 관리 배율 — 성적과 시기가 속도를 바꾼다
static func aging_mult(perf: Dictionary, phase: String, player_type: String) -> float:
	var perf_mod: float = 1.00
	if not perf.is_empty():
		var q: float = quality_factor(perf, player_type)
		if q >= 1.15:
			perf_mod = AGING_PERF_GOOD
		elif q < 1.00:
			perf_mod = AGING_PERF_BAD
	return perf_mod * (AGING_OFFSEASON if phase == "offseason" else 1.00)


## ⚠ **감퇴를 스탯에서 곧바로 빼면 노화가 통째로 사라진다.**
##
## 능력치는 정수로 반올림되는데 주당 감퇴는 연 2.5를 52로 나눈 **0.048**이라
## 75 − 0.048 = 74.95 → 75로 되돌아간다. 02에서 **전 연령이 무변화**였고,
## 1군 31세 이상 117명이 한 시즌 동안 하나도 안 변했다. 베테랑이 자리를
## 안 비우니 2군 유망주가 올라갈 자리도 없었다.
##
## 성장은 XP를 쌓아 문턱에서 +1 하므로 멀쩡했다. 노화도 같은 방식으로
## `debt`에 쌓아 1.0을 넘을 때 −1 한다.
##
## `stats`·`debt`를 **제자리에서** 고친다. 뭔가 내려갔으면 `true`
static func apply_aging(stats: Dictionary, debt: Dictionary, age: int,
		perf: Dictionary, phase: String, player_type: String) -> bool:
	if age < AGING_FROM:
		return false
	var mult: float = aging_mult(perf, phase, player_type)
	var yearly: Dictionary = aging_yearly(player_type, age)
	var dropped: bool = false
	for stat in yearly:
		if not stats.has(stat):
			continue
		var acc: float = float(debt.get(stat, 0.0)) \
			+ float(yearly[stat]) / WEEKS_PER_YEAR * mult
		var drop: float = floorf(acc)
		if drop >= 1.0:
			stats[stat] = PlayerGen.clamp_stat(float(stats[stat]) - drop)
			debt[stat] = acc - drop
			dropped = true
		else:
			debt[stat] = acc
	return dropped


# ── 한 사람 ───────────────────────────────────────────────────

## 결과를 **정수 하나**에 담는다.
##
## ⚠ **사람마다 사전을 만들면 주에 7,000개 할당이다.** `RefCounted` 할당이
## GDScript의 주 병목이고, 여기는 하루 진행(게이트 1.0초) 뒤에 그대로
## 얹히는 자리다. 비트 0이 노화, 나머지가 올린 칸 수다
static func leveled_of(result: int) -> int:
	return result >> 1


static func aged_of(result: int) -> bool:
	return (result & 1) == 1


## NPC 하나의 한 주. **제자리에서 고친다** — 7,000명분 사전을 복사하면
## 그것만으로 주간 처리가 게이트를 넘는다.
##
## 결과는 `leveled_of` · `aged_of`로 읽는다.
##
## `training` 인자는 그 리그·시기의 훈련 계수다. **부르는 쪽이 캐시한다** —
## 리그가 아홉인데 사람마다 다시 계산할 이유가 없다
static func grow_one(npc: Dictionary, phase: String, perf: Dictionary,
		rand01: float, training: float = -1.0) -> int:
	var age: int = int(npc.get("age", 25))
	var player_type: String = String(npc.get("player_type", "pitcher"))
	var potential: float = clampf(float(npc.get("potential_hidden", 75.0)),
		POT_MIN, POT_MAX)

	var is_pitcher: bool = player_type == "pitcher"
	var stat_key: String = "pitching" if is_pitcher else "batting"
	# ⚠ **`get(k, {})`를 쓰지 않는다.** 기본값 `{}`는 키가 있든 없든 매번
	# 만들어진다 — 사람마다 사전 셋이면 주에 2만 개다
	if not npc.has(stat_key):
		return 0
	var stats: Dictionary = npc[stat_key]
	if stats.is_empty():
		return 0

	var xp_key: String = "pitching_xp" if is_pitcher else "batting_xp"
	var xp_map: Dictionary
	if npc.has(xp_key):
		xp_map = npc[xp_key]
	else:
		xp_map = {}
		npc[xp_key] = xp_map

	var trn: float = training if training >= 0.0 \
		else training_factor(String(npc.get("league_id", "")), phase)

	var base: float = BASE_WEEKLY_XP \
		* (float(npc.get("development_rate", DEV_BASE)) / DEV_BASE) \
		* age_factor(age) \
		* trn \
		* perf_factor(perf, phase, player_type) \
		* (RAND_MIN + rand01 * RAND_SPAN) \
		* speed_factor(potential) \
		* (MULT_PITCHER if is_pitcher else MULT_BATTER)

	var leveled: int = 0
	if base > 0.0:
		for w in xp_weights(player_type, age):
			var stat: String = w[0]
			var cur: float = float(stats.get(stat, 0.0))
			var acc: float = float(xp_map.get(stat, 0.0)) \
				+ base * float(w[1]) * potential_cap(cur, potential)
			var threshold: float = Growth.xp_threshold(cur)
			if acc >= threshold:
				stats[stat] = PlayerGen.clamp_stat(cur + 1.0)
				xp_map[stat] = acc - threshold
				leveled += 1
			else:
				xp_map[stat] = acc

	var aged: bool = false
	if age >= AGING_FROM:
		var debt: Dictionary
		if npc.has("aging_debt"):
			debt = npc["aging_debt"]
		else:
			debt = {}
			npc["aging_debt"] = debt
		aged = apply_aging(stats, debt, age, perf, phase, player_type)

	# ⚠ **OVR을 다시 만든다.** 안 하면 세부 능력치는 자랐는데 화면·드래프트·
	# 로스터가 보는 숫자는 그대로다 — 조용히 어긋난다
	if leveled > 0 or aged:
		stats["ovr"] = PlayerGen.pitching_ovr(stats) if is_pitcher \
			else PlayerGen.batting_ovr(stats)

	return (leveled << 1) | (1 if aged else 0)


# ── 세계 한 주 ────────────────────────────────────────────────

## 성적 창 — **최근 4주**를 본다.
##
## ⚠ **1주만 보면 그 주에 안 나온 선수가 통째로 빠진다.** 선발은 주 1~2회라
## 절반이 "성적 없음"으로 떨어지고, 성장 방향이 등판 요일에 흔들린다
const PERF_WEEKS: int = 4


## 최근 4주 경기에서 선수별 ERA·타율. `{player_id: {games_played, era|avg}}`
static func perf_window(schedule: Array, to_day: int) -> Dictionary:
	var from_day: int = maxi(1, to_day - PERF_WEEKS * Calendar.DAYS_PER_WEEK + 1)
	var pit: Dictionary = {}
	var bat: Dictionary = {}

	for g in schedule:
		var d: int = int(g.get("day", -1))
		if d < from_day or d > to_day:
			continue
		var result = g.get("result", null)
		if result == null:
			continue
		for line in result.get("player_lines", []):
			var pid: String = String(line.get("player_id", ""))
			if String(line.get("role", "")) == "pitcher":
				var p: Array = pit.get(pid, [0.0, 0.0])
				pit[pid] = [p[0] + float(line.get("er", 0.0)),
					p[1] + float(line.get("ip", 0.0))]
			else:
				var b: Array = bat.get(pid, [0.0, 0.0])
				bat[pid] = [b[0] + float(line.get("h", 0.0)),
					b[1] + float(line.get("ab", 0.0))]

	var out: Dictionary = {}
	for pid in pit:
		var p: Array = pit[pid]
		# ⚠ **02가 `gamesPlayed`를 늘 1로 넣는다.** `perf_factor` 주석 참고
		var e: Dictionary = {"games_played": 1}
		if p[1] > 0.0:
			e["era"] = SeasonStats.calc_era(p[0], p[1])
		out[pid] = e
	for pid in bat:
		var b: Array = bat[pid]
		var e: Dictionary = {"games_played": 1}
		if b[1] > 0.0:
			e["avg"] = SeasonStats.calc_avg(b[0], b[1])
		out[pid] = e
	return out


## 지금이 무슨 시기인가.
##
## ⚠ **02는 주인공 일정 하나로 세계 전체의 시기를 정했다.** 고교생이 쉬는
## 주엔 프로 선수도 오프시즌 배수(1.50)를 받는다. 리그마다 따로 보는 게
## 맞다고 보지만 **밸런스 동결이라 그대로 옮긴다** — 이주 뒤 목록에 있다
static func phase_of(state: Dictionary, at_day: int = -1) -> String:
	var league: String = String(state.get("protagonist", {}).get("league_id", ""))
	var rule: Dictionary = Schedule.LEAGUES.get(league, {})
	if rule.is_empty():
		return "season"
	var day: int = at_day if at_day > 0 else int(state.get("day", 0))
	if day >= int(rule["start_day"]) and day <= int(rule["end_day"]):
		return "season"
	return "offseason"


## 세계의 NPC 한 주. **주인공은 건드리지 않는다** — 그쪽은
## `TrainingGrowth`가 계획대로 돌린다. 두 경로가 같은 사람을 만지면 두 배 큰다
##
## ⚠ **어느 주 경계인지를 받는다.** 여러 날을 한 번에 진행하면 주 경계를
## 몇 번씩 넘는데, 그때마다 `state.day`(도착한 날)를 쓰면 **N번이 전부 같은
## 주가 된다** — 같은 난수·같은 성적 창을 N번 쓰고, 하루씩 간 것과 결과가
## 달라진다
##
## `{grown, leveled, aged}`
static func run(state: Dictionary, at_day: int = -1) -> Dictionary:
	var world: Dictionary = state.get("world", {})
	if world.is_empty():
		return {"grown": 0, "leveled": 0, "aged": 0}

	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	var phase: String = phase_of(state, day)
	var perf: Dictionary = perf_window(state.get("schedule", []), day)
	var year: int = int(state.get("season_year", 0))
	var week: int = Calendar.week_of(day)

	# ⚠ **난수기를 사람마다 새로 만들지 않는다.** 7,000번의 `RefCounted`
	# 할당이 GDScript의 주 병목이다. 하나를 두고 씨앗만 갈아 끼운다 —
	# 그러면 **호출 순서가 바뀌어도 같은 사람은 같은 값**을 받는다
	var rng := RandomNumberGenerator.new()
	# 그 주 내내 같은 앞부분은 한 번만 섞는다
	var week_key: int = Rng.mix(["npc_growth", year, week])

	# 리그가 아홉인데 사람마다 다시 계산할 이유가 없다
	var trn_cache: Dictionary = {}

	var grown: int = 0
	var leveled: int = 0
	var aged: int = 0
	# ⚠ **로스터와 드래프트 풀 둘 다다.** 소속이 없다고 빼면 졸업하고 지명될
	# 때까지 몇 달을 아무도 안 자란 채로 드래프트 평가를 받는다
	var people: Array = SeasonRunner.all_players(state)
	for npc in people:
		if npc.get("is_protagonist", false):
			continue
		# ⚠ **은퇴한 사람은 안 자란다.** 드래프트 풀에 남아 있어서
		# `all_players`가 계속 들고 온다 — 안 거르면 은퇴 뒤에도 능력치가 움직인다
		if String(npc.get("career_status", "active")) == "retired":
			continue

		var league: String = String(npc.get("league_id", ""))
		if not trn_cache.has(league):
			trn_cache[league] = training_factor(league, phase)

		var id: String = String(npc.get("id", ""))
		rng.seed = Rng.mix_into(week_key, id)
		var r: int = grow_one(npc, phase,
			perf[id] if perf.has(id) else NO_PERF, rng.randf(), trn_cache[league])
		grown += 1
		leveled += leveled_of(r)
		if aged_of(r):
			aged += 1

	return {"grown": grown, "leveled": leveled, "aged": aged}
