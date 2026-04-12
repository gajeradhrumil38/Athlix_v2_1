import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Moon, Scale, Activity, LogOut, LayoutDashboard, ChevronRight, Trash2, Dumbbell } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { convertWeight, type WeightUnit } from '../lib/units';

export const Settings: React.FC = () => {
  const { user, profile, loading, signOut, deleteAccount, updateProfile: saveProfileUpdate } = useAuth();
  const navigate = useNavigate();
  const [draftProfile, setDraftProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const bodyWeightKg =
    draftProfile?.body_weight && draftProfile?.body_weight_unit
      ? draftProfile.body_weight_unit === 'lbs'
        ? Number(draftProfile.body_weight) * 0.45359237
        : Number(draftProfile.body_weight)
      : null;
  const heightMeters =
    draftProfile?.height_feet != null && draftProfile?.height_inches != null
      ? ((Number(draftProfile.height_feet) * 12) + Number(draftProfile.height_inches)) * 0.0254
      : null;
  const bmi =
    bodyWeightKg && heightMeters && heightMeters > 0
      ? bodyWeightKg / (heightMeters * heightMeters)
      : null;

  useEffect(() => {
    setDraftProfile(profile);
  }, [profile]);

  const updateProfile = async (field: string, value: any) => {
    setSaving(true);
    try {
      await saveProfileUpdate({ [field]: value });
      toast.success('Settings updated');
    } catch (error: any) {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleUnitPreferenceChange = async (nextUnit: WeightUnit) => {
    if (!draftProfile || draftProfile.unit_preference === nextUnit) return;
    setSaving(true);
    try {
      await saveProfileUpdate({ unit_preference: nextUnit });
      toast.success(`Updated to ${nextUnit}`);
    } catch (error: any) {
      toast.error('Failed to update weight unit');
    } finally {
      setSaving(false);
    }
  };

  const handleDraftBodyWeightUnitChange = (nextUnit: WeightUnit) => {
    setDraftProfile((prev: any) => {
      if (!prev || prev.body_weight_unit === nextUnit) return prev;
      const nextWeight =
        prev.body_weight == null
          ? null
          : convertWeight(Number(prev.body_weight), prev.body_weight_unit, nextUnit, 0.1);
      return { ...prev, body_weight: nextWeight, body_weight_unit: nextUnit };
    });
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    const confirmed = window.confirm(
      'Delete this local account and all workouts, templates, progress, and settings on this browser? This cannot be undone.',
    );
    if (!confirmed) return;

    try {
      await deleteAccount();
      toast.success('Account and local data deleted');
      navigate('/auth', { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete account');
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-12 bg-white/5 rounded-xl w-1/3"></div>
      <div className="h-64 bg-white/5 rounded-2xl"></div>
    </div>;
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8 max-w-2xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </header>

      <div className="bg-[#1A1A1A] rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5">
        {/* Profile Section */}
        <div className="p-6">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-[#00D4FF]/10 flex items-center justify-center border border-[#00D4FF]/20 text-2xl font-bold text-[#00D4FF]">
              {profile?.full_name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{profile?.full_name || 'Athlete'}</h2>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={draftProfile?.full_name || ''}
                  onChange={(e) => setDraftProfile({ ...draftProfile, full_name: e.target.value })}
                  className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#00D4FF]"
                />
                <button 
                  onClick={() => updateProfile('full_name', draftProfile?.full_name)}
                  disabled={saving}
                  className="px-4 py-2 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="p-6 space-y-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Preferences</h3>
          
          <Link to="/settings/layout" className="flex items-center justify-between group">
            <div className="flex items-center space-x-3">
              <LayoutDashboard className="w-5 h-5 text-gray-400 group-hover:text-[#00D4FF] transition-colors" />
              <div>
                <p className="text-white font-medium group-hover:text-[#00D4FF] transition-colors">Dashboard Layout</p>
                <p className="text-xs text-gray-500">Customize your home screen widgets</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-[#00D4FF] transition-colors" />
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Scale className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-white font-medium">Weight Unit</p>
                <p className="text-xs text-gray-500">Choose your preferred unit</p>
              </div>
            </div>
            <div className="flex bg-black rounded-lg p-1 border border-white/10">
              <button 
                onClick={() => handleUnitPreferenceChange('kg')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${draftProfile?.unit_preference === 'kg' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                kg
              </button>
              <button 
                onClick={() => handleUnitPreferenceChange('lbs')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${draftProfile?.unit_preference === 'lbs' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                lbs
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Scale className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-white font-medium">Body Metrics</p>
                <p className="text-xs text-gray-500">Used for body-size adjusted muscle load.</p>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <input
                type="number"
                min="0"
                step="0.1"
                value={draftProfile?.body_weight ?? ''}
                onChange={(e) => setDraftProfile({ ...draftProfile, body_weight: e.target.value === '' ? null : Number(e.target.value) })}
                className="bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#00D4FF]"
                placeholder="Body weight"
              />
              <div className="flex bg-black rounded-lg p-1 border border-white/10">
                <button
                  onClick={() => handleDraftBodyWeightUnitChange('kg')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${draftProfile?.body_weight_unit === 'kg' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                >
                  kg
                </button>
                <button
                  onClick={() => handleDraftBodyWeightUnitChange('lbs')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${draftProfile?.body_weight_unit === 'lbs' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                >
                  lbs
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="0"
                step="1"
                value={draftProfile?.height_feet ?? ''}
                onChange={(e) => setDraftProfile({ ...draftProfile, height_feet: e.target.value === '' ? null : Number(e.target.value) })}
                className="bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#00D4FF]"
                placeholder="Height (ft)"
              />
              <input
                type="number"
                min="0"
                max="11"
                step="1"
                value={draftProfile?.height_inches ?? ''}
                onChange={(e) => setDraftProfile({ ...draftProfile, height_inches: e.target.value === '' ? null : Number(e.target.value) })}
                className="bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#00D4FF]"
                placeholder="Height (in)"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {bmi ? `BMI ${bmi.toFixed(1)}. Main load normalization uses body weight; height is stored for body-size context.` : 'Add weight and height to unlock body-size context.'}
              </p>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await saveProfileUpdate({
                      body_weight: draftProfile?.body_weight ?? null,
                      body_weight_unit: draftProfile?.body_weight_unit || 'kg',
                      height_feet: draftProfile?.height_feet ?? null,
                      height_inches: draftProfile?.height_inches ?? null,
                    });
                    toast.success('Body metrics updated');
                  } catch (error: any) {
                    toast.error('Failed to update body metrics');
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="px-4 py-2 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Moon className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-white font-medium">Theme</p>
                <p className="text-xs text-gray-500">Dark or Darker</p>
              </div>
            </div>
            <div className="flex bg-black rounded-lg p-1 border border-white/10">
              <button 
                onClick={() => updateProfile('theme_preference', 'dark')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${draftProfile?.theme_preference === 'dark' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                Dark
              </button>
              <button 
                onClick={() => updateProfile('theme_preference', 'darker')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${draftProfile?.theme_preference === 'darker' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                Darker
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Dumbbell className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-white font-medium">Allow Live Add Exercise</p>
                <p className="text-xs text-gray-500">When on, you can add new exercises during an active workout.</p>
              </div>
            </div>
            <button
              onClick={() => updateProfile('start_workout_enabled', !draftProfile?.start_workout_enabled)}
              disabled={saving}
              className={`w-14 h-8 rounded-full border transition-colors relative ${
                draftProfile?.start_workout_enabled
                  ? 'bg-[#00D4FF]/20 border-[#00D4FF]/40'
                  : 'bg-black border-white/10'
              }`}
              aria-label="Toggle start workout"
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full transition-all ${
                  draftProfile?.start_workout_enabled
                    ? 'left-7 bg-[#00D4FF]'
                    : 'left-1 bg-gray-500'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Dumbbell className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-white font-medium">Show Start Sheet</p>
                <p className="text-xs text-gray-500">Optional screen before workout start.</p>
              </div>
            </div>
            <button
              onClick={() => updateProfile('show_start_sheet', !draftProfile?.show_start_sheet)}
              disabled={saving}
              className={`w-14 h-8 rounded-full border transition-colors relative ${
                draftProfile?.show_start_sheet
                  ? 'bg-[#00D4FF]/20 border-[#00D4FF]/40'
                  : 'bg-black border-white/10'
              }`}
              aria-label="Toggle start sheet"
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full transition-all ${
                  draftProfile?.show_start_sheet
                    ? 'left-7 bg-[#00D4FF]'
                    : 'left-1 bg-gray-500'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Integrations Section */}
        <div className="p-6 space-y-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Integrations</h3>
          
          <div className="flex items-center justify-between opacity-50">
            <div className="flex items-center space-x-3">
              <Activity className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-white font-medium">Whoop</p>
                <p className="text-xs text-gray-500">Sync recovery & strain</p>
              </div>
            </div>
            <button disabled className="px-3 py-1.5 bg-white/5 text-xs text-gray-400 rounded-lg border border-white/10">
              Coming Soon
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="p-6 space-y-3">
          <button 
            onClick={signOut}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 border border-red-500/20 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>

          <button
            onClick={handleDeleteAccount}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 border border-red-600/30 rounded-xl text-red-300 hover:bg-red-600/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Account & Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
