const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClerkClient } = require('@clerk/clerk-sdk-node');

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function setAdminRole(email) {
    try {
        console.log(`Searching for user with email: ${email}...`);
        const userList = await clerk.users.getUserList({ emailAddress: [email] });
        console.log("UserList response:", JSON.stringify(userList, null, 2));

        const users = userList.data || userList; // Handle both { data: [...] } and [...]

        if (!users || users.length === 0) {
            console.error('User not found!');
            return;
        }

        const user = users[0];
        console.log(`Found user: ${user.id} (${user.firstName} ${user.lastName})`);

        await clerk.users.updateUser(user.id, {
            publicMetadata: {
                role: 'admin',
            },
        });

        console.log(`Successfully updated role to 'admin' for user ${user.id}`);
    } catch (error) {
        console.error('Error updating user role:', error);
    }
}

// Replace with the user's email
const userEmail = 'mattia.rossi@frattinauto.it'; // Assuming this is the email, or I should ask/pass it as arg. 
// Better to pass as argument or ask user. I will use a placeholder and ask user to run it or I will try to guess from context if available.
// The user didn't explicitly state their email in the last message, but in the previous prompt they mentioned "la mia solita mail".
// I will try to find the email from the service account or just ask the user.
// Wait, I can just list all users and print them, then pick one? No, privacy.
// I'll grab the email from the service account client_email? No, that's the service account.
// I will assume the email is the one they used to sign up. I'll make the script accept an argument.

const emailArg = process.argv[2];
if (!emailArg) {
    console.error("Please provide the email address as an argument.");
    process.exit(1);
}

setAdminRole(emailArg);
