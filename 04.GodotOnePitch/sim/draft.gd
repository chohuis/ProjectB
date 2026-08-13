extends RefCounted
class_name Draft

## 드래프트 — 점수·라운드 앵커·지명. M5-2.
##
## 원본: `packages/engine-native/src/npc_sim.rs`의 주인공 드래프트 판정
##
## ⚠ **앵커는 NPC 실측 위에 놓는다.** 옛 앵커("리그 중위 → 6R")는 어림이지
## 잰 값이 아니었고, 같은 세계의 고졸 지명자 327명을 주인공과 같은 분모로
## 재보니 **주인공이 5라운드 관대**했다.
##
##   백분위     NPC 실측     옛 주인공 산식
##   95~100       5R             1R
##   85~ 95       7R             2R
##   75~ 85       7R             3R
##
## 고교 3학년 투수 4805명 중 고졸 지명은 **327명(6.81%)** — 백분위 93이
## 관문이고 그 지점의 실측 score가 88이다.


## 10팀 × 11라운드
const DRAFT_ROUNDS: int = 11

## 이 아래는 미지명.
##
## ⚠ **옛 문턱 25는 아무도 못 거르는 값이었다.** 백분위 33·55짜리도 부상만
## 없으면 6~7R로 지명됐고, 60회 조사에서 미지명이 0건이었다 — 사용자가 정한
## 세 갈래("상위픽 / 무난하면 중간 / 애매하면 미지명") 중 하나가 없었다.
##
## 라운드 직선이 마지막 라운드에서 끊기는 지점을 그대로 문턱으로 삼는다 —
## 어긋나면 11R이 도달 불가가 되거나(문턱이 위) 12R 이상이 미지명으로
## 뭉개진다(문턱이 아래)
const UNDRAFTED_SCORE: float = 78.0

## 라운드 직선의 기울기. **score 88 → 7R** (실측 백분위 93의 자리)
const ROUND_SLOPE: float = 0.40

## OVR을 펴는 구간. **상위권에서 멈추면 잘 키운 결과가 라운드로 안 이어진다**
const OVR_FLOOR: float = 40.0
const OVR_SPAN: float = 45.0

## 대회 기준점. **미진출(20)이 평범이다** — 50으로 두면 전원이 똑같이
## −12를 먹어서 가르는 게 아무것도 없다
const TOURNAMENT_BASE: float = 20.0

const AWARD_CAP: float = 20.0
const INJURY_CAP: float = 45.0


## 점수와 **내역**.
##
## ⚠ **항이 여섯인 합이라 총점만 보면 어느 항이 미는지 모른다.** 내역을
## 안 실었으면 부상 감점이 산식을 지배하는 걸 못 봤을 것이다
static func score(c: Dictionary) -> Dictionary:
	var pct: float = c.get("percentile", 0.0)
	var ovr_norm: float = clampf((c.get("pitching_ovr", 0.0) - OVR_FLOOR) / OVR_SPAN * 100.0,
		0.0, 100.0)
	# 둘 다 0~100이라 가중평균이 그대로 0~100이 된다.
	# 리그 안에서 몇 등인지가 절대 능력보다 무겁다
	var base: float = pct * 0.6 + ovr_norm * 0.4

	# 팀 에이스면 스카우트가 더 본다
	var rank: int = c.get("team_ace_rank", 0)
	var ace_bonus: float = 8.0 if rank == 1 else (3.0 if rank == 2 else 0.0)

	# 대회 활약 — **팀운을 타는 축이라 비중을 크게 안 둔다**
	var tour_adj: float = (c.get("tournament_score", TOURNAMENT_BASE) - TOURNAMENT_BASE) * 0.20

	# 개인 수상 — 대회는 팀운을 타지만 **수상은 혼자 만든 결과다.** 그래서
	# 대회보다 무겁게 본다. 다만 상한 20 — 백분위·OVR이 정본이고 수상은 그
	# 위에 얹는 축이라 순위를 뒤집으면 안 된다
	var award_adj: float = minf(c.get("award_titles", 0) * 6.0
		+ c.get("award_mvps", 0) * 10.0, AWARD_CAP)

	# 부상 — **심각도로 가른다.** 스카우트가 무겁게 보는 건 수술 이력이지
	# 지나간 염증이 아니다. 예전엔 중등도 이상을 건당 −12로 뭉쳤고 상한도
	# 없어서 감점이 −252까지 나왔다
	var injury_pen: float = minf(c.get("moderate_injuries", 0) * 2.0
		+ c.get("severe_injuries", 0) * 10.0
		+ c.get("surgery_injuries", 0) * 18.0, INJURY_CAP)

	# 스카우트 평가는 보조축
	var scout_adj: float = (c.get("scout_score", 30.0) - 30.0) * 0.20

	# ⚠ **위를 자르지 않는다.** `base`가 이미 0~100인데 에이스(+8)·수상(+20)이
	# 얹히므로 실측 원값이 105·110까지 나온다. 100에서 자르면 그 순서가 지워져
	# 전부 같은 라운드로 뭉친다 — 실측 17건 중 3건이 정확히 100.0이었다
	var total: float = maxf(base + ace_bonus + tour_adj + award_adj + scout_adj - injury_pen, 0.0)

	return {
		"percentile": pct, "ovr_norm": ovr_norm, "base": base,
		"ace_bonus": ace_bonus, "tour_adj": tour_adj, "award_adj": award_adj,
		"scout_adj": scout_adj, "injury_pen": injury_pen, "total": total,
	}


## 점수 → 라운드.
##
## ⚠ **구간이 아니라 직선이다.** 옛 구간식(`ceil(4 + (55-score)/5)`)은 경계
## 때문에 **4·8·10·11라운드가 도달 불가**였다 — 나오는 값이 1·2·3·5·6·7·9뿐이었다
static func round_of(total: float) -> int:
	return int(clampi(int(roundf(DRAFT_ROUNDS - (total - UNDRAFTED_SCORE) * ROUND_SLOPE)),
		1, DRAFT_ROUNDS))


## 지명 결과. `{drafted, round, pick, team_id, breakdown}`
##
## 지명 순번 안의 자리는 무작위다 — 어느 구단이 데려갈지는 그 팀 사정이다
static func evaluate(c: Dictionary, teams: Array = [], rng = null) -> Dictionary:
	var b: Dictionary = score(c)
	if b["total"] < UNDRAFTED_SCORE:
		return {"drafted": false, "round": 0, "pick": 0, "team_id": "", "breakdown": b}

	var r: int = round_of(b["total"])
	if teams.is_empty() or rng == null:
		return {"drafted": true, "round": r, "pick": 0, "team_id": "", "breakdown": b}

	var slot: int = int(rng.randf() * teams.size()) % teams.size()
	return {
		"drafted": true, "round": r,
		"pick": (r - 1) * teams.size() + slot + 1,
		"team_id": teams[slot],
		"breakdown": b,
	}
