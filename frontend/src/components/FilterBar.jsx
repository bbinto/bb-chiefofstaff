function FilterBar({ agents, selectedAgent, onAgentChange, reportCount }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-indigo-100 p-4 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <label htmlFor="agent-filter" className="text-xs font-semibold text-indigo-700">
            Filter by Agent:
          </label>
          <select
            id="agent-filter"
            value={selectedAgent}
            onChange={(e) => onAgentChange(e.target.value)}
            className="px-3 py-1.5 border-2 border-indigo-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 font-medium transition-all duration-200 hover:border-indigo-300 text-sm"
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
        <div className="text-xs text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
          <span className="font-bold text-indigo-900">{reportCount}</span> report{reportCount !== 1 ? 's' : ''} found
        </div>
      </div>
    </div>
  )
}

export default FilterBar

