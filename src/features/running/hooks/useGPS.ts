import { useState, useEffect, useRef } from 'react';
import type { GpsPoint } from '../utils/gpsCalculations';

interface UseGPSReturn {
  position: GpsPoint | null;
  error: string | null;
  errorCode: number | null;
  tracking: boolean;
  startTracking: () => boolean;
  stopTracking: () => void;
}

export const useGPS = (): UseGPSReturn => {
  const [position, setPosition] = useState<GpsPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const startTracking = () => {
    if (!window.isSecureContext) {
      setError('Location tracking requires HTTPS (or localhost).');
      setErrorCode(null);
      return false;
    }

    if (!navigator.geolocation) {
      setError('GPS not available on this device.');
      setErrorCode(null);
      return false;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setError(null);
    setErrorCode(null);
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          });
          setError(null);
          setErrorCode(null);
          setTracking(true);
        },
        (err) => {
          setError(err.message);
          setErrorCode(err.code);
          setTracking(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    } catch (watchError: any) {
      setError(watchError?.message || 'Failed to start GPS tracking.');
      setErrorCode(null);
      setTracking(false);
      return false;
    }
    return true;
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  };

  useEffect(() => () => stopTracking(), []);

  return { position, error, errorCode, tracking, startTracking, stopTracking };
};
