export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <img
        src="/crisisnexus-loader.svg"
        alt="CrisisNexus"
        className="w-40 h-40 animate-pulse"
      />
    </div>
  );
}
