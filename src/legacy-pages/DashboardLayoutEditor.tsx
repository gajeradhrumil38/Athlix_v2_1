import React from 'react'
import {
  DndContext, closestCenter, PointerSensor,
  TouchSensor, useSensor, useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ALL_WIDGETS } from '../config/widgets'
import { useDashboardLayout, LayoutItem } from '../hooks/useDashboardLayout'
import { useNavigate } from 'react-router-dom'
import { FitnessGlyph, widgetToGlyph } from '../components/FitnessIcons'

// ── Single sortable widget row ──
const SortableWidget: React.FC<{
  item: LayoutItem
  onToggle: (id: string) => void
}> = ({ item, onToggle }) => {
  const widget = ALL_WIDGETS.find(w => w.id === item.id)
  if (!widget) return null

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 mx-3 mb-1.5 px-3 py-2.5 rounded-xl transition-colors ${
        item.visible
          ? 'bg-[var(--bg-surface)] border border-[var(--border)]'
          : 'bg-[var(--bg-base)] border border-[var(--border)] opacity-40'
      } ${isDragging ? 'border-[var(--accent)]/30 shadow-lg' : ''}`}
    >
      {/* Drag handle — ONLY this triggers drag, not the whole row */}
      <button
        {...attributes}
        {...listeners}
        className="touch-none p-1 rounded cursor-grab active:cursor-grabbing"
        style={{
          color: item.visible ? 'var(--text-muted)' : '#1E2F42',
          fontSize: 18,
          lineHeight: 1
        }}
        aria-label="Drag to reorder"
      >
        ≡
      </button>

      {/* Order number */}
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
        style={{
          background: item.visible
            ? 'var(--accent-dim)' : 'var(--bg-elevated)',
          color: item.visible
            ? 'var(--accent)' : 'var(--text-muted)'
        }}
      >
        {item.visible ? item.order : '–'}
      </div>

      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] flex-shrink-0"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <FitnessGlyph
          name={widgetToGlyph[widget.icon] || 'spark'}
          size={16}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: item.visible
              ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {widget.name}
          </span>
          {widget.id === 'train_next' && (
            <span
              className="text-[7px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
              style={{
                background: 'rgba(93,202,165,.15)',
                color: '#5DCAA5',
                border: '0.5px solid rgba(93,202,165,.3)'
              }}
            >AI</span>
          )}
          {!widget.canHide && (
            <span
              className="text-[7px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)'
              }}
            >FIXED</span>
          )}
        </div>
        <div
          className="text-[9px] truncate mt-0.5"
          style={{ color: 'var(--text-muted)' }}
        >
          {widget.description}
        </div>
      </div>

      {/* Toggle — disabled for canHide:false widgets */}
      <button
        onClick={() => widget.canHide && onToggle(item.id)}
        disabled={!widget.canHide}
        className="flex-shrink-0 w-9 h-5 rounded-full relative transition-colors"
        style={{
          background: item.visible
            ? 'var(--accent)' : 'var(--bg-elevated)',
          opacity: widget.canHide ? 1 : 0.3,
          cursor: widget.canHide ? 'pointer' : 'not-allowed'
        }}
        aria-label={item.visible ? 'Hide widget' : 'Show widget'}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
          style={{ left: item.visible ? '18px' : '2px' }}
        />
      </button>
    </div>
  )
}

// ── Main editor page ──
export const DashboardLayoutEditor: React.FC = () => {
  const navigate = useNavigate()
  const {
    layout, isDirty, loading,
    saveLayout, reorderWidgets,
    toggleWidget, resetLayout
  } = useDashboardLayout()

  // dnd-kit sensors — touch + pointer with 8px activation distance
  // The 8px delay prevents accidental drags while scrolling
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,        // 200ms long-press to activate drag
        tolerance: 8       // 8px wiggle room
      }
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = layout.findIndex(l => l.id === active.id)
    const newIndex = layout.findIndex(l => l.id === over.id)
    reorderWidgets(arrayMove(layout, oldIndex, newIndex))

    // Haptic on mobile
    try { navigator.vibrate(10) } catch(e) {}
  }

  const handleSave = async () => {
    await saveLayout()
    try { navigator.vibrate([10, 50, 10]) } catch(e) {}
    navigate(-1)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="text-[var(--text-muted)] text-sm">Loading layout...</div>
      </div>
    )
  }

  const visibleItems = layout
    .filter(l => l.visible)
    .sort((a, b) => a.order - b.order)

  const hiddenItems = layout.filter(l => !l.visible)

  return (
    <div
      className="min-h-screen pb-24"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3"
        style={{
          background: 'var(--bg-base)',
          borderBottom: '0.5px solid var(--border)'
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="text-[11px]"
          style={{ color: 'var(--accent)' }}
        >
          ‹ Settings
        </button>
        <span className="text-[13px] font-bold">
          Dashboard Layout
        </span>
        <button
          onClick={handleSave}
          className="text-[11px] px-3 py-1.5 rounded-lg font-bold"
          style={{
            background: isDirty
              ? 'var(--accent)' : 'var(--bg-elevated)',
            color: isDirty ? '#000' : 'var(--text-muted)'
          }}
        >
          {isDirty ? 'Save' : 'Done'}
        </button>
      </div>

      {/* Hint banner */}
      <div
        className="mx-3 mt-3 mb-2 px-3 py-2 rounded-xl text-center text-[9px]"
        style={{
          background: 'var(--bg-surface)',
          border: '0.5px solid var(--border)',
          color: 'var(--text-muted)'
        }}
      >
        Hold <strong style={{ color:'var(--text-secondary)' }}>≡</strong> and drag to reorder
        · Toggle switch to show/hide
      </div>

      {/* Unsaved changes bar */}
      {isDirty && (
        <div
          className="mx-3 mb-2 px-3 py-2 rounded-xl flex items-center justify-between"
          style={{
            background: 'rgba(0,212,255,.08)',
            border: '0.5px solid rgba(0,212,255,.25)'
          }}
        >
          <span
            className="text-[10px]"
            style={{ color: 'var(--accent)' }}
          >
            Layout changed · Unsaved
          </span>
          <button
            onClick={handleSave}
            className="text-[10px] font-bold px-3 py-1 rounded-lg"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            Save now
          </button>
        </div>
      )}

      {/* VISIBLE widgets — sortable list */}
      <div
        className="text-[8px] font-bold tracking-[1.5px] px-4 pt-3 pb-2"
        style={{ color: 'var(--text-muted)' }}
      >
        VISIBLE WIDGETS
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleItems.map(i => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {visibleItems.map(item => (
            <SortableWidget
              key={item.id}
              item={item}
              onToggle={toggleWidget}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* HIDDEN widgets — not sortable, just toggle */}
      {hiddenItems.length > 0 && (
        <>
          <div
            className="text-[8px] font-bold tracking-[1.5px] px-4 pt-4 pb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            HIDDEN WIDGETS
          </div>
          {hiddenItems.map(item => (
            <SortableWidget
              key={item.id}
              item={item}
              onToggle={toggleWidget}
            />
          ))}
        </>
      )}

      {/* Reset button */}
      <button
        onClick={resetLayout}
        className="w-full text-center mt-4 pb-2 text-[10px]"
        style={{ color: 'var(--text-muted)' }}
      >
        Reset to default layout
      </button>
    </div>
  )
}
