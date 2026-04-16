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
  const [plaidItems, setPlaidItems] = useState([]);
  const [plaidConfigured, setPlaidConfigured] = useState(false);
  const [syncingItems, setSyncingItems] = useState({});
  const [formData, setFormData] = useState(initialForm);

  const loadData = async () => {
    try {
      const [providersResponse, accountsResponse, plaidItemsResponse] = await Promise.all([
        api.get("/connections/providers"),
        api.get("/connections/accounts"),
        api.get("/connections/plaid/items"),
      ]);
      setStatus(providersResponse.data.providers || []);
      setAccounts(accountsResponse.data.accounts || []);
      setPlaidItems(plaidItemsResponse.data.items || []);
      setPlaidConfigured(Boolean(providersResponse.data.plaid_configured));
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

  const syncPlaidItem = async (itemId, silent = false) => {
    try {
      setSyncingItems((prev) => ({ ...prev, [itemId]: true }));
      const response = await api.post(`/connections/plaid/sync-item/${itemId}`);
      const isPending = Boolean(response.data?.sync?.transactions_pending);
      if (!silent) {
        if (isPending) {
          toast.info("Sync started. Transactions are still preparing from institution.");
        } else {
          toast.success("Institution synced successfully");
        }
      }
      await loadData();
      return response.data;
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.detail || "Unable to sync this institution");
      }
      return null;
    } finally {
      setSyncingItems((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const pollUntilTransactionsReady = async (itemId) => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 4000);
      });

      const response = await syncPlaidItem(itemId, true);
      const stillPending = Boolean(response?.sync?.transactions_pending);
      if (!stillPending) {
        toast.success("Plaid transactions finished syncing");
        return;
      }
    }
    toast.info("Transactions are still processing. You can tap Sync later.");
  };

  const handlePlaidConnected = async (connectionResponse) => {
    await loadData();
    const itemId = connectionResponse?.item_id;
    const pending = Boolean(connectionResponse?.sync?.transactions_pending);
    if (itemId && pending) {
      pollUntilTransactionsReady(itemId);
    }
  };

  const unlinkPlaidItem = async (itemId) => {
    try {
      await api.delete(`/connections/plaid/item/${itemId}`);
      toast.success("Institution unlinked successfully");
      await loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Unable to unlink institution");
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
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.16em] text-stone-500" data-testid="plaid-configuration-label">
                Plaid status
              </span>
              <span
                className={`rounded-md px-2 py-1 text-xs ${plaidConfigured ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
                data-testid="plaid-configuration-status"
              >
                {plaidConfigured ? "Configured" : "Missing keys"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PlaidConnectButton onConnected={handlePlaidConnected} />
            <button
              type="button"
              data-testid="plaid-sync-button"
              className="rounded-lg border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100"
              onClick={async () => {
                try {
                  const response = await api.post("/connections/plaid/sync");
                  const pendingCount = Number(response.data?.pending_items || 0);
                  if (pendingCount > 0) {
                    toast.info(`${pendingCount} institution(s) still preparing transactions`);
                  } else {
                    toast.success("Plaid sync complete");
                  }
                  await loadData();
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

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm" data-testid="plaid-institutions-card">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold" data-testid="plaid-institutions-title">Linked institutions</h3>
          <span className="text-xs uppercase tracking-[0.16em] text-stone-500" data-testid="plaid-institutions-count">
            {plaidItems.length} linked
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="plaid-institutions-grid">
          {plaidItems.map((item) => (
            <article
              key={item.item_id}
              className="rounded-md border border-stone-200 p-4"
              data-testid={`plaid-item-card-${item.item_id}`}
            >
              <p className="font-medium" data-testid={`plaid-item-name-${item.item_id}`}>{item.institution_name}</p>
              <p className="mt-1 text-xs text-stone-500" data-testid={`plaid-item-meta-${item.item_id}`}>
                Item ID: {item.item_id}
              </p>
              <p className="mt-1 text-xs text-stone-500" data-testid={`plaid-item-accounts-${item.item_id}`}>
                Accounts: {item.account_count} · Last sync: {item.last_synced_at || "Not synced yet"}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`plaid-item-sync-button-${item.item_id}`}
                  disabled={Boolean(syncingItems[item.item_id])}
                  className="rounded-md bg-[#4A6741] px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                  onClick={() => syncPlaidItem(item.item_id)}
                >
                  {syncingItems[item.item_id] ? "Syncing…" : "Sync now"}
                </button>
                <button
                  type="button"
                  data-testid={`plaid-item-unlink-button-${item.item_id}`}
                  className="rounded-md border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
                  onClick={() => unlinkPlaidItem(item.item_id)}
                >
                  Unlink
                </button>
              </div>
            </article>
          ))}

          {!plaidItems.length && (
            <p className="text-sm text-stone-500" data-testid="plaid-institutions-empty-state">
              No Plaid institutions linked yet.
            </p>
          )}
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
