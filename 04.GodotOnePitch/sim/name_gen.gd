extends RefCounted
class_name NameGen

## 이름 생성 — M8-2.
##
## 원본: `npc_sim.rs`의 내장 한국 풀 · `roster_gen.rs`의 `gen_name_from_pool`
##   풀 데이터: `generation_rules.json`의 `rosterRules.*.namePool`
##
## ⚠ **한글과 로마자를 인덱스로 같이 뽑는다.** 값을 따로 뽑으면 영어 표기를
## 켰을 때 **다른 사람이 된다** — 김씨가 Lee로 나온다. 그래서 짝 배열의
## 길이가 같은지도 검사가 본다.
##
## ⚠ **`name_en`에 한글이 들어가면 안 된다.** 02에선 두 번째 값이
## `"김 우찬"`(띄어쓴 한글)이었고, 영어 표기를 켜면 그대로 한글이 떴다.
##
## ⚠ **리그 풀이 없으면 내장 한국 풀로 떨어진다.** 02에서 그래서
## **ABL·JBL이 한국 이름으로 찼다** — 풀을 넘겼는지가 유일한 갈림길이었다.
## 여기서는 리그 id로 고르므로 빠뜨릴 수가 없다.
##
## ## 표기 규칙
##
## 로마자는 어느 리그든 **이름-성** 순이다 (`Woo-chan Kim` · `Takumi Yamaguchi`).
## 한글은 리그마다 다르다 — 한국은 붙여 쓰고(김우찬) 일본은 띄어 쓴다
## (야마구치 다쿠미).
##
## ⚠ **조합은 8,000가지지만 음절 60개만 매핑하면 전부 커버된다.** 이게 이
## 작업이 감당 가능한 이유다.


## ── 한국 (내장) ──────────────────────────────────────────────
const KO_SURNAMES: Array[String] = [
	"김", "이", "박", "최", "정", "강",
	"조", "윤", "장", "임", "한", "오",
	"서", "신", "권", "황", "안", "송",
	"류", "전",
]
const KO_SURNAMES_EN: Array[String] = [
	"Kim", "Lee", "Park", "Choi", "Jung", "Kang",
	"Cho", "Yoon", "Jang", "Lim", "Han", "Oh",
	"Seo", "Shin", "Kwon", "Hwang", "Ahn", "Song",
	"Ryu", "Jeon",
]
const KO_GIVEN_A: Array[String] = [
	"민", "준", "현", "재", "우", "지",
	"도", "성", "진", "동", "태", "수",
	"영", "혁", "훈", "기", "상", "정",
	"세", "찬",
]
const KO_GIVEN_A_EN: Array[String] = [
	"Min", "Jun", "Hyun", "Jae", "Woo", "Ji",
	"Do", "Sung", "Jin", "Dong", "Tae", "Soo",
	"Young", "Hyuk", "Hoon", "Ki", "Sang", "Jung",
	"Se", "Chan",
]
const KO_GIVEN_B: Array[String] = [
	"준", "혁", "원", "환", "빈", "욱",
	"식", "윤", "완", "호", "진", "우",
	"기", "수", "민", "찬", "훈", "성",
	"재", "현",
]
const KO_GIVEN_B_EN: Array[String] = [
	"jun", "hyuk", "won", "hwan", "bin", "wook",
	"sik", "yoon", "wan", "ho", "jin", "woo",
	"ki", "soo", "min", "chan", "hoon", "sung",
	"jae", "hyun",
]


## ── 일본 (JBL) — 한글이 원본, 영문이 짝 ─────────────────────
const JP_SURNAMES: Array[String] = [
	"사토", "스즈키", "다카하시", "다나카", "이토", "와타나베",
	"야마모토", "나카무라", "고바야시", "가토", "요시다", "야마다",
	"사사키", "야마구치", "마쓰모토", "이노우에", "기무라", "하야시",
	"시미즈", "야마자키", "모리", "이케다", "하시모토", "이시카와",
	"야마시타", "오가와", "이시이", "마에다", "후지타", "고토",
	"곤도", "아오키", "사카모토", "엔도", "아오야마", "후지이",
	"니시무라", "후쿠다", "오타", "미우라", "오카다", "마쓰다",
	"나카지마", "하라다", "고야마", "다무라",
]

