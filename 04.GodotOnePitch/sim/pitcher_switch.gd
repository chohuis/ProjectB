extends RefCounted
class_name PitcherSwitch

## 투수 교체 — 아웃 예산·강판 판정. M2-4.
##
## 원본: `packages/engine-native/src/match_engine.rs` · `types.rs`
##
## ⚠ **한 엔진에 교체 규칙이 둘이면 반드시 어긋난다.** 원본에서 주인공만
## 스태미나 문턱(35)으로 내려왔고 NPC는 아웃 예산으로 내려왔다. 주석엔
## "NPC와 같은 기준"이라 적혀 있었지만 대응하는 값이 없었다. 주인공이
## 실측 4.5이닝, NPC 선발이 7이닝을 던졌고, 시즌 이닝이 32~44에 머물러
## 탈삼진왕·방어율왕이 210시즌 0건이었다.
##
## **예산 식은 `starter_max_outs` 하나다.** 주인공도 NPC도 여기를 부른다.
##
## 큐는 사전이다: `pitchers[] · current · max_outs[] · outs_by_current ·
## lines[] · pitch_limit`


## 선발의 아웃 예산. **주인공과 NPC가 같이 쓴다**
##
## ⚠ **현재 스태미나가 아니라 상한을 넣는다.** 현재값을 쓰면 던질수록 예산이
## 줄어 자기 자신을 쫓아가는 식이 된다
static func starter_max_outs(stamina_cap: float) -> int:
	var stam: float = maxf(stamina_cap, 1.0)
	return int(maxf(roundf(Tuning.STARTER_OUTS_BASE
		+ (stam / 99.0) * Tuning.STARTER_OUTS_STAMINA_SCALE), 1.0))


## 주인공의 아웃 예산. **구원 등판이면 0** — 호출부가 건너뛰고 투구수·전술
## 판정이 그대로 돈다.
##
## ⚠ **난수를 안 쓴다.** 강판 판정은 타석마다 불리므로 흔들림을 넣으면
## 22아웃에서 내려갈지 25아웃에서 내려갈지가 매 타석 재추첨된다
static func protagonist_max_outs(state: Dictionary) -> int:
	if not state.get("is_starter", true):
		return 0
	return starter_max_outs(state.get("stamina_cap", 50.0))


## 큐 전체의 아웃 예산. **경기마다 뽑는다** — 한 경기 안에서는 안 바뀐다
static func queue_max_outs(pitchers: Array, rng) -> Array:
	var out: Array = []
	for i in pitchers.size():
		var cap: float = pitchers[i].get("stamina_cap", 50.0)
		if i == 0:
			# 선발은 같은 식 + 경기별 흔들림
			var wobble: float = (rng.randf() - 0.5) * Tuning.STARTER_OUTS_WOBBLE
			out.append(int(roundf(Tuning.STARTER_OUTS_BASE
				+ (maxf(cap, 1.0) / 99.0) * Tuning.STARTER_OUTS_STAMINA_SCALE + wobble)))
		else:
			out.append(Tuning.RELIEVER_OUTS_BASE + int(rng.randf() * Tuning.RELIEVER_OUTS_SPAN))
	return out


## 큐가 다음 투수로 넘어가야 하나.
##
## ⚠ **아웃과 투구수만 본다 — 스태미나는 안 본다.** 주인공만 스태미나로
## 내려오던 게 결함이었다
static func should_switch(queue: Dictionary) -> bool:
	var pitchers: Array = queue.get("pitchers", [])
	if pitchers.is_empty():
		return false
	var current: int = queue.get("current", 0)
	# 뒤에 아무도 없으면 못 바꾼다 — 내보내면 마운드가 빈다
	if current + 1 >= pitchers.size():
		return false

	var max_outs: Array = queue.get("max_outs", [])
	var over_outs: bool = false
	if current < max_outs.size():
		var budget: int = max_outs[current]
		# 예산 0은 "상한 없음"이다
		over_outs = budget > 0 and queue.get("outs_by_current", 0) >= budget

	var over_pitches: bool = false
	var pitch_limit: float = queue.get("pitch_limit", 0.0)
	var lines: Array = queue.get("lines", [])
	if pitch_limit > 0.0 and current < lines.size():
		over_pitches = float(lines[current].get("pc", 0)) >= pitch_limit

	return over_outs or over_pitches


