import { Bot, LayoutDashboard, MessageSquare, Sparkles, Plug, Settings, LogOut, BookOpen, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { WorkspaceSelector } from "@/components/WorkspaceSelector";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { permissions } = usePermissions();
  const { isAdmin, viewSuggestions, viewIntegrations, viewSettings } = permissions;

  const navItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, show: true },
    { title: "Conversas", url: "/conversations", icon: MessageSquare, show: true },
    { title: "Sugestões IA", url: "/suggestions", icon: Sparkles, show: viewSuggestions },
    { title: "Integrações", url: "/integrations", icon: Plug, show: viewIntegrations },
    { title: "Configurações", url: "/settings", icon: Settings, show: viewSettings },
    { title: "Dashboard config", url: "/settings/dashboard", icon: SlidersHorizontal, show: viewSettings },
    { title: "Documentação", url: "/docs", icon: BookOpen, show: true },
    { title: "Admin", url: "/admin", icon: ShieldCheck, show: isAdmin },
  ].filter((i) => i.show);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="p-4 flex items-center gap-2">
        <Bot className="w-7 h-7 text-sidebar-primary shrink-0" />
        {!collapsed && <span className="text-lg font-bold text-sidebar-accent-foreground">VFlowGHL</span>}
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
                      end
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
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

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/login"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                activeClassName=""
              >
                <LogOut className="w-5 h-5 shrink-0" />
                {!collapsed && <span>Sair</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
