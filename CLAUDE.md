# teams-notion-bot
Teams 채널에서 @멘션된 메시지를 Notion 이슈 DB에 등록하는 Cloudflare Worker.

## 스택
- Cloudflare Workers, TypeScript strict, Wrangler
- Notion은 SDK 없이 fetch로 직접 호출 (Notion-Version: 2022-06-28)
- 테스트: Vitest + @cloudflare/vitest-pool-workers
- 개발 환경: Windows / PowerShell

## 흐름
Teams Outgoing Webhook POST → HMAC 검증 → payload 파싱 → Notion 페이지 생성 → Teams에 결과 회신 (5초 이내)

## 규칙
- 비밀값은 env로만 접근: TEAMS_HMAC_SECRET, NOTION_TOKEN, NOTION_DATABASE_ID. 코드/로그 출력 금지
- HMAC 실패 → 401. 그 외 오류 → 200 + 사용자용 안내 메시지 (Teams에 에러 노출 X)
- 파싱/검증 로직은 순수 함수로 작성, index.ts는 조립만
- 커밋 전 `npm run typecheck && npm test` 통과 필수

## 명령어
- npm run dev / npm test / npm run typecheck / npx wrangler deploy / npx wrangler tail

## v1 범위 밖
- 스크린샷 업로드 (원문 링크로 대체), 중복 감지, AI 분류