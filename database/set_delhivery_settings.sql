-- Delhivery settings (site_settings: setting_key / setting_val)
-- VPS pe chalao:  psql -U postgres -d mahalaxmi_fashionhub -f set_delhivery_settings.sql
-- Pehle YAHAN real values bharo:

INSERT INTO site_settings (setting_key, setting_val) VALUES
    ('delhivery_token',       'PASTE_NEW_DELHIVERY_TOKEN_HERE'),
    ('delhivery_pickup_name', 'PASTE_PICKUP_LOCATION_NAME_HERE')
ON CONFLICT (setting_key)
DO UPDATE SET setting_val = EXCLUDED.setting_val, updated_at = NOW();

-- Verify:
SELECT setting_key, LEFT(setting_val, 8) || '...' AS val_preview, updated_at
FROM site_settings
WHERE setting_key IN ('delhivery_token', 'delhivery_pickup_name');
