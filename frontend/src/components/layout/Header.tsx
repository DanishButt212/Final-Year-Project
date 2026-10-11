import { SearchTrigger } from '@/components/search/SearchTrigger';
import { FontSizeControl, LanguageToggle } from '@/components/preferences/PreferenceControls';
import { ChevronDown, LogOut, Menu, UserCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toaster';
import { useAuth } from '@/auth/useAuth';
import { ROLE_LABEL, roleHome } from '@/lib/navigation';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { useTranslation } from 'react-i18next';

/** Thin green top bar shared by every signed-in page. */
export function Header({ onMenuClick, menuOpen }: { onMenuClick: () => void; menuOpen: boolean }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success(t('Logged out successfully.'));
    navigate('/login', { replace: true });
  }

  return (
    <header className="no-print bg-primary text-on-primary">
      <div className="flex min-h-14 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={t('Open navigation menu')}
            aria-expanded={menuOpen}
            aria-controls="portal-sidebar"
            className="flex size-10 items-center justify-center rounded-md hover:bg-primary-hover focus-visible:outline-white lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          {/* Phones show the seal alone: the header also holds the menu, bell, account and log out. */}
          <Logo to={user ? roleHome(user.role) : '/'} wordmarkClassName="hidden sm:inline-flex" />
        </div>
        {user && (
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <SearchTrigger />
            <div className="hidden items-center gap-2 md:flex">
              <LanguageToggle tone="inverse" />
              <FontSizeControl tone="inverse" />
            </div>
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('Account menu')}
                  className="flex min-h-10 items-center gap-2 rounded-md px-2 hover:bg-primary-hover focus-visible:outline-white"
                >
                  <span className="hidden text-end leading-tight sm:block">
                    <span className="block text-sm font-semibold">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="block text-xs text-white/85">{t(ROLE_LABEL[user.role])}</span>
                  </span>
                  <UserCircle className="size-6" aria-hidden="true" />
                  <ChevronDown className="size-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem asChild>
                  <Link to="/profile">{t('My Profile')}</Link>
                </DropdownMenuItem>
                {(user.role === 'LITIGANT' || user.role === 'LAWYER') && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/profile/notification-preferences">
                        {t('Notification Options Preferences')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/profile/feedback">{t('System Feedback')}</Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-white/60 px-2 text-sm font-semibold hover:bg-primary-hover focus-visible:outline-white sm:px-3"
            >
              <LogOut className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t('Log out')}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
