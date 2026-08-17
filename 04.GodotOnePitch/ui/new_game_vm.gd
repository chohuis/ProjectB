extends RefCounted
class_name NewGameVm

## 새 게임 화면 ViewModel — M7-6d.
##
## 원본: `pages/new-game/NewGamePage.svelte`
##
## ⚠ **02는 여기서 `Math.random()`을 썼다** (주인공 잠재력·성장률).
## 그래서 같은 씨앗을 넣어도 주인공이 매번 달랐다 — 시드 기반 조사를
## 한다면서 절반만 그랬다. 여기서는 씨앗 하나가 주인공까지 정한다.


## 고를 수 있는 시작 지점. **고교 하나뿐이다** — 02도 그랬다
const START_LEAGUE := "LEAGUE_HIGHSCHOOL"

const DEFAULT_NAME := "김한결"

## 투구 방향 — 02 `handednessOptions`. **"S"(양투)는 고를 수 없다** —
## 라벨 표(`handednessLabel`)에만 남아 있는 죽은 값이다
const HANDEDNESS_OPTIONS: Array[Array] = [["R", "우투"], ["L", "좌투"]]

## 투구 폼 — 02 `formOptions`. **셋이다.** 타입과 라벨 표에는
## `threeQuarter`가 있는데 선택지에 없다 — 고를 수 없으니 안 옮겼다.
##
## ⚠ **02에서도 이 값은 저장만 되고 아무 데도 안 쓰인다.** 설명이 능력치
## 이야기를 하지만(`구위 손실, 무브먼트 극대화`) 시뮬에 안 먹인다 —
## 표시용 축이다. 그걸 바꾸는 건 이주가 아니라 새 밸런스다
const FORM_OPTIONS: Array[Array] = [
	["overhand", "오버핸드", "표준 릴리스. 낙차 있는 직구와 커브에 유리"],
	["sidearm", "사이드암", "횡방향 무브먼트 특화. 동일 손 타자 봉쇄"],
	["underhand", "언더스로", "타이밍 파괴형. 구위 손실, 무브먼트 극대화"],
]

## 생년은 고정이다 — 02가 `2010-MM-DD`로 박아 뒀다.
## 04도 시작 2027년에 17세라 2010이 맞는다(우연이 아니라 같은 값이다)
const BIRTH_YEAR: int = 2010
const DEFAULT_BIRTH_MONTH: int = 4
const DEFAULT_BIRTH_DAY: int = 1

## 02 `DAYS_IN_MONTH` — **윤년을 안 본다.** 2010은 평년이라 2월이 28일이다
const DAYS_IN_MONTH: Array[int] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


static func days_in_month(month: int) -> int:
	return DAYS_IN_MONTH[clampi(month, 1, 12) - 1]


## 그 달에 있는 날로 당긴다 — 02 `$: if (birthDay > maxDay) birthDay = maxDay`.
##
## ⚠ **정본은 여기 하나다.** `build`와 `birthday_of`가 각자 당기면 한쪽이
## 등가가 되고, 그때 2월 31일 같은 생일이 조용히 저장된다
static func clamped_day(month: int, day: int) -> int:
	return clampi(day, 1, days_in_month(month))


## `2010-07-09` 꼴. 02 `birthdayStr`가 두 자리로 채운다
static func birthday_of(month: int, day: int) -> String:
	var m: int = clampi(month, 1, 12)
	return "%d-%02d-%02d" % [BIRTH_YEAR, m, clamped_day(m, day)]


static func build(s: Dictionary = {}) -> Dictionary:
	var teams: Array = []
	for t in World.teams_of(START_LEAGUE):
		teams.append({"id": t["id"], "name": t["name"]})
	# ⚠ **이름 순으로 준다.** 데이터 순서는 아무 뜻이 없고, 102팀에서
	# 자기 학교를 찾으려면 순서가 있어야 한다
	teams.sort_custom(func(a, b) -> bool: return a["name"] < b["name"])

	var name: String = s.get("name", DEFAULT_NAME)
	var team_id: String = s.get("team_id", teams[0]["id"] if not teams.is_empty() else "")

	# ⚠ **찬 슬롯이면 시작 버튼이 그렇게 말해야 한다** (U-7). 시작을 누르는
	# 순간 `Slots.save`가 옛 세이브를 지운다 — **되돌릴 수 없는 유일한 동작**인데
	# 버튼엔 "시작"이라고만 적혀 있었다. 타이틀에서 "덮어쓰기"를 누르고 들어와도
	# 여기서는 그 말이 사라진다
	var overwrite: bool = bool(s.get("overwrite", false))

	var hands: Array = []
	for h in HANDEDNESS_OPTIONS:
		hands.append({"value": h[0], "label": h[1]})
	var forms: Array = []
	for f in FORM_OPTIONS:
		forms.append({"value": f[0], "label": f[1], "desc": f[2]})

	var month: int = clampi(int(s.get("birth_month", DEFAULT_BIRTH_MONTH)), 1, 12)
	var day: int = clamped_day(month, int(s.get("birth_day", DEFAULT_BIRTH_DAY)))

	return {
		"name": name,
		"team_id": team_id,
		"teams": teams,
		"handedness": String(s.get("handedness", HANDEDNESS_OPTIONS[0][0])),
		"handedness_options": hands,
		"pitching_form": String(s.get("pitching_form", FORM_OPTIONS[0][0])),
		"form_options": forms,
		"birth_month": month,
		"birth_day": day,
		"birth_day_max": days_in_month(month),
		"birthday": birthday_of(month, day),
		"seed": int(s.get("seed", 0)),
		"overwrite": overwrite,
		"start_label": "덮어쓰고 시작" if overwrite else "시작",
		# ⚠ **이름이 비면 시작할 수 없다.** 빈 이름으로 만들면 화면 곳곳이
		# 빈칸이 되고 원인을 못 찾는다
		"can_start": not name.strip_edges().is_empty() and not team_id.is_empty(),
	}


## 새 게임을 만든다. **씨앗을 안 주면 시각으로 뽑는다** —
## 매번 다른 세계가 나와야 하지만, 그 씨앗은 세이브에 남아 재현된다
static func start(p: Dictionary) -> Dictionary:
	var seed_value: int = int(p.get("seed", 0))
	if seed_value == 0:
		seed_value = int(Time.get_unix_time_from_system()) & 0x7FFFFFFF

	return World.new_game({
		"seed": seed_value,
		"season_year": int(p.get("season_year", 2027)),
		"name": String(p.get("name", DEFAULT_NAME)).strip_edges(),
		"team_id": p.get("team_id", ""),
		"league_id": START_LEAGUE,
		# ⚠ **주인공은 고른 대로다.** 안 넘기면 `PlayerGen.roster`가 id 해시로
		# 뽑은 방향이 남아 조용히 다른 손잡이가 된다
		"handedness": String(p.get("handedness", HANDEDNESS_OPTIONS[0][0])),
		"pitching_form": String(p.get("pitching_form", FORM_OPTIONS[0][0])),
		"birthday": birthday_of(
			int(p.get("birth_month", DEFAULT_BIRTH_MONTH)),
			int(p.get("birth_day", DEFAULT_BIRTH_DAY))),
	})
