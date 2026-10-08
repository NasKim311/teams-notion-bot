# teams-notion-bot
Teams 대화를 붙여넣으면 Notion 이슈 DB에 등록하는 Cloudflare Worker (웹 입력 폼).
Teams 아웃고잉 웹후크는 그룹 채팅을 지원하지 않아 사용하지 않는다.

## 스택
- Cloudflare Workers, TypeScript strict, Wrangler
- Notion은 SDK 없이 fetch로 직접 호출 (Notion-Version: 2022-06-28)
- 테스트: Vitest + @cloudflare/vitest-pool-workers
- 개발 환경: Windows / PowerShell

## 흐름
GET / 입력 화면 → 붙여넣기(+스크린샷) → POST /api/preview → 이슈 카드 확인·수정 → POST /api/uploads(이미지) → POST /api/issues(새 이슈) 또는 POST /api/issues/update(기존 이슈에 추가)

- preview: 팀 양식 섹션(이슈 사항/기대 동작/[ 이슈 ]/이슈 N) 인식, 여러 이슈 나누기, 개발 정보(레드마인/MR 링크, 브랜치 명, 관련 파일, 영역, FO/BO) 추출, 같은 레드마인 링크의 기존 페이지 조회
- 제목: "[영역 또는 FO/BO] 요약" — 주 섹션 첫 문장을 규칙으로 다듬음(괄호 부연·-> 뒤·추측·존댓말 어미 정리). "…"로 자르지 않고, 60자를 넘으면 그 안에서 끝나는 절까지 쓰고 끝맺음. AI 요약은 쓰지 않음. 제목: 필드가 있으면 그대로
- 모듈: parse(텍스트→Issue) / sections(라벨·코드 줄) / extract(개발 정보) / blocks(본문→Notion 블록) / notion(API) / issue(검증) / page(화면)

## Notion DB (SSG 이슈 트래커)
- 봇이 쓰는 컬럼: 제목(title), 유형(select), 작성자(select, "정주영(사원) - 유젠" → "정주영"), 레드마인 링크(url), MR 링크(url), 브랜치 명(text), 관련 파일(text), 영역(multi_select), FO/BO(select), 상태(status, 업데이트 시)
- 사람이 관리: 담당자, 우선순위, 배포일. 등록일은 생성 일시(자동)
- 컬럼 이름은 notion.ts의 PROP 한 곳에서 관리
- Teams 메시지 링크는 저장하지 않음 (링크 줄은 본문에서 제거)
- 연결(teams-notion-bot) 기능: 콘텐츠 읽기·업데이트·삽입 필요
- REDMINE_ISSUE_URL(vars): "#11661" → 일감 링크 변환

## 규칙
- 비밀값은 env로만 접근: FORM_PASSWORD, NOTION_TOKEN, NOTION_DATABASE_ID. 코드/로그 출력 금지
- /api/* 는 모두 FORM_PASSWORD 확인 (실패 → 401). 검증 오류 → 400, Notion 오류 → 502 + 사용자용 안내
- 로그에는 Notion status/code만 남기고 붙여넣은 내용·토큰은 남기지 않음
- 입력 화면은 외부 리소스 없이 인라인 CSS/JS + nonce CSP. 사용자 입력은 textContent/value로만 렌더링
- 파싱/검증 로직은 순수 함수로 작성, index.ts는 조립만
- Notion DB 컬럼 이름/타입을 바꾸면 notion.ts의 PROP·buildProperties도 함께 수정
- 커밋 전 `npm run typecheck && npm test` 통과 필수

## 명령어
- npm run dev / npm test / npm run typecheck / npx wrangler deploy / npx wrangler tail

## 범위 밖
- 중복 감지(레드마인 링크 일치 외), AI 분류
