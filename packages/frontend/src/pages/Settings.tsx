import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import SettingsContent from './SettingsContent';

/**
 * Standalone /settings page — kept as a deep-link fallback. The primary entry
 * point for settings is now the right-side drawer opened from the sidebar
 * (see SettingsDrawer + App.tsx).
 */
function Settings() {
  return (
    <PageShell>
      <PageHeader title="Settings" />
      <SettingsContent />
    </PageShell>
  );
}

export default Settings;
