import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PlaidConnectButton } from "@/components/providers/PlaidConnectButton";

const providerImages = {
  venmo:
    "https://static.prod-images.emergentagent.com/jobs/522d1ae5-e3a1-4a99-90c4-276bd1db41d5/images/5f79f7afd038455f5e988b7f20a28a1adcd03f58ff1447b59aea0cadfa48c2bc.png",
  cashapp:
    "https://static.prod-images.emergentagent.com/jobs/522d1ae5-e3a1-4a99-90c4-276bd1db41d5/images/661ccc106c1c54c9f0b2f02d746e6c6855b7a0b2041038b4a435bb1ce68732ff.png",
  chime:
    "https://static.prod-images.emergentagent.com/jobs/522d1ae5-e3a1-4a99-90c4-276bd1db41d5/images/d7f5947ac856d89a0c445e754fe8b0e3da8bcc763883a8e7a57e505b0e32940d.png",
  paypal:
    "https://images.pexels.com/photos/5437587/pexels-photo-5437587.jpeg",
  bank:
    "https://images.pexels.com/photos/259027/pexels-photo-259027.jpeg",
};

const initialForm = {
  provider: "venmo",
  account_name: "",
  account_type: "wallet",
  current_balance: "",
};

export default function ConnectionsPage() {
  const [status, setStatus] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [formData, setFormData] = useState(initialForm);

  const loadData = async () => {
    try {
      const [providersResponse, accountsResponse] = await Promise.all([
        api.get("/connections/providers"),
        api.get("/connections/accounts"),
      ]);
      setStatus(providersResponse.data.providers || []);
      setAccounts(accountsResponse.data.accounts || []);
    } catch {
      toast.error("Failed to load account connections");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addManualConnection = async (event) => {
    event.preventDefault();
    try {
      await api.post("/connections/manual", {
        ...formData,
        current_balance: Number(formData.current_balance || 0),
      });
      toast.success("Manual account connected");
      setFormData(initialForm);
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Unable to create manual connection");
    }
  };

  return (
    <div className="space-y-8" data-testid="connections-page">
      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="connections-header-card">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500" data-testid="connections-header-label">
          Provider Connections
        </p>
        <h2 className="mt-2 text-4xl font-black" data-testid="connections-header-title">
          Connect Venmo, Cash App, Chime, PayPal, and bank accounts.
        </h2>
        <p className="mt-2 text-sm text-stone-600" data-testid="connections-header-subtext">
          Use Plaid for real account linking and add manual balances where needed.
        </p>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="plaid-connect-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-bold" data-testid="plaid-connect-title">Real-time bank linking</h3>
            <p className="text-sm text-stone-600" data-testid="plaid-connect-description">
              Connect real institutions through Plaid and sync transactions automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PlaidConnectButton onConnected={loadData} />
            <button
              type="button"
              data-testid="plaid-sync-button"
              className="rounded-lg border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100"
              onClick={async () => {
                try {
                  await api.post("/connections/plaid/sync");
                  toast.success("Plaid sync complete");
                  loadData();
                } catch (error) {
                  toast.error(error?.response?.data?.detail || "Unable to sync Plaid");
                }
              }}
            >
              Sync Plaid
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5" data-testid="provider-status-grid">
        {status.map((item) => (
          <article key={item.provider} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" data-testid={`provider-card-${item.provider}`}>
            <img
              src={providerImages[item.provider]}
              alt={item.provider}
              className="h-20 w-full rounded-md object-cover"
              data-testid={`provider-image-${item.provider}`}
            />
            <h4 className="mt-3 text-lg font-bold capitalize" data-testid={`provider-name-${item.provider}`}>{item.provider}</h4>
            <p className="text-sm text-stone-600" data-testid={`provider-account-count-${item.provider}`}>
              Accounts: {item.account_count}
            </p>
            <p className="text-sm text-stone-600" data-testid={`provider-balance-${item.provider}`}>
              Balance: ${item.total_balance}
            </p>
            <p className={`mt-2 inline-flex rounded-md px-2 py-1 text-xs ${item.connected ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-600"}`} data-testid={`provider-connected-status-${item.provider}`}>
              {item.connected ? "Connected" : "Not connected"}
            </p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="manual-connection-layout">
        <form className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" onSubmit={addManualConnection} data-testid="manual-connection-form">
          <h3 className="text-xl font-bold" data-testid="manual-connection-title">Manual account connection</h3>
          <div className="mt-4 space-y-3">
            <select
              value={formData.provider}
              data-testid="manual-connection-provider-select"
              className="w-full rounded-md border border-stone-200 px-3 py-2"
              onChange={(event) => setFormData((prev) => ({ ...prev, provider: event.target.value }))}
            >
              <option value="venmo">Venmo</option>
              <option value="cashapp">Cash App</option>
              <option value="chime">Chime</option>
              <option value="paypal">PayPal</option>
              <option value="bank">Bank</option>
            </select>
            <input
              required
              placeholder="Account name"
              value={formData.account_name}
              data-testid="manual-connection-account-name-input"
              className="w-full rounded-md border border-stone-200 px-3 py-2"
              onChange={(event) => setFormData((prev) => ({ ...prev, account_name: event.target.value }))}
            />
            <select
              value={formData.account_type}
              data-testid="manual-connection-account-type-select"
              className="w-full rounded-md border border-stone-200 px-3 py-2"
              onChange={(event) => setFormData((prev) => ({ ...prev, account_type: event.target.value }))}
            >
              <option value="wallet">Wallet</option>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit</option>
              <option value="other">Other</option>
            </select>
            <input
              required
              type="number"
              step="0.01"
              placeholder="Current balance"
              value={formData.current_balance}
              data-testid="manual-connection-balance-input"
              className="w-full rounded-md border border-stone-200 px-3 py-2"
              onChange={(event) => setFormData((prev) => ({ ...prev, current_balance: event.target.value }))}
            />
            <button
              type="submit"
              data-testid="manual-connection-submit-button"
              className="w-full rounded-lg bg-[#4A6741] px-5 py-3 text-sm font-medium text-white hover:bg-[#3D5636]"
            >
              Save Manual Connection
            </button>
          </div>
        </form>

        <article className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="connected-accounts-list-card">
          <h3 className="text-xl font-bold" data-testid="connected-accounts-list-title">Connected accounts</h3>
          <div className="mt-4 space-y-3" data-testid="connected-accounts-list">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-md border border-stone-200 p-3" data-testid={`connected-account-item-${account.id}`}>
                <p className="font-medium" data-testid={`connected-account-name-${account.id}`}>{account.account_name}</p>
                <p className="text-sm text-stone-600" data-testid={`connected-account-meta-${account.id}`}>
                  {account.provider} · {account.account_type} · {account.source}
                </p>
                <p className="text-sm text-[#4A6741]" data-testid={`connected-account-balance-${account.id}`}>
                  ${account.current_balance}
                </p>
              </div>
            ))}
            {!accounts.length && (
              <p className="text-sm text-stone-500" data-testid="connected-accounts-empty-state">
                No accounts connected yet.
              </p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
