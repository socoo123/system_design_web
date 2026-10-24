PRAGMA foreign_keys = ON;
CREATE TABLE grants(actor TEXT NOT NULL, tenant TEXT NOT NULL, bucket TEXT NOT NULL,
  can_read INTEGER NOT NULL, can_write INTEGER NOT NULL, PRIMARY KEY(actor,tenant,bucket));
CREATE TABLE names(ns TEXT PRIMARY KEY NOT NULL, tenant TEXT NOT NULL, bucket TEXT NOT NULL,
  object_key TEXT NOT NULL, current TEXT, generation INTEGER NOT NULL DEFAULT 0);
CREATE TABLE uploads(id TEXT PRIMARY KEY NOT NULL, ns TEXT NOT NULL REFERENCES names(ns),
  owner TEXT NOT NULL, request_id TEXT NOT NULL, intent_hash TEXT NOT NULL,
  expected_size INTEGER NOT NULL CHECK(expected_size>=0), expected_digest TEXT NOT NULL, expected_generation INTEGER,
  required_copies INTEGER NOT NULL CHECK(required_copies IN (3,6)),
  state TEXT NOT NULL CHECK(state IN ('OPEN','FINALIZING','COMPLETED','ABORTED','REJECTED','RECLAIMING')),
  fence INTEGER NOT NULL, created REAL NOT NULL, lease_until REAL NOT NULL,
  version_id TEXT NOT NULL UNIQUE, manifest_hash TEXT, frozen_manifest TEXT, result TEXT,
  UNIQUE(ns,owner,request_id));
CREATE TABLE parts(upload_id TEXT NOT NULL REFERENCES uploads(id), part_no INTEGER NOT NULL CHECK(part_no>0),
  part_generation INTEGER NOT NULL, blob_id TEXT NOT NULL UNIQUE, size INTEGER NOT NULL,
  digest TEXT NOT NULL, PRIMARY KEY(upload_id,part_no));
CREATE TABLE versions(id TEXT PRIMARY KEY NOT NULL, ns TEXT NOT NULL REFERENCES names(ns),
  state TEXT NOT NULL CHECK(state IN ('PUBLISHED','RECLAIMING')), fence INTEGER NOT NULL,
  layout INTEGER NOT NULL, manifest TEXT NOT NULL, retained INTEGER NOT NULL CHECK(retained IN (0,1)));
CREATE TABLE read_leases(id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, version_id TEXT NOT NULL REFERENCES versions(id),
  layout INTEGER NOT NULL, fence INTEGER NOT NULL, expires REAL NOT NULL);
