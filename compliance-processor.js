const fs = require('fs').promises;
const path = require('path');

// Path to the "database" file for processed alerts
const PROCESSED_ALERTS_FILE = path.join(__dirname, 'data', 'processed-alerts.json');
const ALERTS_LOG_FILE = path.join(__dirname, 'data', 'alerts-log.json');

// Process compliance alerts
async function processComplianceAlerts() {
  try {
    // Create data directory if it doesn't exist
    await ensureDataDirectory();
    
    // Get already processed alerts to avoid duplicates
    const processedAlertIds = await loadProcessedAlerts();
    
    // Get alerts - this would normally come from an API
    // For now, we'll use your sample data
    const alerts = getMockAlerts();
    
    // Filter out alerts we've already processed
    const newAlerts = alerts.complianceAlerts.filter(alert => !processedAlertIds.includes(alert.alertId));
    
    console.log(`Found ${newAlerts.length} new alerts out of ${alerts.complianceAlerts.length} total`);
    
    if (newAlerts.length === 0) {
      return { processed: 0, newAlerts: [] };
    }
    
    // Process each new alert (for now, just log them)
    const processedResults = [];
    for (const alert of newAlerts) {
      try {
        // Process the alert (in a real system, this would do something more)
        console.log(`Processing alert: ${alert.alertId} - ${alert.product}`);
        
        const processedAlert = {
          ...alert,
          processedAt: new Date().toISOString(),
          status: 'processed' 
        };
        
        // Save to our local log
        await logProcessedAlert(processedAlert);
        
        processedResults.push({
          alertId: alert.alertId,
          product: alert.product,
          status: 'success'
        });
        
      } catch (error) {
        console.error(`Error processing alert ${alert.alertId}:`, error);
        processedResults.push({
          alertId: alert.alertId,
          product: alert.product,
          status: 'error',
          error: error.message
        });
      }
    }
    
    // Mark all alerts as processed, even failed ones (to avoid reprocessing)
    const newProcessedIds = newAlerts.map(alert => alert.alertId);
    await saveProcessedAlerts([...processedAlertIds, ...newProcessedIds]);
    
    return { 
      processed: newAlerts.length,
      succeeded: processedResults.filter(r => r.status === 'success').length,
      failed: processedResults.filter(r => r.status === 'error').length,
      newAlerts,
      results: processedResults
    };
    
  } catch (error) {
    console.error('Error in processComplianceAlerts:', error);
    throw error;
  }
}

