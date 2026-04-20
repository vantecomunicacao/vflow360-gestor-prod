import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import PermissionGuard from "@/components/PermissionGuard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Conversations from "./pages/Conversations";
import Suggestions from "./pages/Suggestions";
import Integrations from "./pages/Integrations";
import SettingsPage from "./pages/SettingsPage";
import DashboardSettings from "./pages/DashboardSettings";
import Workspaces from "./pages/Workspaces";
import Admin from "./pages/Admin";
import Documentation from "./pages/Documentation";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/conversations" element={<Conversations />} />
                <Route path="/suggestions" element={<PermissionGuard require="viewSuggestions"><Suggestions /></PermissionGuard>} />
                <Route path="/integrations" element={<PermissionGuard require="viewIntegrations"><Integrations /></PermissionGuard>} />
                <Route path="/settings" element={<PermissionGuard require="viewSettings"><SettingsPage /></PermissionGuard>} />
                <Route path="/settings/dashboard" element={<PermissionGuard require="viewSettings"><DashboardSettings /></PermissionGuard>} />
                <Route path="/workspaces" element={<Workspaces />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/docs" element={<Documentation />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
