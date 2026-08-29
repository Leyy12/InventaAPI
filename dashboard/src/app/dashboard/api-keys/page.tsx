"use client";

import { useState, useEffect } from "react";
import { Key, Copy, Plus, Trash2, Eye, EyeOff, AlertTriangle, Shield, CheckCircle2, Clock, Activity, Info, Code } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";
import CodeSnippet from "@/components/shared/CodeSnippet";

interface ApiKey {
  id: string;
  key: string;
  name: string;
  userId: string;
  userEmail: string;
  plan: string;
  requestsUsed: number;
  requestLimit?: number;  // Dynamic limit based on user's plan
  createdAt: any;
  lastUsed: any | null;
  status: "active" | "revoked";
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState<{ [key: string]: boolean }>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [showCodeSnippet, setShowCodeSnippet] = useState<{ [key: string]: boolean }>({});
  
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchApiKeys();
    }
  }, [user]);

  const fetchApiKeys = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
      const response = await fetch(`${apiUrl}/api/v1/api-keys?userId=${user.uid}`);
      const data = await response.json();
      
      if (response.ok && data.success) {
        setApiKeys(data.keys as ApiKey[]);
      } else {
        throw new Error(data.error || "Failed to fetch keys");
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateNewKey = async () => {
    if (!newKeyName.trim()) {
      alert("Please enter a name for your API key");
      return;
    }

    setGeneratingKey(true);
    try {
      if (!user) {
        throw new Error("You must be logged in to generate an API key.");
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
      const idToken = await user.getIdToken();
      const response = await fetch(`${apiUrl}/api/v1/api-keys/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          userEmail: user.email || "",
          keyName: newKeyName.trim(),
          // SECURITY: Do NOT send plan - let backend determine from user's actual Firestore data
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Show more specific error messages from backend
        const errorMessage = data.message || data.error || "Unable to create your API key. Please try again later.";
        throw new Error(errorMessage);
      }
      
      setNewlyGeneratedKey(data.key);
      setNewKeyName("");
      fetchApiKeys();
    } catch (error) {
      console.error("Error generating new API key:", error);
      
      // Display specific error message to user
      const errorMessage = error instanceof Error ? error.message : "Unable to create your API key. Please try again later.";
      if (errorMessage.includes('verify your subscription plan')) {
        alert(`Service temporarily unavailable: ${errorMessage}`);
      } else if (errorMessage.includes('account information could not be found')) {
        alert(`Account error: ${errorMessage}`);
      } else {
        alert(errorMessage);
      }
    } finally {
      setGeneratingKey(false);
    }
  };

  const revokeKey = async (id: string, keyName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to revoke "${keyName}"?\n\n` +
      `⚠️ WARNING: This action cannot be undone!\n` +
      `Any applications using this key will immediately stop working.\n\n` +
      `Type the key name to confirm: ${keyName}`
    );

    if (!confirmed) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
      const response = await fetch(`${apiUrl}/api/v1/api-keys/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.uid })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to revoke key");
      }

      fetchApiKeys();
    } catch (error) {
      console.error("Error revoking API key:", error);
      alert("Failed to revoke API key. Please try again.");
    }
  };

  const handleCopy = (keyString: string, keyId: string) => {
    navigator.clipboard.writeText(keyString);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadEnv = (keyStr: string) => {
    if (!keyStr) return;
    const content = `# DaaS API Configuration
NEXT_PUBLIC_DAAS_API_URL=${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}
DAAS_API_KEY=${keyStr}
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = ".env.local";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPostman = (keyStr: string) => {
    if (!keyStr) return;
    const collection = {
      info: {
        name: "DaaS API Integration",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      item: [
        {
          name: "Get Catalog",
          request: {
            method: "GET",
            header: [
              { key: "x-api-key", value: keyStr }
            ],
            url: {
              raw: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002'}/daas/v1/catalog`,
              host: [(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002').replace('http://', '')],
              path: ["daas", "v1", "catalog"]
            }
          }
        }
      ]
    };
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "daas-api-postman.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleShowKey = (keyId: string) => {
    setShowKey(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  };

  const toggleCodeSnippet = (keyId: string) => {
    setShowCodeSnippet(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  };

  const maskKey = (key: string) => {
    const prefix = key.substring(0, 10);
    const suffix = key.substring(key.length - 4);
    return `${prefix}${'•'.repeat(20)}${suffix}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return "Invalid date";
    }
  };

  return (
    <div className="w-full px-6 lg:px-8 space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
            <Key className="w-8 h-8 text-indigo-400" />
            API Keys
          </h1>
          <p className="text-slate-400">Manage your authentication credentials for API access</p>
        </div>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="px-4 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          Generate New Key
        </button>
      </div>

      {/* Security Warning Banner */}
      <div className="glass-card rounded-xl p-6 border-l-4 border-amber-500 bg-gradient-to-r from-amber-500/10 to-transparent">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Keep Your Keys Secure
            </h3>
            <ul className="text-sm text-slate-300 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span><strong>Never share</strong> your API keys in public repositories, client-side code, or forums</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span><strong>Store securely</strong> in environment variables or secret management systems</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span><strong>Rotate regularly</strong> to maintain security best practices</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                <span><strong>Revoke immediately</strong> if you suspect a key has been compromised</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* API Keys List */}
      <div className="glass-card rounded-xl border border-slate-700">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-1">Active API Keys</h2>
          <p className="text-sm text-slate-400">
            {apiKeys.length === 0 
              ? "You don't have any active keys yet" 
              : `You have ${apiKeys.length} active key${apiKeys.length > 1 ? 's' : ''}`
            }
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-4"></div>
              <p className="text-sm text-slate-400">Loading API keys...</p>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-xl bg-slate-900/50">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No API Keys Yet</h3>
              <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
                Generate your first API key to start making authenticated requests to our platform
              </p>
              <button
                onClick={() => setShowGenerateModal(true)}
                className="px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-all inline-flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Plus className="w-5 h-5" />
                Generate Your First Key
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((apiKey) => (
                <div 
                  key={apiKey.id} 
                  className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all"
                >
                  {/* Key Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
                        {apiKey.name}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Active
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Created {formatDate(apiKey.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy(apiKey.key, apiKey.id)}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium transition-all flex items-center gap-2"
                      >
                        {copiedKey === apiKey.id ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => revokeKey(apiKey.id, apiKey.name)}
                        className="px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium transition-all flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Revoke
                      </button>
                    </div>
                  </div>

                  {/* Key Display */}
                  <div className="mb-4">
                    <label className="text-xs font-medium text-slate-400 mb-2 block">API KEY</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 font-mono text-sm text-indigo-300">
                        {showKey[apiKey.id] ? apiKey.key : maskKey(apiKey.key)}
                      </div>
                      <button
                        onClick={() => toggleShowKey(apiKey.id)}
                        className="p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-all"
                        title={showKey[apiKey.id] ? "Hide key" : "Show key"}
                      >
                        {showKey[apiKey.id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Key Stats */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700">
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        REQUESTS USED
                      </p>
                      <p className="text-lg font-semibold text-white">
                        {apiKey.requestsUsed.toLocaleString()}
                        <span className="text-xs text-slate-400 font-normal ml-1">
                          / {apiKey.requestLimit ? apiKey.requestLimit.toLocaleString() : '50'}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        LAST USED
                      </p>
                      <p className="text-sm font-medium text-slate-300">
                        {formatDate(apiKey.lastUsed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        PLAN
                      </p>
                      <p className="text-sm font-medium text-indigo-400">
                        {apiKey.plan}
                      </p>
                    </div>
                  </div>

                  {/* Code Snippet Toggle */}
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <button
                      onClick={() => toggleCodeSnippet(apiKey.id)}
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <Code className="w-4 h-4" />
                      {showCodeSnippet[apiKey.id] ? "Hide" : "Show"} Integration Code Examples
                    </button>
                  </div>

                  {/* Code Snippet Component */}
                  {showCodeSnippet[apiKey.id] && (
                    <div className="mt-4">
                      <CodeSnippet 
                        apiKey={apiKey.key}
                        apiUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002'}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Best Practices */}
      <div className="glass-card rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          Security Best Practices
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700">
            <h4 className="text-sm font-semibold text-white mb-2">✓ Use Environment Variables</h4>
            <p className="text-xs text-slate-400">Store keys in .env files and never commit them to version control</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700">
            <h4 className="text-sm font-semibold text-white mb-2">✓ Server-Side Only</h4>
            <p className="text-xs text-slate-400">Never expose API keys in client-side JavaScript or mobile apps</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700">
            <h4 className="text-sm font-semibold text-white mb-2">✓ Regular Rotation</h4>
            <p className="text-xs text-slate-400">Generate new keys periodically and revoke old ones</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700">
            <h4 className="text-sm font-semibold text-white mb-2">✓ Monitor Usage</h4>
            <p className="text-xs text-slate-400">Check your analytics regularly for unusual activity</p>
          </div>
        </div>
      </div>

      {/* Generate New Key Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg glass-card rounded-2xl border border-slate-700 shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-200">
            {newlyGeneratedKey ? (
              // Success View
              <div className="p-6">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-bold text-white text-center mb-2">API Key Generated!</h3>
                <p className="text-sm text-slate-400 text-center mb-6">
                  Save this key now. You won't be able to see it again!
                </p>

                <div className="bg-slate-950 border-2 border-emerald-500/30 rounded-xl p-4 mb-6">
                  <label className="text-xs font-medium text-emerald-400 mb-2 block">YOUR NEW API KEY</label>
                  <div className="bg-slate-900 rounded-lg p-3 mb-3 break-all font-mono text-sm text-emerald-300">
                    {newlyGeneratedKey}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newlyGeneratedKey);
                      alert("API key copied to clipboard!");
                    }}
                    className="w-full px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-all flex items-center justify-center gap-2 mb-3"
                  >
                    <Copy className="w-4 h-4" />
                    Copy to Clipboard
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleDownloadEnv(newlyGeneratedKey)}
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all text-xs border border-slate-700"
                    >
                      Download .env
                    </button>
                    <button
                      onClick={() => handleDownloadPostman(newlyGeneratedKey)}
                      className="w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all text-xs border border-slate-700"
                    >
                      Download Postman
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6">
                  <p className="text-xs text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Store this key securely. For security reasons, we cannot show it again after you close this window.</span>
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowGenerateModal(false);
                    setNewlyGeneratedKey(null);
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-all"
                >
                  I've Saved My Key
                </button>
              </div>
            ) : (
              // Generate Form
              <>
                <div className="p-6 border-b border-slate-700">
                  <h3 className="text-xl font-bold text-white mb-1">Generate New API Key</h3>
                  <p className="text-sm text-slate-400">Create a new key for your application</p>
                </div>

                <div className="p-6">
                  <div className="mb-6">
                    <label className="text-sm font-medium text-slate-300 mb-2 block">
                      Key Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., Production Server, Development, Mobile App"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-500"
                      autoFocus
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Give your key a descriptive name to identify where it's used
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowGenerateModal(false);
                        setNewKeyName("");
                      }}
                      className="flex-1 px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={generateNewKey}
                      disabled={!newKeyName.trim() || generatingKey}
                      className="flex-1 px-4 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {generatingKey ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Generating...
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          Generate Key
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
