import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadCompletedRequestExport,
  fetchRequestExportJob,
  startRequestExport,
} from "./request-export";

describe("request export asynchronous lifecycle client", () => {
  const originalFetch = globalThis.fetch;
  const originalURL = globalThis.URL;
  const originalDocument = globalThis.document;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: originalURL,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
      writable: true,
    });
  });

  it("returns a queued lifecycle handle instead of turning the 202 JSON body into an XLSX blob", async () => {
    const createObjectURL = vi.fn();
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL: vi.fn() },
      writable: true,
    });
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
            status: "queued",
            statusUrl:
              "/requests/export-jobs/2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 202,
          },
        ),
    ) as typeof fetch;

    await expect(
      startRequestExport({ status: "Submitted", from: "", to: "" }),
    ).resolves.toEqual({
      kind: "queued",
      job: {
        id: "2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
        status: "queued",
        statusUrl:
          "/requests/export-jobs/2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
      },
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("polls a completed job before downloading the completed XLSX", async () => {
    const createObjectURL = vi.fn(() => "blob:request-export");
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const anchor = {
      click,
      download: "",
      href: "",
      remove,
      style: { display: "" },
    };
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL },
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        body: { appendChild },
        createElement: vi.fn(() => anchor),
      },
      writable: true,
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
            status: "completed",
            queuedAt: "2026-08-20T00:00:00.000Z",
            startedAt: "2026-08-20T00:01:00.000Z",
            completedAt: "2026-08-20T00:02:00.000Z",
            failedAt: null,
            downloadUrl:
              "/requests/export-jobs/2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49/download",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["xlsx"]), {
          headers: {
            "Content-Disposition":
              'attachment; filename="psf_requests_20260820_070300.xlsx"',
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          status: 200,
        }),
      ) as typeof fetch;

    const job = await fetchRequestExportJob(
      "/requests/export-jobs/2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
    );
    await downloadCompletedRequestExport(job);

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/requests/export-jobs/2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
      { credentials: "include", method: "GET" },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/requests/export-jobs/2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49/download",
      { credentials: "include", method: "GET" },
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.download).toBe("psf_requests_20260820_070300.xlsx");
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:request-export");
  });

  it("does not request a download for a failed job and surfaces its safe message", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
            status: "failed",
            queuedAt: "2026-08-20T00:00:00.000Z",
            startedAt: "2026-08-20T00:01:00.000Z",
            completedAt: null,
            failedAt: "2026-08-20T00:02:00.000Z",
            failureMessage: "Unable to prepare this export. Please try again.",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
    ) as typeof fetch;

    const job = await fetchRequestExportJob(
      "/requests/export-jobs/2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
    );

    expect(job).toMatchObject({
      status: "failed",
      failureMessage: "Unable to prepare this export. Please try again.",
    });
    await expect(downloadCompletedRequestExport(job)).rejects.toThrow(
      "Export is not ready for download.",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a JSON response from the download endpoint before creating a blob", async () => {
    const createObjectURL = vi.fn();
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL: vi.fn() },
      writable: true,
    });
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "not an XLSX" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    ) as typeof fetch;

    await expect(
      downloadCompletedRequestExport({
        id: "2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49",
        status: "completed",
        queuedAt: "2026-08-20T00:00:00.000Z",
        startedAt: "2026-08-20T00:01:00.000Z",
        completedAt: "2026-08-20T00:02:00.000Z",
        failedAt: null,
        downloadUrl:
          "/requests/export-jobs/2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49/download",
      }),
    ).rejects.toThrow("Expected an XLSX export response.");
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
