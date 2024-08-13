CREATE TABLE IF NOT EXISTS global_storage (
    ide TEXT,
    version INTEGER,
    key TEXT,
    value TEXT,
    PRIMARY KEY (ide, version, key)
)
