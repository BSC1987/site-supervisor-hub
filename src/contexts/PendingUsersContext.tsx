import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { countPendingProfiles, subscribeToPendingProfileChanges } from '@/api/users';

interface PendingUsersContextValue {
  pendingCount: number;
  refreshPendingCount: () => Promise<void>;
}

const PendingUsersContext = createContext<PendingUsersContextValue>({
  pendingCount: 0,
  refreshPendingCount: async () => {},
});

export function PendingUsersProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    const count = await countPendingProfiles();
    if (count != null) setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshPendingCount();

    // Poll every 30 seconds for new signups
    const interval = setInterval(refreshPendingCount, 30_000);

    // Also subscribe to realtime changes on profiles table
    const unsubscribe = subscribeToPendingProfileChanges(() => {
      refreshPendingCount();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [refreshPendingCount]);

  return (
    <PendingUsersContext.Provider value={{ pendingCount, refreshPendingCount }}>
      {children}
    </PendingUsersContext.Provider>
  );
}

export function usePendingUsers() {
  return useContext(PendingUsersContext);
}
