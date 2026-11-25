import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Users, QrCode, CheckCircle2, Clock, UserPlus, ShieldCheck, MapPin } from 'lucide-react';

export const VisitorManagement: React.FC = () => {
  const { tenant, user } = useAuth();
  const { addNotification } = useNotifications();

  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegModal, setShowRegModal] = useState(false);

  // Pre-registration form
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [idType, setIdType] = useState('AADHAAR');
  const [idNumber, setIdNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expectedArrival, setExpectedArrival] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchVisitors();
  }, [tenant]);

  const fetchVisitors = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/visitors', {
        headers: {
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setVisitors(data.visitors || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/visitors/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        },
        body: JSON.stringify({
          visitorName,
          visitorPhone,
          visitorEmail,
          idProofType: idType,
          idProofNumber: idNumber,
          hostUserId: user?.id || 'user_faculty_1',
          purpose,
          expectedArrival
        })
      });

      if (res.ok) {
        const data = await res.json();
        addNotification(
          'Visitor Request Submitted',
          `The visit request for ${visitorName} is waiting for host approval. A QR pass will be issued only after approval.`,
          'INFO'
        );
        setShowRegModal(false);
        setVisitorName('');
        setVisitorPhone('');
        fetchVisitors();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewVisitor = async (visitorId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const response = await fetch('/api/visitors/approval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          Authorization: 'Bearer ' + localStorage.getItem('smart_campus_token')
        },
        body: JSON.stringify({ visitorId, decision })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Unable to review visitor request.');
      addNotification(
        decision === 'APPROVED' ? 'Visitor Approved' : 'Visitor Rejected',
        decision === 'APPROVED'
          ? 'A unique visitor pass was issued. Share it with the visitor securely.'
          : 'The visitor request was rejected.',
        decision === 'APPROVED' ? 'SUCCESS' : 'WARNING'
      );
      await fetchVisitors();
    } catch (error) {
      addNotification('Visitor Review Failed', error instanceof Error ? error.message : 'Please retry.', 'WARNING');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-campus-600" />
            Visitor Gate Management
          </h2>
          <p className="text-xs text-slate-500">
            Module 3: Pre-registration, host approval, unique visitor passes, and authenticated gate check-in/out
          </p>
        </div>

        <button
          onClick={() => setShowRegModal(true)}
          className="px-4 py-2.5 rounded-2xl bg-campus-600 hover:bg-campus-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-campus-600/20"
        >
          <UserPlus className="w-4 h-4" />
          <span>Pre-Register New Visitor</span>
        </button>
      </div>

      {/* Visitors List Grid */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">Visitor Log & Digital Gate Passes</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {visitors.map((v) => (
            <div key={v.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono font-bold text-campus-700 bg-campus-100/70 px-2 py-0.5 rounded text-[10px]">
                    {v.id_proof_type}: {v.id_proof_number}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    v.host_approval_status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {v.host_approval_status}
                  </span>
                </div>

                <h4 className="font-extrabold text-slate-900 text-sm">{v.visitor_name}</h4>
                <div className="text-slate-500 text-[11px] mt-0.5">{v.visitor_phone} • {v.visitor_email}</div>
                
                <div className="mt-3 bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[11px] text-slate-600">
                    Host: <strong className="text-slate-800">{v.host_name}</strong> ({v.host_department})
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Purpose: <span className="text-slate-700">{v.purpose}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Allowed Zones: <strong className="text-slate-600">{v.allowed_zones}</strong>
                  </div>
                </div>
              </div>

              {v.host_approval_status === 'PENDING' &&
                (v.host_user_id === user?.id || ['UNIVERSITY_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role || '')) && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReviewVisitor(v.id, 'APPROVED')}
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-white font-bold text-[11px]"
                  >
                    Approve & issue pass
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReviewVisitor(v.id, 'REJECTED')}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 font-bold text-[11px]"
                  >
                    Reject
                  </button>
                </div>
              )}
              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="font-mono font-bold text-slate-700 flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5 text-campus-600" /> {v.pass_qr_code || 'Pass issued after host approval'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {v.check_in_time ? `In: ${new Date(v.check_in_time).toLocaleTimeString()}` : 'Not Checked In'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pre-Registration Modal */}
      {showRegModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 animate-in zoom-in-95">
            <h3 className="font-extrabold text-base text-slate-900">Pre-Register Campus Visitor</h3>
            <p className="text-xs text-slate-500">The host must approve the request before a visitor pass is issued.</p>

            <form onSubmit={handleRegisterVisitor} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Visitor Full Name</label>
                <input
                  type="text"
                  required
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  placeholder="e.g. Ramesh Chandra"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={visitorPhone}
                    onChange={(e) => setVisitorPhone(e.target.value)}
                    placeholder="+91 98888 12345"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={visitorEmail}
                    onChange={(e) => setVisitorEmail(e.target.value)}
                    placeholder="visitor@mail.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">ID Proof Type</label>
                  <select
                    value={idType}
                    onChange={(e) => setIdType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  >
                    <option value="AADHAAR">Govt Aadhaar ID</option>
                    <option value="PASSPORT">Passport</option>
                    <option value="DRIVERS_LICENSE">Driver's License</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">ID Number</label>
                  <input
                    type="text"
                    required
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder="XXXX-XXXX-1234"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Purpose of Visit</label>
                <input
                  type="text"
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Industry research project meeting"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-campus-600 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Issuing Pass...' : 'Generate Gate Pass'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
