import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Tenant, Campus } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  tenant: Tenant | null;
  campuses: Campus[];
  activeCampus: Campus | null;
  tenantsList: Tenant[];
  loading: boolean;
  login: (email: string, password: string, tenantId?: string, mfaCode?: string) => Promise<boolean>;
  logout: () => void;
  switchTenant: (tenantId: string) => Promise<void>;
  switchCampus: (campusId: string) => void;
  switchDemoRole: (user: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('smart_campus_token'));
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [activeCampus, setActiveCampus] = useState<Campus | null>(null);
  const [tenantsList, setTenantsList] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeUser = (raw: any): User => ({
    id: raw.id,
    tenant_id: raw.tenantId || raw.tenant_id,
    campus_id: raw.campusId || raw.campus_id,
    university_id: raw.universityId || raw.university_id,
    name: raw.name,
    email: raw.email,
    role: raw.role,
    department: raw.department,
    phone: raw.phone,
    photo_url: raw.photoUrl || raw.photo_url,
    card_status: raw.cardStatus || raw.card_status || 'ACTIVE',
    mfa_enabled: Boolean(raw.mfaEnabled ?? raw.mfa_enabled)
  });

  const loadTenantContext = async (tenantId: string, accessToken: string) => {
    const response = await fetch('/api/saas/tenants', {
      headers: {
        'X-Tenant-ID': tenantId,
        Authorization: 'Bearer ' + accessToken
      }
    });
    if (!response.ok) throw new Error('Unable to load institution context.');
    const data = await response.json();
    setTenantsList(data.tenants || []);
    setTenant(data.currentTenant || null);
    setCampuses(data.campuses || []);
    setActiveCampus(data.campuses?.[0] || null);
  };

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const savedToken = localStorage.getItem('smart_campus_token');
        if (!savedToken) {
          setUser(null);
          setToken(null);
          return;
        }

        const response = await fetch('/api/auth/me', {
          headers: { Authorization: 'Bearer ' + savedToken }
        });
        if (!response.ok) {
          localStorage.removeItem('smart_campus_token');
          localStorage.removeItem('smart_campus_tenant');
          setUser(null);
          setToken(null);
          return;
        }

        const data = await response.json();
        if (cancelled) return;
        const restoredUser = normalizeUser(data.user);
        setUser(restoredUser);
        setToken(savedToken);
        await loadTenantContext(restoredUser.tenant_id, savedToken);
      } catch (error) {
        console.error('Authentication initialization failed:', error);
        if (!cancelled) {
          localStorage.removeItem('smart_campus_token');
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const login = async (email: string, password: string, tenantId = 'tenant_apex', mfaCode = '') => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId
        },
        body: JSON.stringify({ email, password, tenantId, mfaCode })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token || !data.user) return false;

      localStorage.setItem('smart_campus_token', data.token);
      localStorage.setItem('smart_campus_tenant', data.user.tenantId);
      setToken(data.token);
      setUser(normalizeUser(data.user));
      await loadTenantContext(data.user.tenantId, data.token);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = () => {
    const savedToken = localStorage.getItem('smart_campus_token');
    if (savedToken) {
      void fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + savedToken }
      }).catch(() => undefined);
    }
    localStorage.removeItem('smart_campus_token');
    localStorage.removeItem('smart_campus_tenant');
    setUser(null);
    setToken(null);
    setTenant(null);
    setCampuses([]);
    setActiveCampus(null);
    setTenantsList([]);
  };

  const switchTenant = async (tenantId: string) => {
    // A tenant change is a context switch for platform operators, never a demo-account impersonation.
    if (!user || user.role !== 'PLATFORM_OWNER' || !token) return;
    try {
      await loadTenantContext(tenantId, token);
      localStorage.setItem('smart_campus_tenant', tenantId);
    } catch (error) {
      console.error('Tenant switch failed:', error);
    }
  };

  const switchCampus = (campusId: string) => {
    const found = campuses.find((campus) => campus.id === campusId);
    if (found) setActiveCampus(found);
  };

  const switchDemoRole = async (targetUser: Partial<User>) => {
    if (!import.meta.env.DEV || !targetUser.email) return;
    await login(targetUser.email, 'password123', targetUser.tenant_id || 'tenant_apex');
  };

  return (
    <AuthContext.Provider value={{
      user, token, tenant, campuses, activeCampus, tenantsList, loading,
      login, logout, switchTenant, switchCampus, switchDemoRole
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
