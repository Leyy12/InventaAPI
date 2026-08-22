'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  User, 
  Home, 
  FileText, 
  Settings, 
  Package, 
  Clock, 
  Users, 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Plus,
  Shield,
  Key,
  Wrench,
  BarChart3,
  Menu,
  Search,
  MoreHorizontal
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area } from 'recharts';

// Mock data - replace with real API calls
const dashboardStats = {
  masterCatalog: {
    total: 608,
    hardware: 245,
    pharmacy: 210,
    grocery: 153
  },
  pendingRequests: 12,
  apiConsumers: 142,
  todayApiCalls: {
    total: 45210,
    successRate: 99.8,
    rate: 1.78
  }
};

const apiTrafficData = [
  { time: '02:00', requests: 800, latency: 52 },
  { time: '04:00', requests: 1200, latency: 48 },
  { time: '06:00', requests: 1800, latency: 45 },
  { time: '08:00', requests: 2400, latency: 38 },
  { time: '10:00', requests: 3200, latency: 35 },
  { time: '12:00', requests: 3800, latency: 41 },
  { time: '14:00', requests: 4200, latency: 39 },
  { time: '16:00', requests: 3600, latency: 42 },
  { time: '18:00', requests: 2800, latency: 46 },
  { time: '20:00', requests: 2000, latency: 48 },
  { time: '22:00', requests: 1400, latency: 44 },
  { time: '24:00', requests: 1000, latency: 50 }
];

const segmentData = [
  { name: 'Hardware', value: 56, color: '#3b82f6' },
  { name: 'Pharmacy', value: 29, color: '#10b981' },
  { name: 'Grocery', value: 15, color: '#f59e0b' }
];

const pendingRequests = [
  { id: 'REQ-001', product: 'Lysol Disinfectant Spray', category: 'Cleaning Products', user: 'juan@smestore.ph' },
  { id: 'REQ-002', product: 'Amoxicillin 500mg', category: 'Antibiotics', user: 'maria@pharmacy.ph' },
  { id: 'REQ-003', product: 'Bosny Spray Paint', category: 'Hardware Paint', user: 'carlos@hardware.ph' },
  { id: 'REQ-004', product: 'Lucky Me Pancit Canton', category: 'Instant Noodles', user: 'anna@grocery.ph' },
  { id: 'REQ-005', product: 'Biogesic Paracetamol', category: 'Pain Relief', user: 'peter@drugstore.ph' }
];

const auditLogs = [
  { time: '10:42 AM', action: 'API Key generated', user: 'juan@smestore.ph', type: 'info' },
  { time: '10:40 AM', action: 'Rate Limit reached', user: '192.168.1.100', type: 'warning' },
  { time: '10:38 AM', action: 'Product approved', admin: 'Super Admin Alex', type: 'success' },
  { time: '10:35 AM', action: 'New user registration', user: 'newuser@business.ph', type: 'info' },
  { time: '10:32 AM', action: 'Suspicious login attempt', user: 'unknown', type: 'error' },
  { time: '10:30 AM', action: 'System backup completed', system: 'auto', type: 'success' }
];

