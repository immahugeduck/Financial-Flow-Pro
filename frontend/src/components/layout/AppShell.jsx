import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Wallet, ChartPieSlice, ArrowsClockwise, FilePdf } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: ChartPieSlice },
  { to: "/connections", label: "Connections", icon: Wallet },
  { to: "/transactions", label: "Transactions", icon: ArrowsClockwise },
  { to: "/reports", label: "Reports", icon: FilePdf },
];

export const AppShell = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="grain-bg min-h-screen bg-[#FDFBF7] text-stone-900" data-testid="app-shell">
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4 md:px-8 lg:px-12">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500" data-testid="brand-label">
              Aura Finance
            </p>
            <h1 className="text-xl font-bold" data-testid="brand-title">
              Money Management Control Room
            </h1>
          </div>

          <nav className="flex flex-wrap items-center gap-2" data-testid="main-navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-testid={`nav-link-${item.label.toLowerCase()}`}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-transform duration-200 hover:-translate-y-0.5 ${
                      isActive
                        ? "border-[#4A6741] bg-[#4A6741] text-white"
                        : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                    }`
                  }
                >
                  <Icon size={18} /> {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-3" data-testid="user-menu">
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
              <p className="font-medium" data-testid="current-user-name">{user?.full_name || "User"}</p>
              <p className="text-xs text-stone-500" data-testid="current-user-email">{user?.email}</p>
            </div>
            <button
              type="button"
              data-testid="logout-button"
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-8 md:px-8 lg:px-12">
        <Outlet />
      </main>
    </div>
  );
};
