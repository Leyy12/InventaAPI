"use client";

import { useEffect, useState } from "react";
import { X, Clock, CheckCircle2, ArrowRight, XCircle } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  requestId?: string;
  onReturnToCatalog?: () => void;
  onCancelRequest?: () => void;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  productName,
  requestId,
  onReturnToCatalog,
  onCancelRequest
}: ConfirmationModalProps) {
  const [progress, setProgress] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);

  // Animate progress bar
  useEffect(() => {
    if (isOpen) {
      setProgress(0);
      const timer = setTimeout(() => {
        setProgress(15);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleCancelRequest = async () => {
    if (!requestId || !onCancelRequest) return;
    
    setIsCancelling(true);
    try {
      await onCancelRequest();
      onClose();
    } catch (error) {
      console.error('Failed to cancel request:', error);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReturnToCatalog = () => {
    onReturnToCatalog?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-emerald-500/10 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800 z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Icon */}
        <div className="flex justify-center pt-8 pb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border-2 border-emerald-500/30 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 animate-in zoom-in duration-500" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-8 text-center">
          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-2">
            Request Received
          </h2>
          
          {/* Subtitle */}
          <p className="text-slate-400 mb-8">
            Your request for{" "}
            <span className="text-white font-medium">"{productName}"</span>{" "}
            has been submitted successfully.
          </p>

          {/* Verification Status Card */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mb-6">
            {/* Icon and Text */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-500/30 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-indigo-400 animate-pulse" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-white">
                  Verification in Progress
                </h3>
                <p className="text-xs text-slate-400">
                  Estimated Review Time: <span className="text-indigo-400 font-medium">24–48 Hours</span>
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative">
              <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400 rounded-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center mt-2">
                {progress}% Complete
              </p>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3 text-left">
              <p className="text-xs text-slate-400 mb-1">Status</p>
              <p className="text-sm font-semibold text-emerald-400">Pending Review</p>
            </div>
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3 text-left">
              <p className="text-xs text-slate-400 mb-1">Request ID</p>
              <p className="text-sm font-semibold text-slate-300 truncate">
                {requestId ? `#${requestId.slice(0, 8)}` : 'Processing...'}
              </p>
            </div>
          </div>

          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 mb-6 text-xs text-slate-500">
            <div className="w-4 h-4 bg-slate-700 rounded flex items-center justify-center">
              <span className="text-[8px]">🔒</span>
            </div>
            <span>Authenticated request · Logged for review</span>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleReturnToCatalog}
              className="w-full group bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>Return to Catalog</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            {requestId && onCancelRequest && (
              <button
                onClick={handleCancelRequest}
                disabled={isCancelling}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-slate-700"
              >
                {isCancelling ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Cancel Request</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Footer Note */}
          <p className="text-xs text-slate-500 mt-6 leading-relaxed">
            A confirmation email will be sent to your registered address within 24 hours.
            You'll be notified once the product is approved and added to the catalog.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
