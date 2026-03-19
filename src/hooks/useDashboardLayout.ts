import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_LAYOUT } from '../config/widgets'

export interface LayoutItem {
  id: string
  visible: boolean
  order: number
}

export const useDashboardLayout = () => {
  const { user } = useAuth()
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [loading, setLoading] = useState(true)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!user) return
    fetchLayout()
  }, [user])

  const fetchLayout = async () => {
    const { data } = await supabase
      .from('user_dashboard_layout')
      .select('layout')
      .eq('user_id', user!.id)
      .single()

    if (data?.layout && Array.isArray(data.layout)) {
      // Merge with DEFAULT_LAYOUT to handle new widgets
      // added after user saved their layout
      const saved = data.layout as LayoutItem[]
      const savedIds = saved.map(s => s.id)
      const newWidgets = DEFAULT_LAYOUT.filter(
        d => !savedIds.includes(d.id)
      )
      
      let merged = [...saved]
      const maxOrder = Math.max(...saved.map(s => s.order), 0)
      
      newWidgets.forEach((w, i) => {
        if (w.id === 'weekly_goal') {
          const quickStatsIndex = merged.findIndex(s => s.id === 'quick_stats')
          if (quickStatsIndex !== -1) {
            merged.splice(quickStatsIndex + 1, 0, { ...w, order: merged[quickStatsIndex].order + 0.5 })
          } else {
            merged.push({ ...w, order: maxOrder + i + 1 })
          }
        } else {
          merged.push({ ...w, order: maxOrder + i + 1 })
        }
      })

      merged = merged.sort((a, b) => a.order - b.order).map((m, i) => ({ ...m, order: i + 1 }))

      setLayout(merged)
    }
    setLoading(false)
  }

  const saveLayout = useCallback(async () => {
    if (!user) return
    await supabase
      .from('user_dashboard_layout')
      .upsert({
        user_id: user.id,
        layout: layout,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
    setIsDirty(false)
  }, [user, layout])

  const reorderWidgets = useCallback((newOrder: LayoutItem[]) => {
    const reindexed = newOrder.map((item, i) => ({
      ...item, order: i + 1
    }))
    setLayout(reindexed)
    setIsDirty(true)
  }, [])

  const toggleWidget = useCallback((id: string) => {
    setLayout(prev => prev.map(item =>
      item.id === id ? { ...item, visible: !item.visible } : item
    ))
    setIsDirty(true)
  }, [])

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT)
    setIsDirty(true)
  }, [])

  // Ordered visible widgets for home page
  const visibleWidgets = layout
    .filter(l => l.visible)
    .sort((a, b) => a.order - b.order)
    .map(l => l.id)

  return {
    layout, loading, isDirty,
    visibleWidgets,
    saveLayout, reorderWidgets,
    toggleWidget, resetLayout
  }
}
