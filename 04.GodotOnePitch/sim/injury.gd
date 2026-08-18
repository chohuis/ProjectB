extends RefCounted
class_name Injury

## 부상 — 발생·회복·후유증. B-3.
##
## 원본: `week_engine.rs`의 `calc_injury` · `calc_npc_injuries` ·
##       `weekPhases/injuries.ts` · `utils/injuryReport.ts`
##
## ⚠ **주인공과 NPC가 다른 축을 본다.** 주인공은 피로·훈련 무리·심리를 보고,
## NPC는 **연투(consecutive_app)**를 본다. 몇천 명의 피로를 들고 있지 않기
## 때문이고, 02가 그렇게 갈라 놨다.
##
## ⚠ **확률식은 `trigger_chance` 하나가 정본이다.** 02는 같은 식이 **세 곳**에
## 있었다 — 엔진, 전조 경고, 훈련 화면의 `(예상피로 − 60) × 0.8`. 화면이 자기
## 식을 두면 표시와 실제가 갈리고, 이 프로젝트는 이미 그걸로 당했다(피로
## 예상치가 엔진과 **부호까지** 반대였다).


const RULES_PATH: String = "res://data/injury_rules.json"

static var _rules_cache: Dictionary = {}


static func rules() -> Dictionary:
	if not _rules_cache.is_empty():
		return _rules_cache
	var f := FileAccess.open(RULES_PATH, FileAccess.READ)
	if f == null:
		push_error("부상 규칙을 못 읽는다: %s" % RULES_PATH)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	_rules_cache = parsed if parsed is Dictionary else {}
	return _rules_cache


# ── 부상 종류 ─────────────────────────────────────────────────

const SEV_LIGHT: String = "light"
const SEV_MODERATE: String = "moderate"
const SEV_SEVERE: String = "severe"
const SEV_SURGERY: String = "surgery"


static func types() -> Dictionary:
	return rules().get("types", {})


static func type_of(injury_type: String) -> Dictionary:
	return types().get(injury_type, {})


## 모르는 부상은 ID를 그대로 안 보여준다 — 02는 화면에 `SHOULDER_INFLAM`이
## 그대로 뜬 적이 있다(리포트만 라벨 층을 안 거쳤다)
static func label_of(injury_type: String) -> String:
	return String(type_of(injury_type).get("label", injury_type))


static func severity_of(injury_type: String) -> String:
	return String(type_of(injury_type).get("severity", SEV_LIGHT))


## 부상 중 능력 배수. 수술은 0 — 아예 못 뛴다
static func eff_mod_of(severity: String) -> float:
	return float(rules().get("eff_mod", {}).get(severity, 1.0))


## 등급이 얼마나 무거운가. 큰 쪽이 무겁다
## 심각도 한글 이름. **표는 여기 하나다** — 화면에도 소식에도 같은 말이
## 떠야 한다. 예전엔 이게 `StatusVm`에만 있어서 엔진이 쓰려면 표가 둘이 됐다
const SEVERITY_LABELS: Dictionary = {
	"light": "경상", "moderate": "중등도", "severe": "중상", "surgery": "수술",
}


static func severity_label(severity: String) -> String:
	return String(SEVERITY_LABELS.get(severity, severity))


static func severity_rank(severity: String) -> int:
	return rules().get("severity_order", []).find(severity)


static func recovery_weeks(injury_type: String, rng: RandomNumberGenerator) -> int:
	var w: Array = type_of(injury_type).get("weeks", [2, 2])
	return rng.randi_range(int(w[0]), int(w[1]))


## 누적 확률표에서 하나 고른다
static func _from_table(table: Array, roll: float) -> String:
	for row in table:
		if roll < float(row[1]):
			return String(row[0])
	return String(table[table.size() - 1][0]) if not table.is_empty() else ""


## 그 등급에서 어느 부상인가. **투수와 야수가 다치는 곳이 다르다**
static func pick_type(tier: String, is_pitcher: bool, age: int,
		rng: RandomNumberGenerator) -> String:
	# 32세 이상 투수는 팔꿈치보다 어깨가 먼저 온다 — 02가 여기만 따로 뒀다
	var vet: Dictionary = rules().get("veteran_pitcher_moderate", {})
	if tier == SEV_MODERATE and is_pitcher and age >= int(vet.get("age_min", 99)):
		return _from_table(vet.get("table", []), rng.randf())

	var side: String = "pitcher" if is_pitcher else "batter"
	return _from_table(rules().get("pick", {}).get(tier, {}).get(side, []),
		rng.randf())


