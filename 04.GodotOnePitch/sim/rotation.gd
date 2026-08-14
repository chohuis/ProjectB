extends RefCounted
class_name Rotation

## 로테이션 — M3-2. **선발을 돌려 다음 등판을 정한다.**
##
## 원본: `rosterEngine.ts`의 `teamRotation` · `tuning.rs`
##
## ⚠ **이게 없으면 주인공이 팀 경기를 다 던진다.** 붙이기 전에는 고교
## 20경기를 전부 등판했다 — 3인 로테이션이면 일곱 번쯤이다.
##
## ⚠ **컨디션으로 뽑지 않는다.** 그러면 로테이션이 매 경기 바뀌어 선발이
## 불어나고, 각자 적게 던져 ERA가 운에 흔들린다 — 실측 OVR–ERA 상관이
## 선발 61명일 때 −0.63인데 96명일 때 **+0.12**(양수)까지 갔다.
##
## ⚠ **인덱스를 상태에 안 들고 경기 순번으로 정한다.** 들고 있으면
## 저장·불러오기와 어긋나고, 하루 진행과 여러 날 진행이 달라진다.


## 리그별 로테이션 인원. 고교·대학 3인 · 독립 4인 · 프로 5인
static func size_of(league_id: String) -> int:
	if league_id.begins_with("LEAGUE_HIGHSCHOOL") or league_id.begins_with("LEAGUE_UNIVERSITY"):
		return 3
	if league_id.begins_with("LEAGUE_INDEPENDENT"):
		return 4
	return 5


## 그 팀의 로테이션 (선수 id 목록).
##
## ⚠ **센 선발부터.** 모자라면 불펜에서 능력순으로 채운다 — 억지로 야수를
## 넣지는 않는다
static func build(roster: Array, league_id: String) -> Array:
	var want: int = size_of(league_id)

	var starters: Array = []
	var others: Array = []
	for p in roster:
		if not PlayerGen.is_pitcher(p.get("position", "")):
			continue
		if p.get("position", "") == "SP":
			starters.append(p)
		else:
			others.append(p)

	var by_ovr := func(a, b) -> bool:
		return float(a["pitching"]["ovr"]) > float(b["pitching"]["ovr"])
	starters.sort_custom(by_ovr)
	others.sort_custom(by_ovr)

	var out: Array = []
	for p in starters:
		if out.size() >= want:
			break
		out.append(p["id"])
	for p in others:
		if out.size() >= want:
			break
		out.append(p["id"])
	return out


## 그 팀의 `game_no`번째 경기 선발.
##
## ⚠ **음수 경기 번호에서도 답이 나온다.** GDScript의 `%`는 음수에서 음수를
## 주지만 **배열의 음수 색인이 뒤에서부터 세므로** 결과가 `posmod`와 같다 —
## 재보고 확인했다. `posmod`를 쓰는 건 의도를 밝히기 위해서다
static func starter_at(rotation: Array, game_no: int) -> String:
	if rotation.is_empty():
		return ""
	return rotation[posmod(game_no, rotation.size())]


# ── 보직 배정 ─────────────────────────────────────────────────

## 나보다 센 팀 투수가 **둘 이하면 선발**, 아니면 불펜.
##
## ⚠ **로테이션 인원과 맞물린다.** 고교는 3인이므로 "나보다 센 투수 둘
## 이하" = 팀 3위 안이다. 이 둘이 어긋나면 **선발로 배정됐는데 로테이션에는
## 못 드는** 선수가 생기고, 그러면 한 경기도 못 던진다
static func assign_position(my_ovr: float, team_pitcher_ovrs: Array) -> String:
	var higher: int = 0
	for o in team_pitcher_ovrs:
		if float(o) > my_ovr:
			higher += 1
	return "SP" if higher <= 2 else "RP"


## 불펜 역할별 등판 확률. 02 값 그대로다
const RELIEVER_CHANCE: Dictionary = {
	"마무리": 0.55, "셋업맨": 0.45, "중간계투": 0.35,
	"롱릴리프": 0.20, "패전처리": 0.25, "스윙맨": 0.15, "오프너": 0.30,
}

## 로테이션에 못 든 투수의 기본 역할. 프로는 세분화되지만 고교는 둘뿐이다
const DEFAULT_RELIEF_ROLE := "중간계투"


## 이 경기에 불펜이 나오나.
##
## ⚠ **02는 여기서 `thread_rng()`를 썼다.** 그래서 같은 세이브·같은 시드라도
## 결과가 매번 달랐다 — 시드 기반 조사를 한다면서 절반만 그랬다.
## 우리는 경기 id로 시드를 만든다.
##
## ⚠ **직전 등판 피로를 본다.** 6이닝 이상 던졌으면 거의 안 나온다 —
## 없으면 불펜이 매 경기 나와서 시즌 내내 지쳐 있다
static func reliever_would_pitch(p: Dictionary) -> bool:
	var base: float = RELIEVER_CHANCE.get(p.get("role", DEFAULT_RELIEF_ROLE), 0.0)
	if base <= 0.0:
		return false

	var outs_last: int = int(p.get("outs_last", 0))
	var rest_penalty: float = 0.30 if outs_last >= 18 \
		else (0.65 if outs_last >= 9 else 1.0)

	# 의무 휴식 — 하루 단위. 02는 주 단위라 **불펜이 한 주에 두 번 못 나오고**
	# 반대로 주말 연투(토→일)는 못 막았다
	# 던진 적이 없으면 필요 휴식이 0이라 저절로 통과한다 — 첫 등판을
	# 막는 가드를 따로 두지 않는다
	if int(p.get("rest_days", 0)) < required_rest_days(int(p.get("last_pitch_count", 0))):
		return false

	return float(p.get("roll", 1.0)) < base * rest_penalty


## 그날 던진 공 수에 따른 의무 휴식 일수
static func required_rest_days(pitch_count: int) -> int:
	if pitch_count >= 50:
		return 3
	if pitch_count >= 30:
		return 2
	if pitch_count >= 15:
		return 1
	return 0
