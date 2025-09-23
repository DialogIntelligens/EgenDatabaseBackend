export async function ensureGdprSettingsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gdpr_settings (
      id SERIAL PRIMARY KEY,
      chatbot_id VARCHAR(255) UNIQUE NOT NULL,
      retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days >= 1 AND retention_days <= 3650),
      enabled BOOLEAN NOT NULL DEFAULT false,
      last_cleanup_run TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function computeCutoffDate(retentionDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff;
}

export function scheduleGdprCleanup(pool, runAllFn) {
  const runCleanup = async () => {
    try {
      const results = await runAllFn(pool);
      console.log('Scheduled GDPR cleanup completed:', results);
    } catch (error) {
      console.error('Scheduled GDPR cleanup failed:', error);
    }
  };

  const now = new Date();
  const next2AM = new Date();
  next2AM.setHours(2, 0, 0, 0);
  if (now >= next2AM) next2AM.setDate(next2AM.getDate() + 1);

  const timeUntilNext2AM = next2AM.getTime() - now.getTime();
  setTimeout(() => {
    runCleanup();
    setInterval(runCleanup, 24 * 60 * 60 * 1000);
  }, timeUntilNext2AM);

  console.log(`GDPR cleanup scheduled to run at ${next2AM.toLocaleString()}`);
}


