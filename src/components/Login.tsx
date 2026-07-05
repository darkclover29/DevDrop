import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
  apiBaseUrl: string;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, apiBaseUrl }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        onLoginSuccess();
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch (err) {
      setError('Connection failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4 select-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#161B22] border border-[#30363D] mb-4 text-accent"
          >
            <svg 
              className="w-8 h-8"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
            </svg>
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-textActive font-ui">DevDrop</h1>
          <p className="text-sm text-textMuted mt-1">Private Cloud Code Workspace</p>
        </div>

        {/* Login Form Card */}
        <div className="bg-panels border border-border rounded-xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
                Workspace Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-textMuted">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full pl-9 pr-10 py-2.5 bg-[#1E1E1E] text-textActive placeholder-gray-600 border border-[#30363D] rounded-lg focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-textMuted hover:text-textActive cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-xs text-error bg-error/10 border border-error/20 p-3 rounded-lg"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:hover:bg-accent text-white font-semibold rounded-lg transition-all text-sm shadow-lg shadow-accent/20 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Enter Workspace
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-textMuted">
          Designed for instant multi-device transfers. Single User Session.
        </div>
      </motion.div>
    </div>
  );
};
