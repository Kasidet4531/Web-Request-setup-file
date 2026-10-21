import { useEffect, useState } from "react";
import { api } from "../services/api";
import { PageHeader } from './ui/PageHeader';
import { AsyncNotice } from './ui/AsyncNotice';
import {
  downloadCompletedRequestExport,
  fetchRequestExportJob,
  fetchRequestExportPreview,
  startRequestExport,
  type RequestExportFilterValues,
  type RequestExportPreview as RequestExportPreviewValue,
} from "../services/request-export";

export const EXPORT_JOB_POLL_INTERVAL_MS = 2_000;
const EXPORT_JOB_FAILURE_MESSAGE = "Unable to prepare this export. Please try again.";
const JOB_BUTTON_LABEL = { queued: "Queued…", running: "Running…" } as const;

type PendingRequestExportJob = {
  id: string;
  status: "queued" | "running";
  statusUrl: string;
};

export interface RequestExportFiltersFormProps {
  downloading: boolean;
  filters: RequestExportFilterValues;
  onChange: (field: keyof RequestExportFilterValues, value: string) => void;
  statuses: string[];
  statusDisabled?: boolean;
}

export function RequestExportFiltersForm({
  downloading,
  filters,
  onChange,
  statuses,
  statusDisabled = false,
}: RequestExportFiltersFormProps) {
  return (
    <div className="filter-bar request-export__filters">
      <label>
        Status
        <select
          disabled={downloading || statusDisabled}
          name="status"
          onChange={(event) => onChange("status", event.target.value)}
          value={filters.status}
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
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
  // Progress is shown on the button; screen readers still get it here.
  if (downloading) {
    return <span className="sr-only" role="status">{jobStatus ? `Request export ${jobStatus}…` : "Preparing request export…"}</span>;
  }

  return feedback ? <AsyncNotice kind="error" title={feedback.message} /> : null;
}

type RequestExportPreviewState = RequestExportPreviewValue & {
  error: string | null;
  loading: boolean;
};

// The first rows of the file itself: the same columns, values and NA cells,
// with Request No pinned while the other columns scroll.
export function RequestExportPreview({
  error,
  headers,
  rows,
  loading,
  total,
}: RequestExportPreviewState) {
  return (
    <section className="request-export__preview" aria-live="polite">
      <div className="request-export__preview-header">
        <div>
          <h2>Request preview</h2>
          <p>{loading ? "Loading filtered requests…" : `First ${rows.length} of ${total} request${total === 1 ? "" : "s"} in the file.`}</p>
          <p>The download includes every submitted request that matches these filters, never Drafts, with the same columns shown here.</p>
        </div>
      </div>
      {error ? <AsyncNotice kind="error" title={error} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="table-empty">
          <h3>No requests match these filters</h3>
          <p>Adjust the filters to preview different requests.</p>
        </div>
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <div className="request-export__preview-table">
        <p className="table-scroll__hint">Scroll horizontally to see every column in the file.</p>
        <div className="data-table" role="region" aria-label="Filtered request preview" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {headers.map((header, column) => (
                  <th key={column} scope="col" className={column === 0 ? "request-export__pinned" : undefined}><span title={header}>{header}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([requestNo, ...cells], row) => (
                <tr key={row}>
                  <th scope="row" className="request-export__pinned">{requestNo}</th>
                  {cells.map((cell, column) => <td key={column}><span title={String(cell)}>{cell}</span></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      ) : null}
    </section>
  );
}

export function RequestExportPage() {
  const [catalog, setCatalog] = useState<{ statuses: string[]; loading: boolean; error: string | null }>({
    statuses: [], loading: true, error: null,
  });
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
    headers: [],
    rows: [],
    loading: true,
    total: 0,
  });
  const pendingJobStatusUrl = pendingJob?.statusUrl;

  const updateFilters = (
    field: keyof RequestExportFilterValues,
    value: string,
  ) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setPreview((current) => ({ ...current, error: null, loading: true }));
  };

  useEffect(() => {
    let cancelled = false;
    void api.fetchWorkflowStatuses().then(
      (response) => {
        if (!cancelled) setCatalog({ statuses: response.entries.filter((entry) => entry.kind !== "draft").map((entry) => entry.name), loading: false, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setCatalog({ statuses: [], loading: false, error: error instanceof Error ? error.message : "Catalog unavailable." });
      },
    );
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchRequestExportPreview(filters).then(
      (response) => {
        if (!cancelled) {
          setPreview({ error: null, ...response, loading: false });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setPreview({
            error: error instanceof Error ? error.message : "Unable to load export preview.",
            headers: [],
            rows: [],
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
            setPendingJob(null);
            setDownloading(false);
          }
          return;
        }

        if (job.status === "failed") {
          setFeedback({ message: job.failureMessage ?? EXPORT_JOB_FAILURE_MESSAGE });
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
        setDownloading(false);
        return;
      }

      setPendingJob(result.job);
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : "Unable to export requests.",
      });
      setDownloading(false);
    }
  };

  return (
    <article className="page-card workflow-page">
      <PageHeader title="Export to Excel" description="Larger exports are prepared in the background." />
      <div className="page-card__body request-export">
        <section className="page-card__section request-export__filter-panel">
          <h2 className="sr-only">Export filters</h2>
          {catalog.loading ? <AsyncNotice kind="loading" title="Loading workflow statuses…" /> : null}
          {catalog.error ? <AsyncNotice kind="error" title={`Unable to load workflow statuses: ${catalog.error}`} /> : null}
          <div className="request-export__filter-layout">
          <RequestExportFiltersForm
            downloading={downloading}
            filters={filters}
            onChange={updateFilters}
            statuses={catalog.statuses}
            statusDisabled={catalog.loading || Boolean(catalog.error)}
          />
        <div className="request-export__action">
          <button className="primary-button" disabled={downloading} onClick={exportRequests} type="button">
            {downloading ? (pendingJob ? JOB_BUTTON_LABEL[pendingJob.status] : "Preparing…") : "Export XLSX"}
          </button>
        </div>
          </div>
          <RequestExportFeedback
            downloading={downloading}
            feedback={feedback}
            jobStatus={pendingJob?.status ?? null}
          />
        </section>
        <RequestExportPreview {...preview} />
      </div>
    </article>
  );
}
