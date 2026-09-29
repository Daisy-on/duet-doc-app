export default function DocHistorySkeleton() {
  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden bg-bg-main text-text-primary select-none"
      role="status"
      aria-label="历史记录加载中"
    >
      {/* Top Header Bar */}
      <header className="h-[60px] border-b border-border-color flex justify-between items-center px-4 shrink-0 bg-bg-main">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button */}
          <div className="w-8 h-8 rounded-lg skeleton-item shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            {/* Title */}
            <div className="w-16 h-5 rounded skeleton-item shrink-0" />
            <div className="w-[1px] h-3.5 bg-border-color mx-1.5 shrink-0" />
            {/* Doc Title */}
            <div className="w-28 sm:w-36 h-4 rounded skeleton-item" />
          </div>
          {/* View Mode Tag */}
          <div className="ml-4 w-20 h-6 rounded-md skeleton-item hidden sm:block shrink-0" />
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Version Select Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <div className="w-20 h-4 rounded skeleton-item hidden md:block" />
            <div className="w-36 sm:w-44 h-7.5 rounded-lg skeleton-item" />
            <div className="w-6 h-4 rounded skeleton-item hidden md:block" />
          </div>

          <div className="w-[1px] h-4 bg-border-color shrink-0 hidden sm:block" />

          {/* Legend */}
          <div className="w-32 h-6 rounded-md skeleton-item hidden lg:block" />

          {/* Action Button */}
          <div className="w-24 h-8 rounded-lg skeleton-item shrink-0" />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - History List */}
        <aside className="w-[240px] border-r border-border-color bg-bg-sidebar flex flex-col shrink-0">
          {/* History Item Cards */}
          <div className="flex-1 overflow-hidden p-2 space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border bg-bg-main shadow-xs flex flex-col gap-2 ${
                  i === 2
                    ? 'border-blue-300/60 dark:border-blue-800/60 bg-blue-50/30 dark:bg-blue-950/30'
                    : 'border-border-color/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full skeleton-item shrink-0" />
                    <div className="w-24 h-3.5 rounded skeleton-item" />
                  </div>
                  <div className="w-12 h-4 rounded-full skeleton-item shrink-0" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="w-16 h-3 rounded skeleton-item" />
                  {i === 2 && <div className="w-3 h-3 rounded-full skeleton-item shrink-0" />}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right Panel - Split Diff Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-main">
          <div className="flex-1 flex overflow-hidden relative bg-bg-main">
            {/* Left Column (Source Version) */}
            <div
              className="overflow-hidden bg-bg-sidebar/50 flex flex-col min-w-0"
              style={{ width: 'calc(50% - 2px)', flexShrink: 0 }}
            >
              {/* Column Sticky Header */}
              <div className="border-b border-border-color px-4 py-2.5 flex items-center justify-between shrink-0 bg-bg-sidebar/90">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full skeleton-item shrink-0" />
                  <div className="w-36 h-4 rounded skeleton-item" />
                </div>
                <div className="w-12 h-4 rounded-full skeleton-item" />
              </div>

              {/* Code Line Skeletons */}
              <div className="py-4 space-y-2.5 flex-1 overflow-hidden">
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-44 h-3.5 rounded skeleton-item" />
                </div>
                {/* Simulated deleted line with subtle red styling */}
                <div className="flex items-center px-4 gap-3 bg-red-500/10 py-1 border-l-4 border-red-500/50">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-60 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-32 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-72 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-52 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-40 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-80 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-48 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-64 h-3.5 rounded skeleton-item" />
                </div>
              </div>
            </div>

            {/* Split Resizer Divider */}
            <div className="w-1 bg-border-color shrink-0 flex items-center justify-center">
              <div className="w-[1px] h-8 bg-text-ghost/40" />
            </div>

            {/* Right Column (Comparison Version) */}
            <div className="flex-1 overflow-hidden bg-bg-main flex flex-col min-w-0">
              {/* Column Sticky Header */}
              <div className="border-b border-border-color px-4 py-2.5 flex items-center justify-between shrink-0 bg-bg-main">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full skeleton-item shrink-0" />
                  <div className="w-40 h-4 rounded skeleton-item" />
                </div>
                <div className="w-12 h-4 rounded-full skeleton-item" />
              </div>

              {/* Code Line Skeletons */}
              <div className="py-4 space-y-2.5 flex-1 overflow-hidden">
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-44 h-3.5 rounded skeleton-item" />
                </div>
                {/* Simulated added lines with subtle green styling */}
                <div className="flex items-center px-4 gap-3 bg-emerald-500/10 py-1 border-l-4 border-emerald-500/50">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-56 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3 bg-emerald-500/10 py-1 border-l-4 border-emerald-500/50">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-68 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-36 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-64 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-48 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-52 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-72 h-3.5 rounded skeleton-item" />
                </div>
                <div className="flex items-center px-4 gap-3">
                  <div className="w-6 h-3 rounded skeleton-item shrink-0 text-right" />
                  <div className="w-40 h-3.5 rounded skeleton-item" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
