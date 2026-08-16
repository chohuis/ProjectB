extends RefCounted
class_name Staff

## 스태프 — 감독 · 코치 · 구단주. B-2b.
##
## 원본: `staff_gen.rs` · `staffGen.ts` · `staffEffects.ts` ·
##       `players/staff_rules.json`
##
## ⚠ **04엔 스태프가 아예 없었다.** 관계도 엔진은 감독·코치·구단주 갈래를
## 다 갖고 검사도 다 돼 있는데 **행이 생기는 자리가 없어서** 관계가
## 팀동료만 돌았다.
##
## ⚠ **스태프 능력치를 읽는 곳은 여기 하나다.** 화면·성장·부상·시장이
## 각자 파고들면 안 된다 — 02가 그렇게 해서 옛 키가 세 벌 돌아다녔고
## **15종 중 14종이 아무 계산에도 안 닿았다.**


const RULES_PATH: String = "res://data/staff_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("스태프 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


## 세계 상태에서 스태프가 사는 자리 — 팀마다 배열 하나
const KEY: String = "staff"

const ROLE_MANAGER: String = "manager"
const ROLE_COACH: String = "coach"
const ROLE_OWNER: String = "owner"

## 스태프가 없을 때의 값. **중립이 50이다** — 0으로 두면 판정이 한쪽으로 쏠린다
const NEUTRAL: float = 50.0


static func stats_names(role: String) -> Array:
	return rules().get(role, {}).get("stats", [])


static func all_stat_names() -> Array:
	return stats_names(ROLE_MANAGER) + stats_names(ROLE_COACH) \
		+ stats_names(ROLE_OWNER)


# ── 세계에 세운다 ─────────────────────────────────────────────

static func all_of(world: Dictionary) -> Dictionary:
	var d = world.get(KEY, {})
	return d if d is Dictionary else {}


static func of(world: Dictionary, team_id: String) -> Array:
	return all_of(world).get(team_id, [])


## 구단의 씀씀이 등급. **표를 위에서부터 처음 걸리는 것으로 읽는다**
##
## ⚠ 02는 재정 등급이 팀 데이터에 있었다. 04엔 그 축이 없어 구단 성향에서
## 낸다 — **새 축을 만들면 정본이 둘이 되고 언젠가 갈린다**
static func spending_tier(willingness: float) -> Dictionary:
	var tiers: Array = rules().get("spending_tiers", [])
	if tiers.is_empty():
		return {}
	# **아래에서부터** 처음 걸리는 것 — 궁핍(24) · 알뜰(49) · 안정(74) · 부유(100)
	for i in range(tiers.size() - 1, -1, -1):
		if willingness <= float(tiers[i].get("until", 100)):
			return tiers[i]
	return tiers[0]


## 능력치 하나를 굴린다. **리그와 전력★이 수준을 올린다** —
## 고교 코치와 KBL 코치가 같으면 무대가 오르는 뜻이 없다
static func _roll(center: float, spread: float, bonus: float,
		rng: RandomNumberGenerator) -> float:
	var r: Dictionary = rules()
	# 0~1 둘을 겹쳐 가운데가 두꺼운 분포로 — 극단이 드물게
	var n: float = (rng.randf() + rng.randf() - 1.0)
	return clampf(center + n * spread + bonus,
		float(r.get("stat_min", 1)), float(r.get("stat_max", 99)))


## 리그·전력이 만든 보정.
##
## ⚠ **전력★은 중심에서 재는 값이지 절대량이 아니다.** 02는
## `(team.power - 3) * per_star`로 ★3을 0에 둔다(`staff_gen.rs:227`).
## 04는 `- 3`을 빠뜨려 **모든 팀이 +3~+15를 덤으로 받았다** — 실측에서
## 고교 감독 전술안목이 02의 51.3 대신 60.9였고, 리그 넷이 전부 +8~+16
## 부풀어 있었다. ★1 약팀은 −6이어야 하는데 +3을 받고 있었다
static func _bonus(league_id: String, power: float) -> float:
	var r: Dictionary = rules()
	return float(r.get("league_bonus", {}).get(league_id, 0)) \
		+ (power - float(r.get("power_center", 3))) \
			* float(r.get("power_per_star", 0))


static func _person(role: String, team_id: String, league_id: String,
		index: int, rng: RandomNumberGenerator) -> Dictionary:
	var spec: Dictionary = rules().get(role, {})
	var name: Dictionary = NameGen.for_league(league_id, rng)
	return {
		"id": "%s_%s%d" % [team_id, role.substr(0, 3).to_upper(), index],
		"name": String(name.get("ko", name.get("name", role))),
		"role": role, "team_id": team_id, "league_id": league_id,
		"age": int(spec.get("age_min", 40))
			+ int(rng.randf() * float(int(spec.get("age_max", 60))
				- int(spec.get("age_min", 40)) + 1)),
		"stats": {},
	}


