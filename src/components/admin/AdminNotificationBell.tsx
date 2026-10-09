import { Bell } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function AdminNotificationBell({count=0}:{count?:number}) {
  const unread=Number.isFinite(count)?Math.max(0,Math.floor(count)):0;
  return <NavLink to="/admin/notifications" title="Notificaciones" aria-label={unread?`Notificaciones, ${unread} sin leer`:'Notificaciones'}
    className={({isActive})=>cn('relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',isActive?'bg-sunken text-ink':'text-ink-muted')}>
    <Bell size={20} aria-hidden="true" />
    {unread>0&&<span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.75rem] font-bold leading-none text-accent-foreground">{unread>99?'99+':unread}</span>}
  </NavLink>;
}
