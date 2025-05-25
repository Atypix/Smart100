// frontend/src/utils/formatters.ts

/**
 * Formats a Unix timestamp (in seconds) to a localized date string.
 * Example: 1672531200 -> "1/1/2023" (for en-US locale)
 * @param timestamp Unix timestamp in seconds.
 * @returns A localized date string.
 */
export const formatDateForChart = (timestamp: number): string => {
  if (timestamp === undefined || timestamp === null) return '';
  return new Date(timestamp * 1000).toLocaleDateString(); // Adjust locale as needed
};

/**
 * Formats a number as a currency string (USD by default).
 * Example: 12345.67 -> "$12,345.67"
 * @param value The number to format.
 * @returns A currency-formatted string.
 */
export const formatCurrency = (value: number): string => {
  if (value === undefined || value === null || isNaN(value)) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

/**
 * Formats a Unix timestamp (in seconds) to a localized date and time string.
 * Example: 1672531200 -> "1/1/2023, 12:00:00 AM" (for en-US locale)
 * @param timestamp Unix timestamp in seconds.
 * @returns A localized date and time string.
 */
export const formatDateTimeForChart = (timestamp: number): string => {
    if (timestamp === undefined || timestamp === null) return '';
    return new Date(timestamp * 1000).toLocaleString(); // Adjust locale as needed
};
