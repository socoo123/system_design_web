PRAGMA foreign_keys=ON;
CREATE TABLE seasons (
  game TEXT NOT NULL, season TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('OPEN','PAUSED','CLOSING','FROZEN','FINAL')),
  PRIMARY KEY(game,season)
);
CREATE TABLE memberships (
  game TEXT NOT NULL, season TEXT NOT NULL, player TEXT NOT NULL, region TEXT NOT NULL,
  PRIMARY KEY(game,season,player), FOREIGN KEY(game,season) REFERENCES seasons
);
CREATE TABLE scores (
  game TEXT NOT NULL, season TEXT NOT NULL, player TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version BETWEEN 0 AND 1000000000),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 1000000),
  second INTEGER NOT NULL CHECK(second BETWEEN 0 AND 2592000),
  PRIMARY KEY(game,season,player), FOREIGN KEY(game,season,player) REFERENCES memberships
);
CREATE TABLE receipts (
  id TEXT NOT NULL PRIMARY KEY, intent TEXT NOT NULL, original_receipt TEXT NOT NULL
);
CREATE TABLE outbox (
  event_id TEXT NOT NULL, board TEXT NOT NULL, player TEXT NOT NULL,
  game TEXT NOT NULL, season TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 1000000000),
  composite INTEGER NOT NULL CHECK(composite BETWEEN 0 AND 3000004000000),
  delivered INTEGER NOT NULL DEFAULT 0 CHECK(delivered IN (0,1)),
  PRIMARY KEY(event_id,board), FOREIGN KEY(event_id) REFERENCES receipts(id),
  FOREIGN KEY(game,season) REFERENCES seasons
);
