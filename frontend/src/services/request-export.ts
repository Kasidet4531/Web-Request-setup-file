import { api } from "./api";

export interface RequestExportFilterValues {
  status: string;
  from: string;
  to: string;
}

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXPORT_JOB_STATUSES = ["queued", "running", "completed", "failed"] as const;

export type RequestExportJobStatusValue = (typeof EXPORT_JOB_STATUSES)[number];

export interface RequestExportQueuedJob {
  id: string;
  status: "queued";
  statusUrl: string;
}

export interface RequestExportJobStatus {
  id: string;
  status: RequestExportJobStatusValue;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureMessage?: string;
  downloadUrl?: string;
}

export type RequestExportStartResult =
  | { kind: "downloaded" }
  | { kind: "queued"; job: RequestExportQueuedJob };

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

export async function startRequestExport(
  filters: RequestExportFilterValues,
): Promise<RequestExportStartResult> {
  const response = await fetch(buildRequestExportUrl(filters), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await exportErrorMessage(response));
  }

  if (isXlsxResponse(response)) {
    await downloadXlsxResponse(response);
    return { kind: "downloaded" };
  }

  return {
    kind: "queued",
    job: readQueuedJob(await readJsonResponse(response)),
  };
}

export async function fetchRequestExportJob(
  statusUrl: string,
): Promise<RequestExportJobStatus> {
  const response = await fetch(api.resolveUrl(statusUrl), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await exportErrorMessage(response));
  }

  return readExportJobStatus(await readJsonResponse(response));
}

export async function downloadCompletedRequestExport(
  job: RequestExportJobStatus,
): Promise<void> {
  if (job.status !== "completed" || !job.downloadUrl) {
    throw new Error("Export is not ready for download.");
  }

  const response = await fetch(api.resolveUrl(job.downloadUrl), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await exportErrorMessage(response));
  }

  if (!isXlsxResponse(response)) {
    throw new Error("Expected an XLSX export response.");
  }

  await downloadXlsxResponse(response);
}

async function downloadXlsxResponse(response: Response): Promise<void> {
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

function isXlsxResponse(response: Response): boolean {
  return (
    response
      .headers
      .get("Content-Type")
      ?.toLowerCase()
      .includes(XLSX_CONTENT_TYPE) ?? false
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("Expected a JSON export job response.");
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Expected a JSON export job response.");
  }
}

function readQueuedJob(value: unknown): RequestExportQueuedJob {
  if (!isRecord(value) || typeof value.id !== "string" || value.status !== "queued") {
    throw new Error("Invalid queued export job response.");
  }

  if (typeof value.statusUrl !== "string") {
    throw new Error("Invalid queued export job response.");
  }

  return {
    id: value.id,
    status: "queued",
    statusUrl: value.statusUrl,
  };
}

function readExportJobStatus(value: unknown): RequestExportJobStatus {
  if (!isRecord(value) || typeof value.id !== "string" || !isExportJobStatus(value.status)) {
    throw new Error("Invalid export job status response.");
  }

  const status = value.status;
  const response: RequestExportJobStatus = {
    id: value.id,
    status,
    queuedAt: readTimestamp(value.queuedAt),
    startedAt: readNullableTimestamp(value.startedAt),
    completedAt: readNullableTimestamp(value.completedAt),
    failedAt: readNullableTimestamp(value.failedAt),
  };

  if (typeof value.failureMessage === "string") {
    response.failureMessage = value.failureMessage;
  }

  if (typeof value.downloadUrl === "string") {
    response.downloadUrl = value.downloadUrl;
  }

  return response;
}

function readTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid export job status response.");
  }

  return value;
}

function readNullableTimestamp(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return readTimestamp(value);
}

function isExportJobStatus(value: unknown): value is RequestExportJobStatusValue {
  return (
    typeof value === "string" &&
    EXPORT_JOB_STATUSES.includes(value as RequestExportJobStatusValue)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
