import { describe, expect, it } from "vitest";
import { structureWithFilesColumn } from "../../scripts/lib/files-column";
import { structureBody } from "../../src/issue/structure";

describe("structureWithFilesColumn", () => {
  it("컬럼의 파일을 한 줄에 하나씩 관련 파일 섹션에 넣는다", () => {
    const result = structureWithFilesColumn("[ 🐞 현상 ]\n\n깨짐", "src/a/B.tsx:75, src/a/C.tsx");
    expect(result).toBe(structureBody("현상 : 깨짐\n관련 파일 :\nsrc/a/B.tsx:75\nsrc/a/C.tsx"));
    expect(result).toContain("[ 📂 관련 파일 ]\nsrc/a/B.tsx:75\nsrc/a/C.tsx\n\n[ 📎 참고");
  });

  it("컬럼이 비어 있으면 본문만 정리한다", () => {
    expect(structureWithFilesColumn("현상 : 깨짐", "")).toBe(structureBody("현상 : 깨짐"));
    expect(structureWithFilesColumn("현상 : 깨짐", " , ")).toBe(structureBody("현상 : 깨짐"));
  });

  it("관련 파일 섹션에 이미 있는 파일은 다시 넣지 않는다 (다시 돌려도 같음)", () => {
    const once = structureWithFilesColumn("현상 : 깨짐", "src/a/B.tsx:75");
    expect(structureWithFilesColumn(once, "src/a/B.tsx:75")).toBe(once);
    // 새로 생긴 파일만 기존 내용 뒤에 붙는다 (빈 줄로 나뉘어 문단이 따로 생김)
    expect(structureWithFilesColumn(once, "src/a/B.tsx:75, src/a/C.tsx")).toMatch(
      /\[ 📂 관련 파일 \]\nsrc\/a\/B\.tsx:75\n+src\/a\/C\.tsx\n\n\[ 📎 참고/,
    );
  });

  it("같은 파일의 전체 경로가 있으면 파일 이름만 있는 값은 뺀다", () => {
    const result = structureWithFilesColumn("현상 : 깨짐", "src/views/fit/FitList.tsx, FitList.tsx, Other.tsx");
    expect(result).toContain("[ 📂 관련 파일 ]\nsrc/views/fit/FitList.tsx\nOther.tsx\n\n");
  });

  it("다른 섹션에만 나온 파일은 관련 파일 섹션에도 넣는다", () => {
    const result = structureWithFilesColumn("현상 : src/a/B.tsx 75번째 줄 오류", "src/a/B.tsx:75");
    expect(result).toContain("[ 📂 관련 파일 ]\nsrc/a/B.tsx:75");
  });
});
