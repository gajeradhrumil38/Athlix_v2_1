import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mrntwydykqsdawpklumf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybnR3eWR5a3FzZGF3cGtsdW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2NDUsImV4cCI6MjA4OTM0MTY0NX0.lSyzEFdyrwFNEmIlsxLs3bxn1ZZxdBZQUD1m4VZYaRc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
