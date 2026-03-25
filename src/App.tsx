import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import AppLayout from './components/AppLayout';
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
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import FacturesPage from './pages/FacturesPage';
import CreateFacturePage from './pages/CreateFacturePage';
import EditFacturePage from './pages/EditFacturePage';
import ViewFacturePage from './pages/ViewFacturePage';
import HistoryImportPage from './pages/HistoryImportPage';
import CheckEmailPage from './pages/CheckEmailPage';
import BankPage from './pages/BankPage';
import TreasuryPage from './pages/TreasuryPage';
import LandingPage from './pages/LandingPage';

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />
          <Route path="/legal/mentions-legales" element={<MentionsLegalesPage />} />
          <Route path="/legal/cgu" element={<CguPage />} />
          <Route path="/legal/cgv" element={<CgvPage />} />
          <Route path="/legal/confidentialite" element={<ConfidentialitePage />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AppPage />} />
            <Route path="create-company" element={<CreateCompanyPage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route path="company/:companyId" element={<CompanyPage />} />
            <Route path="company/:companyId/ai-scan" element={<AiScanPage />} />
            <Route path="company/:companyId/expenses" element={<ExpensesPage />} />
            <Route path="company/:companyId/expenses/new" element={<AddExpensePage />} />
            <Route path="company/:companyId/expenses/:documentId/edit" element={<EditExpensePage />} />
            <Route path="company/:companyId/revenues" element={<RevenuesPage />} />
            <Route path="company/:companyId/revenues/new" element={<AddRevenuePage />} />
            <Route path="company/:companyId/revenues/:documentId/edit" element={<EditRevenuePage />} />
            <Route path="company/:companyId/tva" element={<ViewTVAPage />} />
            <Route path="company/:companyId/resultat" element={<CompteDeResultatPage />} />
            <Route path="company/:companyId/bilan" element={<BilanPage />} />
            <Route path="company/:companyId/rapports" element={<RapportsPage />} />
            <Route path="company/:companyId/parametres" element={<ParametresEntreprisePage />} />
            <Route path="company/:companyId/reprise-historique" element={<HistoryImportPage />} />
            <Route path="company/:companyId/guide" element={<UserGuidePage />} />
            <Route path="company/:companyId/verification" element={<VerificationV1Page />} />
            <Route path="company/:companyId/comptabilite" element={<ComptabilitePage />} />
            <Route path="company/:companyId/factures" element={<FacturesPage />} />
            <Route path="company/:companyId/factures/create" element={<CreateFacturePage />} />
            <Route path="company/:companyId/factures/:factureId" element={<ViewFacturePage />} />
            <Route path="company/:companyId/factures/:factureId/edit" element={<EditFacturePage />} />
            <Route path="company/:companyId/banque" element={<BankPage />} />
            <Route path="company/:companyId/tresorerie" element={<TreasuryPage />} />
            <Route path="company/:companyId/subscription" element={<SubscriptionPage />} />
          </Route>
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
          <Route path="/" element={<LandingPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
