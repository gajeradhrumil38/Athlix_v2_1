-- Supabase Schema for Athlix

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  unit_preference TEXT DEFAULT 'kg' CHECK (unit_preference IN ('kg', 'lbs')),
  theme_preference TEXT DEFAULT 'dark' CHECK (theme_preference IN ('dark', 'darker')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Workouts table
CREATE TABLE public.workouts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  muscle_groups TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Exercises table
CREATE TABLE public.exercises (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workout_id UUID REFERENCES public.workouts ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight FLOAT NOT NULL,
  unit TEXT DEFAULT 'kg' CHECK (unit IN ('kg', 'lbs')),
  order_index INTEGER NOT NULL,
  exercise_db_id TEXT
);

-- Templates table
CREATE TABLE public.templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Template Exercises table
CREATE TABLE public.template_exercises (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  template_id UUID REFERENCES public.templates ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  default_sets INTEGER NOT NULL,
  default_reps INTEGER NOT NULL,
  default_weight FLOAT NOT NULL,
  order_index INTEGER NOT NULL,
  exercise_db_id TEXT
);

-- Row Level Security (RLS)

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_exercises ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Workouts Policies
CREATE POLICY "Users can view their own workouts" ON public.workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own workouts" ON public.workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own workouts" ON public.workouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own workouts" ON public.workouts FOR DELETE USING (auth.uid() = user_id);

-- Exercises Policies
CREATE POLICY "Users can view their own exercises" ON public.exercises FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);
CREATE POLICY "Users can insert their own exercises" ON public.exercises FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);
CREATE POLICY "Users can update their own exercises" ON public.exercises FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);
CREATE POLICY "Users can delete their own exercises" ON public.exercises FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);

-- Templates Policies
CREATE POLICY "Users can view their own templates" ON public.templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own templates" ON public.templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own templates" ON public.templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own templates" ON public.templates FOR DELETE USING (auth.uid() = user_id);

-- Template Exercises Policies
CREATE POLICY "Users can view their own template exercises" ON public.template_exercises FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.user_id = auth.uid())
);
CREATE POLICY "Users can insert their own template exercises" ON public.template_exercises FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.user_id = auth.uid())
);
CREATE POLICY "Users can update their own template exercises" ON public.template_exercises FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.user_id = auth.uid())
);
CREATE POLICY "Users can delete their own template exercises" ON public.template_exercises FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.user_id = auth.uid())
);

-- Body Weight Logs
CREATE TABLE public.body_weight_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  weight FLOAT NOT NULL,
  unit TEXT DEFAULT 'kg' CHECK (unit IN ('kg', 'lbs')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Personal Records
CREATE TABLE public.personal_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  best_weight FLOAT NOT NULL,
  best_reps INTEGER NOT NULL,
  achieved_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  exercise_db_id TEXT
);

-- Exercise Library
CREATE TABLE public.exercise_library (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  is_custom BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  exercise_db_id TEXT
);

-- Rest Timer Preferences
CREATE TABLE public.rest_timer_preferences (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  default_duration_seconds INTEGER DEFAULT 90
);

-- Enable RLS
ALTER TABLE public.body_weight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rest_timer_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for body_weight_logs
CREATE POLICY "Users can view their own body weight logs" ON public.body_weight_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own body weight logs" ON public.body_weight_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own body weight logs" ON public.body_weight_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own body weight logs" ON public.body_weight_logs FOR DELETE USING (auth.uid() = user_id);

-- Policies for personal_records
CREATE POLICY "Users can view their own personal records" ON public.personal_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own personal records" ON public.personal_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own personal records" ON public.personal_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own personal records" ON public.personal_records FOR DELETE USING (auth.uid() = user_id);

-- Policies for exercise_library
CREATE POLICY "Users can view default and their own custom exercises" ON public.exercise_library FOR SELECT USING (is_custom = false OR auth.uid() = user_id);
CREATE POLICY "Users can insert their own custom exercises" ON public.exercise_library FOR INSERT WITH CHECK (is_custom = true AND auth.uid() = user_id);
CREATE POLICY "Users can update their own custom exercises" ON public.exercise_library FOR UPDATE USING (is_custom = true AND auth.uid() = user_id);
CREATE POLICY "Users can delete their own custom exercises" ON public.exercise_library FOR DELETE USING (is_custom = true AND auth.uid() = user_id);