const JP_SURNAMES_EN: Array[String] = [
	"Sato", "Suzuki", "Takahashi", "Tanaka", "Ito", "Watanabe",
	"Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada",
	"Sasaki", "Yamaguchi", "Matsumoto", "Inoue", "Kimura", "Hayashi",
	"Shimizu", "Yamazaki", "Mori", "Ikeda", "Hashimoto", "Ishikawa",
	"Yamashita", "Ogawa", "Ishii", "Maeda", "Fujita", "Goto",
	"Kondo", "Aoki", "Sakamoto", "Endo", "Aoyama", "Fujii",
	"Nishimura", "Fukuda", "Ota", "Miura", "Okada", "Matsuda",
	"Nakajima", "Harada", "Koyama", "Tamura",
]

const JP_GIVEN: Array[String] = [
	"하루토", "소타", "유토", "렌", "리쿠", "다이키",
	"쇼타", "가이토", "유마", "고타", "다쿠미", "겐타",
	"쇼헤이", "료타", "히로토", "유키", "다이스케", "고헤이",
	"게이스케", "다이고", "마사히로", "슌스케", "다쓰야", "히로시",
	"가즈키", "노부야", "료스케", "유스케", "신타로", "고지",
	"데쓰야", "아쓰시", "다카히로", "나오키", "쓰요시", "마코토",
	"히데키", "가쓰야", "슌", "조", "쓰바사", "하야토",
	"이쓰키", "미나토",
]

## ── 서양 (ABL) — 영문이 원본, 한글이 짝 ─────────────────────

const JP_GIVEN_EN: Array[String] = [
	"Haruto", "Sota", "Yuto", "Ren", "Riku", "Daiki",
	"Shota", "Kaito", "Yuma", "Kota", "Takumi", "Kenta",
	"Shohei", "Ryota", "Hiroto", "Yuki", "Daisuke", "Kohei",
	"Keisuke", "Daigo", "Masahiro", "Shunsuke", "Tatsuya", "Hiroshi",
	"Kazuki", "Nobuya", "Ryosuke", "Yusuke", "Shintaro", "Koji",
	"Tetsuya", "Atsushi", "Takahiro", "Naoki", "Tsuyoshi", "Makoto",
	"Hideki", "Katsuya", "Shun", "Jo", "Tsubasa", "Hayato",
	"Itsuki", "Minato",
]

const EN_SURNAMES: Array[String] = [
	"Anderson", "Baker", "Brooks", "Carter", "Coleman", "Curtis",
	"Diaz", "Ellis", "Foster", "Garcia", "Gibson", "Gomez",
	"Grant", "Hayes", "Hernandez", "Hoffman", "Jenkins", "Kelly",
	"Lambert", "Lopez", "Marshall", "Mendoza", "Miller", "Morales",
	"Nelson", "Ortiz", "Palmer", "Perez", "Ramirez", "Reyes",
	"Rivera", "Robinson", "Rodriguez", "Sanders", "Santana", "Shaw",
	"Simmons", "Stewart", "Sullivan", "Torres", "Vargas", "Wallace",
	"Warren", "Webb", "Wheeler", "Wilson", "Wright", "Young",
]

const EN_SURNAMES_KO: Array[String] = [
	"앤더슨", "베이커", "브룩스", "카터", "콜먼", "커티스",
	"디아스", "엘리스", "포스터", "가르시아", "깁슨", "고메스",
	"그랜트", "헤이스", "에르난데스", "호프먼", "젠킨스", "켈리",
	"램버트", "로페스", "마셜", "멘도사", "밀러", "모랄레스",
	"넬슨", "오티스", "파머", "페레스", "라미레스", "레예스",
	"리베라", "로빈슨", "로드리게스", "샌더스", "산타나", "쇼",
	"시먼스", "스튜어트", "설리번", "토레스", "바르가스", "월리스",
	"워런", "웹", "휠러", "윌슨", "라이트", "영",
]

