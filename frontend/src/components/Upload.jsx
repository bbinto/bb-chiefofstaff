import { useState, useEffect, useRef, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.md']
const MAX_FILE_SIZE_MB = 25

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function isValidWeek(value) {
  return /^week\d{1,3}$/i.test(value.trim())
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  if (['xlsx', 'xls'].includes(ext)) return '📊'
  if (ext === 'csv') return '📋'
  if (ext === 'pdf') return '📄'
  if (['png', 'jpg', 'jpeg'].includes(ext)) return '🖼️'
  return '📎'
}

export default function Upload({ password, onBack }) {
  const [existingWeeks, setExistingWeeks] = useState([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [customWeek, setCustomWeek] = useState('')
  const [weekFiles, setWeekFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadQueue, setUploadQueue] = useState([]) // {file, status, progress, error}
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // filename pending delete
  const fileInputRef = useRef(null)

  const headers = password ? { 'x-app-password': password } : {}

  // Determine the active week (dropdown selection or typed custom)
  const activeWeek = (customWeek.trim() !== '' ? customWeek.trim() : selectedWeek).toLowerCase()

  // ── Load existing weeks ────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/upload-weeks`, { headers })
      .then(r => r.json())
      .then(data => {
        setExistingWeeks(data.weeks || [])
        if (data.weeks && data.weeks.length > 0) {
          setSelectedWeek(data.weeks[0])
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load files for active week ─────────────────────────────────────────────
  const loadWeekFiles = useCallback(() => {
    if (!activeWeek || !isValidWeek(activeWeek)) {
      setWeekFiles([])
      return
    }
    setLoadingFiles(true)
    fetch(`${API_URL}/api/upload/${activeWeek}`, { headers })
      .then(r => r.json())
      .then(data => setWeekFiles(data.files || []))
      .catch(() => setWeekFiles([]))
      .finally(() => setLoadingFiles(false))
  }, [activeWeek]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadWeekFiles() }, [loadWeekFiles])

  // ── Validate files before queuing ─────────────────────────────────────────
  function validateFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `File type not allowed (${ext}). Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File too large (${formatBytes(file.size)}). Maximum: ${MAX_FILE_SIZE_MB} MB`
    }
    return null
  }

  function addToQueue(files) {
    const items = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: 'pending', // pending | uploading | done | error
      error: validateFile(file)
    }))
    // Mark pre-validated errors
    const ready = items.map(item => item.error ? { ...item, status: 'error' } : item)
    setUploadQueue(prev => [...prev, ...ready])
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  function handleDrop(e) {
    e.preventDefault()
    setDragActive(false)
    if (!isValidWeek(activeWeek)) return
    addToQueue(e.dataTransfer.files)
  }

  function handleDragOver(e) { e.preventDefault(); setDragActive(true) }
  function handleDragLeave(e) { e.preventDefault(); setDragActive(false) }

  function handleBrowse(e) {
    addToQueue(e.target.files)
    e.target.value = ''
  }

  // ── Upload queue ──────────────────────────────────────────────────────────
  async function runUpload() {
    if (!isValidWeek(activeWeek)) return
    const pending = uploadQueue.filter(i => i.status === 'pending')
    if (pending.length === 0) return

    setUploading(true)

    for (const item of pending) {
      // Mark as uploading
      setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i))

      try {
        const formData = new FormData()
        formData.append('files', item.file)

        const res = await fetch(`${API_URL}/api/upload/${activeWeek}`, {
          method: 'POST',
          headers, // no Content-Type — browser sets multipart boundary automatically
          body: formData
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')

        setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done' } : i))
      } catch (err) {
        setUploadQueue(prev => prev.map(i =>
          i.id === item.id ? { ...i, status: 'error', error: err.message } : i
        ))
      }
    }

    setUploading(false)
    // Refresh file list after all uploads
    loadWeekFiles()
    // Also refresh existing weeks list (new folder may have been created)
    fetch(`${API_URL}/api/upload-weeks`, { headers })
      .then(r => r.json())
      .then(data => setExistingWeeks(data.weeks || []))
      .catch(() => {})
  }

  function clearDone() {
    setUploadQueue(prev => prev.filter(i => i.status !== 'done'))
  }

  // ── Delete file ────────────────────────────────────────────────────────────
  async function deleteFile(filename) {
    try {
      const res = await fetch(`${API_URL}/api/upload/${activeWeek}/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      loadWeekFiles()
    } catch (err) {
      alert(`Failed to delete: ${err.message}`)
    } finally {
      setDeleteConfirm(null)
    }
  }

  const weekInvalid = customWeek.trim() !== '' && !isValidWeek(customWeek)
  const pendingCount = uploadQueue.filter(i => i.status === 'pending').length
  const doneCount = uploadQueue.filter(i => i.status === 'done').length

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Upload Manual Sources</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Allowed: {ALLOWED_EXTENSIONS.join(', ')} · Max {MAX_FILE_SIZE_MB} MB per file
          </p>
        </div>
      </div>

      {/* Week Selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Target Week Folder</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Existing week dropdown */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Select existing week</label>
            <select
              value={customWeek ? '' : selectedWeek}
              onChange={e => { setSelectedWeek(e.target.value); setCustomWeek('') }}
              disabled={customWeek.trim() !== ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-40 bg-white"
            >
              {existingWeeks.length === 0 && <option value="">No existing weeks</option>}
              {existingWeeks.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

          {/* New week input */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Or create new week folder
            </label>
            <input
              type="text"
              value={customWeek}
              onChange={e => setCustomWeek(e.target.value)}
              placeholder="e.g. week11"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                weekInvalid ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {weekInvalid && (
              <p className="text-xs text-red-600 mt-1">Use format: week1 – week999</p>
            )}
          </div>
        </div>

        {/* Active folder badge */}
        {activeWeek && isValidWeek(activeWeek) && (
          <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-sm text-teal-800">
            <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>Uploading to <strong>manual_sources/{activeWeek}/</strong></span>
          </div>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => isValidWeek(activeWeek) && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer select-none ${
          !isValidWeek(activeWeek)
            ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
            : dragActive
            ? 'border-teal-400 bg-teal-50 scale-[1.01]'
            : 'border-gray-300 bg-white hover:border-teal-400 hover:bg-teal-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleBrowse}
          className="hidden"
        />
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        {!isValidWeek(activeWeek) ? (
          <p className="text-sm text-gray-400">Select or create a week folder above first</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">Drop files here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">{ALLOWED_EXTENSIONS.join(' · ')} · max {MAX_FILE_SIZE_MB} MB</p>
          </>
        )}
      </div>

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">Upload Queue ({uploadQueue.length})</h3>
            <div className="flex gap-2">
              {doneCount > 0 && (
                <button onClick={clearDone} className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
                  Clear done
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  onClick={runUpload}
                  disabled={uploading || !isValidWeek(activeWeek)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#00203F] to-teal-600 text-white text-xs rounded-lg hover:from-teal-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload {pendingCount} file{pendingCount !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <ul className="divide-y divide-gray-50">
            {uploadQueue.map(item => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-lg flex-shrink-0">{getFileIcon(item.file.name)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.file.name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(item.file.size)}</p>
                  {item.status === 'error' && item.error && (
                    <p className="text-xs text-red-600 mt-0.5">{item.error}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {item.status === 'pending' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">Queued</span>
                  )}
                  {item.status === 'uploading' && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-teal-500 border-t-transparent" />
                  )}
                  {item.status === 'done' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Done
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      Error
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setUploadQueue(prev => prev.filter(i => i.id !== item.id))}
                  className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                  title="Remove from queue"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Existing Files in Selected Week */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">
            Files in {isValidWeek(activeWeek) ? `manual_sources/${activeWeek}/` : '…'}
          </h3>
          {loadingFiles && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-teal-500 border-t-transparent" />
          )}
        </div>

        {!isValidWeek(activeWeek) ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Select a week folder to see its files</p>
        ) : weekFiles.length === 0 && !loadingFiles ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">No files yet in this folder</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {weekFiles.map(file => (
              <li key={file.name} className="flex items-center gap-3 px-5 py-3">
                <span className="text-lg flex-shrink-0">{getFileIcon(file.name)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatBytes(file.size)}
                    {file.modified && ` · ${new Date(file.modified).toLocaleDateString()}`}
                  </p>
                </div>
                {deleteConfirm === file.name ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-600">Delete?</span>
                    <button
                      onClick={() => deleteFile(file.name)}
                      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(file.name)}
                    className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                    title="Delete file"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  )
}
