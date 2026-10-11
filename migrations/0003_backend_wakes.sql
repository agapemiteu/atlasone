-- Wake-on-demand for the N-ATLaS backend. One row per wake attempt; the model server reports its real
-- progress into `stage` as it starts (observed signals only), and registration marks it ready.
CREATE TABLE backend_wakes (
  id           TEXT PRIMARY KEY,
  requested_at INTEGER NOT NULL,
  requested_by TEXT NOT NULL,   -- 'project:<id>' or 'user:<github id>'; never a secret
  stage        TEXT NOT NULL,   -- gpu_requested | notebook_started | fetching_runtime | downloading_model |
                                -- loading_weights | warming_up | ready | sleeping | failed
  detail       TEXT,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX backend_wakes_recent ON backend_wakes (requested_at DESC);
