import React, { useState, useMemo } from 'react'
import Body, { ExtendedBodyPart, Slug } from 'react-muscle-highlighter'
import { getMuscleSlugLabel, MUSCLE_SLUG_LABELS, type MuscleSlug } from '../../lib/exerciseMuscles'

export interface MuscleData {
  [group: string]: { sessions: number; sets: number; load: number; relativeLoad: number }
}

interface MuscleMapProps {
  muscleData: MuscleData
  view: 'front' | 'back'
  onViewChange: (v: 'front' | 'back') => void
  title?: string
}

const VALID_SLUGS = new Set<Slug>(Object.keys(MUSCLE_SLUG_LABELS) as MuscleSlug[])

// Intensity scale 1-4 maps to these Athlix accent colors
const INTENSITY_COLORS = [
  '#1A3A52',   // 1 session  — very dim blue
  '#0E6080',   // 2 sessions — medium
  '#00A8CC',   // 3 sessions — bright teal
  'var(--accent)',   // 4+ sessions — full accent glow
]

type MuscleEntry = MuscleData[string]

const loadToIntensity = (load: number, maxLoad: number): number => {
  if (load <= 0 || maxLoad <= 0) return 0
  const ratio = load / maxLoad
  if (ratio >= 0.75) return 4
  if (ratio >= 0.45) return 3
  if (ratio >= 0.18) return 2
  return 1
}

export const MuscleMap: React.FC<MuscleMapProps> = ({
  muscleData, view, onViewChange, title
}) => {
  const [tooltip, setTooltip] = useState<{
    slug: string; x: number; y: number
  } | null>(null)

  // Convert Supabase data to bodyData array for the package
  const bodyData = useMemo((): ExtendedBodyPart[] => {
    const parts: ExtendedBodyPart[] = []
    const muscleEntries = Object.values(muscleData) as MuscleEntry[]
    const maxLoad = Math.max(...muscleEntries.map((entry) => entry.relativeLoad || entry.load || 0), 0)

    ;(Object.entries(muscleData) as Array<[string, MuscleEntry]>).forEach(([slug, data]) => {
      if (!VALID_SLUGS.has(slug as Slug)) return
      const intensity = loadToIntensity(data.relativeLoad || data.load, maxLoad)
      if (intensity === 0) return

      parts.push({ slug: slug as Slug, intensity })
    })
    return parts
  }, [muscleData])

  const handlePress = (
    part: ExtendedBodyPart,
    e?: React.MouseEvent
  ) => {
    const slug = part.slug || ''
    const rect = (e?.currentTarget as HTMLElement)
      ?.closest('.muscle-map-wrap')
      ?.getBoundingClientRect()
    setTooltip({
      slug,
      x: e ? e.clientX - (rect?.left || 0) : 100,
      y: e ? e.clientY - (rect?.top || 0) : 100,
    })
    setTimeout(() => setTooltip(null), 2200)
  }

  const trainedGroups = (Object.entries(muscleData) as Array<[string, MuscleEntry]>)
    .filter(([, d]) => (d.relativeLoad || d.load) > 0)
    .sort((a, b) => (b[1].relativeLoad || b[1].load) - (a[1].relativeLoad || a[1].load))

  return (
    <div style={{ background: 'linear-gradient(160deg, rgba(14,24,36,0.95) 0%, rgba(10,18,28,0.98) 65%, rgba(8,12,18,1) 100%)', borderRadius: 14,
      border: '0.5px solid var(--border)', padding: '10px 8px', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 0%, rgba(200,255,0,0.12), transparent 55%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8, position: 'relative', zIndex: 2 }}>
        <span style={{ fontSize: 9, letterSpacing: '1.2px',
          color: 'rgba(255,255,255,0.8)', fontWeight: 700, textTransform: 'uppercase' }}>
          {title || 'Muscle Map'}
        </span>
        {/* Front / Back toggle */}
        <div style={{ display: 'flex', gap: 4,
          background: 'rgba(12,20,30,0.7)', padding: 3,
          borderRadius: 999, border: '0.5px solid var(--border)' }}>
          {(['front', 'back'] as const).map(v => (
            <button key={v} onClick={() => onViewChange(v)}
              style={{
                padding: '3px 10px', borderRadius: 999,
                fontSize: 9, fontWeight: 700, border: 'none',
                cursor: 'pointer',
                background: view === v
                  ? 'rgba(200,255,0,0.18)' : 'transparent',
                color: view === v
                  ? 'var(--accent)' : '#cdd6e1',
                outline: view === v
                  ? '0.5px solid rgba(200,255,0,0.4)' : 'none',
                boxShadow: view === v ? '0 0 10px rgba(200,255,0,0.25)' : 'none',
              }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Body component */}
      <div className="muscle-map-wrap"
        style={{ position: 'relative', display: 'flex', flex: 1,
          justifyContent: 'center', alignItems: 'center', zIndex: 1 }}>
        <Body
          data={bodyData}
          side={view}
          gender="male"
          scale={0.92}
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
          const muscleSlug = tooltip.slug
          const d = muscleData[muscleSlug]
          const maxLoad = Math.max(...(Object.values(muscleData) as MuscleEntry[]).map((entry) => entry.relativeLoad || entry.load || 0), 0)
          const color = INTENSITY_COLORS[
            Math.max(loadToIntensity(d?.relativeLoad || d?.load || 0, maxLoad), 1) - 1
          ] || 'var(--accent)'
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
                color, marginBottom: 4 }}>{getMuscleSlugLabel(muscleSlug)}</div>
              {d && d.sessions > 0 ? (
                <>
                  <div style={{ fontSize: 9, color: '#3A5060' }}>
                    {d.sessions} session{d.sessions > 1 ? 's' : ''}
                    · {Math.round(d.sets)} sets
                    · {Math.round(d.load)} load
                    {d.relativeLoad > 0 ? ` · ${d.relativeLoad.toFixed(1)}x BW` : ''}
                  </div>
                  <div style={{ height: 3, background: '#1E2F42',
                    borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, maxLoad > 0 ? (((d.relativeLoad || d.load) / maxLoad) * 100) : 0)}%`,
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
        gap: 6, marginTop: 8, position: 'relative', zIndex: 2 }}>
        {trainedGroups.length === 0 ? (
          <span style={{ fontSize: 9, color: '#cdd6e1' }}>
            Log a workout to light up your muscles
          </span>
        ) : (
          trainedGroups.map(([group, d]) => (
            <div key={group}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 7, height: 7, borderRadius: 2,
                background: INTENSITY_COLORS[
                  Math.max(
                    loadToIntensity(
                      d.relativeLoad || d.load,
                      Math.max(...(Object.values(muscleData) as MuscleEntry[]).map((entry) => entry.relativeLoad || entry.load || 0), 0),
                    ),
                    1,
                  ) - 1
                ],
              }}/>
              <span style={{ fontSize: 9, color: '#8892A4' }}>
                {getMuscleSlugLabel(group)} {(d.relativeLoad || d.load).toFixed(1)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
