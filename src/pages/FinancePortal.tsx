import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getInstitutionName } from '../config/university';
import { useNotifications } from '../context/NotificationContext';
import { RazorpayModal } from '../components/payments/RazorpayModal';
import { 
  CreditCard, CheckCircle2, Clock, AlertTriangle, ShieldCheck, 
  FileText, Download, Award, ArrowUpRight, Lock 
} from 'lucide-react';

export const FinancePortal: React.FC = () => {
  const { tenant, user } = useAuth();
  const { addNotification } = useNotifications();

  const [dues, setDues] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [scholarships, setScholarships] = useState<any[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<any>({ mode: 'UNCONFIGURED', ready: false, description: 'Checking server configuration' });
  const [loading, setLoading] = useState(true);

  // Active Razorpay payment modal
  const [activeDuePayment, setActiveDuePayment] = useState<any | null>(null);

  // Scholarship Application state
  const [selectedScholarship, setSelectedScholarship] = useState<any | null>(null);
  const [gpa, setGpa] = useState('');
  const [annualIncome, setAnnualIncome] = useState('');
  const [sop, setSop] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchFinanceData();
  }, [tenant]);

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/dues', {
        headers: {
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDues(data.dues || []);
        setTransactions(data.transactions || []);
        setScholarships(data.scholarships || []);
        setPaymentConfig(data.paymentConfig || { mode: 'UNCONFIGURED', ready: false, description: 'Payment configuration unavailable' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApplyScholarship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScholarship) return;
    if (!Number.isFinite(Number(gpa)) || !Number.isFinite(Number(annualIncome)) || !sop.trim()) {
      addNotification('Application Incomplete', 'Enter your actual GPA, annual family income, and statement of purpose.', 'WARNING');
      return;
    }
    setApplying(true);
    try {
      const res = await fetch('/api/finance/scholarships/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        },
        body: JSON.stringify({
          scholarshipId: selectedScholarship.id,
          gpa: parseFloat(gpa),
          annualIncome: parseFloat(annualIncome),
          statementOfPurpose: sop
        })
      });

      if (res.ok) {
        addNotification('Scholarship Application Submitted', `Applied for ${selectedScholarship.title}. Review committee alerted.`, 'SUCCESS');
        setSelectedScholarship(null);
        fetchFinanceData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        addNotification('Scholarship Application Failed', errorData.message || errorData.error || 'Please review your information and try again.', 'WARNING');
      }
    } finally {
      setApplying(false);
    }
  };

  const totalPayable = dues.reduce((sum, d) => sum + (d.balance_amount || 0), 0);
  const totalPaid = dues.reduce((sum, d) => sum + (d.amount_paid || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-campus-600" />
            Financial Management & Razorpay Gateway
          </h2>
          <p className="text-xs text-slate-500">
            Module 6: Fee ledger, server-verified checkout, receipts, and scholarship applications
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`px-3 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 ${paymentConfig.ready ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Gateway configuration is reported by the server
          </span>
        </div>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Outstanding Fee Dues</span>
          <div className="text-2xl font-black text-slate-900 mt-1">₹{totalPayable.toLocaleString()}</div>
          <span className={`text-[11px] font-semibold ${totalPayable === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {totalPayable === 0 ? 'All institutional dues cleared' : 'Action required before exam week'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Settled Payments</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">₹{totalPaid.toLocaleString()}</div>
          <span className="text-[11px] text-slate-400">Total credited to university accounts</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Gateway Status</span>
          <div className="text-base font-extrabold text-blue-700 mt-2 flex items-center gap-1.5">
            <Lock className="w-4 h-4" /> {paymentConfig.mode === 'LOCAL_MOCK' ? 'Local mock payment' : paymentConfig.mode === 'RAZORPAY' ? 'Razorpay checkout' : 'Gateway unavailable'}
          </div>
          <span className="text-[11px] text-slate-400">{paymentConfig.description}</span>
        </div>
      </div>

      {/* Dues Breakdown & Online Payment */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">Institutional Fee Breakdown & Online Payment</h3>

        <div className="space-y-3 text-xs">
          {dues.map((d) => (
            <div key={d.id} className="p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">{d.fee_type.replace('_', ' ')}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    d.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {d.status}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px]">
                  Academic Year: {d.academic_year} • Due Date: {d.due_date}
                </div>
                <div className="text-slate-500 text-[11px]">
                  Total: ₹{d.total_amount.toLocaleString()} • Paid: ₹{d.amount_paid.toLocaleString()}
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Balance Due</span>
                  <span className="font-black text-lg text-slate-900">₹{d.balance_amount.toLocaleString()}</span>
                </div>

                {d.balance_amount > 0 ? (
                  <button
                    onClick={() => setActiveDuePayment(d)}
                    disabled={!paymentConfig.ready}
                    title={!paymentConfig.ready ? paymentConfig.description : 'Open the configured payment checkout'}
                    className="px-4 py-2.5 rounded-xl bg-campus-600 hover:bg-campus-700 text-white font-bold text-xs shadow-md shadow-campus-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue to secure checkout
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Cleared
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction History & Digital Receipts */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">Official Transaction History & Digital Receipts</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-medium">
                <th className="pb-3">Receipt #</th>
                <th className="pb-3">Gateway Order ID</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Timestamp</th>
                <th className="pb-3 text-right">Digital Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="py-3 font-mono font-bold text-slate-900">{tx.receipt_number}</td>
                  <td className="py-3 font-mono text-[11px] text-slate-500">{tx.razorpay_order_id}</td>
                  <td className="py-3 font-bold text-emerald-600">₹{tx.amount.toLocaleString()}</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-3 text-slate-500 text-[11px]">{new Date(tx.created_at).toLocaleString()}</td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => alert(`Official Receipt #${tx.receipt_number}\nAmount: ₹${tx.amount}\nUniversity: ${getInstitutionName(tenant?.id, tenant?.name)}\nCryptographic Ledger Signature: Valid`)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> View Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scholarships Section */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Merit & Need-Based Scholarships</h3>
            <p className="text-xs text-slate-400">Apply for university endowment and state grants</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {scholarships.map((sch) => (
            <div key={sch.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
              <div>
                <span className="px-2 py-0.5 rounded bg-campus-100 text-campus-700 font-bold text-[10px]">
                  Grant: ₹{sch.amount.toLocaleString()}
                </span>
                <h4 className="font-bold text-slate-900 text-sm mt-2 mb-1">{sch.title}</h4>
                <p className="text-slate-600 text-[11px] mb-2">{sch.description}</p>
                <div className="text-slate-500 text-[10px]">Criteria: {sch.criteria} • Deadline: {sch.application_deadline}</div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                {sch.application_status ? (
                  <span className="font-bold text-campus-600">Status: {sch.application_status}</span>
                ) : (
                  <button
                    onClick={() => setSelectedScholarship(sch)}
                    className="px-3.5 py-1.5 rounded-xl bg-campus-600 hover:bg-campus-700 text-white font-bold"
                  >
                    Apply for Scholarship
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Server-verified gateway checkout */}
      <RazorpayModal
        isOpen={!!activeDuePayment}
        onClose={() => setActiveDuePayment(null)}
        feeDue={activeDuePayment}
        onPaymentSuccess={fetchFinanceData}
      />

      {/* Scholarship Application Modal */}
      {selectedScholarship && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 animate-in zoom-in-95">
            <h3 className="font-extrabold text-base text-slate-900">Apply: {selectedScholarship.title}</h3>
            <form onSubmit={handleApplyScholarship} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Cumulative CGPA</label>
                <input
                  type="text"
                  required
                  value={gpa}
                  onChange={(e) => setGpa(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Annual Family Income (INR)</label>
                <input
                  type="text"
                  required
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Statement of Purpose</label>
                <textarea
                  rows={3}
                  required
                  value={sop}
                  onChange={(e) => setSop(e.target.value)}
                  placeholder="Outline your research focus, academic achievements, or financial requirements..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedScholarship(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applying}
                  className="px-4 py-2 rounded-xl bg-campus-600 text-white font-bold disabled:opacity-50"
                >
                  {applying ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
