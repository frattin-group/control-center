const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

const invoiceRoutes = require('./routes/invoices');
const dataRoutes = require('./routes/data');
const expenseRoutes = require('./routes/expenses');
const budgetRoutes = require('./routes/budgets');
const contractRoutes = require('./routes/contracts');

app.use(cors());
app.use(express.json());

app.use('/api/invoices', invoiceRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/employees', require('./routes/employees'));
app.use('/api/master-data', require('./routes/master-data'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/users', require('./routes/users'));
app.use('/api/sector-budgets', require('./routes/sector-budgets'));
app.use('/api/invoice-analysis', require('./routes/invoice-analysis'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/data', require('./routes/external-data')); // Mount new external data routes under /api/data to match requested paths

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Example protected route
app.get('/api/protected', ClerkExpressRequireAuth(), (req, res) => {
    res.json({ message: 'Authenticated', userId: req.auth.userId });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message, stack: err.stack });
});

// Export app for Vercel
module.exports = app;

// Only listen if not running on Vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on port ${port}`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});
