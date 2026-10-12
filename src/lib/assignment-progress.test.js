import { describe, expect, test, mock } from "bun:test";

mock.module("@/lib/supabase-external", () => ({ supabase: {} }));
const { assignmentProgress } = await import("./internal-assignments");

describe("assignment progress grouping (Tugas untuk Saya)", () => {
  test("a task with no submission is still 'belum dikerjakan'", () => {
    expect(assignmentProgress({ is_cancelled: false }, undefined)).toBe("pending");
  });
  test("a submitted task awaiting review is not finished yet", () => {
    expect(assignmentProgress({ is_cancelled: false }, { review_status: "Dikumpulkan" })).toBe(
      "pending",
    );
    expect(assignmentProgress({ is_cancelled: false }, { review_status: "Direview" })).toBe(
      "pending",
    );
  });
  test("an approved submission counts as 'sudah selesai'", () => {
    expect(assignmentProgress({ is_cancelled: false }, { review_status: "Selesai" })).toBe("done");
  });
  test("cancellations are neither pending nor done", () => {
    expect(assignmentProgress({ is_cancelled: true }, { review_status: "Selesai" })).toBe(
      "cancelled",
    );
    expect(
      assignmentProgress({ is_cancelled: false }, { review_status: "Dibatalkan_Anggota" }),
    ).toBe("cancelled");
  });
});
