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

## 고교 전력의 최댓값 — `teams.json` 실측(102팀: 2가 43 · 3이 45 · 4가 11 · 5가 3)
const POWER_MAX: int = 5


## 권역 목록. **02는 권역을 먼저 고르게 한다** — `NewGamePage:52`:
##
## > 고교는 8권역 주말리그라 **어느 지역에서 시작하느냐가 라이벌·일정을
## > 정한다** — 102개를 한 줄로 늘어놓으면 그 구조가 안 보이고 고르기도 어렵다.
##
## ⚠ **04는 드롭다운 하나에 102개를 넣고 있었다.**
##
## ⚠ **04에 권역이 있다** — `Tournament.regions_of`가 구장에서 파생한다.
## 이름은 `ParkVm.name_of`(`parks.json`)
static func regions() -> Array:
	var out: Array = []
	for stadium_id in Tournament.regions_of(START_LEAGUE):
		var ids: Array = Tournament.regions_of(START_LEAGUE)[stadium_id]
		out.append({
			"id": String(stadium_id),
			"label": ParkVm.name_of(String(stadium_id)),
			"count": ids.size(),
			"count_label": "%d개 학교" % ids.size(),
		})
	out.sort_custom(func(a, b) -> bool: return a["label"] < b["label"])
	return out


## 그 권역의 학교. **센 학교부터** — 02도 난이도 내림차순으로 준다
## (04엔 `difficulty`가 없어 같은 축인 `power`로 정렬한다)
static func teams_in(region_id: String) -> Array:
	var ids: Array = Tournament.regions_of(START_LEAGUE).get(region_id, [])
	var out: Array = []
	for id in ids:
		out.append({
			"id": String(id),
			"name": String(World.team_field({}, String(id), "name", id)),
			"city": String(World.team_field({}, String(id), "city", "")),
			"power": float(World.team_field({}, String(id), "power", 0)),
		})
	out.sort_custom(func(a, b) -> bool:
		if not is_equal_approx(a["power"], b["power"]):
			return a["power"] > b["power"]
		return a["name"] < b["name"])
	return out


## 그 학교가 있는 권역
static func region_of(team_id: String) -> String:
	return String(World.team_field({}, team_id, "stadium", ""))


## 고른 학교의 상세. **04에 있는 것만 낸다.**
##
## ⚠ 02는 여기에 창단연도·운영예산·과거 5시즌 성적·우승 이력·스타일 배지·
## 태그·강점까지 붙인다 — **04 `teams.json`에 그 데이터가 없다**(id·이름·
## 도시·색·구장·전력·재정뿐). 지어내지 않는다
static func team_detail(team_id: String) -> Dictionary:
	if team_id.is_empty():
		return {}
	var name: String = String(World.team_field({}, team_id, "name", ""))
	if name.is_empty():
		return {}
	var stadium_id: String = String(World.team_field({}, team_id, "stadium", ""))
	var region_ids: Array = Tournament.regions_of(START_LEAGUE).get(stadium_id, [])
	var power: int = int(roundf(float(World.team_field({}, team_id, "power", 0))))
	return {
		"id": team_id,
		"name": name,
		"rows": [
			{"label": "연고", "value": String(World.team_field({}, team_id, "city", "-"))},
			# 구장 성향은 표시용이다 — 02도 엔진엔 안 먹인다
			{"label": "구장", "value": "%s · %s" % [ParkVm.name_of(stadium_id),
				ParkVm.factor_of(stadium_id)]},
			{"label": "권역", "value": "%s · %d개 학교" % [
				ParkVm.name_of(stadium_id), region_ids.size()]},
			# ⚠ **전력은 등급이 아니라 눈금이다** — 02의 난이도 다섯 칸과 달리
			# 04는 2~5의 숫자다. 최대를 같이 적어야 3이 센지 약한지 알 수 있다
			{"label": "전력", "value": "%d / %d" % [power, POWER_MAX]},
			{"label": "재정", "value": String(
				World.team_field({}, team_id, "resource", "-"))},
		],
	}


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
	# 권역을 먼저 고르고 그 안에서 학교를 고른다 — 02와 같은 2단이다
	var region_list: Array = regions()
	var name: String = s.get("name", DEFAULT_NAME)

	# ⚠ **학교가 정해져 있으면 권역은 거기서 따라온다.** 둘을 따로 들면
	# 권역 A를 보면서 권역 B의 학교로 시작하는 순간이 생긴다
	var team_id: String = String(s.get("team_id", ""))
	var region_id: String = region_of(team_id) if not team_id.is_empty() \
		else String(s.get("region_id", ""))
	if region_id.is_empty() and not region_list.is_empty():
		region_id = String(region_list[0]["id"])
	var region_teams: Array = teams_in(region_id)
	if team_id.is_empty() and not region_teams.is_empty():
		team_id = String(region_teams[0]["id"])

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
		"region_id": region_id,
		"regions": region_list,
		"region_teams": region_teams,
		"team_detail": team_detail(team_id),
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
