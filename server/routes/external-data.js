const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middleware for Bearer Token authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Missing authentication token' });

    if (token !== process.env.DATA_API_TOKEN) {
        return res.status(403).json({ error: 'Invalid authentication token' });
    }

    next();
};

// Apply middleware to specific routes
// router.use(authenticateToken); // REMOVED global application

// GET /api/data/daily-expenses?date=YYYY-MM-DD
router.get('/daily-expenses', authenticateToken, async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required (AAAA-MM-GG)' });
        }

        // Parse date to start and end of day in UTC
        const startDate = new Date(date);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setUTCHours(23, 59, 59, 999);

        const expenses = await prisma.expenseLineItem.findMany({
            where: {
                expense: {
                    OR: [
                        {
                            createdAt: {
                                gte: startDate,
                                lte: endDate
                            }
                        },
                        {
                            updatedAt: {
                                gte: startDate,
                                lte: endDate
                            }
                        }
                    ]
                }
            },
            include: {
                expense: {
                    include: {
                        supplier: true
                    }
                },
                branch: true,
                marketingChannel: {
                    include: {
                        category: true
                    }
                },
                sector: true
            }
        });

        const formattedExpenses = expenses.map(expense => ({
            id: expense.expenseId, // ID of the parent expense
            lineItemId: expense.id, // ID of the specific line item
            date: expense.expense.date.toISOString().split('T')[0],
            supplier: expense.expense.supplier.name,
            amount: expense.amount,
            description: expense.description || expense.expense.description,
            category: expense.marketingChannel?.category?.name || 'Altro',
            branch: expense.branch?.name || 'Sede non specificata'
        }));

        res.json(formattedExpenses);

    } catch (error) {
        console.error('Error fetching daily expenses:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/data/monthly-employees?month=YYYY-MM
router.get('/monthly-employees', authenticateToken, async (req, res) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ error: 'Month and Year parameters are required' });
        }

        const targetMonth = parseInt(month);
        const targetYear = parseInt(year);

        const employees = await prisma.employee.findMany({
            where: {
                status: 'active'
            },
            include: {
                branch: true
            }
        });

        const formattedEmployees = employees.map(emp => {
            let cost = emp.monthlyCost;

            // Check historical costs
            if (emp.monthlyCostsByYear && emp.monthlyCostsByYear[targetYear]) {
                const yearCosts = emp.monthlyCostsByYear[targetYear];

                if (Array.isArray(yearCosts)) {
                    // If array, index is 0-11
                    cost = yearCosts[targetMonth - 1] || cost;
                } else if (typeof yearCosts === 'object') {
                    // If object, keys are likely "01", "02", ... "12"
                    // Ensure zero-padding for single digit months
                    const monthKey = targetMonth < 10 ? `0${targetMonth}` : `${targetMonth}`;
                    // Try both padded and unpadded just in case
                    cost = yearCosts[monthKey] !== undefined ? yearCosts[monthKey] : (yearCosts[targetMonth] || cost);
                }
            }

            return {
                employee: emp.name,
                cost: cost,
                branch: emp.branch?.name || null
            };
        });

        res.json(formattedEmployees);

    } catch (error) {
        console.error('Error fetching monthly employees:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
