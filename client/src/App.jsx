import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Layout } from './components/layout/Layout.jsx';
import { Loading } from './components/ui';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/customers/Customers.jsx';
import CustomerForm from './pages/customers/CustomerForm.jsx';
import CustomerDetail from './pages/customers/CustomerDetail.jsx';
import Categories from './pages/Categories.jsx';
import Items from './pages/items/Items.jsx';
import ItemForm from './pages/items/ItemForm.jsx';
import ItemDetail from './pages/items/ItemDetail.jsx';
import AddSale from './pages/sales/AddSale.jsx';
import SalesHistory from './pages/sales/SalesHistory.jsx';
import Invoice from './pages/sales/Invoice.jsx';
import Reports from './pages/Reports.jsx';
import SettingsPage from './pages/Settings.jsx';
import ChangePassword from './pages/ChangePassword.jsx';

function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="Starting up…" />;
  if (status !== 'in') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function NotFound() {
  return (
    <div className="card p-10 text-center">
      <h1>Page not found</h1>
      <p className="mt-2 text-ink-soft">This page does not exist. Please use the menu on the left.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/new" element={<CustomerForm />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/edit" element={<CustomerForm />} />
        <Route path="categories" element={<Categories />} />
        <Route path="items" element={<Items />} />
        <Route path="items/new" element={<ItemForm />} />
        <Route path="items/:id" element={<ItemDetail />} />
        <Route path="items/:id/edit" element={<ItemForm />} />
        <Route path="sales" element={<SalesHistory />} />
        <Route path="sales/new" element={<AddSale />} />
        <Route path="sales/:id" element={<Invoice />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