## `[[하한 나이, 배수], ...]` — 위에서부터 처음 걸리는 것
static func _age_mult(age: int, bands: Array) -> float:
	for b in bands:
		if age >= int(b[0]):
			return float(b[1])
	return 1.0


# ── 주인공 ────────────────────────────────────────────────────

static func _pro() -> Dictionary:
	return rules().get("protagonist", {})


static func high_fatigue_threshold() -> float:
	return float(_pro().get("high_fatigue_threshold", 80.0))


## 훈련 무리 — 고강도인데 컨디션이 낮다. **부상 출처를 가르는 데도 쓴다**
static func is_training_overload(intensity: float, condition: float) -> bool:
	var o: Dictionary = _pro().get("training_overload", {})
	return intensity >= float(o.get("intensity_min", 1.0)) \
		and condition < float(o.get("condition_max", 0.0))


## 피로 몫 — 볼록 곡선. **80 미만은 0이다**(80이 관리의 경계선이다)
static func fatigue_chance(fatigue: float) -> float:
	for b in _pro().get("fatigue_bands", []):
		if fatigue >= float(b[0]):
			return float(b[1])
	return 0.0


static func training_chance(intensity: float, condition: float,
		fatigue: float) -> float:
	if not is_training_overload(intensity, condition):
		return 0.0
	var c: float = float(_pro().get("training_overload", {}).get("chance", 0.0))
	var deep: Dictionary = _pro().get("training_overload_deep", {})
	if condition < float(deep.get("condition_max", 0.0)) \
			and fatigue > float(deep.get("fatigue_min", 999.0)):
		c += float(deep.get("chance", 0.0))
	return c


## 이번 주 부상 발생 확률. **주사위를 굴리기 전까지는 결정적이다** —
## 훈련 화면 미리보기가 같은 함수를 부른다.
##
## `p`: `{fatigue, condition, training_intensity, age,
##        has_prior_injury_same_area, prior_steroid_used, injury_prevention}`
static func trigger_chance(p: Dictionary, grace_week: bool = false) -> float:
	var r: Dictionary = _pro()
	var fatigue: float = float(p.get("fatigue", 0.0))
	var training: float = training_chance(
		float(p.get("training_intensity", 0.0)),
		float(p.get("condition", 100.0)), fatigue)

	# ⚠ **유예 주에는 피로 몫만 뺀다.** 훈련 무리는 다른 축이라 그대로 둔다 —
	# "쉬라고 경고했는데 고강도를 밀어붙였다"가 면죄부가 되면 안 된다
	var chance: float = training if grace_week \
		else fatigue_chance(fatigue) + training

	if bool(p.get("has_prior_injury_same_area", false)):
		chance *= float(r.get("prior_same_area_mult", 1.0))
	if bool(p.get("prior_steroid_used", false)):
		chance *= float(r.get("steroid_mult", 1.0))
	chance *= _age_mult(int(p.get("age", 25)), r.get("age_mult", []))

	# 관리 잘하는 코치진이면 덜 다친다 — **나눈다**(1보다 크면 덜 다친다)
	var clamp_range: Array = r.get("prevention_clamp", [1.0, 1.0])
	chance /= clampf(float(p.get("injury_prevention", 1.0)),
		float(clamp_range[0]), float(clamp_range[1]))
	return minf(chance, float(r.get("chance_cap", 1.0)))


## 얼마나 무거운 부상인가. 피로가 높을수록·나이가 많을수록 무거운 쪽으로
static func tier_for(fatigue: float, age: int, roll: float) -> String:
	var t: Dictionary = _pro().get("tier", {})
	var old: String = "old" if age >= int(t.get("old_age_min", 99)) else "young"
	if fatigue >= 90.0:
		return _from_table(t.get("fatigue_90", {}).get(old, []), roll)
	if fatigue >= 85.0:
		return _from_table(t.get("fatigue_85", {}).get(old, []), roll)
	# 80~85 또는 훈련 트리거만 발동
	return _from_table(t.get("other", []), roll)


