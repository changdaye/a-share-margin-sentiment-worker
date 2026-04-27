import { describe, expect, it, vi } from "vitest";
import { runFinalSummary } from "../src/services/final-summary";
import type { AppConfig } from "../src/types";
import * as cos from "../src/services/cos";
import * as feishu from "../src/services/feishu";

function makeConfig(): AppConfig {
  return {
    feishuWebhook: "https://example.com/hook",
    feishuSecret: "secret",
    manualTriggerToken: "token",
    cosSecretId: "secret-id",
    cosSecretKey: "secret-key",
    cosBucket: "bucket",
    cosRegion: "ap-shanghai",
    cosBaseUrl: "https://bucket.cos.ap-shanghai.myqcloud.com",
    workerPublicBaseUrl: "https://example.workers.dev",
    llmBaseUrl: "",
    llmApiKey: "",
    runHourLocal: 17,
    runMinuteLocal: 0,
    marketTimezone: "Asia/Shanghai",
    heartbeatIntervalHours: 24,
    requestTimeoutMs: 15000,
    lookbackDays: 250,
    alertCooldownHours: 24,
    failureAlertThreshold: 1,
    failureAlertCooldownMinutes: 180,
    llmModel: "@cf/meta/llama-3.2-1b-instruct",
    finalSummaryHourLocal: 0,
    finalSummaryMinuteLocal: 30,
    finalSummaryLookbackHours: 24,
  };
}

describe("runFinalSummary", () => {
  it("reads archived messages, uploads final summary, and pushes only the link notice", async () => {
    vi.spyOn(cos, "listCosObjects").mockResolvedValue([
      { key: "a-share-margin-sentiment-worker/feishu-messages/20260427080055.txt" },
      { key: "a-share-margin-sentiment-worker/feishu-messages/20260427100055.txt" }
    ] as any);
    vi.spyOn(cos, "fetchCosObjectText")
      .mockResolvedValueOnce("【今日结论】\n第一条")
      .mockResolvedValueOnce("【今日结论】\n第二条");
    vi.spyOn(cos, "uploadFinalSummaryToCos").mockResolvedValue({
      key: "a-share-margin-sentiment-worker/final-summaries/20260428003000.txt",
      url: "https://bucket.cos.ap-shanghai.myqcloud.com/a-share-margin-sentiment-worker/final-summaries/20260428003000.txt"
    });
    const pushSpy = vi.spyOn(feishu, "pushToFeishu").mockResolvedValue();

    const result = await runFinalSummary({ AI: { run: vi.fn().mockResolvedValue({ response: "【凌晨总结】\n\n【核心脉络】\n两条消息偏谨慎。\n\n【主要风险】\n波动仍大。" }) } as any } as any, makeConfig(), new Date("2026-04-28T00:30:00.000Z"));

    expect(result?.includedCount).toBe(2);
    expect(result?.key).toContain("final-summaries/20260428003000.txt");
    expect(result?.content).toContain("【凌晨总结】");
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0]?.[1]).toContain("【凌晨总结已生成】");
    expect(pushSpy.mock.calls[0]?.[1]).toContain("详细版存档:");
  });
});
