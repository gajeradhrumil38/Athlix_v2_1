import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { User, Moon, Scale, Activity, LogOut, LayoutDashboard, ChevronRight, FileText, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Settings: React.FC = () => {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();
      
      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (field: string, value: any) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: value })
        .eq('id', user?.id);
      
      if (error) throw error;
      setProfile({ ...profile, [field]: value });
      toast.success('Settings updated');
    } catch (error: any) {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
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
                  value={profile?.full_name || ''}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#00D4FF]"
                />
                <button 
                  onClick={() => updateProfile('full_name', profile?.full_name)}
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
                onClick={() => updateProfile('unit_preference', 'kg')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${profile?.unit_preference === 'kg' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                kg
              </button>
              <button 
                onClick={() => updateProfile('unit_preference', 'lbs')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${profile?.unit_preference === 'lbs' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                lbs
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
                className={`px-3 py-1 text-sm rounded-md transition-colors ${profile?.theme_preference === 'dark' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                Dark
              </button>
              <button 
                onClick={() => updateProfile('theme_preference', 'darker')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${profile?.theme_preference === 'darker' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                Darker
              </button>
            </div>
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

        {/* Legal Section */}
        <div className="p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Legal</h3>

          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between group"
          >
            <div className="flex items-center space-x-3">
              <Shield className="w-5 h-5 text-gray-400 group-hover:text-[#00D4FF] transition-colors" />
              <div>
                <p className="text-white font-medium group-hover:text-[#00D4FF] transition-colors">Privacy Policy</p>
                <p className="text-xs text-gray-500">How we handle your data</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-[#00D4FF] transition-colors" />
          </a>

          <a
            href="/terms.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between group"
          >
            <div className="flex items-center space-x-3">
              <FileText className="w-5 h-5 text-gray-400 group-hover:text-[#00D4FF] transition-colors" />
              <div>
                <p className="text-white font-medium group-hover:text-[#00D4FF] transition-colors">Terms of Service</p>
                <p className="text-xs text-gray-500">Rules and conditions of use</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-[#00D4FF] transition-colors" />
          </a>
        </div>

        {/* Danger Zone */}
        <div className="p-6">
          <button 
            onClick={signOut}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 border border-red-500/20 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
