-- Goals the server believed the app about (shots a hero or the owl touched, which it cannot play itself); they are limited to a share of the verified goals.
ALTER TABLE scores ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0;
