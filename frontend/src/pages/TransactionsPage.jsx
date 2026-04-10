import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const defaultFilters = {
  provider: "",
  category: "",
  direction: "",
  start_date: "",
  end_date: "",
  search: "",
};

const defaultForm = {
  provider: "venmo",
  account_id: "",
  amount: "",
  direction: "expense",
  category: "",
  description: "",
  transaction_date: new Date().toISOString().slice(0, 10),
};

export default function TransactionsPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [formData, setFormData] = useState(defaultForm);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const loadPageData = async () => {
    try {
      const [transactionsResponse, accountsResponse] = await Promise.all([
        api.get("/transactions", { params: { ...filters, limit: 100, page: 1 } }),
        api.get("/connections/accounts"),
      ]);
      setTransactions(transactionsResponse.data.transactions || []);
      setAccounts(accountsResponse.data.accounts || []);
    } catch {
      toast.error("Failed to load transactions");
    }
  };

  useEffect(() => {
    loadPageData();
  }, []);

  const submitTransaction = async (event) => {
    event.preventDefault();
    try {
      await api.post("/transactions/manual", {
        ...formData,
        amount: Number(formData.amount),
        account_id: formData.account_id || null,
      });
      toast.success("Transaction added");
      setFormData(defaultForm);
      loadPageData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Unable to add transaction");
    }
  };

  return (
    <div className="space-y-8" data-testid="transactions-page">
      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="transactions-header-card">
        <h2 className="text-4xl font-black" data-testid="transactions-header-title">Track every transaction</h2>
        <p className="mt-2 text-sm text-stone-600" data-testid="transactions-header-subtext">
          Combine synced transactions with manual cash entries to get complete reporting.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="transactions-layout-grid">
        <form className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" onSubmit={submitTransaction} data-testid="transaction-create-form">
          <h3 className="text-xl font-bold" data-testid="transaction-create-title">Add transaction</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <select
              value={formData.provider}
              className="rounded-md border border-stone-200 px-3 py-2"
              data-testid="transaction-provider-select"
              onChange={(event) => setFormData((prev) => ({ ...prev, provider: event.target.value }))}
            >
              <option value="venmo">Venmo</option>
              <option value="cashapp">Cash App</option>
              <option value="chime">Chime</option>
              <option value="paypal">PayPal</option>
              <option value="bank">Bank</option>
            </select>
            <select
              value={formData.account_id}
              className="rounded-md border border-stone-200 px-3 py-2"
              data-testid="transaction-account-select"
              onChange={(event) => setFormData((prev) => ({ ...prev, account_id: event.target.value }))}
            >
              <option value="">No account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} ({account.provider})
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              step="0.01"
              placeholder="Amount"
              value={formData.amount}
              className="rounded-md border border-stone-200 px-3 py-2"
              data-testid="transaction-amount-input"
              onChange={(event) => setFormData((prev) => ({ ...prev, amount: event.target.value }))}
            />
            <select
              value={formData.direction}
              className="rounded-md border border-stone-200 px-3 py-2"
              data-testid="transaction-direction-select"
              onChange={(event) => setFormData((prev) => ({ ...prev, direction: event.target.value }))}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              required
              placeholder="Category"
              value={formData.category}
              className="rounded-md border border-stone-200 px-3 py-2"
              data-testid="transaction-category-input"
              onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
            />
            <input
              required
              type="date"
              value={formData.transaction_date}
              className="rounded-md border border-stone-200 px-3 py-2"
              data-testid="transaction-date-input"
              onChange={(event) => setFormData((prev) => ({ ...prev, transaction_date: event.target.value }))}
            />
            <input
              required
              placeholder="Description"
              className="md:col-span-2 rounded-md border border-stone-200 px-3 py-2"
              data-testid="transaction-description-input"
              value={formData.description}
              onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
          <button
            type="submit"
            data-testid="transaction-submit-button"
            className="mt-4 w-full rounded-lg bg-[#4A6741] px-4 py-3 text-sm font-medium text-white hover:bg-[#3D5636]"
          >
            Save transaction
          </button>
        </form>

        <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="transaction-filters-card">
          <h3 className="text-xl font-bold" data-testid="transaction-filters-title">Filter transactions</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              placeholder="Search description"
              value={filters.search}
              data-testid="transaction-filter-search-input"
              className="rounded-md border border-stone-200 px-3 py-2"
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            />
            <input
              placeholder="Category"
              value={filters.category}
              data-testid="transaction-filter-category-input"
              className="rounded-md border border-stone-200 px-3 py-2"
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            />
            <input
              type="date"
              value={filters.start_date}
              data-testid="transaction-filter-start-date-input"
              className="rounded-md border border-stone-200 px-3 py-2"
              onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            />
            <input
              type="date"
              value={filters.end_date}
              data-testid="transaction-filter-end-date-input"
              className="rounded-md border border-stone-200 px-3 py-2"
              onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="transaction-apply-filters-button"
              className="rounded-lg bg-[#4A6741] px-4 py-2 text-sm font-medium text-white"
              onClick={loadPageData}
            >
              Apply filters
            </button>
            <button
              type="button"
              data-testid="transaction-reset-filters-button"
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium"
              onClick={() => {
                setFilters(defaultFilters);
                setTimeout(loadPageData, 0);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="transaction-table-card">
        <h3 className="text-xl font-bold" data-testid="transaction-table-title">Transaction ledger</h3>
        <div className="custom-scrollbar mt-4 overflow-x-auto" data-testid="transaction-table-wrapper">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs uppercase tracking-[0.18em] text-stone-500">
                <th className="px-2 py-3">Date</th>
                <th className="px-2 py-3">Description</th>
                <th className="px-2 py-3">Provider</th>
                <th className="px-2 py-3">Category</th>
                <th className="px-2 py-3">Type</th>
                <th className="px-2 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-stone-100" data-testid={`transaction-row-${tx.id}`}>
                  <td className="px-2 py-3" data-testid={`transaction-date-${tx.id}`}>{tx.transaction_date}</td>
                  <td className="px-2 py-3" data-testid={`transaction-description-${tx.id}`}>{tx.description}</td>
                  <td className="px-2 py-3 capitalize" data-testid={`transaction-provider-${tx.id}`}>{tx.provider}</td>
                  <td className="px-2 py-3" data-testid={`transaction-category-${tx.id}`}>{tx.category}</td>
                  <td className="px-2 py-3 capitalize" data-testid={`transaction-direction-${tx.id}`}>{tx.direction}</td>
                  <td className={`px-2 py-3 text-right font-medium ${tx.direction === "income" ? "text-[#4A6741]" : "text-[#C75D40]"}`} data-testid={`transaction-amount-${tx.id}`}>
                    {tx.direction === "income" ? "+" : "-"}${tx.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!transactions.length && (
            <p className="py-8 text-center text-sm text-stone-500" data-testid="transaction-empty-state">
              No transactions yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
