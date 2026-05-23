import { Outlet } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { User, Building2, Brain, SlidersHorizontal, Plug } from "lucide-react";

const tabs = [
  { to: "/settings/account", label: "Minha Conta", icon: User },
  { to: "/settings/workspace", label: "Workspace", icon: Building2 },
  { to: "/settings/ai", label: "IA", icon: Brain },
  { to: "/settings/dashboard", label: "Dashboard", icon: SlidersHorizontal },
  { to: "/settings/integrations", label: "Integrações", icon: Plug },
];

export default function SettingsLayout() {
  return (
    <div className="flex flex-col md:flex-row gap-6">
      <nav className="md:w-56 shrink-0">
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors whitespace-nowrap"
              activeClassName="bg-accent text-foreground font-medium"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
