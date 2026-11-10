// Shared by the settings screens and server dispatch policy.
export const ESSENTIAL_NOTIFICATION_KEYS = [
  'client_invite', 'welcome', 'password_reset',
  'booking_confirmed', 'booking_cancelled', 'booking_waitlisted', 'waitlist_promoted', 'class_reminder',
  'membership_activated', 'membership_expiring_today', 'membership_expiring_tomorrow',
  'membership_expiring_n_days', 'membership_expired', 'renewal_reminder', 'transfer_rejected',
];
export const isEssentialNotification = key => ESSENTIAL_NOTIFICATION_KEYS.includes(key);
export function essentialNotificationSettings(templates) {
  return Object.fromEntries(Object.entries(templates).map(([key, value]) => [
    key, isEssentialNotification(key) ? value : { ...value, enabled: false },
  ]));
}
