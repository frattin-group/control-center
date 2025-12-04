/**
 * Date filter utilities for consistent date range handling across pages
 */

/**
 * Get default date filter: current year (Jan 1 - Dec 31)
 * @returns {Object} { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 */
export const getDefaultDateFilter = () => {
    const today = new Date();
    const currentYear = today.getFullYear();

    return {
        startDate: `${currentYear}-01-01`,
        endDate: `${currentYear}-12-31`
    };
};

/**
 * Get date filter for last N months from today
 * @param {number} months - Number of months to go back
 * @returns {Object} { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 */
export const getLastMonthsFilter = (months) => {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setMonth(today.getMonth() - months);

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
    };
};

/**
 * Predefined date filter presets
 */
export const PREDEFINED_DATE_PRESETS = [
    {
        id: 'last-12-months',
        name: 'Ultimi 12 mesi',
        getFilter: () => getLastMonthsFilter(12),
        isPredefined: true
    },
    {
        id: 'last-9-months',
        name: 'Ultimi 9 mesi',
        getFilter: () => getLastMonthsFilter(9),
        isPredefined: true
    },
    {
        id: 'last-6-months',
        name: 'Ultimi 6 mesi',
        getFilter: () => getLastMonthsFilter(6),
        isPredefined: true
    },
    {
        id: 'last-3-months',
        name: 'Ultimi 3 mesi',
        getFilter: () => getLastMonthsFilter(3),
        isPredefined: true
    }
];

/**
 * Filter expenses by date range
 * @param {Array} expenses - Array of expense objects
 * @param {string} startDate - ISO date string (YYYY-MM-DD) or empty
 * @param {string} endDate - ISO date string (YYYY-MM-DD) or empty
 * @returns {Array} Filtered expenses
 */
export const filterExpensesByDateRange = (expenses, startDate, endDate) => {
    if (!startDate && !endDate) return expenses;

    return expenses.filter(expense => {
        if (!expense.date) return true; // Keep expenses without date

        const expenseDate = new Date(expense.date);
        expenseDate.setHours(0, 0, 0, 0);

        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (expenseDate < start) return false;
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (expenseDate > end) return false;
        }

        return true;
    });
};
