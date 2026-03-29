function FilterBar({ agents, selectedAgent, onAgentChange, weeks, selectedWeek, onWeekChange, formatWeekDisplay, llmModels, selectedLlm, onLlmChange, reportCount, totalCost, showFavoritesOnly, onFavoritesToggle }) {
  const llmIcon = (llm) => {
    if (!llm) return ''
    if (llm.startsWith('Gemini')) return '💎 '
    if (llm.startsWith('Ollama')) return '🦙 '
    return '🔑 '
  }
  const selectCls = "px-2 py-1.5 border-2 border-teal-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white text-gray-900 font-medium transition-all duration-200 hover:border-teal-300 text-xs max-w-[160px]"
  const labelCls = "text-xs font-semibold text-[#00203F] whitespace-nowrap"

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-teal-100 p-3 mb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">

        <div className="flex items-center gap-2">
          <label htmlFor="agent-filter" className={labelCls}>Agent:</label>
          <select id="agent-filter" value={selectedAgent} onChange={(e) => onAgentChange(e.target.value)} className={selectCls}>
            <option value="all">All Agents</option>
            {agents.map(agent => (
              <option key={agent} value={agent}>
                {agent.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="week-filter" className={labelCls}>Week:</label>
          <select id="week-filter" value={selectedWeek} onChange={(e) => onWeekChange(e.target.value)} className={selectCls}>
            <option value="all">All Weeks</option>
            {weeks.map(week => (
              <option key={week} value={week}>{formatWeekDisplay(week)}</option>
            ))}
          </select>
        </div>

        {llmModels && llmModels.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="llm-filter" className={labelCls}>LLM:</label>
            <select id="llm-filter" value={selectedLlm} onChange={(e) => onLlmChange(e.target.value)} className={selectCls}>
              <option value="all">All LLMs</option>
              {llmModels.map(llm => (
                <option key={llm} value={llm}>{llmIcon(llm)}{llm}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={onFavoritesToggle}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
            showFavoritesOnly
              ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-400 shadow-sm'
              : 'bg-gray-50 text-gray-600 border-2 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
          }`}
          title={showFavoritesOnly ? "Show all reports" : "Show only favorites"}
        >
          <svg className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-yellow-500' : 'fill-none'}`} stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
          {showFavoritesOnly ? 'Favorites' : 'Favorites'}
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <div className="text-xs text-[#00203F] bg-teal-50 px-2.5 py-1.5 rounded-lg border border-teal-200">
            <span className="font-bold">{reportCount}</span> report{reportCount !== 1 ? 's' : ''}
          </div>
          {totalCost > 0 && (
            <div className="text-xs text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg border border-green-200">
              <span className="font-bold text-green-900">${totalCost.toFixed(4)}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default FilterBar