## 심리 축 — **피로와 독립이다.** 사기가 오래 바닥이면 입스가 온다
static func yips_chance(low_morale_weeks: int) -> float:
	for b in _pro().get("yips", {}).get("bands", []):
		if low_morale_weeks >= int(b[0]):
			return float(b[1])
	return 0.0


## 회복 주 보정 — 시설 좋은 구단이면 복귀가 빠르다.
##
## ⚠ **발생 시점에만 건다.** 틱다운에도 걸면 두 번 깎인다
## 0주로 떨어지지 않는다 — 제일 짧은 부상이 2주고 보정 폭이 1.30이라
## 아무리 좋은 시설도 2 ÷ 1.3 = 1.54(→2주)가 바닥이다. 하한을 따로 두면
## 아무도 안 읽는 죽은 줄이 된다
static func boosted_weeks(raw_weeks: int, recovery_boost: float) -> int:
	var c: Array = _pro().get("recovery_boost_clamp", [1.0, 1.0])
	var boost: float = clampf(recovery_boost, float(c[0]), float(c[1]))
	return int(roundf(float(raw_weeks) / boost))


## 주인공 한 주.
##
## `{injury, just_occurred, just_healed, eff_mod,
##   consecutive_high_fatigue_weeks, source, warning}`
static func calc(p: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var is_pitcher: bool = String(p.get("player_type", "pitcher")) != "batter"
	var fatigue: float = float(p.get("fatigue", 0.0))
	var age: int = int(p.get("age", 25))
	var high: bool = fatigue >= high_fatigue_threshold()
	var streak: int = (int(p.get("consecutive_high_fatigue_weeks", 0)) + 1) \
		if high else 0

	var injury = null
	var just_occurred: bool = false
	var just_healed: bool = false
	var source: String = ""
	var warning: Dictionary = {}

	# 임계를 넘은 **첫 주**. 피로발 판정을 건너뛰고 경고만 낸다
	var grace: bool = high and streak == 1

	if not bool(p.get("has_injury", false)):
		# ① 심리 트리거 — 투수만
		var yc: float = yips_chance(int(p.get("consecutive_low_morale_weeks", 0)))
		if yc > 0.0 and is_pitcher and rng.randf() < yc:
			injury = {"type": "YIPS", "severity": severity_of("YIPS"),
				"weeks_left": recovery_weeks("YIPS", rng)}
			just_occurred = true
			source = "psychological"

		# ② 피로 + 훈련 복합 트리거
		if not just_occurred:
			var chance: float = trigger_chance(p, grace)
			if chance > 0.0 and rng.randf() < chance:
				var tier: String = tier_for(fatigue, age, rng.randf())
				var t: String = pick_type(tier, is_pitcher, age, rng)
				injury = {"type": t, "severity": severity_of(t),
					"weeks_left": boosted_weeks(recovery_weeks(t, rng),
						float(p.get("recovery_boost", 1.0)))}
				just_occurred = true
				source = "training" if grace or (is_training_overload(
					float(p.get("training_intensity", 0.0)),
					float(p.get("condition", 100.0))) and fatigue < high_fatigue_threshold()) \
					else "fatigue"

			# ⚠ **유예 주인데 안 다쳤으면 경고를 낸다.** 아무 예고 없이 시즌이
			# 끝나면 "관리 실패"가 아니라 "재수 없음"이 된다.
			# 위험도는 **다음 주도 이대로 갈 때의 실제 확률**이다
			if grace and not just_occurred:
				warning = {"kind": "fatigue", "fatigue": fatigue,
					"risk": roundf(trigger_chance(p, false) * 1000.0) / 1000.0}
	else:
		# ③ 회복 틱다운
		var left: int = maxi(int(p.get("recovery_weeks_left", 1)) - 1, 0)
		if left == 0:
			just_healed = true
		else:
			var cur: String = String(p.get("injury_type", "ARM_FATIGUE"))
			injury = {"type": cur, "severity": severity_of(cur),
				"weeks_left": left}

	var eff_mod: float = 1.0
	if bool(p.get("has_injury", false)) and not just_healed:
		eff_mod = eff_mod_of(String(injury["severity"]) if injury != null else SEV_LIGHT)

	return {
		"injury": injury, "just_occurred": just_occurred,
		"just_healed": just_healed, "eff_mod": eff_mod,
		# 다치면 연속 주차를 0으로 — 다친 뒤에도 세면 복귀하자마자 또 걸린다
		"consecutive_high_fatigue_weeks": 0 if just_occurred else streak,
		"source": source, "warning": warning,
	}


# ── NPC ───────────────────────────────────────────────────────

static func _npc() -> Dictionary:
	return rules().get("npc", {})


## `[[하한, 가산], ...]` — 위에서부터 처음 걸리는 것
static func _consecutive_bonus(role: String, apps: int) -> float:
	for b in _npc().get("consecutive", {}).get(role, []):
		if apps >= int(b[0]):
			return float(b[1])
	return 0.0


## NPC 한 명의 이번 주 발생 확률.
##
## ⚠ **참고 뛰면 크게 다친다.** 중등도로 강행하면 0.25가 얹힌다
static func npc_chance(role: String, consecutive_app: int, age: int,
		has_prior_injury: bool, playing_through_severity: String = "") -> float:
	var r: Dictionary = _npc()
	var base: float = float(r.get("base", {}).get(role,
		r.get("base", {}).get("batter", 0.0)))
	var chance: float = base + _consecutive_bonus(role, consecutive_app)
	if has_prior_injury:
		chance += float(r.get("prior_injury_bonus", 0.0))
	if not playing_through_severity.is_empty():
		chance += float(r.get("playing_through", {}).get(
			playing_through_severity, 0.0))
	# 천장을 두지 않는다 — 최악(SP · 연투 · 재발 · 중등도 강행 · 36세)을 다
	# 겹쳐도 0.51이라 02의 `min(0.80)`은 **한 번도 안 걸리는 줄**이었다
	return chance * _age_mult(age, r.get("age_mult", []))


static func npc_tier(roll: float) -> String:
	return _from_table(_npc().get("tier", []), roll)


## 부상 관리가 낮은 팀은 참고 뛰게 한다. **경미와 중등도의 문턱이 다르다**
static func plays_through(severity: String, injury_mgmt: float) -> bool:
	var gate: Dictionary = _npc().get("playing_through_gate", {})
	if not gate.has(severity):
		return false
	return injury_mgmt < float(gate[severity])


## 수술·중증에서 나은 뒤 남는 영구 손실. **완치될 때 한 번만**
static func npc_ovr_penalty(injury_type: String) -> float:
	return float(_npc().get("ovr_penalty", {}).get(injury_type, 0.0))


## NPC 여럿의 한 주. `players`는
## `[{player_id, role, age, consecutive_app, has_prior_injury,
##    playing_through_severity}, ...]`
static func calc_npc(players: Array, rng: RandomNumberGenerator) -> Array:
	var out: Array = []
	for p in players:
		var role: String = String(p.get("role", "batter"))
		var chance: float = npc_chance(role, int(p.get("consecutive_app", 0)),
			int(p.get("age", 25)), bool(p.get("has_prior_injury", false)),
			String(p.get("playing_through_severity", "")))
		if rng.randf() >= chance:
			continue
		var tier: String = npc_tier(rng.randf())
		var t: String = pick_type(tier, role != "batter", int(p.get("age", 25)), rng)
		out.append({"player_id": String(p.get("player_id", "")),
			"injury_type": t, "severity": severity_of(t),
			"recovery_weeks": recovery_weeks(t, rng)})
	return out


# ── 후유증 ────────────────────────────────────────────────────

## 그 부상에 고를 수 있는 치료 — 02 `InjuryTreatmentModal:19-35`.
##
## 🔴 **고르는 자리가 04에 없었다.** 후유증 표(`penalty_by_treatment`)도
## 그걸 읽는 `permanent_penalty`도 재정의 `treatment_weekly` 줄도 다 있는데
## **아무도 안 채웠다** — 결정 화면 대조에서 본 형태 ②③ 그대로다.
##
## ⚠ **02가 가르는 부상 둘만이다.** 나머지는 빈 배열 — **없는 선택을
## 지어내면 그게 두 번째 정본이 된다**
static func treatments_for(injury_type: String) -> Array:
	return rules().get("treatment", {}).get(injury_type, [])


## 고른 갈래 하나. 없으면 빈 사전
static func treatment_of(injury_type: String, choice: String) -> Dictionary:
	for o in treatments_for(injury_type):
		if String(o.get("id", "")) == choice:
			return o
	return {}


## 완치 뒤 영구 감소. **치료 선택이 후유증을 가르는 부상이 둘 있다**
static func permanent_penalty(injury_type: String,
		treatment_choice: String = "") -> Dictionary:
	var by_treatment: Dictionary = rules().get("penalty_by_treatment", {})
	if by_treatment.has(injury_type):
		var table: Dictionary = by_treatment[injury_type]
		return table.get(treatment_choice, table.get("default", {}))
	return rules().get("permanent_penalty", {}).get(injury_type, {})


# ── 소식 ──────────────────────────────────────────────────────

static func _report() -> Dictionary:
	return rules().get("report", {})


static func news_period() -> int:
	return int(_report().get("period_weeks", 4))


static func is_news_week(week: int) -> bool:
	return week > 0 and week % news_period() == 0


static func class_order() -> Array:
	return _report().get("class_order", [])


static func class_label(cls: String) -> String:
	return String(_report().get("class_label", {}).get(cls, cls))


## 부상 하나의 등급.
##
## ⚠ **수술이 시즌 아웃보다 위다.** 이번 시즌을 날리는 데다 능력치가 영구히
## 깎인다.
##
## `weeks_left_in_season`이 0이면 **시즌 아웃 판정을 안 한다** — 모르는 걸
## 안다고 하지 않는다
static func classify(event: Dictionary, weeks_left_in_season: int) -> String:
	if bool(event.get("retired", false)):
		return "retired"
	if String(event.get("severity", "")) == SEV_SURGERY:
		return "surgery"
	var weeks: int = int(event.get("weeks", 0))
	if weeks_left_in_season > 0 and weeks >= weeks_left_in_season:
		return "season_out"
	if weeks >= int(_report().get("long_weeks", 999)):
		return "long"
	return "short"


## 사람 단위로 합친다.
##
## ⚠ **한 달 안에 두 번 다칠 수 있다.** 그때는 **더 심한 쪽**이 결론이다 —
## 부상은 경과가 아니라 상태라, 3주짜리 뒤에 수술이 오면 그 사람은 수술한
## 사람이다(오프시즌 결산은 반대로 마지막 사건이 결론이다)
static func worst_by_person(events: Array, weeks_left_in_season: int) -> Array:
	var order: Array = class_order()
	var worst: Dictionary = {}
	for e in events:
		var pid: String = String(e.get("player_id", ""))
		if pid.is_empty():
			continue
		var cls: String = classify(e, weeks_left_in_season)
		var rank: int = order.find(cls)
		# 같은 등급이면 나중 것 — 더 최근 상태다
		if not worst.has(pid) or rank <= int(worst[pid]["rank"]):
			worst[pid] = {"event": e, "cls": cls, "rank": rank}
	var out: Array = []
	for pid in worst:
		var w: Dictionary = worst[pid]
		var row: Dictionary = (w["event"] as Dictionary).duplicate()
		row["class"] = String(w["cls"])
		out.append(row)
	return out


static func count_by_class(rows: Array) -> Dictionary:
	var out: Dictionary = {}
	for c in class_order():
		out[String(c)] = 0
	for r in rows:
		var c: String = String(r.get("class", ""))
		out[c] = int(out.get(c, 0)) + 1
	return out


## 목록 한 줄.
##
## ⚠ **심한 등급만 쓴다.** 단기 부상 200건을 앞세우면 **수술 3건이 묻힌다** —
## 그게 이 소식에서 정작 알아야 할 것이다
static func preview_line(counts: Dictionary) -> String:
	var parts: Array = []
	for c in class_order():
		var cls: String = String(c)
		if cls == "short":
			continue
		if int(counts.get(cls, 0)) > 0:
			parts.append("%s %d" % [class_label(cls), counts[cls]])
	if not parts.is_empty():
		return " · ".join(parts)
	if int(counts.get("short", 0)) > 0:
		return "가벼운 부상 %d건" % counts["short"]
	return "새 부상이 없었다"
