const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- Sectors ---
exports.getSectors = async (req, res) => {
    try {
        const sectors = await prisma.sector.findMany({ orderBy: { name: 'asc' } });
        res.json(sectors);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching sectors' });
    }
};

exports.createSector = async (req, res) => {
    try {
        const { name } = req.body;
        const sector = await prisma.sector.create({ data: { name } });
        res.json(sector);
    } catch (error) {
        res.status(500).json({ error: 'Error creating sector' });
    }
};

exports.updateSector = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const sector = await prisma.sector.update({ where: { id }, data: { name } });
        res.json(sector);
    } catch (error) {
        res.status(500).json({ error: 'Error updating sector' });
    }
};

exports.deleteSector = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.sector.delete({ where: { id } });
        res.json({ message: 'Sector deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting sector' });
    }
};

// --- Branches ---
exports.getBranches = async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: { name: 'asc' },
            include: { sectors: true }
        });
        // Transform for frontend if needed, or keep as is. 
        // Frontend expects associatedSectors array of IDs.
        const transformed = branches.map(b => ({
            ...b,
            associatedSectors: b.sectors.map(bs => bs.sectorId)
        }));
        res.json(transformed);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching branches' });
    }
};

exports.createBranch = async (req, res) => {
    try {
        const { name, associatedSectors } = req.body;
        const branch = await prisma.branch.create({
            data: {
                name,
                sectors: {
                    create: (associatedSectors || []).map(sectorId => ({ sectorId }))
                }
            },
            include: { sectors: true }
        });
        res.json({ ...branch, associatedSectors: branch.sectors.map(s => s.sectorId) });
    } catch (error) {
        res.status(500).json({ error: 'Error creating branch' });
    }
};

exports.updateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, associatedSectors } = req.body;

        // Transaction to update relations
        const branch = await prisma.$transaction(async (prisma) => {
            // Update name
            await prisma.branch.update({
                where: { id },
                data: { name }
            });

            if (associatedSectors) {
                // Delete existing relations
                await prisma.branchSector.deleteMany({ where: { branchId: id } });
                // Create new relations
                if (associatedSectors.length > 0) {
                    await prisma.branchSector.createMany({
                        data: associatedSectors.map(sectorId => ({ branchId: id, sectorId }))
                    });
                }
            }

            return prisma.branch.findUnique({
                where: { id },
                include: { sectors: true }
            });
        });

        res.json({ ...branch, associatedSectors: branch.sectors.map(s => s.sectorId) });
    } catch (error) {
        res.status(500).json({ error: 'Error updating branch' });
    }
};

exports.deleteBranch = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.branch.delete({ where: { id } });
        res.json({ message: 'Branch deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting branch' });
    }
};

// --- Marketing Channels ---
exports.getMarketingChannels = async (req, res) => {
    try {
        const channels = await prisma.marketingChannel.findMany({ orderBy: { name: 'asc' } });
        res.json(channels);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching marketing channels' });
    }
};

exports.createMarketingChannel = async (req, res) => {
    try {
        const { name, categoryId } = req.body;
        const channel = await prisma.marketingChannel.create({
            data: { name, categoryId: categoryId || null }
        });
        res.json(channel);
    } catch (error) {
        res.status(500).json({ error: 'Error creating marketing channel' });
    }
};

exports.updateMarketingChannel = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, categoryId } = req.body;
        const channel = await prisma.marketingChannel.update({
            where: { id },
            data: { name, categoryId: categoryId || null }
        });
        res.json(channel);
    } catch (error) {
        res.status(500).json({ error: 'Error updating marketing channel' });
    }
};

exports.deleteMarketingChannel = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.marketingChannel.delete({ where: { id } });
        res.json({ message: 'Marketing channel deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting marketing channel' });
    }
};

// --- Channel Categories ---
exports.getChannelCategories = async (req, res) => {
    try {
        const categories = await prisma.channelCategory.findMany({ orderBy: { name: 'asc' } });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching channel categories' });
    }
};

exports.createChannelCategory = async (req, res) => {
    try {
        const { name } = req.body;
        const category = await prisma.channelCategory.create({ data: { name } });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: 'Error creating channel category' });
    }
};

exports.updateChannelCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const category = await prisma.channelCategory.update({ where: { id }, data: { name } });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: 'Error updating channel category' });
    }
};

exports.deleteChannelCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.channelCategory.delete({ where: { id } });
        res.json({ message: 'Channel category deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting channel category' });
    }
};
