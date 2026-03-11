'use client';

import { useState, useEffect, useCallback } from 'react';
import { Watch, Compass, Clock, Bell, Smartphone, CheckCircle2, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const FAKE_PASSAGE = {
  vessel: 'M/Y Ocean Star',
  route: 'Gibraltar → Palma',
  startedTime: '09:38',
};

const WatchFeatureComingSoon = () => {
  const [appleRunning, setAppleRunning] = useState(false);
  const [appleElapsed, setAppleElapsed] = useState(0);
  const [galaxyRunning, setGalaxyRunning] = useState(false);
  const [galaxyElapsed, setGalaxyElapsed] = useState(0);
  const [watchNightMode, setWatchNightMode] = useState(false);

  useEffect(() => {
    if (!appleRunning) return;
    const t = setInterval(() => setAppleElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [appleRunning]);

  useEffect(() => {
    if (!galaxyRunning) return;
    const t = setInterval(() => setGalaxyElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [galaxyRunning]);

  const onAppleStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAppleRunning(true);
    setAppleElapsed(0);
  }, []);

  const onAppleEnd = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAppleRunning(false);
    setAppleElapsed(0);
  }, []);

  const onGalaxyStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGalaxyRunning(true);
    setGalaxyElapsed(0);
  }, []);

  const onGalaxyEnd = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGalaxyRunning(false);
    setGalaxyElapsed(0);
  }, []);

  const points = [
    { icon: Watch, label: 'Log from your wrist', color: '#3b82f6' },
    { icon: Compass, label: 'Nav watch tracking', color: '#8b5cf6' },
    { icon: Clock, label: 'Quick start & end', color: '#10b981' },
    { icon: Bell, label: 'Watch reminders', color: '#f59e0b' },
  ];

  const benefits = [
    'Start and end watches with one tap—no phone in hand',
    'Syncs automatically to your SeaJourney app and sea time',
    'Bridge, anchor, and custom watch types',
    'Ideal for crew on duty who need hands-free logging',
  ];

  return (
    <section
      id="watch-feature"
      className="py-28 sm:py-36 border-t border-white/10 relative overflow-hidden"
      style={{ backgroundColor: '#000b15' }}
    >
      {/* Refined layered background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[800px] h-[800px] bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_30%,rgba(6,182,212,0.08),transparent_50%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,11,21,0.3)_100%)]" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="max-w-3xl mb-20 sm:mb-24 lg:mb-28 text-center mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500/15 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-cyan-200/95 border border-cyan-500/25 mb-6 lg:mb-8"
          >
            <Watch className="h-4 w-4 text-cyan-400/90" />
            Coming soon
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl mb-4 lg:mb-5"
          >
            Nav watches,{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              straight from your wrist
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl leading-8 text-blue-100/85 max-w-2xl mx-auto"
          >
            Record bridge and nav watches in seconds from your smartwatch—no phone needed. Works on Apple Watch and Galaxy Watch and syncs to your SeaJourney account.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="text-sm text-white/50 mt-4"
          >
            Try the demo below
          </motion.p>
        </div>

        {/* Main content */}
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-10 sm:gap-12 lg:gap-x-16 lg:gap-y-12 items-start"
          >
            {/* Watches demo - staged showcase */}
            <div className="lg:col-span-7 order-1">
              <div className="rounded-3xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-sm p-8 sm:p-10 lg:p-12 shadow-[0_0_60px_-20px_rgba(6,182,212,0.15)]">
                <p className="text-center text-xs font-medium text-cyan-300/80 uppercase tracking-widest mb-8">
                  Interactive demo
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-center gap-12 sm:gap-14 lg:gap-16">
                  {/* Apple Watch - idle */}
                  <motion.div
                    className="flex flex-col items-center gap-4"
                    whileHover={{ y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                <div
                  className="relative p-2 rounded-[2.5rem] shadow-2xl"
                  style={{
                    background: 'linear-gradient(145deg, #2c2c2e 0%, #1c1c1e 50%, #0d0d0f 100%)',
                    boxShadow: '0 30px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)',
                  }}
                >
                  <div
                    className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-12 rounded-full z-10"
                    style={{ background: 'linear-gradient(180deg, #3a3a3c, #1c1c1e)', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.5)' }}
                  />
                  <div
                    className="rounded-[2.15rem] overflow-hidden flex flex-col"
                    style={{
                      width: 176,
                      height: 216,
                      background: watchNightMode ? '#000' : 'linear-gradient(180deg, #0a1628 0%, #051018 100%)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: watchNightMode ? 'none' : 'inset 0 0 80px rgba(6, 182, 212, 0.06)',
                    }}
                  >
                    {/* Passage - left-aligned block */}
                    <div className="px-3 pt-2.5 pb-2 shrink-0">
                      <p className={cn("text-[6px] uppercase tracking-wider mb-0.5", watchNightMode ? "text-red-500/80" : "text-white/40")}>Vessel</p>
                      <p className={cn("text-[7px] truncate", watchNightMode ? "text-red-400/90" : "text-white/70")}>{FAKE_PASSAGE.vessel}</p>
                      <p className={cn("text-[6px] uppercase tracking-wider mt-1.5 mb-0.5", watchNightMode ? "text-red-500/80" : "text-white/40")}>Route</p>
                      <p className={cn("text-[7px] truncate", watchNightMode ? "text-red-400/80" : "text-white/60")}>{FAKE_PASSAGE.route}</p>
                    </div>
                    {/* App content - structured rows */}
                    <div className="flex-1 flex flex-col px-3 min-h-0 pt-1 pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Compass className={cn("w-4 h-4 flex-shrink-0", watchNightMode ? "text-red-500/80" : "text-cyan-400/80")} strokeWidth={1.5} />
                        <span className={cn("text-[8px] font-semibold uppercase tracking-wider", watchNightMode ? "text-red-400/90" : "text-cyan-400/90")}>Nav Watch</span>
                      </div>
                      {!appleRunning ? (
                        <>
                          <div className="flex justify-between items-baseline mb-1">
                            <span className={cn("text-[7px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Type</span>
                            <span className={cn("text-[9px] font-medium", watchNightMode ? "text-red-400/90" : "text-white/90")}>Bridge</span>
                          </div>
                          <div className="flex justify-between items-baseline mb-3">
                            <span className={cn("text-[7px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Duration</span>
                            <span className={cn("text-[9px] font-medium tabular-nums", watchNightMode ? "text-red-400/90" : "text-white/90")}>00:00</span>
                          </div>
                          <button
                            type="button"
                            onClick={onAppleStart}
                            className={cn("w-full h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-white cursor-pointer active:scale-[0.98] transition-transform select-none mt-auto border", watchNightMode ? "bg-transparent border-green-700/80" : "bg-green-700 border-green-500/30")}
                          >
                            Start watch
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-baseline mb-1">
                            <span className={cn("text-[7px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Type</span>
                            <span className={cn("text-[9px] font-medium", watchNightMode ? "text-red-400/90" : "text-white/90")}>Bridge</span>
                          </div>
                          <div className="flex justify-between items-baseline mb-1">
                            <span className={cn("text-[7px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Elapsed</span>
                            <span className={cn("text-base font-bold tabular-nums", watchNightMode ? "text-red-400/95" : "text-cyan-200/95")}>{formatElapsed(appleElapsed)}</span>
                          </div>
                          <div className="flex justify-between items-baseline mb-3">
                            <span className={cn("text-[7px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Started</span>
                            <span className={cn("text-[8px]", watchNightMode ? "text-red-400/80" : "text-white/60")}>{FAKE_PASSAGE.startedTime}</span>
                          </div>
                          <button
                            type="button"
                            onClick={onAppleEnd}
                            className={cn("w-full h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-red-400 cursor-pointer active:scale-[0.98] transition-transform select-none mt-auto border border-red-500/30", watchNightMode ? "bg-transparent" : "bg-[#1a0a0a]")}
                          >
                            End watch
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-sm font-medium text-white/80">Apple Watch</span>
              </motion.div>

                  {/* Galaxy Watch */}
                  <motion.div
                    className="flex flex-col items-center gap-4"
                    whileHover={{ y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                <div
                  className="relative rounded-full p-2 shadow-2xl"
                  style={{
                    background: 'linear-gradient(145deg, #1a1a1c 0%, #0f0f10 100%)',
                    boxShadow: '0 30px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    className="rounded-full overflow-hidden flex flex-col"
                    style={{
                      width: 200,
                      height: 200,
                      background: watchNightMode ? '#000' : 'linear-gradient(180deg, #0a1628 0%, #051018 100%)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: watchNightMode ? 'none' : 'inset 0 0 80px rgba(99, 102, 241, 0.06)',
                    }}
                  >
                    {/* Inner safe area: constrained so button doesn't overflow circle */}
                    <div className="flex flex-col flex-1 min-h-0 p-3 w-[88%] max-w-[176px] min-w-0 mx-auto">
                      {/* Passage - vessel centered, route left-aligned */}
                      <div className="shrink-0 pt-2 pb-1">
                        <p className={cn("text-[5px] uppercase tracking-wider mb-0.5 text-center", watchNightMode ? "text-red-500/80" : "text-white/40")}>Vessel</p>
                        <p className={cn("text-[6px] truncate text-center", watchNightMode ? "text-red-400/90" : "text-white/70")}>{FAKE_PASSAGE.vessel}</p>
                        <p className={cn("text-[5px] uppercase tracking-wider mt-1 mb-0.5", watchNightMode ? "text-red-500/80" : "text-white/40")}>Route</p>
                        <p className={cn("text-[6px] truncate", watchNightMode ? "text-red-400/80" : "text-white/60")}>{FAKE_PASSAGE.route}</p>
                      </div>
                      {/* App content - label/value rows, left/right aligned */}
                      <div className="flex-1 flex flex-col min-h-0 pt-0.5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Compass className={cn("w-3.5 h-3.5 flex-shrink-0", watchNightMode ? "text-red-500/80" : "text-indigo-400/80")} strokeWidth={1.5} />
                          <span className={cn("text-[7px] font-semibold uppercase tracking-wider", watchNightMode ? "text-red-400/90" : "text-indigo-400/90")}>Nav Watch</span>
                        </div>
                        {!galaxyRunning ? (
                          <>
                            <div className="flex justify-between items-baseline mb-0.5">
                              <span className={cn("text-[6px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Type</span>
                              <span className={cn("text-[8px] font-medium", watchNightMode ? "text-red-400/90" : "text-white/90")}>Bridge</span>
                            </div>
                            <div className="flex justify-between items-baseline mb-2">
                              <span className={cn("text-[6px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Duration</span>
                              <span className={cn("text-[8px] font-medium tabular-nums", watchNightMode ? "text-red-400/90" : "text-white/90")}>00:00</span>
                            </div>
                            <div className="flex justify-center mt-auto">
                              <button
                                type="button"
                                onClick={onGalaxyStart}
                                className={cn("h-4 px-5 rounded-full flex items-center justify-center text-[7px] font-semibold text-white cursor-pointer active:scale-[0.98] transition-transform select-none border", watchNightMode ? "bg-transparent border-green-700/80" : "bg-green-700 border-green-500/30")}
                              >
                                Start watch
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between items-baseline mb-0.5">
                              <span className={cn("text-[6px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Type</span>
                              <span className={cn("text-[8px] font-medium", watchNightMode ? "text-red-400/90" : "text-white/90")}>Bridge</span>
                            </div>
                            <div className="flex justify-between items-baseline mb-0.5">
                              <span className={cn("text-[6px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Elapsed</span>
                              <span className={cn("text-sm font-bold tabular-nums", watchNightMode ? "text-red-400/95" : "text-indigo-200/95")}>{formatElapsed(galaxyElapsed)}</span>
                            </div>
                            <div className="flex justify-between items-baseline mb-1">
                              <span className={cn("text-[6px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/45")}>Started</span>
                              <span className={cn("text-[7px]", watchNightMode ? "text-red-400/80" : "text-white/60")}>{FAKE_PASSAGE.startedTime}</span>
                            </div>
                            <div className="mb-1.5 min-w-0">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className={cn("text-[6px] uppercase", watchNightMode ? "text-red-500/80" : "text-white/40")}>Progress</span>
                                <span className={cn("text-[6px] tabular-nums", watchNightMode ? "text-red-400/80" : "text-white/40")}>{Math.min(100, Math.round((galaxyElapsed / 120) * 100))}%</span>
                              </div>
                              <div className="w-full h-0.5 rounded-full bg-white/10 overflow-hidden">
                                <div className={cn("h-full rounded-full transition-all duration-1000", watchNightMode ? "bg-red-500/60" : "bg-indigo-400/80")} style={{ width: `${Math.min(100, (galaxyElapsed / 120) * 100)}%` }} />
                              </div>
                            </div>
                            <p className={cn("text-[5px] mb-1.5", watchNightMode ? "text-red-500/70" : "text-white/40")}>Syncs when ended</p>
                            <div className="flex justify-center">
                              <button
                                type="button"
                                onClick={onGalaxyEnd}
                                className={cn("h-3.5 px-4 rounded-full flex items-center justify-center text-[6px] font-semibold text-red-400 cursor-pointer active:scale-[0.98] transition-transform select-none border border-red-500/30", watchNightMode ? "bg-transparent" : "bg-[#1a0a0a]")}
                              >
                                End watch
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <span className="text-sm font-medium text-white/80">Galaxy Watch</span>
                    {galaxyRunning && <span className="text-xs text-cyan-300/70">Watch running</span>}
                  </motion.div>
                </div>
                <div className="flex justify-center mt-8">
                  <button
                    type="button"
                    onClick={() => setWatchNightMode((v) => !v)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full backdrop-blur-sm px-4 py-2 text-sm font-semibold border transition-colors cursor-pointer',
                      watchNightMode
                        ? 'bg-red-500/15 border-red-500/25 text-red-200/95 hover:bg-red-500/20'
                        : 'bg-cyan-500/15 border-cyan-500/25 text-cyan-200/95 hover:bg-cyan-500/20'
                    )}
                    aria-pressed={watchNightMode}
                    aria-label="Toggle night mode"
                  >
                    <Moon className={cn('h-4 w-4', watchNightMode ? 'text-red-400/90' : 'text-cyan-400/90')} />
                    Night mode
                  </button>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="lg:col-span-5 order-2 text-left">
              <div className="rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] backdrop-blur-sm p-6 sm:p-8 shadow-[0_0_40px_-15px_rgba(6,182,212,0.08)]">
                <h3 className="font-headline text-lg sm:text-xl font-semibold text-white mb-5 sm:mb-6">
                  Why log from your watch?
                </h3>
                <ul className="space-y-4 sm:space-y-5">
                  {benefits.map((text, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: 16 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, delay: 0.3 + idx * 0.08 }}
                      className="flex gap-3 sm:gap-4 items-start"
                    >
                      <div className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-cyan-500/20 border border-cyan-500/25 mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                      </div>
                      <span className="text-blue-100/90 text-sm sm:text-base leading-relaxed">
                        {text}
                      </span>
                    </motion.li>
                  ))}
                </ul>
                <div className="flex items-center gap-3 mt-6 pt-5 border-t border-white/10">
                  <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
                    <Smartphone className="h-5 w-5 text-white/70" />
                  </div>
                  <p className="text-sm text-blue-100/75 leading-snug">
                    Syncs to your SeaJourney app and counts toward your sea time.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Feature highlights */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-14 sm:mt-20 lg:mt-24"
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px flex-1 max-w-[80px] bg-gradient-to-r from-transparent to-white/20" />
              <p className="text-xs font-medium text-white/50 uppercase tracking-widest">
                What you get
              </p>
              <span className="h-px flex-1 max-w-[80px] bg-gradient-to-l from-transparent to-white/20" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {points.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15 transition-colors"
                  >
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${item.color}20`, border: `1px solid ${item.color}40` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: item.color }} />
                    </div>
                    <span className="text-sm font-medium text-white/95">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default WatchFeatureComingSoon;
