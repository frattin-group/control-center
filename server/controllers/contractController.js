const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all contracts
exports.getContracts = async (req, res) => {
    try {
        const contracts = await prisma.contract.findMany({
            orderBy: { description: 'asc' },
            include: {
                plannedLineItems: true,
                supplier: true // Include supplier details if needed for display
            }
        });

        // Map plannedLineItems to lineItems for frontend compatibility
        const formattedContracts = contracts.map(contract => ({
            ...contract,
            lineItems: contract.plannedLineItems,
            supplierName: contract.supplier?.name
        }));

        res.json(formattedContracts);
    } catch (error) {
        console.error("Error fetching contracts:", error);
        res.status(500).json({ error: "Failed to fetch contracts" });
    }
};

// Create a new contract
exports.createContract = async (req, res) => {
    try {
        const { supplierId, signingDate, description, amount, contractPdfUrl, lineItems } = req.body;

        const newContract = await prisma.contract.create({
            data: {
                supplierId,
                signingDate: new Date(signingDate),
                description,
                amount: parseFloat(amount),
                contractPdfUrl,
                plannedLineItems: {
                    create: (lineItems || []).map(item => ({
                        description: item.description,
                        totalAmount: parseFloat(item.totalAmount),
                        startDate: new Date(item.startDate),
                        endDate: new Date(item.endDate),
                        sectorId: item.sectorId,
                        marketingChannelId: item.marketingChannelId,
                        branchId: item.branchId
                    }))
                }
            },
            include: {
                plannedLineItems: true
            }
        });

        res.status(201).json({
            ...newContract,
            lineItems: newContract.plannedLineItems
        });
    } catch (error) {
        console.error("Error creating contract:", error);
        res.status(500).json({ error: "Failed to create contract" });
    }
};

// Update an existing contract
exports.updateContract = async (req, res) => {
    try {
        const { id } = req.params;
        const { supplierId, signingDate, description, amount, contractPdfUrl, lineItems } = req.body;

        // Use a transaction to ensure atomicity
        const updatedContract = await prisma.$transaction(async (prisma) => {
            // 1. Update basic contract details
            const contract = await prisma.contract.update({
                where: { id },
                data: {
                    supplierId,
                    signingDate: new Date(signingDate),
                    description,
                    amount: parseFloat(amount),
                    contractPdfUrl
                }
            });

            // 2. Replace line items (Delete all existing and create new ones)
            // This is simpler than diffing and ensures the state matches the frontend
            await prisma.contractLineItem.deleteMany({
                where: { contractId: id }
            });

            if (lineItems && lineItems.length > 0) {
                await prisma.contractLineItem.createMany({
                    data: lineItems.map(item => ({
                        contractId: id,
                        description: item.description,
                        totalAmount: parseFloat(item.totalAmount),
                        startDate: new Date(item.startDate),
                        endDate: new Date(item.endDate),
                        sectorId: item.sectorId,
                        marketingChannelId: item.marketingChannelId,
                        branchId: item.branchId
                    }))
                });
            }

            // 3. Fetch the updated contract with line items
            return await prisma.contract.findUnique({
                where: { id },
                include: {
                    plannedLineItems: true
                }
            });
        });

        res.json({
            ...updatedContract,
            lineItems: updatedContract.plannedLineItems
        });
    } catch (error) {
        console.error("Error updating contract:", error);
        res.status(500).json({ error: "Failed to update contract" });
    }
};

// Delete a contract
exports.deleteContract = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.contract.delete({
            where: { id }
        });
        res.json({ message: "Contract deleted successfully" });
    } catch (error) {
        console.error("Error deleting contract:", error);
        res.status(500).json({ error: "Failed to delete contract" });
    }
};