## 팀 하나의 스태프. 감독 1 · 구단주 1 · 코치 0~8
##
## ⚠ **코치 수가 구단 씀씀이를 탄다.** 궁핍한 팀은 코치가 없을 수도 있다 —
## 그게 팀 개성이 훈련 효율로 드러나는 유일한 경로다
static func build_team(team_id: String, league_id: String, power: float,
		willingness: float, rng: RandomNumberGenerator) -> Array:
	var r: Dictionary = rules()
	var bonus: float = _bonus(league_id, power)
	var tier: Dictionary = spending_tier(willingness)
	var out: Array = []

	# 감독
	var manager: Dictionary = _person(ROLE_MANAGER, team_id, league_id, 1, rng)
	var mspec: Dictionary = r.get(ROLE_MANAGER, {})
	for s in stats_names(ROLE_MANAGER):
		manager["stats"][s] = _roll(float(mspec.get("stat_center", 50)),
			float(mspec.get("stat_spread", 14)), bonus, rng)
	manager["style"] = _pick(mspec.get("styles", []), rng)
	out.append(manager)

	# 구단주 — **씀씀이가 예산·시설에 그대로 얹힌다**
	var owner: Dictionary = _person(ROLE_OWNER, team_id, league_id, 1, rng)
	var ospec: Dictionary = r.get(ROLE_OWNER, {})
	for s in stats_names(ROLE_OWNER):
		var extra: float = float(tier.get(s, 0))
		owner["stats"][s] = _roll(float(ospec.get("stat_center", 50)),
			float(ospec.get("stat_spread", 16)), bonus + extra, rng)
	owner["style"] = _pick(ospec.get("styles", []), rng)
	out.append(owner)

	# 코치
	var lo: int = int(tier.get("coach_min", 0))
	var hi: int = int(tier.get("coach_max", 0))
	var count: int = lo + int(rng.randf() * float(hi - lo + 1))
	var cspec: Dictionary = r.get(ROLE_COACH, {})
	var specialties: Array = cspec.get("specialties", [])
	for i in range(count):
		var coach: Dictionary = _person(ROLE_COACH, team_id, league_id, i + 1, rng)
		for s in stats_names(ROLE_COACH):
			coach["stats"][s] = _roll(float(cspec.get("stat_center", 50)),
				float(cspec.get("stat_spread", 15)), bonus, rng)
		# 전문 분야가 그 코치의 두 능력치를 민다
		if not specialties.is_empty():
			var sp: Dictionary = specialties[i % specialties.size()]
			coach["specialty"] = String(sp["name"])
			for s2 in sp.get("boost", []):
				coach["stats"][s2] = minf(float(coach["stats"][s2])
					+ float(cspec.get("specialty_boost", 0)),
					float(r.get("stat_max", 99)))
		out.append(coach)
	return out


static func _pick(list: Array, rng: RandomNumberGenerator) -> String:
	if list.is_empty():
		return ""
	return String(list[int(rng.randf() * float(list.size())) % list.size()])


## 세계 전체에 스태프를 세운다. 세운 사람 수.
##
## ⚠ **이미 있으면 다시 안 만든다.** 다시 만들면 관계가 쌓인 감독이
## 매번 남이 된다
static func ensure_world(state: Dictionary) -> int:
	var world: Dictionary = state.get("world", {})
	if world.is_empty():
		return 0
	var all: Dictionary = all_of(world)
	var seed_value: int = int(state.get("seed", 0))
	var n: int = 0

	for league_id in rules().get("leagues", []):
		for t in World.teams_of(String(league_id)):
			var team_id: String = String(t["id"])
			if not all.get(team_id, []).is_empty():
				continue
			var rng := RandomNumberGenerator.new()
			# ⚠ **팀과 섞는다.** 하나로 두면 모든 팀이 같은 감독을 갖는다
			rng.seed = Rng.mix(["staff", team_id, seed_value])
			var made: Array = build_team(team_id, String(league_id),
				float(t.get("power", 2)),
				float(TeamProfile.of(world, team_id).get(
					"owner_spending_willingness", 50.0)), rng)
			all[team_id] = made
			n += made.size()

	world[KEY] = all
	return n


# ── 능력치 → 계수 ─────────────────────────────────────────────

