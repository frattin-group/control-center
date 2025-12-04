const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/data/daily-expenses?date=YYYY-MM-DD
router.get('/daily-expenses', async (req, res) => {
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
                    date: {
                        gte: startDate,
                        lte: endDate
                    }
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

        const formattedExpenses = expenses.map(item => ({
            cost: item.amount,
            date: item.expense.date.toISOString().split('T')[0],
            branch: item.branch?.name || null,
            supplier: item.expense.supplier?.name || 'Unknown Supplier',
            category: item.marketingChannel?.category?.name || item.sector?.name || 'Uncategorized'
        }));

        res.json(formattedExpenses);

    } catch (error) {
        console.error('Error fetching daily expenses:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/data/monthly-employees?month=MM&year=YYYY
router.get('/monthly-employees', async (req, res) => {
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
                // Assuming yearCosts is an array of 12 numbers or an object keyed by month index (0-11 or 1-12)
                // Let's assume standard array 0-11 based on common practices, but we need to be robust.
                // If it's an object { "1": 1000, "2": ... }
                if (Array.isArray(yearCosts)) {
                    cost = yearCosts[targetMonth - 1] || cost;
                } else if (typeof yearCosts === 'object') {
                    cost = yearCosts[targetMonth] || cost;
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
