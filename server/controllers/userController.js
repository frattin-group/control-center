const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { clerkClient } = require('@clerk/clerk-sdk-node');

exports.getUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { name: 'asc' },
            include: { assignedSuppliers: true }
        });

        const transformed = users.map(u => ({
            ...u,
            assignedChannels: u.assignedSuppliers.map(as => as.supplierId)
        }));

        res.json(transformed);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching users' });
    }
};

// Note: User creation usually happens via Auth webhook or client-side first. 
// But for Settings Page "Add User", we might need to create the DB record.
exports.createUser = async (req, res) => {
    try {
        const { id, email, name, role, assignedChannels } = req.body;
        // ID is required (from Auth provider)
        if (!id || !email) {
            return res.status(400).json({ error: 'ID and Email are required' });
        }

        const user = await prisma.user.create({
            data: {
                id,
                email,
                name: name || email.split('@')[0],
                role: role || 'collaborator',
                assignedSuppliers: {
                    create: (assignedChannels || []).map(supplierId => ({ supplierId }))
                }
            },
            include: { assignedSuppliers: true }
        });

        res.json({
            ...user,
            assignedChannels: user.assignedSuppliers.map(as => as.supplierId)
        });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ error: 'Error creating user' });
    }
};

exports.createUserWithAuth = async (req, res) => {
    try {
        const { email, name, role, assignedChannels, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and Password are required' });
        }

        // 1. Create user in Clerk
        let clerkUser;
        try {
            clerkUser = await clerkClient.users.createUser({
                emailAddress: [email],
                password,
                firstName: name,
                publicMetadata: { role }
            });
        } catch (clerkError) {
            console.error("Clerk creation error:", clerkError);
            if (clerkError.errors && clerkError.errors[0]?.code === 'form_identifier_exists') {
                return res.status(409).json({ error: 'Email already exists in Clerk' });
            }
            throw clerkError;
        }

        // 2. Create user in Neon (Prisma)
        try {
            const user = await prisma.user.create({
                data: {
                    id: clerkUser.id,
                    email,
                    name: name || email.split('@')[0],
                    role: role || 'collaborator',
                    assignedSuppliers: {
                        create: (assignedChannels || []).map(supplierId => ({ supplierId }))
                    }
                },
                include: { assignedSuppliers: true }
            });

            res.json({
                status: 'success',
                data: {
                    ...user,
                    assignedChannels: user.assignedSuppliers.map(as => as.supplierId)
                }
            });
        } catch (dbError) {
            console.error("DB creation error:", dbError);
            // Rollback Clerk user if DB fails (optional but recommended)
            await clerkClient.users.deleteUser(clerkUser.id);
            return res.status(500).json({ error: 'Error creating user in database' });
        }

    } catch (error) {
        console.error("Error in createUserWithAuth:", error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, assignedChannels } = req.body;

        const user = await prisma.$transaction(async (prisma) => {
            await prisma.user.update({
                where: { id },
                data: {
                    name,
                    role
                }
            });

            if (assignedChannels) {
                await prisma.supplierAssignment.deleteMany({ where: { userId: id } });
                if (assignedChannels.length > 0) {
                    await prisma.supplierAssignment.createMany({
                        data: assignedChannels.map(supplierId => ({ userId: id, supplierId }))
                    });
                }
            }

            return prisma.user.findUnique({
                where: { id },
                include: { assignedSuppliers: true }
            });
        });

        res.json({
            ...user,
            assignedChannels: user.assignedSuppliers.map(as => as.supplierId)
        });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ error: 'Error updating user' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id } });
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting user' });
    }
};
