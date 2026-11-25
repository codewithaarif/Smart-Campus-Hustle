import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { getInstitutionName } from './config/university';
import { Header } from './components/common/Header';
import { Sidebar, NavTab } from './components/common/Sidebar';
import { AIAssistantWidget } from './components/ai/AIAssistantWidget';
import { QRScannerModal } from './components/qr/QRScannerModal';
import { SOSConfirmModal } from './components/emergency/SOSConfirmModal';

// Dedicated view pages for the integrated campus modules
import { Dashboard } from './pages/Dashboard';
import { AcademicHub } from './pages/AcademicHub';
import { MewarDirectory } from './pages/MewarDirectory';
import { SafetyEmergency } from './pages/SafetyEmergency';
import { VisitorManagement } from './pages/VisitorManagement';
import { MaintenanceView } from './pages/MaintenanceView';
import { FinancePortal } from './pages/FinancePortal';
import { DigitalLibrary } from './pages/DigitalLibrary';
import { SmartTransport } from './pages/SmartTransport';
import { AIAssistantView } from './pages/AIAssistantView';
import { PlacementCareer } from './pages/PlacementCareer';
import { EventsClubs } from './pages/EventsClubs';
import { CafeteriaMess } from './pages/CafeteriaMess';
import { ResourceBooking } from './pages/ResourceBooking';
import { AlumniNetwork } from './pages/AlumniNetwork';
import { LostFoundPortal } from './pages/LostFoundPortal';
import { DigitalIdentity } from './pages/DigitalIdentity';
import { GrievanceDesk } from './pages/GrievanceDesk';
import { MultiCampusSaaS } from './pages/MultiCampusSaaS';
import { MobileOfflinePWA } from './pages/MobileOfflinePWA';
import { WorkflowAutomation } from './pages/WorkflowAutomation';
import { SecurityGovernance } from './pages/SecurityGovernance';

import { 
  Menu, QrCode, ShieldAlert, Sparkles, LayoutDashboard, 
  GraduationCap, CreditCard, UserCheck 
} from 'lucide-react';

