import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const defaultPayload = {
  title: "Custom Financial Report",
  filters: {
    provider: "",
    category: "",
    start_date: "",
    end_date: "",
  },
  prompt: "",
};

export default function ReportsPage() {
  const [payload, setPayload] = useState(defaultPayload);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [generating, setGenerating] = useState(false);

  const loadReports = async () => {
    try {
      const response = await api.get("/reports");
      const all = response.data.reports || [];
      setReports(all);
      if (all.length && !selectedReport) {
        setSelectedReport(all[0]);
      }
    } catch {
      toast.error("Failed to load reports");
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const generateReport = async (event) => {
    event.preventDefault();
    try {
      setGenerating(true);
      const response = await api.post("/reports/generate", payload);
      setSelectedReport(response.data);
      toast.success("Report generated");
      loadReports();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Report generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const downloadPdf = async () => {
    if (!selectedReport?.id) return;
    try {
      const response = await api.get(`/reports/${selectedReport.id}/pdf`, {
        responseType: "blob",
      });
      const fileUrl = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = `${selectedReport.title || "report"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(fileUrl);
    } catch {
      toast.error("Could not download PDF");
    }
  };

  return (
    <div className="space-y-8" data-testid="reports-page">
      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="reports-header-card">
        <h2 className="text-4xl font-black" data-testid="reports-header-title">Generate custom financial reports</h2>
        <p className="mt-2 text-sm text-stone-600" data-testid="reports-header-subtext">
          Mix date/category filters with prompt instructions, then export PDF instantly.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="report-builder-layout">
        <form className="rounded-lg border-2 border-[#E6DCCA] bg-[#FDFBF7] p-6 shadow-sm" onSubmit={generateReport} data-testid="report-builder-form">
          <h3 className="text-2xl font-bold" data-testid="report-builder-title">Report Builder</h3>
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-md border border-stone-200 px-3 py-2"
              data-testid="report-title-input"
              value={payload.title}
              onChange={(event) => setPayload((prev) => ({ ...prev, title: event.target.value }))}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                className="rounded-md border border-stone-200 px-3 py-2"
                data-testid="report-filter-provider-select"
                value={payload.filters.provider}
                onChange={(event) =>
                  setPayload((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, provider: event.target.value },
                  }))
                }
              >
                <option value="">All providers</option>
                <option value="venmo">Venmo</option>
                <option value="cashapp">Cash App</option>
                <option value="chime">Chime</option>
                <option value="paypal">PayPal</option>
                <option value="bank">Bank</option>
              </select>
              <input
                placeholder="Category"
                className="rounded-md border border-stone-200 px-3 py-2"
                data-testid="report-filter-category-input"
                value={payload.filters.category}
                onChange={(event) =>
                  setPayload((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, category: event.target.value },
                  }))
                }
              />
              <input
                type="date"
                className="rounded-md border border-stone-200 px-3 py-2"
                data-testid="report-filter-start-date-input"
                value={payload.filters.start_date}
                onChange={(event) =>
                  setPayload((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, start_date: event.target.value },
                  }))
                }
              />
              <input
                type="date"
                className="rounded-md border border-stone-200 px-3 py-2"
                data-testid="report-filter-end-date-input"
                value={payload.filters.end_date}
                onChange={(event) =>
                  setPayload((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, end_date: event.target.value },
                  }))
                }
              />
            </div>
            <textarea
              rows={8}
              className="w-full rounded-md border border-stone-200 px-3 py-3"
              placeholder="AI prompt example: Highlight food delivery expenses over $50 and suggest reductions."
              data-testid="report-ai-prompt-input"
              value={payload.prompt}
              onChange={(event) => setPayload((prev) => ({ ...prev, prompt: event.target.value }))}
            />
            <button
              type="submit"
              data-testid="report-generate-button"
              disabled={generating}
              className="w-full rounded-lg bg-[#4A6741] px-4 py-3 text-sm font-medium text-white hover:bg-[#3D5636] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Generating report…" : "Generate Report"}
            </button>
          </div>
        </form>

        <article className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="report-preview-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-2xl font-bold" data-testid="report-preview-title">PDF Preview</h3>
            <button
              type="button"
              data-testid="download-pdf-button"
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium hover:bg-stone-100"
              onClick={downloadPdf}
              disabled={!selectedReport?.id}
            >
              Download PDF
            </button>
          </div>

          <div className="mt-4 rounded-md border border-stone-200 bg-white p-4">
            <p className="text-sm font-medium text-stone-800" data-testid="report-preview-document-title">
              {selectedReport?.title || "No report selected"}
            </p>
            <pre className="custom-scrollbar mt-3 max-h-[460px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-stone-700" data-testid="report-preview-content">
              {selectedReport?.content || "Generate a report to preview its content here."}
            </pre>
          </div>
        </article>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="report-history-card">
        <h3 className="text-xl font-bold" data-testid="report-history-title">Report history</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="report-history-grid">
          {reports.map((report) => (
            <button
              type="button"
              key={report.id}
              data-testid={`report-history-item-${report.id}`}
              className="rounded-md border border-stone-200 p-4 text-left transition-colors hover:bg-stone-50"
              onClick={() => setSelectedReport(report)}
            >
              <p className="font-medium" data-testid={`report-history-title-${report.id}`}>{report.title}</p>
              <p className="mt-1 text-xs text-stone-500" data-testid={`report-history-date-${report.id}`}>{report.created_at}</p>
            </button>
          ))}
          {!reports.length && (
            <p className="text-sm text-stone-500" data-testid="report-history-empty-state">
              No reports generated yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
