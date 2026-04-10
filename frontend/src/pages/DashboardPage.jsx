import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/api";

const metricCards = [
  { key: "total_balance", label: "Total Balance" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "net", label: "Net Cash" },
];

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api
      .get("/dashboard/summary")
      .then((response) => setSummary(response.data))
      .catch(() => toast.error("Failed to load dashboard"));
  }, []);

  const chartData = useMemo(() => summary?.monthly_cashflow || [], [summary]);

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <section className="fade-up rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="dashboard-overview-card">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500" data-testid="dashboard-overview-label">
          Control Room
        </p>
        <h2 className="mt-2 text-4xl font-black" data-testid="dashboard-overview-heading">
          See every dollar, across all connected accounts.
        </h2>
        <p className="mt-3 text-sm text-stone-600" data-testid="dashboard-overview-subtext">
          Use Connections to link Venmo, Cash App, Chime, and PayPal. Use Reports to generate PDF financial summaries on demand.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-metric-grid">
        {metricCards.map((card) => (
          <article key={card.key} className="fade-up rounded-lg border border-stone-200 bg-white p-5 shadow-sm" data-testid={`dashboard-metric-card-${card.key}`}>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500" data-testid={`dashboard-metric-label-${card.key}`}>
              {card.label}
            </p>
            <p className="mt-3 text-3xl font-black" data-testid={`dashboard-metric-value-${card.key}`}>
              ${Number(summary?.metrics?.[card.key] || 0).toLocaleString()}
            </p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3" data-testid="dashboard-chart-and-transactions-section">
        <article className="xl:col-span-2 rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="dashboard-cashflow-chart-card">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold" data-testid="dashboard-cashflow-title">Monthly Cash Flow</h3>
            <Link to="/reports" className="text-sm font-medium text-[#4A6741] hover:underline" data-testid="dashboard-go-to-reports-link">
              Build report
            </Link>
          </div>
          <div className="mt-5 h-72 w-full" data-testid="dashboard-cashflow-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line dataKey="income" stroke="#4A6741" strokeWidth={3} />
                <Line dataKey="expenses" stroke="#C75D40" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="dashboard-recent-transactions-card">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold" data-testid="dashboard-recent-transactions-title">Recent Transactions</h3>
            <Link to="/transactions" className="text-sm font-medium text-[#4A6741] hover:underline" data-testid="dashboard-view-all-transactions-link">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3" data-testid="dashboard-recent-transactions-list">
            {(summary?.recent_transactions || []).map((tx) => (
              <div key={tx.id} className="rounded-md border border-stone-200 p-3" data-testid={`dashboard-recent-transaction-${tx.id}`}>
                <p className="text-sm font-medium" data-testid={`dashboard-recent-transaction-desc-${tx.id}`}>{tx.description}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
                  <span data-testid={`dashboard-recent-transaction-meta-${tx.id}`}>
                    {tx.provider} · {tx.category}
                  </span>
                  <span className={tx.direction === "income" ? "text-[#4A6741]" : "text-[#C75D40]"} data-testid={`dashboard-recent-transaction-amount-${tx.id}`}>
                    {tx.direction === "income" ? "+" : "-"}${tx.amount}
                  </span>
                </div>
              </div>
            ))}
            {!summary?.recent_transactions?.length && (
              <p className="text-sm text-stone-500" data-testid="dashboard-empty-transactions-text">
                No transactions yet. Add one in the Transactions tab.
              </p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
