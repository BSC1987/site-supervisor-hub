import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import {
  getSession,
  onAuthStateChange,
  signInWithPassword,
  getProfileActive,
  signOut as apiSignOut,
} from '@/api/auth';
import { touchLastSeen } from '@/api/users';

const LAST_SEEN_STORAGE_KEY = 'lastSeenTouchedAt';
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

function maybeTouchLastSeen() {
  const prev = Number(localStorage.getItem(LAST_SEEN_STORAGE_KEY) ?? 0);
  if (Date.now() - prev < LAST_SEEN_THROTTLE_MS) return;
  localStorage.setItem(LAST_SEEN_STORAGE_KEY, String(Date.now()));
  touchLastSeen().catch(() => {
    localStorage.removeItem(LAST_SEEN_STORAGE_KEY);
  });
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((session) => {
      setSession(session);
      setLoading(false);
      if (session) maybeTouchLastSeen();
    });

    getSession().then((session) => {
      setSession(session);
      setLoading(false);
      if (session) maybeTouchLastSeen();
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await signInWithPassword(email, password);
    if (error) return { error: error as Error | null };

    // Check if the user's profile is active
    const profile = await getProfileActive(data.user.id);

    if (profile && !profile.is_active) {
      await apiSignOut();
      return { error: new Error('Your account has been deactivated. Please contact your administrator.') };
    }

    return { error: null };
  };

  const signOut = async () => {
    await apiSignOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
