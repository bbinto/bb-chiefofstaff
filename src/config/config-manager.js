/**
 * Configuration Manager
 * Handles loading and validation of application configuration
 */

import fs from 'fs';
import path from 'path';
import { PATHS } from '../utils/constants.js';

/**
 * Configuration Manager Class
 */
export class ConfigManager {
  constructor() {
    this.config = null;
  }

  /**
   * Load configuration from config.json
   * @returns {object} Configuration object
   * @throws {Error} If config file not found or invalid
   */
  loadConfig() {
    const configPath = path.join(process.cwd(), PATHS.CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
      throw new Error(
        `Error: ${PATHS.CONFIG_FILE} not found!\nPlease copy ${PATHS.CONFIG_EXAMPLE} to ${PATHS.CONFIG_FILE} and configure it.`
      );
    }

    try {
      this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('Configuration loaded successfully');
      return this.config;
    } catch (error) {
      throw new Error(`Error loading ${PATHS.CONFIG_FILE}: ${error.message}`);
    }
  }

  /**
   * Get configuration value
   * @returns {object|null} Current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Get default days setting from config
   * @returns {number} Default days to look back
   */
  getDefaultDays() {
    return this.config?.settings?.defaultDays || 7;
  }
}

/**
 * Validate environment variables
 * @throws {Error} If required environment variables are missing
 */
export function validateEnvironment() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'Error: ANTHROPIC_API_KEY not found in environment!\nPlease create a .env file with your Anthropic API key.'
    );
  }
  console.log('Environment validated');
}
