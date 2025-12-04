const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function linkUser(email, clerkId) {
    try {
        console.log(`Searching for DB user with email: ${email}...`);
        const oldUser = await prisma.user.findUnique({
            where: { email: email },
            include: { assignedChannels: true }
        });

        if (!oldUser) {
            console.error('User not found in database!');
            // If not found, maybe create it?
            console.log('Creating new user...');
            await prisma.user.create({
                data: {
                    id: clerkId,
                    email: email,
                    name: 'Admin', // Placeholder
                    role: 'admin'
                }
            });
            return;
        }

        console.log(`Found DB user: ${oldUser.id}. Swapping to Clerk ID: ${clerkId}...`);

        if (oldUser.id === clerkId) {
            console.log("IDs already match. Nothing to do.");
            return;
        }

        // Transaction to swap ID
        await prisma.$transaction(async (tx) => {
            // 1. Create new user with Clerk ID
            const newUser = await tx.user.create({
                data: {
                    id: clerkId,
                    email: `temp_${email}`, // Temp email to avoid unique constraint
                    name: oldUser.name,
                    role: oldUser.role,
                    createdAt: oldUser.createdAt,
                    updatedAt: oldUser.updatedAt
                }
            });

            // 2. Move relations (ChannelAssignment)
            // Delete old assignments and create new ones (since we can't update FKs easily if they are part of composite PK)
            // Actually ChannelAssignment PK is [userId, channelId].
            if (oldUser.assignedChannels.length > 0) {
                await tx.channelAssignment.deleteMany({
                    where: { userId: oldUser.id }
                });

                await tx.channelAssignment.createMany({
                    data: oldUser.assignedChannels.map(ca => ({
                        userId: clerkId,
                        channelId: ca.channelId
                    }))
                });
            }

            // 3. Delete old user
            await tx.user.delete({
                where: { id: oldUser.id }
            });

            // 4. Fix email on new user
            await tx.user.update({
                where: { id: clerkId },
                data: { email: email }
            });
        });

        console.log(`Successfully linked Clerk ID ${clerkId} to user ${email}`);

    } catch (error) {
        console.error('Error linking user:', error);
    } finally {
        await prisma.$disconnect();
    }
}

const emailArg = process.argv[2];
const idArg = process.argv[3];

if (!emailArg || !idArg) {
    console.error("Usage: node link-clerk-user.js <email> <clerk_id>");
    process.exit(1);
}

linkUser(emailArg, idArg);
