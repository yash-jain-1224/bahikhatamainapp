import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  className?: string;
  iconColor?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className, iconColor = 'text-primary' }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('glass rounded-xl p-5', className)}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {trend && (
            <p className={cn('text-xs mt-1', trend.isPositive ? 'text-emerald-400' : 'text-red-400')}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% from last period
            </p>
          )}
        </div>
        <div className={cn('h-12 w-12 rounded-lg flex items-center justify-center bg-muted/50', iconColor)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </motion.div>
  );
}
