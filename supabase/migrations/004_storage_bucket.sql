-- Migration: certificates storage bucket
-- Used to store .p12 PKCS12 digital certificates for DGII signing.
-- Bucket is private; access goes through the service role only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificates',
  'certificates',
  false,
  5242880,
  ARRAY['application/pkcs12','application/x-pkcs12','application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;
