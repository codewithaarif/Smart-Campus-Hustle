import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { useNotifications } from '../context/NotificationContext';
import { 
  Smartphone, Wifi, WifiOff, Download, QrCode, ShieldAlert, 
  CheckCircle2, RefreshCw, KeyRound, AlertTriangle 
} from 'lucide-react';

export const MobileOfflinePWA: React.FC = () => {
  const { tenant, user } = useAuth();
  const { isOnline, syncing, syncQueue, queueAction, syncPendingQueue } = useOffline();
  const { addNotification } = useNotifications();

  const [emergencyResult, setEmergencyResult] = useState<any | null>(null);
  const [officerPin, setOfficerPin] = useState('');
  const [dualWitness, setDualWitness] = useState('');
  const [studentUniversityId, setStudentUniversityId] = useState('');

  const handleTestQueueOfflineItem = () => {
    queueAction('OFFLINE_DRAFT_MAINTENANCE', {
      title: 'Water dispenser empty in Library 2nd floor',
      description: 'Water dispenser is empty and requires a refill or maintenance inspection.',
      category: 'OTHER',
      location: 'Library, second floor',
      timestamp: new Date().toISOString()
    });
    addNotification('Maintenance Draft Queued', 'The draft is stored locally and will be sent when the device is online.', 'INFO');
    if (isOnline) void syncPendingQueue();
  };

  const handleSimulateOutageOverride = async () => {
    try {
      const res = await fetch('/api/mobile/emergency-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          Authorization: 'Bearer ' + localStorage.getItem('smart_campus_token')
        },
        body: JSON.stringify({
          dualWitnessId: dualWitness,
          officerPin,
          reason: 'Severe network lightning strike emergency protocol',
          studentUniversityId
        })
      });

      const data = await res.json();
      setEmergencyResult(data);
      if (data.success) {
        addNotification('Emergency Override Recorded', data.message + ' No physical gate hardware is connected to this portal.', 'SUCCESS');
      }
    } catch (err: any) {
      alert('Override call failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-campus-600" />
            Mobile PWA & Offline Gate Pass Protocol
          </h2>
          <p className="text-xs text-slate-500">
            Module 20: Offline app shell, retained drafts, authenticated synchronization, and live-only gate credential checks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
            isOnline ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-amber-600" />}
            {isOnline ? 'Network Connected (Live Verification)' : 'Offline (public app shell only)'}
          </span>
        </div>
      </div>

      {/* Critical Gate Pass Security Rule Callout */}
      <div className="bg-red-50 border-2 border-red-300 rounded-3xl p-6 text-red-950 space-y-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" />
          <h3 className="font-extrabold text-sm sm:text-base text-red-900">
            MANDATORY GATE PASS SECURITY SPECIFICATION (Module 20)
          </h3>
        </div>
        <p className="text-xs leading-relaxed text-red-800">
          <strong>Security Mandate:</strong> Never treat an offline cached permission as proof of a currently valid gate pass. All gate turnstiles must verify cryptographic passes directly against the server when connectivity is available. If an institution-wide internet or power outage occurs, a separate controlled emergency procedure requiring <strong>dual-officer credentials</strong> is strictly enforced.
        </p>
      </div>

      {/* Two Column Grid: PWA Offline Capabilities & Controlled Outage Protocol */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Offline Caching & Queue */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">Offline Cache & Background Sync Queue</h3>
          <p className="text-xs text-slate-500">The application shell is cached; authenticated campus records remain online-only</p>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Application Shell</div>
                <div className="text-[11px] text-slate-500">App interface and public static assets</div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                App Shell
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Visual Digital Student ID</div>
                <div className="text-[11px] text-slate-500">ID details and gate verification require a live server connection</div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                Online Only
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Private Campus Records</div>
                <div className="text-[11px] text-slate-500">Retrieved from the server after sign-in; not cached offline</div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                Online Only
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">Sync Queue: {syncQueue.length} pending operations{syncing ? ' · syncing…' : ''}</span>
            <button
              onClick={handleTestQueueOfflineItem}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"
            >
              Enqueue Maintenance Draft
            </button>
            <button
              onClick={() => void syncPendingQueue()}
              disabled={!isOnline || syncing || syncQueue.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-campus-50 hover:bg-campus-100 text-campus-800 font-bold disabled:opacity-40"
            >
              Sync now
            </button>
          </div>
        </div>

        {/* Right: Emergency Outage Gate Passage Simulator */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-red-600" />
            Server-Verified Emergency Override
          </h3>
          <p className="text-xs text-slate-500">
            Dual-officer check that requires the campus API and database to be reachable; this is not an offline hardware override
          </p>

          <div className="space-y-3 text-xs">
            <p className="text-[11px] text-amber-700">Available only to signed-in security guards and authorized administrators. Configure the emergency PIN on the server; do not share it with students.</p>
            <div>
              <label className="font-medium text-slate-700 block mb-1">Student University ID</label>
              <input
                type="text"
                readOnly
                value={studentUniversityId}
                onChange={(e) => setStudentUniversityId(e.target.value)}
                placeholder="Enter student university ID"
                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-medium text-slate-700 block mb-1">Witness Officer ID</label>
                <input
                  type="text"
                  value={dualWitness}
                  onChange={(e) => setDualWitness(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">Emergency Override PIN</label>
                <input
                  type="password"
                  value={officerPin}
                  onChange={(e) => setOfficerPin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleSimulateOutageOverride}
              className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20"
            >
              Execute Dual-Officer Emergency Gate Passage
            </button>

            {emergencyResult && (
              <div className={`p-4 rounded-2xl text-xs border ${
                emergencyResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-red-50 border-red-200 text-red-950'
              }`}>
                <div className="font-bold text-sm mb-1">
                  {emergencyResult.success ? 'Emergency Clearance Authorized' : 'Clearance Rejected'}
                </div>
                <div>{emergencyResult.message}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
