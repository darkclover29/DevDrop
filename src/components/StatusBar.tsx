import React from 'react';
import { Cloud, CloudLightning, CloudOff, Layers, Hash, Sparkles, AlignLeft } from 'lucide-react';

interface StatusBarProps {
  syncState: 'synced' | 'syncing' | 'error';
  lastSyncTime: Date | null;
  fileCount: number;
  totalChars: number;
  totalLines: number;
  workspaceSize: number; // in bytes
}

export const StatusBar: React.FC<StatusBarProps> = ({
  syncState,
  lastSyncTime,
  fileCount,
  totalChars,
  totalLines,
  workspaceSize
}) => {
  // Format last sync time
  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  // Format size to human readable (B, KB, MB)
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="h-6 bg-panels border-t border-border flex items-center justify-between px-3 text-[11px] text-[#8B949E] select-none select-none z-10">
      
      {/* Left: Connection and Sync Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 font-medium">
          {syncState === 'synced' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-textActive">Synced</span>
              <Cloud className="w-3.5 h-3.5 text-success/80 ml-0.5" />
            </>
          )}
          {syncState === 'syncing' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-ping" />
              <span className="text-textActive">Syncing...</span>
              <CloudLightning className="w-3.5 h-3.5 text-warning/80 ml-0.5" />
            </>
          )}
          {syncState === 'error' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
              <span className="text-error font-semibold">Offline</span>
              <CloudOff className="w-3.5 h-3.5 text-error/80 ml-0.5" />
            </>
          )}
        </div>

        <div className="flex items-center gap-1 text-[#8B949E]/70">
          <span>Last Sync:</span>
          <span className="font-mono text-textActive">{formatTime(lastSyncTime)}</span>
        </div>
      </div>

      {/* Right: Workspace Statistics */}
      <div className="flex items-center gap-4 font-mono">
        <div className="flex items-center gap-1.5" title="Total Files">
          <Layers className="w-3 h-3 text-[#8B949E]/50" />
          <span>Files: <span className="text-textActive">{fileCount}</span></span>
        </div>
        
        <div className="flex items-center gap-1.5" title="Total Lines">
          <AlignLeft className="w-3 h-3 text-[#8B949E]/50" />
          <span>Lines: <span className="text-textActive">{totalLines}</span></span>
        </div>

        <div className="flex items-center gap-1.5" title="Total Characters">
          <Hash className="w-3 h-3 text-[#8B949E]/50" />
          <span>Chars: <span className="text-textActive">{totalChars}</span></span>
        </div>

        <div className="flex items-center gap-1.5" title="Estimated Workspace Size">
          <Sparkles className="w-3 h-3 text-[#8B949E]/50" />
          <span>Size: <span className="text-textActive">{formatSize(workspaceSize)}</span></span>
        </div>
      </div>
    </div>
  );
};
