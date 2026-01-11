/**
 * Date Utility Functions
 * Centralized date parsing, validation, and formatting utilities
 */

import { DATE_CONFIG } from './constants.js';

/**
 * Validates a date string is in YYYY-MM-DD format
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid format
 */
export function isValidDateFormat(dateStr) {
  return DATE_CONFIG.DATE_FORMAT_REGEX.test(dateStr);
}

/**
 * Validates a date string is a valid date
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {boolean} True if valid date
 */
export function isValidDate(dateStr) {
  if (!isValidDateFormat(dateStr)) {
    return false;
  }
  const dateObj = new Date(dateStr + 'T00:00:00');
  return !isNaN(dateObj.getTime());
}

/**
 * Validates a date range (start date before or equal to end date)
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {boolean} True if valid range
 */
export function isValidDateRange(startDate, endDate) {
  const startDateObj = new Date(startDate + 'T00:00:00');
  const endDateObj = new Date(endDate + 'T00:00:00');
  return startDateObj <= endDateObj;
}

/**
 * Converts a Date object to YYYY-MM-DD format
 * @param {Date} date - Date object to format
 * @returns {string} Date in YYYY-MM-DD format
 */
export function formatDateISO(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Gets a date N days ago from a reference date
 * @param {Date} referenceDate - Reference date
 * @param {number} daysAgo - Number of days to go back
 * @returns {Date} Date N days ago
 */
export function getDaysAgo(referenceDate, daysAgo) {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

/**
 * Gets today's date in YYYY-MM-DD format
 * @returns {string} Today's date
 */
export function getTodayISO() {
  return formatDateISO(new Date());
}

/**
 * Parse date range from command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {{startDate: string|null, endDate: string|null}|null} Parsed date range or null
 * @throws {Error} If date format or range is invalid
 */
export function parseDateRangeFromArgs(args) {
  let startDate = null;
  let endDate = null;

  const startDateIndex = args.indexOf('--start-date');
  const endDateIndex = args.indexOf('--end-date');

  if (startDateIndex !== -1 && args[startDateIndex + 1]) {
    startDate = args[startDateIndex + 1];

    if (!isValidDateFormat(startDate)) {
      throw new Error('--start-date must be in YYYY-MM-DD format (e.g., 2025-12-20)');
    }

    if (!isValidDate(startDate)) {
      throw new Error('--start-date must be a valid date');
    }
  }

  if (endDateIndex !== -1 && args[endDateIndex + 1]) {
    endDate = args[endDateIndex + 1];

    if (!isValidDateFormat(endDate)) {
      throw new Error('--end-date must be in YYYY-MM-DD format (e.g., 2025-12-27)');
    }

    if (!isValidDate(endDate)) {
      throw new Error('--end-date must be a valid date');
    }
  }

  // Validate that start date is before end date if both are provided
  if (startDate && endDate && !isValidDateRange(startDate, endDate)) {
    throw new Error('--start-date must be before or equal to --end-date');
  }

  if (startDate || endDate) {
    return { startDate, endDate };
  }

  return null;
}

/**
 * Calculate date range with defaults
 * @param {{startDate: string|null, endDate: string|null}|null} dateRange - User-provided date range
 * @param {number} defaultDaysBack - Default number of days to look back
 * @returns {{startDate: string, endDate: string, threeDaysAgo: string}} Calculated date range
 */
export function calculateDateRange(dateRange, defaultDaysBack = DATE_CONFIG.DEFAULT_DAYS_BACK) {
  const today = new Date();
  const todayISO = formatDateISO(today);

  let endDate = todayISO;
  let startDate = null;

  if (dateRange) {
    endDate = dateRange.endDate || todayISO;

    if (dateRange.startDate) {
      startDate = dateRange.startDate;
    } else {
      // Default start date to configured days before end date
      const endDateObj = new Date(endDate + 'T00:00:00');
      const defaultStartDate = getDaysAgo(endDateObj, defaultDaysBack);
      startDate = formatDateISO(defaultStartDate);
    }
  } else {
    // Default behavior: calculate configured days ago
    const defaultStartDate = getDaysAgo(today, defaultDaysBack);
    startDate = formatDateISO(defaultStartDate);
  }

  // Calculate 3 days ago from end date
  const endDateObj = new Date(endDate + 'T00:00:00');
  const threeDaysAgoDate = getDaysAgo(endDateObj, 3);
  const threeDaysAgo = formatDateISO(threeDaysAgoDate);

  return {
    startDate,
    endDate,
    threeDaysAgo
  };
}

/**
 * Format a date range for display
 * @param {string} startDate - Start date in YYYY-MM-DD
 * @param {string} endDate - End date in YYYY-MM-DD
 * @param {string} [threeDaysAgo] - Optional 3 days ago date
 * @returns {string} Formatted date range string
 */
export function formatDateRangeDisplay(startDate, endDate, threeDaysAgo = null) {
  let display = `Start: ${startDate} | End: ${endDate}`;
  if (threeDaysAgo) {
    display += ` | 3d ago from end: ${threeDaysAgo}`;
  }
  return display;
}

/**
 * Format a Date object to local YYYY-MM-DD string
 * @param {Date} date - Date object to format
 * @returns {string} Date in YYYY-MM-DD format in local timezone
 */
export function formatDateLocalISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date object to local HH-MM-SS string
 * @param {Date} date - Date object to format
 * @returns {string} Time in HH-MM-SS format in local timezone
 */
export function formatTimeLocal(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}-${minutes}-${seconds}`;
}

/**
 * Get the ISO week number for a date (1-53)
 * @param {Date} date - Date object
 * @returns {number} ISO week number
 */
export function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get the date of Monday of the ISO week containing a date
 * @param {Date} date - Date object
 * @returns {Date} Monday of the ISO week
 */
export function getMondayOfISOWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Parse calendar week parameter (e.g., "week 1", "Week 2", "week 1 2025")
 * @param {string} weekStr - Week string (e.g., "week 1", "Week 2", "week 1 2025")
 * @returns {{week: number, year: number}|null} Parsed week and year, or null if invalid
 */
export function parseCalendarWeek(weekStr) {
  if (!weekStr) return null;

  // Normalize the string
  const normalized = weekStr.trim().toLowerCase();

  // Match patterns like "week 1", "week 2", "week 1 2025", "Week 2 2024"
  const match = normalized.match(/week\s+(\d+)(?:\s+(\d{4}))?/);
  if (!match) {
    return null;
  }

  const week = parseInt(match[1], 10);
  const year = match[2] ? parseInt(match[2], 10) : new Date().getFullYear();

  // Validate week number (1-53)
  if (week < 1 || week > 53) {
    return null;
  }

  return { week, year };
}

/**
 * Get date range (Monday to Sunday) for a calendar week
 * @param {number} week - Week number (1-53)
 * @param {number} year - Year (e.g., 2025)
 * @returns {{startDate: string, endDate: string}} Date range in YYYY-MM-DD format
 */
export function getCalendarWeekDateRange(week, year) {
  // January 4th is always in week 1 of its year (ISO standard)
  const jan4 = new Date(year, 0, 4);
  const jan4Monday = getMondayOfISOWeek(jan4);

  // Calculate Monday of the target week
  const targetMonday = new Date(jan4Monday);
  targetMonday.setDate(jan4Monday.getDate() + (week - 1) * 7);

  // Calculate Sunday of the target week (Monday + 6 days)
  const targetSunday = new Date(targetMonday);
  targetSunday.setDate(targetMonday.getDate() + 6);

  return {
    startDate: formatDateISO(targetMonday),
    endDate: formatDateISO(targetSunday)
  };
}
