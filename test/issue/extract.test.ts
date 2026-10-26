import { describe, expect, it } from "vitest";
import {
  extractAreas,
  extractDevInfo,
  extractFiles,
  extractPlatform,
  extractWorkItem,
  normalizeWorkItemUrl,
  workItemNumber,
} from "../../src/issue/extract";

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

  it.each([
    ["https://redmine.example.com/issues/11661#note-3"],
    ["https://redmine.example.com/issues/11661?tab=history"],
    ["http://redmine.example.com/issues/11661/"],
  ])("같은 레드마인 호스트의 링크는 표준 주소로 통일 (I11): %s", (link) => {
    expect(extractWorkItem(`일감 ${link} 확인`, REDMINE)).toBe(`${REDMINE}11661`);
  });

  it("다른 호스트의 레드마인 링크는 그대로 둔다", () => {
    expect(extractWorkItem("https://redmine.other.com/issues/5", REDMINE)).toBe("https://redmine.other.com/issues/5");
  });

  it("기본 주소가 없으면 번호만으로는 만들지 않음", () => {
    expect(extractWorkItem("#11661", undefined)).toBeNull();
  });

  it("URL 안의 #은 일감 번호로 보지 않음", () => {
    expect(extractWorkItem("https://example.com/page#1234", REDMINE)).toBeNull();
  });

  describe("회귀 B1: CSS 색상 코드는 일감 번호가 아님", () => {
    it.each([
      ["CSS 속성 값", "color: #333333;"],
      ["세미콜론 없는 속성 값", "background: #000"],
      ["코드 줄 안", "border: 1px solid #1234;"],
      ["함수 인자", "box-shadow: 0 0 0 1px #999999, inset 0 0 #111111"],
      ["# 뒤 3자리 (색상 약식)", "버튼 색 #999 확인 부탁"],
    ])("%s: %s", (_label, text) => {
      expect(extractWorkItem(text, REDMINE)).toBeNull();
    });

    it("색상 코드와 일감 번호가 함께 있으면 일감 번호를 고른다", () => {
      expect(extractWorkItem("color: #333333; 은 #11661 에서 바꿀게요", REDMINE)).toBe(`${REDMINE}11661`);
    });

    it("본문 문장 속 #4~6자리와 '일감 3자리'는 그대로 인식", () => {
      expect(extractWorkItem("#11661 작업 중", REDMINE)).toBe(`${REDMINE}11661`);
      expect(extractWorkItem("일감 #879 확인", REDMINE)).toBe(`${REDMINE}879`);
    });
  });
});

describe("normalizeWorkItemUrl / workItemNumber", () => {
  it.each([
    ["https://redmine.example.com/issues/11661#note-3", `${REDMINE}11661`],
    ["http://redmine.example.com/issues/11661", `${REDMINE}11661`],
    ["https://redmine.other.com/issues/5", "https://redmine.other.com/issues/5"],
    ["http://redmine.example.com/projects/a", "http://redmine.example.com/projects/a"],
  ])("%s → %s", (url, expected) => {
    expect(normalizeWorkItemUrl(url, REDMINE)).toBe(expected);
  });

  it("빈 값과 기본 주소 없음은 그대로", () => {
    expect(normalizeWorkItemUrl(null, REDMINE)).toBeNull();
    expect(normalizeWorkItemUrl("https://redmine.example.com/issues/1#a", undefined)).toBe(
      "https://redmine.example.com/issues/1#a",
    );
  });

  it.each([
    ["http://r/issues/11661", "11661"],
    ["https://r/issues/11661#note-3", "11661"],
    ["http://r/projects/a", null],
  ])("workItemNumber(%s) → %s", (url, expected) => {
    expect(workItemNumber(url)).toBe(expected);
  });
});

describe("extractFiles", () => {
  it("'경로:줄' / '경로:시작-끝' 형식의 줄 번호", () => {
    expect(extractFiles("📂 관련 파일 : src/views/fit/FitPage.tsx:75\nsrc/a/List.tsx:103-119")).toEqual([
      "src/views/fit/FitPage.tsx:75",
      "src/a/List.tsx:103-119",
    ]);
  });

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

  it("'(예: …)' 안의 경로는 예시라서 잡지 않는다 (B5)", () => {
    expect(extractFiles("관련 파일 : 경로:줄 번호 (예: src/views/fit/FitPage.tsx:75)\nsrc/a/B.tsx:3")).toEqual([
      "src/a/B.tsx:3",
    ]);
    expect(extractFiles("관련 파일 : (예시: a/B.tsx)")).toEqual([]);
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
      areas: ["srch"],
      platform: null,
    });
  });

  it("아무것도 없으면 빈 값", () => {
    expect(extractDevInfo("점심 메뉴", REDMINE)).toEqual({
      workItemUrl: null,
      mrUrl: null,
      branch: "",
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
