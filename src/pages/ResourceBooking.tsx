import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Building2, Calendar, Clock, CheckCircle2, AlertTriangle, Plus, Users } from 'lucide-react';

export const ResourceBooking: React.FC = () => {
  const { tenant, user } = useAuth();
  const { addNotification } = useNotifications();

  const [resources, setResources] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Booking Form
  const [resourceId, setResourceId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('16:00');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchResources();
  }, [tenant]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/resources', {
        headers: {
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setResources(data.resources || []);
        setReservations(data.reservations || []);
        if (data.resources?.length > 0 && !resourceId) {
          setResourceId(data.resources[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/resources/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        },
        body: JSON.stringify({
          resourceId,
          purpose,
          date,
          startTime,
          endTime
        })
      });

      if (res.ok) {
        addNotification('Booking Request Submitted', 'The request is pending faculty or campus approval. It is not reserved until approved.', 'INFO');
        setShowModal(false);
        setPurpose('');
        fetchResources();
      } else {
        const errData = await res.json();
        alert('Booking conflict: ' + errData.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (bookingId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const response = await fetch('/api/resources/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          Authorization: 'Bearer ' + localStorage.getItem('smart_campus_token')
        },
        body: JSON.stringify({ bookingId, decision })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Unable to review booking.');
      addNotification('Booking Review Saved', 'Resource request marked ' + decision.toLowerCase() + '.', 'SUCCESS');
      await fetchResources();
    } catch (error) {
      addNotification('Booking Review Failed', error instanceof Error ? error.message : 'Please retry.', 'WARNING');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-campus-600" />
            Campus Resource & Facility Reservation
          </h2>
          <p className="text-xs text-slate-500">
            Module 14: Laboratories, seminar halls, project discussion rooms & equipment allocation with conflict detection
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 rounded-2xl bg-campus-600 hover:bg-campus-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-campus-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Reserve Lab or Hall</span>
        </button>
      </div>

      {/* Available Resources Grid */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">Campus Facility Inventory</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {resources.map((res) => (
            <div key={res.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-[10px] px-2 py-0.5 rounded bg-campus-100 text-campus-700">
                    {res.resource_type}
                  </span>
                  <span className="font-semibold text-slate-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Capacity: {res.capacity}
                  </span>
                </div>

                <h4 className="font-bold text-slate-900 text-sm mb-1">{res.name}</h4>
                <div className="text-slate-500 text-[11px] mb-3">Amenities: {res.amenities}</div>
              </div>

              <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className={`font-bold flex items-center gap-1 ${res.status === 'AVAILABLE' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> {res.status}
                </span>
                <button
                  onClick={() => { setResourceId(res.id); setShowModal(true); }}
                  disabled={res.status !== 'AVAILABLE'}
                  className="text-campus-600 hover:underline font-bold disabled:opacity-40"
                >
                  Book Slot
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reservations Calendar / Schedule */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">Scheduled Resource Reservations & Faculty Approvals</h3>

        <div className="space-y-3 text-xs">
          {reservations.map((r) => (
            <div key={r.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-bold text-slate-900 text-sm">{r.resource_name}</div>
                <div className="text-slate-600 text-[11px]">{r.purpose} • Booked by: {r.booked_by_name}</div>
                <div className="text-slate-400 text-[10px]">
                  Date: {r.date} • Slot: {r.start_time} - {r.end_time} • Approver: {r.approved_by || 'Pending approval'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${r.approval_status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : r.approval_status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                  {r.approval_status}
                </span>
                {r.approval_status === 'PENDING' && ['UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'].includes(user?.role || '') && (
                  <>
                    <button onClick={() => void handleReview(r.id, 'APPROVED')} className="text-[10px] font-bold text-emerald-700">Approve</button>
                    <button onClick={() => void handleReview(r.id, 'REJECTED')} className="text-[10px] font-bold text-red-700">Reject</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reservation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 animate-in zoom-in-95">
            <h3 className="font-extrabold text-base text-slate-900">Book Campus Resource</h3>
            <form onSubmit={handleBook} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Select Facility</label>
                <select
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                >
                  {resources.map((res) => (
                    <option key={res.id} value={res.id}>{res.name} ({res.resource_type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Reservation Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Academic Purpose</label>
                <textarea
                  rows={2}
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Capstone presentation rehearsal, H100 cluster model training"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-campus-600 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Checking Conflict...' : 'Confirm Reservation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
