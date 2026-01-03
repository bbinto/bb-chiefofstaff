import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Path to reports folder (one level up from frontend)
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Extract first couple of insights from report content
function extractInsights(content) {
  if (!content) return [];
  
  const insights = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length && insights.length < 2; i++) {
    const line = lines[i].trim();
    
    // Skip headers and metadata
    if (line.startsWith('#') || line.startsWith('**Generated') || line.startsWith('---') || line.length === 0) {
      continue;
    }
    
    // Look for bullet points or numbered lists
    if (line.match(/^[-*•]\s+|^\d+\.\s+/)) {
      const insight = line.replace(/^[-*•]\s+|^\d+\.\s+/, '').trim();
      if (insight.length > 20 && insight.length < 200) {
        insights.push(insight);
      }
    }
    
    // Look for key-value pairs or status indicators
    if (line.match(/status:|flag:|⚠️|✅|🟡|🔴/) && insights.length < 2) {
      const insight = line.replace(/status:|flag:/i, '').trim();
      if (insight.length > 10 && insight.length < 200) {
        insights.push(insight);
      }
    }
    
    // Look for sentences that seem like insights (contain key words)
    if (insights.length < 2 && line.length > 30 && line.length < 300) {
      if (line.match(/\b(total|found|identified|shows|indicates|recommend|critical|important|concern|risk|issue)\b/i)) {
        // Make sure it's not a header or metadata
        if (!line.match(/^#{1,6}\s/) && !line.match(/^\[/) && !line.match(/^`/)) {
          insights.push(line);
        }
      }
    }
  }
  
  // If we didn't find enough insights, get first meaningful sentences
  if (insights.length < 2) {
    for (let i = 0; i < lines.length && insights.length < 2; i++) {
      const line = lines[i].trim();
      if (line.length > 40 && line.length < 250 && 
          !line.startsWith('#') && 
          !line.startsWith('**Generated') && 
          !line.startsWith('---') &&
          !line.match(/^\[/) &&
          !line.match(/^`/)) {
        insights.push(line);
      }
    }
  }
  
  return insights.slice(0, 2);
}

// Get all reports
app.get('/api/reports', (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.status(404).json({ error: 'Reports directory not found' });
    }

    const files = fs.readdirSync(REPORTS_DIR);
    const reports = files
      .filter(file => file.endsWith('.md'))
      .map(file => {
        const filePath = path.join(REPORTS_DIR, file);
        const stats = fs.statSync(filePath);
        
        // Extract agent name from filename
        // Format: agent-name-YYYY-MM-DD-HH-MM-SS.md or weekly-report-YYYY-MM-DD-HH-MM-SS.md
        const match = file.match(/^(.+?)-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.md$/);
        let agentName = 'unknown';
        let timestamp = stats.mtime;
        
        if (match) {
          agentName = match[1];
          const dateParts = match[2].split('-');
          timestamp = new Date(
            parseInt(dateParts[0]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[2]),
            parseInt(dateParts[3]),
            parseInt(dateParts[4]),
            parseInt(dateParts[5])
          );
        } else {
          // Handle files that don't match the pattern (e.g., "# Weekly Recap Agent")
          // Use the filename without extension as agent name
          agentName = file.replace('.md', '').toLowerCase().replace(/\s+/g, '-');
        }
        
        // Read file content to extract insights
        let insights = [];
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          insights = extractInsights(content);
        } catch (err) {
          console.error(`Error reading ${file} for insights:`, err.message);
        }
        
        return {
          id: file,
          filename: file,
          agentName,
          timestamp: timestamp.toISOString(),
          date: timestamp.toLocaleDateString(),
          time: timestamp.toLocaleTimeString(),
          size: stats.size,
          insights
        };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(reports);
  } catch (error) {
    console.error('Error reading reports:', error);
    res.status(500).json({ error: 'Failed to read reports', details: error.message });
  }
});

// Get a specific report content
app.get('/api/reports/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(REPORTS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content });
  } catch (error) {
    console.error('Error reading report:', error);
    res.status(500).json({ error: 'Failed to read report' });
  }
});

// Get unique agent names
app.get('/api/agents', (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.status(404).json({ error: 'Reports directory not found' });
    }

    const files = fs.readdirSync(REPORTS_DIR);
    const agents = new Set();
    
    files
      .filter(file => file.endsWith('.md'))
      .forEach(file => {
        const match = file.match(/^(.+?)-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.md$/);
        if (match) {
          agents.add(match[1]);
        } else {
          // Handle files that don't match the pattern
          const agentName = file.replace('.md', '').toLowerCase().replace(/\s+/g, '-');
          agents.add(agentName);
        }
      });
    
    res.json(Array.from(agents).sort());
  } catch (error) {
    console.error('Error reading agents:', error);
    res.status(500).json({ error: 'Failed to read agents', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

