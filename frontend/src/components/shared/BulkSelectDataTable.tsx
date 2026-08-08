import React, { useState, useCallback } from 'react';
import { cn } from '@/utils';
import { Button } from '@/components/ui';
import { CheckSquare, Square, MinusSquare } from 'lucide-react';

interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface BulkAction<T> {
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'destructive' | 'outline';
  onClick: (selectedItems: T[]) => void | Promise<void>;
}

interface BulkSelectDataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
  bulkActions?: BulkAction<T>[];
  idKey?: string;
}

export function BulkSelectDataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data found',
  loading,
  bulkActions = [],
  idKey = 'id',
}: BulkSelectDataTableProps<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected = data.length > 0 && selectedIds.size === data.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < data.length;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map(item => item[idKey])));
    }
  }, [allSelected, data, idKey]);

  const toggleSelectItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedItems = data.filter(item => selectedIds.has(item[idKey]));

  const clearSelection = () => setSelectedIds(new Set());

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && bulkActions.length > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} of {data.length} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {bulkActions.map((action, idx) => (
              <Button
                key={idx}
                variant={(action.variant as any) || 'outline'}
                size="sm"
                onClick={async () => {
                  await action.onClick(selectedItems);
                  clearSelection();
                }}
              >
                {action.icon}
                <span className="ml-1.5">{action.label}</span>
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {bulkActions.length > 0 && (
                <th className="px-3 py-3 w-10">
                  <button onClick={toggleSelectAll} className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : someSelected ? (
                      <MinusSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className={cn('px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider', col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((item, idx) => {
              const itemId = item[idKey];
              const isSelected = selectedIds.has(itemId);
              return (
                <tr
                  key={idx}
                  className={cn(
                    'transition-colors',
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {bulkActions.length > 0 && (
                    <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleSelectItem(itemId)}
                        className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('px-4 py-3 text-sm', col.className)}
                      onClick={() => onRowClick?.(item)}
                    >
                      {col.render ? col.render(item) : item[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selection Summary */}
      {selectedIds.size > 0 && (
        <div className="mt-2 text-xs text-muted-foreground text-right">
          {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}
