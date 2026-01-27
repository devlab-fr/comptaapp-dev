import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import AppPage from './pages/AppPage';
import CreateCompanyPage from './pages/CreateCompanyPage';
import CompanyPage from './pages/CompanyPage';
import AddExpensePage from './pages/AddExpensePage';
import AddRevenuePage from './pages/AddRevenuePage';
import EditExpensePage from './pages/EditExpensePage';
import EditRevenuePage from './pages/EditRevenuePage';
import ExpensesPage from './pages/ExpensesPage';
import RevenuesPage from './pages/RevenuesPage';
import ViewTVAPage from './pages/ViewTVAPage';
import CompteDeResultatPage from './pages/CompteDeResultatPage';
import BilanPage from './pages/BilanPage';
import ParametresEntreprisePage from './pages/ParametresEntreprisePage';
import RapportsPage from './pages/RapportsPage';
import UserGuidePage from './pages/UserGuidePage';
import VerificationV1Page from './pages/VerificationV1Page';
import { ComptabilitePage } from './pages/ComptabilitePage';
import { AiScanPage } from './pages/AiScanPage';
import SubscriptionPage from './pages/SubscriptionPage';
import BillingSuccessPage from './pages/BillingSuccessPage';
import BillingCancelPage from './pages/BillingCancelPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import MentionsLegalesPage from './pages/MentionsLegalesPage';
import CguPage from './pages/CguPage';
import CgvPage from './pages/CgvPage';
import ConfidentialitePage from './pages/ConfidentialitePage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/legal/mentions-legales" element={<MentionsLegalesPage />} />
          <Route path="/legal/cgu" element={<CguPage />} />
          <Route path="/legal/cgv" element={<CgvPage />} />
          <Route path="/legal/confidentialite" element={<ConfidentialitePage />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/create-company"
            element={
              <ProtectedRoute>
                <CreateCompanyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId"
            element={
              <ProtectedRoute>
                <CompanyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/ai-scan"
            element={
              <ProtectedRoute>
                <AiScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/expenses"
            element={
              <ProtectedRoute>
                <ExpensesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/expenses/new"
            element={
              <ProtectedRoute>
                <AddExpensePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/revenues"
            element={
              <ProtectedRoute>
                <RevenuesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/revenues/new"
            element={
              <ProtectedRoute>
                <AddRevenuePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/expenses/:documentId/edit"
            element={
              <ProtectedRoute>
                <EditExpensePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/revenues/:documentId/edit"
            element={
              <ProtectedRoute>
                <EditRevenuePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/tva"
            element={
              <ProtectedRoute>
                <ViewTVAPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/resultat"
            element={
              <ProtectedRoute>
                <CompteDeResultatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/bilan"
            element={
              <ProtectedRoute>
                <BilanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/rapports"
            element={
              <ProtectedRoute>
                <RapportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/parametres"
            element={
              <ProtectedRoute>
                <ParametresEntreprisePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/guide"
            element={
              <ProtectedRoute>
                <UserGuidePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/verification"
            element={
              <ProtectedRoute>
                <VerificationV1Page />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/comptabilite"
            element={
              <ProtectedRoute>
                <ComptabilitePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/subscription"
            element={
              <ProtectedRoute>
                <SubscriptionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/company/:companyId/subscription"
            element={
              <ProtectedRoute>
                <SubscriptionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing/success"
            element={
              <ProtectedRoute>
                <BillingSuccessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing/cancel"
            element={
              <ProtectedRoute>
                <BillingCancelPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/app" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
