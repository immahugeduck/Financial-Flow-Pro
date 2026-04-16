import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const PlaidConnectButton = ({ onConnected }) => {
  const [linkToken, setLinkToken] = useState("");
  const [loading, setLoading] = useState(false);

  const { open, ready } = usePlaidLink({
    token: linkToken || null,
    onSuccess: async (publicToken, metadata) => {
      try {
        const response = await api.post("/connections/plaid/exchange", {
          public_token: publicToken,
          institution_name: metadata?.institution?.name || "Plaid Institution",
        });
        if (response.data?.sync?.transactions_pending) {
          toast.info("Account linked. Transactions are still syncing — retry in progress.");
        } else {
          toast.success("Plaid account linked successfully");
        }
        setLinkToken("");
        onConnected(response.data);
      } catch (error) {
        toast.error(error?.response?.data?.detail || "Failed to connect Plaid account");
      }
    },
    onExit: (error) => {
      if (error) {
        toast.error("Plaid flow exited before completion");
      }
      setLinkToken("");
    },
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [ready, open, linkToken]);

  const initializePlaid = async () => {
    try {
      setLoading(true);
      const response = await api.post("/connections/plaid/link-token");
      setLinkToken(response.data.link_token || "");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Unable to start Plaid connection");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      data-testid="connect-plaid-button"
      onClick={initializePlaid}
      disabled={loading}
      className="rounded-lg bg-[#4A6741] px-5 py-3 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#3D5636] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Preparing Plaid Link…" : "Connect with Plaid"}
    </button>
  );
};
