import { lazy, Suspense, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import PermissionGuard from "@/components/PermissionGuard";
import AppLayout from "./components/AppLayout";
import {
  DashboardSkeleton,
  SuggestionsSkeleton,
  IntegrationsSkeleton,
  ConversationsSkeleton,
  GenericPageSkeleton,
} from "@/components/skeletons/RouteSkeletons";

// Helper: envolve cada rota lazy com seu próprio Suspense fallback
const lazyRoute = (element: ReactNode, fallback: ReactNode) => (
  <Suspense fallback={fallback}>{element}</Suspense>
);

// Auth pages — leves, mantidos eager para evitar flash no login
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// Lazy: rotas pesadas (recharts, listas, integrações, etc.)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Conversations = lazy(() => import("./pages/Conversations"));
const Suggestions = lazy(() => import("./pages/Suggestions"));
const Integrations = lazy(() => import("./pages/Integrations"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const DashboardSettings = lazy(() => import("./pages/DashboardSettings"));
const Workspaces = lazy(() => import("./pages/Workspaces"));
const Admin = lazy(() => import("./pages/Admin"));
const Documentation = lazy(() => import("./pages/Documentation"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

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
              <Route
                path="/onboarding"
                element={<ProtectedRoute>{lazyRoute(<Onboarding />, <GenericPageSkeleton />)}</ProtectedRoute>}
              />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={lazyRoute(<Dashboard />, <DashboardSkeleton />)} />
                <Route path="/conversations" element={lazyRoute(<Conversations />, <ConversationsSkeleton />)} />
                <Route
                  path="/suggestions"
                  element={<PermissionGuard require="viewSuggestions">{lazyRoute(<Suggestions />, <SuggestionsSkeleton />)}</PermissionGuard>}
                />
                <Route
                  path="/integrations"
                  element={<PermissionGuard require="viewIntegrations">{lazyRoute(<Integrations />, <IntegrationsSkeleton />)}</PermissionGuard>}
                />
                <Route
                  path="/settings"
                  element={<PermissionGuard require="viewSettings">{lazyRoute(<SettingsPage />, <GenericPageSkeleton />)}</PermissionGuard>}
                />
                <Route
                  path="/settings/dashboard"
                  element={<PermissionGuard require="viewSettings">{lazyRoute(<DashboardSettings />, <GenericPageSkeleton />)}</PermissionGuard>}
                />
                <Route path="/workspaces" element={lazyRoute(<Workspaces />, <GenericPageSkeleton />)} />
                <Route path="/admin" element={lazyRoute(<Admin />, <GenericPageSkeleton />)} />
                <Route path="/docs" element={lazyRoute(<Documentation />, <GenericPageSkeleton />)} />
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
