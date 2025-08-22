const { getUser, isAdmin } = require('../db/db');

/**
 * Check if user is authorized to use the bot
 * @param {number} userId - Telegram user ID
 * @returns {Promise<Object|null>} User object or null if not authorized
 */
async function checkUserAuthorization(userId) {
    return new Promise(resolve => {
        getUser(userId, (user) => {
            resolve(user);
        });
    });
}

/**
 * Check if user is an admin
 * @param {number} userId - Telegram user ID
 * @returns {Promise<boolean>} True if user is admin
 */
async function checkAdminStatus(userId) {
    return new Promise(resolve => {
        isAdmin(userId, (adminStatus) => {
            resolve(adminStatus);
        });
    });
}

/**
 * Validate phone number format (E.164)
 * @param {string} number - Phone number to validate
 * @returns {boolean} True if valid E.164 format
 */
function isValidPhoneNumber(number) {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(number.trim());
}

/**
 * Format duration in seconds to MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
    if (!seconds || seconds < 0) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * Format call timestamp to readable date
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted date
 */
function formatCallDate(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Format call timestamp to readable time
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted time
 */
function formatCallTime(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleTimeString();
}

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 80) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Validate Call SID format
 * @param {string} callSid - Call SID to validate
 * @returns {boolean} True if valid Call SID format
 */
function isValidCallSid(callSid) {
    if (!callSid || typeof callSid !== 'string') return false;
    return callSid.startsWith('CA') && callSid.length >= 34;
}

/**
 * Handle common errors in bot commands
 * @param {Object} ctx - Grammy context object
 * @param {Error} error - Error object
 * @param {string} operation - Description of failed operation
 */
async function handleCommandError(ctx, error, operation = 'operation') {
    console.error(`Error during ${operation}:`, error);
    
    let errorMessage = '❌ An error occurred';
    
    if (error.response) {
        // API error
        if (error.response.status === 404) {
            errorMessage += ': Resource not found';
        } else if (error.response.status === 403) {
            errorMessage += ': Access denied';
        } else if (error.response.status >= 500) {
            errorMessage += ': Server error';
        } else {
            errorMessage += ': Request failed';
        }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage += ': Cannot connect to API server';
    } else {
        errorMessage += ` during ${operation}`;
    }
    
    errorMessage += '. Please try again.';
    
    try {
        await ctx.reply(errorMessage);
    } catch (replyError) {
        console.error('Failed to send error message:', replyError);
    }
}

/**
 * Check if user has permission for admin-only commands
 * @param {Object} ctx - Grammy context object
 * @param {boolean} requireAdmin - Whether admin permission is required
 * @returns {Promise<boolean>} True if user has required permissions
 */
async function checkPermissions(ctx, requireAdmin = false) {
    try {
        const user = await checkUserAuthorization(ctx.from.id);
        
        if (!user) {
            await ctx.reply('❌ You are not authorized to use this bot.');
            return false;
        }
        
        if (requireAdmin) {
            const adminStatus = await checkAdminStatus(ctx.from.id);
            if (!adminStatus) {
                await ctx.reply('❌ This command is for administrators only.');
                return false;
            }
        }
        
        return true;
    } catch (error) {
        await handleCommandError(ctx, error, 'permission check');
        return false;
    }
}

/**
 * Create standardized success message for operations
 * @param {string} operation - Operation that succeeded
 * @param {string} details - Additional details
 * @returns {string} Formatted success message
 */
function createSuccessMessage(operation, details = '') {
    return `✅ ${operation} completed successfully${details ? '\n\n' + details : ''}`;
}

/**
 * Create standardized error message for operations
 * @param {string} operation - Operation that failed
 * @param {string} reason - Reason for failure
 * @returns {string} Formatted error message
 */
function createErrorMessage(operation, reason = 'Unknown error') {
    return `❌ ${operation} failed: ${reason}`;
}

module.exports = {
    checkUserAuthorization,
    checkAdminStatus,
    isValidPhoneNumber,
    formatDuration,
    formatCallDate,
    formatCallTime,
    truncateText,
    isValidCallSid,
    handleCommandError,
    checkPermissions,
    createSuccessMessage,
    createErrorMessage
};