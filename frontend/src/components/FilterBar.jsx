function FilterBar({ agents, selectedAgent, onAgentChange, weeks, selectedWeek, onWeekChange, formatWeekDisplay, reportCount, totalCost, showFavoritesOnly, onFavoritesToggle }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-teal-100 p-4 mb-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <label htmlFor="agent-filter" className="text-xs font-semibold text-[#00203F] whitespace-nowrap">
              Filter by Agent:
            </label>
            <select
              id="agent-filter"
              value={selectedAgent}
              onChange={(e) => onAgentChange(e.target.value)}
              className="px-3 py-1.5 border-2 border-teal-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white text-gray-900 font-medium transition-all duration-200 hover:border-teal-300 text-sm"
            >
              <option value="all">All Agents</option>
              {agents.map(agent => (
                <option key={agent} value={agent}>
                  {agent.split('-').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label htmlFor="week-filter" className="text-xs font-semibold text-[#00203F] whitespace-nowrap">
              Filter by Week:
            </label>
            <select
              id="week-filter"
              value={selectedWeek}
              onChange={(e) => onWeekChange(e.target.value)}
              className="px-3 py-1.5 border-2 border-teal-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white text-gray-900 font-medium transition-all duration-200 hover:border-teal-300 text-sm"
            >
              <option value="all">All Weeks</option>
              {weeks.map(week => (
                <option key={week} value={week}>
                  {formatWeekDisplay(week)}
                </option>
              ))}
            </select>
          </div>
          {/* Favorites Toggle Button */}
          <button
            onClick={onFavoritesToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
              showFavoritesOnly
                ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-400 shadow-sm'
                : 'bg-gray-50 text-gray-600 border-2 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
            }`}
            title={showFavoritesOnly ? "Show all reports" : "Show only favorites"}
          >
            <svg
              className={`w-4 h-4 ${showFavoritesOnly ? 'fill-yellow-500' : 'fill-none'}`}
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
            {showFavoritesOnly ? 'Favorites Only' : 'All Reports'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-[#00203F] bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200">
            <span className="font-bold text-[#00203F]">{reportCount}</span> report{reportCount !== 1 ? 's' : ''} found
          </div>
          {totalCost > 0 && (
            <div className="text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
              Total: <span className="font-bold text-green-900">${totalCost.toFixed(4)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FilterBar

