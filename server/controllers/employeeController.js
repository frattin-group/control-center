const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getEmployees = async (req, res) => {
    try {
        const employees = await prisma.employee.findMany({
            include: {
                branch: true,
                sector: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        res.json(employees);
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Error fetching employees' });
    }
};

const createEmployee = async (req, res) => {
    try {
        const {
            name,
            role,
            jobTitle,
            department,
            branchId,
            sectorId,
            status,
            monthlyCost,
            monthlyCosts,
            monthlyCostsByYear,
            employmentType,
            defaultYear,
            notes,
        } = req.body;

        const employee = await prisma.employee.create({
            data: {
                name,
                role,
                jobTitle,
                department,
                branchId: branchId || null,
                sectorId: sectorId || null,
                status: status || 'active',
                monthlyCost: parseFloat(monthlyCost) || 0,
                monthlyCosts: monthlyCosts || {},
                monthlyCostsByYear: monthlyCostsByYear || {},
                employmentType: employmentType || 'full_time',
                defaultYear,
                notes,
            },
            include: {
                branch: true,
                sector: true,
            },
        });
        res.json(employee);
    } catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({ error: 'Error creating employee' });
    }
};

const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            role,
            jobTitle,
            department,
            branchId,
            sectorId,
            status,
            monthlyCost,
            monthlyCosts,
            monthlyCostsByYear,
            employmentType,
            defaultYear,
            notes,
        } = req.body;

        const employee = await prisma.employee.update({
            where: { id },
            data: {
                name,
                role,
                jobTitle,
                department,
                branchId: branchId || null,
                sectorId: sectorId || null,
                status,
                monthlyCost: parseFloat(monthlyCost) || 0,
                monthlyCosts: monthlyCosts || {},
                monthlyCostsByYear: monthlyCostsByYear || {},
                employmentType,
                defaultYear,
                notes,
            },
            include: {
                branch: true,
                sector: true,
            },
        });
        res.json(employee);
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ error: 'Error updating employee' });
    }
};

const deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.employee.delete({
            where: { id },
        });
        res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ error: 'Error deleting employee' });
    }
};

module.exports = {
    getEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
};
