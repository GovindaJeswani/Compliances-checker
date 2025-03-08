const cron = require('node-cron');
const { processComplianceAlerts } = require('./compliance-processor');
const { createServer } = require('./server');
require('dotenv').config();

console.log('Compliance Monitor Service starting...');
console.log('Check interval: Every 20 minutes');

// Function to run the compliance check
async function runComplianceCheck() {
  console.log(`[${new Date().toISOString()}] Running compliance check...`);
  try {
    const result = await processComplianceAlerts();
    console.log(`[${new Date().toISOString()}] Processed ${result.processed} alerts`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in compliance check:`, error.message);
  }
}

// Schedule the task to run every 20 minutes
cron.schedule('*/20 * * * *', runComplianceCheck);

// Also run once on startup
runComplianceCheck();

// Start the web server (required for Render)
const server = createServer();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});