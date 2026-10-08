# 겪었던 함정

## Cloudflare / Wrangler
- **compatibility_date**: 로컬 workerd가 지원하는 날짜보다 미래면 `wrangler dev`와 테스트가 실패한다 (2026-10-01 → 2026-08-22로 낮춤). 올릴 때는 로컬에서 먼저 확인한다.
- **Windows에서 `wrangler dev` 종료**: 백그라운드로 띄운 뒤 끄면 node/workerd 프로세스가 남아 포트(8787)를 잡고 있는다. 부모 bash PID를 찾아 `taskkill /T /F`로 프로세스 트리째 종료한다.
- **workers.dev 첫 배포**: 서브도메인 등록과 이메일 인증이 필요하다 (사용자가 직접 한다).

## TypeScript / 테스트
- **Env 타입 확장**: `test/env.d.ts`에서 `interface Env extends import(...)`는 skipLibCheck 때문에 조용히 무시된다. `import type { Env as WorkerEnv }` + `declare global`로 확장한다.
- **console 스파이**: `vi.spyOn(console, "error")`는 반환된 스파이 객체로 검증한다 (`console.error`를 다시 참조하면 안 맞음).
- **scripts/ 타입체크**: `npm run typecheck`는 `src`/`test`(Workers 타입)와 `scripts`(Node 타입, `scripts/tsconfig.json`)를 따로 검사한다. src 코드는 양쪽에서 통과해야 한다. 예를 들어 Node 타입에서는 `res.json()`이 `unknown`을 반환하므로 `as`로 단언한다.

## 텍스트 처리
- **NBSP**: Teams 복사본에는 NBSP(U+00A0)가 섞여 있다. `normalizeText`가 `[^\S\n]`으로 일반 공백으로 바꾼다.
  - 코드나 테스트에 NBSP 이스케이프 문자열을 직접 쓰지 말고 `String.fromCharCode(0xa0)` 또는 `[^\S\n]`을 쓴다. 편집 도구가 이스케이프를 실제 NBSP 문자로 바꿔 버린다.
- **백슬래시가 들어간 일괄 치환**: bash heredoc + python으로 치환하면 `\n`, `\s` 같은 이스케이프가 깨진다 (실제 줄바꿈이 들어감). 정규식·이스케이프가 있는 부분은 Edit 도구로 고친다.
- **대괄호 말머리**: `[테스트] 제목`처럼 대괄호 뒤에 문장이 이어지면 섹션 라벨이 아니다. 대괄호 라벨은 줄에 혼자 있을 때만 인정한다.
- **한 줄 머리글 오인**: "로그인 오류 2.1"이 작성자로 잡힌 적이 있다. 한 줄 머리글은 시간(오전/오후 hh:mm)이 있어야 인정한다.

## Notion
- **새 DB ID 착오**: 기존 "SSG FE 형상관리" DB ID를 넣어 `validation_error`가 난 적이 있다. DB ID는 링크의 `?v=` 앞 32자리다.
- **select 옵션**: 쉼표가 들어간 이름은 쓸 수 없다. 없는 옵션 이름으로 쓰면 자동으로 생성된다 (status는 자동 생성되지 않음).
- **블록 100개 제한**: 페이지 생성 요청에는 children 100개까지만 넣고, 나머지는 `/blocks/{id}/children`으로 100개씩 이어 붙인다.
