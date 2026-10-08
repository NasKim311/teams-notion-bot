---
name: deploy
description: 운영(Cloudflare Workers)에 배포하고 검증한다. 사용자가 명시적으로 배포를 지시할 때만 사용.
disable-model-invocation: true
---

# 운영 배포

배포는 **사용자가 지시할 때만** 한다. 배경과 시크릿 설명: [docs/operations.md](../../../docs/operations.md)

## 1. 배포 전 확인
- `git status --short`: 커밋 안 된 변경이 있으면 사용자에게 알리고 어떻게 할지 묻는다 (스크립트도 이 경우 멈춘다).

## 2. 배포
```
npm run deploy
```
- `npx wrangler deploy`를 직접 쓰지 않는다. 그러면 버전 기록이 남지 않는다.
- `scripts/deploy.ts`가 typecheck·lint·test·notion:schema를 돌리고, 하나라도 실패하면 배포하지 않는다. 실패하면 결과를 그대로 보고한다.
- 성공하면 다음이 자동으로 된다:
  - Cloudflare 버전에 태그 `deploy-날짜.순번`과 메시지(`<커밋> <제목>`)를 붙인다.
  - 같은 이름의 git 태그를 만든다.
  - [docs/deployments.md](../../../docs/deployments.md)에 기록을 추가하고 `chore: 배포 기록 …`으로 커밋한다.
- 출력 끝의 "✓ 배포 완료" 줄에서 태그와 Version ID를 확인한다.

## 3. 배포 후 검증
- 시크릿: `npx wrangler secret list`에 FORM_PASSWORD, NOTION_TOKEN, NOTION_DATABASE_ID 3개가 있어야 한다.
  - 없으면 사용자에게 `npx wrangler secret put <이름>`을 직접 실행하도록 안내한다. 값은 대화로 받지 않는다.
- 바인딩: 배포 출력의 바인딩 목록에 `env.PROCESSED_MESSAGES`(KV)와 `env.REDMINE_ISSUE_URL`이 있어야 한다.
- 페이지: `curl -s https://teams-notion-bot.by-nas.workers.dev/`가 200이고, 이번에 바뀐 화면 요소가 들어 있는지 본다.
- 인증: 비밀번호 없이 `POST /api/preview`, `POST /api/uploads`를 보내면 401이어야 한다.
- 실제 이슈 등록은 하지 않는다 (운영 DB에 테스트 데이터가 생김). 대신 사용자에게 Ctrl+F5 후 직접 등록해 보라고 안내한다.

- 기록: `git tag --list "deploy-*"`의 마지막 태그와 deployments.md 맨 위 항목이 이번 배포인지 본다.

## 4. 보고
- 배포 태그·Version ID, 검증 결과(통과/실패를 그대로), 사용자가 확인할 것을 짧게 알린다.
- 검증하지 않은 항목은 검증했다고 말하지 않는다.
