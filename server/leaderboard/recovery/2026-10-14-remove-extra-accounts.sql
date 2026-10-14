-- Removes two extra accounts of the developer (HoopsFan9736 and HooperlyFan3620) and everything that belongs to them.
-- Nothing else is touched. The licence key that was claimed by HoopsFan9736 is free again afterwards, so the real account (Hoopsnr1) can use it.
-- A backup of the whole database was made before (~/hooperly-backups).

DELETE FROM scores WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM weekly_scores WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM profiles WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM replays WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM replay_sessions WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM replay_vault WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM license_claims WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM entitlement_checks WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM cheat_flags WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM friends WHERE player_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16') OR friend_id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16');
DELETE FROM players WHERE id IN ('159f8259-69cd-4866-9fb9-3fc70280d936', 'fc494adc-25f6-4678-9b5f-5d3f6f792b16') AND nickname IN ('HoopsFan9736', 'HooperlyFan3620');
