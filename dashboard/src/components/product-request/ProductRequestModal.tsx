"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";

interface ProductRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  onSuccess?: () => void;
}

const CATEGORIES = [
  "Grocery",
  "Beverages",
  "Personal Care",
  "Household",
  "Electronics",
  "Medicine",
  "Hardware",
  "Mobile Accessories",
  "Office Supplies",
  "Others"
];

export default function ProductRequestModal({
  isOpen,
  onClose,
  productName,
  onSuccess
}: ProductRequestModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    product_name: productName,
    category: "",
    notes: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Update product name when prop changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, product_name: productName }));
  }, [productName]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        product_name: productName,
        category: "",
        notes: ""
      });
      setErrors({});
      setSubmitSuccess(false);
    }
  }, [isOpen, productName]);

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

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.product_name.trim()) {
      newErrors.product_name = "Product name is required";
    }

    if (!formData.category) {
      newErrors.category = "Please select a category";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/v1/product-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_name: formData.product_name.trim(),
          category: formData.category,
          notes: formData.notes.trim(),
          requested_by: user?.email || 'anonymous',
          requested_by_name: user?.displayName || 'Anonymous User'
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setSubmitSuccess(true);
      
      // Call success callback after a short delay
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Error submitting product request:', error);
      setErrors({
        submit: error instanceof Error ? error.message : 'Failed to submit request. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div 
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-indigo-500/10 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-2xl font-bold text-white">Product Not Found</h2>
            <p className="text-sm text-slate-400 mt-1">
              The item <span className="text-indigo-400 font-medium">"{productName}"</span> is not in our database yet.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success State */}
        {submitSuccess ? (
          <div className="p-8 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Request Submitted!</h3>
            <p className="text-slate-400">
              Your product request has been submitted successfully. We'll review it within 24-48 hours.
            </p>
          </div>
        ) : (
          <>
            {/* Smart Recommendation Box */}
            <div className="mx-6 mt-6 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-indigo-300 mb-1">
                    Smart Recommendation
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    <strong className="text-slate-300">Review time:</strong> 24–48 hours
                    <br />
                    Kapag na-approve, automatic itong madadagdag sa catalog.
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Product Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Product Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.product_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, product_name: e.target.value }))}
                  className={`w-full px-4 py-3 bg-slate-800/50 border ${
                    errors.product_name ? 'border-red-500/50' : 'border-slate-700'
                  } rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all`}
                  placeholder="Enter product name"
                  disabled={isSubmitting}
                />
                {errors.product_name && (
                  <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.product_name}
                  </p>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Category <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className={`w-full px-4 py-3 bg-slate-800/50 border ${
                    errors.category ? 'border-red-500/50' : 'border-slate-700'
                  } rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all cursor-pointer`}
                  disabled={isSubmitting}
                >
                  <option value="">Select a category</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category} className="bg-slate-800">
                      {category}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.category}
                  </p>
                )}
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Additional Notes <span className="text-slate-500 text-xs">(Optional)</span>
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none"
                  placeholder="Please add barcode comparison, packaging information, manufacturer, or other details."
                  disabled={isSubmitting}
                />
              </div>

              {/* Submit Error */}
              {errors.submit && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-sm text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {errors.submit}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Product Request
                      <span className="text-lg">→</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
