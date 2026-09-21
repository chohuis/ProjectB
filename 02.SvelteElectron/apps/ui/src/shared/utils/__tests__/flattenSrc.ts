/**
 * **소스를 글자로 읽는 검사가 서식에 안 깨지게** (2026-09-21 · A-6).
 *
 * 🔴 왜 있나. 이 저장소의 배선 검사는 `readFileSync` 로 소스를 읽어
 *   「이 줄이 있는가」를 본다. 그런데 prettier 가 긴 식을 여러 줄로 접거나
 *   정렬용 여러 칸 띄어쓰기를 한 칸으로 줄이면 **그 글자가 깨진다.**
 *   그래서 「검사가 읽는 파일」을 통째로 `.prettierignore` 에 넣어 왔고,
 *   그 목록이 59 개까지 자랐다(`.prettierignore` 머리말).
 *
 *   눌러 놓고 비교하면 **서식이 바뀌어도 안 깨진다.** 검사가 실제로 묻는 것은
 *   「이 배선이 있는가」이지 「몇 줄로 적혔는가」가 아니다.
 *
 * ⚠ 정규식을 안 쓴다(`CLAUDE.md`) — 글자를 하나씩 훑는다.
 * ⚠ **문자열 리터럴 안의 띄어쓰기도 같이 눌린다.** 문안을 글자 그대로 봐야
 *   하는 검사는 원본을 쓴다.
 * ⚠ 기대값도 같이 눌러 적어야 한다 — 한쪽만 누르면 안 맞는다.
 */
export function flattenSrc(src: string): string {
  const out: string[] = [];
  let prevSpace = true;
  for (const ch of src) {
    const isSpace = ch === " " || ch === "\n" || ch === "\t" || ch === "\r";
    if (isSpace) {
      if (!prevSpace) out.push(" ");
      prevSpace = true;
    } else {
      out.push(ch);
      prevSpace = false;
    }
  }
  return out.join("");
}
