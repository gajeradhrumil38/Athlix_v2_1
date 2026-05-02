import React from 'react'
import {
  Home, Calendar, FileText, Activity, Plus,
  Search, Check, X, ChevronLeft, ChevronRight,
  TrendingUp, Settings, MoreHorizontal, History,
  ClipboardList, Footprints
} from 'lucide-react'

// Central registry of all UI icons used in the app
export const ICONS = {
  Home,
  Calendar,
  Log: FileText,
  Activity,
  Plus,
  Search,
  Check,
  Close: X,
  Back: ChevronLeft,
  Forward: ChevronRight,
  Trending: TrendingUp,
  Settings,
  More: MoreHorizontal,
  History,
  Clipboard: ClipboardList,
  Run: Footprints,
}

export type IconName = keyof typeof ICONS

// Standardized sizes for different contexts
export const ICON_SIZE = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32
}

interface AppIconProps {
  name: IconName
  size?: keyof typeof ICON_SIZE
  color?: string
  className?: string
}

// Wrapper component to enforce consistent styling
export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 'md',
  color = 'currentColor',
  className = ''
}) => {
  const IconComponent = ICONS[name]
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in registry.`)
    return null
  }

  return (
    <IconComponent
      size={ICON_SIZE[size]}
      color={color}
      strokeWidth={2}
      className={className}
    />
  )
}
