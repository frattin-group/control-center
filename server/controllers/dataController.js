const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getInitialData = async (req, res) => {
    try {
        console.log("Fetching initial data...");
        const year = parseInt(req.query.year) || new Date().getFullYear();

        console.log("Fetching sectors...");
        const sectors = await prisma.sector.findMany({ orderBy: { name: 'asc' } });
        console.log("Fetching branches...");
        const branchesRaw = await prisma.branch.findMany({ orderBy: { name: 'asc' }, include: { sectors: true } });
        console.log("Fetching suppliers...");
        const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
        console.log("Fetching marketingChannels...");
        const marketingChannels = await prisma.marketingChannel.findMany({ orderBy: { name: 'asc' } });
        console.log("Fetching channelCategories...");
        const channelCategories = await prisma.channelCategory.findMany({ orderBy: { name: 'asc' } });
        console.log("Fetching geographicAreas...");
        const geographicAreas = await prisma.geographicArea.findMany({ orderBy: { name: 'asc' } });
        console.log("Fetching contracts...");
        const contractsRaw = await prisma.contract.findMany({ orderBy: { description: 'asc' }, include: { plannedLineItems: true } });
        console.log("Fetching budgets...");
        const budgets = await prisma.budget.findMany({ where: { year: year }, include: { allocations: true } });
        console.log("Fetching sectorBudgets...");
        const sectorBudgets = await prisma.sectorBudget.findMany({ where: { year: year } });

        const branches = branchesRaw.map(b => ({
            ...b,
            associatedSectors: b.sectors.map(bs => bs.sectorId)
        }));

        const contracts = contractsRaw.map(c => ({
            ...c,
            lineItems: c.plannedLineItems
        }));

        console.log("All data fetched successfully");

        res.json({
            sectors,
            branches,
            suppliers,
            marketingChannels,
            channelCategories,
            geographicAreas,
            contracts,
            budgets,
            sectorBudgets
        });
    } catch (error) {
        console.error("Error fetching initial data:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
};
exports.getBranches = async (req, res) => {
    try {
        const branchesRaw = await prisma.branch.findMany({ orderBy: { name: 'asc' }, include: { sectors: true } });
        const branches = branchesRaw.map(b => ({
            ...b,
            associatedSectors: b.sectors.map(bs => bs.sectorId)
        }));
        res.json(branches);
    } catch (error) {
        console.error("Error fetching branches:", error);
        res.status(500).json({ error: "Failed to fetch branches" });
    }
};

exports.getSectors = async (req, res) => {
    try {
        const sectors = await prisma.sector.findMany({ orderBy: { name: 'asc' } });
        res.json(sectors);
    } catch (error) {
        console.error("Error fetching sectors:", error);
        res.status(500).json({ error: "Failed to fetch sectors" });
    }
};
