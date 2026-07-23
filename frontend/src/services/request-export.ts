import { api } from "./api";

export interface RequestExportFilterValues {
  status: string;
  from: string;
  to: string;
}

export function buildRequestExportUrl(
  filters: RequestExportFilterValues,
  resolveUrl: (path: string) => string = api.resolveUrl,
): string {
  const query = new URLSearchParams();
  const status = filters.status.trim();
  const from = filters.from.trim();
  const to = filters.to.trim();

  if (status) {
    query.set("status", status);
  }

  if (from) {
    query.set("from", from);
  }

  if (to) {
    query.set("to", to);
  }

  const serializedQuery = query.toString();
  const path = serializedQuery
    ? `/requests/export.xlsx?${serializedQuery}`
    : "/requests/export.xlsx";

  return resolveUrl(path);
}

async function exportErrorMessage(response: Response): Promise<string> {
  const responseText = await response.text();

  if (!responseText) {
    return `Unable to export requests (${response.status}).`;
  }

  try {
    const body: unknown = JSON.parse(responseText);

    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
    ) {
      return body.message;
    }
  } catch {
    return responseText;
  }

  return responseText;
}

export async function downloadRequestExport(
  filters: RequestExportFilterValues,
): Promise<void> {
  const response = await fetch(buildRequestExportUrl(filters), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await exportErrorMessage(response));
  }

  const objectUrl = URL.createObjectURL(await response.blob());

  try {
    const anchor = document.createElement("a");
    const filename =
      /filename="?([^";]+)"?/i.exec(
        response.headers.get("Content-Disposition") ?? "",
      )?.[1] ?? "psf_requests.xlsx";

    anchor.download = filename;
    anchor.href = objectUrl;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
