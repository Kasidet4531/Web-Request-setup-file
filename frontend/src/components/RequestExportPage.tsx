import { useEffect, useState } from "react";
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
  onExport: () => void;
}

export function RequestExportFiltersForm({
  downloading,
  filters,
  onChange,
  onExport,
}: RequestExportFiltersFormProps) {
  return (
    <form
      className="filter-bar"
      onSubmit={(event) => {
        event.preventDefault();

        if (!downloading) {
          onExport();
        }
      }}
    >
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
      <div className="button-row">
        <button className="primary-button" disabled={downloading} type="submit">
          {downloading ? "Preparing…" : "Export XLSX"}
        </button>
      </div>
    </form>
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
  const pendingJobStatusUrl = pendingJob?.statusUrl;

  const updateFilters = (
    field: keyof RequestExportFilterValues,
    value: string,
  ) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

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
        <div>
          <p className="page-card__eyebrow">Admin tools</p>
          <h1>Request export</h1>
          <p className="page-card__description">
            Download a filtered XLSX copy of the current request list.
          </p>
        </div>
      </div>
      <div className="page-card__body">
        <section className="page-card__section">
          <h2>Export filters</h2>
          <p>
            Use the same status and request-date criteria as the request list.
          </p>
          <RequestExportFiltersForm
            downloading={downloading}
            filters={filters}
            onChange={updateFilters}
            onExport={exportRequests}
          />
          <RequestExportFeedback
            downloading={downloading}
            feedback={feedback}
            jobStatus={pendingJob?.status ?? null}
          />
        </section>
      </div>
    </article>
  );
}
