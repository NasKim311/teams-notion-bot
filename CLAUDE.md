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

- preview: 팀 양식 섹션(이슈 사항/기대 동작/[ 이슈 ]/이슈 N) 인식, 여러 이슈 나누기, 개발 정보(일감/MR/브랜치/관련 파일/영역) 추출, 같은 일감·원문 링크의 기존 페이지 조회
- 모듈: parse(텍스트→Issue) / sections(라벨·코드 줄) / extract(개발 정보) / blocks(본문→Notion 블록) / notion(API) / issue(검증) / page(화면)

## Notion DB (이슈 트래커)
- 봇이 쓰는 컬럼: 제목(title), 유형(select), 작성자(text), 원문 링크(url), 일감(url), MR(url), 브랜치(text), 관련 파일(text), 영역(multi_select), 상태(status, 업데이트 시)
- 연결(teams-notion-bot) 기능: 콘텐츠 읽기·업데이트·삽입 필요
- REDMINE_ISSUE_URL(vars): "#11661" → 일감 링크 변환

## 규칙
- 비밀값은 env로만 접근: FORM_PASSWORD, NOTION_TOKEN, NOTION_DATABASE_ID. 코드/로그 출력 금지
- /api/* 는 모두 FORM_PASSWORD 확인 (실패 → 401). 검증 오류 → 400, Notion 오류 → 502 + 사용자용 안내
- 로그에는 Notion status/code만 남기고 붙여넣은 내용·토큰은 남기지 않음
- 입력 화면은 외부 리소스 없이 인라인 CSS/JS + nonce CSP. 사용자 입력은 textContent/value로만 렌더링
- 파싱/검증 로직은 순수 함수로 작성, index.ts는 조립만
- Notion DB 속성 이름(제목/유형/작성자/원문 링크)을 바꾸면 notion.ts도 함께 수정
- 커밋 전 `npm run typecheck && npm test` 통과 필수

## 명령어
- npm run dev / npm test / npm run typecheck / npx wrangler deploy / npx wrangler tail

## 범위 밖
- 스크린샷 업로드 (원문 링크로 대체), 중복 감지, AI 분류
