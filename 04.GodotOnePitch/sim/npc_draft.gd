extends RefCounted
class_name NpcDraft

## NPC 드래프트 실행 — M9-3.
##
## 원본: `packages/engine-native/src/npc_sim.rs`의 `run_draft` ·
## `calc_draft_score` · `scout_bias`
##
## ⚠ **`Draft`와 다른 일을 한다.** 저쪽은 주인공 한 명이 몇 라운드인지를
## 실측 앵커로 판정하고, 여기는 **후보 수백 명을 순번에 앉힌다.**

## 10팀 × 11라운드. `Draft.DRAFT_ROUNDS`가 정본이다
const ROUNDS: int = Draft.DRAFT_ROUNDS

## 지명 대상 풀을 지명 수의 몇 배로 좁히나.
##
## ⚠ **예전엔 후보 전원(실측 1,682명)에서 뽑았다.** 지명은 110명뿐인데
## 풀이 그렇게 크면 점수 가중이 거의 의미가 없어져 **최고 유망주가 지명될
## 확률이 약 9%**였다. 화면(관전 보드)이 상위 N명만 보여주는 것과도
## 어긋났다 — 보드엔 "220명 중 110명 지명"인데 실제로는 1,682명에서 뽑았다
const POOL_MULTIPLIER: int = 2

## 선수 한 명에 대한 **리그 전체의 평가 편차** 크기.
##
## ⚠ **9는 신호를 덮었다.** "능력치 보정이 최대 +43"을 기준으로 잡았는데
## 그 폭은 후보 전체의 이야기다. 지명 대상 풀은 상위 220명으로 좁혀지므로
## **실제 지명자의 점수 폭은 18.2점**뿐이다. 거기에 편차 ±9와 라운드
## 노이즈 ±7.5가 얹히면 흔들림이 신호와 맞먹는다
const SCOUT_BIAS: float = 4.0

## 라운드가 깊을수록 커지는 평가 흔들림. **상한이 있다**
##
## ⚠ 예전엔 11R에서 ±44라 순수 난수였고, 상한 15도 신호를 덮었다 —
## 지명자 점수 폭이 18.2점이라 ±7.5는 그 절반이다. 4R부터 사실상 순서가
## 사라져 라운드별 OVR이 평평했다(1R 80 · 11R 77). 신호 폭의 1/3로 둔다
const SPREAD_PER_ROUND: float = 1.2
const SPREAD_CAP: float = 6.0

## 능력치 보정. 50 초과분을 제곱해 키운다 —
## OVR 83 → (33/25)² × 20 ≈ 34.8 / OVR 60 → (10/25)² × 20 = 3.2
const EDGE_BASE: float = 50.0
const EDGE_SCALE: float = 25.0
const EDGE_WEIGHT: float = 20.0

## 나이 프리미엄. **어린 선수는 완성 전이라 능력치가 낮은 게 정상**이고
## 구단은 그걸 감안해 뽑는다.
##
## ⚠ 처음엔 19세 +10 / 매년 −1.8이었는데 능력치 보정(최대 +43)에 눌려
## 아무 영향도 못 줬다 — 실측에서 **보드 220명 중 고졸이 5명**까지 줄었다
## (주인공의 기본 경로다). 한 번 +26까지 올렸다가 되돌렸다. 그러면 능력치
## 차이를 덮어서 **OVR 55(19세)가 1순위, OVR 82(26세)가 미지명**이 됐다.
## 업사이드 프리미엄은 능력치를 뒤집지 않을 만큼만 준다
const YOUTH_BASE: float = 14.0
const YOUTH_AGE: int = 19
const YOUTH_STEP: float = 3.0
const YOUTH_FLOOR: float = -6.0

const OVR_WEIGHT: float = 0.40
const DEV_WEIGHT: float = 0.35


## 구단이 보는 점수. **`Draft.score`와 다른 산식이다** — 저쪽은 주인공을
## 실측 백분위 앵커에 맞추고, 여기는 구단 관점의 상대 평가다
static func score_of(npc: Dictionary) -> float:
	var ovr: float = Offseason.core_ovr(npc)
	var edge: float = pow(maxf(ovr - EDGE_BASE, 0.0) / EDGE_SCALE, 2.0) * EDGE_WEIGHT
	var youth: float = maxf(
		YOUTH_BASE - float(maxi(int(npc.get("age", YOUTH_AGE)) - YOUTH_AGE, 0)) * YOUTH_STEP,
		YOUTH_FLOOR)
	return ovr * OVR_WEIGHT + edge \
		+ float(npc.get("development_rate", 0.0)) * DEV_WEIGHT + youth


