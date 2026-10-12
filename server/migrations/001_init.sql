-- divvy initial schema (PostgreSQL 13+; gen_random_uuid() is built in)

-- A contact is a person. A contact that has completed verification is a
-- "member" (registered user). Unique key = normalized phone + '|' + email.
CREATE TABLE contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  email           text,
  phone           text,
  contact_key     text NOT NULL UNIQUE,
  verified_at     timestamptz,
  email_verified  boolean NOT NULL DEFAULT false,
  phone_verified  boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX contacts_email_idx ON contacts (email);
CREATE INDEX contacts_phone_idx ON contacts (phone);

-- Personal address book: which contacts a member has saved.
CREATE TABLE contact_links (
  owner_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  nickname    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contact_id)
);

-- One-time verification codes (registration + sign-in).
CREATE TABLE verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose      text NOT NULL CHECK (purpose IN ('register', 'login')),
  contact_id   uuid REFERENCES contacts(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('email', 'sms')),
  destination  text NOT NULL,
  code_hash    text NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verifications_dest_idx ON verifications (destination, created_at DESC);

CREATE TABLE divvys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title           text NOT NULL DEFAULT 'Untitled divvy',
  merchant        text,
  receipt_date    date,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete', 'closed')),
  subtotal_cents  int NOT NULL DEFAULT 0,
  total_cents     int NOT NULL DEFAULT 0,
  fingerprint     text,
  ocr_text        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX divvys_fingerprint_idx ON divvys (total_cents, receipt_date);

CREATE TABLE receipt_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  divvy_id     uuid NOT NULL REFERENCES divvys(id) ON DELETE CASCADE,
  position     int NOT NULL DEFAULT 0,
  description  text NOT NULL DEFAULT '',
  quantity     numeric(10, 3) NOT NULL DEFAULT 1,
  price_cents  int NOT NULL DEFAULT 0
);
CREATE INDEX receipt_items_divvy_idx ON receipt_items (divvy_id);

CREATE TABLE receipt_adjustments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  divvy_id      uuid NOT NULL REFERENCES divvys(id) ON DELETE CASCADE,
  position      int NOT NULL DEFAULT 0,
  kind          text NOT NULL CHECK (kind IN ('tax', 'tip', 'fee', 'discount', 'misc')),
  label         text NOT NULL DEFAULT '',
  amount_cents  int NOT NULL DEFAULT 0
);
CREATE INDEX receipt_adjustments_divvy_idx ON receipt_adjustments (divvy_id);

CREATE TABLE divvy_parties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  divvy_id    uuid NOT NULL REFERENCES divvys(id) ON DELETE CASCADE,
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  color       text NOT NULL,
  paid_at     timestamptz,
  added_by    uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (divvy_id, contact_id)
);
CREATE INDEX divvy_parties_contact_idx ON divvy_parties (contact_id);

-- An allocation assigns money to a party: against an item (item_id) or the remaining pool (NULL).
CREATE TABLE allocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  divvy_id    uuid NOT NULL REFERENCES divvys(id) ON DELETE CASCADE,
  party_id    uuid NOT NULL REFERENCES divvy_parties(id) ON DELETE CASCADE,
  item_id     uuid REFERENCES receipt_items(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('amount', 'percent', 'share')),
  value       numeric(12, 4) NOT NULL CHECK (value > 0),
  created_by  uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX allocations_divvy_idx ON allocations (divvy_id);