// Make sure the data directory exists
async function ensureDataDirectory() {
  const dataDir = path.dirname(PROCESSED_ALERTS_FILE);
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

// Load the list of already processed alert IDs
async function loadProcessedAlerts() {
  try {
    const data = await fs.readFile(PROCESSED_ALERTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If the file doesn't exist yet, return an empty array
    return [];
  }
}

// Save processed alert IDs to the file
async function saveProcessedAlerts(alertIds) {
  await fs.writeFile(
    PROCESSED_ALERTS_FILE,
    JSON.stringify(alertIds, null, 2),
    'utf-8'
  );
}

// Log processed alerts with full details
async function logProcessedAlert(alert) {
  try {
    let logs = [];
    try {
      const logData = await fs.readFile(ALERTS_LOG_FILE, 'utf-8');
      logs = JSON.parse(logData);
    } catch (error) {
      // If the file doesn't exist or is invalid, start with empty array
      logs = [];
    }
    
    logs.push(alert);
    
    await fs.writeFile(
      ALERTS_LOG_FILE,
      JSON.stringify(logs, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error('Error saving alert log:', error);
  }
}

// Get mock alerts - in a real system, this would call an API
// Get mock alerts - in a real system, this would call an API
function getMockAlerts() {
  // Return a different dataset each time to simulate new alerts
  const datasets = [
    {
      "lastChecked": "2025-03-08T09:27:46.304Z",
      "alertCount": 2,
      "complianceAlerts": [
        {
          "alertId": "CA-1741426128391-130",
          "summary": "New tariffs (unspecified rate) affecting trade of petroleum",
          "product": "petroleum",
          "restrictionType": "tariff",
          "fromCountries": ["u.s."],
          "toCountries": [],
          "tariffRate": null,
          "effectiveDate": null,
          "datePublished": "2025-03-07T09:08:00.000Z",
          "source": "Yahoo Finance",
          "title": "Oil Set for Weekly Loss Amid U.S. Tariffs, OPEC+ Output Plans",
          "link": "https://www.wsj.com/finance/commodities-futures/oil-edges-higher-as-traders-assess-divergent-developments-6eed653b?siteid=yhoof2&yptr=yahoo",
          "confidence": 85
        },
        {
          "alertId": "CA-1741426128392-231",
          "summary": "New tariffs (unspecified rate) affecting exports of semiconductor",
          "product": "semiconductor",
          "restrictionType": "tariff",
          "fromCountries": ["taiwan"],
          "toCountries": [],
          "tariffRate": null,
          "effectiveDate": null,
          "datePublished": "2025-03-07T09:09:36.000Z",
          "source": "Yahoo Finance",
          "title": "Taiwan Feb exports beat forecasts as chip demand jumps before feared Trump tariffs",
          "link": "https://finance.yahoo.com/news/taiwan-feb-exports-beat-forecasts-090936765.html",
          "confidence": 85
        }
      ]
    },
    {
      "lastChecked": "2025-03-08T08:33:50.186Z",
      "alertCount": 4,
      "complianceAlerts": [
        {
          "alertId": "CA-1741422830186-001",
          "summary": "New tariffs (25%) affecting imports of semiconductors",
          "product": "semiconductor",
          "restrictionType": "tariff",
          "fromCountries": ["China", "Taiwan"],
          "toCountries": ["United States"],
          "tariffRate": "25%",
          "effectiveDate": "April 1, 2025",
          "datePublished": "2025-03-08T08:33:50.186Z",
          "source": "Global Trade Magazine",
          "title": "US Announces New Semiconductor Tariffs on Asian Imports",
          "link": "https://www.example.com/news/123",
          "confidence": 95
        },
        {
          "alertId": "CA-1741422830186-002",
          "summary": "Export restrictions affecting exports of automotive parts",
          "product": "automotive",
          "restrictionType": "ban/restriction",
          "fromCountries": ["United States"],
          "toCountries": ["Russia"],
          "tariffRate": null,
          "effectiveDate": "March 15, 2025",
          "datePublished": "2025-03-08T08:33:50.186Z",
          "source": "US CBP News",
          "title": "New Export Restrictions on Auto Parts to Russia",
          "link": "https://www.example.com/news/456",
          "confidence": 90
        },
        {
          "alertId": "CA-1741422830186-003",
          "summary": "New tariffs (10%) affecting imports of steel",
          "product": "steel",
          "restrictionType": "tariff",
          "fromCountries": ["Canada", "Mexico"],
          "toCountries": ["United States"],
          "tariffRate": "10%",
          "effectiveDate": "next week",
          "datePublished": "2025-03-08T08:33:50.186Z",
          "source": "The Guardian International",
          "title": "No room left for negotiation with Canada and Mexico on tariffs, says Trump",
          "link": "https://www.example.com/news/789",
          "confidence": 85
        },
        {
          "alertId": "CA-1741422830186-004",
          "summary": "New tariffs (20%) affecting imports of crude oil",
          "product": "crude oil",
          "restrictionType": "tariff",
          "fromCountries": ["Canada"],
          "toCountries": ["United States"],
          "tariffRate": "20%",
          "effectiveDate": "April 1, 2025",
          "datePublished": "2025-03-08T08:33:50.186Z",
          "source": "Global Trade Magazine",
          "title": "Canada-U.S. Oil Trade Resilient Despite Potential Tariffs",
          "link": "https://www.globaltrademag.com/canada-u-s-oil-trade-resilient-despite-potential-tariffs/",
          "confidence": 80
        }
      ]
    }
  ];
  
  // Alternate between datasets
  const time = new Date().getTime();
  const datasetIndex = Math.floor(time / 60000) % datasets.length;
  return datasets[datasetIndex];
}

module.exports = { processComplianceAlerts };