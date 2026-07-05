import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  }, [removeToast]);

  const success = useCallback((msg: string) => toast(msg, 'success'), [toast]);
  const error = useCallback((msg: string) => toast(msg, 'error'), [toast]);
  const warning = useCallback((msg: string) => toast(msg, 'warning'), [toast]);
  const info = useCallback((msg: string) => toast(msg, 'info'), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-12 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

const ToastItem: React.FC<{ toast: Toast; onClose: (id: string) => void }> = ({ toast, onClose }) => {
  const icons = {
    success: <CheckCircle className="w-4 h-4 text-success" />,
    warning: <AlertTriangle className="w-4 h-4 text-warning" />,
    error: <XCircle className="w-4 h-4 text-error" />,
    info: <Info className="w-4 h-4 text-accent" />,
  };

  const borders = {
    success: 'border-success/30',
    warning: 'border-warning/30',
    error: 'border-error/30',
    info: 'border-accent/30',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 bg-[#1E1E1E] border ${borders[toast.type]} rounded-lg shadow-lg min-w-[280px] max-w-[400px]`}
    >
      <div className="flex-shrink-0">{icons[toast.type]}</div>
      <div className="flex-grow text-sm text-[#C9D1D9] font-medium select-none">
        {toast.message}
      </div>
      <button
        onClick={() => onClose(toast.id)}
        className="flex-shrink-0 text-[#8B949E] hover:text-[#C9D1D9] transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
