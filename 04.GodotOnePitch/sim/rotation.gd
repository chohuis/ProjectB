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
## `ovr_bias`는 **감독이 나를 어떻게 보는가**다 — F-2c.
##
## ⚠ **실력이 아니다.** 같은 OVR이라도 감독과 신뢰가 두터우면 선발 경쟁에서
## 앞선다(02 `player_engine.rs:101-102` 주석 그대로). 0이면 예전 동작과
## 정확히 같으므로 밸런스가 안 움직인다.
##
## ⚠ **`Relationship.effects`의 `role_ovr_bias`가 여기서 처음 쓰인다** —
## 만들어만 놓고 소비처가 0건이었다
static func assign_position(my_ovr: float, team_pitcher_ovrs: Array,
		ovr_bias: float = 0.0) -> String:
	# 감독이 보는 나 = 실제 OVR + 관계 보정. 순위 비교에 이 값을 쓴다
	var seen: float = my_ovr + ovr_bias
	var higher: int = 0
	for o in team_pitcher_ovrs:
		if float(o) > seen:
			higher += 1
	return "SP" if higher <= 2 else "RP"


## 프로 보직 — P-8c. 원본: 02 `player_engine.rs:99 assign_protagonist_role`.
##
## 🔴 **04는 이 함수가 통째로 없었다.** 고교용(`assign_position`)만 옮겨
## 놓고 프로에서도 그걸 썼다 — 프로 로테이션은 **5인**인데 고교 규칙은
## **팀 3위 안**만 선발로 봤다. 위 `assign_position` 주석이 그 어긋남을
## 스스로 경고하고 있었는데도 그랬다.
##
## 실측이 그 값을 보여줬다 — **프로 144경기에 등판 7**(= 불펜 확률 5%).
## 로테 5인이면 29여야 한다.
##
## ⚠ **분모가 다르다.** 고교는 팀 투수 **전체**를 세고, 프로는 **선발 OVR만**
## 센다(02 `team_sp_ovrs`). 불펜까지 세면 순위가 밀려 선발이 훨씬 어려워진다.
##
## ⚠ **돌려주는 이름이 `RELIEVER_CHANCE`의 키와 같아야 한다** — 표에 없는
## 이름을 내면 그 불펜은 등판 확률 0이라 한 경기도 못 던진다.
##
## `position`: `"CP"`면 마무리 · `"RP"`면 OVR대별 · 그 밖은 선발 순위
static func assign_pro_role(my_ovr: float, team_sp_ovrs: Array,
		ovr_bias: float = 0.0, position: String = "SP") -> String:
	# 감독이 보는 나 = 실제 OVR + 관계 보정 (02와 같다)
	var seen: float = my_ovr + ovr_bias

	if position == "CP":
		return "마무리"
	if position == "RP":
		if seen >= 78.0:
			return "셋업맨"
		if seen >= 65.0:
			return "중간계투"
		if seen >= 55.0:
			return "롱릴리프"
		return "패전처리"

	var rank: int = 1
	for o in team_sp_ovrs:
		if float(o) > seen:
			rank += 1
	# ⚠ **로테이션 인원과 같은 수다** — `size_of`가 프로에 5를 준다.
	# 둘이 어긋나면 선발로 배정됐는데 로테엔 못 드는 선수가 생긴다
	if rank <= size_of("LEAGUE_KBL"):
		return "%d선발" % rank
	return "스윙맨" if seen >= 60.0 else "롱릴리프"


## 프로 보직인가 — 선발이면 로테이션을 타고, 아니면 불펜 확률을 탄다
static func is_starter_role(role: String) -> bool:
	return role.ends_with("선발")


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
