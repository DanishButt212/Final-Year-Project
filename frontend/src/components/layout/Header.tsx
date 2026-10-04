import { LogOut, Menu } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from '@/components/ui/toaster';
import { useAuth } from '@/auth/useAuth';
import { ROLE_LABEL, roleHome } from '@/lib/navigation';
import { Logo } from './Logo';

/** Thin green top bar shared by every signed-in page. */
export function Header({ onMenuClick, menuOpen }: { onMenuClick: () => void; menuOpen: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success('Logged out successfully.');
    navigate('/login', { replace: true });
  }

  return (
    <header className="no-print bg-primary text-on-primary">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            aria-controls="portal-sidebar"
            className="flex size-10 items-center justify-center rounded-md hover:bg-primary-hover focus-visible:outline-white lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Logo to={user ? roleHome(user.role) : '/'} />
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-white/85">{ROLE_LABEL[user.role]}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/60 px-3 text-sm font-semibold hover:bg-primary-hover focus-visible:outline-white"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