## 능력치 → 배수. `1 + amount × (v − pivot) / span`
static func factor_of(stat: String, value: float) -> float:
	var e: Dictionary = rules().get("effects", {})
	# 표에 없는 능력치는 amount가 0이라 저절로 1.0이 된다 — 따로 막는 줄을
	# 두면 절대 안 걸리는 죽은 가드다
	var amount: float = float(e.get("amounts", {}).get(stat, 0.0))
	var clamp_to: float = float(e.get("clamp", 1.25))
	var norm: float = clampf((value - float(e.get("pivot", 50.0)))
		/ float(e.get("span", 40.0)), -clamp_to, clamp_to)
	return 1.0 + amount * norm


## 배수가 아니라 가감산이 필요한 곳(확률·주차)에 쓴다
static func delta_of(stat: String, value: float) -> float:
	return factor_of(stat, value) - 1.0


static func neutral_stats() -> Dictionary:
	var out: Dictionary = {}
	for s in all_stat_names():
		out[String(s)] = NEUTRAL
	return out


## 팀의 스태프 15종을 모은다.
##
## - 감독·구단주는 팀당 하나라 그대로
## - 코치는 여럿이라 **평균**이다. `specialty`를 주면 그 코치를 우선한다
## - 코치 5종에 구단주 `staff_trust`가 곱해진다 — **스태프를 안 믿는
##   구단에선 좋은 코치를 데려와도 덜 먹힌다.** 그게 구단주 다섯 번째
##   능력치의 유일한 소비처다
static func stats_of(world: Dictionary, team_id: String,
		specialty: String = "") -> Dictionary:
	var out: Dictionary = neutral_stats()
	if team_id.is_empty():
		return out

	var coaches: Array = []
	var picked: Dictionary = {}
	for p in of(world, team_id):
		var role: String = String(p.get("role", ""))
		if role == ROLE_MANAGER or role == ROLE_OWNER:
			for s in stats_names(role):
				if p.get("stats", {}).has(s):
					out[String(s)] = float(p["stats"][s])
		elif role == ROLE_COACH:
			coaches.append(p)
			if not specialty.is_empty() and String(p.get("specialty", "")) == specialty:
				picked = p

	var source: Array = [picked] if not picked.is_empty() else coaches
	if not source.is_empty():
		for s in stats_names(ROLE_COACH):
			var total: float = 0.0
			var n: int = 0
			for c in source:
				if c.get("stats", {}).has(s):
					total += float(c["stats"][s])
					n += 1
			if n > 0:
				out[String(s)] = total / float(n)

	var trust: float = factor_of("staff_trust", float(out.get("staff_trust", NEUTRAL)))
	if trust != 1.0:
		for s in stats_names(ROLE_COACH):
			out[String(s)] = clampf(float(out[String(s)]) * trust,
				float(rules().get("stat_min", 1)), float(rules().get("stat_max", 99)))
	return out


## 소비처가 받는 계수. **배선표를 여기 한 번만 적는다** — 각 화면·유스케이스가
## "어느 능력치가 내 축이지"를 매번 고르면 또 흩어진다
static func mods_of(world: Dictionary, team_id: String,
		specialty: String = "") -> Dictionary:
	var s: Dictionary = stats_of(world, team_id, specialty)
	return {
		"morale": factor_of("motivator", s["motivator"]),
		"fame": factor_of("pr_influence", s["pr_influence"]),
		"dev_rate": factor_of("analysis", s["analysis"]),
		"training": factor_of("teaching", s["teaching"]),
		"facility": factor_of("facility_investment", s["facility_investment"]),
		# **1보다 크면 덜 다친다**
		"injury_prevention": factor_of("discipline", s["discipline"]),
		"relation": factor_of("communication", s["communication"]),
		"slump": factor_of("leadership", s["leadership"]),
		"budget": factor_of("budget_support", s["budget_support"]),
		"callup": factor_of("clutch_decision", s["clutch_decision"]),
	}


## 그 선수의 훈련을 봐 주는 코치 자리. **투수에겐 투수 코치가 정본이다** —
## 없으면 팀 코치 평균으로 떨어진다
static func specialty_for(player_type: String) -> String:
	return "투수" if player_type == "pitcher" else "타격"


## 스태프가 없는 무대에서 쓰는 중립값
static func neutral_mods() -> Dictionary:
	return {"morale": 1.0, "fame": 1.0, "dev_rate": 1.0, "training": 1.0,
		"facility": 1.0, "injury_prevention": 1.0, "relation": 1.0,
		"slump": 1.0, "budget": 1.0, "callup": 1.0}
