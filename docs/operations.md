# 배포·운영

## 환경
- 운영 주소: https://teams-notion-bot.by-nas.workers.dev (Cloudflare workers.dev 서브도메인 `by-nas`)
- 저장소: `main` 브랜치에서 직접 작업한다. 원격 `origin` = github.com/NasKim311/teams-notion-bot (아직 push하지 않았을 수 있음).

## 비밀값과 변수
| 이름 | 종류 | 로컬 | 운영 |
|---|---|---|---|
| FORM_PASSWORD | 비밀 | `.dev.vars` | `npx wrangler secret put FORM_PASSWORD` |
| NOTION_TOKEN | 비밀 | `.dev.vars` | `npx wrangler secret put NOTION_TOKEN` |
| NOTION_DATABASE_ID | 비밀 | `.dev.vars` | `npx wrangler secret put NOTION_DATABASE_ID` |
| REDMINE_ISSUE_URL | 일반 변수 | `wrangler.jsonc` vars | 배포 시 함께 올라감 |
| PROCESSED_MESSAGES | KV 바인딩 | `wrangler dev`가 로컬 KV로 흉내 (운영 데이터와 분리) | `wrangler.jsonc`의 `kv_namespaces` (id `fc836b4e…`), 배포 시 연결 |

- `.dev.vars`는 로컬에서만 쓰이고 배포되지 않는다. 운영 시크릿이 비어 있으면 모든 요청이 "비밀번호가 올바르지 않습니다"(401)로 실패한다 (실제로 있었던 장애).
- 확인: `npx wrangler secret list` (값은 나오지 않고 이름만 나온다).
- 비밀값은 대화·코드·로그에 절대 쓰지 않는다. 사용자가 직접 입력하게 안내한다.

## 배포
- **배포는 사용자가 지시할 때만 한다.** 절차는 `deploy` 스킬(`/deploy`)을 따른다.
- **`npm run deploy`로만 배포한다** (`npx wrangler deploy`를 직접 쓰지 않는다). `scripts/deploy.ts`가 순서대로 한다:
  1. `main`이고 커밋 안 된 변경이 없는지 확인 (배포한 코드 = 커밋이어야 기록이 맞다)
  2. typecheck · lint · test · notion:schema
  3. `wrangler deploy --tag deploy-날짜.순번 --message "<커밋> <제목>"`
  4. 배포한 커밋에 같은 이름의 git 태그, [deployments.md](deployments.md)에 기록 추가 후 `chore: 배포 기록 …` 커밋
- 배포 뒤에는 운영 페이지·401·시크릿을 확인한다 (`deploy` 스킬).
- 원격 저장소에 올릴 때는 태그도 함께: `git push origin main --follow-tags`.
- 코드가 Notion 컬럼 변경을 따라가야 하는 경우(notion-sync 이후), 배포 전까지 운영 등록이 실패할 수 있다. 사용자에게 알린다.

## 배포 버전과 되돌리기
- 배포 목록: [deployments.md](deployments.md) (git 태그 `deploy-*`, Cloudflare 버전 태그·메시지와 이름이 같다).
- Cloudflare 쪽 확인: `npx wrangler deployments list`.
- 되돌리기: `npx wrangler rollback <이전 Version ID>`. 코드는 그대로라 자동 기록되지 않으니 deployments.md에 직접 한 줄 남긴다.

## 로그
- `npx wrangler tail`. 오류 로그에는 Notion `status`/`code`만 남고, 붙여넣은 내용과 토큰은 남지 않는다.

## 로컬 개발
- `npm run dev` → http://localhost:8787. 비밀번호는 `.dev.vars`의 FORM_PASSWORD를 쓴다.
- 로컬도 실제 Notion DB에 쓴다. 테스트로 만든 페이지는 지워달라고 사용자에게 알린다 (페이지 삭제는 사용자가 직접 한다).
