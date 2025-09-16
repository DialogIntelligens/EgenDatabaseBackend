import { parseVisibility } from '../utils/userSettingsUtils.js';

export async function getUserStatisticSettingsService(userId, pool) {
  const result = await pool.query(
    'SELECT * FROM userStatisticSettings WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return {
      business_hours_start: '09:00:00',
      business_hours_end: '15:00:00',
      saturday_hours_start: '09:00:00',
      saturday_hours_end: '15:00:00',
      sunday_hours_start: '09:00:00',
      sunday_hours_end: '15:00:00',
      ligegyldig_visible: false,
      statistics_visibility: parseVisibility(null)
    };
  }

  const row = result.rows[0];
  return {
    ...row,
    statistics_visibility: parseVisibility(row.statistics_visibility),
    ligegyldig_visible: row.ligegyldig_visible ?? false
  };
}

export async function updateUserStatisticSettingsService(userId, body, pool) {
  const {
    business_hours_start,
    business_hours_end,
    saturday_hours_start,
    saturday_hours_end,
    sunday_hours_start,
    sunday_hours_end,
    statistics_visibility,
    ligegyldig_visible
  } = body;

  const insertFields = ['user_id'];
  const insertValues = ['$1'];
  const conflictUpdates = [];
  const params = [userId];
  let i = 2;

  const add = (field, value, transform = (v) => v) => {
    if (value !== undefined) {
      insertFields.push(field);
      insertValues.push(`$${i}`);
      conflictUpdates.push(`${field} = EXCLUDED.${field}`);
      params.push(transform(value));
      i++;
    }
  };

  add('business_hours_start', business_hours_start);
  add('business_hours_end', business_hours_end);
  add('saturday_hours_start', saturday_hours_start);
  add('saturday_hours_end', saturday_hours_end);
  add('sunday_hours_start', sunday_hours_start);
  add('sunday_hours_end', sunday_hours_end);
  add('statistics_visibility', statistics_visibility, (v) => JSON.stringify(v));
  add('ligegyldig_visible', ligegyldig_visible);

  conflictUpdates.push('updated_at = CURRENT_TIMESTAMP');

  const result = await pool.query(
    `INSERT INTO userStatisticSettings (${insertFields.join(', ')})
     VALUES (${insertValues.join(', ')})
     ON CONFLICT (user_id)
     DO UPDATE SET ${conflictUpdates.join(', ')}
     RETURNING *`,
    params
  );

  const row = result.rows[0];
  return {
    ...row,
    statistics_visibility: parseVisibility(row.statistics_visibility)
  };
}


