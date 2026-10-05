# Project Architecture Rules

- Mount descriptions and attributes, clothing-set membership, and set bonuses must come from official game data; do not restore spreadsheet-based values, because the official source stays synchronized with the game.
- Event documents are stored as one row per document in `event_documents` with sections in a JSONB column, because each section type has a different shape and documents are always edited as a whole.