const EN_GIVEN: Array[String] = [
	"Aaron", "Adrian", "Austin", "Brandon", "Brett", "Caleb",
	"Carlos", "Chase", "Cody", "Cole", "Dallas", "Daniel",
	"Derek", "Dustin", "Eddie", "Elvis", "Ethan", "Felix",
	"Gavin", "Hector", "Hunter", "Isaac", "Jared", "Jason",
	"Javier", "Jesse", "Jordan", "Julio", "Keith", "Kevin",
	"Kyle", "Logan", "Lucas", "Manny", "Marcus", "Mason",
	"Miguel", "Nathan", "Nick", "Owen", "Pedro", "Preston",
	"Rafael", "Ramon", "Ryan", "Shane", "Spencer", "Travis",
	"Trevor", "Tyler", "Victor", "Wade", "Wesley", "Zach",
]

const EN_GIVEN_KO: Array[String] = [
	"에런", "에이드리언", "오스틴", "브랜던", "브렛", "케일럽",
	"카를로스", "체이스", "코디", "콜", "댈러스", "대니얼",
	"데릭", "더스틴", "에디", "엘비스", "이선", "펠릭스",
	"개빈", "헥터", "헌터", "아이작", "재러드", "제이슨",
	"하비에르", "제시", "조던", "훌리오", "키스", "케빈",
	"카일", "로건", "루커스", "매니", "마커스", "메이슨",
	"미겔", "네이선", "닉", "오언", "페드로", "프레스턴",
	"라파엘", "라몬", "라이언", "셰인", "스펜서", "트래비스",
	"트레버", "타일러", "빅터", "웨이드", "웨슬리", "잭",
]

## 리그별 이름 풀. **여기 없는 리그는 한국 풀이다** — 국내 리그가 다수라
## 그게 폴백으로 맞다
const OVERSEAS: Dictionary = {
	"LEAGUE_ABL": "western", "LEAGUE_ABL_FARM": "western",
	"LEAGUE_JBL": "japanese", "LEAGUE_JBL_FARM": "japanese",
}


## 풀은 전부 상수라 빌 수 없다 — 빈 풀 가드를 두지 않는다
static func _pick(list: Array, rng: RandomNumberGenerator) -> int:
	return int(rng.randf() * list.size()) % list.size()


## 한국 이름. 성 한 글자 + 이름 두 글자를 **붙여 쓴다**
static func korean(rng: RandomNumberGenerator) -> Dictionary:
	var i: int = _pick(KO_SURNAMES, rng)
	var j: int = _pick(KO_GIVEN_A, rng)
	var k: int = _pick(KO_GIVEN_B, rng)
	return {
		"ko": KO_SURNAMES[i] + KO_GIVEN_A[j] + KO_GIVEN_B[k],
		# 로마자는 **이름-성** 순. 두 음절은 붙임표로 잇는다 — `Woo-chan Kim`
		"en": "%s-%s %s" % [KO_GIVEN_A_EN[j], KO_GIVEN_B_EN[k], KO_SURNAMES_EN[i]],
	}


## 일본 이름. 한글이 원본이고 **성-이름을 띄어 쓴다** (야마구치 다쿠미)
static func japanese(rng: RandomNumberGenerator) -> Dictionary:
	var i: int = _pick(JP_SURNAMES, rng)
	var j: int = _pick(JP_GIVEN, rng)
	# 난수 소비를 한국 풀과 맞춘다 — 갈래마다 다르면 뒤쪽이 밀린다
	rng.randf()
	return {
		"ko": "%s %s" % [JP_SURNAMES[i], JP_GIVEN[j]],
		"en": "%s %s" % [JP_GIVEN_EN[j], JP_SURNAMES_EN[i]],
	}


## 서양 이름. **영문이 원본이고 한글이 짝이다** — 한국·일본과 반대다
static func western(rng: RandomNumberGenerator) -> Dictionary:
	var i: int = _pick(EN_SURNAMES, rng)
	var j: int = _pick(EN_GIVEN, rng)
	rng.randf()
	return {
		"ko": "%s %s" % [EN_GIVEN_KO[j], EN_SURNAMES_KO[i]],
		"en": "%s %s" % [EN_GIVEN[j], EN_SURNAMES[i]],
	}


## 리그에 맞는 이름. **부르는 쪽이 풀을 고르지 않는다** — 02는 풀을
## 넘겼는지가 유일한 갈림길이라 빠뜨리면 해외가 한국 이름으로 찼다
static func for_league(league_id: String, rng: RandomNumberGenerator) -> Dictionary:
	match OVERSEAS.get(league_id, "korean"):
		"western":
			return western(rng)
		"japanese":
			return japanese(rng)
		_:
			return korean(rng)
