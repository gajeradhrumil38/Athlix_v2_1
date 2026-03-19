import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, subWeeks } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Trophy, TrendingUp, Activity, Scale, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { ExerciseImage } from '../components/shared/ExerciseImage';

export const Progress: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'overload' | 'prs' | 'weight'>('overview');
  const [loading, setLoading] = useState(true);

  // Data states
  const [prs, setPrs] = useState<any[]>([]);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [selectedExerciseForOverload, setSelectedExerciseForOverload] = useState<string>('');

  // New weight log state
  const [newWeight, setNewWeight] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [bmiValue, setBmiValue] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  useEffect(() => {
    if (heightCm && weightLogs.length > 0) {
      const currentWeight = weightLogs[weightLogs.length - 1].weight;
      const heightM = parseFloat(heightCm) / 100;
      if (heightM > 0) {
        const bmi = currentWeight / (heightM * heightM);
        setBmiValue(bmi.toFixed(1));
      } else {
        setBmiValue(null);
      }
    } else {
      setBmiValue(null);
    }
  }, [heightCm, weightLogs]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch PRs
      const { data: prData } = await supabase
        .from('personal_records')
        .select('*')
        .eq('user_id', user?.id)
        .order('achieved_date', { ascending: false });
      if (prData) setPrs(prData);

      // Fetch Weight Logs
      const { data: weightData } = await supabase
        .from('body_weight_logs')
        .select('*')
        .eq('user_id', user?.id)
        .order('date', { ascending: true });
      if (weightData) setWeightLogs(weightData);

      // Fetch Workouts for Heatmap
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const { data: workoutData } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user?.id)
        .gte('date', thirtyDaysAgo);
      if (workoutData) setWorkouts(workoutData);

      // Fetch Exercises for Volume/Progression
      const { data: exerciseData } = await supabase
        .from('exercises')
        .select('*, workouts!inner(date)')
        .eq('workouts.user_id', user?.id)
        .order('workouts(date)', { ascending: true });
      
      if (exerciseData) {
        setExercises(exerciseData);
        // Set default selected exercise for overload
        const uniqueNames = Array.from(new Set(exerciseData.map(ex => ex.name)));
        if (uniqueNames.length > 0) {
          setSelectedExerciseForOverload(uniqueNames[0] as string);
        }
      }

    } catch (error) {
      console.error('Error fetching progress data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogWeight = async () => {
    if (!newWeight) return;
    const weightNum = parseFloat(newWeight);
    if (isNaN(weightNum)) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Check if logged today
    const existingLog = weightLogs.find(log => log.date === today);

    if (existingLog) {
      await supabase
        .from('body_weight_logs')
        .update({ weight: weightNum })
        .eq('id', existingLog.id);
    } else {
      await supabase
        .from('body_weight_logs')
        .insert({
          user_id: user?.id,
          date: today,
          weight: weightNum,
          unit: 'kg'
        });
    }

    setNewWeight('');
    fetchData(); // Refresh data
  };

  // Prepare Heatmap Data
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = subDays(new Date(), 29 - i);
    return format(d, 'yyyy-MM-dd');
  });

  const heatmapData = last30Days.map(dateStr => {
    const dayWorkouts = workouts.filter(w => w.date === dateStr);
    return {
      date: dateStr,
      count: dayWorkouts.length,
      intensity: dayWorkouts.length > 0 ? Math.min(dayWorkouts.reduce((acc, w) => acc + w.duration_minutes, 0) / 30, 4) : 0 // 0-4 scale
    };
  });

  // Calculate Streak
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  
  // Sort workouts by date descending
  const sortedWorkouts = [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const workoutDates = Array.from(new Set(sortedWorkouts.map(w => w.date)));

  if (workoutDates.includes(todayStr) || workoutDates.includes(yesterdayStr)) {
    let checkDate = workoutDates.includes(todayStr) ? new Date() : subDays(new Date(), 1);
    while (workoutDates.includes(format(checkDate, 'yyyy-MM-dd'))) {
      currentStreak++;
      checkDate = subDays(checkDate, 1);
    }
  }

  // Calculate max streak (simple version for last 30 days)
  heatmapData.forEach(day => {
    if (day.count > 0) {
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  });

  // Prepare Volume Data (Per Muscle Group)
  const today = new Date();
  const currentWeekStart = startOfWeek(today);
  const previousWeekStart = subWeeks(currentWeekStart, 1);

  const currentWeekWorkouts = workouts.filter(w => new Date(w.date) >= currentWeekStart);
  const previousWeekWorkouts = workouts.filter(w => new Date(w.date) >= previousWeekStart && new Date(w.date) < currentWeekStart);

  const calculateMuscleVolume = (workoutList: any[]) => {
    const volumeMap: Record<string, number> = {};
    workoutList.forEach(w => {
      const wExercises = exercises.filter(ex => ex.workout_id === w.id);
      wExercises.forEach(ex => {
        // Assuming exercise has muscle group, or we use workout muscle group
        // If we don't have exercise-level muscle group, we distribute volume evenly across workout muscle groups
        const vol = ex.sets * ex.reps * ex.weight;
        if (Array.isArray(w.muscle_groups) && w.muscle_groups.length > 0) {
          const volPerMuscle = vol / w.muscle_groups.length;
          w.muscle_groups.forEach((m: string) => {
            volumeMap[m] = (volumeMap[m] || 0) + volPerMuscle;
          });
        }
      });
    });
    return volumeMap;
  };

  const currentWeekVolume = calculateMuscleVolume(currentWeekWorkouts);
  const previousWeekVolume = calculateMuscleVolume(previousWeekWorkouts);

  const allMuscles = Array.from(new Set([...Object.keys(currentWeekVolume), ...Object.keys(previousWeekVolume)]));
  
  const volumeData = allMuscles.map(muscle => ({
    muscle,
    current: currentWeekVolume[muscle] || 0,
    previous: previousWeekVolume[muscle] || 0,
  })).sort((a, b) => b.current - a.current);

  // Calculate balance score (0-100)
  const totalVolume = Object.values(currentWeekVolume).reduce((a, b) => a + b, 0);
  let balanceScore = 100;
  if (totalVolume > 0 && allMuscles.length > 0) {
    const idealVolumePerMuscle = totalVolume / allMuscles.length;
    const deviations = allMuscles.map(m => Math.abs((currentWeekVolume[m] || 0) - idealVolumePerMuscle));
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / allMuscles.length;
    balanceScore = Math.max(0, 100 - (avgDeviation / idealVolumePerMuscle) * 100);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00D4FF]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8 max-w-4xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-white mb-4">Progress & Analytics</h1>
        
        {/* Tabs */}
        <div className="flex space-x-2 bg-[#1A1A1A] p-1 rounded-xl overflow-x-auto hide-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'overload', label: 'Overload', icon: TrendingUp },
            { id: 'prs', label: 'Records', icon: Trophy },
            { id: 'weight', label: 'Body Weight', icon: Scale }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-w-[100px] flex items-center justify-center space-x-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'bg-[#00D4FF] text-black' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Heatmap */}
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-[#00D4FF]" />
                  Workout Frequency (30 Days)
                </h2>
                <div className="flex space-x-4 text-right">
                  <div>
                    <p className="text-xs text-gray-400">Current Streak</p>
                    <p className="text-lg font-bold text-[#00D4FF]">{currentStreak} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Max Streak</p>
                    <p className="text-lg font-bold text-white">{maxStreak} days</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {heatmapData.map((day, i) => {
                  let bgColor = 'bg-white/5';
                  if (day.intensity > 0) bgColor = 'bg-[#00D4FF]/20';
                  if (day.intensity > 1) bgColor = 'bg-[#00D4FF]/40';
                  if (day.intensity > 2) bgColor = 'bg-[#00D4FF]/70';
                  if (day.intensity > 3) bgColor = 'bg-[#00D4FF]';

                  return (
                    <div 
                      key={day.date}
                      title={`${day.date}: ${day.count} workouts`}
                      className={`w-[calc(14.28%-6px)] aspect-square rounded-sm ${bgColor} transition-colors hover:ring-2 hover:ring-white/50`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-end space-x-2 mt-3 text-xs text-gray-500">
                <span>Less</span>
                <div className="flex space-x-1">
                  <div className="w-3 h-3 rounded-sm bg-white/5"></div>
                  <div className="w-3 h-3 rounded-sm bg-[#00D4FF]/20"></div>
                  <div className="w-3 h-3 rounded-sm bg-[#00D4FF]/40"></div>
                  <div className="w-3 h-3 rounded-sm bg-[#00D4FF]/70"></div>
                  <div className="w-3 h-3 rounded-sm bg-[#00D4FF]"></div>
                </div>
                <span>More</span>
              </div>
            </div>

            {/* Volume Chart */}
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-[#00FF87]" />
                  Weekly Volume by Muscle
                </h2>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Balance Score</p>
                  <p className={`text-lg font-bold ${balanceScore > 80 ? 'text-[#00FF87]' : balanceScore > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {balanceScore.toFixed(0)}/100
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4 mb-4 text-xs">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 rounded-sm bg-[#00FF87]"></div>
                  <span className="text-gray-400">This Week</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 rounded-sm bg-white/20"></div>
                  <span className="text-gray-400">Last Week</span>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="muscle" stroke="#666" tick={{fill: '#666', fontSize: 10}} axisLine={false} tickLine={false} />
                    <YAxis stroke="#666" tick={{fill: '#666', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/1000).toFixed(1)}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      formatter={(value: number) => [`${value.toFixed(0)} kg`, 'Volume']}
                    />
                    <Bar dataKey="previous" fill="rgba(255,255,255,0.2)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current" fill="#00FF87" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'overload' && (
          <div className="space-y-6">
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
                <h2 className="text-lg font-bold text-white flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-[#00D4FF]" />
                  Progressive Overload
                </h2>
                <div className="relative w-full md:w-64">
                  <select
                    value={selectedExerciseForOverload}
                    onChange={(e) => setSelectedExerciseForOverload(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-white appearance-none focus:outline-none focus:border-[#00D4FF]"
                  >
                    {Array.from(new Set(exercises.map(ex => ex.name))).map(name => (
                      <option key={name as string} value={name as string}>{name as string}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>

              {selectedExerciseForOverload ? (() => {
                const overloadData = exercises
                  .filter(ex => ex.name === selectedExerciseForOverload)
                  .map(ex => ({
                    date: ex.workouts.date,
                    weight: ex.weight,
                    volume: ex.weight * ex.reps * ex.sets
                  }))
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                // Group by date to get max weight per day
                const groupedData = overloadData.reduce((acc, curr) => {
                  if (!acc[curr.date] || acc[curr.date].weight < curr.weight) {
                    acc[curr.date] = curr;
                  }
                  return acc;
                }, {} as Record<string, any>);

                const chartData = Object.values(groupedData) as any[];

                if (chartData.length < 2) {
                  return (
                    <div className="text-center py-12 text-gray-500">
                      <p>Not enough data to show progression.</p>
                      <p className="text-sm">Log this exercise at least twice.</p>
                    </div>
                  );
                }

                const firstWeight = chartData[0].weight;
                const lastWeight = chartData[chartData.length - 1].weight;
                const percentChange = ((lastWeight - firstWeight) / firstWeight) * 100;
                
                let trendColor = '#FFD700'; // Yellow for no change
                if (percentChange > 0) trendColor = '#00FF87'; // Green for positive
                if (percentChange < 0) trendColor = '#FF4444'; // Red for negative

                return (
                  <>
                    <div className="flex items-center justify-between mb-6 bg-black p-4 rounded-xl border border-white/5">
                      <div>
                        <p className="text-sm text-gray-400">Progression</p>
                        <p className={`text-2xl font-bold`} style={{ color: trendColor }}>
                          {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Current Max</p>
                        <p className="text-2xl font-bold text-white">{lastWeight} kg</p>
                      </div>
                    </div>

                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            stroke="#666" 
                            tick={{fill: '#666'}} 
                            axisLine={false} 
                            tickLine={false}
                            tickFormatter={(val) => format(new Date(val), 'MMM d')}
                          />
                          <YAxis 
                            domain={['auto', 'auto']} 
                            stroke="#666" 
                            tick={{fill: '#666'}} 
                            axisLine={false} 
                            tickLine={false} 
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                            labelFormatter={(val) => format(new Date(val), 'MMM d, yyyy')}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="weight" 
                            stroke={trendColor} 
                            strokeWidth={3}
                            dot={{ fill: trendColor, strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6, fill: '#fff' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                );
              })() : (
                <div className="text-center py-12 text-gray-500">
                  <p>Select an exercise to view progression.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'prs' && (
          <div className="space-y-4">
            {prs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No personal records yet.</p>
                <p className="text-sm">Keep lifting to set some PRs!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {prs.map(pr => (
                  <div key={pr.id} className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <ExerciseImage 
                          exerciseId={pr.exercise_db_id} 
                          exerciseName={pr.exercise_name} 
                          size="md"
                        />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">{pr.exercise_name}</h3>
                        <p className="text-sm text-gray-400">Achieved {format(new Date(pr.achieved_date), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-[#00D4FF]">{pr.best_weight} <span className="text-sm text-gray-400 font-medium">kg</span></div>
                      <div className="text-sm text-gray-400">{pr.best_reps} reps</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'weight' && (
          <div className="space-y-6">
            {/* Log Weight Input */}
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-end space-y-4 md:space-y-0 md:space-x-4">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-400 mb-2">Log Today's Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  placeholder="e.g. 75.5"
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <button
                onClick={handleLogWeight}
                disabled={!newWeight}
                className="w-full md:w-auto bg-[#00D4FF] text-black px-6 py-3 rounded-xl font-bold hover:bg-[#00D4FF]/90 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>

            {/* Weight Stats */}
            {weightLogs.length > 0 && (() => {
              const weights = weightLogs.map(l => l.weight);
              const current = weights[weights.length - 1];
              const lowest = Math.min(...weights);
              const highest = Math.max(...weights);
              const average = (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1);

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Current</p>
                    <p className="text-xl font-bold text-[#00D4FF]">{current} kg</p>
                  </div>
                  <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Lowest</p>
                    <p className="text-xl font-bold text-white">{lowest} kg</p>
                  </div>
                  <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Highest</p>
                    <p className="text-xl font-bold text-white">{highest} kg</p>
                  </div>
                  <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Average</p>
                    <p className="text-xl font-bold text-white">{average} kg</p>
                  </div>
                </div>
              );
            })()}

            {/* BMI Calculator */}
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
              <h2 className="text-lg font-bold text-white mb-4">BMI Calculator</h2>
              <div className="flex flex-col md:flex-row items-end space-y-4 md:space-y-0 md:space-x-4">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-medium text-gray-400 mb-2">Height (cm)</label>
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="e.g. 175"
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>
                <div className="flex-1 w-full bg-black border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-gray-400">Your BMI</span>
                  <span className={`font-bold text-xl ${
                    bmiValue ? (
                      parseFloat(bmiValue) < 18.5 ? 'text-blue-400' :
                      parseFloat(bmiValue) < 25 ? 'text-[#00FF87]' :
                      parseFloat(bmiValue) < 30 ? 'text-yellow-400' : 'text-red-400'
                    ) : 'text-white'
                  }`}>
                    {bmiValue || '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Weight Chart */}
            {weightLogs.length > 0 ? (
              <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
                <h2 className="text-lg font-bold text-white mb-4">Weight Trend</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightLogs}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="#666" 
                        tick={{fill: '#666'}} 
                        axisLine={false} 
                        tickLine={false}
                        tickFormatter={(val) => format(new Date(val), 'MMM d')}
                      />
                      <YAxis 
                        domain={['auto', 'auto']} 
                        stroke="#666" 
                        tick={{fill: '#666'}} 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                        labelFormatter={(val) => format(new Date(val), 'MMM d, yyyy')}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="weight" 
                        stroke="#00D4FF" 
                        strokeWidth={3}
                        dot={{ fill: '#00D4FF', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: '#fff' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 bg-[#1A1A1A] rounded-2xl border border-white/5">
                <Scale className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No weight logs yet.</p>
                <p className="text-sm">Log your weight to see trends.</p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};
