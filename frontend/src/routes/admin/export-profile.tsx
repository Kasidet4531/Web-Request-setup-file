import { createFileRoute } from "@tanstack/react-router";
import { RequestExportPage } from "../../components/RequestExportPage";

export const Route = createFileRoute("/admin/export-profile")({
  component: RequestExportPage,
});
