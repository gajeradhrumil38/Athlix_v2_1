import React from 'react';
import { motion } from 'framer-motion';

interface MuscleMapProps {
  volumeData: Record<string, number>; // Muscle group -> volume
}

// Simplified SVG paths for demonstration
const MUSCLE_PATHS = {
  Chest: "M30 40 Q50 30 70 40 Q70 60 50 70 Q30 60 30 40",
  Back: "M30 40 Q50 30 70 40 Q70 80 50 90 Q30 80 30 40", // Back view
  Shoulders: "M20 30 Q30 20 40 30 Q30 40 20 30 M80 30 Q70 20 60 30 Q70 40 80 30",
  Arms: "M10 40 Q20 50 15 70 Q5 50 10 40 M90 40 Q80 50 85 70 Q95 50 90 40",
  Core: "M40 70 Q50 65 60 70 Q60 90 50 95 Q40 90 40 70",
  Legs: "M35 95 Q45 120 40 150 Q30 120 35 95 M65 95 Q55 120 60 150 Q70 120 65 95",
};

export const MuscleMap: React.FC<MuscleMapProps> = ({ volumeData }) => {
  const maxVolume = Math.max(...(Object.values(volumeData) as number[]), 1);

  const getOpacity = (muscle: string) => {
    const volume = volumeData[muscle] || 0;
    if (volume === 0) return 0.1;
    return 0.3 + (volume / maxVolume) * 0.7; // Scale from 0.3 to 1.0
  };

  return (
    <div className="relative w-full aspect-[1/2] max-w-[200px] mx-auto">
      {/* Base Outline */}
      <svg viewBox="0 0 100 160" className="w-full h-full drop-shadow-[0_0_10px_rgba(200,255,0,0.2)]">
        {/* Head */}
        <circle cx="50" cy="15" r="10" fill="none" stroke="#333" strokeWidth="1" />
        {/* Torso Outline */}
        <path d="M30 30 Q50 25 70 30 L80 40 L70 90 Q50 100 30 90 L20 40 Z" fill="none" stroke="#333" strokeWidth="1" />
        {/* Arms Outline */}
        <path d="M20 40 L10 70 L15 90 M80 40 L90 70 L85 90" fill="none" stroke="#333" strokeWidth="1" />
        {/* Legs Outline */}
        <path d="M30 90 L35 150 M70 90 L65 150 M50 100 L50 120" fill="none" stroke="#333" strokeWidth="1" />

        {/* Muscle Groups */}
        {Object.entries(MUSCLE_PATHS).map(([muscle, path]) => (
          <motion.path
            key={muscle}
            d={path}
            fill="var(--accent)"
            initial={{ opacity: 0.1 }}
            animate={{ opacity: getOpacity(muscle) }}
            transition={{ duration: 1 }}
            className="cursor-pointer hover:stroke-white hover:stroke-2"
          >
            <title>{muscle}: {volumeData[muscle] || 0} volume</title>
          </motion.path>
        ))}
      </svg>
    </div>
  );
};
