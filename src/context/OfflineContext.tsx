import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface OfflineSyncItem {
  id: string;
  action: string;
  payload: any;
  timestamp: string;
}

interface OfflineContextType {
  isOnline: boolean;
  syncQueue: OfflineSyncItem[];
  syncing: boolean;
  queueAction: (action: string, payload: any) => void;
  syncPendingQueue: () => Promise<void>;
  cachedData: Record<string, any>;
  setCachedItem: (key: string, data: any) => void;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);
const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [syncQueue, setSyncQueue] = useState<OfflineSyncItem[]>(() => {
    const value = readJson<unknown>('smart_campus_sync_queue', []);
    return Array.isArray(value) ? value : [];
  });
  const [cachedData, setCachedData] = useState<Record<string, any>>(() =>
    readJson<Record<string, any>>('smart_campus_offline_cache', {})
  );
  const syncLock = useRef(false);

  const queueAction = (action: string, payload: any) => {
    if (!action || typeof action !== 'string' || action.length > 100) {
      throw new Error('Offline action must have a valid action identifier.');
    }
    const item: OfflineSyncItem = {
      id: globalThis.crypto?.randomUUID?.() || 'sync_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      action,
      payload,
      timestamp: new Date().toISOString()
    };
    setSyncQueue((current) => {
      const updated = [...current, item];
      localStorage.setItem('smart_campus_sync_queue', JSON.stringify(updated));
      return updated;
    });
  };

  const syncPendingQueue = async () => {
    if (!navigator.onLine || syncLock.current) return;
    const pending = readJson<OfflineSyncItem[]>('smart_campus_sync_queue', []);
    if (!Array.isArray(pending) || pending.length === 0) return;
    const token = localStorage.getItem('smart_campus_token');
    if (!token) return;

    syncLock.current = true;
    setSyncing(true);
    try {
      const batch = pending.slice(0, 50);
      const response = await fetch('/api/offline/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ items: batch })
      });
      if (!response.ok) return;
      const data = await response.json();
      const completed = new Set<string>(
        (data.results || [])
          .filter((result: any) => result.status === 'SYNCED' || result.status === 'DUPLICATE')
          .map((result: any) => result.id)
      );
      if (completed.size === 0) return;
      // Re-read the latest queue so actions added while the request was in flight
      // are never overwritten by this batch's stale snapshot.
      const latest = readJson<OfflineSyncItem[]>('smart_campus_sync_queue', []);
      const remaining = (Array.isArray(latest) ? latest : [])
        .filter((item) => !completed.has(item.id));
      localStorage.setItem('smart_campus_sync_queue', JSON.stringify(remaining));
      setSyncQueue(remaining);
    } catch (error) {
      console.warn('Offline sync failed; queued operations have been retained:', error);
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  };

  const setCachedItem = (key: string, data: any) => {
    if (!key || key.length > 200) throw new Error('Cache key is invalid.');
    const updated = { ...cachedData, [key]: data };
    setCachedData(updated);
    localStorage.setItem('smart_campus_offline_cache', JSON.stringify(updated));
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncPendingQueue();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && syncQueue.length > 0) {
      void syncPendingQueue();
    }
  }, [isOnline, syncQueue.length]);

  return (
    <OfflineContext.Provider value={{
      isOnline, syncing, syncQueue, queueAction, syncPendingQueue, cachedData, setCachedItem
    }}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used within an OfflineProvider');
  return context;
};
