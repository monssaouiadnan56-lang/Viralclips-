'use client';

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[#0b1326]" />
      <div className="absolute top-[5%] right-[10%] w-[600px] h-[600px] rounded-full blur-[140px] bg-[#d0bcff]/10 animate-float-1" />
      <div className="absolute bottom-[15%] left-[5%] w-[450px] h-[450px] rounded-full blur-[110px] bg-[#f751a1]/10 animate-float-2" />
      <div className="absolute top-[40%] left-[25%] w-[500px] h-[500px] rounded-full blur-[120px] bg-[#0566d9]/5 animate-float-3" />
      <div className="absolute top-[70%] right-[20%] w-[300px] h-[300px] rounded-full blur-[90px] bg-[#d0bcff]/5 animate-float-2" style={{ animationDelay: '-5s' }} />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(208,188,255) 1px, transparent 0)',
          backgroundSize: '48px 48px',
        }}
      />
    </div>
  );
}
