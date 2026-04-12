import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

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
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (!error && count != null) setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshPendingCount();
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
