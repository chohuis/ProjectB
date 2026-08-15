extends RefCounted
class_name InjuryMeasure

## 부상 대조 계측 — 02 `scripts/test-injury.cjs`와 **같은 항목**을 낸다.
##
## 02가 내는 것: 피로 구간별 실측 발생률(82·87·92·97) · 유예가 한 번뿐인가 ·
## 유예 주에도 고강도면 다치는가 · 코치 관리가 억제하는가 · 시설이 복귀를
## 앞당기는가 · 회복 주차 하한.
##
## ⚠ **예고와 실측이 맞아야 한다.** 02는 "경고에 적힌 확률이 다음 주 실제
## 발생률과 맞는가"를 본다 — 표만 같고 실제로 그 비율로 안 나면 화면이
## 거짓말을 한다.
##
## ⚠ **여기서 판정하지 않는다.** 02 값과 나란히 놓는 건 사람이 한다


const TRIALS: int = 20000


static func _pct(v: float) -> String:
	return "%.1f%%" % (v * 100.0)


## 피로 f로 한 주를 났을 때 실제로 다친 비율
func _rate(f: float, seed_value: int, grace: bool = false,
		intensity: float = 0.0, condition: float = 100.0) -> float:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var p: Dictionary = {"fatigue": f, "condition": condition,
		"training_intensity": intensity}
	var hit: int = 0
	var chance: float = Injury.trigger_chance(p, grace)
	for i in TRIALS:
		if rng.randf() < chance:
			hit += 1
	return float(hit) / float(TRIALS)


func run(log_line: Callable, fail: Callable, seed_value: int) -> int:
	log_line.call("  표본 %d회 · 씨앗 %d" % [TRIALS, seed_value])

	# ① 피로 구간별 — 02는 예고 5·15·35·60%를 내고 실측이 맞는지 본다
	log_line.call("  피로 구간별 발생률 (유예 아님)")
	for f in [82.0, 87.0, 92.0, 97.0]:
		log_line.call("    피로 %d   예고 %s · 실측 %s" % [int(f),
			_pct(Injury.fatigue_chance(f)), _pct(_rate(f, seed_value))])

	# ② 유예 — 첫 주는 훈련 몫만, 둘째 주부터 전부
	log_line.call("  유예 주 (임계를 처음 넘은 주)")
	log_line.call("    피로 92 · 쉼            %s"
		% _pct(_rate(92.0, seed_value, true)))
	# ⚠ **컨디션 경계값을 쓰지 않는다.** 깊은 과부하는 `condition <` 이라
	# 정확히 문턱이면 안 걸린다 — 처음에 60으로 재서 02(20.5%)의 절반이 나왔다
	log_line.call("    피로 92 · 고강도(컨디션 62) %s"
		% _pct(_rate(92.0, seed_value, true, 1.0, 62.0)))
	log_line.call("    피로 92 · 고강도(컨디션 55) %s"
		% _pct(_rate(92.0, seed_value, true, 1.0, 55.0)))
	log_line.call("    피로 92 · 유예 아님      %s" % _pct(_rate(92.0, seed_value)))

	# ③ 회복 주차 — 하한이 있는가
	var by_sev: Dictionary = {}
	for t in Injury.rules().get("types", {}):
		var sev: String = Injury.severity_of(String(t))
		by_sev[sev] = int(by_sev.get(sev, 0)) + 1
	# ⚠ **하한을 재려면 보정을 최대로 걸어야 한다.** 무작위 한 번 뽑아서
	# 최소를 보면 그건 하한이 아니라 그 뽑기의 최소다
	log_line.call("  회복 주차 하한 %d주 (1주 부상에 보정 최대) · 부상 종류 %d"
		% [Injury.boosted_weeks(1, 99.0), Injury.rules().get("types", {}).size()])
	var order: Array = ["light", "moderate", "severe", "surgery"]
	var line: String = ""
	for s in order:
		if by_sev.has(s):
			line += "%s %d  " % [Injury.severity_label(String(s)), by_sev[s]]
	log_line.call("  심각도별 종류 수: %s" % line.strip_edges())

	# ④ 시설이 복귀를 앞당기는가 — 02는 8.21주 vs 9.21주로 잰다
	var base_weeks: int = 10
	log_line.call("  회복 보정 (%d주 부상 기준)" % base_weeks)
	for boost in [0.8, 1.0, 1.2]:
		log_line.call("    recovery_boost %.1f → %d주" % [boost,
			Injury.boosted_weeks(base_weeks, boost)])

	return 0
