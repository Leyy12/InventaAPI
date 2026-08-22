"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Server, Shield } from "lucide-react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    maintenanceMode: false,
    strictApiValidation: true,
    maxRequestsPerMinute: 60,
    allowNewRegistrations: true
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(doc(db, "system", "settings"));
      if (docSnap.exists()) {
        setSettings({ ...settings, ...docSnap.data() });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await setDoc(doc(db, "system", "settings"), {
        ...settings,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setMessage("Settings saved successfully.");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage("Error saving settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full px-6 lg:px-8 space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
          <Settings className="w-8 h-8 text-indigo-500" />
          System Settings
        </h1>
        <p className="text-slate-400">Configure global parameters and security overrides for the platform.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-400" /> General Configuration
              </h2>
            </div>
            <div className="p-6 space-y-6">
              
              <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Maintenance Mode</h3>
                  <p className="text-xs text-slate-400 mt-1">Suspend all API operations and show maintenance page.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.maintenanceMode} onChange={e => setSettings({...settings, maintenanceMode: e.target.checked})} />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Allow New Registrations</h3>
                  <p className="text-xs text-slate-400 mt-1">Enable or disable new user signups.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.allowNewRegistrations} onChange={e => setSettings({...settings, allowNewRegistrations: e.target.checked})} />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" /> Security Limits
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Strict API Validation</label>
                    <select 
                      value={settings.strictApiValidation ? "true" : "false"} 
                      onChange={e => setSettings({...settings, strictApiValidation: e.target.value === "true"})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="true">Enabled (Recommended)</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Max Requests Per Minute (Global Default)</label>
                    <input 
                      type="number" 
                      value={settings.maxRequestsPerMinute} 
                      onChange={e => setSettings({...settings, maxRequestsPerMinute: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/30 flex items-center justify-between">
              <span className="text-sm text-emerald-400 font-medium">{message}</span>
              <button 
                type="submit" 
                disabled={loading || saving}
                className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: System Information & Quick Actions */}
        <div className="space-y-6">
          {/* System Information */}
          <div className="glass-card rounded-xl border border-white/5 p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" />
              System Information
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-sm text-slate-400">API Version</span>
                <span className="text-sm font-semibold text-white">v1.0.0</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-sm text-slate-400">Database</span>
                <span className="text-sm font-semibold text-emerald-400">Connected</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-sm text-slate-400">Environment</span>
                <span className="text-sm font-semibold text-amber-400">Development</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-slate-400">Uptime</span>
                <span className="text-sm font-semibold text-white">—</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="glass-card rounded-xl border border-white/5 p-6">
            <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors text-left flex items-center justify-between border border-slate-700">
                <span>View System Logs</span>
                <span className="text-slate-500">→</span>
              </button>
              <button className="w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors text-left flex items-center justify-between border border-slate-700">
                <span>Clear Cache</span>
                <span className="text-slate-500">→</span>
              </button>
              <button className="w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors text-left flex items-center justify-between border border-slate-700">
                <span>Restart Server</span>
                <span className="text-slate-500">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
