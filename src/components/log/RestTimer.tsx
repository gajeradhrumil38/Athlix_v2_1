import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Play, Pause } from 'lucide-react';

interface RestTimerProps {
  isActive: boolean;
  onComplete: () => void;
  onClose: () => void;
}

export const RestTimer: React.FC<RestTimerProps> = ({ isActive, onComplete, onClose }) => {
  const [timeLeft, setTimeLeft] = useState(90);
  const [totalTime, setTotalTime] = useState(90);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (isActive && !isRunning) {
      setTimeLeft(90);
      setTotalTime(90);
      setIsRunning(true);
    }
  }, [isActive]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      setIsRunning(false);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      onComplete();
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, onComplete]);

  if (!isActive) return null;

  const progress = timeLeft / totalTime;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const setTimer = (seconds: number) => {
    setTimeLeft(seconds);
    setTotalTime(seconds);
    setIsRunning(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-[80px] left-1/2 -translate-x-1/2 w-[90%] max-w-[400px] bg-[#1A1A1A] border border-[#EF9F27]/30 rounded-2xl p-3 shadow-[0_8px_32px_rgba(0,0,0,0.8)] z-50 flex items-center gap-3"
    >
      <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 40 40" className="w-full h-full transform -rotate-90">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="#333" strokeWidth="4" />
          <circle 
            cx="20" cy="20" r={radius} fill="none" stroke="#EF9F27" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <span className="absolute text-[10px] font-bold text-[#EF9F27]">{formatTime(timeLeft)}</span>
      </div>

      <div className="flex-1 flex gap-1.5">
        {[60, 90, 120].map(sec => (
          <button 
            key={sec} 
            onClick={() => setTimer(sec)}
            className="flex-1 py-1.5 rounded-lg bg-[#2A2A2A] text-[10px] font-bold text-white hover:bg-[#333] transition-colors"
          >
            {sec === 60 ? '1m' : sec === 90 ? '1.5m' : '2m'}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        <button onClick={() => setIsRunning(!isRunning)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2A] text-white">
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2A] text-[var(--text-muted)] hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
