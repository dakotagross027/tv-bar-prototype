-- Rename TVs from generic labels to realistic bar screen names.
-- Run this once in the Supabase SQL Editor.
UPDATE public.tvs SET name = 'Main Bar' WHERE id = 'A';
UPDATE public.tvs SET name = 'Patio'    WHERE id = 'B';
UPDATE public.tvs SET name = 'Back Bar' WHERE id = 'C';
