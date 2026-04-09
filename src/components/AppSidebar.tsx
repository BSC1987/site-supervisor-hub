import {
  Building2, ListChecks, LogOut
} from 'lucide-react';
import cordecLogo from '@/assets/cordec-logo.png';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const entities = [
  { title: 'Developers', url: '/developers', icon: Building2 },
  { title: 'Task Templates', url: '/task-templates', icon: ListChecks },
];

export function AppSidebar() {
  const { signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-center py-4 mb-2">
            {collapsed
              ? <span className="text-sidebar-foreground font-bold text-lg">C.</span>
              : <img src={cordecLogo} alt="Cordec" className="h-8 w-auto" />
            }
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {entities.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="relative pl-4 text-sidebar-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r before:bg-primary"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && <span>Sign out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
