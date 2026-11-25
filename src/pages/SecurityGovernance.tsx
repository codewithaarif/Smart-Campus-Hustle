import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getInstitutionName } from '../config/university';
import { useNotifications } from '../context/NotificationContext';
import { ShieldCheck, Lock, Eye, KeyRound, AlertTriangle, FileText, CheckCircle2, Server } from 'lucide-react';

export const SecurityGovernance: React.FC = () => {
  const { tenant, user } = useAuth();
  const { addNotification } = useNotifications();

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [sensitiveLogs, setSensitiveLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSecurityData();
  }, [tenant]);

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/governance/audit-logs', {
        headers: {
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.auditLogs || []);
        setSensitiveLogs(data.sensitiveLogs || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const rbacRoles = [
    { role: 'PLATFORM_OWNER', access: 'Full SaaS fleet, Tenant provisioning, Global billing' },
    { role: 'UNIVERSITY_ADMIN', access: 'Campus creation, Dean policies, Staff rosters, Audit ledger' },
    { role: 'FACULTY', access: 'Courses, Timetables, Grading rubric, Attendance marking' },
    { role: 'STUDENT', access: 'Self grades, Course registration, Fees, ID pass, SOS' },
    { role: 'PARENT', access: 'Child attendance view, Fee payment, Host approval review' },
    { role: 'SECURITY_GUARD', access: 'Turnstile gate QR scan, Visitor pass approval, Emergency override' },
    { role: 'MAINTENANCE_STAFF', access: 'Assigned tickets, Department routing, SLA updates' },
    { role: 'LIBRARIAN', access: 'Book catalogue, Issues, Returns, Fine calculation, Gate turnstile' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            Security Architecture & Data Governance
          </h2>
          <p className="text-xs text-slate-500">
            Module 22: Server-enforced access controls and audit records. This screen does not certify legal or regulatory compliance.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-emerald-600" /> Server-side authorization enabled
          </span>
        </div>
      </div>

      {/* Security Health KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="font-semibold text-slate-500">Tenant Boundary</span>
          <div className="text-base font-black text-slate-900 mt-1">{getInstitutionName(tenant?.id, tenant?.name)}</div>
          <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Tenant-scoped API access
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="font-semibold text-slate-500">Multi-Factor Auth (MFA)</span>
          <div className="text-base font-black text-slate-900 mt-1">TOTP when configured</div>
          <span className="text-[11px] text-slate-400">Requires a registered authenticator secret</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="font-semibold text-slate-500">API Rate Limiting</span>
          <div className="text-base font-black text-slate-900 mt-1">180 req/min</div>
          <span className="text-[11px] text-slate-400">In-memory per-process request limiter</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="font-semibold text-slate-500">Data Retention Rule</span>
          <div className="text-base font-black text-slate-900 mt-1">No automatic purge</div>
          <span className="text-[11px] text-slate-400">Set and enforce retention policy separately</span>
        </div>
      </div>

      {/* Sensitive Data Access Logs */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-600" />
              Sensitive Data Access Audit Logs (Module 22)
            </h3>
            <p className="text-xs text-slate-400">
              Sensitive-data access records are written by supported routes; not every module is connected to this ledger.
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700">
            Operational Audit Log
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-medium">
                <th className="pb-3">Accessed By</th>
                <th className="pb-3">Target Student</th>
                <th className="pb-3">Record Category</th>
                <th className="pb-3">Mandatory Justification</th>
                <th className="pb-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {sensitiveLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-3 font-semibold text-slate-900">{log.accessed_by_name}</td>
                  <td className="py-3 font-medium text-slate-800">{log.target_student_name} ({log.target_university_id})</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                      {log.record_category}
                    </span>
                  </td>
                  <td className="py-3 text-slate-600 italic">"{log.justification}"</td>
                  <td className="py-3 text-slate-400 text-right font-mono text-[11px]">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fine-Grained RBAC Matrix */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-campus-600" />
          Fine-Grained Role-Based Access Control (RBAC) Matrix
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {rbacRoles.map((r, idx) => (
            <div key={idx} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1">
              <span className="font-mono font-bold text-campus-700 text-[11px] block">{r.role}</span>
              <p className="text-slate-500 text-[11px] leading-relaxed">{r.access}</p>
            </div>
          ))}
        </div>
      </div>

      {/* General Audit Logs */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">System Operations & Session Activity Audit Trail</h3>

        <div className="space-y-2 text-xs">
          {auditLogs.map((a) => (
            <div key={a.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-200 text-slate-800">
                  {a.action}
                </span>
                <span className="text-slate-700 font-medium">User: {a.user_name || 'System / Gate Sensor'}</span>
                <span className="text-slate-400 text-[11px]">IP: {a.ip_address}</span>
              </div>
              <span className="text-slate-400 font-mono text-[10px]">{new Date(a.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
