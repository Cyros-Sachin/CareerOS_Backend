ALTER TABLE users ADD COLUMN institution_id UUID REFERENCES institutions(id);
ALTER TABLE users ADD COLUMN batch_id UUID REFERENCES institution_batches(id);
ALTER TABLE users ADD COLUMN institution_data_sharing_consent BOOLEAN DEFAULT false;