## 다음 투수로. **원본 사전을 안 바꾼다**
static func advance(queue: Dictionary) -> Dictionary:
	var next: Dictionary = queue.duplicate()
	var current: int = next.get("current", 0)
	if current + 1 < next.get("pitchers", []).size():
		next["current"] = current + 1
		next["outs_by_current"] = 0
	return next


## 구원 투수가 들어오는 스태미나.
##
## ⚠ **100으로 리셋하면 안 된다.** 구원이 자기 능력과 무관하게 스태미나
## 100으로 들어와서 교체하는 팀이 압도적으로 유리해졌다 — 실측 주인공 완투
## ERA 3.83 vs 투수진 3명 교체 1.65
static func relief_start_stamina(stamina_cap: float) -> float:
	return minf(stamina_cap, Tuning.RELIEF_START_STAMINA)


## 주인공이 내려가야 하나. `{should_exit, reason}`
##
## reason: "pitch_limit" · "stamina" · "tactical" · ""
##
## ⚠ **예산 검사가 스태미나 검사보다 앞이다.** 뒤로 가면 스태미나가 먼저
## 걸려서 예산이 있으나 마나가 된다 — 그게 정확히 원본 결함이었다
static func should_protagonist_exit(state: Dictionary) -> Dictionary:
	if not state.get("has_entered", false) or state.get("exited", false):
		return {"should_exit": false, "reason": ""}

	var pce: float = float(state.get("pitch_count_since_entry", 0))
	var stam: float = state.get("stamina", 100.0)
	var mental: float = state.get("mental", 50.0)
	var manager: Dictionary = state.get("manager", {})
	var tiq: float = manager.get("tactical_iq", 50.0)
	var cdec: float = manager.get("clutch_decision", 50.0)

	var hard: float = state.get("pitch_limit", 0.0)
	if hard <= 0.0:
		hard = Tuning.PROTAGONIST_PITCH_COUNT_HARD
	var soft: float = state.get("pitch_soft", 0.0)
	if soft <= 0.0:
		soft = Tuning.PROTAGONIST_PITCH_COUNT_SOFT

	if pce >= hard:
		return {"should_exit": true, "reason": "pitch_limit"}

	# ① 아웃 예산 — NPC와 같은 규칙이다
	var budget: int = protagonist_max_outs(state)
	if budget > 0 and state.get("outs_since_entry", 0) >= budget:
		return {"should_exit": true, "reason": "stamina"}

	# ② 스태미나는 **비상 하한**으로만 — 부상·급락으로 예산을 채우기 전에
	#    무너지는 경우다. 여기가 정상 교체 사유였던 게 위의 결함이다
	if stam <= Tuning.PROTAGONIST_STAMINA_EMERGENCY:
		return {"should_exit": true, "reason": "stamina"}

	# ③ 감독의 전술 판단
	var danger: float = 0.0
	if pce >= soft:
		danger += 20.0 + (pce - soft) * 1.2
	if stam < 30.0:
		danger += (30.0 - stam) * 1.5
	if mental < 30.0:
		danger += (30.0 - mental) * 1.0

	var inning: int = state.get("inning", 1)
	var inning_limit: int = state.get("inning_limit", 9)
	if float(inning) / float(inning_limit) >= 0.8:
		danger += 12.0
	var runners: Dictionary = state.get("runners", {})
	var has_scoring: bool = not runners.get("second", {}).is_empty() \
		or not runners.get("third", {}).is_empty()
	var is_late: bool = inning >= inning_limit - 1
	if has_scoring and is_late:
		danger += 18.0

	# 감독 능력이 문턱을 움직인다 — 없으면 감독 능력치가 경기에 아무 영향이 없다
	var threshold: float = 65.0 - (tiq - 50.0) * 0.4 - ((cdec - 50.0) * 0.3 if is_late else 0.0)

	if danger >= threshold:
		return {"should_exit": true, "reason": "tactical"}
	return {"should_exit": false, "reason": ""}
