import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as RequestExportPageModule from "./RequestExportPage";

describe("RequestExportPage asynchronous lifecycle feedback", () => {
  it("shows a queued job state while the export is being prepared", () => {
    const RequestExportFeedback = Reflect.get(
      RequestExportPageModule,
      "RequestExportFeedback",
    ) as (props: {
      downloading: boolean;
      feedback: null;
      jobStatus: "queued" | "running" | null;
    }) => unknown;

    const html = renderToStaticMarkup(
      RequestExportFeedback({
        downloading: true,
        feedback: null,
        jobStatus: "queued",
      }) as never,
    );

    expect(html).toContain("Request export queued…");
    expect(html).toContain('role="status"');
  });
});
