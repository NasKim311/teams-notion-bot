# teams-notion-bot
Teams 대화를 붙여넣으면 Notion 이슈 DB에 등록하는 Cloudflare Worker (비밀번호로 보호하는 웹 입력 폼).
Teams 연동(웹후크·Power Automate)은 불가능해서 쓰지 않는다. 이미 검토한 결정과 이유는 아래 결정 기록을 따른다.

@docs/decisions.md

## 스택
- Cloudflare Workers, TypeScript strict, Wrangler. 런타임 의존성 없음 (devDependencies만)
- Notion은 SDK 없이 fetch로 직접 호출 (Notion-Version: 2022-06-28)
- 테스트: Vitest + @cloudflare/vitest-pool-workers. 로컬 스크립트는 `scripts/` (tsx, Node 타입)
- 개발 환경: Windows / PowerShell. 작업 브랜치는 `main`

## 흐름
GET / 입력 화면 → 붙여넣기(+스크린샷) → POST /api/preview → 이슈 카드 확인·수정 → POST /api/uploads(이미지) → POST /api/issues(새 이슈) 또는 POST /api/issues/update(기존 이슈에 추가)

- preview: 팀 양식 섹션(이슈 사항/기대 동작/[ 이슈 ]/이슈 N) 인식, 여러 이슈 나누기, 개발 정보(레드마인/MR 링크, 브랜치 명, 관련 파일, 영역, FO/BO) 추출, 같은 레드마인 링크의 기존 페이지 조회
- 모듈: parse(텍스트→Issue, 제목) / sections(라벨·코드 줄) / extract(개발 정보) / blocks(본문→Notion 블록) / notion(API, 컬럼 이름 PROP) / issue(검증) / page(화면)

## 규칙
- 비밀값은 env로만 접근: FORM_PASSWORD, NOTION_TOKEN, NOTION_DATABASE_ID. 코드/로그/대화에 출력 금지
- /api/* 는 모두 FORM_PASSWORD 확인 (실패 → 401). 검증 오류 → 400, Notion 오류 → 502 + 사용자용 안내
- 로그에는 Notion status/code만 남기고 붙여넣은 내용·토큰은 남기지 않음
- 입력 화면은 외부 리소스 없이 인라인 CSS/JS + nonce CSP (style 속성 금지). 사용자 입력은 textContent/value로만 렌더링
- 파싱/검증 로직은 순수 함수로 작성, index.ts는 조립만
- Notion 컬럼 이름·타입은 `src/notion.ts`의 `PROP`/`PROP_TYPES`에서만 관리
- 커밋 전 `npm run typecheck && npm test` 통과 필수. 커밋은 작업 단위로
- **배포는 사용자가 지시할 때만** (`/deploy`). Notion 데이터 변경(페이지 수정 등)은 미리보기와 백업 먼저
- 팀의 기존 "SSG FE 형상관리" Notion DB는 건드리지 않음

## 문서
- [docs/notion.md](docs/notion.md): DB 컬럼, 누가 채우는지, 연결 권한, 싱크 절차, 직접 다듬은 제목 목록
- [docs/operations.md](docs/operations.md): 운영 주소, 시크릿, 배포·로그
- [docs/gotchas.md](docs/gotchas.md): 겪었던 함정 (compatibility_date, Windows 프로세스, NBSP, 이스케이프 치환 등)

## 스킬 (.claude/skills)
- `notion-sync`: Notion DB 컬럼이 바뀌었을 때 코드 맞추기
- `retitle`: 기존 Notion 제목을 현재 규칙으로 다시 만들기
- `deploy`: 운영 배포 + 검증 (`/deploy`로만 실행)

## 명령어
- npm run dev / npm test / npm run typecheck / npx wrangler tail
- npm run notion:schema (DB 스키마 ↔ 코드 비교, 읽기 전용)
- npm run notion:retitle [-- --apply --skip <ID,...>] (기존 제목 재생성, 기본은 미리보기)
