export interface WhoopRecovery {
  date: string;
  recovery_score: number;
  hrv_rmssd_milli: number;
  resting_heart_rate: number;
  skin_temp_celsius?: number;
}

export interface WhoopSleep {
  date: string;
  sleep_efficiency_percentage: number;
  total_in_bed_time_milli: number;
  total_slow_wave_sleep_time_milli?: number;
}

export interface WhoopHeartRate {
  timestamp: string;
  heart_rate_bpm: number;
}

export interface WhoopCycle {
  date: string;
  estimated_steps: number;
  raw_kilojoules: number;
  strain_score?: number;
}
