import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';
import { getInstitutionName } from '../config/university';
import { useNotifications } from '../context/NotificationContext';
import { QrCode, ShieldCheck, Lock, RefreshCw, AlertTriangle, CheckCircle2, UserCheck, Shield, Clock } from 'lucide-react';

export const DigitalIdentity: React.FC = () => {
  const { tenant, user, switchDemoRole } = useAuth();
  const { addNotification } = useNotifications();

  const [cardData, setCardData] = useState<any | null>(null);
  const [qrImage, setQrImage] = useState('');
  const [cardError, setCardError] = useState('');
  const [qrError, setQrError] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [loading, setLoading] = useState(true);
  const [certInput, setCertInput] = useState('');
  const [certChecking, setCertChecking] = useState(false);
  const [certVerified, setCertVerified] = useState<any | null>(null);

  useEffect(() => {
    fetchCard();
  }, [tenant, user]);

  useEffect(() => {
    let cancelled = false;
    const token = cardData?.dynamicQR?.token;
    if (!token) {
      setQrImage('');
      return;
    }

    QRCode.toDataURL(token, { width: 224, margin: 1, errorCorrectionLevel: 'M' })
      .then((image) => {
        if (!cancelled) {
          setQrImage(image);
          setQrError('');
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to render university ID QR code:', error);
        if (!cancelled) setQrError('Could not render the live QR code. Refresh to try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [cardData?.dynamicQR?.token]);

  // Countdown timer for 60s dynamic QR code
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          fetchCard();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const fetchCard = async () => {
    setCardError('');
    try {
      const res = await fetch('/api/identity/card', {
        headers: {
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `ID service failed (${res.status})`);
      setCardData(data);
      setSecondsRemaining(data.dynamicQR?.expiresInSeconds || 60);
    } catch (error) {
      console.error('Unable to load university ID:', error);
      setCardError(error instanceof Error ? error.message : 'Unable to load your university ID.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCardStatus = async (newStatus: 'ACTIVE' | 'DEACTIVATED') => {
    try {
      const res = await fetch('/api/identity/toggle-card-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || `Card update failed (${res.status})`);
      }

      addNotification(
        `Smart Card ${newStatus === 'DEACTIVATED' ? 'Suspended' : 'Reactivated'}`,
        `Card status updated. Turnstile gate checks will use the new status.`,
        newStatus === 'DEACTIVATED' ? 'WARNING' : 'SUCCESS'
      );
      await fetchCard();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Card status update failed.';
      setCardError(message);
    }
  };

  const handleVerifyCert = async () => {
    setCertChecking(true);
    setCertVerified(null);
    try {
      const response = await fetch('/api/identity/verify-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          Authorization: 'Bearer ' + localStorage.getItem('smart_campus_token')
        },
        body: JSON.stringify({ credential: certInput.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.valid) {
        setCertVerified({ valid: false, message: data.message || data.error || 'Certificate was not found in the institutional registry.' });
        return;
      }
      setCertVerified({ valid: true, ...data.certificate, issuer: getInstitutionName(tenant?.id, tenant?.name) });
    } catch (error) {
      setCertVerified({ valid: false, message: error instanceof Error ? error.message : 'Certificate verification failed.' });
    } finally {
      setCertChecking(false);
    }
  };

  const isCardActive = cardData?.user?.card_status === 'ACTIVE';
  const canReactivateCard = ['UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'].includes(user?.role || '');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <QrCode className="w-6 h-6 text-campus-600" />
            Central Digital Identity & Smart ID Card
          </h2>
          <p className="text-xs text-slate-500">
            Module 17: Unique University ID, dynamic cryptographic anti-screenshot QR tokens & remote lock
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fetchCard}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh ID
          </button>
          <button
            type="button"
            onClick={() => handleToggleCardStatus(isCardActive ? 'DEACTIVATED' : 'ACTIVE')}
            disabled={!isCardActive && !canReactivateCard}
            title={!isCardActive && !canReactivateCard ? 'Contact campus administration to reactivate this card.' : undefined}
            className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all ${
              isCardActive
                ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>{isCardActive ? 'Deactivate / Lost Card Lock' : canReactivateCard ? 'Reactivate Smart ID Card' : 'Contact admin to reactivate'}</span>
          </button>
        </div>
      </div>

      {cardError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {cardError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Official Digital University ID Card (Front & Dynamic QR) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-campus-900 via-campus-800 to-indigo-950 text-white p-6 sm:p-8 shadow-2xl border border-white/10">
            {/* Card Watermark */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-10 pointer-events-none flex items-center justify-center font-black text-9xl">
              ID
            </div>

            {/* Top Bar of ID Card */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white text-campus-900 flex items-center justify-center font-black text-lg">
                  {getInstitutionName(tenant?.id, tenant?.name).charAt(0)}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base leading-tight tracking-wide">
                    {getInstitutionName(tenant?.id, tenant?.name)}
                  </h3>
                  <span className="text-[10px] text-campus-200 font-mono tracking-widest uppercase">
                    Official Institutional Smart Credential
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase font-mono ${
                  isCardActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/30 text-red-300 border border-red-500/30'
                }`}>
                  {cardData?.user?.card_status || 'ACTIVE'}
                </span>
              </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              {/* Photo & University ID */}
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                <div className="relative">
                  <img
                    src={user?.photo_url || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200'}
                    alt="Student ID Portrait"
                    className="w-28 h-28 rounded-2xl object-cover border-2 border-white/30 shadow-xl"
                  />
                  <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-campus-900" />
                </div>
                <div className="mt-3 font-mono font-bold text-sm text-amber-300">
                  {user?.university_id}
                </div>
              </div>

              {/* Bio & Department Info */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] text-campus-200 uppercase tracking-wider block">Full Name</span>
                  <span className="text-base font-extrabold text-white">{user?.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-campus-200 uppercase tracking-wider block">Department & Role</span>
                  <span className="font-semibold text-slate-100">{user?.department} • {user?.role}</span>
                </div>
                <div>
                  <span className="text-[10px] text-campus-200 uppercase tracking-wider block">Authorized Access Zones</span>
                  <span className="text-[11px] text-campus-200">Academic Block, Library, Sports Arena, Cafeteria</span>
                </div>
              </div>

              {/* Dynamic 60-Second Cryptographic QR Code */}
              <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white text-slate-900 text-center shadow-lg">
                <div className="w-28 h-28 rounded-xl bg-white border border-slate-300 flex items-center justify-center relative p-1.5 overflow-hidden">
                  {qrImage ? (
                    <img src={qrImage} alt="Live, scannable university ID QR code" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-[9px] text-slate-500">
                      <QrCode className="h-8 w-8" />
                      {loading ? 'Loading ID...' : 'QR unavailable'}
                    </div>
                  )}
                </div>

                <div className="mt-2 text-[10px] font-mono text-slate-600 flex items-center gap-1 font-bold">
                  <Clock className="w-3 h-3 text-campus-600" />
                  Regenerates in: <span className="text-campus-700">{secondsRemaining}s</span>
                </div>
                <span className="text-[9px] text-slate-400 font-mono">HMAC-SHA256 Signed</span>
                {qrError && <span role="alert" className="mt-1 text-[9px] text-red-600">{qrError}</span>}
              </div>
            </div>

            {/* Anti-fraud security footer */}
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] text-campus-200">
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-campus-400" /> Short-lived, single-use QR credential
              </span>
              <span className="font-mono">QR Token Fingerprint: {cardData?.dynamicQR?.token?.slice(0, 16)}...</span>
            </div>
          </div>
        </div>

        {/* Right Column: Digital Certificate Online Verifier (Module 17) */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Institutional Certificate Registry
            </h3>
            <p className="text-xs text-slate-500">
              Search the signed-in institution's registry by certificate ID or SHA-256 hash. This is a database lookup, not a blockchain service.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Certificate ID or SHA-256 hash</label>
                <textarea
                  rows={2}
                  value={certInput}
                  onChange={(e) => setCertInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono text-[11px] text-slate-800"
                />
              </div>

              <button
                onClick={handleVerifyCert}
                disabled={certChecking || !certInput.trim()}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs disabled:opacity-50"
              >
                {certChecking ? 'Checking registry…' : 'Validate certificate in registry'}
              </button>

              {certVerified && (
                <div className={`p-4 rounded-2xl text-xs space-y-1.5 border animate-in fade-in ${
                  certVerified.valid ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-red-50 border-red-200 text-red-950'
                }`}>
                  <div className="font-bold flex items-center gap-1.5 text-sm">
                    {certVerified.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                    {certVerified.valid ? 'Certificate is registered' : 'Certificate not verified'}
                  </div>
                  {!certVerified.valid && <div>{certVerified.message}</div>}
                  <div>Student: <strong>{certVerified.student}</strong> ({certVerified.universityId})</div>
                  <div>Certificate: <strong>{certVerified.title}</strong></div>
                  <div>Type: <strong>{certVerified.type}</strong> · Issued: {certVerified.issueDate}</div>
                  <div className="text-[11px] text-slate-600">Issuer: {certVerified.issuer}</div>
                  <div className="break-all text-[10px] text-slate-500">Hash: {certVerified.cryptographicHash}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
