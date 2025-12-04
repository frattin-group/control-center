const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getSuppliers = async (req, res) => {
    try {
        const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
        res.json(suppliers);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching suppliers' });
    }
};

exports.createSupplier = async (req, res) => {
    try {
        const { name, vatNumber, address } = req.body;
        const supplier = await prisma.supplier.create({
            data: { name, vatNumber, address }
        });
        res.json(supplier);
    } catch (error) {
        res.status(500).json({ error: 'Error creating supplier' });
    }
};

exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, vatNumber, address } = req.body;
        const supplier = await prisma.supplier.update({
            where: { id },
            data: { name, vatNumber, address }
        });
        res.json(supplier);
    } catch (error) {
        res.status(500).json({ error: 'Error updating supplier' });
    }
};

exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.supplier.delete({ where: { id } });
        res.json({ message: 'Supplier deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting supplier' });
    }
};
