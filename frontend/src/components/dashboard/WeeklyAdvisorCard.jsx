import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const emptyReview = null;

export const WeeklyAdvisorCard = () => {
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [review, setReview] = useState(emptyReview);

  const runWeeklyReview = async () => {
    try {
      setLoading(true);
      const response = await api.post("/advisor/weekly-review", {
        custom_prompt: customPrompt,
      });
      setReview(response.data);
      toast.success("Weekly advisor review generated");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Could not generate weekly review");
    } finally {
      setLoading(false);
    }
  };

  const exportAdvisorPdf = async () => {
    if (!review) return;
    try {
      setExportingPdf(true);
      const response = await api.post(
        "/advisor/weekly-review/pdf",
        { review_data: review },
        { responseType: "blob" },
      );
      const fileUrl = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = "financial-flow-weekly-advisor.pdf";
      anchor.click();
      URL.revokeObjectURL(fileUrl);
      toast.success("Advisor PDF exported");
    } catch {
      toast.error("Could not export advisor PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <section
      className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
      data-testid="weekly-advisor-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className="text-xs uppercase tracking-[0.2em] text-stone-500"
            data-testid="weekly-advisor-label"
          >
            AI Financial Advisor
          </p>
          <h3 className="mt-1 text-2xl font-bold" data-testid="weekly-advisor-title">
            Weekly Financial Health Score
          </h3>
          <p className="mt-1 text-sm text-stone-600" data-testid="weekly-advisor-subtext">
            Score your week, see what changed, and get 3 practical actions.
          </p>
        </div>

        {review && (
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500" data-testid="weekly-score-label">
              Current Score
            </p>
            <p className="text-3xl font-black text-[#4A6741]" data-testid="weekly-score-value">
              {review.score}/100
            </p>
            <p className="text-xs text-stone-600" data-testid="weekly-score-status">
              {review.label}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]" data-testid="weekly-advisor-controls">
        <textarea
          rows={3}
          value={customPrompt}
          data-testid="weekly-advisor-custom-prompt-input"
          placeholder="Optional custom focus (example: prioritize subscription cuts and protect savings)"
          className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
          onChange={(event) => setCustomPrompt(event.target.value)}
        />
        <button
          type="button"
          data-testid="weekly-advisor-run-button"
          disabled={loading}
          onClick={runWeeklyReview}
          className="rounded-lg bg-[#4A6741] px-5 py-3 text-sm font-medium text-white hover:bg-[#3D5636] disabled:opacity-60"
        >
          {loading ? "Running review…" : "Run Weekly Review"}
        </button>
        <button
          type="button"
          data-testid="weekly-advisor-export-pdf-button"
          disabled={!review || exportingPdf}
          onClick={exportAdvisorPdf}
          className="rounded-lg border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60"
        >
          {exportingPdf ? "Exporting…" : "Export PDF"}
        </button>
      </div>

      {review && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="weekly-advisor-results-grid">
          <article className="rounded-md border border-stone-200 p-4" data-testid="weekly-advisor-why-card">
            <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-stone-600" data-testid="weekly-advisor-why-title">
              Why it changed
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-stone-700" data-testid="weekly-advisor-why-list">
              {(review.why_changed || []).map((line, index) => (
                <li key={`${line}-${index}`} data-testid={`weekly-advisor-why-item-${index}`}>• {line}</li>
              ))}
              {!review.why_changed?.length && (
                <li data-testid="weekly-advisor-why-empty">• No major week-over-week change detected.</li>
              )}
            </ul>
          </article>

          <article className="rounded-md border border-stone-200 p-4" data-testid="weekly-advisor-actions-card">
            <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-stone-600" data-testid="weekly-advisor-actions-title">
              3 action steps
            </h4>
            <ol className="mt-3 space-y-2 text-sm text-stone-700" data-testid="weekly-advisor-actions-list">
              {(review.action_steps || []).map((line, index) => (
                <li key={`${line}-${index}`} data-testid={`weekly-advisor-action-item-${index}`}>
                  {index + 1}. {line}
                </li>
              ))}
            </ol>
          </article>

          <article className="rounded-md border border-stone-200 p-4" data-testid="weekly-advisor-comparison-card">
            <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-stone-600" data-testid="weekly-advisor-comparison-title">
              Week comparison
            </h4>
            <div className="mt-3 space-y-2 text-sm text-stone-700" data-testid="weekly-advisor-comparison-values">
              <p data-testid="weekly-advisor-expense-change-value">
                Expense change: {review.comparison?.expense_change_pct ?? 0}%
              </p>
              <p data-testid="weekly-advisor-net-change-value">
                Net change: ${review.comparison?.net_change ?? 0}
              </p>
              <p data-testid="weekly-advisor-ratio-change-value">
                Income/cost change: {review.comparison?.income_cost_ratio_change ?? 0}
              </p>
            </div>
          </article>

          <article className="rounded-md border border-stone-200 p-4 lg:col-span-3" data-testid="weekly-advisor-ai-notes-card">
            <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-stone-600" data-testid="weekly-advisor-ai-notes-title">
              Advisor AI analysis
            </h4>
            <pre
              className="custom-scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-sm text-stone-700"
              data-testid="weekly-advisor-ai-notes-content"
            >
              {review.advisor_analysis || "AI notes unavailable — metrics and action steps are still provided."}
            </pre>
          </article>
        </div>
      )}
    </section>
  );
};
