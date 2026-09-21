import { useEffect, useState } from "react";
import { api, type PsfRequestListItem } from "../services/api";
import {
  downloadCompletedRequestExport,
  fetchRequestExportJob,
  startRequestExport,
  type RequestExportFilterValues,
} from "../services/request-export";

export const EXPORT_JOB_POLL_INTERVAL_MS = 2_000;
const EXPORT_JOB_FAILURE_MESSAGE = "Unable to prepare this export. Please try again.";

type PendingRequestExportJob = {
  id: string;
  status: "queued" | "running";
  statusUrl: string;
};

const WORKFLOW_STATUSES = [
  "Submitted",
  "Setup In Progress",
  "Need More Information",
  "PSF Created",
  "Completed",
  "Rejected",
  "Cancelled",
];

export interface RequestExportFiltersFormProps {
  downloading: boolean;
  filters: RequestExportFilterValues;
  onChange: (field: keyof RequestExportFilterValues, value: string) => void;
}

export function RequestExportFiltersForm({
  downloading,
  filters,
  onChange,
}: RequestExportFiltersFormProps) {
  return (
    <div className="filter-bar">
      <label>
        Status
        <select
          disabled={downloading}
          name="status"
          onChange={(event) => onChange("status", event.target.value)}
          value={filters.status}
        >
          <option value="">All statuses</option>
          {WORKFLOW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label>
        From request date
        <input
          disabled={downloading}
          name="from"
          onChange={(event) => onChange("from", event.target.value)}
          type="date"
          value={filters.from}
        />
      </label>
      <label>
        To request date
        <input
          disabled={downloading}
          name="to"
          onChange={(event) => onChange("to", event.target.value)}
          type="date"
          value={filters.to}
        />
      </label>
    </div>
  );
}

export interface RequestExportFeedbackValue {
  kind: "success" | "error";
  message: string;
}

export function RequestExportFeedback({
  downloading,
  feedback,
  jobStatus,
}: {
  downloading: boolean;
  feedback: RequestExportFeedbackValue | null;
  jobStatus: "queued" | "running" | null;
}) {
  if (downloading) {
    return (
      <p className="page-card__description" role="status">
        {jobStatus ? `Request export ${jobStatus}…` : "Preparing request export…"}
      </p>
    );
  }

  if (!feedback) {
    return null;
  }

  return (
    <p
      className={`status-pill status-pill--${feedback.kind}`}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  );
}

type RequestExportPreviewState = {
  error: string | null;
  items: PsfRequestListItem[];
  loading: boolean;
  total: number;
};

function formatPreviewDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function RequestExportPreview({
  error,
  items,
  loading,
  total,
}: RequestExportPreviewState) {
  return (
    <section className="request-export__preview" aria-live="polite">
      <div className="request-export__preview-header">
        <div>
          <h2>Export preview</h2>
          <p>{loading ? "Loading filtered requests…" : `First ${items.length} of ${total} matching request${total === 1 ? "" : "s"}.`}</p>
        </div>
      </div>
      {error ? <p className="status-pill status-pill--error" role="alert">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <div className="table-empty">
          <h3>No requests match these filters</h3>
          <p>Adjust the filters to preview a different export set.</p>
        </div>
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="data-table" role="region" aria-label="Filtered request export preview" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Request No.</th>
                <th>Title / Product Type</th>
                <th>Status</th>
                <th>Requester</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.requestId}>
                  <td>{item.requestNo}</td>
                  <td>
                    <span className="cell-strong">{item.title ?? "Untitled request"}</span>
                    <span className="chip">{item.productType ?? "No product type"}</span>
                  </td>
                  <td><span className="status-badge">{item.status}</span></td>
                  <td>{item.requester ?? "—"}</td>
                  <td>{formatPreviewDate(item.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function RequestExportPage() {
  const [filters, setFilters] = useState<RequestExportFilterValues>({
    status: "",
    from: "",
    to: "",
  });
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<RequestExportFeedbackValue | null>(
    null,
  );
  const [pendingJob, setPendingJob] = useState<PendingRequestExportJob | null>(
    null,
  );
  const [preview, setPreview] = useState<RequestExportPreviewState>({
    error: null,
    items: [],
    loading: true,
    total: 0,
  });
  const pendingJobStatusUrl = pendingJob?.statusUrl;

  const updateFilters = (
    field: keyof RequestExportFilterValues,
    value: string,
  ) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    let cancelled = false;

    void api.queryPsfRequests({
      limit: 10,
      requestDateFrom: filters.from || undefined,
      requestDateTo: filters.to || undefined,
      status: filters.status || undefined,
    }).then(
      (response) => {
        if (!cancelled) {
          setPreview({ error: null, items: response.items, loading: false, total: response.total });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setPreview({
            error: error instanceof Error ? error.message : "Unable to load export preview.",
            items: [],
            loading: false,
            total: 0,
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    if (!pendingJobStatusUrl) {
      return;
    }

    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (cancelled || polling) {
        return;
      }

      polling = true;

      try {
        const job = await fetchRequestExportJob(pendingJobStatusUrl);

        if (cancelled) {
          return;
        }

        if (job.status === "completed") {
          await downloadCompletedRequestExport(job);

          if (!cancelled) {
            setFeedback({
              kind: "success",
              message: "Request export downloaded.",
            });
            setPendingJob(null);
            setDownloading(false);
          }
          return;
        }

        if (job.status === "failed") {
          setFeedback({
            kind: "error",
            message: job.failureMessage ?? EXPORT_JOB_FAILURE_MESSAGE,
          });
          setPendingJob(null);
          setDownloading(false);
          return;
        }

        if (job.status === "queued" || job.status === "running") {
          const pendingStatus: PendingRequestExportJob["status"] =
            job.status === "queued" ? "queued" : "running";
          setPendingJob((current) =>
            current?.id === job.id
              ? { ...current, status: pendingStatus }
              : current,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            kind: "error",
            message:
              error instanceof Error ? error.message : "Unable to export requests.",
          });
          setPendingJob(null);
          setDownloading(false);
        }
      } finally {
        polling = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), EXPORT_JOB_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingJobStatusUrl]);

  const exportRequests = async () => {
    setDownloading(true);
    setFeedback(null);

    try {
      const result = await startRequestExport(filters);

      if (result.kind === "downloaded") {
        setFeedback({
          kind: "success",
          message: "Request export downloaded.",
        });
        setDownloading(false);
        return;
      }

      setPendingJob(result.job);
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Unable to export requests.",
      });
      setDownloading(false);
    }
  };

  return (
    <article className="page-card workflow-page">
      <div className="page-card__header">
        <h1>Request export</h1>
      </div>
      <div className="page-card__body request-export">
        <section className="page-card__section">
          <h2>Export filters</h2>
          <RequestExportFiltersForm
            downloading={downloading}
            filters={filters}
            onChange={updateFilters}
          />
        </section>
        <RequestExportPreview {...preview} />
        <div className="request-export__action">
          <button className="primary-button" disabled={downloading} onClick={exportRequests} type="button">
            {downloading ? "Preparing…" : "Export XLSX"}
          </button>
          <RequestExportFeedback
            downloading={downloading}
            feedback={feedback}
            jobStatus={pendingJob?.status ?? null}
          />
        </div>
      </div>
    </article>
  );
}
