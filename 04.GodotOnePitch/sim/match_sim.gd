extends RefCounted
class_name MatchSim

## 투구 단위 경기 시뮬 — P0 스파이크용 이식본.
##
## 원본: `02.SvelteElectron/packages/engine-native/src/match_engine.rs`
##
## ⚠ **원본 구조를 그대로 옮기지 않는다.** Rust 쪽은 투구마다 `state.clone()`을
## 하는 불변 방식인데, GDScript에서 그러면 그것만으로 죽는다. 여기서는 가변
## 상태로 쓴다 — 본 이주에서도 이 방식이 정본이 돼야 한다.
##
## P0의 목적은 "GDScript가 한 시즌을 감당하는가"를 재는 것이다. 그래서
## **연산 부하가 대표성이 있어야** 하고, 세부 결과값이 원본과 일치할 필요는
## 없다. 밴드 표·계수는 원본에서 그대로 가져와 산술 volume을 맞췄다.
##
## 성능 규칙 (P0에서 검증할 것):
##   · 정적 타입 전면 사용 — GDScript는 타입을 적으면 실측으로 빨라진다
##   · 투구마다 객체를 만들지 않는다 — RefCounted 할당이 주 병목이다
##   · 상태는 지역 변수와 PackedArray로. 사전(Dictionary) 조회도 루프에선 피한다

# ── 튜닝 (원본 tuning.rs) ──────────────────────────────────────────
const SWING_MARGIN_BASE: float = 0.35
const SWING_DISCIPLINE_SCALE: float = 0.004
const SWING_EYE_SCALE: float = 0.003
const SWING_FASTBALL_BONUS: float = 0.05
const SHADOW_UMPIRE_STRIKE_PROB: float = 0.35
const CONTACT_Q_OFFSET: float = 0.0
const STAMINA_PENALTY_SCALE: float = 0.18

# 결과 코드 — enum이 아니라 int로 둔다(비교가 잦다)
const R_BALL: int = 0
const R_STRIKE_LOOK: int = 1
const R_STRIKE_SWING: int = 2
const R_FOUL: int = 3
const R_INPLAY_OUT: int = 4
const R_SINGLE: int = 5
const R_DOUBLE: int = 6
const R_TRIPLE: int = 7
const R_HR: int = 8

var _rng := RandomNumberGenerator.new()

