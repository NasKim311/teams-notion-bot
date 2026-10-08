# 코드 컨벤션

형식(들여쓰기·따옴표·줄 길이·import 순서)은 **Biome이 자동으로 맞춘다**. 이 문서는 도구가 판단할 수 없는 것만 정한다.

## 도구
- 커밋 전 `npm run format`(자동 정리)을 하고, `npm run lint`가 통과해야 한다.
- 설정은 `biome.json`: 들여쓰기 2칸, 줄 120자, 큰따옴표, 세미콜론, trailing comma, LF.
- 의도적인 예외 (설정에 반영됨):
  - 테스트의 `!`(non-null 단언): 테스트에서는 흔히 쓰는 관용 표현이다.
  - `scripts/`의 `any`: 형식이 느슨한 Notion 응답 JSON을 다룬다.
  - `obj["제목"]`처럼 한글 키를 대괄호로 쓰는 것 (`useLiteralKeys` 끔).
- 규칙을 한 곳만 끌 때는 `// biome-ignore lint/<규칙>: <이유>`를 쓴다. **이유를 반드시 적는다.**

## 언어
- **영어:** 식별자(변수·함수·타입·파일 이름).
- **한국어:** 주석, 사용자에게 보이는 메시지, 로그 문구, 테스트 이름, 문서, 커밋 메시지.
- 커밋 메시지는 `종류: 한 줄 요약` + 필요하면 본문 목록으로 쓴다.
  - 종류: `feat` 기능, `fix` 버그, `refactor` 동작 그대로 구조 변경, `style` 형식만, `docs` 문서, `test` 테스트, `chore` 도구·설정.
  - [backlog.md](backlog.md) 항목을 다루면 종류 뒤에 번호를 붙인다: `fix(B1): …`, `feat(I3): …`.

## 파일과 모듈
- **파일 하나에 책임 하나.** 파일 첫 줄 주석에 역할을 한 줄로 적는다 (예: `// 본문 텍스트 → Notion 블록.`).
- **300줄을 넘으면 분리를 검토한다.** (예외: `page/client.js`는 화면 코드 한 덩어리라 300줄을 넘는다.)
- **폴더 = 기능 영역.** `api/`(API별 처리), `http/`(요청·응답 공통), `issue/`(분석, 순수), `notion/`(Notion API), `page/`(화면). 테스트는 `test/`에 같은 구조로 둔다.
- **순수 함수와 입출력을 나눈다.**
  - 순수: `issue/` 전부, `notion/blocks.ts`, `notion/properties.ts`. 네트워크·시간·난수를 쓰지 않는다. 필요하면 인자로 받는다 (예: `now: Date`, `fetchImpl`).
  - 입출력: `notion/client·pages·uploads`(Notion 호출), `api/`(요청 처리), `index.ts`(라우팅만).
- **import 방향:** `index` → `api`·`http`·`page` / `api` → `issue`·`notion`·`http` / `notion` → `issue`(structure·text·sections). `issue/`는 `notion`·`api`·`http`를 import하면 안 된다. 같은 폴더 안에서는 `parse` → 나머지, `text`는 아무것도 import하지 않는 바닥 모듈.
- **Notion 컬럼 이름은 `PROP`으로만 쓴다.** 코드에 `"레드마인 링크"` 같은 문자열을 직접 쓰지 않는다.

## 이름
| 대상 | 규칙 | 예 |
|---|---|---|
| 파일 | 소문자 한 단어 (스크립트는 kebab-case). 폴더가 맥락을 주므로 접두어를 붙이지 않음 | `notion/pages.ts`, `notion-schema.ts` |
| 함수 | camelCase, 동사로 시작 | `parseIssues`, `buildProperties`, `extractFiles`, `makeTitle` |
| 참/거짓 | `is`·`has`로 시작 | `isCodeLine`, `isHeaderLine` |
| 상수·정규식 | UPPER_SNAKE_CASE | `TITLE_MAX`, `LONE_DEV_LINE` |
| 타입 | PascalCase | `Issue`, `SectionLabel` |

## 함수
- **export하는 함수는 `function` 선언으로 쓰고, 위에 한 줄 JSDoc(`/** … */`)을 단다.**
- 짧은 내부 도우미(한두 줄)는 화살표 함수 상수로 써도 된다 (`const plain = (items) => …`).
- **40줄을 넘으면 쪼개기를 검토한다.** 조건이 많으면 조기 반환(early return)을 쓴다.
- `src/`에서는 `!`(non-null 단언)를 쓰지 않는다. `??` 기본값, 타입 좁히기, `Record`를 쓴다.
- 오류는 타입이 있는 오류(`NotionError` 등)로 던지고, 메시지에 비밀값이나 붙여넣은 내용을 넣지 않는다.

## 정규식
- **한 번 이상 쓰거나 한눈에 안 읽히면 이름 있는 상수로 뺀다.** 위에 무엇과 맞는지 예시 주석을 단다.
  ```ts
  /** 나열 경계: "캐싱하지 않음/ 쓰로틀링 …"의 "/ " (경로의 "/"는 뒤에 공백이 없어 해당 안 됨) */
  const LIST_BREAK = /\s*\/\s+/;
  ```
- 같은 패턴이 여러 파일에 있으면 한 곳에서 export해서 쓴다.

## 주석
- **왜 그렇게 했는지, 또는 입력 → 출력 예시만 적는다.** 코드를 그대로 다시 말하는 주석은 쓰지 않는다.
  - 좋음: `// "~하고"는 조건이 이어지는 경우가 많아 끊지 않는다.`
  - 나쁨: `// 배열을 순회한다`
- 결정의 배경이 길면 [decisions.md](decisions.md)에 적고 주석에는 한 줄만 남긴다.

## 테스트
- 파일은 `test/<모듈>.test.ts`, `describe`는 함수 이름, `it`은 **한국어 동작 설명**으로 쓴다 ("~하면 ~한다", "~는 ~로").
- 입력과 출력이 표 형태면 `it.each`를 쓴다.
- 실제 팀 대화에서 나온 버그는 회귀 테스트로 남긴다 (`describe("회귀: …")`).
- Notion은 fetch 목으로 대신한다. 테스트는 실제 Notion을 호출하지 않는다.
- 버그를 고칠 때는 실패하는 테스트를 먼저 추가한다.

## 입력 화면 (`page/client.js`, `page/styles.css`)
실제 파일이라 Biome이 검사하지만, 빌드 없이 그대로 브라우저에서 실행·적용된다. `page.ts`가 nonce가 붙은 `<script>`/`<style>`로 인라인한다.
- 최신 JS(`const`/`let`, 화살표 함수, 템플릿 문자열)를 쓴다. `var`는 린트 오류다. TypeScript 문법과 `import`는 쓰지 않는다 (변환 단계가 없음).
- 자동 테스트가 없으므로, 바꾼 뒤에는 로컬(`npm run dev`)에서 미리보기·등록 흐름을 직접 확인한다. Notion에 실제로 쓰지 않으려면 브라우저에서 `fetch`를 가짜로 바꿔 확인한다.
- 요소는 `id` 또는 `data-field`/`data-role` 속성으로 찾는다. 클래스는 스타일에만 쓴다.
- 사용자 입력은 `textContent`/`value`로만 넣는다 (`innerHTML` 금지).
- `style="…"` 속성은 쓰지 않는다 (CSP). 스타일은 `<style nonce>` 안의 클래스로 쓴다.
