import React, { useState, useMemo } from 'react'
import Body, { ExtendedBodyPart, Slug } from 'react-muscle-highlighter'

export interface MuscleData {
  [group: string]: { sessions: number; sets: number }
}

interface MuscleMapProps {
  muscleData: MuscleData
  view: 'front' | 'back'
  onViewChange: (v: 'front' | 'back') => void
}

// Map Supabase muscle_groups values → package slugs
const MUSCLE_SLUG_MAP: Record<string, Slug[]> = {
  'Chest':     ['chest'],
  'Back':      ['upper-back', 'lower-back', 'trapezius'],
  'Shoulders': ['deltoids'],
  'Biceps':    ['biceps'],
  'Triceps':   ['triceps'],
  'Legs':      ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductors'],
  'Core':      ['abs', 'obliques'],
  'Cardio':    ['quadriceps', 'calves', 'hamstring'],
  'Full Body': ['chest', 'upper-back', 'deltoids', 'biceps',
                'triceps', 'abs', 'quadriceps', 'hamstring'],
}

// Intensity scale 1-4 maps to these Athlix accent colors
const INTENSITY_COLORS = [
  '#1A3A52',   // 1 session  — very dim blue
  '#0E6080',   // 2 sessions — medium
  '#00A8CC',   // 3 sessions — bright teal
  '#00D4FF',   // 4+ sessions — full accent glow
]

const sessionsToIntensity = (sessions: number): number =>
  Math.min(Math.max(sessions, 0), 4)

export const MuscleMap: React.FC<MuscleMapProps> = ({
  muscleData, view, onViewChange
}) => {
  const [tooltip, setTooltip] = useState<{
    slug: string; x: number; y: number
  } | null>(null)

  // Convert Supabase data to bodyData array for the package
  const bodyData = useMemo((): ExtendedBodyPart[] => {
    const parts: ExtendedBodyPart[] = []
    const seen = new Set<string>()

    Object.entries(muscleData).forEach(([group, data]: [string, { sessions: number; sets: number }]) => {
      const slugs = MUSCLE_SLUG_MAP[group] || []
      const intensity = sessionsToIntensity(data.sessions)
      if (intensity === 0) return

      slugs.forEach(slug => {
        if (!seen.has(slug)) {
          seen.add(slug)
          parts.push({ slug, intensity })
        } else {
          // Already added — bump intensity if higher
          const existing = parts.find(p => p.slug === slug)
          if (existing && intensity > (existing.intensity || 0)) {
            existing.intensity = intensity
          }
        }
      })
    })
    return parts
  }, [muscleData])

  // Reverse lookup: slug → original muscle group name + data
  const slugToGroup = useMemo(() => {
    const map: Record<string, string> = {}
    Object.entries(MUSCLE_SLUG_MAP).forEach(([group, slugs]) => {
      slugs.forEach(s => { map[s] = group })
    })
    return map
  }, [])

  const handlePress = (
    part: ExtendedBodyPart,
    e?: React.MouseEvent
  ) => {
    const slug = part.slug || ''
    const group = slugToGroup[slug] || slug
    const rect = (e?.currentTarget as HTMLElement)
      ?.closest('.muscle-map-wrap')
      ?.getBoundingClientRect()
    setTooltip({
      slug: group,
      x: e ? e.clientX - (rect?.left || 0) : 100,
      y: e ? e.clientY - (rect?.top || 0) : 100,
    })
    setTimeout(() => setTooltip(null), 2200)
  }

  const trainedGroups = Object.entries(muscleData)
    .filter(([, d]: [string, { sessions: number; sets: number }]) => d.sessions > 0)
    .sort((a: [string, { sessions: number; sets: number }], b: [string, { sessions: number; sets: number }]) => b[1].sessions - a[1].sessions)

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 14,
      border: '0.5px solid var(--border)', padding: '10px 8px', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, letterSpacing: '1.5px',
          color: 'var(--text-muted)', fontWeight: 700 }}>
          TRAINED THIS WEEK
        </span>
        {/* Front / Back toggle */}
        <div style={{ display: 'flex', gap: 4,
          background: 'var(--bg-elevated)', padding: 3,
          borderRadius: 8, border: '0.5px solid var(--border)' }}>
          {(['front', 'back'] as const).map(v => (
            <button key={v} onClick={() => onViewChange(v)}
              style={{
                padding: '3px 10px', borderRadius: 6,
                fontSize: 9, fontWeight: 700, border: 'none',
                cursor: 'pointer',
                background: view === v
                  ? 'rgba(0,212,255,0.18)' : 'transparent',
                color: view === v
                  ? 'var(--accent)' : 'var(--text-muted)',
                outline: view === v
                  ? '0.5px solid rgba(0,212,255,0.4)' : 'none',
              }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Body component */}
      <div className="muscle-map-wrap"
        style={{ position: 'relative', display: 'flex', flex: 1,
          justifyContent: 'center', alignItems: 'center' }}>
        <Body
          data={bodyData}
          side={view}
          gender="male"
          scale={0.9}
          colors={INTENSITY_COLORS}
          defaultFill="#1A2538"
          border="#1E2F42"
          defaultStroke="#1E2F42"
          defaultStrokeWidth={1}
          onBodyPartPress={(part, side) =>
            handlePress(part)
          }
        />

        {/* Tooltip */}
        {tooltip && (() => {
          const group = tooltip.slug
          const d = muscleData[group]
          const color = INTENSITY_COLORS[
            Math.min((d?.sessions || 1), 4) - 1
          ] || '#00D4FF'
          return (
            <div style={{
              position: 'absolute',
              left: Math.max(10, Math.min(tooltip.x - 65, 180)),
              top: Math.max(10, tooltip.y - 65),
              background: '#141C28',
              border: '0.5px solid #1E2F42',
              borderRadius: 10,
              padding: '8px 12px',
              pointerEvents: 'none',
              zIndex: 20,
              minWidth: 130,
              boxShadow: '0 8px 24px rgba(0,0,0,.8)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700,
                color, marginBottom: 4 }}>{group}</div>
              {d && d.sessions > 0 ? (
                <>
                  <div style={{ fontSize: 9, color: '#3A5060' }}>
                    {d.sessions} session{d.sessions > 1 ? 's' : ''}
                    · {d.sets} sets this week
                  </div>
                  <div style={{ height: 3, background: '#1E2F42',
                    borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, d.sessions * 25)}%`,
                      height: '100%', background: color, borderRadius: 2
                    }}/>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 9, color: '#3A5060' }}>
                  Not trained this week
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Dynamic legend — only trained groups */}
      <div style={{ display: 'flex', flexWrap: 'wrap',
        gap: 6, marginTop: 8 }}>
        {trainedGroups.length === 0 ? (
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            Log a workout to light up your muscles
          </span>
        ) : (
          trainedGroups.map(([group, d]: [string, { sessions: number; sets: number }]) => (
            <div key={group}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 7, height: 7, borderRadius: 2,
                background: INTENSITY_COLORS[
                  Math.min(d.sessions, 4) - 1
                ],
              }}/>
              <span style={{ fontSize: 9, color: '#8892A4' }}>
                {group} ×{d.sessions}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
