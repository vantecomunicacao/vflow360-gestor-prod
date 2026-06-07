import { LayoutDashboard, MessageSquare, Sparkles, Plug, Settings, LogOut, BookOpen, ShieldCheck, ScrollText } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { WorkspaceSelector } from "@/components/WorkspaceSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePermissions, isSuggestionsOnly } from "@/contexts/PermissionsContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { permissions } = usePermissions();
  const { isAdmin, viewSuggestions, viewIntegrations, viewSettings } = permissions;
  // Vendedor (so sugestoes) nao ve os itens de gestor no menu.
  const gestor = !isSuggestionsOnly(permissions);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const navItems: { title: string; url: string; icon: typeof LayoutDashboard; show: boolean; end?: boolean }[] = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, show: gestor },
    { title: "Conversas", url: "/conversations", icon: MessageSquare, show: gestor },
    { title: "Sugestões IA", url: "/suggestions", icon: Sparkles, show: viewSuggestions },
    { title: "Integrações", url: "/integrations", icon: Plug, show: viewIntegrations },
    { title: "Documentação", url: "/docs", icon: BookOpen, show: gestor },
    { title: "Admin", url: "/admin", icon: ShieldCheck, show: isAdmin },
    { title: "Logs", url: "/admin/logs", icon: ScrollText, show: isAdmin },
  ].filter((i) => i.show);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="px-4 py-5 flex items-center justify-between gap-2">
        {collapsed ? (
          /* Símbolo "V" recortado do logo p/ a sidebar colapsada */
          <div className="w-7 h-7 overflow-hidden shrink-0" aria-label="VFlow360">
            <img
              src="/vflow360-logo-escuro.png"
              alt="VFlow360"
              className="h-7 max-w-none"
              style={{ objectFit: "cover", objectPosition: "left center", width: "auto" }}
            />
          </div>
        ) : (
          <>
            <img src="/vflow360-logo-escuro.png" alt="VFlow360" className="h-7 w-auto" />
            <SidebarTrigger className="h-7 w-7 shrink-0 text-sidebar-foreground border border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          </>
        )}
      </div>

      {/* Workspace Selector */}
      <div className="px-3 pb-3">
        <WorkspaceSelector collapsed={collapsed} />
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.end !== false}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="gradient-primary text-white font-bold shadow-brand"
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 gap-2">
        <div className={collapsed ? "flex justify-center" : "px-1"}>
          <ThemeToggle placement="inline" />
        </div>
        <SidebarMenu>
          {viewSettings && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink
                  to="/settings"
                  end={false}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <Settings className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>Configurações</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
