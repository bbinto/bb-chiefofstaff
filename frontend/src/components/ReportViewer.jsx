import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownToSlack } from 'md-to-slack'
import { exportToPDF } from '../utils/pdfExport'

// Get API URL from environment variable, fallback to relative URL (uses proxy)
const API_URL = import.meta.env.VITE_API_URL || ''

// Mermaid Chart Component - renders mermaid code using parse/render API
function MermaidChart({ code, id }) {
  const containerRef = useRef(null)

  useEffect(() => {
    console.log('MermaidChart: useEffect triggered', { code: code?.substring(0, 50), id, hasContainer: !!containerRef.current })
    
    if (!code) {
      console.log('MermaidChart: No code provided')
      return
    }

    if (!containerRef.current) {
      console.warn('MermaidChart: Container not ready yet')
      return
    }

    const codeText = code.trim()
    if (!codeText) {
      console.log('MermaidChart: Code is empty after trim')
      return
    }

    const container = containerRef.current
    const mermaid = window.mermaid

    if (!mermaid) {
      console.warn('MermaidChart: Mermaid not available')
      return
    }

    // Clear container
    container.innerHTML = ''
    
    // Create a unique ID for this mermaid element
    const mermaidId = `mermaid-${id.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`

    console.log('MermaidChart: Starting render', {
      id: mermaidId,
      codeLength: codeText.length,
      codePreview: codeText.substring(0, 100)
    })

    // Use mermaid's parse and render API
    mermaid.parse(codeText).then((valid) => {
      console.log('MermaidChart: Parse result:', valid)
      
      if (!valid) {
        console.error('MermaidChart: Parse failed for code:', codeText)
        container.innerHTML = `<pre style="color: red; padding: 1rem;">Mermaid parse error. Code: ${codeText.substring(0, 200)}</pre>`
        return
      }

      // Render the diagram
      console.log('MermaidChart: Calling render with id:', mermaidId)
      mermaid.render(mermaidId, codeText).then((result) => {
        console.log('MermaidChart: Render result:', result)
        const { svg, bindFunctions } = result
        container.innerHTML = svg
        
        // Apply stroke-width and color styling to chart elements
        const svgElement = container.querySelector('svg')
        if (svgElement) {
          console.log('MermaidChart: SVG element found, applying styles')
          
          // Set stroke-width to 2px and black color for all line elements (axes)
          const lines = svgElement.querySelectorAll('line')
          console.log('MermaidChart: Found', lines.length, 'line elements')
          lines.forEach((line, index) => {
            line.setAttribute('stroke-width', '2')
            line.style.setProperty('stroke-width', '2px', 'important')
            line.setAttribute('stroke', 'black')
            line.style.setProperty('stroke', 'black', 'important')
            console.log(`Line ${index}:`, {
              stroke: line.getAttribute('stroke'),
              strokeWidth: line.getAttribute('stroke-width'),
              computedStroke: window.getComputedStyle(line).stroke
            })
          })
          
          // Set stroke-width to 4px and red color for all polyline elements (chart data lines)
          const polylines = svgElement.querySelectorAll('polyline')
          console.log('MermaidChart: Found', polylines.length, 'polyline elements')
          polylines.forEach((polyline, index) => {
            polyline.setAttribute('stroke-width', '4')
            polyline.style.setProperty('stroke-width', '4px', 'important')
            polyline.setAttribute('stroke', '#ff0000')
            polyline.style.setProperty('stroke', '#ff0000', 'important')
            console.log(`Polyline ${index}:`, {
              stroke: polyline.getAttribute('stroke'),
              strokeWidth: polyline.getAttribute('stroke-width'),
              computedStroke: window.getComputedStyle(polyline).stroke
            })
          })
          
          // Find path elements - these are usually the chart data lines
          const paths = svgElement.querySelectorAll('path')
          console.log('MermaidChart: Found', paths.length, 'path elements')
          paths.forEach((path, index) => {
            const stroke = path.getAttribute('stroke') || window.getComputedStyle(path).stroke
            const d = path.getAttribute('d') || ''
            const fill = path.getAttribute('fill')
            
            // Check if it's a data line (has curve/line commands, not axis-like, not a fill shape)
            const isDataLine = d.includes('M') && (d.includes('L') || d.includes('C') || d.includes('Q')) && !fill
            
            if (stroke && stroke !== 'none' && stroke !== 'transparent') {
              // Make data lines red with 4px width
              if (isDataLine) {
               
                path.setAttribute('stroke-width', '4')
                path.style.setProperty('stroke-width', '4px', 'important')
                path.setAttribute('stroke', 'red')
                path.style.setProperty('stroke', 'red', 'important')
                console.log(`Path ${index} (data line):`, {
                  d: d.substring(0, 50),
                  stroke: path.getAttribute('stroke'),
                  computedStroke: window.getComputedStyle(path).stroke
                })
              } else {
                console.log("-------------------------", isDataLine);
                // Keep axis paths black with 2px width
                path.setAttribute('stroke-width', '2')
                path.style.setProperty('stroke-width', '2px', 'important')
                path.setAttribute('stroke', 'black')
              
                console.log(`Path ${index} (axis):`, {
                  d: d.substring(0, 50),
                  stroke: path.getAttribute('stroke')
                })
              }
            }
          })
          
          // Also check all elements with stroke for debugging
          const allElements = svgElement.querySelectorAll('[stroke]')
          console.log('MermaidChart: All elements with stroke:', allElements.length)
          allElements.forEach((el, index) => {
            if (index < 10) { // Log first 10
              console.log(`Element ${index} (${el.tagName}):`, {
                stroke: el.getAttribute('stroke'),
                strokeWidth: el.getAttribute('stroke-width'),
                className: el.className?.baseVal || el.className,
                id: el.id
              })
            }
          })
        }
        
        // Bind any interactive functions if needed
        if (bindFunctions) {
          bindFunctions(container)
        }
        
        console.log('MermaidChart: Successfully rendered!', mermaidId)
      }).catch((err) => {
        console.error('MermaidChart: Render error:', err)
        console.error('MermaidChart: Error details:', {
          message: err.message,
          stack: err.stack,
          name: err.name
        })
        container.innerHTML = `<pre style="color: red; padding: 1rem;">Mermaid render error: ${err.message || 'Unknown error'}</pre>`
      })
    }).catch((err) => {
      console.error('MermaidChart: Parse error:', err)
      console.error('MermaidChart: Parse error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      })
      container.innerHTML = `<pre style="color: red; padding: 1rem;">Mermaid parse error: ${err.message || 'Unknown error'}</pre>`
    })

  }, [code, id])

  if (!code) return null

  return (
    <div 
      ref={containerRef}
      style={{
        margin: '1.5rem 0',
        padding: '1rem',
        backgroundColor: '#f9fafb',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
        overflowX: 'auto'
      }}
    />
  )
}

// Create a shared components configuration for ReactMarkdown
const createMarkdownComponents = (sectionIndex, h3Index, context = '') => ({
  code({ inline, className, children, node, ...props }) {
    // Log all code blocks to see what we're getting
    if (!inline) {
      console.log('Code component: Called', {
        inline,
        className,
        classNameType: typeof className,
        hasNode: !!node,
        nodeType: node?.type,
        nodeChildren: node?.children,
        childrenType: typeof children,
        childrenIsArray: Array.isArray(children),
        children: children
      })
    }
    
    // Check if this is a mermaid code block
    const classNameStr = typeof className === 'string' ? className : className?.[0] || ''
    const isMermaid = !inline && classNameStr && classNameStr.includes('mermaid')
    
    console.log('Code component: Mermaid check', {
      inline,
      classNameStr,
      isMermaid,
      className
    })
    
    if (isMermaid) {
      console.log('Code component: Detected mermaid block', { className, classNameStr, node, children })
      
      // Extract code text from node.children (ReactMarkdown v8+)
      let codeText = ''
      
      if (node?.children && Array.isArray(node.children)) {
        console.log('Code component: Extracting from node.children', node.children)
        codeText = node.children
          .map(child => {
            if (child.type === 'text' && child.value) {
              return child.value
            }
            if (typeof child === 'string') {
              return child
            }
            return ''
          })
          .join('')
      } else if (typeof children === 'string') {
        console.log('Code component: Using children as string')
        codeText = children
      } else if (children) {
        console.log('Code component: Extracting from children array/object', children)
        // Fallback for older ReactMarkdown versions
        if (Array.isArray(children)) {
          codeText = children
            .map(child => typeof child === 'string' ? child : typeof child === 'number' ? String(child) : '')
            .join('')
        } else {
          codeText = React.Children.toArray(children)
            .map(child => typeof child === 'string' ? child : typeof child === 'number' ? String(child) : '')
            .join('')
        }
      }
      
      console.log('Code component: Extracted codeText:', codeText.substring(0, 100))
      
      // For mermaid blocks, return the MermaidChart component directly
      // This bypasses the pre component entirely
      const uniqueId = `mermaid-${Date.now()}-${Math.random()}`
      console.log('Code component: Returning MermaidChart directly', { id: uniqueId, codeLength: codeText.trim().length })
      
      return (
        <MermaidChart 
          key={uniqueId}
          code={codeText.trim()}
          id={uniqueId}
        />
      )
    }
    
    return <code className={className} {...props}>{children}</code>
  },
  pre({ children, ...props }) {
    // Check if any child is already a MermaidChart (rendered directly from code component)
    const childrenArray = React.Children.toArray(children)
    const hasMermaidChart = childrenArray.some(child => 
      React.isValidElement(child) && 
      child.type === MermaidChart
    )
    
    // If we already have a MermaidChart, just return it wrapped
    if (hasMermaidChart) {
      return <>{children}</>
    }
    
    // Check if this is a raw HTML/JS code block (html, javascript, js, script)
    const codeElement = childrenArray.find(child => 
      React.isValidElement(child) && 
      child.type === 'code'
    )
    
    if (codeElement) {
      const classNameStr = typeof codeElement.props?.className === 'string' 
        ? codeElement.props.className 
        : codeElement.props?.className?.[0] || ''
      
      const rawLanguages = ['html', 'javascript', 'js', 'script', 'raw']
      const isRawHTML = classNameStr && rawLanguages.some(lang => 
        classNameStr.includes(`language-${lang}`) || classNameStr === lang
      )
      
      if (isRawHTML) {
        // Extract code text from the code element
        let codeText = ''
        const codeChildren = codeElement.props.children
        
        if (typeof codeChildren === 'string') {
          codeText = codeChildren
        } else if (Array.isArray(codeChildren)) {
          codeText = codeChildren
            .map(child => {
              if (typeof child === 'string') return child
              if (typeof child === 'number') return String(child)
              if (React.isValidElement(child)) {
                return React.Children.toArray(child.props?.children || child)
                  .map(c => typeof c === 'string' ? c : typeof c === 'number' ? String(c) : '')
                  .join('')
              }
              return ''
            })
            .join('')
        } else if (codeChildren) {
          codeText = React.Children.toArray(codeChildren)
            .map(child => {
              if (typeof child === 'string') return child
              if (typeof child === 'number') return String(child)
              if (React.isValidElement(child)) {
                return React.Children.toArray(child.props?.children || child)
                  .map(c => typeof c === 'string' ? c : typeof c === 'number' ? String(c) : '')
                  .join('')
              }
              return String(child || '')
            })
            .join('')
        }
        
        // Render as raw HTML
        return (
          <div 
            {...props}
            dangerouslySetInnerHTML={{ __html: codeText.trim() }}
          />
        )
      }
    }
    
    // Default pre rendering
    return <pre {...props}>{children}</pre>
  }
})

function ReportViewer({ report, onBack, password }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesEditing, setNotesEditing] = useState(false)
  const [notesSaving, setNotesSaving] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [utterance, setUtterance] = useState(null)

  // Parse markdown content into sections
  const parseContentSections = (markdown) => {
    const lines = markdown.split('\n')
    const sections = []
    let currentSection = null
    let currentH2Section = null

    lines.forEach((line, index) => {
      // Check for H2
      if (line.startsWith('## ')) {
        if (currentSection) {
          if (currentH2Section) {
            currentH2Section.sections.push(currentSection)
          }
          currentSection = null
        }
        if (currentH2Section) {
          sections.push(currentH2Section)
        }
        currentH2Section = {
          type: 'h2',
          title: line.substring(3).trim(),
          sections: []
        }
      }
      // Check for H3
      else if (line.startsWith('### ')) {
        if (currentSection) {
          if (currentH2Section) {
            currentH2Section.sections.push(currentSection)
          } else {
            sections.push(currentSection)
          }
        }
        currentSection = {
          type: 'h3',
          title: line.substring(4).trim(),
          content: []
        }
      }
      // Regular content
      else {
        if (currentSection) {
          currentSection.content.push(line)
        } else if (currentH2Section) {
          // Content directly under H2 (before any H3)
          if (!currentH2Section.intro) {
            currentH2Section.intro = []
          }
          currentH2Section.intro.push(line)
        } else {
          // Content before any headers
          sections.push({ type: 'content', content: [line] })
        }
      }
    })

    // Add remaining sections
    if (currentSection) {
      if (currentH2Section) {
        currentH2Section.sections.push(currentSection)
      } else {
        sections.push(currentSection)
      }
    }
    if (currentH2Section) {
      sections.push(currentH2Section)
    }

    return sections
  }

  useEffect(() => {
    fetchReportContent()
    loadNotes()
    
    // Check if mermaid is available
    const checkMermaid = setInterval(() => {
      if (window.mermaid) {
        console.log('ReportViewer: Mermaid is available!', window.mermaid)
        clearInterval(checkMermaid)
      } else {
        console.log('ReportViewer: Waiting for mermaid...')
      }
    }, 500)
    
    // Stop checking after 10 seconds
    setTimeout(() => {
      clearInterval(checkMermaid)
      if (!window.mermaid) {
        console.error('ReportViewer: Mermaid never loaded! Check index.html script tag.')
      }
    }, 10000)
    
    return () => {
      clearInterval(checkMermaid)
      // Stop speech synthesis on unmount
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [report])

  const loadNotes = () => {
    try {
      const savedNotes = localStorage.getItem(`report-notes-${report.filename}`)
      if (savedNotes) {
        setNotes(savedNotes)
      }
    } catch (err) {
      console.error('Error loading notes:', err)
    }
  }

  const handleSaveNotes = async () => {
    try {
      setNotesSaving(true)
      localStorage.setItem(`report-notes-${report.filename}`, notes)
      setNotesEditing(false)
    } catch (err) {
      console.error('Error saving notes:', err)
      alert('Failed to save notes. Please try again.')
    } finally {
      setNotesSaving(false)
    }
  }

  const handleCancelEdit = () => {
    loadNotes() // Reload original notes
    setNotesEditing(false)
  }

  const fetchReportContent = async () => {
    try {
      setLoading(true)
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch(`${API_URL}/api/reports/${report.filename}`, { headers })
      if (!response.ok) throw new Error('Failed to fetch report content')
      const data = await response.json()
      setContent(data.content)
      setError(null)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching report content:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatAgentName = (name) => {
    return name.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  const handleExportPDF = async () => {
    try {
      setExporting(true)
      await exportToPDF(
        report.filename,
        report.agentName,
        `${report.date} ${report.time}`
      )
    } catch (err) {
      console.error('Failed to export PDF:', err)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportSlack = () => {
    try {
      const slackFormatted = markdownToSlack(content)
      navigator.clipboard.writeText(slackFormatted)
      alert('Slack-formatted message copied to clipboard!')
    } catch (err) {
      console.error('Failed to export to Slack format:', err)
      alert('Failed to export to Slack format. Please try again.')
    }
  }

  // Extract plain text from markdown content for speech synthesis
  const extractPlainText = (markdown) => {
    // Remove markdown syntax while preserving text content
    let text = markdown
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code
      .replace(/`[^`]+`/g, '')
      // Remove headers but keep text
      .replace(/^#{1,6}\s+(.+)$/gm, '$1')
      // Remove links but keep text [text](url) -> text
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Remove images
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
      // Remove bold/italic but keep text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove horizontal rules
      .replace(/^---$/gm, '')
      .replace(/^\*\*\*$/gm, '')
      // Remove list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Clean up multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      // Trim lines
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('. ')
      .trim()
    
    return text
  }

  const handleSpeech = () => {
    if (!window.speechSynthesis) {
      alert('Speech synthesis is not supported in your browser.')
      return
    }

    if (isSpeaking) {
      // Stop speaking
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      setUtterance(null)
      return
    }

    // Extract plain text from markdown - use the content state, not report.content
    const plainText = extractPlainText(content || '')
    
    if (!plainText) {
      alert('No content available to read. The report content may still be loading.')
      return
    }

    // Create speech utterance
    const synth = window.speechSynthesis
    const speechUtterance = new SpeechSynthesisUtterance(plainText)
    
    // Get available voices and try to use a good default
    // Voices may not be loaded immediately, so check if available
    const voices = synth.getVoices()
    if (voices.length > 0) {
      // Try to find the default voice, or a good English voice
      const defaultVoice = voices.find(v => v.default && v.lang.startsWith('en')) ||
                          voices.find(v => v.default) ||
                          voices.find(v => v.lang.startsWith('en-US')) ||
                          voices.find(v => v.lang.startsWith('en')) ||
                          voices[0] // Fallback to first available voice
      
      if (defaultVoice) {
        speechUtterance.voice = defaultVoice
        console.log(`Using voice: ${defaultVoice.name} (${defaultVoice.lang}),`)
      }
    }
    
    // Set language (helps browser choose appropriate voice if not set above)
    speechUtterance.lang = 'en-US'
    
    // Configure speech options
    speechUtterance.rate = 1.2 // Normal speed
    console.log(`Setting rate to ${speechUtterance.rate}`)
    speechUtterance.pitch = 1.0 // Normal pitch
    speechUtterance.volume = 1.0 // Full volume

    // Set up event handlers
    speechUtterance.onstart = () => {
      setIsSpeaking(true)
    }

    speechUtterance.onend = () => {
      setIsSpeaking(false)
      setUtterance(null)
    }

    speechUtterance.onerror = (event) => {
      console.error('Speech synthesis error:', event)
      setIsSpeaking(false)
      setUtterance(null)
      alert('Error reading text. Please try again.')
    }

    // Start speaking
    synth.speak(speechUtterance)
    setUtterance(speechUtterance)
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete this report?\n\n${report.filename}\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    try {
      setDeleting(true)
      const headers = {
        'Content-Type': 'application/json',
      }
      if (password) {
        headers['x-app-password'] = password
      }
      const response = await fetch(`${API_URL}/api/reports/${encodeURIComponent(report.filename)}`, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        // Try to parse as JSON, but handle HTML responses
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to delete report')
        } else {
          const text = await response.text()
          console.error('Server returned non-JSON response:', text)
          throw new Error(`Failed to delete report: ${response.status} ${response.statusText}`)
        }
      }

      alert('Report deleted successfully!')
      onBack() // Navigate back to report list
    } catch (err) {
      console.error('Failed to delete report:', err)
      alert(`Failed to delete report: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-teal-100 p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-200 border-t-[#00203F] mx-auto"></div>
          <p className="mt-4 text-[#00203F] font-medium">Loading report...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-red-200 p-8">
        <div className="text-center">
          <div className="text-red-600 text-2xl mb-4">⚠️ Error</div>
          <p className="text-gray-700 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  const getAgentColor = (agentName) => {
    const colors = {
      'weekly-recap': 'from-cyan-500 to-teal-500',
      'business-health': 'from-emerald-500 to-teal-500',
      'product-engineering': 'from-[#00203F] to-teal-600',
      'okr-progress': 'from-teal-600 to-cyan-500',
      'telemetry-from-slack': 'from-purple-500 to-teal-500',
      'telemetry-deepdive': 'from-purple-500 to-teal-500',
      'mixpanel-query': 'from-purple-500 to-teal-500',
    }
    return colors[agentName] || 'from-[#00203F] to-teal-600'
  }

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-xl border-2 border-teal-100">
      {/* Header */}
      <div className="border-b-2 border-teal-100 bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              title="Back to Reports"
              className="flex items-center justify-center p-2 text-[#00203F] hover:text-[#001529] hover:bg-white rounded-lg transition-all duration-200 border border-teal-200 hover:border-teal-300 hover:shadow-sm"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              title={exporting ? 'Exporting...' : 'Export PDF'}
              className="flex items-center justify-center p-2 text-white bg-gradient-to-r from-[#00203F] to-[#003060] hover:from-[#001529] hover:to-[#002040] rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
            <button
              onClick={handleExportSlack}
              title="Copy for Slack"
              className="flex items-center justify-center p-2 text-white bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
            </button>
            <button
              onClick={handleSpeech}
              disabled={typeof window === 'undefined' || !window.speechSynthesis}
              title={isSpeaking ? 'Stop Reading' : 'Read Aloud'}
              className={`flex items-center justify-center p-2 text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                isSpeaking 
                  ? 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
              }`}
            >
              {isSpeaking ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              title={deleting ? 'Deleting...' : 'Delete Report'}
              className="flex items-center justify-center p-2 text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[0.625rem] font-bold bg-gradient-to-r ${getAgentColor(report.agentName)} text-white shadow-sm`}>
              {formatAgentName(report.agentName)}
            </span>
            <span className="text-xs text-[#00203F] font-medium">
              {report.date} at {report.time}
              {report.executionTime && (
                <span className="ml-2 text-teal-700 font-semibold">
                  (ran in {report.executionTime} min)
                </span>
              )}
            </span>
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mt-3 bg-gradient-to-r from-[#00203F] via-teal-600 to-[#ADEFD1] bg-clip-text text-transparent">
          Filename: {report.filename}
        </h2>
      </div>

      {/* Report Notes Section */}
      <div className="border-b-2 border-teal-100 bg-gradient-to-r from-amber-50 to-yellow-50 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Report Evaluation Notes
          </h3>
          {!notesEditing ? (
            <button
              onClick={() => setNotesEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-amber-700 hover:text-amber-900 hover:bg-white rounded-lg transition-all duration-200 font-medium border border-amber-200 hover:border-amber-300 hover:shadow-sm text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              {notes ? 'Edit Notes' : 'Add Notes'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelEdit}
                disabled={notesSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 hover:text-gray-900 hover:bg-white rounded-lg transition-all duration-200 font-medium border border-gray-300 hover:border-gray-400 hover:shadow-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={notesSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 rounded-lg transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {notesSaving ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          )}
        </div>
        {notesEditing ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add your evaluation notes here: findings on the report quality, suggestions for prompt improvements, specific issues to address..."
            className="w-full px-3 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm text-gray-900 bg-white placeholder-gray-400 min-h-[100px] font-mono"
          />
        ) : notes ? (
          <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-white/50 px-3 py-2 rounded border border-amber-200">
            {notes}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">
            No notes yet. Click "Add Notes" to add evaluation feedback for this report.
          </p>
        )}
      </div>

      {/* Content */}
      <div id="report-content" className="px-6 py-6 bg-gradient-to-br from-white to-teal-50/30">
        {(() => {
          const sections = parseContentSections(content)
          const elements = []
          let standaloneH3s = []

          
          sections.forEach((section, sectionIndex) => {
            if (section.type === 'h2') {
              // Flush any accumulated standalone H3s
              if (standaloneH3s.length > 0) {
                elements.push(
                  <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                    {standaloneH3s}
                  </div>
                )
                standaloneH3s = []
              }

              // Add H2 section
              elements.push(
                <div key={sectionIndex} className="report-h2-section">
                  <h2>{section.title}</h2>
                  {section.intro && section.intro.length > 0 && (
                    <div className="prose prose-sm max-w-none mb-4">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={createMarkdownComponents(sectionIndex, 'intro', 'intro')}
                      >
                        {section.intro.join('\n')}
                      </ReactMarkdown>
                    </div>
                  )}
                  <div className="report-content-grid">
                    {section.sections.map((h3Section, h3Index) => {
                      const isExecutiveSummary = h3Section.title.match(/One-Line Executive Summary/i)
                      const isFullWidth = h3Section.title.match(/Actionable Recommendations|Actions/i)

                      if (isExecutiveSummary) {
                        return (
                          <div key={h3Index} className="executive-summary-box">
                            <h3>{h3Section.title}</h3>
                            <div className="executive-summary-content">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={createMarkdownComponents(sectionIndex, h3Index, 'exec')}
                              >
                                {h3Section.content.join('\n')}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )
                      }

                      if (isFullWidth) {
                        return (
                          <div key={h3Index} className="h3-section-box full-width-section">
                            <h3>{h3Section.title}</h3>
                            <div className="h3-section-content prose prose-sm max-w-none">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={createMarkdownComponents(sectionIndex, h3Index)}
                              >
                                {h3Section.content.join('\n')}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={h3Index} className="h3-section-box">
                          <h3>{h3Section.title}</h3>
                          <div className="h3-section-content prose prose-sm max-w-none">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={createMarkdownComponents(sectionIndex, h3Index)}
                            >
                              {h3Section.content.join('\n')}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            } else if (section.type === 'h3') {
              // Check if this is the Executive Summary section or full-width section
              const isExecutiveSummary = section.title.match(/One-Line Executive Summary/i)
              const isFullWidth = section.title.match(/Actionable Recommendations|Actions/i)

              if (isExecutiveSummary) {
                // Flush any accumulated standalone H3s first
                if (standaloneH3s.length > 0) {
                  elements.push(
                    <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                      {standaloneH3s}
                    </div>
                  )
                  standaloneH3s = []
                }

                // Render Executive Summary with special styling (full width)
                elements.push(
                  <div key={sectionIndex} className="executive-summary-box">
                    <h3>{section.title}</h3>
                    <div className="executive-summary-content">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={createMarkdownComponents(sectionIndex, 'standalone', 'exec')}
                      >
                        {section.content.join('\n')}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              } else if (isFullWidth) {
                // Flush any accumulated standalone H3s first
                if (standaloneH3s.length > 0) {
                  elements.push(
                    <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                      {standaloneH3s}
                    </div>
                  )
                  standaloneH3s = []
                }

                // Render full-width section
                elements.push(
                  <div key={sectionIndex} className="h3-section-box full-width-section">
                    <h3>{section.title}</h3>
                    <div className="h3-section-content prose prose-sm max-w-none">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={createMarkdownComponents(sectionIndex, 'fullwidth')}
                      >
                        {section.content.join('\n')}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              } else {
                // Accumulate regular standalone H3s
                standaloneH3s.push(
                  <div key={sectionIndex} className="h3-section-box">
                    <h3>{section.title}</h3>
                    <div className="h3-section-content prose prose-sm max-w-none">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={createMarkdownComponents(sectionIndex, 'standalone')}
                      >
                        {section.content.join('\n')}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              }
            } else {
              // Flush any accumulated standalone H3s
              if (standaloneH3s.length > 0) {
                elements.push(
                  <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                    {standaloneH3s}
                  </div>
                )
                standaloneH3s = []
              }

              // Add regular content
              elements.push(
                <div key={sectionIndex} className="prose prose-sm max-w-none mb-4">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={createMarkdownComponents(sectionIndex, 'content', 'content')}
                  >
                    {section.content.join('\n')}
                  </ReactMarkdown>
                </div>
              )
            }
          })

          // Flush any remaining standalone H3s
          if (standaloneH3s.length > 0) {
            elements.push(
              <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                {standaloneH3s}
              </div>
            )
          }

          return elements
        })()}
      </div>
    </div>
  )
}

export default ReportViewer

