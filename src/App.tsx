import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PendingUsersProvider } from "@/contexts/PendingUsersContext";
import { CustomerCareProvider } from "@/contexts/CustomerCareContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Developers from "./pages/Clients";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import CustomerCare from "./pages/CustomerCare";
import ResetPassword from "./pages/ResetPassword";

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Login />;

  return (
    <PendingUsersProvider>
    <CustomerCareProvider>
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/users" element={<Users />} />
        <Route path="/customer-care" element={<CustomerCare />} />
      </Routes>
    </AppLayout>
    </CustomerCareProvider>
    </PendingUsersProvider>
  );
}

const App = () => (
  <TooltipProvider>
    <Sonner />
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </TooltipProvider>
);

export default App;
