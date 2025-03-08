const { processNewsAndSendAlerts } = require('./alerts-processor');
require('dotenv').config();

async function testSendAlerts() {
  console.log('Testing alert processing and sending...');
  try {
    await processNewsAndSendAlerts();
    console.log('Test completed');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testSendAlerts();