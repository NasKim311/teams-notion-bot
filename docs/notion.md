# Notion DB 운영

## DB와 연결
- DB: **SSG 이슈 트래커** (ID는 `NOTION_DATABASE_ID`). 팀의 기존 "SSG FE 형상관리" DB는 **절대 건드리지 않는다**.
- 연결(integration) 이름: `teams-notion-bot`. 기능 3가지가 모두 켜져 있어야 한다: **콘텐츠 읽기·업데이트·삽입**.
  - 업데이트가 꺼져 있으면 DB 수정·페이지 수정이 403 `restricted_resource`로 실패한다.
- API: SDK 없이 fetch, `Notion-Version: 2022-06-28`. 이미지 업로드(`/file_uploads`)도 이 버전에서 동작한다.

## 컬럼

| 컬럼 | 타입 | 누가 채우나 |
|---|---|---|
| 제목 | title | 봇 (`[영역] 요약`, [decisions.md](decisions.md)) |
| 유형 | select (버그/개선/운영/기타) | 봇 |
| 작성자 | select | 봇 (Teams 머리글 또는 `작성자:` 줄의 이름) |
| 레드마인 링크 | url | 봇 (`#11661` → `REDMINE_ISSUE_URL` + 번호) |
| MR 링크 | url | 봇 (`merge_requests/N`) |
| 브랜치 명 | rich_text | 봇 (`feature/…` 등, 쉼표로 구분) |
| 관련 파일 | rich_text | 봇 (`경로:75`, 최대 10개) |
| 영역 | multi_select | 봇 (`views/<모듈>/`, `/<모듈>/… 페이지`, `fit/fitXxx`) |
| FO/BO | select | 봇 (본문에서 추정) |
| 상태 | status | 업데이트로 추가할 때만 봇이 바꿈. 새 등록 시에는 Notion 기본값 |
| 담당자, 우선순위, 배포일 | select/select/date | 사람 |
| 등록일 | created_time | 자동 |

- 코드의 컬럼 이름·타입은 `src/notion.ts`의 `PROP`/`PROP_TYPES` 한 곳에서 관리한다.
- 상태 그룹: To-do{검토 필요, 시작 전} / In progress{진행 중} / Complete{미진행, 완료}.
  - 추천 상태는 그룹 안의 같은 이름("진행 중", "완료")을 먼저 고른다. 완료 그룹 첫 옵션이 "미진행"이기 때문이다.

## 사용자가 DB를 직접 바꾼다
- 사용자는 Notion에서 컬럼 이름·타입을 직접 고친다 (예: 2026-10-08에 일감→레드마인 링크, 작성자 text→select, 원문 링크 삭제).
- "싱크 맞춰줘"라는 요청을 받으면 `notion-sync` 스킬 절차를 따른다. 시작은 항상 `npm run notion:schema`로 실제 스키마를 확인하는 것이다.
- 컬럼이 코드와 맞지 않으면 운영에서 등록이 `validation_error`(502, "속성이 맞지 않아요")로 실패한다.

## 스크립트 (로컬, `.dev.vars` 필요)
- `npm run notion:schema`: 실제 스키마를 출력하고 `PROP`과 비교한다. 읽기 전용이다.
- `npm run notion:retitle`: 기존 페이지 제목을 현재 규칙으로 다시 만든다. 기본은 미리보기만 한다.
  - `-- --apply`로 적용하고, `-- --skip <ID,...>`로 일부 페이지를 제외한다. 이전 제목은 `scripts/.backups/`에 백업된다 (git 제외).
  - 사람이 직접 고친 제목은 `--skip`으로 빼야 한다. 현재 직접 다듬은 2건:
    - `[fit] 검색결과 총 갯수가 total이 아닌 response.length로 표시됨`
    - `[BO] 쿠폰 미리보기에서 title·desc 미입력 시 표시 이상`
- 스크립트는 토큰을 출력하지 않는다. 출력되는 제목·본문은 회사 데이터이므로 커밋하거나 외부로 보내지 않는다.
