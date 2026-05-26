import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import IntegrationStatusWatcher from "@/components/IntegrationStatusWatcher";

const AppLayout = () => {
  // Marca que estamos dentro do app (sidebar presente) para ocultar o
  // toggle de tema flutuante — no app ele vive no rodapé da sidebar.
  useEffect(() => {
    document.documentElement.setAttribute("data-app", "1");
    return () => document.documentElement.removeAttribute("data-app");
  }, []);

  return (
    <SidebarProvider>
      <IntegrationStatusWatcher />
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 h-screen relative">
          <SidebarTrigger className="fixed top-3 left-2 z-50 h-8 w-8" />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
