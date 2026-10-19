import { defineConfig } from 'wxt';

const clientId = process.env.ZV_GOOGLE_CLIENT_ID;
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Zero Vault · P1 Probe', version: '0.0.1',
    description: 'Synthetic-data technical probe. Not a password manager.',
    permissions: ['storage', 'alarms'],
    optional_permissions: ['privacy', 'identity'],
    optional_host_permissions: ['https://www.googleapis.com/*'],
    ...(clientId ? { oauth2: { client_id: clientId, scopes: ['https://www.googleapis.com/auth/drive.file'] } } : {}),
  },
});
