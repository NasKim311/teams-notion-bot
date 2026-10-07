import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { computeSignature, verifyTeamsHmac } from "../src/verify";

const secret = env.TEAMS_HMAC_SECRET;
const body = JSON.stringify({ type: "message", text: "<at>Bot</at> [버그] 로그인 안됨" });

describe("verifyTeamsHmac", () => {
  it("올바른 서명이면 true", async () => {
    const sig = await computeSignature(body, secret);
    expect(await verifyTeamsHmac(body, `HMAC ${sig}`, secret)).toBe(true);
  });

  it("body가 변조되면 false", async () => {
    const sig = await computeSignature(body, secret);
    const tampered = body.replace("버그", "개선");
    expect(await verifyTeamsHmac(tampered, `HMAC ${sig}`, secret)).toBe(false);
  });

  it("다른 키로 서명하면 false", async () => {
    const otherSecret = btoa("another-secret-key-for-testing!!");
    const sig = await computeSignature(body, otherSecret);
    expect(await verifyTeamsHmac(body, `HMAC ${sig}`, secret)).toBe(false);
  });

  it.each([
    ["헤더 없음", null],
    ["빈 문자열", ""],
    ["다른 스킴", "Bearer abc"],
    ["서명 없음", "HMAC "],
    ["HMAC만", "HMAC"],
    ["base64 아님", "HMAC not-base64!!"],
    ["잘린 서명", "HMAC AAAA"],
  ])("잘못된 헤더(%s)면 false", async (_label, header) => {
    expect(await verifyTeamsHmac(body, header, secret)).toBe(false);
  });

  it("서명 앞뒤 공백·소문자 스킴은 거부", async () => {
    const sig = await computeSignature(body, secret);
    expect(await verifyTeamsHmac(body, `hmac ${sig}`, secret)).toBe(false);
    expect(await verifyTeamsHmac(body, `HMAC  ${sig}`, secret)).toBe(false);
  });
});

describe("computeSignature", () => {
  it("알려진 벡터와 일치 (RFC 4231 Test Case 2)", async () => {
    // key = "Jefe", data = "what do ya want for nothing?"
    const sig = await computeSignature("what do ya want for nothing?", btoa("Jefe"));
    const hex = Array.from(atob(sig), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    expect(hex).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });
});