-- Policies for rest_timer_preferences
CREATE POLICY "Users can view their own rest timer preferences" ON public.rest_timer_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own rest timer preferences" ON public.rest_timer_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own rest timer preferences" ON public.rest_timer_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Insert default exercises
INSERT INTO public.exercise_library (name, muscle_group, is_custom) VALUES
('Bench Press', 'Chest', false), ('Incline Bench Press', 'Chest', false), ('Decline Bench Press', 'Chest', false), ('Dumbbell Flyes', 'Chest', false), ('Cable Crossover', 'Chest', false), ('Push-Ups', 'Chest', false), ('Chest Dips', 'Chest', false), ('Pec Deck Machine', 'Chest', false), ('Landmine Press', 'Chest', false),
('Deadlift', 'Back', false), ('Pull-Ups', 'Back', false), ('Lat Pulldown', 'Back', false), ('Seated Cable Row', 'Back', false), ('Bent Over Row', 'Back', false), ('T-Bar Row', 'Back', false), ('Single Arm Dumbbell Row', 'Back', false), ('Face Pulls', 'Back', false), ('Hyperextensions', 'Back', false), ('Shrugs', 'Back', false),
('Overhead Press', 'Shoulders', false), ('Dumbbell Shoulder Press', 'Shoulders', false), ('Lateral Raises', 'Shoulders', false), ('Front Raises', 'Shoulders', false), ('Rear Delt Flyes', 'Shoulders', false), ('Arnold Press', 'Shoulders', false), ('Upright Row', 'Shoulders', false), ('Cable Lateral Raise', 'Shoulders', false),
('Barbell Curl', 'Biceps', false), ('Dumbbell Curl', 'Biceps', false), ('Hammer Curl', 'Biceps', false), ('Preacher Curl', 'Biceps', false), ('Concentration Curl', 'Biceps', false), ('Cable Curl', 'Biceps', false), ('Incline Dumbbell Curl', 'Biceps', false), ('Spider Curl', 'Biceps', false),
('Tricep Pushdown', 'Triceps', false), ('Skull Crushers', 'Triceps', false), ('Close Grip Bench Press', 'Triceps', false), ('Overhead Tricep Extension', 'Triceps', false), ('Dips', 'Triceps', false), ('Diamond Push-Ups', 'Triceps', false), ('Cable Kickback', 'Triceps', false),
('Squat', 'Legs', false), ('Leg Press', 'Legs', false), ('Romanian Deadlift', 'Legs', false), ('Leg Extension', 'Legs', false), ('Leg Curl', 'Legs', false), ('Hack Squat', 'Legs', false), ('Bulgarian Split Squat', 'Legs', false), ('Calf Raises', 'Legs', false), ('Lunges', 'Legs', false), ('Sumo Deadlift', 'Legs', false), ('Hip Thrust', 'Legs', false), ('Glute Bridge', 'Legs', false), ('Step-Ups', 'Legs', false),
('Plank', 'Core', false), ('Crunches', 'Core', false), ('Russian Twist', 'Core', false), ('Leg Raises', 'Core', false), ('Cable Crunch', 'Core', false), ('Ab Wheel Rollout', 'Core', false), ('Hanging Knee Raise', 'Core', false), ('Side Plank', 'Core', false), ('Mountain Climbers', 'Core', false),
('Treadmill', 'Cardio', false), ('Cycling', 'Cardio', false), ('Rowing Machine', 'Cardio', false), ('Stair Climber', 'Cardio', false), ('Jump Rope', 'Cardio', false), ('HIIT', 'Cardio', false), ('Battle Ropes', 'Cardio', false), ('Swimming', 'Cardio', false), ('Elliptical', 'Cardio', false);

-- Triggers for automatic profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- User Dashboard Layout
CREATE TABLE public.user_dashboard_layout (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_dashboard_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dashboard layout" ON public.user_dashboard_layout FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own dashboard layout" ON public.user_dashboard_layout FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own dashboard layout" ON public.user_dashboard_layout FOR UPDATE USING (auth.uid() = user_id);
