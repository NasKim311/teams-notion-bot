import { describe, expect, it } from "vitest";
import {
  changeLines,
  deployEntry,
  ENTRY_MARKER,
  insertEntry,
  koreanTime,
  nextTag,
  readVersionId,
  versionMessage,
} from "../../scripts/lib/deploy-log";

// 2026-10-08 17:34 (한국 시간)
const NOW = new Date("2026-10-08T08:34:03Z");

describe("koreanTime", () => {
  it("한국 시간으로, 자정을 넘기면 다음 날", () => {
    expect(koreanTime(NOW)).toBe("2026-10-08 17:34");
    expect(koreanTime(new Date("2026-10-08T15:30:00Z"))).toBe("2026-10-09 00:30");
  });
});

describe("nextTag", () => {
  it("그날 첫 배포는 .1, 이미 있으면 가장 큰 번호 다음", () => {
    expect(nextTag([], NOW)).toBe("deploy-2026-10-08.1");
    expect(nextTag(["deploy-2026-10-07.4", "deploy-2026-10-08.1", "deploy-2026-10-08.3"], NOW)).toBe(
      "deploy-2026-10-08.4",
    );
  });

  it("형식이 다른 태그는 무시한다", () => {
    expect(nextTag(["v1.0.0", "deploy-2026-10-08.x"], NOW)).toBe("deploy-2026-10-08.1");
  });
});

describe("changeLines", () => {
  it("feat/fix만 남기고 번호를 살린다", () => {
    expect(
      changeLines([
        "feat: 이미 처리한 Teams 메시지는 다음 붙여넣기에서 빼기",
        "docs: backlog에 B4 추가",
        "fix(B3): 중복 등록되지 않게",
        "chore: 배포 기록 deploy-2026-10-08.2",
        "refactor: 구조 정리",
      ]),
    ).toEqual(["기능: 이미 처리한 Teams 메시지는 다음 붙여넣기에서 빼기", "버그 B3: 중복 등록되지 않게"]);
  });
});

describe("versionMessage", () => {
  it("커밋 번호 + 제목, 100자를 넘으면 자른다", () => {
    expect(versionMessage("0954622", "feat: 빼기")).toBe("0954622 feat: 빼기");
    expect(Array.from(versionMessage("0954622", "가".repeat(200)))).toHaveLength(100);
  });
});

describe("readVersionId", () => {
  it("배포 출력에서 Version ID를 찾는다", () => {
    const output = "Deployed teams-notion-bot triggers\nCurrent Version ID: 8e86b5a9-aa11-48a7-9fe0-a8de47c1a0ea\n";
    expect(readVersionId(output)).toBe("8e86b5a9-aa11-48a7-9fe0-a8de47c1a0ea");
    expect(readVersionId("오류")).toBeNull();
  });
});

describe("insertEntry", () => {
  const entry = deployEntry({
    tag: "deploy-2026-10-08.3",
    time: "2026-10-08 17:34",
    versionId: "8e86b5a9-aa11-48a7-9fe0-a8de47c1a0ea",
    commit: "0954622",
    changes: ["기능: 처리한 메시지 빼기"],
  });

  it("표시 줄 바로 아래(기존 기록 위)에 넣는다", () => {
    const doc = `# 배포 기록\n\n${ENTRY_MARKER}\n\n## deploy-2026-10-08.2 (2026-10-08 14:15)\n- 이전\n`;
    expect(insertEntry(doc, entry)).toBe(
      `# 배포 기록\n\n${ENTRY_MARKER}\n\n## deploy-2026-10-08.3 (2026-10-08 17:34)\n` +
        "- Version ID: `8e86b5a9-aa11-48a7-9fe0-a8de47c1a0ea` · 커밋: `0954622`\n- 기능: 처리한 메시지 빼기\n" +
        "\n## deploy-2026-10-08.2 (2026-10-08 14:15)\n- 이전\n",
    );
  });

  it("첫 기록이면 문서 끝에 붙고, 표시 줄이 없으면 null", () => {
    expect(insertEntry(`# 배포 기록\n\n${ENTRY_MARKER}\n`, entry)).toBe(`# 배포 기록\n\n${ENTRY_MARKER}\n\n${entry}`);
    expect(insertEntry("# 배포 기록\n", entry)).toBeNull();
  });

  it("바뀐 것이 없으면 그렇다고 적는다", () => {
    const empty = deployEntry({ tag: "t", time: "x", versionId: "v", commit: "c", changes: [] });
    expect(empty).toContain("사용자에게 보이는 변경 없음");
  });
});
