import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { EventScheduleSidebar } from "@/components/EventScheduleSidebar";
import Index from "./pages/Index";
import Login from "./pages/Login";
import UserManagement from "./pages/UserManagement";
import Trust from "./pages/Trust";
import NotFound from "./pages/NotFound";
import { lazy, Suspense } from "react";

// Página pesada (modelo oficial + motor OOXML): carregada só quando aberta.
const EventDocuments = lazy(() => import("./pages/EventDocuments"));
const eventDocuments = (group: "old" | "new") => (
  <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Carregando...</p>}>
    <EventDocuments group={group} />
  </Suspense>
);

const queryClient = new QueryClient();

function AppRoutes() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={auth.signIn} />} />
        <Route path="/trust" element={<Trust />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <EventScheduleSidebar canEdit={auth.can("schedule.edit")} />
        <div className="flex-1 flex flex-col min-w-0">
          <Routes>
            <Route path="/" element={<Index auth={auth} realm="br" />} />
            <Route path="/turco" element={<Index auth={auth} realm="turco" />} />
            {auth.can("users.manage") && (
              <Route path="/users" element={<UserManagement />} />
            )}
            {auth.can("events.access") && <Route path="/eventos" element={eventDocuments("old")} />}
            {auth.can("events.access") && <Route path="/eventos/novos" element={eventDocuments("new")} />}
            {auth.can("events.access") && <Route path="/eventos/:id" element={eventDocuments("old")} />}
            <Route path="/trust" element={<Trust />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
