/**
 * Tool Handler
 * Handles custom filesystem tool calls for reading manual_sources
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import pdfParse from 'pdf-parse';
import { PATHS, FRONTEND } from '../utils/constants.js';

/**
 * Tool Handler Class
 * Manages custom filesystem tools
 */
export class ToolHandler {
  constructor(agentParams = {}) {
    this.agentParams = agentParams;
  }

  /**
   * Build tools schema for custom filesystem tools
   * @returns {Array} Array of tool schemas
   */
  buildCustomToolsSchema() {
    return [
      {
        name: 'read_file_from_manual_sources',
        description:
          'Read a file from the manual_sources folder (including subdirectories like Q4/). Excel files (.xlsx, .xls) will be parsed and all sheet data will be returned as JSON. CSV and text files will return their content. PDF files will be parsed and their text content extracted. Use this to access ARR data, Goodvibes exports, Mixpanel PDFs, and other files in the manual_sources directory. If a folder parameter is specified for the business-health agent, files will be read from that subfolder.',
        input_schema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description:
                'The name of the file to read from the manual_sources folder. Can include subdirectories, e.g., "Q4/Good-Vibes-2025-12-29T14-11-50.csv" or "Q4/ARR Waterfall.xlsx" or "Dec 22-ARR Waterfall OV.xlsx". If a folder parameter is specified, use filenames relative to that folder (e.g., "ARR OV.xlsx" if folder is "Week 1").'
            }
          },
          required: ['filename']
        }
      },
      {
        name: 'list_manual_sources_files',
        description:
          'List all files available in the manual_sources folder and its subdirectories (recursively). Use this to see what ARR data files, Goodvibes exports, Mixpanel PDFs, and other files are available. Returns files with their paths relative to manual_sources. If a folder parameter is specified for the business-health agent, only files from that subfolder will be listed.',
        input_schema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];
  }

  /**
   * Handle custom filesystem tool calls
   * @param {string} toolName - Name of the tool
   * @param {object} args - Tool arguments
   * @returns {Promise<object>} Tool result
   */
  async handleCustomTool(toolName, args) {
    if (toolName === 'read_file_from_manual_sources') {
      return await this.readFileFromManualSources(args);
    }

    if (toolName === 'list_manual_sources_files') {
      return this.listManualSourcesFiles();
    }

    throw new Error(`Unknown custom tool: ${toolName}`);
  }

  /**
   * Read a file from manual_sources folder
   * @param {object} args - Tool arguments with filename
   * @returns {Promise<object>} File content or error
   */
  async readFileFromManualSources(args) {
    const manualSourcesPath = path.resolve(process.cwd(), PATHS.MANUAL_SOURCES_DIR);

    // If a folder parameter is provided for business-health agent, use it as base path
    let basePath = manualSourcesPath;
    if (this.agentParams.manualSourcesFolder) {
      basePath = path.resolve(manualSourcesPath, this.agentParams.manualSourcesFolder);
    }

    const filePath = path.resolve(basePath, args.filename);

    // Security: ensure the file is within manual_sources directory
    const resolvedManualSources = path.resolve(manualSourcesPath);
    if (
      !filePath.startsWith(resolvedManualSources + path.sep) &&
      filePath !== resolvedManualSources
    ) {
      throw new Error('Invalid file path: file must be in manual_sources folder');
    }

    if (!fs.existsSync(filePath)) {
      // Try to provide helpful error message with available files
      const availableFiles = this.listAllFilesRecursive(manualSourcesPath);
      return {
        error: `File not found: ${args.filename}`,
        availableFiles: availableFiles.slice(0, FRONTEND.MAX_FILES_IN_ERROR).join(', '),
        totalFiles: availableFiles.length,
        hint: 'Use list_manual_sources_files to see all available files including those in subdirectories like Q4/'
      };
    }

    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Handle different file types
    if (ext === '.xlsx' || ext === '.xls') {
      return this.readExcelFile(filePath, args.filename, stats);
    } else if (ext === '.csv') {
      return this.readCsvFile(filePath, args.filename, stats);
    } else if (ext === '.pdf') {
      return await this.readPdfFile(filePath, args.filename, stats);
    } else {
      return this.readTextFile(filePath, args.filename, stats);
    }
  }

  /**
   * Read Excel file
   */
  readExcelFile(filePath, filename, stats) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;

      const sheetsData = {};
      sheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          defval: '',
          raw: false
        });
        sheetsData[sheetName] = jsonData;
      });

      return {
        file: filename,
        type: 'Excel file',
        modified: stats.mtime.toISOString(),
        sheetNames: sheetNames,
        data: sheetsData,
        summary: `Excel file with ${sheetNames.length} sheet(s): ${sheetNames.join(', ')}. Data parsed successfully.`
      };
    } catch (error) {
      return {
        file: filename,
        type: 'Excel file',
        error: `Error parsing Excel file: ${error.message}`,
        modified: stats.mtime.toISOString()
      };
    }
  }

  /**
   * Read CSV file
   */
  readCsvFile(filePath, filename, stats) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        file: filename,
        type: 'CSV file',
        modified: stats.mtime.toISOString(),
        content: content,
        size: stats.size,
        lines: content.split('\n').length
      };
    } catch (error) {
      return {
        error: `Error reading CSV file: ${error.message}`,
        file: filename
      };
    }
  }

  /**
   * Read PDF file
   */
  async readPdfFile(filePath, filename, stats) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);

      return {
        file: filename,
        type: 'PDF file',
        modified: stats.mtime.toISOString(),
        size: stats.size,
        pages: pdfData.numpages,
        text: pdfData.text,
        info: pdfData.info || {},
        metadata: pdfData.metadata || {},
        summary: `PDF file parsed successfully. ${pdfData.numpages} page(s). ${pdfData.text.length} characters of text extracted.`
      };
    } catch (error) {
      return {
        file: filename,
        type: 'PDF file',
        error: `Error parsing PDF file: ${error.message}`,
        modified: stats.mtime.toISOString(),
        size: stats.size
      };
    }
  }

  /**
   * Read text file
   */
  readTextFile(filePath, filename, stats) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        file: filename,
        type: 'Text file',
        modified: stats.mtime.toISOString(),
        content: content
      };
    } catch (error) {
      return {
        error: `Error reading file: ${error.message}`,
        file: filename
      };
    }
  }

  /**
   * List manual sources files
   * @returns {object} List of files and directories
   */
  listManualSourcesFiles() {
    const manualSourcesPath = path.resolve(process.cwd(), PATHS.MANUAL_SOURCES_DIR);

    if (!fs.existsSync(manualSourcesPath)) {
      return {
        error: 'manual_sources folder does not exist',
        path: manualSourcesPath
      };
    }

    // If a folder parameter is provided, list only that folder
    let searchPath = manualSourcesPath;
    if (this.agentParams.manualSourcesFolder) {
      searchPath = path.resolve(manualSourcesPath, this.agentParams.manualSourcesFolder);
      if (!fs.existsSync(searchPath)) {
        return {
          error: `Specified folder "${this.agentParams.manualSourcesFolder}" does not exist in manual_sources`,
          path: searchPath,
          availableFolders: this.listAllDirectoriesRecursive(manualSourcesPath).map(d => d)
        };
      }
    }

    const allFiles = this.listAllFilesRecursive(searchPath, '');
    const fileDetails = allFiles.map(relativePath => {
      const filePath = path.join(searchPath, relativePath);
      const stats = fs.statSync(filePath);
      return {
        name: relativePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        type: path.extname(relativePath) || 'unknown',
        isDirectory: false
      };
    });

    const directories = this.listAllDirectoriesRecursive(searchPath, '');
    const dirDetails = directories.map(relativePath => ({
      name: relativePath + '/',
      isDirectory: true
    }));

    return {
      folder: this.agentParams.manualSourcesFolder
        ? `manual_sources/${this.agentParams.manualSourcesFolder}`
        : 'manual_sources',
      directories: dirDetails,
      files: fileDetails,
      totalFiles: fileDetails.length,
      totalDirectories: dirDetails.length
    };
  }

  /**
   * Recursively list all files in a directory
   * @param {string} dirPath - Directory path
   * @param {string} basePath - Base path for relative paths
   * @returns {string[]} Array of file paths
   */
  listAllFilesRecursive(dirPath, basePath = '') {
    const files = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        files.push(...this.listAllFilesRecursive(fullPath, relativePath));
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }

  /**
   * Recursively list all directories in a directory
   * @param {string} dirPath - Directory path
   * @param {string} basePath - Base path for relative paths
   * @returns {string[]} Array of directory paths
   */
  listAllDirectoriesRecursive(dirPath, basePath = '') {
    const directories = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
        directories.push(relativePath);
        const fullPath = path.join(dirPath, entry.name);
        directories.push(...this.listAllDirectoriesRecursive(fullPath, relativePath));
      }
    }

    return directories;
  }
}
