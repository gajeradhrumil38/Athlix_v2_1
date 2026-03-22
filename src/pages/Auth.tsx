import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Activity } from 'lucide-react';

export const Auth: React.FC = () => {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0],
            }
          }
        });
        if (error) throw error;
        toast.success('Check your email for the login link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success('Welcome back!');
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Activity className="mx-auto h-12 w-12 text-[#00D4FF]" />
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
          ATHLIX
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Your personal gym activity tracker
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#1A1A1A] py-8 px-4 shadow sm:rounded-2xl sm:px-10 border border-white/5">
          <form className="space-y-6" onSubmit={handleAuth}>
            <div>
              <label className="block text-sm font-medium text-gray-300">
                Email address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-white/10 rounded-xl bg-black text-white placeholder-gray-500 focus:outline-none focus:ring-[#00D4FF] focus:border-[#00D4FF] sm:text-sm transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-white/10 rounded-xl bg-black text-white placeholder-gray-500 focus:outline-none focus:ring-[#00D4FF] focus:border-[#00D4FF] sm:text-sm transition-colors"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-black bg-[#00D4FF] hover:bg-[#00D4FF]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00D4FF] focus:ring-offset-black disabled:opacity-50 transition-colors"
              >
                {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[#1A1A1A] text-gray-400">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="w-full flex justify-center py-3 px-4 border border-white/10 rounded-xl shadow-sm text-sm font-medium text-white bg-transparent hover:bg-white/5 focus:outline-none transition-colors"
              >
                {isSignUp ? 'Sign In instead' : 'Create an account'}
              </button>
            </div>
          </div>

          {isSignUp && (
            <p className="mt-4 text-center text-xs text-gray-500">
              By creating an account, you agree to our{' '}
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-[#00D4FF] hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-[#00D4FF] hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
