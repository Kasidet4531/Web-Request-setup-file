import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as RequestExportPageModule from "./RequestExportPage";
import * as RequestExportClient from "../services/request-export";
import * as ExportProfileRoute from "../routes/admin/export-profile";

describe("request export URL", () => {
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

  it("serializes only supplied status and request-date filters", () => {
    const buildRequestExportUrl = Reflect.get(
      RequestExportClient,
      "buildRequestExportUrl",
    ) as (filters: { status: string; from: string; to: string }) => string;

    expect(
      buildRequestExportUrl({
        status: " Submitted ",
        from: "2026-06-01",
        to: "2026-06-30",
      }),
    ).toBe(
      "/api/requests/export.xlsx?status=Submitted&from=2026-06-01&to=2026-06-30",
    );
  });

  it("downloads the XLSX blob and always revokes its object URL", async () => {
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
    globalThis.fetch = vi.fn(
      async () =>
        new Response(new Blob(["xlsx"]), {
          headers: {
            "Content-Disposition":
              'attachment; filename="psf_requests_20260619_000506.xlsx"',
          },
          status: 200,
        }),
    ) as typeof fetch;
    const downloadRequestExport = Reflect.get(
      RequestExportClient,
      "downloadRequestExport",
    ) as (filters: {
      status: string;
      from: string;
      to: string;
    }) => Promise<void>;

    await expect(
      downloadRequestExport({
        status: "Submitted",
        from: "2026-06-01",
        to: "2026-06-30",
      }),
    ).resolves.toBeUndefined();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/requests/export.xlsx?status=Submitted&from=2026-06-01&to=2026-06-30",
      { credentials: "include", method: "GET" },
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.href).toBe("blob:request-export");
    expect(anchor.download).toBe("psf_requests_20260619_000506.xlsx");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:request-export");
  });

  it("surfaces a backend 403 response as a clear export error", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: "Only admins can export requests.",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 403,
          },
        ),
    ) as typeof fetch;
    const downloadRequestExport = Reflect.get(
      RequestExportClient,
      "downloadRequestExport",
    ) as (filters: {
      status: string;
      from: string;
      to: string;
    }) => Promise<void>;

    await expect(
      downloadRequestExport({
        status: "",
        from: "",
        to: "",
      }),
    ).rejects.toThrow("Only admins can export requests.");
  });

  it("renders native export filters and disables the export action while downloading", () => {
    const onExport = vi.fn();
    const RequestExportFiltersForm = Reflect.get(
      RequestExportPageModule,
      "RequestExportFiltersForm",
    ) as (props: {
      downloading: boolean;
      filters: { status: string; from: string; to: string };
      onChange: (field: string, value: string) => void;
      onExport: () => void;
    }) => unknown;
    const props = {
      downloading: false,
      filters: {
        status: "Submitted",
        from: "2026-06-01",
        to: "2026-06-30",
      },
      onChange: vi.fn(),
      onExport,
    };
    const form = RequestExportFiltersForm(props);
    const html = renderToStaticMarkup(form as never);
    const loadingHtml = renderToStaticMarkup(
      RequestExportFiltersForm({ ...props, downloading: true }) as never,
    );

    expect(html).toContain('name="status"');
    expect(html).toContain('name="from"');
    expect(html).toContain('name="to"');
    expect(html).toContain("<select");
    expect(html).toContain('type="date"');
    expect(loadingHtml).toContain('disabled=""');
    expect(loadingHtml).toContain("Downloading…");

    const formElement = form as {
      props: { onSubmit: (event: { preventDefault: () => void }) => void };
    };
    formElement.props.onSubmit({ preventDefault: vi.fn() });

    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("renders accessible loading, success, and 403 error feedback", () => {
    const RequestExportFeedback = Reflect.get(
      RequestExportPageModule,
      "RequestExportFeedback",
    ) as (props: {
      downloading: boolean;
      feedback: { kind: "success" | "error"; message: string } | null;
    }) => unknown;

    const loadingHtml = renderToStaticMarkup(
      RequestExportFeedback({
        downloading: true,
        feedback: null,
      }) as never,
    );
    const successHtml = renderToStaticMarkup(
      RequestExportFeedback({
        downloading: false,
        feedback: { kind: "success", message: "Request export downloaded." },
      }) as never,
    );
    const errorHtml = renderToStaticMarkup(
      RequestExportFeedback({
        downloading: false,
        feedback: {
          kind: "error",
          message: "Only admins can export requests.",
        },
      }) as never,
    );

    expect(loadingHtml).toContain("Preparing request export…");
    expect(loadingHtml).toContain('role="status"');
    expect(successHtml).toContain("Request export downloaded.");
    expect(successHtml).toContain('role="status"');
    expect(errorHtml).toContain("Only admins can export requests.");
    expect(errorHtml).toContain('role="alert"');
  });

  it("replaces the route placeholder with the request export page", () => {
    const RequestExportPage = Reflect.get(
      RequestExportPageModule,
      "RequestExportPage",
    ) as () => unknown;
    const routeOptions = Reflect.get(ExportProfileRoute.Route, "options") as {
      component: unknown;
    };
    const html = renderToStaticMarkup(
      createElement(RequestExportPage as never),
    );

    expect(routeOptions.component).toBe(RequestExportPage);
    expect(html).toContain("<h1>Request export</h1>");
    expect(html).toContain(
      "Download a filtered XLSX copy of the current request list.",
    );
    expect(html).toContain("Export XLSX");
  });
});