export const App: React.FC = () => {
  const { user, tenant, loading, login } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInMfaCode, setSignInMfaCode] = useState('');
  const [signInError, setSignInError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  // Global Modals State
  const [showSOSModal, setShowSOSModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showAICopilot, setShowAICopilot] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-campus-600 flex items-center justify-center font-black text-xl animate-pulse mb-3">
          MU
        </div>
        <div className="text-sm font-semibold tracking-wide">Loading {getInstitutionName(tenant?.id, tenant?.name)} portal...</div>
        <div className="text-xs text-slate-400 mt-1">Loading the integrated campus portal</div>
      </div>
    );
  }

  if (!user) {
    const handleSignIn = async (event: React.FormEvent) => {
      event.preventDefault();
      setSigningIn(true);
      setSignInError('');
      const success = await login(signInEmail, signInPassword, tenant?.id || 'tenant_apex', signInMfaCode);
      if (!success) {
        setSignInError('Sign-in failed. Check your credentials and any required authenticator code.');
      }
      setSigningIn(false);
    };

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <form onSubmit={handleSignIn} className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-campus-600 text-white flex items-center justify-center font-black">MU</div>
            <div>
              <h1 className="text-xl font-black text-slate-900">Smart Campus Hustle</h1>
              <p className="text-xs text-slate-500">{getInstitutionName(tenant?.id, tenant?.name)} Student &amp; Campus Portal</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">University email</label>
            <input
              type="email"
              required
              value={signInEmail}
              onChange={(event) => setSignInEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-campus-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={signInPassword}
              onChange={(event) => setSignInPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-campus-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Authenticator code (for MFA-enabled accounts)</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={signInMfaCode}
              onChange={(event) => setSignInMfaCode(event.target.value.replace(/\\D/g, '').slice(0, 6))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-campus-500"
            />
          </div>
          {signInError && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{signInError}</p>}
          <button
            type="submit"
            disabled={signingIn}
            className="w-full rounded-xl bg-campus-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {signingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentTab} onOpenSOS={() => setShowSOSModal(true)} onOpenScanner={() => setShowScannerModal(true)} />;
      case 'university':
        return <MewarDirectory />;
      case 'academic':
        return <AcademicHub />;
      case 'emergency':
        return <SafetyEmergency onOpenSOSModal={() => setShowSOSModal(true)} />;
      case 'visitors':
        return <VisitorManagement />;
      case 'maintenance':
        return <MaintenanceView />;
      case 'finance':
        return <FinancePortal />;
      case 'library':
        return <DigitalLibrary />;
      case 'transport':
        return <SmartTransport />;
      case 'ai-assistant':
      case 'analytics':
        return <AIAssistantView />;
      case 'placement':
        return <PlacementCareer />;
      case 'events':
        return <EventsClubs />;
      case 'cafeteria':
        return <CafeteriaMess />;
      case 'resources':
        return <ResourceBooking />;
      case 'alumni':
        return <AlumniNetwork />;
      case 'lost-found':
        return <LostFoundPortal />;
      case 'identity':
        return <DigitalIdentity />;
      case 'grievance':
        return <GrievanceDesk />;
      case 'saas':
        return <MultiCampusSaaS />;
      case 'mobile-pwa':
        return <MobileOfflinePWA />;
      case 'automation':
        return <WorkflowAutomation />;
      case 'security':
        return <SecurityGovernance />;
      default:
        return <Dashboard onNavigate={setCurrentTab} onOpenSOS={() => setShowSOSModal(true)} onOpenScanner={() => setShowScannerModal(true)} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-campus-500 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      {/* Main App Layout Shell */}
      <div className="lg:pl-72 flex-1 flex flex-col min-w-0 transition-all">
        {/* Top Header */}
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md">
          {/* Mobile Top Bar */}
          <div className="lg:hidden px-4 py-2 border-b border-slate-100 flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="font-extrabold text-slate-900 text-sm">{getInstitutionName(tenant?.id, tenant?.name)}</div>
            <button
              onClick={() => setShowSOSModal(true)}
              className="p-1.5 rounded-lg bg-red-600 text-white font-bold text-xs"
            >
              SOS
            </button>
          </div>

          <Header
            onOpenSOSModal={() => setShowSOSModal(true)}
            onOpenQRScanner={() => setShowScannerModal(true)}
            onToggleAICopilot={() => setShowAICopilot(!showAICopilot)}
          />
        </div>

        {/* Viewport Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-12">
          {renderActiveView()}
        </main>
      </div>

      {/* Bottom Mobile PWA Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2 z-40 flex items-center justify-around text-[10px] font-semibold text-slate-500 shadow-lg">
        <button
          onClick={() => setCurrentTab('dashboard')}
          className={`flex flex-col items-center gap-0.5 ${currentTab === 'dashboard' ? 'text-campus-600 font-bold' : ''}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => setCurrentTab('academic')}
          className={`flex flex-col items-center gap-0.5 ${currentTab === 'academic' ? 'text-campus-600 font-bold' : ''}`}
        >
          <GraduationCap className="w-5 h-5" />
          <span>Classes</span>
        </button>

        <button
          onClick={() => setShowScannerModal(true)}
          className="flex flex-col items-center gap-0.5 -mt-5"
        >
          <div className="w-12 h-12 rounded-full bg-campus-600 text-white flex items-center justify-center shadow-lg shadow-campus-600/30">
            <QrCode className="w-6 h-6" />
          </div>
          <span>Scan Gate</span>
        </button>

        <button
          onClick={() => setCurrentTab('finance')}
          className={`flex flex-col items-center gap-0.5 ${currentTab === 'finance' ? 'text-campus-600 font-bold' : ''}`}
        >
          <CreditCard className="w-5 h-5" />
          <span>Fees</span>
        </button>

        <button
          onClick={() => setShowAICopilot(true)}
          className="flex flex-col items-center gap-0.5 text-indigo-600"
        >
          <Sparkles className="w-5 h-5" />
          <span>AI Chat</span>
        </button>
      </div>

      {/* Floating AI Assistant Widget */}
      <AIAssistantWidget
        isOpen={showAICopilot}
        onClose={() => setShowAICopilot(false)}
      />

      {/* QR Scanner / Turnstile Modal */}
      <QRScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
      />

      {/* 1-Tap SOS Dispatch Confirmation Modal */}
      <SOSConfirmModal
        isOpen={showSOSModal}
        onClose={() => setShowSOSModal(false)}
      />
    </div>
  );
};