## 한 경기를 끝까지 돌린다. 반환은 [홈점수, 원정점수, 투구수].
##
## 선수 능력치는 배열로 받는다 — 객체를 만들면 경기마다 18개씩 할당된다.
## 배열 레이아웃: [ovr, command, velocity, control, movement, stamina]
func sim_game(
	home_pitchers: Array[PackedFloat32Array],
	away_pitchers: Array[PackedFloat32Array],
	home_lineup: Array[PackedFloat32Array],
	away_lineup: Array[PackedFloat32Array],
	seed: int,
) -> PackedInt32Array:
	_rng.seed = seed

	var home_score: int = 0
	var away_score: int = 0
	var inning: int = 1
	var is_top: bool = true
	var outs: int = 0
	var pitches: int = 0

	# 주자 — 객체 대신 bool 셋
	var on1: bool = false
	var on2: bool = false
	var on3: bool = false

	# 타순 인덱스
	var home_bat_idx: int = 0
	var away_bat_idx: int = 0

	# 현재 투수 인덱스와 그 투수가 잡은 아웃
	var home_pit_idx: int = 0
	var away_pit_idx: int = 0
	var home_pit_outs: int = 0
	var away_pit_outs: int = 0

	# 투수별 남은 스태미나
	var home_stam: float = home_pitchers[0][5]
	var away_stam: float = away_pitchers[0][5]

	var balls: int = 0
	var strikes: int = 0

	var safety: int = 6000
	while safety > 0:
		safety -= 1

		# 공격/수비 결정
		var pitcher: PackedFloat32Array
		var batter: PackedFloat32Array
		var stamina: float
		if is_top:
			pitcher = home_pitchers[home_pit_idx]
			batter = away_lineup[away_bat_idx]
			stamina = home_stam
		else:
			pitcher = away_pitchers[away_pit_idx]
			batter = home_lineup[home_bat_idx]
			stamina = away_stam

		pitches += 1

		# ── 투구 품질 ──────────────────────────────────────────
		# pitch_q가 높을수록 투수가 이긴 공이다.
		#
		# ⚠ **중심값을 맞춰야 한다.** 능력치를 그대로 가중평균하면 70대가
		# 나오는데, 아래 밴드 표는 `contact_q` 50 근처를 전제한다
		# (원본 주석: "밴드 표는 동급 = 56을 전제하는데 실측 평균이 48이다").
		# 처음에 안 맞춰서 contact_q가 68로 나왔고 **경기당 득점 0.89**가 됐다 —
		# 시간은 빨랐지만 야구가 아니라 벤치로 못 쓴다.
		#
		# 동급(70)끼리 붙으면 50 근처가 되도록 기준점을 뺀다
		const SKILL_BASE: float = 20.0
		var stam_pen: float = (50.0 - stamina) * STAMINA_PENALTY_SCALE
		var pitch_q: float = (
			pitcher[1] * 0.45 + pitcher[3] * 0.30 + pitcher[4] * 0.25
		) - SKILL_BASE - stam_pen + (_rng.randf() - 0.5) * 18.0

		# ── 존 판정 ────────────────────────────────────────────
		var lx: float = (_rng.randf() - 0.5) * 3.0
		var ly: float = (_rng.randf() - 0.5) * 3.0
		var ax: float = absf(lx)
		var ay: float = absf(ly)
		var in_zone: bool = ax <= 1.0 and ay <= 1.0
		var in_shadow: bool = not in_zone and ax <= 1.35 and ay <= 1.35

		var margin: float = maxf(
			SWING_MARGIN_BASE
			- (batter[4] - 50.0) * SWING_DISCIPLINE_SCALE
			- (batter[3] - 50.0) * SWING_EYE_SCALE,
			0.0,
		)
		var in_swing_zone: bool = ax <= 1.0 + margin and ay <= 1.0 + margin
		var umpire_strike: bool = in_zone or (in_shadow and _rng.randf() < SHADOW_UMPIRE_STRIKE_PROB)

		var swing_prob: float
		if in_zone:
			swing_prob = clampf(0.78 + (50.0 - batter[4]) * 0.003, 0.55, 0.97)
		elif in_shadow:
			swing_prob = clampf(0.45 + (50.0 - batter[4]) * 0.004, 0.20, 0.80) if in_swing_zone else 0.12
		else:
			swing_prob = clampf(0.22 + (50.0 - batter[4]) * 0.003, 0.05, 0.55) if in_swing_zone else 0.02

		var swung: bool = _rng.randf() < swing_prob
		var code: int

		if not swung:
			code = R_STRIKE_LOOK if umpire_strike else R_BALL
		else:
			# ── 컨택 품질 ────────────────────────────────────
			var chase_pen: float = 0.0
			if not in_zone:
				chase_pen = 5.0 if in_shadow else 12.0
			var contact_q: float = pitch_q - (batter[1] - 50.0) * 0.20 + chase_pen + CONTACT_Q_OFFSET

			var roll: float = _rng.randf()
			var hit_bonus: float = clampf(
				(60.0 - pitch_q) * 0.003 + (batter[2] - 50.0) * 0.002, -0.12, 0.20
			)

			# 밴드 표 — 원본과 같은 구조. 구간이 올라갈수록 헛스윙이 늘고
			# 인플레이가 준다
			if contact_q >= 72.0:
				if roll < 0.50: code = R_STRIKE_SWING
				elif roll < 0.80: code = R_FOUL
				elif roll < 0.97: code = R_INPLAY_OUT
				else: code = R_SINGLE
			elif contact_q >= 60.0:
				if roll < 0.32: code = R_STRIKE_SWING
				elif roll < 0.65: code = R_FOUL
				elif roll < 0.92: code = R_INPLAY_OUT
				else: code = R_SINGLE
			elif contact_q >= 52.0:
				if roll < 0.22: code = R_STRIKE_SWING
				elif roll < 0.57: code = R_FOUL
				elif roll < 0.88: code = R_INPLAY_OUT
				else: code = R_SINGLE
			elif contact_q >= 45.0:
				if roll < 0.15: code = R_STRIKE_SWING
				elif roll < 0.50: code = R_FOUL
				elif roll < clampf(0.835 - hit_bonus, 0.62, 0.92): code = R_INPLAY_OUT
				elif roll < clampf(0.95 - hit_bonus * 0.5, 0.90, 0.98): code = R_SINGLE
				else: code = R_DOUBLE
			elif contact_q >= 38.0:
				if roll < 0.10: code = R_STRIKE_SWING
				elif roll < 0.42: code = R_FOUL
				elif roll < clampf(0.768 - hit_bonus, 0.55, 0.87): code = R_INPLAY_OUT
				elif roll < clampf(0.93 - hit_bonus * 0.5, 0.87, 0.97): code = R_SINGLE
				elif roll < clampf(0.98 - hit_bonus * 0.3, 0.95, 0.99): code = R_DOUBLE
				else: code = R_TRIPLE
			elif contact_q >= 32.0:
				if roll < 0.06: code = R_STRIKE_SWING
				elif roll < 0.34: code = R_FOUL
				elif roll < clampf(0.67 - hit_bonus, 0.45, 0.78): code = R_INPLAY_OUT
				elif roll < clampf(0.87 - hit_bonus * 0.5, 0.80, 0.93): code = R_SINGLE
				elif roll < clampf(0.95 - hit_bonus * 0.3, 0.92, 0.97): code = R_DOUBLE
				else: code = R_TRIPLE
			else:
				if roll < 0.04: code = R_STRIKE_SWING
				elif roll < 0.28: code = R_FOUL
				elif roll < 0.58: code = R_INPLAY_OUT
				elif roll < 0.80: code = R_SINGLE
				elif roll < 0.92: code = R_DOUBLE
				elif roll < 0.97: code = R_TRIPLE
				else: code = R_HR

		# ── 카운트·주자·아웃 처리 ──────────────────────────────
		var runs: int = 0
		var batter_done: bool = false

		match code:
			R_BALL:
				balls += 1
				if balls >= 4:
					# 볼넷 — 밀어내기만 처리
					if on1 and on2 and on3: runs += 1
					elif on1 and on2: on3 = true
					elif on1: on2 = true
					else: on1 = true
					batter_done = true
			R_STRIKE_LOOK, R_STRIKE_SWING:
				strikes += 1
				if strikes >= 3:
					outs += 1
					batter_done = true
			R_FOUL:
				if strikes < 2: strikes += 1
			R_INPLAY_OUT:
				outs += 1
				batter_done = true
			R_SINGLE:
				if on3: runs += 1
				on3 = on2
				on2 = on1
				on1 = true
				batter_done = true
			R_DOUBLE:
				if on3: runs += 1
				if on2: runs += 1
				on3 = on1
				on2 = true
				on1 = false
				batter_done = true
			R_TRIPLE:
				if on1: runs += 1
				if on2: runs += 1
				if on3: runs += 1
				on1 = false
				on2 = false
				on3 = true
				batter_done = true
			R_HR:
				runs += 1
				if on1: runs += 1
				if on2: runs += 1
				if on3: runs += 1
				on1 = false
				on2 = false
				on3 = false
				batter_done = true

		if runs > 0:
			if is_top: away_score += runs
			else: home_score += runs

		if batter_done:
			balls = 0
			strikes = 0
			if is_top:
				away_bat_idx = (away_bat_idx + 1) % away_lineup.size()
			else:
				home_bat_idx = (home_bat_idx + 1) % home_lineup.size()

		# 투수 소모 — 투구마다 스태미나가 준다
		if is_top:
			home_stam -= 0.22
			if outs > home_pit_outs:
				home_pit_outs = outs
		else:
			away_stam -= 0.22
			if outs > away_pit_outs:
				away_pit_outs = outs

		# ── 이닝 전환 ──────────────────────────────────────────
		if outs >= 3:
			outs = 0
			on1 = false
			on2 = false
			on3 = false
			balls = 0
			strikes = 0

			# 투수 교체 판정 — 아웃 예산을 넘으면 다음 투수
			if is_top:
				home_pit_outs = 0
				if home_stam < 20.0 and home_pit_idx + 1 < home_pitchers.size():
					home_pit_idx += 1
					home_stam = minf(home_pitchers[home_pit_idx][5], 82.0)
			else:
				away_pit_outs = 0
				if away_stam < 20.0 and away_pit_idx + 1 < away_pitchers.size():
					away_pit_idx += 1
					away_stam = minf(away_pitchers[away_pit_idx][5], 82.0)

			if is_top:
				is_top = false
			else:
				is_top = true
				inning += 1

			# 종료 판정 — 9회 이후 동점이 아니면 끝
			if inning > 9 and home_score != away_score:
				break
			if inning > 15:
				break

	var out := PackedInt32Array()
	out.append(home_score)
	out.append(away_score)
	out.append(pitches)
	return out
