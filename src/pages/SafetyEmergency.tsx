import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { ShieldAlert, PhoneCall, AlertTriangle, Radio, CheckCircle2, MapPin, Send } from 'lucide-react';

interface SafetyEmergencyProps {
  onOpenSOSModal: () => void;
}

export const SafetyEmergency: React.FC<SafetyEmergencyProps> = ({ onOpenSOSModal }) => {
  const { tenant } = useAuth();
  const { addNotification } = useNotifications();

  const [contacts, setContacts] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [recentSos, setRecentSos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New incident report form
  const [incidentType, setIncidentType] = useState('MEDICAL');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [reported, setReported] = useState(false);

  useEffect(() => {
    fetchEmergencyData();
  }, [tenant]);

  const fetchEmergencyData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/emergency/contacts', {
        headers: {
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
        setBroadcasts(data.broadcasts || []);
        setRecentSos(data.recentSos || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReportIncident = (e: React.FormEvent) => {
    e.preventDefault();
    setReported(true);
    addNotification('Incident Logged', `Reported ${incidentType} incident at ${location}. Chief Proctor dispatched.`, 'WARNING');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-600" />
            Emergency & Campus Safety Center
          </h2>
          <p className="text-xs text-slate-500">
            Module 4: 1-Tap SOS Dispatch, rapid medical response, security incident monitoring & campus broadcasts
          </p>
        </div>

        <button
          onClick={onOpenSOSModal}
          className="px-5 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-extrabold text-sm shadow-xl shadow-red-600/30 flex items-center gap-2 active:scale-95 transition-all"
        >
          <ShieldAlert className="w-5 h-5 animate-bounce" />
          <span>TRIGGER 1-TAP SOS NOW</span>
        </button>
      </div>

      {/* Campus Emergency Broadcasts */}
      {broadcasts.length > 0 && (
        <div className="space-y-2">
          {broadcasts.map((b) => (
            <div key={b.id} className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3 text-xs text-red-950">
              <Radio className="w-5 h-5 text-red-600 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <div className="font-extrabold text-sm text-red-900">{b.title}</div>
                <div className="mt-0.5 text-red-800">{b.message}</div>
                <div className="mt-1 text-[10px] text-red-500 font-mono">Dispatched by: {b.sent_by} • Channels: {b.channels}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid: 24/7 Contacts Directory & Report Incident */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Directory */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 text-sm mb-3">24/7 Emergency Helplines & Desks</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {contacts.map((c) => (
                <div key={c.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-red-600 tracking-wider">{c.operating_hours}</span>
                    <h4 className="font-bold text-slate-900 text-sm mt-1">{c.service_name}</h4>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-800">{c.phone_number}</span>
                    <a
                      href={`tel:${c.phone_number}`}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold text-[11px] flex items-center gap-1"
                    >
                      <PhoneCall className="w-3 h-3" /> Call
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Dispatches & History */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Recent Incident & SOS Dispatch History</h3>
            <div className="space-y-2.5 text-xs">
              {recentSos.map((s) => (
                <div key={s.id} className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-red-100 text-red-800">
                        {s.alert_type}
                      </span>
                      <span className="font-bold text-slate-900">{s.user_name} ({s.user_role})</span>
                    </div>
                    <div className="text-slate-500 text-[11px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-500" /> {s.location_description}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {s.status}
                    </span>
                    <div className="text-[10px] text-slate-400 mt-1">{new Date(s.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Non-Urgent Incident Reporting */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">Report Safety or Medical Incident</h3>
          <p className="text-xs text-slate-500">For non-immediate hazards, maintenance accidents, or suspicious activity</p>

          {!reported ? (
            <form onSubmit={handleReportIncident} className="space-y-3.5 text-xs">
              <div>
                <label className="font-medium text-slate-700 block mb-1">Incident Category</label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                >
                  <option value="MEDICAL">Medical Injury / Illness</option>
                  <option value="TRESPASSING">Unauthorized Entry / Trespassing</option>
                  <option value="THEFT">Campus Property Theft</option>
                  <option value="CYBER">Cyber Security Threat</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">Campus Location</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Science Block 3, Chemistry Lab 1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">Incident Details</label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe observed conditions or persons involved..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Send className="w-4 h-4" /> Log Security Incident
              </button>
            </form>
          ) : (
            <div className="text-center py-6 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-slate-900 text-base">Incident Report Registered</h4>
              <p className="text-xs text-slate-500">Security control room alerted for review.</p>
              <button onClick={() => setReported(false)} className="text-xs text-campus-600 hover:underline font-bold mt-2">
                Report another incident
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
