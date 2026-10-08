# teams-notion-bot

Teams 그룹 채팅의 이슈 대화를 붙여넣으면, 내용을 분석해 **Notion 이슈 DB(SSG 이슈 트래커)** 에 정리된 페이지로 등록하는 웹 도구입니다.
Cloudflare Worker 하나로 동작하며, 런타임 의존성과 외부 AI 없이 규칙(TypeScript)만으로 분석합니다.

> **왜 붙여넣기 방식인가?** 이슈가 오가는 곳이 Teams **그룹 채팅**이라 Outgoing Webhook을 쓸 수 없습니다 (채널 전용).
> 팀(채널)을 새로 만들 수 없고, Power Automate도 Free 라이선스라 HTTP 연동이 막혀 있습니다. 자세한 내용: [docs/decisions.md](docs/decisions.md)

---

## 사용법

운영 주소: https://teams-notion-bot.by-nas.workers.dev (팀 공유 비밀번호 필요)

1. **붙여넣기**: Teams에서 이슈 관련 메시지를 복사해 붙여넣습니다. 스크린샷은 화면에서 `Ctrl+V`로 붙이거나 파일을 고릅니다.
2. **미리보기** (`Ctrl+Enter`): 이슈별 카드가 만들어집니다. 제목·유형·작성자·FO/BO·레드마인/MR 링크·브랜치·영역·관련 파일·본문을 확인하고 고칩니다.
   - 한 메시지에 `이슈 1)`, `이슈 2)`처럼 여러 이슈가 있으면 나눠서 보여줍니다. 하나로 등록하려면 "이슈별로 나눠 등록"을 끕니다.
   - 같은 레드마인 일감으로 등록된 이슈가 있으면 **"기존 이슈에 추가"** 를 고를 수 있습니다. 이때 상태(진행 중/완료)도 바꿀 수 있습니다.
3. **Notion에 등록**: 카드별로 등록되고, 만들어진 Notion 페이지 링크가 표시됩니다.

### 추천 양식
Teams 대화를 그대로 붙여도 되지만, 직접 쓸 때는 아래 양식이 가장 잘 인식됩니다. 화면의 "양식 넣기" 버튼으로 넣을 수 있습니다.
```
작성자: 홍길동

이슈 사항 : src/views/shop/pages/Page.tsx 75번째 줄
로그인 버튼이 눌리지 않음

기대 동작 : 로그인 페이지로 이동

이슈 원인 :

해결 방법 :
```
- 제목을 직접 정하려면 맨 위에 `제목: [버그] 한 줄 요약`을 적습니다.
- 유형 태그는 `[버그]`/`[개선]`/`[운영]`입니다. 없으면 내용으로 추정합니다.

## 무엇이 어떻게 들어가나

### Notion 컬럼
| 컬럼 | 채우는 방법 |
|---|---|
| 제목 | `[영역] 요약` 자동 생성 (아래 참고) |
| 유형 | 태그를 먼저 보고, 없으면 신호 단어로: 버그 > 운영 > 개선 > 기타 |
| 작성자 | Teams 머리글에서 이름만 ("정주영(사원) - 유젠" → "정주영") |
| 레드마인 링크 | 레드마인 URL 또는 `#11661`, `일감번호 8795` → 링크 |
| MR 링크 / 브랜치 명 | `merge_requests/N` 링크, `feature/…` 등 브랜치 |
| 관련 파일 / 영역 | `경로:줄` (최대 10개), `views/<모듈>/`의 모듈 이름 |
| FO/BO | 본문의 `FO`/`BO`, "프론트 오피스"/"백오피스" |
| 상태 | 기존 이슈에 추가할 때만 변경 ("수정 완료" → 완료 추천) |
| 담당자·우선순위·배포일 | 사람이 직접 관리 |

### 제목
- 현상(이슈 사항)의 첫 문장을 다듬어 `[영역] 요약`으로 만듭니다. 영역이 없으면 `[FO]`/`[BO]`, 둘 다 없으면 요약만 씁니다.
- 괄호 부연, `->` 뒷부분, 인사말은 빼고, 추측·존댓말 어미는 정리합니다 ("설정된 것으로 보임" → "설정됨").
- `…`로 자르지 않습니다. 60자를 넘으면 그 안에서 끝나는 절까지만 쓰고 끝맺습니다.

```
FitDetail.tsx: ssoToken 의 조건문이 반대로 설정된 것으로 보임   →   [fit] ssoToken의 조건문이 반대로 설정됨
```

### 본문 (새 이슈)
팀 양식의 라벨을 표준 섹션으로 모읍니다. 내용이 없는 섹션도 제목은 넣어서 나중에 Notion에서 채울 수 있습니다.
```
🐞 현상        ← 이슈 사항 / 현상 / 문제점 / 이슈 N) / 라벨 없는 글
🎯 기대 동작    ← 기대 동작
🔍 원인        ← 이슈 원인 / 원인
🛠 처리·해결    ← 해결 방법 / 처리 상황 / 개선
📎 참고        ← 관련 추가 이슈 / 그 외 라벨
(스크린샷)
```
- Teams 머리글(작성자·시간)과 답글의 잡담, 브랜치·링크만 있는 줄은 본문에서 빠집니다 (값은 컬럼에 있음).
- 코드 조각은 코드 블록이 됩니다.
- **기존 이슈에 추가**할 때는 정리하지 않고 `🔄 업데이트 · 작성자 · 시간` 아래에 그대로 붙입니다.

