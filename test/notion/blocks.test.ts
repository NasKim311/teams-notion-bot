import { describe, expect, it } from "vitest";
import { chunkText, imageBlocks, richText, toBlocks } from "../../src/notion/blocks";

describe("chunkText", () => {
  it("2000자 단위로 나눈다 (4500자 → 3개)", () => {
    expect(chunkText("a".repeat(4500)).map((c) => c.length)).toEqual([2000, 2000, 500]);
  });

  it("빈 문자열이면 빈 배열", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("서로게이트 쌍을 쪼개지 않는다", () => {
    const chunks = chunkText(`a${"🐛".repeat(1000)}`); // UTF-16 길이 2001
    expect(chunks).toEqual([`a${"🐛".repeat(999)}`, "🐛"]);
  });
});

describe("richText", () => {
  it("URL은 링크로, 끝 문장부호는 링크에서 제외", () => {
    expect(richText("일감 http://redmine.example.com/issues/1. 확인")).toEqual([
      { type: "text", text: { content: "일감 " } },
      {
        type: "text",
        text: { content: "http://redmine.example.com/issues/1", link: { url: "http://redmine.example.com/issues/1" } },
      },
      { type: "text", text: { content: ". 확인" } },
    ]);
  });

  it("주석(annotations)을 모든 조각에 적용", () => {
    expect(richText("a", { bold: true })).toEqual([
      { type: "text", text: { content: "a" }, annotations: { bold: true } },
    ]);
  });
});

describe("toBlocks", () => {
  const types = (body: string) => toBlocks(body).map((b) => b.type);

  it("섹션 라벨은 소제목, 같은 줄 나머지는 문단", () => {
    const blocks = toBlocks("이슈 사항 : 정렬 초기화\n상세 설명\n\n기대 동작 : 유지");
    expect(blocks.map((b) => b.type)).toEqual(["heading_3", "paragraph", "heading_3", "paragraph"]);
    expect(blocks[0]).toMatchObject({ heading_3: { rich_text: [{ text: { content: "이슈 사항" } }] } });
    expect(blocks[1]).toMatchObject({ paragraph: { rich_text: [{ text: { content: "정렬 초기화\n상세 설명" } }] } });
  });

  it("연속된 코드 줄은 하나의 코드 블록", () => {
    const blocks = toBlocks("=>\nif (ok) {\n  run();\n}\n로 수정");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "code", "paragraph"]);
    expect(blocks[1]).toMatchObject({
      code: { language: "typescript", rich_text: [{ text: { content: "if (ok) {\n  run();\n}" } }] },
    });
  });

  it("머리글 줄은 회색 굵은 문단", () => {
    expect(toBlocks("— 홍길동 · 오후 1:00")[0]).toMatchObject({
      paragraph: {
        rich_text: [{ text: { content: "홍길동 · 오후 1:00" }, annotations: { bold: true, color: "gray" } }],
      },
    });
  });

  it("빈 줄로 문단을 나누고, 빈 본문은 블록 없음", () => {
    expect(types("a\nb\n\nc")).toEqual(["paragraph", "paragraph"]);
    expect(toBlocks("")).toEqual([]);
  });

  it("2000자 넘는 문단은 여러 블록으로", () => {
    expect(types("가".repeat(4500))).toEqual(["paragraph", "paragraph", "paragraph"]);
  });
});

describe("imageBlocks", () => {
  it("file_upload id → 이미지 블록", async () => {
    expect(imageBlocks(["id-1"])).toEqual([
      { object: "block", type: "image", image: { type: "file_upload", file_upload: { id: "id-1" } } },
    ]);
  });
});
