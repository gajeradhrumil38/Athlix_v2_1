import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mrntwydykqsdawpklumf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybnR3eWR5a3FzZGF3cGtsdW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2NDUsImV4cCI6MjA4OTM0MTY0NX0.lSyzEFdyrwFNEmIlsxLs3bxn1ZZxdBZQUD1m4VZYaRc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.from('workouts').select('*, exercises(*)').limit(1);
  console.log('Workouts + Exercises:', error || 'OK');

  const { data: prData, error: prError } = await supabase.from('personal_records').select('*').limit(1);
  console.log('PRs:', prError || 'OK');

  const { data: bwData, error: bwError } = await supabase.from('body_weight_logs').select('*').limit(1);
  console.log('Body Weight:', bwError || 'OK');
}

test();
