---
name: deploy
description: 운영(Cloudflare Workers)에 배포하고 검증한다. 사용자가 명시적으로 배포를 지시할 때만 사용.
disable-model-invocation: true
---

# 운영 배포

배포는 **사용자가 지시할 때만** 한다. 배경과 시크릿 설명: [docs/operations.md](../../../docs/operations.md)

## 1. 배포 전 확인
```
git status --short          # 커밋 안 된 변경이 있으면 사용자에게 알리고 어떻게 할지 묻는다
npm run typecheck && npm run lint && npm test
npm run notion:schema       # 코드와 DB 컬럼이 맞는지 ("코드와 DB가 맞습니다.")
```
- 하나라도 실패하면 배포하지 않고 결과를 그대로 보고한다.

## 2. 배포
```
npx wrangler deploy
```
- 출력의 Version ID를 기록한다.

## 3. 배포 후 검증
- 시크릿: `npx wrangler secret list`에 FORM_PASSWORD, NOTION_TOKEN, NOTION_DATABASE_ID 3개가 있어야 한다.
  - 없으면 사용자에게 `npx wrangler secret put <이름>`을 직접 실행하도록 안내한다. 값은 대화로 받지 않는다.
- 바인딩: 배포 출력의 바인딩 목록에 `env.PROCESSED_MESSAGES`(KV)와 `env.REDMINE_ISSUE_URL`이 있어야 한다.
- 페이지: `curl -s https://teams-notion-bot.by-nas.workers.dev/`가 200이고, 이번에 바뀐 화면 요소가 들어 있는지 본다.
- 인증: 비밀번호 없이 `POST /api/preview`, `POST /api/uploads`를 보내면 401이어야 한다.
- 실제 이슈 등록은 하지 않는다 (운영 DB에 테스트 데이터가 생김). 대신 사용자에게 Ctrl+F5 후 직접 등록해 보라고 안내한다.

## 4. 보고
- 배포 버전, 검증 결과(통과/실패를 그대로), 사용자가 확인할 것을 짧게 알린다.
- 검증하지 않은 항목은 검증했다고 말하지 않는다.
