"use client";

import { useEffect, useState } from 'react';

interface LogEntry {
  timestamp: string;
  category: string;
  data: any;
}

export default function AuthDebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    // Subscribe to localStorage changes
    const checkLogs = () => {
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('auth-debug-log');
          if (stored) {
            const allLogs = JSON.parse(stored);
            // Keep last 15 entries
            setLogs(allLogs.slice(-15));
          }
        } catch (e) {
          // Ignore errors
        }
      }
    };

    // Check immediately
    checkLogs();

    // Poll for updates every 100ms
    const interval = setInterval(checkLogs, 100);

    return () => clearInterval(interval);
  }, []);

  const formatLog = (entry: LogEntry): string => {
    const time = entry.timestamp.substring(11, 19); // HH:MM:SS
    
    switch (entry.category) {
      case 'appUser-changed':
        if (entry.data.exists) {
          const name = entry.data.fullName || 'Unknown';
          const plan = entry.data.plan || 'No plan';
          return `${time} ✅ DATA: ${name} (${plan})`;
        } else {
          return `${time} ❌ NULL (no user data)`;
        }
      
      case 'auth-fired':
        return `${time} 🔥 Auth ${entry.data.hasUser ? 'fired (user exists)' : 'fired (no user)'}`;
      
      case 'setAppUser-data':
        return `${time} 📝 Set: ${entry.data.fullName} (${entry.data.plan})`;
      
      case 'setAppUser-null':
        return `${time} 🗑️  Cleared user data`;
      
      case 'listener-init':
        return `${time} 🔄 Auth listener started`;
      
      default:
        return `${time} ${entry.category}`;
    }
  };

  // Detect revert pattern
  const hasRevert = logs.some((log, idx) => {
    if (idx < logs.length - 1) {
      const current = log.category === 'appUser-changed' && log.data.exists;
      const next = logs[idx + 1].category === 'appUser-changed' && !logs[idx + 1].data.exists;
      return current && next;
    }
    return false;
  });

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 bg-black/90 border border-red-500/50 rounded-lg p-3 font-mono text-xs text-green-400 shadow-2xl z-[9999] overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/20">
        <span className="text-white font-bold">🐛 AUTH DEBUG LOG</span>
        {hasRevert && (
          <span className="text-red-400 font-bold animate-pulse">⚠️ REVERT DETECTED</span>
        )}
      </div>

      {/* Log entries */}
      <div className="space-y-1">
        {logs.length === 0 ? (
          <div className="text-gray-500">Waiting for auth events...</div>
        ) : (
          logs.map((entry, idx) => {
            const isRevertStart = 
              idx < logs.length - 1 &&
              entry.category === 'appUser-changed' && 
              entry.data.exists &&
              logs[idx + 1].category === 'appUser-changed' &&
              !logs[idx + 1].data.exists;
            
            const isRevertEnd =
              idx > 0 &&
              entry.category === 'appUser-changed' &&
              !entry.data.exists &&
              logs[idx - 1].category === 'appUser-changed' &&
              logs[idx - 1].data.exists;

            return (
              <div 
                key={idx}
                className={`${
                  isRevertStart || isRevertEnd
                    ? 'bg-red-500/20 border-l-2 border-red-500 pl-2 text-red-300 font-bold'
                    : ''
                }`}
              >
                {formatLog(entry)}
                {isRevertStart && <span className="ml-2 text-red-400">← REVERT STARTS HERE</span>}
                {isRevertEnd && <span className="ml-2 text-red-400">← REVERTED TO NULL!</span>}
              </div>
            );
          })
        )}
      </div>

      {/* Footer instructions */}
      <div className="mt-3 pt-2 border-t border-white/20 text-gray-400 text-[10px]">
        Refresh page → Watch this panel → Screenshot when you see "Developer" in sidebar
      </div>
    </div>
  );
}
