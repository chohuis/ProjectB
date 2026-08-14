extends RefCounted
class_name GameGrowth

## 경기 성장 — 한 경기가 능력·사기·명성에 남기는 것. M4-4.
##
## 원본: `packages/engine-native/src/growth_engine.rs`의 `calc_game_growth`
##
## ⚠ 레벨업·천장 감쇠는 **`Growth.apply_gains`가 정본이다** — 훈련 성장과
## 같은 함수를 쓴다. 두 벌로 두면 같은 선수가 경로에 따라 다르게 자란다.
##
## 여기 `fatigue`는 **100 = 탈진** (주인공 축).


## 경기 한 번의 기본 XP. 훈련 한 주(10 안팎)보다 훨씬 작다
const GAME_XP_BASE: float = 3.5 * 0.35
## 타격은 경기에서 덜 는다
const BATTING_GAME_RATIO: float = 0.7
## 경기 한 번의 피로. 구간 승수를 탄다
const GAME_FATIGUE: float = 4.0
## 크게 진 경기의 기준 점수차
const BLOWOUT_DIFF: int = 5


static func _is_pitcher(t: String) -> bool:
	return t == "pitcher" or t == "twoWay"


static func _is_batter(t: String) -> bool:
	return t == "batter" or t == "twoWay"


## 한 경기의 결과.
##
## `{pitching, batting, pitching_xp, batting_xp, fatigue, condition, morale,
##   morale_delta, fame_delta, logs}`
##
## **원본 선수 사전을 안 바꾼다**
static func calc(player: Dictionary, game: Dictionary) -> Dictionary:
	var won: bool = game.get("won", false)
	var score_diff: int = game.get("score_diff", 0)
	var blowout: bool = not won and score_diff >= BLOWOUT_DIFF
	var player_type: String = player.get("player_type", "")
	var condition: float = player.get("condition", 100.0)
	var fatigue: float = player.get("fatigue", 0.0)

	var game_xp: float = Growth.week_xp(GAME_XP_BASE, condition, fatigue,
		player.get("development_rate", 62.0), player.get("diligence", 50.0)) \
		* Growth.age_train_factor(player.get("age", 25))

	var pitch_gains: Dictionary = {}
	var bat_gains: Dictionary = {}

	if _is_pitcher(player_type):
		for stat in ["velocity", "command", "control"]:
			pitch_gains[stat] = game_xp
		# ⚠ **크게 지면 배울 게 없다.** 접전 패배와 같게 두면 대패가 이득이 된다
		var mental: float = 0.5 if won else (0.0 if blowout else 0.3)
		if mental > 0.0:
			pitch_gains["mentality"] = mental

	if _is_batter(player_type):
		for stat in ["contact", "eye"]:
			bat_gains[stat] = game_xp * BATTING_GAME_RATIO
		if won:
			bat_gains["batting_clutch"] = 0.3

	var pitching: Dictionary = player.get("pitching", {}).duplicate()
	var batting: Dictionary = player.get("batting", {}).duplicate()
	var pitching_xp: Dictionary = player.get("pitching_xp", {}).duplicate()
	var batting_xp: Dictionary = player.get("batting_xp", {}).duplicate()
	var growth_logs: Array[String] = []

	var potential: float = player.get("potential_hidden", 75.0)
	Growth.apply_gains(pitching, pitching_xp, pitch_gains, potential, growth_logs)
	Growth.apply_gains(batting, batting_xp, bat_gains, potential, growth_logs)
	# 훈련 성장과 같은 이유로 여기서도 다시 낸다 — 두 경로가 다르면
	# 경기로 큰 만큼만 조용히 사라진다
	PlayerGen.refresh_ovr(pitching, batting)

	# ── 사기 ─────────────────────────────────────────────────────
	var base_morale: float = 6.0 if won else (-15.0 if blowout else -8.0)
	# ⚠ **음수에는 역수를 쓴다.** 좋은 감독은 승리를 키우고 패배의 충격을
	# 줄인다 — 그냥 곱하면 정확히 반대로 동작한다
	var mm: float = clampf(game.get("morale_mod", 1.0), 0.75, 1.30)
	var morale_delta: float = base_morale * (2.0 - mm if base_morale < 0.0 else mm)

	# ── 명성 ─────────────────────────────────────────────────────
	var fame_base: float = 2.0 if won else (-1.0 if blowout else 0.0)
	# 홍보력 있는 구단이면 같은 활약이 더 알려진다. 명성은 스폰서 수입의 입력이다
	var fm: float = clampf(game.get("fame_mod", 1.0), 0.75, 1.35)
	var fame_delta: int = int(roundf((fame_base + game.get("strikeouts", 0) * 0.3) * fm))

	var result_word: String = "경기 승리" if won else ("대패" if blowout else "경기 패배")
	var logs: Array[String] = ["%s — 사기 %s%d" % [result_word,
		"+" if morale_delta >= 0.0 else "", int(roundf(morale_delta))]]
	if not growth_logs.is_empty():
		logs.append("[경기 성장] %s" % ", ".join(growth_logs))

	return {
		"pitching": pitching, "batting": batting,
		"pitching_xp": pitching_xp, "batting_xp": batting_xp,
		# ⚠ 구간 승수가 여기도 걸린다 — 없으면 지친 채로 계속 나가는 게 공짜다
		"fatigue": clampf(fatigue + GAME_FATIGUE * Growth.fatigue_zone_mult(fatigue), 0.0, 100.0),
		"condition": clampf(condition + (-3.0 if won else (-12.0 if blowout else -6.0)), 0.0, 100.0),
		"morale": clampf(player.get("morale", 50.0) + morale_delta, 0.0, 100.0),
		"morale_delta": morale_delta,
		"fame_delta": fame_delta,
		"logs": logs,
	}
