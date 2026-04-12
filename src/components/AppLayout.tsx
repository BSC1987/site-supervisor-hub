import { ReactNode } from 'react';
import { LayoutDashboard, Building2, Settings, LogOut, Users as UsersIcon } from 'lucide-react';
import cordecLogo from '@/assets/cordec-logo.png';
import { NavLink } from '@/components/NavLink';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingUsers } from '@/contexts/PendingUsersContext';
import { Button } from '@/components/ui/button';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, end: true },
  { title: 'Developers', url: '/developers', icon: Building2 },
  { title: 'Users', url: '/users', icon: UsersIcon },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { pendingCount } = usePendingUsers();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 bg-card sticky top-0 z-20">
        <div className="max-w-7xl mx-auto h-14 flex items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link to="/">
              <img src={cordecLogo} alt="Cordec" className="h-7 w-auto" />
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map(item => (
                <NavLink
                  key={item.title}
                  to={item.url}
                  end
                  className="relative flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  activeClassName="bg-accent text-foreground font-medium"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                  {item.title === 'Users' && pendingCount > 0 && (
                    <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[11px] font-semibold text-white">
                      {pendingCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto bg-background">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