---

## 구조

브라우저(입력 화면) ──▶ Cloudflare Worker ──▶ Notion API

```
src/
├─ index.ts          진입점: 라우팅과 비밀번호 확인만
├─ types.ts          Env, Issue 등 공용 타입
├─ api/              API별 처리
│   ├─ preview.ts    POST /api/preview (분석 + 기존 이슈 후보)
│   ├─ issues.ts     POST /api/issues, /api/issues/update
│   └─ uploads.ts    POST /api/uploads
├─ http/             auth(비밀번호) · response(응답·보안 헤더) · request(본문 읽기) · log(오류 로그)
├─ issue/            붙여넣기 → 이슈 (순수 함수)
│   ├─ parse.ts      조립: parseIssues / parsePastedText
│   ├─ text.ts       정규화, 본문 속 머리글 줄 표시
│   ├─ header.ts     Teams 머리글·작성자
│   ├─ sections.ts   라벨·코드 줄 판별
│   ├─ classify.ts   유형 분류, 추천 상태
│   ├─ title.ts      제목 규칙
│   ├─ split.ts      여러 이슈 나누기
│   ├─ extract.ts    레드마인/MR/브랜치/파일/영역/FO·BO
│   ├─ structure.ts  본문 고정 틀
│   └─ validate.ts   입력 검증
├─ notion/           Notion API
│   ├─ client.ts     요청·오류·사용자용 메시지
│   ├─ properties.ts 컬럼 이름(PROP)과 속성 변환
│   ├─ pages.ts      페이지 생성·조회·업데이트
│   ├─ uploads.ts    이미지 업로드
│   └─ blocks.ts     본문 → Notion 블록
└─ page/             입력 화면
    ├─ page.ts       HTML (nonce CSP)
    ├─ styles.css    스타일   ┐ Wrangler가 텍스트로 읽어
    └─ client.js     브라우저 코드 ┘ page.ts가 인라인
test/                src와 같은 폴더 구조
```

| API | 하는 일 |
|---|---|
| `GET /` | 입력 화면 (인라인 HTML/JS, nonce CSP) |
| `POST /api/preview` | 붙여넣은 텍스트 분석 + 같은 레드마인 일감의 기존 이슈 조회 |
| `POST /api/uploads` | 스크린샷을 Notion에 업로드 |
| `POST /api/issues` | 새 이슈 페이지 생성 |
| `POST /api/issues/update` | 기존 이슈 끝에 업데이트 추가, 상태 변경 |

- 모든 `/api/*`는 비밀번호를 확인합니다 (실패하면 401).
- 분석·검증 로직은 순수 함수라 단위 테스트로 검증합니다.
- 기술 스택: Cloudflare Workers, TypeScript strict, Wrangler, Vitest + `@cloudflare/vitest-pool-workers`, Notion REST API (SDK 없이, `Notion-Version: 2022-06-28`).

## 개발

### 준비
```powershell
npm install
copy .dev.vars.example .dev.vars   # FORM_PASSWORD, NOTION_TOKEN, NOTION_DATABASE_ID 입력
```
- Notion 연결(integration)에는 **콘텐츠 읽기·업데이트·삽입** 권한이 있어야 하고, 이슈 DB에 연결되어 있어야 합니다.
- 로컬도 실제 Notion DB에 씁니다. 테스트로 만든 페이지는 지워주세요.

### 명령어
| 명령 | 설명 |
|---|---|
| `npm run dev` | 로컬 실행 (http://localhost:8787) |
| `npm test` | 테스트 |
| `npm run typecheck` | 타입 검사 (Worker 코드 + 스크립트) |
| `npm run lint` / `npm run format` | Biome 검사 / 자동 정리 (컨벤션: [docs/conventions.md](docs/conventions.md)) |
| `npx wrangler deploy` | 운영 배포 (운영 비밀값은 `npx wrangler secret put <이름>`) |
| `npx wrangler tail` | 운영 로그 |
| `npm run notion:schema` | Notion DB 컬럼과 코드 비교 (읽기 전용) |
| `npm run notion:retitle` | 기존 페이지 제목을 현재 규칙으로 재생성 (기본 미리보기, `-- --apply`) |
| `npm run notion:restructure` | 기존 페이지 본문을 현재 틀로 재작성 (기본 미리보기, `-- --apply`) |

`notion:retitle`과 `notion:restructure`는 적용하기 전 상태를 `scripts/.backups/`에 백업합니다 (git 제외).

## 문서
| 문서 | 내용 |
|---|---|
| [docs/decisions.md](docs/decisions.md) | 주요 결정과 이유 (붙여넣기 방식, 제목·본문 규칙, AI 미사용 등) |
| [docs/notion.md](docs/notion.md) | Notion DB 컬럼, 연결 권한, DB 변경 시 싱크 절차 |
| [docs/operations.md](docs/operations.md) | 운영 주소, 비밀값, 배포·로그 |
| [docs/conventions.md](docs/conventions.md) | 코드 컨벤션 (이름·파일·주석·테스트 규칙) |
| [docs/gotchas.md](docs/gotchas.md) | 개발하며 겪은 함정 |
| [docs/roadmap.md](docs/roadmap.md) | 알려진 한계와 개선 후보 |
| [CLAUDE.md](CLAUDE.md) | Claude Code 작업 규칙 (스킬: `.claude/skills/` — notion-sync, retitle, restructure, deploy) |
