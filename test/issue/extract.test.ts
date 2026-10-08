import { describe, expect, it } from "vitest";
import { extractAreas, extractDevInfo, extractFiles, extractPlatform, extractWorkItem } from "../../src/issue/extract";

const REDMINE = "http://redmine.example.com/issues/";

describe("extractWorkItem", () => {
  it("본문의 Redmine URL을 그대로 사용", () => {
    expect(extractWorkItem("일감 http://redmine.example.com/issues/12351 생성", REDMINE)).toBe(
      "http://redmine.example.com/issues/12351",
    );
  });

  it.each([
    ["브랜치명의 #번호", "작업 브랜치명 : feature/uzen-event-#11661", "11661"],
    ["일감번호 N", "일감번호 8795 번을 처리하다가", "8795"],
    ["일감 : #N", "일감: #1234", "1234"],
  ])("%s → 기본 주소 + 번호", (_label, text, number) => {
    expect(extractWorkItem(text, REDMINE)).toBe(`${REDMINE}${number}`);
  });

  it("기본 주소가 없으면 번호만으로는 만들지 않음", () => {
    expect(extractWorkItem("#11661", undefined)).toBeNull();
  });

  it("URL 안의 #은 일감 번호로 보지 않음", () => {
    expect(extractWorkItem("https://example.com/page#1234", REDMINE)).toBeNull();
  });
});

describe("extractFiles", () => {
  it("경로 뒤 줄 번호(같은 줄 / 다음 줄 / 범위)", () => {
    expect(
      extractFiles(
        [
          "이슈 사항 : src/views/fit/pages/FitDetail.tsx 75번째 줄",
          "src/hooks/useBackHistory.ts",
          "103~119 줄",
          "src/views/brd/Map.tsx 의 PinchZoom",
          "VipPaymentReceipt.tsx",
        ].join("\n"),
      ),
    ).toEqual([
      "src/views/fit/pages/FitDetail.tsx:75",
      "src/hooks/useBackHistory.ts:103-119",
      "src/views/brd/Map.tsx",
      "VipPaymentReceipt.tsx",
    ]);
  });

  it("중복 제거, URL 속 파일명 무시", () => {
    expect(extractFiles("a/B.tsx 와 a/B.tsx\nhttps://cdn.example.com/x/app.js")).toEqual(["a/B.tsx"]);
  });
});

describe("extractAreas", () => {
  it("views/<모듈> 경로와 /<모듈>/... 페이지 표현에서 영역 추출", () => {
    const text = "/fit/fits 페이지 중단부 정렬";
    expect(
      extractAreas(text, ["src/views/fit/pages/A.tsx", "view/evt/components/B.tsx", "/view/frgnr/home.tsx"]),
    ).toEqual(["fit", "evt", "frgnr"]);
  });

  it("'fit/fitBrandSearch'처럼 모듈 이름으로 시작하는 페이지 경로", () => {
    expect(extractAreas("fit/fitBrandSearch 의 검색창", [])).toEqual(["fit"]);
    expect(extractAreas("and/orSomething 은 아님", [])).toEqual([]);
  });

  it("모듈 경로가 없으면 빈 배열", () => {
    expect(extractAreas("일반 문장", ["src/hooks/useBack.ts"])).toEqual([]);
  });
});

describe("extractDevInfo", () => {
  it("일감/MR/브랜치/파일/영역을 한 번에", () => {
    const text = [
      "브랜치명: feature/uzen-search-#11660",
      "Merge Request: http://gitlab.example.com/app/FE/-/merge_requests/12101 (dev 미머지)",
      "이슈 원인: src/views/srch/pages/Result.tsx 의 스크롤 보정",
      "branch : feature/multilingual_fe_ref_path.",
    ].join("\n");
    expect(extractDevInfo(text, REDMINE)).toEqual({
      workItemUrl: `${REDMINE}11660`,
      mrUrl: "http://gitlab.example.com/app/FE/-/merge_requests/12101",
      branch: "feature/uzen-search-#11660, feature/multilingual_fe_ref_path",
      files: "src/views/srch/pages/Result.tsx",
      areas: ["srch"],
      platform: null,
    });
  });

  it("아무것도 없으면 빈 값", () => {
    expect(extractDevInfo("점심 메뉴", REDMINE)).toEqual({
      workItemUrl: null,
      mrUrl: null,
      branch: "",
      files: "",
      areas: [],
      platform: null,
    });
  });
});

describe("extractPlatform", () => {
  it.each([
    ["BO 쿠폰 화면 아이콘 없음", "BO"],
    ["[FO] 상품 상세 깨짐", "FO"],
    ["FO에서는 정상인데 BO에서 오류", "FO"], // 처음 나온 것
    ["백오피스 주문 목록", "BO"],
    ["프론트 오피스 메인", "FO"],
  ])("%s → %s", (text, expected) => {
    expect(extractPlatform(text)).toBe(expected);
  });

  it.each([
    ["일감 http://redmine.com.bo.shinsegae.com/issues/1 확인"], // URL 안의 bo
    ["BOOK, FOO, ABO 같은 단어"],
    ["프론트 작업"],
  ])("없음: %s", (text) => {
    expect(extractPlatform(text)).toBeNull();
  });
});
