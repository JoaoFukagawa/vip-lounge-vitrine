export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
      <span className="brand-gradient-text text-sm font-bold tracking-[0.2em]">
        VIP LOUNGE
      </span>
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-accent-2" />
    </div>
  );
}