export default function ModernAdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                InventaAPI Admin Control Center
              </h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right hidden md:block">
              <p className="text-xs text-slate-400">Current Time</p>
              <p className="text-sm font-mono">{currentTime.toLocaleTimeString()}</p>
            </div>
            <div className="relative">
              <Bell className="w-5 h-5 text-slate-400 hover:text-white cursor-pointer transition-colors" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-white">3</span>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold">SA</span>
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium">Super Admin Alex</p>
                <p className="text-xs text-slate-400">Administrator</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
          <nav className="mt-8 px-4 space-y-2">
            {[
              { icon: Home, label: 'Dashboard', active: true },
              { icon: Bell, label: 'Notifications', badge: 3 },
              { icon: Users, label: 'Users' },
              { icon: FileText, label: 'Documents' },
              { icon: Settings, label: 'Settings' }
            ].map((item, index) => (
              <a 
                key={index}
                href="#"
                className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                  item.active 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {item.badge}
                  </span>
                )}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8 space-y-6 overflow-auto">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {/* Master Product Catalog */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">Master Product Catalog</h3>
                <Package className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-3xl font-bold text-white mb-3">{dashboardStats.masterCatalog.total.toLocaleString()}</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Hardware:</span>
                  <span className="text-red-400 font-semibold">{dashboardStats.masterCatalog.hardware}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Pharmacy:</span>
                  <span className="text-orange-400 font-semibold">{dashboardStats.masterCatalog.pharmacy}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Grocery:</span>
                  <span className="text-yellow-400 font-semibold">{dashboardStats.masterCatalog.grocery}</span>
                </div>
              </div>
            </div>

            {/* Pending Requests */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">Pending Requests</h3>
                <AlertTriangle className="w-6 h-6 text-yellow-400" />
              </div>
              <div className="text-3xl font-bold text-yellow-400 mb-3">{dashboardStats.pendingRequests}</div>
              <p className="text-sm text-slate-400">Awaiting admin review</p>
            </div>

            {/* API Consumers */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">API Consumers</h3>
                <Users className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-3xl font-bold text-white mb-3">{dashboardStats.apiConsumers.toLocaleString()}</div>
              <div className="flex items-center text-sm">
                <TrendingUp className="w-4 h-4 text-green-400 mr-1" />
                <span className="text-green-400">+8% this week</span>
              </div>
            </div>

            {/* Today's API Calls */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">Today's API Calls</h3>
                <Activity className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-3xl font-bold text-white mb-3">{dashboardStats.todayApiCalls.total.toLocaleString()}</div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Success Rate:</span>
                  <span className="text-green-400 font-semibold">{dashboardStats.todayApiCalls.successRate}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Rate:</span>
                  <span className="text-red-400 font-semibold">{dashboardStats.todayApiCalls.rate}/min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Data Visualization Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* API Requests Stats */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-6">API Requests</h3>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">37.3M</div>
                  <div className="text-sm text-slate-400">Total Requests</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">99.8%</div>
                  <div className="text-sm text-slate-400">Success Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">1.78</div>
                  <div className="text-sm text-slate-400">Avg Rate/min</div>
                </div>
              </div>
            </div>

            {/* API Traffic Chart */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-6">API Traffic Overview (24h)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={apiTrafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                  <YAxis stroke="#9CA3AF" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F9FAFB'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="requests" 
                    stroke="#ef4444" 
                    strokeWidth={3}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-4 text-center">
                <span className="text-xs text-slate-400">Average Latency: </span>
                <span className="text-xs text-green-400 font-semibold">&lt;100ms</span>
              </div>
            </div>

            {/* Data Consumption Chart */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-6">Data Consumption by Segment</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={segmentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {segmentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F9FAFB'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {segmentData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2" 
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <span className="text-slate-300">{item.name}</span>
                    </div>
                    <span className="font-semibold text-white">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Priority Review Queue */}
            <div className="xl:col-span-2 bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-6">Priority Review Queue</h3>
              <div className="space-y-4">
                {pendingRequests.map((request, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Package className="w-5 h-5 text-slate-400" />
                      <div>
                        <h4 className="font-semibold text-white">{request.product}</h4>
                        <div className="flex items-center space-x-4 text-sm text-slate-400">
                          <span>{request.category}</span>
                          <span>•</span>
                          <span>{request.id}</span>
                          <span>•</span>
                          <span>{request.user}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button className="flex items-center px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </button>
                      <button className="flex items-center px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h3 className="text-lg font-semibold text-slate-200 mb-6">Quick Actions</h3>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { icon: Plus, label: 'Add New Product', color: 'bg-red-600 hover:bg-red-700' },
                  { icon: BarChart3, label: 'Review Crowdsourcing', color: 'bg-slate-700 hover:bg-slate-600' },
                  { icon: Wrench, label: 'System Maintenance', color: 'bg-slate-700 hover:bg-slate-600' },
                  { icon: Shield, label: 'Security Settings', color: 'bg-slate-700 hover:bg-slate-600' },
                  { icon: Key, label: 'API Key Management', color: 'bg-slate-700 hover:bg-slate-600' }
                ].map((action, index) => (
                  <button 
                    key={index}
                    className={`flex items-center p-4 ${action.color} text-white rounded-lg transition-colors text-left`}
                  >
                    <action.icon className="w-5 h-5 mr-3" />
                    <span className="font-medium">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Security & Audit Feed */}
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h3 className="text-lg font-semibold text-slate-200 mb-6">Live Security & Audit Feed</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {auditLogs.map((log, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      log.type === 'success' ? 'bg-green-400' :
                      log.type === 'warning' ? 'bg-yellow-400' :
                      log.type === 'error' ? 'bg-red-400' : 'bg-blue-400'
                    }`}></div>
                    <span className="text-sm font-mono text-slate-400">{log.time}</span>
                    <span className="text-sm text-white">{log.action}</span>
                    {log.user && <span className="text-sm text-slate-400">by {log.user}</span>}
                    {log.admin && <span className="text-sm text-red-400">by {log.admin}</span>}
                    {log.system && <span className="text-sm text-blue-400">({log.system})</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
    </div>
  );
}