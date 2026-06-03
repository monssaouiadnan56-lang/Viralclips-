'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, CheckCircle, Search, Filter, BarChart3,
  Settings, LogOut, Upload, Sparkles, Calendar, Play,
  Bell, HelpCircle, Zap, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import UploadVideoAdvanced from '@/components/UploadVideo';
import VideoCard from '@/components/VideoCard';
import AnimatedBackground from '@/components/AnimatedBackground';
import UpgradeButton from '@/components/UpgradeButton';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const NAV_ITEMS = [
  { id: 'overview', icon: BarChart3, label: 'Dashboard' },
  { id: 'videos',   icon: Film,      label: 'Library'   },
  { id: 'clips',    icon: Upload,    label: 'Clips'     },
  { id: 'settings', icon: Settings,  label: 'Settings'  },
];

const CARD_GRADIENTS = [
  'from-indigo-900/60 via-purple-900/40 to-slate-900',
  'from-purple-900/60 via-pink-900/40 to-slate-900',
  'from-blue-900/60 via-indigo-900/40 to-slate-900',
] as const;

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [subscription, setSubscription] = useState<{ status: string; plan: string }>({
    status: 'free',
    plan: 'free',
  });
  const router = useRouter();

  useEffect(() => { checkUser(); }, []);

  const isProcessing = videos.some(v => v.status === 'processing');
  useEffect(() => {
    if (!isProcessing || !user?.id) return;
    const id = user.id as string;
    const interval = setInterval(() => {
      fetchVideos(id);
      fetchClips(id);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, user?.id]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUser(user);
    fetchVideos(user.id);
    fetchClips(user.id);
    fetchSubscription(user.id);
  };

  const fetchVideos = async (userId: string) => {
    const { data, error } = await supabase
      .from('videos').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) { console.error('fetchVideos error:', error); toast.error('Error al cargar videos'); }
    else setVideos(data ?? []);
    setLoading(false);
  };

  const fetchClips = async (userId: string) => {
    const { data: videoRows, error: videoErr } = await supabase
      .from('videos').select('id').eq('user_id', userId);
    if (videoErr) { console.error('fetchClips error:', videoErr); return; }
    const videoIds = (videoRows ?? []).map((v: { id: string }) => v.id);
    if (videoIds.length === 0) { setClips([]); return; }
    const { data, error } = await supabase
      .from('clips').select('*, videos(title)').in('video_id', videoIds)
      .order('created_at', { ascending: false });
    if (error) { console.error('fetchClips error:', error); toast.error('Error al cargar clips'); }
    else setClips(data ?? []);
  };

  const fetchSubscription = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('subscription_status, plan_name')
      .eq('id', userId)
      .single();
    if (data) {
      setSubscription({
        status: (data.subscription_status as string | null) ?? 'free',
        plan:   (data.plan_name          as string | null) ?? 'free',
      });
    }
  };

  const toggleVideoClips = (videoId: string) =>
    setExpandedVideo(prev => prev === videoId ? null : videoId);

  const clipsByVideoId = clips.reduce<Record<string, any[]>>((acc, clip) => {
    const vid = String(clip.video_id);
    acc[vid] = [...(acc[vid] ?? []), clip];
    return acc;
  }, {});

  const handleRefresh = () => {
    const userId: string = user?.id ?? '';
    if (!userId) return;
    fetchVideos(userId);
    fetchClips(userId);
  };

  const handleUploadSuccess = handleRefresh;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Sesión cerrada correctamente');
    router.push('/');
  };

  const userEmail: string = user?.email ?? '';
  const username = userEmail.split('@')[0] ?? 'Usuario';

  const stats = {
    totalVideos: videos.length,
    processing: videos.filter(v => v.status === 'processing').length,
    completed: videos.filter(v => v.status === 'completed').length,
  };

  const filteredVideos = videos.filter(v =>
    v.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd] overflow-x-hidden">
      <AnimatedBackground />

      {/* ── Fixed Sidebar ── */}
      <aside className="fixed left-0 top-0 h-full z-40 w-64 flex flex-col bg-[#131b2e]/40 backdrop-blur-2xl border-r border-white/5">
        <div className="px-6 pt-6 pb-4">
          <h1 className="font-sora text-xl font-bold bg-gradient-to-r from-[#d0bcff] to-[#f751a1] bg-clip-text text-transparent">
            ViralClips AI
          </h1>
          <p className="text-[11px] text-[#cbc3d7]/70 font-semibold tracking-widest uppercase mt-0.5">
            {subscription.plan === 'pro' && subscription.status === 'active' ? 'Pro Plan' : 'Free Plan'}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold tracking-widest uppercase transition-all duration-200 ${
                activeTab === item.id
                  ? 'bg-[#a078ff]/20 text-[#d0bcff] border-r-4 border-[#d0bcff] translate-x-0.5'
                  : 'text-[#cbc3d7] hover:bg-white/5 hover:text-[#dae2fd]'
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-4 pb-6 space-y-4">
          <button
            onClick={() => setActiveTab('videos')}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#d0bcff] to-[#adc6ff] text-[#3c0091] text-xs font-bold tracking-widest uppercase shadow-lg hover:brightness-110 active:scale-95 transition-all"
          >
            <Zap className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
            Generate Clips
          </button>
          <div className="space-y-0.5">
            <button className="w-full flex items-center gap-3 px-4 py-2 text-xs font-semibold text-[#cbc3d7] hover:text-[#dae2fd] tracking-widest uppercase transition-colors">
              <HelpCircle className="w-4 h-4" /> Help Center
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-xs font-semibold text-[#cbc3d7] hover:text-[#dae2fd] tracking-widest uppercase transition-colors"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </aside>

      {/* ── Fixed Header ── */}
      <header className="fixed top-0 left-0 w-full z-50 h-20 flex items-center justify-between px-10 bg-white/5 backdrop-blur-xl border-b border-white/10 shadow-[0_0_40px_rgba(208,188,255,0.05)]">
        <div className="pl-64 flex-1">
          <div className="relative w-64">
            <input
              type="text"
              placeholder="Search your clips..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#060e20] border border-white/10 rounded-full px-6 py-2 text-sm text-[#dae2fd] placeholder:text-[#cbc3d7]/40 focus:outline-none focus:ring-2 focus:ring-[#d0bcff]/50 focus:border-[#d0bcff]/50 transition-all"
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#cbc3d7]/50" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="p-2 rounded-full hover:bg-white/10 text-[#cbc3d7] transition-all">
            <Bell className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 pl-4 border-l border-white/10">
            <div className="text-right">
              <p className="text-sm font-semibold text-[#dae2fd] font-sora">{username}</p>
              <p className="text-xs text-[#cbc3d7]/60">Creator</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d0bcff] to-[#f751a1] flex items-center justify-center text-sm font-bold text-[#3c0091] border-2 border-[#d0bcff]/30 flex-shrink-0">
              {username.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="ml-64 pt-28 px-10 pb-20 max-w-[1280px] mx-auto relative z-10">
        <AnimatePresence mode="wait">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-10">

              {/* Bento stats grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Welcome card */}
                <div className="md:col-span-2 glass-card rounded-3xl p-8 flex flex-col justify-between overflow-hidden relative group">
                  <div className="relative z-10">
                    <h2 className="font-sora text-[32px] font-semibold leading-tight mb-2">
                      Welcome back, {username}.
                    </h2>
                    <p className="text-[#cbc3d7] text-[18px] max-w-xs leading-relaxed">
                      {stats.processing > 0
                        ? `Your AI is currently processing ${stats.processing} video${stats.processing > 1 ? 's' : ''}.`
                        : 'Upload a video to start generating viral clips.'}
                    </p>
                  </div>
                  <div className="mt-8 relative z-10">
                    <button
                      onClick={() => setActiveTab('clips')}
                      className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-all text-xs font-semibold tracking-widest uppercase"
                    >
                      View Clips
                    </button>
                  </div>
                  <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-[#d0bcff]/20 blur-[80px] rounded-full group-hover:bg-[#d0bcff]/30 transition-all duration-700 animate-float-1" />
                </div>

                {/* Clips stat */}
                <div className="glass-card rounded-3xl p-6 flex flex-col justify-center items-center text-center">
                  <Sparkles className="w-8 h-8 text-[#d0bcff] mb-3" />
                  <p className="font-sora text-[48px] font-bold leading-tight text-[#dae2fd]">{clips.length}</p>
                  <p className="text-[11px] font-semibold tracking-widest uppercase text-[#cbc3d7] mt-1">Clips Generated</p>
                </div>

                {/* Completed stat */}
                <div className="glass-card rounded-3xl p-6 flex flex-col justify-center items-center text-center">
                  <TrendingUp className="w-8 h-8 text-[#ffb0cd] mb-3" />
                  <p className="font-sora text-[48px] font-bold leading-tight text-[#dae2fd]">{stats.completed}</p>
                  <p className="text-[11px] font-semibold tracking-widest uppercase text-[#cbc3d7] mt-1">Completed</p>
                </div>
              </div>

              {/* Magic border upload zone */}
              <div
                className="relative p-px rounded-3xl bg-gradient-to-r from-[#d0bcff] to-[#f751a1] shadow-[0_0_50px_rgba(208,188,255,0.15)] hover:shadow-[0_0_70px_rgba(208,188,255,0.25)] transition-all cursor-pointer group"
                onClick={() => setActiveTab('videos')}
              >
                <div className="rounded-[calc(1.5rem-1px)] bg-[#0b1326] p-12 flex flex-col items-center justify-center border-2 border-dashed border-white/5 group-hover:border-[#d0bcff]/30 transition-all">
                  <div className="w-20 h-20 rounded-full bg-[#d0bcff]/10 flex items-center justify-center mb-6 group-hover:bg-[#d0bcff]/20 transition-all">
                    <Upload className="w-10 h-10 text-[#d0bcff]" />
                  </div>
                  <h3 className="font-sora text-[24px] font-semibold mb-2">Drop your video here</h3>
                  <p className="text-[#cbc3d7] text-base mb-6">Or click to browse from your computer (MP4, MOV, up to 500MB)</p>
                  <div className="flex gap-4" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setActiveTab('videos')}
                      className="px-8 py-3 rounded-full bg-[#d0bcff] text-[#3c0091] text-xs font-bold tracking-widest uppercase hover:brightness-110 transition-all"
                    >
                      Upload Now
                    </button>
                    <button className="px-8 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold tracking-widest uppercase transition-all">
                      Import from Link
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Processing */}
              <div>
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h3 className="font-sora text-[24px] font-semibold">Active Processing</h3>
                    <p className="text-[#cbc3d7] text-sm mt-1">Real-time status of your AI-driven clips.</p>
                  </div>
                  <button onClick={() => setActiveTab('videos')} className="text-[#d0bcff] text-xs font-semibold hover:underline">
                    View All Task History
                  </button>
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="h-64 glass-card rounded-[1.5rem] animate-pulse" />
                    ))}
                  </div>
                ) : videos.length === 0 ? (
                  <div className="text-center py-16 glass-card rounded-3xl border-dashed">
                    <Film className="w-12 h-12 text-white/10 mx-auto mb-3" />
                    <p className="text-[#cbc3d7] text-sm">No videos yet — upload one to get started</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {videos.slice(0, 3).map((video, i) => (
                      <ProcessingCard
                        key={video.id}
                        video={video}
                        index={i}
                        clipsCount={clipsByVideoId[video.id]?.length ?? 0}
                        onAction={() => setActiveTab('videos')}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Video Library table */}
              {videos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-sora text-[24px] font-semibold">Video Library</h3>
                  </div>
                  <div className="glass-card rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/5">
                          {['Video Name', 'Status', 'Date', 'Clips', 'Actions'].map(h => (
                            <th key={h} className="px-6 py-4 text-[11px] font-semibold tracking-widest uppercase text-[#cbc3d7]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {videos.map(video => (
                          <tr key={video.id} className="hover:bg-white/5 transition-all group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-[#222a3d] flex items-center justify-center flex-shrink-0">
                                  <Film className="w-5 h-5 text-[#d0bcff]" />
                                </div>
                                <span className="text-sm font-semibold text-[#dae2fd] truncate max-w-[200px]">
                                  {video.title || 'Sin título'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge status={video.status} />
                            </td>
                            <td className="px-6 py-4 text-sm text-[#cbc3d7]">
                              {new Date(video.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-6 py-4 text-sm text-[#cbc3d7]">
                              {clipsByVideoId[video.id]?.length ?? 0}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => setActiveTab('videos')}
                                className="p-2 text-[#cbc3d7] hover:text-[#d0bcff] transition-colors"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-6 py-4 bg-white/5 flex justify-between items-center">
                      <p className="text-xs text-[#cbc3d7]">Showing {videos.length} video{videos.length !== 1 ? 's' : ''}</p>
                      <button onClick={() => setActiveTab('videos')} className="text-xs text-[#d0bcff] hover:underline font-semibold">
                        View all in Library →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── LIBRARY (videos) ── */}
          {activeTab === 'videos' && (
            <motion.div key="videos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-6">

              <UploadVideoAdvanced onSuccess={handleUploadSuccess} />

              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#cbc3d7]/50" />
                  <input
                    type="text"
                    placeholder="Buscar videos..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-[#dae2fd] placeholder:text-[#cbc3d7]/40 text-sm focus:outline-none focus:ring-1 focus:ring-[#d0bcff]/50"
                  />
                </div>
                <button className="p-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl hover:bg-white/[0.08] transition">
                  <Filter className="w-4 h-4 text-[#cbc3d7]" />
                </button>
              </div>

              <h3 className="font-sora text-lg font-semibold text-[#dae2fd]">Historial de Videos</h3>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[1, 2, 3].map(i => <div key={i} className="h-56 glass-card rounded-2xl animate-pulse" />)}
                </div>
              ) : filteredVideos.length === 0 ? (
                <div className="text-center py-20 glass-card rounded-2xl border-dashed">
                  <Film className="w-12 h-12 text-white/10 mx-auto mb-3" />
                  <p className="text-[#cbc3d7] text-sm">
                    {searchQuery ? 'No se encontraron videos' : 'No tienes videos aún'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredVideos.map(video => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      clipCount={clipsByVideoId[video.id]?.length ?? 0}
                      isExpanded={expandedVideo === video.id}
                      onToggle={() => toggleVideoClips(video.id)}
                      videoClips={clipsByVideoId[video.id] ?? []}
                      onPlayClip={url => setSelectedClip(url)}
                      onRefresh={handleRefresh}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── CLIPS ── */}
          {activeTab === 'clips' && (
            <motion.div key="clips" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-6">

              <div className="flex items-center justify-between">
                <h3 className="font-sora text-2xl font-semibold text-[#dae2fd]">Viral Clips</h3>
                <div className="px-3 py-1.5 bg-[#a078ff]/20 border border-[#d0bcff]/30 text-[#d0bcff] rounded-full text-xs font-semibold">
                  {clips.length} clips generated
                </div>
              </div>

              {loading ? (
                <p className="text-[#cbc3d7] text-sm">Loading clips...</p>
              ) : clips.length === 0 ? (
                <div className="text-center py-20 glass-card rounded-2xl border-dashed">
                  <Upload className="w-12 h-12 text-white/10 mx-auto mb-3" />
                  <p className="text-[#cbc3d7] text-sm mb-1">No clips yet</p>
                  <p className="text-xs text-[#cbc3d7]/50">Process a video to generate clips automatically</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {clips.map((clip, index) => (
                    <motion.div key={clip.id} initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.06 }}
                      className="glass-card rounded-[1.5rem] overflow-hidden hover:border-[#d0bcff]/30 hover:shadow-lg hover:shadow-[#d0bcff]/10 transition-all group"
                    >
                      <div className="relative h-40 bg-[#060e20] flex items-center justify-center overflow-hidden">
                        <div className="h-full aspect-[9/16] bg-gradient-to-b from-[#a078ff]/40 via-indigo-950/40 to-[#0b1326]/80 flex items-center justify-center relative overflow-hidden">
                          <Film className="w-8 h-8 text-[#d0bcff]/25" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-[2px]">
                            <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center">
                              <Play className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        </div>
                        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-[#d0bcff] text-[#3c0091] rounded text-[9px] font-bold">
                          <Sparkles className="w-2.5 h-2.5" />
                          Clip #{index + 1}
                        </div>
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur rounded text-[9px] text-[#cbc3d7] border border-white/10 font-mono">
                          9:16
                        </div>
                      </div>
                      <div className="p-4">
                        <h4 className="font-semibold text-[#dae2fd] text-sm mb-3 line-clamp-2">{clip.title}</h4>
                        <div className="space-y-1.5 mb-4">
                          <div className="flex items-center gap-1.5 text-xs text-[#cbc3d7]/60">
                            <Film className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{clip.videos?.title ?? 'Video'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#cbc3d7]/50">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span>{new Date(clip.created_at).toLocaleDateString('es-ES')}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => clip.url && setSelectedClip(clip.url)}
                          className="w-full py-2 bg-gradient-to-r from-[#d0bcff] to-[#adc6ff] hover:brightness-110 text-[#3c0091] text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Ver clip
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── SETTINGS ── */}
          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="max-w-xl">
              <div className="glass-card rounded-2xl p-8">
                <h3 className="font-sora text-xl font-semibold text-[#dae2fd] mb-6 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-[#d0bcff]" />
                  Account Settings
                </h3>
                <div className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#cbc3d7] uppercase tracking-widest mb-2">Email</label>
                    <input type="email" value={userEmail} disabled
                      className="w-full px-4 py-3 bg-[#060e20] border border-white/[0.08] rounded-xl text-[#cbc3d7]/60 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#cbc3d7] uppercase tracking-widest mb-2">Current Plan</label>

                    {subscription.plan === 'pro' && subscription.status === 'active' ? (
                      /* ── Plan Pro activo ─────────────────────────────── */
                      <div className="flex items-center gap-3 px-4 py-3 bg-[#060e20] border border-[#d0bcff]/30 rounded-xl">
                        <Sparkles className="w-4 h-4 text-[#d0bcff]" />
                        <span className="text-sm font-semibold text-[#dae2fd]">ViralClips Pro</span>
                        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/30 font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          Activo
                        </span>
                      </div>
                    ) : subscription.status === 'past_due' ? (
                      /* ── Pago pendiente ──────────────────────────────── */
                      <div className="flex items-center gap-3 px-4 py-3 bg-[#060e20] border border-amber-500/30 rounded-xl mb-3">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span className="text-sm text-[#dae2fd]">Pro — pago pendiente</span>
                        <span className="ml-auto text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30 font-semibold">Atrasado</span>
                      </div>
                    ) : (
                      /* ── Free plan — mostrar upgrade ─────────────────── */
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 px-4 py-3 bg-[#060e20] border border-white/[0.08] rounded-xl">
                          <Sparkles className="w-4 h-4 text-[#d0bcff]" />
                          <span className="text-sm text-[#dae2fd]">Free Plan</span>
                          <span className="ml-auto text-[10px] text-[#cbc3d7] bg-white/5 px-2.5 py-1 rounded-full border border-white/10 font-semibold">Activo</span>
                        </div>
                        <UpgradeButton className="w-full" />
                      </div>
                    )}
                  </div>
                  <div className="pt-4 border-t border-white/[0.07]">
                    <button className="px-6 py-2.5 bg-gradient-to-r from-[#d0bcff] to-[#adc6ff] text-[#3c0091] text-sm font-bold rounded-xl transition-all hover:brightness-110">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── Video Modal ── */}
      <AnimatePresence>
        {selectedClip && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedClip(null)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()} className="relative w-full max-w-3xl"
            >
              <button onClick={() => setSelectedClip(null)}
                className="absolute -top-10 right-0 text-[#cbc3d7] hover:text-white text-sm flex items-center gap-1.5 transition">
                ✕ Cerrar
              </button>
              <video src={selectedClip} controls autoPlay className="w-full rounded-2xl shadow-2xl" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Processing Card (overview only, no edit/delete logic) ── */
function ProcessingCard({ video, index, clipsCount, onAction }: {
  video: any; index: number; clipsCount: number; onAction: () => void;
}) {
  const grad = CARD_GRADIENTS[index % CARD_GRADIENTS.length] ?? CARD_GRADIENTS[0];
  const isProcessing = video.status === 'processing';
  const isCompleted  = video.status === 'completed';

  return (
    <div className="glass-card rounded-[1.5rem] overflow-hidden group hover:border-[#d0bcff]/20 transition-all">
      <div className={`relative h-48 bg-gradient-to-br ${grad} overflow-hidden`}>

        {isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/30">
            <p className="text-xs font-semibold text-[#d0bcff] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#d0bcff] animate-pulse" />
              Analyzing...
            </p>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-[#d0bcff] to-transparent"
              />
            </div>
            <p className="text-xs text-white/50 mt-2">Extracting virality markers...</p>
          </div>
        )}

        {isCompleted && (
          <>
            <div className="absolute top-4 right-4 bg-[#d0bcff] text-[#3c0091] px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg">
              <CheckCircle className="w-3 h-3" />
              Ready
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/80 to-transparent flex items-end p-4">
              <button
                onClick={onAction}
                className="w-full py-2 bg-white text-[#0b1326] text-xs font-bold rounded-lg hover:bg-[#d0bcff] transition-all"
              >
                Review &amp; Export
              </button>
            </div>
          </>
        )}

        {!isProcessing && !isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="w-14 h-14 text-white/5" />
          </div>
        )}
      </div>

      <div className="p-5">
        <h4 className="text-xs font-bold text-[#dae2fd] mb-2 truncate">{video.title || 'Sin título'}</h4>
        <div className="flex flex-wrap gap-2">
          {isCompleted && clipsCount > 0 && (
            <>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-[#cbc3d7] uppercase tracking-wider">High Virality</span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-[#cbc3d7] uppercase tracking-wider">{clipsCount} Clips Found</span>
            </>
          )}
          {isProcessing && <span className="text-xs text-[#cbc3d7]/60">Applying dynamic styles...</span>}
          {video.status === 'pending' && <span className="text-xs text-[#cbc3d7]/60">Waiting to process</span>}
          {video.status === 'failed' && <span className="text-xs text-red-400/80">Processing failed</span>}
        </div>
      </div>
    </div>
  );
}

/* ── Status Badge ── */
function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, { label: string; cls: string }> = {
    completed: { label: 'Completed', cls: 'bg-[#0566d9]/20 text-[#adc6ff] border-[#adc6ff]/20' },
    processing: { label: 'Processing', cls: 'bg-[#a078ff]/20 text-[#d0bcff] border-[#d0bcff]/20' },
    failed:     { label: 'Failed',     cls: 'bg-red-900/20  text-red-400  border-red-400/20'  },
    pending:    { label: 'Pending',    cls: 'bg-white/5     text-[#cbc3d7] border-white/10'    },
  };
  const s = MAP[status] ?? MAP.pending!;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>
      {s.label}
    </span>
  );
}
