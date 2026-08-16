extends RefCounted
class_name SeasonEnd

## 시즌 종료 순서 — M6-2.
##
## 원본: `usecases/seasonRollover.ts`의 `runWorldSeasonEnd`
##
## ⚠ **여기서 옮기는 건 계산이 아니라 순서다.** 각 단계의 알맹이는 이미
## 다른 모듈에 있다(`Aging` · `Awards` · `Draft` · `CareerSummary`).
## 여기가 하는 일은 **무엇을 어떤 순서로 부르나**와 **한 해에 한 번만
## 도나** 둘뿐이다.
##
## 왜 순서가 모듈이 되나 — 02에서 이 순서가 **세 분기에 각각** 적혀 있었고
## (군 복무·프로·학생) 그중 어디도 안 타는 경로가 있었다. 주인공이 지명된
## 해엔 `acceptDraftOffer`가 다음 해를 직접 열어서 **세계 오프시즌이 통째로
## 건너뛰어졌다** — 실측으로 그 해 NPC 사건이 `fa_signed 6`뿐이었고
## 드래프트·은퇴·이적·연도기록이 전부 없었으며 **주인공 나이도 안 올랐다.**
##
## 정본을 하나로 두면 부르는 자리가 몇이든 순서가 안 갈린다.


## 시즌 종료 단계. **순서가 곧 계약이다.**
##
## 서로 걸린 제약이 넷 있고 전부 실측으로 나왔다:
##   ① 진급·졸업 < 드래프트   — 졸업생이 드래프트 풀에 있어야 한다
##   ② 드래프트 < 오프시즌     — 오프시즌이 미지명자 진로를 배정한다
##   ③ 주인공 기록 < 수상      — 수상은 연도 기록 위에 얹는다
##   ④ 수상 < 노쇠            — 수상 판정이 깎이기 전 능력치를 본다
const PHASES: Array[Dictionary] = [
	# ⚠ **가드 뒤·처리 앞.** 가드 앞이면 같은 해에 두 번 잡히고, 진급 뒤면
	# 이미 학년·나이가 지나 그 해 기록이 사라진다.
	#
	# 계측 전용이다 — 운영 코드가 여기 붙으면 안 된다. 하네스가
	# 롤오버 직전에 스냅샷을 잡는데 **주인공 마지막 학년은 그 갈래를 안 탄다**
	# (진로 결정 경로가 시즌 종료를 직접 부르고 끝낸다). 그래서 고교 3학년
	# 성적을 한 번도 못 잡았고 표본이 늘 1·2학년뿐이었다
	{"id": "measure_hook", "label": "계측 스냅샷", "optional": true},

	# ⓪ NPC 학년 진급·졸업·나이 — **드래프트보다 먼저**
	{"id": "advance_grades", "label": "진급·졸업·나이", "optional": false},

	# NPC 드래프트 — **오프시즌보다 먼저**
	{"id": "npc_draft", "label": "NPC 드래프트", "optional": false},

	# 시즌 성적을 연도 기록으로 굳힌다. 오프시즌이 로스터를 흩기 전이어야 한다
	{"id": "season_history", "label": "시즌 기록 저장", "optional": false},

	# 시즌 관계 — **성적이 굳은 뒤다.** 앞에 두면 지난해 성적으로 잰다.
	# 구단주는 주간 항목이 없고 여기서만 오르내린다
	{"id": "season_relations", "label": "시즌 관계", "optional": false},

	# 전 리그 오프시즌 — 승강·FA·방출·트레이드·은퇴
	{"id": "league_offseason", "label": "리그 오프시즌", "optional": false},

	# ⚠ **주인공 시즌 기록은 여기서 남긴다.** 02에선 결산 화면이 유일한
	# 호출부라 **화면을 열어야만 쌓였고** 자동 진행에선 은퇴할 때까지 한
	# 줄도 없었다
	{"id": "protagonist_record", "label": "주인공 시즌 기록", "optional": false},

	# 수상은 연도 기록이 만들어진 **뒤**여야 얹을 자리가 있다
	{"id": "awards", "label": "시즌 수상", "optional": false},

	# 노쇠는 수상 **뒤**다 — 안 그러면 수상 판정이 깎인 능력치를 본다
	{"id": "aging", "label": "노쇠", "optional": false},

	# 시즌 성적으로 구단 성향을 갱신한다 — **팀 개성이 생기는 유일한 경로**.
	#
	# ⚠ 02에선 이 계산이 구현돼 있는데 **아무도 안 불렀다.** 전 팀이 전 항목
	# 50으로 떨어졌고, 트레이드 buyer 조건이 `승리압박 > 60`이라 **buyer가
	# 구조적으로 0팀**이었다 — 실측 트레이드 9 → 8 → 2 → 1 → 1 → 0
	{"id": "team_profiles", "label": "구단 성향 갱신", "optional": false},

	# 계약 — 연차가 오르고 계약이 한 해 줄어든다.
	#
	# ⚠ **FA보다 먼저다.** 안 줄이면 아무도 계약이 끝나지 않아 시장이 영영
	# 비어 있다. 계약이 없는 사람(신인·이적자)에게는 여기서 붙인다
	{"id": "contracts", "label": "계약 갱신", "optional": false},

	# FA — **구단 성향 뒤다.** 입찰이 성적 압박과 구단주 씀씀이를 읽는다
	{"id": "free_agency", "label": "FA", "optional": false},

	# 트레이드 — **FA 뒤다.** 시장에서 못 채운 자리를 거래로 메운다.
	#
	# ⚠ 구단 성향이 서야 buyer/seller가 갈린다 — 02는 전 팀이 중립이라
	# buyer가 구조적으로 0팀이었고 거래가 9 → 8 → 2 → 1 → 1 → 0으로 말랐다
	{"id": "trades", "label": "트레이드", "optional": false},

	# 배경 리그 마무리
	{"id": "background", "label": "배경 처리", "optional": false},
]


## ⚠ **가드 연도는 반드시 세이브에 넣는다.** 02에선 이게 스토어 안에만
## 있었다 — 가드가 막으려는 결과(NPC 전원 진급·나이 +1, 드래프트 거래기록)는
## DB에 즉시 쓰여 영구인데 **가드 자신은 세션 한정**이라, 앱을 껐다 켜면
## 없던 일이 됐다.
##
## 새로 "한 해에 한 번" 가드를 만들면 여기에 넣는다. 저장과 복원 둘 중
## 하나만 하면 아무 일도 안 일어난다
const SAVED_FIELDS: Array[String] = [
	"last_world_season_end_year",
	"last_draft_year",
]


## 이 해에 시즌 종료를 돌리나.
##
## 지나간 해로 되돌아가도 안 돈다 — 이미 영구히 쓰인 결과 위에 또 쓴다
static func should_run(last_year: int, now: int) -> bool:
	return now > last_year


static func phase_index(id: String) -> int:
	for i in PHASES.size():
		if PHASES[i]["id"] == id:
			return i
	return -1


## 이 해에 돌 단계 목록. 이미 돌았으면 빈 배열
static func plan(last_year: int, now: int) -> Array:
	if not should_run(last_year, now):
		return []

	var out: Array = []
	for p in PHASES:
		out.append(p["id"])
	return out
