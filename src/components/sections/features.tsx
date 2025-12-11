
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Ship, 
  Calendar, 
  FileText, 
  User, 
  BarChart3, 
  Settings,
  ChevronRight,
  MapPin,
  Clock,
  CheckCircle2,
  Waves,
  Anchor,
  Building,
  Briefcase
} from 'lucide-react';

type ViewType = 'overview' | 'vessels' | 'calendar' | 'testimonials' | 'profile';

const Features = () => {
  const [activeView, setActiveView] = useState<ViewType>('overview');

  const navigationItems = [
    { id: 'overview' as ViewType, label: 'Overview', icon: BarChart3 },
    { id: 'vessels' as ViewType, label: 'Vessels', icon: Ship },
    { id: 'calendar' as ViewType, label: 'Calendar', icon: Calendar },
    { id: 'testimonials' as ViewType, label: 'Testimonials', icon: FileText },
    { id: 'profile' as ViewType, label: 'Profile', icon: User },
  ];

  const mockVessels = [
    { 
      name: 'MY OCEAN STAR', 
      type: 'Motor Yacht', 
      days: 145, 
      status: 'Active',
      currentState: 'Underway',
      imo: '9876543',
      flag: 'Malta',
      lastUpdate: '2 hours ago'
    },
    { 
      name: 'SV HORIZON', 
      type: 'Sailing Yacht', 
      days: 92, 
      status: 'Past',
      currentState: 'In Port',
      imo: '1234567',
      flag: 'British',
      lastUpdate: '5 days ago'
    },
    { 
      name: 'MY SEABREEZE', 
      type: 'Motor Yacht', 
      days: 78, 
      status: 'Past',
      currentState: 'On Leave',
      imo: '5554321',
      flag: 'Cayman Islands',
      lastUpdate: '12 days ago'
    },
  ];

  // Vessel states matching the dashboard
  const vesselStates: { value: string; label: string; color: string; icon: React.FC<any> }[] = [
    { value: 'underway', label: 'Underway', color: '#3b82f6', icon: Waves },
    { value: 'at-anchor', label: 'At Anchor', color: '#f97316', icon: Anchor },
    { value: 'in-port', label: 'In Port', color: '#22c55e', icon: Building },
    { value: 'on-leave', label: 'On Leave', color: '#6b7280', icon: Briefcase },
    { value: 'in-yard', label: 'In Yard', color: '#ef4444', icon: Ship },
  ];

  // Mock calendar data - February 2024 with varied vessel states
  const mockCalendarDays: ({ day: number; state: string | null } | null)[] = [
    null, null, null, null, // Empty days before Feb 1
    { day: 1, state: 'underway' },
    { day: 2, state: 'at-anchor' },
    { day: 3, state: 'at-anchor' },
    { day: 4, state: 'in-port' },
    { day: 5, state: 'in-port' },
    { day: 6, state: 'in-port' },
    { day: 7, state: 'underway' },
    { day: 8, state: 'underway' },
    { day: 9, state: 'at-anchor' },
    { day: 10, state: 'at-anchor' },
    { day: 11, state: 'in-port' },
    { day: 12, state: 'in-port' },
    { day: 13, state: 'underway' },
    { day: 14, state: 'underway' },
    { day: 15, state: 'at-anchor' },
    { day: 16, state: 'in-port' },
    { day: 17, state: 'on-leave' },
    { day: 18, state: 'on-leave' },
    { day: 19, state: 'in-port' },
    { day: 20, state: 'at-anchor' },
    { day: 21, state: 'underway' },
    { day: 22, state: 'underway' },
    { day: 23, state: 'at-anchor' },
    { day: 24, state: 'at-anchor' },
    { day: 25, state: 'in-port' },
    { day: 26, state: 'in-yard' },
    { day: 27, state: 'in-yard' },
    { day: 28, state: 'in-port' },
    { day: 29, state: 'at-anchor' },
  ];

  const mockTestimonials = [
    {
      id: 1,
      vessel: 'MY OCEAN STAR',
      captain: 'Captain James Wilson',
      status: 'Approved',
      date: '2024-01-15',
      period: '145 days'
    },
    {
      id: 2,
      vessel: 'SV HORIZON',
      captain: 'Captain Sarah Mitchell',
      status: 'Pending',
      date: '2024-02-10',
      period: '92 days'
    },
    {
      id: 3,
      vessel: 'MY SEABREEZE',
      captain: 'Captain Robert Chen',
      status: 'Approved',
      date: '2024-01-05',
      period: '78 days'
    },
  ];

  const OverviewView = () => (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>Total Sea Time</p>
              <p className="text-2xl font-bold text-white">315 days</p>
            </div>
            <Clock className="h-8 w-8" style={{ color: '#60a5fa' }} />
          </div>
        </div>
        <div className="rounded-lg border p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>Active Vessels</p>
              <p className="text-2xl font-bold text-white">1</p>
            </div>
            <Ship className="h-8 w-8" style={{ color: '#4ade80' }} />
          </div>
        </div>
        <div className="rounded-lg border p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>Testimonials</p>
              <p className="text-2xl font-bold text-white">3</p>
            </div>
            <FileText className="h-8 w-8" style={{ color: '#a78bfa' }} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <h3 className="font-semibold text-white mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {[
            { action: 'State updated', vessel: 'MY OCEAN STAR', state: 'Underway', time: '2 hours ago' },
            { action: 'Testimonial approved', vessel: 'MY OCEAN STAR', time: '5 days ago' },
            { action: 'State updated', vessel: 'SV HORIZON', state: 'In Port', time: '5 days ago' },
          ].map((activity, idx) => (
            <div key={idx} className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: '#60a5fa' }}></div>
              <div className="flex-1">
                <p className="text-sm text-white">
                  <span className="font-medium">{activity.action}</span>
                  {activity.vessel && <span className="mx-1" style={{ color: '#94a3b8' }}>on {activity.vessel}</span>}
                  {activity.state && <span className="mx-1 px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>{activity.state}</span>}
                </p>
                <p className="text-xs mt-1" style={{ color: '#64748b' }}>{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const VesselsView = () => (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockVessels.map((vessel, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.1 }}
            className="rounded-xl border p-5" 
            style={{ 
              backgroundColor: 'rgba(15, 23, 42, 0.6)', 
              borderColor: vessel.status === 'Active' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.15)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div 
                  className="h-10 w-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: vessel.status === 'Active' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(148, 163, 184, 0.2)' }}
                >
                  <Ship className="h-5 w-5" style={{ color: vessel.status === 'Active' ? '#60a5fa' : '#94a3b8' }} />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm mb-1">{vessel.name}</h4>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>{vessel.type}</p>
                </div>
              </div>
              <span 
                className={`px-2 py-1 rounded text-xs font-semibold ${
                  vessel.status === 'Active' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {vessel.status}
              </span>
            </div>

            <div className="space-y-2 pt-3 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: '#94a3b8' }}>Total Days</span>
                <span className="font-semibold text-white">{vessel.days}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: '#94a3b8' }}>Current State</span>
                <span className="font-semibold text-white">{vessel.currentState}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: '#94a3b8' }}>Last Update</span>
                <span className="text-white">{vessel.lastUpdate}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const CalendarView = () => (
    <div className="p-6">
      <div className="rounded-lg border p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <div className="mb-3 max-w-lg mx-auto">
          <h4 className="font-semibold text-sm text-white mb-1">February 2024</h4>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1.5">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center text-[10px] font-medium py-0.5" style={{ color: '#94a3b8' }}>
              {day}
            </div>
          ))}
        </div>
          
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {mockCalendarDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }
              
              const stateInfo = date.state ? vesselStates.find(s => s.value === date.state) : null;
              const Icon = stateInfo?.icon;
              
              return (
            <div
              key={idx}
                  className="aspect-square rounded-lg text-[10px] font-medium transition-all duration-200 flex flex-col items-center justify-center relative group cursor-pointer hover:scale-110 hover:shadow-xl hover:z-10 hover:ring-2"
                  style={stateInfo ? {
                    backgroundColor: stateInfo.color,
                    color: 'white',
                  } : {
                    backgroundColor: 'rgba(148, 163, 184, 0.2)',
                    color: '#94a3b8',
                  }}
                  onMouseEnter={(e) => {
                    if (stateInfo) {
                      e.currentTarget.style.boxShadow = `0 10px 25px -5px ${stateInfo.color}40, 0 0 0 2px ${stateInfo.color}`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '';
                  }}
                >
                  <span className="leading-none">{date.day}</span>
                  {Icon && <Icon className="h-1.5 w-1.5 mt-0.5 opacity-90" />}
                  
                  {/* Hover tooltip */}
                  {stateInfo && (
                    <div 
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 shadow-2xl"
              style={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.98)',
                        border: `2px solid ${stateInfo.color}`,
                        color: 'white',
                        backdropFilter: 'blur(10px)'
              }}
            >
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-3.5 w-3.5" style={{ color: stateInfo.color }} />}
                        <span className="font-semibold">February {date.day}, 2024</span>
                      </div>
                      <div className="text-center mt-0.5" style={{ color: stateInfo.color, fontSize: '10px' }}>
                        {stateInfo.label}
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1.5">
                        <div className="w-2.5 h-2.5 rotate-45 border-r-2 border-b-2" style={{ backgroundColor: 'rgba(15, 23, 42, 0.98)', borderColor: stateInfo.color }}></div>
                      </div>
                    </div>
              )}
            </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-center gap-2" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          {vesselStates.map((state) => {
            const Icon = state.icon;
            return (
              <div key={state.value} className="flex items-center gap-1">
                <div 
                  className="h-2.5 w-2.5 rounded"
                  style={{ backgroundColor: state.color }}
                ></div>
                {Icon && <Icon className="h-2.5 w-2.5" style={{ color: state.color }} />}
                <span className="text-[10px]" style={{ color: '#c7d2fe' }}>{state.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const TestimonialsView = () => (
    <div className="p-6">
      <div className="space-y-4">
        {mockTestimonials.map((testimonial, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.1 }}
            className="rounded-lg border p-4" 
            style={{ 
              backgroundColor: 'rgba(15, 23, 42, 0.6)', 
              borderColor: 'rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-semibold text-white text-sm mb-1">{testimonial.vessel}</h4>
                <p className="text-xs" style={{ color: '#94a3b8' }}>{testimonial.captain}</p>
              </div>
              <span 
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  testimonial.status === 'Approved' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}
              >
                {testimonial.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs pt-2 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
              <span style={{ color: '#94a3b8' }}>Period: <span className="text-white font-medium">{testimonial.period}</span></span>
              <span style={{ color: '#94a3b8' }}>Date: <span className="text-white font-medium">{testimonial.date}</span></span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const ProfileView = () => (
    <div className="p-6">
      <div className="max-w-md mx-auto">
        <div className="rounded-lg border p-6 mb-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User className="h-8 w-8 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Maritime Professional</h3>
              <p className="text-sm" style={{ color: '#94a3b8' }}>Crew Member</p>
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: '#94a3b8' }}>Total Sea Time</span>
              <span className="font-semibold text-white">315 days</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: '#94a3b8' }}>Vessels Tracked</span>
              <span className="font-semibold text-white">3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: '#94a3b8' }}>Testimonials</span>
              <span className="font-semibold text-white">3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderView = () => {
    switch (activeView) {
      case 'overview':
        return <OverviewView />;
      case 'vessels':
        return <VesselsView />;
      case 'calendar':
        return <CalendarView />;
      case 'testimonials':
        return <TestimonialsView />;
      case 'profile':
        return <ProfileView />;
      default:
        return <OverviewView />;
    }
  };

  return (
    <section id="features" className="py-16 sm:py-24" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
            Experience the Dashboard
          </h2>
          <p className="text-lg leading-8 text-blue-100">
            Explore our interactive dashboard to see how easy it is to manage your maritime career. Click through different sections to see what we offer.
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Mock Dashboard Frame */}
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'rgba(2, 22, 44, 0.8)', borderColor: 'rgba(255, 255, 255, 0.2)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)' }}>
            {/* Header */}
            <div className="border-b p-4 flex items-center justify-between" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-gradient-to-br from-blue-500 to-purple-600"></div>
                <span className="font-bold text-white">SeaJourney Dashboard</span>
              </div>
              <Settings className="h-5 w-5" style={{ color: '#94a3b8' }} />
            </div>

            <div className="flex">
              {/* Sidebar Navigation */}
              <div className="w-56 border-r p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <nav className="space-y-2">
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveView(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive 
                            ? 'text-white shadow-lg' 
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                        style={{
                          backgroundColor: isActive ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        }}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                        {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Main Content Area */}
              <div className="flex-1" style={{ minHeight: '500px', backgroundColor: 'rgba(2, 22, 44, 0.5)' }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeView}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    {renderView()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Ship, title: 'Unlimited Vessel Tracking', desc: 'Track as many vessels as you need' },
              { icon: Calendar, title: 'Visual Calendar View', desc: 'See your service history at a glance' },
              { icon: FileText, title: 'Digital Testimonials', desc: 'Get captain sign-offs instantly' },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="rounded-xl border p-4 text-center"
                  style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <Icon className="h-8 w-8 mx-auto mb-3" style={{ color: '#60a5fa' }} />
                  <h4 className="font-semibold text-white text-sm mb-1">{feature.title}</h4>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
    