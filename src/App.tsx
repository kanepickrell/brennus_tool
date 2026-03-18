// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard   from "./pages/Dashboard";
import NewCampaign from "./pages/NewCampaign";
import Index       from "./pages/Index";         // existing canvas builder
import NotFound    from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Campaign dashboard — operator home */}
          <Route path="/"              element={<Dashboard />} />

          {/* New campaign wizard */}
          <Route path="/new"           element={<NewCampaign />} />

          {/* Campaign builder canvas — receives campaign config via localStorage */}
          <Route path="/campaign/:id"  element={<Index />} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*"              element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;