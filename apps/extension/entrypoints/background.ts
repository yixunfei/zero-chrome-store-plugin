import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';

export default defineBackground(() => {
  const bootId = crypto.randomUUID();
  // No session private key is stored here or restored after a worker restart.
  browser.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== browser.runtime.id || message?.type !== 'p1-status') return;
    void browser.storage.local.get('lastAlarm').then(data => reply({ bootId, ...data }));
    return true;
  });
  browser.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name === 'p1-lifecycle') await browser.storage.local.set({ lastAlarm: Date.now() });
  });
  browser.runtime.onInstalled.addListener(() => browser.alarms.create('p1-lifecycle', { periodInMinutes: 1 }));
});
