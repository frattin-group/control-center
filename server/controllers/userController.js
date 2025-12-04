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
        const { email, name, role, assignedChannels } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // 1. Create Invitation in Clerk
        let invitation;
        try {
            invitation = await clerkClient.invitations.createInvitation({
                emailAddress: email,
                publicMetadata: {
                    role,
                    assignedChannels: assignedChannels || []
                },
                redirectUrl: 'https://www.thefluxdata.app/sign-in' // Optional: redirect after acceptance
            });
        } catch (clerkError) {
            console.error("Clerk invitation error:", clerkError);
            if (clerkError.errors && clerkError.errors[0]?.code === 'form_identifier_exists') {
                // If user already exists, we can't invite them.
                // But maybe we want to return success if they are already in the system?
                // Or return a specific error.
                return res.status(409).json({ error: 'User already exists in Clerk' });
            }
            throw clerkError;
        }

        // We do NOT create the user in Prisma here anymore.
        // The user will be created (or updated) by the webhook when they accept the invitation.

        res.json({
            status: 'success',
            message: 'Invitation sent',
            data: {
                id: invitation.id,
                email: invitation.emailAddress,
                status: invitation.status
            }
        });

    } catch (error) {
        console.error("Error inviting user:", error);
        res.status(500).json({ error: error.message || 'Error inviting user' });
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
