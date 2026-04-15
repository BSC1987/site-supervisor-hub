import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  countOpenCustomerCareJobs,
  subscribeToCustomerCareJobChanges,
} from '@/api/customer-care';

interface CustomerCareContextValue {
  openJobCount: number;
  refreshOpenJobCount: () => Promise<void>;
}

const CustomerCareContext = createContext<CustomerCareContextValue>({
  openJobCount: 0,
  refreshOpenJobCount: async () => {},
});

export function CustomerCareProvider({ children }: { children: ReactNode }) {
  const [openJobCount, setOpenJobCount] = useState(0);

  const refreshOpenJobCount = useCallback(async () => {
    const count = await countOpenCustomerCareJobs();
    if (count != null) setOpenJobCount(count);
  }, []);

  useEffect(() => {
    refreshOpenJobCount();
    const interval = setInterval(refreshOpenJobCount, 30_000);
    const unsubscribe = subscribeToCustomerCareJobChanges(() => {
      refreshOpenJobCount();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [refreshOpenJobCount]);

  return (
    <CustomerCareContext.Provider value={{ openJobCount, refreshOpenJobCount }}>
      {children}
    </CustomerCareContext.Provider>
  );
}

export function useCustomerCare() {
  return useContext(CustomerCareContext);
}
