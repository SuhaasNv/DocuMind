import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  name: string
  url: string
  icon: LucideIcon
}

interface TubelightNavProps {
  items: NavItem[]
  className?: string
}

export function TubelightNav({ items, className }: TubelightNavProps) {
  const location = useLocation()

  const [activeTab, setActiveTab] = useState<string | null>(
    () => items.find((item) => location.pathname === item.url)?.name ?? null
  )

  useEffect(() => {
    const match = items.find((item) => location.pathname === item.url)
    setActiveTab(match?.name ?? null)
  }, [location.pathname, items])

  return (
    <div className={cn('flex items-center', className)}>
      {items.map((item) => {
        const Icon = item.icon
        const isActive = activeTab === item.name

        return (
          <Link
            key={item.name}
            to={item.url}
            onClick={() => setActiveTab(item.name)}
            className={cn(
              'relative cursor-pointer text-sm font-medium px-4 py-2 rounded-full transition-colors select-none',
              isActive ? 'text-primary' : 'text-white/60 hover:text-white',
            )}
          >
            <span className="hidden md:inline">{item.name}</span>
            <span className="md:hidden">
              <Icon size={16} strokeWidth={2} />
            </span>

            {isActive && (
              <motion.div
                layoutId="tubelight"
                className="absolute inset-0 rounded-full bg-primary/10 -z-10"
                initial={false}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              >
                {/* Glowing tube strip at the top edge */}
                <span className="absolute -top-px left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary block">
                  <span className="absolute w-10 h-5 bg-primary/30 rounded-full blur-md -top-2 -left-2 block" />
                  <span className="absolute w-6 h-3 bg-primary/20 rounded-full blur-sm -top-1 left-0 block" />
                </span>
              </motion.div>
            )}
          </Link>
        )
      })}
    </div>
  )
}
