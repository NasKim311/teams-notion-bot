import { describe, expect, it } from "vitest";
import { FORM_PLACEHOLDERS } from "../../src/issue/form";
import { parsePastedText } from "../../src/issue/parse";
import client from "../../src/page/client.js";
import { renderPage, TEMPLATE, THEME_KEY } from "../../src/page/page";

/** 팀에 공지한 <이슈 공유 양식> (2026-10-13) */
const NOTICE = [
  "🐞 현상 : 어떤 화면에서 어떤 문제가 생기는지 (재현 방법 포함)",
  "🌐 테스트 URL : 문제가 생기는 화면 주소",
  "🔍 원인 :",
  "🛠 처리·해결 :",
  "🎯 기대 동작 : 원래 어떻게 동작해야 하는지",
  "📂 관련 파일 : 컴포넌트 경로:줄 번호 (예: src/views/fit/FitPage.tsx:75)",
  "📎 참고 : 이미지 등 참고할 만한 자료",
];

describe("TEMPLATE", () => {
  it("작성자 줄 아래는 팀 공지 양식과 같다", () => {
    expect(TEMPLATE.split("\n")).toEqual(["작성자: 홍길동", ...NOTICE]);
  });

  it("공지 양식의 예시 문구는 모두 등록할 때 빠지는 문구다", () => {
    for (const text of FORM_PLACEHOLDERS) expect(TEMPLATE).toContain(text);
  });

  it("양식을 그대로 등록해도 예시 값이 컬럼에 들어가지 않는다", () => {
    const issue = parsePastedText(TEMPLATE);
    expect(issue.files).toBe("");
    expect(issue.areas).toEqual([]);
    expect(issue.author).toBe("홍길동");
  });
});

describe("renderPage", () => {
  const html = renderPage("test-nonce");

  // 화면 코드(client.js)는 자동 테스트가 없어서, 찾는 요소가 HTML에 있는지만이라도 확인한다
  it("client.js가 찾는 id는 모두 HTML에 있다", () => {
    const ids = [...new Set([...client.matchAll(/\$\("(\w+)"\)/g)].map((m) => m[1]))];
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(html, id).toContain(`id="${id}"`);
  });

  it("client.js가 찾는 data-role·data-field는 모두 카드 템플릿에 있다", () => {
    const roles = [...new Set([...client.matchAll(/data-role="(\w+)"/g)].map((m) => m[1]))];
    for (const role of roles) expect(html, role).toContain(`data-role="${role}"`);
    const fields = client.match(/const fields = \[([^\]]+)\]/)?.[1]?.match(/\w+/g) ?? [];
    expect(fields.length).toBeGreaterThan(5);
    for (const name of fields) expect(html, name).toContain(`data-field="${name}"`);
  });
});

describe("화면 테마", () => {
  const html = renderPage("test-nonce");

  it("시스템/라이트/다크 3단 선택이 있다", () => {
    for (const choice of ["system", "light", "dark"]) expect(html).toContain(`data-theme-choice="${choice}"`);
  });

  it("미리 적용하는 스크립트와 client.js가 같은 저장 키를 쓴다", () => {
    expect(html).toContain(`localStorage.getItem("${THEME_KEY}")`);
    expect(client).toContain(`const THEME_KEY = "${THEME_KEY}"`);
  });

  it("고른 테마가 운영체제 설정보다 우선한다 (다크 고정, 시스템 다크여도 라이트 고정)", () => {
    expect(html).toContain(':root[data-theme="dark"]');
    expect(html).toContain(':root:not([data-theme="light"])');
  });
});
