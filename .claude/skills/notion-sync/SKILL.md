---
name: notion-sync
description: Notion 이슈 DB의 컬럼(이름·타입·추가·삭제)이 바뀌었을 때 코드를 맞춘다. 사용자가 "DB 수정했어", "싱크 맞춰줘", "컬럼 바꿨어", Notion 등록이 validation_error로 실패할 때 사용.
---

# Notion DB 싱크

사용자는 Notion에서 DB 컬럼을 직접 고친다. 코드(`src/notion/properties.ts`의 `PROP`/`PROP_TYPES`)를 실제 DB에 맞춘다.
배경: [docs/notion.md](../../../docs/notion.md), [docs/decisions.md](../../../docs/decisions.md)

## 1. 실제 스키마 확인 (읽기 전용)
```
npm run notion:schema
```
- 저장소 루트에서 실행한다. `.dev.vars`가 없으면 사용자에게 만들어 달라고 한다 (토큰을 대화에 붙여넣게 하지 않는다).
- 출력의 "코드와 비교"에서 ✗ 항목과 "코드가 쓰지 않는 컬럼"을 본다.

## 2. 변경 내용을 표로 정리해 사용자에게 보여준다
- **이름 변경**: 같은 타입의 새 이름이 있으면 이름 변경으로 본다 (예: 일감 → 레드마인 링크).
- **삭제**: 코드가 쓰던 컬럼이 없음.
- **타입 변경**: 예: 작성자 rich_text → select.
- **새 컬럼**: 봇이 채울지, 사람이 관리할지.
- 상태(status) 그룹 구성이 바뀌었는지도 본다. 추천 상태(진행 중/완료)에 영향이 있다.

## 3. 판단이 필요한 것만 질문한다
- 이름 변경과 타입 변경은 묻지 않고 맞춘다.
- 다음은 사용자에게 묻는다 (AskUserQuestion, 추천안을 첫 번째로):
  - 삭제된 컬럼의 데이터를 어떻게 할지 (본문으로 옮김 / 완전히 제거)
  - 새 컬럼을 봇이 채울지, 사람이 관리할지. 채운다면 어떤 규칙으로 할지
- 결정한 내용은 `docs/decisions.md`에 날짜와 함께 남긴다.

## 4. 코드 수정
- `src/notion/properties.ts`: `PROP`, `PROP_TYPES`, `buildProperties`, `buildUpdateProperties`(업데이트 시 병합 규칙)
- `src/notion/pages.ts`: `findExistingPages`(조회 필터), `getStatusOptions`(상태 그룹)
- 새 필드가 생기면: `src/types.ts`(Issue), `src/issue/validate.ts`(검증), `src/issue/extract.ts`·`src/issue/parse.ts`(추출), `src/page/page.ts`(카드 입력칸)·`src/page/client.js`(`fields` 배열)
- 타입별 값 형식:
  - select는 `{ select: { name } | null }` (쉼표 불가)
  - url은 `{ url: string | null }`
  - rich_text는 `plainText()` 사용
- `test/notion/*.test.ts`, `test/index.test.ts`, `test/issue/validate.test.ts`, `test/issue/parse.test.ts`의 기대값을 함께 고친다.

## 5. 확인과 커밋
```
npm run format
npm run typecheck && npm run lint && npm test
npm run notion:schema   # "코드와 DB가 맞습니다."가 나와야 함
```
- `CLAUDE.md`의 Notion 컬럼 줄과 `docs/notion.md`의 컬럼 표를 고친다.
- 커밋 메시지: `feat: Notion DB 컬럼 변경에 맞춰 싱크` + 바뀐 점 목록.

## 6. 사용자에게 알릴 것
- 운영에 배포되기 전까지 운영 등록이 실패할 수 있다 (코드가 옛 컬럼에 씀). 배포는 사용자가 지시할 때만 한다 (`/deploy`).
- 실제 DB에 페이지를 만들어 보는 E2E는 하지 않았다면, 했다고 말하지 않는다.
