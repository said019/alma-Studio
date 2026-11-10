import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isEssentialNotification,essentialNotificationSettings} from '../../src/lib/essentialNotifications.js';
import {DEFAULT_NOTIFICATION_TEMPLATES} from './notificationTemplates.js';
test('essential transactional messages stay editable and respect disabled settings',()=>{
 for(const key of ['password_reset','booking_confirmed','booking_cancelled','class_reminder','membership_activated'])assert.equal(isEssentialNotification(key),true);
 assert.deepEqual(essentialNotificationSettings({booking_confirmed:{body:'Texto propio',enabled:false}}).booking_confirmed,{body:'Texto propio',enabled:false});
});
test('promotions, achievements and points cannot be reactivated by old saved settings',()=>{
 for(const key of ['milestone_classes_5','points_earned','motivation_comeback','promo_custom','promo_birthday_month','admin_new_booking']) {
  assert.equal(isEssentialNotification(key),false);
  assert.equal(DEFAULT_NOTIFICATION_TEMPLATES[key].enabled,false);
  assert.equal(essentialNotificationSettings({[key]:{enabled:true,body:'Texto'}})[key].enabled,false);
 }
});
