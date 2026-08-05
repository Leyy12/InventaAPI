// ============================================================================
// EXACT 3-STEP MODAL UI FROM IMAGE
// Replace lines 535-900 in dashboard/src/app/dashboard/products/page.tsx
// ============================================================================

{/* STEP 1: HTTP 404 ERROR - Start: Not Found */}
{!showRequestForm && !requestSuccess && (
  <div className="max-w-lg mx-auto">
    {/* Step Header */}
    <div className="text-center mb-6">;
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-red-500/30 mb-3">
        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-sm font-bold text-red-400">HTTP 404 Error</span>
      </div>
      <h2 className="text-xl font-bold text-white">Start: Not Found</h2>
    </div>

    {/* Modal Card */}
    <div className="glass-card rounded-2xl border border-slate-700 overflow-hidden bg-slate-900/80 backdrop-blur-xl shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wide">🔷 API CAPABILITY</span>
          <span className="px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400">404</span>
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Product Catalog</h3>
        <p className="text-xs text-slate-400">Select products to include in your custom API endpoint</p>
      </div>

      {/* Search Input */}
      <div className="px-6 pt-4">
        <input
          type="text"
          value={searchQuery}
          readOnly
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
        />
      </div>

      {/* Search Result Box */}
      <div className="p-6">
        <div className="p-5 rounded-xl bg-gradient-to-br from-red-900/20 to-slate-900/50 border border-red-500/20">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-red-400 mb-1">🔴 No Product Found</p>
              <p className="text-xs text-slate-400">
                Product <span className="text-white font-semibold">"{searchQuery || "dove"}"</span> doesn't exist in our database.
              </p>
            </div>
          </div>

          {/* Smart Recommendation */}
          <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-blue-400 mb-1">ℹ️ Smart Recommendation</p>
                <p className="text-xs text-slate-400">Review time 24-48 hours. Auto-adds to your catalog once approved.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Begin Button */}
        <button
          onClick={() => setShowRequestForm(true)}
          className="w-full mt-4 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold transition-all duration-300 shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:scale-105"
        >
          Begin Product Request
        </button>

        {/* Info Text */}
        <div className="mt-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-slate-400">
              <span className="text-cyan-400 font-semibold">ℹ️ Feedback Loop:</span> Result: Collaborative, self-expanding catalog
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
)}

{/* STEP 2: PROCESS - REQUEST FORM */}
{showRequestForm && !requestSuccess && (
  <div className="max-w-lg mx-auto animate-fadeIn">
    {/* Step Header with Indicators */}
    <div className="text-center mb-6">
      <h2 className="text-xl font-bold text-white mb-4">Process: Request</h2>
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center">
            <span className="text-xs font-bold text-slate-400">1</span>
          </div>
          <div className="w-8 h-0.5 bg-slate-700 mx-1"></div>
        </div>
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg">
            <span className="text-xs font-bold text-white">2</span>
          </div>
          <div className="w-8 h-0.5 bg-slate-700 mx-1"></div>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
          <span className="text-xs font-bold text-slate-600">3</span>
        </div>
      </div>
      <p className="text-xs text-cyan-400 font-semibold">Request</p>
    </div>

    {/* Modal Card */}
    <div className="glass-card rounded-2xl border border-slate-700 overflow-hidden bg-slate-900/80 backdrop-blur-xl shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold text-white">Product Not Found</h3>
          <button
            onClick={() => setShowRequestForm(false)}
            className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          The item <span className="text-white font-semibold">"{searchQuery || "dove"}"</span> is not in our database yet.
        </p>
        
        {/* Smart Recommendation Box */}
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-blue-400 mb-1">ℹ️ Smart Recommendation</p>
              <p className="text-xs text-slate-400">Review time 24-48 hours. Auto-adds to your catalog once approved.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmitProductRequest} className="p-6 space-y-4">
        {/* Product Name */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">PRODUCT NAME</label>
          <input
            type="text"
            required
            value={requestFormData.productName}
            onChange={(e) => setRequestFormData({...requestFormData, productName: e.target.value})}
            className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">CATEGORY</label>
          <select
            value={requestFormData.category}
            onChange={(e) => setRequestFormData({...requestFormData, category: e.target.value})}
            className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
          >
            <option>Pharmacy</option>
            <option>Hardware</option>
            <option>Grocery</option>
            <option>Electronics</option>
          </select>
        </div>

        {/* Additional Notes */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">ADDITIONAL NOTES (Optional)</label>
          <textarea
            rows={3}
            value={requestFormData.details}
            onChange={(e) => setRequestFormData({...requestFormData, details: e.target.value})}
            placeholder="Please add for barcode comparison."
            className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none transition-colors resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submittingRequest}
          className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-800 text-white font-bold transition-all duration-300 shadow-lg shadow-cyan-500/30 hover:shadow-xl disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submittingRequest ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <span>Submit Product Request</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  </div>
)}

{/* STEP 3: END - VERIFICATION */}
{requestSuccess && (
  <div className="max-w-lg mx-auto animate-fadeIn">
    {/* Step Header with Indicators */}
    <div className="text-center mb-6">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 mb-3">
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm font-bold text-emerald-400">Verified</span>
      </div>
      <h2 className="text-xl font-bold text-white mb-4">End: Verified</h2>
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center">
            <span className="text-xs font-bold text-slate-400">1</span>
          </div>
          <div className="w-8 h-0.5 bg-slate-700 mx-1"></div>
        </div>
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg">
            <span className="text-xs font-bold text-white">2</span>
          </div>
          <div className="w-8 h-0.5 bg-slate-700 mx-1"></div>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
          <span className="text-xs font-bold text-slate-600">3</span>
        </div>
      </div>
      <p className="text-xs text-cyan-400 font-semibold">Confirmation</p>
    </div>

    {/* Modal Card */}
    <div className="glass-card rounded-2xl border border-slate-700 overflow-hidden bg-slate-900/80 backdrop-blur-xl shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold text-white">Request Received</h3>
          <button
            onClick={resetProductRequest}
            className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-slate-400">Verification will reach your catalog.</p>
      </div>

      {/* Verification Status */}
      <div className="p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-cyan-400 animate-spin" style={{animationDuration: '3s'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h4 className="text-lg font-bold text-white mb-2">Verification In Progress</h4>
          <p className="text-sm text-slate-400 mb-4">Approx. 24-48 Hours</p>
          
          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={resetProductRequest}
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium transition-colors"
          >
            Cancel Request
          </button>
          <button
            onClick={resetProductRequest}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-bold transition-all shadow-lg"
          >
            Return to Catalog
          </button>
        </div>

        {/* Security Note */}
        <div className="mt-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-xs text-slate-400">🔒 Authenticated requests are processed securely</p>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
