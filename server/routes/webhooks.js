const express = require('express');
const router = express.Router();
const { Webhook } = require('svix');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/clerk', async (req, res) => {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
        console.error('Missing CLERK_WEBHOOK_SECRET');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Get the headers
    const svix_id = req.headers["svix-id"];
    const svix_timestamp = req.headers["svix-timestamp"];
    const svix_signature = req.headers["svix-signature"];

    // If there are no headers, error out
    if (!svix_id || !svix_timestamp || !svix_signature) {
        return res.status(400).json({ error: 'Error occured -- no svix headers' });
    }

    // Get the body
    const payload = req.body;
    const body = JSON.stringify(payload);

    // Create a new Svix instance with your secret.
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt;

    // Verify the payload with the headers
    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        });
    } catch (err) {
        console.error('Error verifying webhook:', err);
        return res.status(400).json({ 'Error': err.message });
    }

    // Handle the event
    const eventType = evt.type;
    const { id, email_addresses, first_name, last_name, public_metadata } = evt.data;

    console.log(`Webhook with and ID of ${id} and type of ${eventType}`);

    try {
        if (eventType === 'user.created') {
            const email = email_addresses[0]?.email_address;
            const name = `${first_name || ''} ${last_name || ''}`.trim();
            const role = public_metadata?.role || 'collaborator';
            const assignedChannels = public_metadata?.assignedChannels || [];

            // Check if user already exists by email (legacy user from Firebase)
            const existingUser = await prisma.user.findUnique({
                where: { email: email }
            });

            if (existingUser) {
                // Update the ID of the existing user to match the new Clerk ID
                // We use raw query because Prisma doesn't allow updating the ID field directly
                await prisma.$executeRaw`UPDATE users SET id = ${id} WHERE email = ${email}`;

                // Also update the name and role if needed
                await prisma.user.update({
                    where: { id: id },
                    data: {
                        name: name || existingUser.name,
                        role: role || existingUser.role,
                        status: 'active',
                        assignedSuppliers: {
                            deleteMany: {}, // Clear existing assignments if we want to overwrite, or keep them?
                            // Let's assume we want to MERGE or OVERWRITE. 
                            // If it's a migration, maybe we should keep existing?
                            // But if the invite specifies channels, maybe we should add them?
                            // For simplicity and safety, let's ADD new ones if specified, but usually invite is for new users.
                            // If legacy user, they might already have assignments.
                            // Let's only add if assignedChannels is not empty.
                            create: assignedChannels.map(supplierId => ({ supplierId }))
                        }
                    }
                });
                console.log(`Legacy user ${email} migrated to Clerk ID ${id}`);
            } else {
                await prisma.user.create({
                    data: {
                        id: id,
                        email: email,
                        name: name || email, // Fallback to email if name is empty
                        role: role,
                        status: 'active',
                        assignedSuppliers: {
                            create: assignedChannels.map(supplierId => ({ supplierId }))
                        }
                    }
                });
                console.log(`User ${id} created in DB`);
            }
        } else if (eventType === 'user.updated') {
            const email = email_addresses[0]?.email_address;
            const name = `${first_name || ''} ${last_name || ''}`.trim();
            const role = public_metadata?.role || 'collaborator';

            await prisma.user.update({
                where: { id: id },
                data: {
                    email: email,
                    name: name || email,
                    role: role
                }
            });
            console.log(`User ${id} updated in DB`);
        } else if (eventType === 'user.deleted') {
            await prisma.user.delete({
                where: { id: id }
            });
            console.log(`User ${id} deleted from DB`);
        }
    } catch (error) {
        console.error(`Error processing webhook ${eventType}:`, error);
        return res.status(500).json({ error: 'Error processing webhook' });
    }

    return res.status(200).json({ success: true });
});

module.exports = router;