## 그 선수에 대한 리그의 평가 편차.
##
## 라운드 노이즈와 다르다. 그건 매 순번 새로 뽑혀 "누가 먼저"만 흔들지만,
## 이건 **드래프트 내내 같은 값**이라 순위 자체를 재배열한다. 시드가
## (연도, id)라 같은 세계를 다시 열면 같은 결과가 나온다.
##
## ⚠ **해시값을 직접 쓰지 않는다.** `Rng.mix`는 djb2라 마무리 섞기가
## 없어서 끝 글자만 다른 id들이 비슷한 값을 받는다 — 02가 그 결함을
## 겪었다(`N000`~`N005` 여섯이 모두 −3.93). 시드를 난수기에 넘겨 섞는다
static func scout_bias(npc_id: String, year: int, magnitude: float = SCOUT_BIAS) -> float:
	var r := RandomNumberGenerator.new()
	r.seed = Rng.mix(["scout", year, npc_id])
	# 0..1을 둘 겹쳐 가운데가 두꺼운 분포로 — 큰 편차는 드물게
	return (r.randf() + r.randf() - 1.0) * magnitude


## 드래프트 한 번. `{picks, undrafted_ids, board}`
##
## `picks`는 `[{round, pick, team_id, npc_id}]`
##
## ⚠ **비례 추첨이 아니라 최고점을 뽑는다.** 예전엔 점수 비례 확률이었고,
## 점수 격차가 1.5배쯤이라 최상위도 30%쯤 미지명으로 샜다 — 실측에서
## **OVR 82가 미지명이고 OVR 72가 지명**됐다. 구단이 매 순번에서 가장
## 좋다고 본 선수를 고르고 그 평가에 노이즈가 섞이는 게 실제에 가깝다
static func run(candidates: Array, team_ids: Array, year: int,
		rounds: int = ROUNDS) -> Dictionary:
	if candidates.is_empty() or team_ids.is_empty() or rounds <= 0:
		return {"picks": [], "undrafted_ids": _ids_of(candidates), "board": []}

	var by_id: Dictionary = {}
	# ⚠ **풀 좁히기와 지명에 같은 편차를 먹인다.** 한쪽에만 주면 보드에
	# 오른 순서와 실제로 뽑히는 순서가 어긋나 화면이 거짓말을 한다
	var base: Dictionary = {}
	for c in candidates:
		var id: String = String(c.get("id", ""))
		if id.is_empty():
			continue
		by_id[id] = c
		base[id] = score_of(c) + scout_bias(id, year)

	var ranked: Array = by_id.keys()
	ranked.sort_custom(func(a, b) -> bool: return float(base[a]) > float(base[b]))

	var slots: int = rounds * team_ids.size()
	var board: Array = ranked.slice(0, mini(slots * POOL_MULTIPLIER, ranked.size()))
	var excluded: Array = ranked.slice(board.size())

	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["draft", year, candidates.size()])

	var remaining: Array = board.duplicate()
	var picks: Array = []
	for r in range(1, rounds + 1):
		var spread: float = minf(float(r) * SPREAD_PER_ROUND, SPREAD_CAP)
		for t in team_ids.size():
			if remaining.is_empty():
				break
			var best: int = 0
			var best_score: float = -INF
			for i in remaining.size():
				var s: float = float(base[remaining[i]]) + (rng.randf() - 0.5) * spread
				if s > best_score:
					best_score = s
					best = i
			picks.append({
				"round": r,
				"pick": (r - 1) * team_ids.size() + t + 1,
				"team_id": team_ids[t],
				"npc_id": remaining[best],
			})
			remaining.remove_at(best)

	# 미지명 = 보드에 들었지만 안 뽑힌 사람 + 보드에 못 든 사람
	return {"picks": picks, "undrafted_ids": remaining + excluded, "board": board}


## 지명 결과를 선수에게 적는다. **팀·리그를 바꾸고 경력 사건을 남긴다**
static func apply(picks: Array, by_id: Dictionary, league_of: Dictionary,
		year: int) -> int:
	var n: int = 0
	for p in picks:
		var npc = by_id.get(p["npc_id"], null)
		if npc == null:
			continue
		var team: String = String(p["team_id"])
		var events: Array = npc.get("career_events", [])
		events.append({
			"year": year, "type": "drafted",
			"from_league_id": npc.get("league_id", ""),
			"to_team_id": team, "to_league_id": league_of.get(team, ""),
			"detail": "%d라운드 %d순위" % [int(p["round"]), int(p["pick"])],
		})
		npc["career_events"] = events
		npc["team_id"] = team
		npc["league_id"] = league_of.get(team, "")
		npc["draft_round"] = int(p["round"])
		npc["draft_year"] = year
		n += 1
	return n


static func _ids_of(candidates: Array) -> Array:
	var out: Array = []
	for c in candidates:
		out.append(String(c.get("id", "")))
	return out
