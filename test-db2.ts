import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mrntwydykqsdawpklumf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybnR3eWR5a3FzZGF3cGtsdW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2NDUsImV4cCI6MjA4OTM0MTY0NX0.lSyzEFdyrwFNEmIlsxLs3bxn1ZZxdBZQUD1m4VZYaRc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.from('workouts').select('*').limit(1);
  console.log('Workouts:', error || data);
  
  const { data: exData, error: exError } = await supabase.from('exercises').select('*').limit(1);
  console.log('Exercises:', exError || exData);
}

test();
