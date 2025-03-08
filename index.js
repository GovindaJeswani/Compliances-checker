const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize storage
let processedAlertIds = [];
let alertsLog = [];

// API Keys - These should be set as environment variables in Render
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY || '';
const GNEWS_API_KEY = process.env.GNEWS_API_KEY || '';
const BING_NEWS_API_KEY = process.env.BING_NEWS_API_KEY || '';
const NEWSCATCHER_API_KEY = process.env.NEWSCATCHER_API_KEY || '';

// Keywords to search for in news related to trade compliance
const TRADE_KEYWORDS = [
  'tariff', 'import duty', 'export ban', 'trade restriction', 'sanctions',
  'embargo', 'customs duty', 'trade policy', 'import tax', 'export control',
  'wto ruling', 'trade dispute', 'quota', 'anti-dumping', 'countervailing duty',
  'trade war', 'protectionism', 'customs regulation', 'compliance', 'trade agreement',
  'trade barrier', 'export license', 'import permit', 'safeguard measure'
];

// Product categories to monitor
const PRODUCT_CATEGORIES = [
  'semiconductor', 'electronics', 'steel', 'aluminum', 'automotive', 
  'pharmaceuticals', 'petroleum', 'crude oil', 'agriculture', 'textiles', 
  'solar panels', 'chemicals', 'rare earth', 'minerals', 'lumber',
  'medical devices', 'machinery', 'aircraft', 'shipping', 'fertilizers'
];

// Restriction types
const RESTRICTION_TYPES = {
  TARIFF: ['tariff', 'duty', 'tax', 'levy', 'import tax', 'export tax'],
  BAN: ['ban', 'prohibition', 'restricted', 'not allowed', 'illegal', 'forbidden'],
  QUOTA: ['quota', 'limit', 'threshold', 'ceiling', 'cap'],
  LICENSE: ['license', 'permit', 'authorization', 'certificate', 'documentation'],
  SANCTION: ['sanction', 'penalty', 'punishment', 'embargo', 'boycott'],
  EMBARGO: ['embargo', 'blockade', 'siege']
};

// Real government trade portals and international organizations
const TRADE_ORGS = [
  {
    name: 'World Trade Organization',
    country: 'International',
    apiUrl: 'https://www.wto.org/english/res_e/publications_e/publications_e.htm',
    scrapeUrl: 'https://www.wto.org/english/news_e/news_e.htm',
    reliability: 'very high'
  },
  {
    name: 'United States International Trade Commission',
    country: 'United States',
    apiUrl: 'https://www.usitc.gov/press_room/news_release/external_relations_press_releases.htm',
    reliability: 'very high'
  },
  {
    name: 'European Commission - Trade',
    country: 'EU',
    apiUrl: 'https://trade.ec.europa.eu/doclib/cfm/doclib_section.cfm?sec=809',
    reliability: 'very high'
  },
  {
    name: 'India Directorate General of Foreign Trade',
    country: 'India',
    apiUrl: 'https://dgft.gov.in/CP/',
    reliability: 'high'
  },
  {
    name: 'China Ministry of Commerce',
    country: 'China',
    apiUrl: 'http://english.mofcom.gov.cn/article/newsrelease/',
    reliability: 'high'
  },
  {
    name: 'UK Department for Business and Trade',
    country: 'United Kingdom',
    apiUrl: 'https://www.gov.uk/government/organisations/department-for-business-and-trade',
    reliability: 'high'
  },
  {
    name: 'Brazil Ministry of Economy',
    country: 'Brazil',
    apiUrl: 'https://www.gov.br/produtividade-e-comercio-exterior/pt-br',
    reliability: 'high'
  },
  {
    name: 'Japan Ministry of Economy, Trade and Industry',
    country: 'Japan',
    apiUrl: 'https://www.meti.go.jp/english/press/index.html',
    reliability: 'high'
  }
];

// News API endpoints
const NEWS_APIS = [
  {
    name: 'NewsAPI',
    url: 'https://newsapi.org/v2/everything',
    params: {
      apiKey: NEWS_API_KEY,
      q: '', // Query will be set dynamically
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: 100
    },
    active: !!NEWS_API_KEY,
    reliability: 'medium'
  },
  {
    name: 'NewsData.io',
    url: 'https://newsdata.io/api/1/news',
    params: {
      apikey: NEWSDATA_API_KEY,
      q: '', // Query will be set dynamically
      language: 'en',
      size: 100
    },
    active: !!NEWSDATA_API_KEY,
    reliability: 'medium'
  },
  {
    name: 'GNews',
    url: 'https://gnews.io/api/v4/search',
    params: {
      token: GNEWS_API_KEY,
      q: '', // Query will be set dynamically
      lang: 'en',
      max: 100
    },
    active: !!GNEWS_API_KEY,
    reliability: 'medium'
  },
  {
    name: 'Bing News Search',
    url: 'https://api.bing.microsoft.com/v7.0/news/search',
    params: {
      q: '', // Query will be set dynamically
      count: 100,
      mkt: 'en-US'
    },
    headers: {
      'Ocp-Apim-Subscription-Key': BING_NEWS_API_KEY
    },
    active: !!BING_NEWS_API_KEY,
    reliability: 'high'
  },
  {
    name: 'Newscatcher',
    url: 'https://api.newscatcherapi.com/v2/search',
    params: {
      q: '', // Query will be set dynamically
      lang: 'en',
      sort_by: 'relevancy',
      page_size: 100
    },
    headers: {
      'x-api-key': NEWSCATCHER_API_KEY
    },
    active: !!NEWSCATCHER_API_KEY,
    reliability: 'medium'
  }
];

// Fallback simulated datasets (used when APIs fail or for testing)
const simulatedDatasets = [
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

// Function to extract countries from text
function extractCountries(text) {
  // A simple list of major trading countries for detection
  const countries = [
    'United States', 'US', 'USA', 'America', 
    'China', 'Chinese', 
    'India', 'Indian',
    'EU', 'European Union', 'Europe',
    'Japan', 'Canada', 'Mexico', 
    'Brazil', 'Russia', 'UK', 'United Kingdom',
    'Germany', 'France', 'Italy', 'Spain',
    'Australia', 'South Korea', 'Taiwan'
  ];
  
  const foundCountries = [];
  const lowerText = text.toLowerCase();
  
  for (const country of countries) {
    if (lowerText.includes(country.toLowerCase())) {
      // Normalize country names
      let normalizedName = country;
      if (['US', 'USA', 'America'].includes(country)) {
        normalizedName = 'United States';
      } else if (['UK'].includes(country)) {
        normalizedName = 'United Kingdom';
      } else if (['EU', 'Europe'].includes(country)) {
        normalizedName = 'European Union';
      }
      
      if (!foundCountries.includes(normalizedName)) {
        foundCountries.push(normalizedName);
      }
    }
  }
  
  return foundCountries;
}

// Function to extract tariff rates from text
function extractTariffRate(text) {
  // Look for patterns like "25% tariff" or "tariff of 10%"
  const rateRegex = /(\d+(?:\.\d+)?\s*%)/i;
  const match = text.match(rateRegex);
  return match ? match[1] : null;
}

// Function to extract dates from text
function extractEffectiveDate(text) {
  // Common date patterns in news articles
  const datePatterns = [
    /(?:effective|starting|beginning|from)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i,
    /(?:effective|starting|beginning|from)\s+(\d{1,2}(?:st|nd|rd|th)?\s+\w+,?\s+\d{4})/i,
    /(?:effective|starting|beginning|from)\s+(\w+\s+\d{4})/i,
    /(next\s+(?:week|month|year))/i,
    /(immediately|forthwith|right away)/i
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// Function to determine restriction type from text
function determineRestrictionType(text) {
  const lowerText = text.toLowerCase();
  
  for (const [type, keywords] of Object.entries(RESTRICTION_TYPES)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return type;
      }
    }
  }
  
  return 'RESTRICTION'; // Default
}

// Function to extract product category from text
function extractProduct(text) {
  const lowerText = text.toLowerCase();
  
  for (const product of PRODUCT_CATEGORIES) {
    if (lowerText.includes(product.toLowerCase())) {
      return product;
    }
  }
  
  return null; // No recognized product
}

// Assess confidence level based on source reliability and content
function assessConfidence(article, sourceReliability) {
  let confidenceScore = 0;
  
  // Base confidence on source reliability
  switch (sourceReliability) {
    case 'very high':
      confidenceScore += 50;
      break;
    case 'high':
      confidenceScore += 40;
      break;
    case 'medium':
      confidenceScore += 30;
      break;
    default:
      confidenceScore += 20;
  }
  
  // Check for specific details that increase confidence
  const text = article.title + ' ' + (article.description || '');
  
  if (extractTariffRate(text)) confidenceScore += 15;
  if (extractEffectiveDate(text)) confidenceScore += 10;
  if (extractCountries(text).length > 0) confidenceScore += 10;
  if (extractProduct(text)) confidenceScore += 10;
  
  // Cap at 100
  return Math.min(confidenceScore, 100);
}

// Function to transform a news article into a compliance alert
function transformToComplianceAlert(article, sourceReliability = 'medium') {
  const textToAnalyze = article.title + ' ' + (article.description || '') + ' ' + (article.content || '');
  
  const product = extractProduct(textToAnalyze);
  if (!product) {
    return null; // Skip if we can't identify a relevant product
  }
  
  const restrictionType = determineRestrictionType(textToAnalyze);
  const countries = extractCountries(textToAnalyze);
  
  // Try to determine which countries are source vs. destination
  let fromCountries = [];
  let toCountries = [];
  
  const lowerText = textToAnalyze.toLowerCase();
  for (const country of countries) {
    // Very simplified logic - in reality would need more sophisticated NLP
    if (lowerText.includes(`from ${country.toLowerCase()}`) || 
        lowerText.includes(`${country.toLowerCase()} export`)) {
      fromCountries.push(country);
    } 
    else if (lowerText.includes(`to ${country.toLowerCase()}`) || 
             lowerText.includes(`${country.toLowerCase()} import`)) {
      toCountries.push(country);
    }
    else {
      // Can't determine direction, add to fromCountries as default
      fromCountries.push(country);
    }
  }
  
  // Remove duplicates between from and to countries
  fromCountries = fromCountries.filter(c => !toCountries.includes(c));
  
  const tariffRate = extractTariffRate(textToAnalyze);
  const effectiveDate = extractEffectiveDate(textToAnalyze);
  const confidence = assessConfidence(article, sourceReliability);
  
  // Skip low confidence alerts
  if (confidence < 70) {
    return null;
  }
  
  // Generate a summary
  let summary = `New ${restrictionType.toLowerCase()} `;
  if (tariffRate) {
    summary += `(${tariffRate}) `;
  }
  summary += `affecting ${fromCountries.length > 0 ? 'exports' : 'imports'} of ${product}`;
  
  return {
    alertId: `CA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    summary,
    product,
    restrictionType: restrictionType.toLowerCase(),
    fromCountries,
    toCountries,
    tariffRate,
    effectiveDate,
    datePublished: article.publishedAt || new Date().toISOString(),
    source: article.source?.name || 'News API',
    title: article.title,
    link: article.url || article.link,
    confidence
  };
}

// Enhanced function to fetch real compliance alerts from news APIs
async function fetchComplianceAlerts() {
  console.log(`[${new Date().toISOString()}] Fetching compliance alerts from sources...`);
  
  const allAlerts = [];
  let apiSuccessCount = 0;
  
  // Build queries combining trade keywords and product categories
  const queries = [];
  for (const keyword of TRADE_KEYWORDS) {
    for (const product of PRODUCT_CATEGORIES) {
      queries.push(`${keyword} ${product}`);
    }
  }
  
  // Limit to a reasonable number of queries
  const selectedQueries = queries.slice(0, 5);
  
  // Try each activated news API
  for (const api of NEWS_APIS.filter(api => api.active)) {
    try {
      console.log(`Fetching from ${api.name}...`);
      
      // Run a subset of queries to avoid rate limits
      for (const query of selectedQueries) {
        try {
          // Deep clone the params object to avoid modifying the original
          const params = JSON.parse(JSON.stringify(api.params));
          params.q = query;
          
          const response = await axios({
            method: 'GET',
            url: api.url,
            params,
            headers: api.headers || {},
            timeout: 10000 // 10 second timeout
          });
          
          // Handle different API response formats
          let articles = [];
          if (response.data.articles) {
            // NewsAPI format
            articles = response.data.articles;
          } else if (response.data.results) {
            // NewsData.io format
            articles = response.data.results;
          } else if (response.data.news) {
            // Some APIs use 'news'
            articles = response.data.news;
          } else if (response.data.value) {
            // Bing News format
            articles = response.data.value;
          } else if (Array.isArray(response.data)) {
            // Direct array format
            articles = response.data;
          }
          
          console.log(`Found ${articles.length} articles from ${api.name} for query "${query}"`);
          
          // Transform each article to a compliance alert if relevant
          for (const article of articles) {
            const alert = transformToComplianceAlert(article, api.reliability);
            if (alert) {
              allAlerts.push(alert);
            }
          }
          
          apiSuccessCount++;
          
          // Simple rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`Error with ${api.name} for query "${query}":`, error.message);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch from ${api.name}:`, error.message);
    }
  }
  
  // If no API succeeded, use simulated data
  if (apiSuccessCount === 0 || allAlerts.length === 0) {
    console.log('No successful API calls or no alerts found, using simulated data...');
    
    // Select a random dataset with some randomization
    const dataset = simulatedDatasets[Math.floor(Math.random() * simulatedDatasets.length)];
    
    // Add some randomization to make it slightly different each time
    const randomizedAlerts = dataset.complianceAlerts.map(alert => ({
      ...alert,
      // Generate a new ID to simulate new data sometimes
      alertId: Math.random() > 0.7 ? `CA-${Date.now()}-${Math.floor(Math.random() * 1000)}` : alert.alertId,
      datePublished: new Date().toISOString()
    }));
    
    // Randomly choose which alerts to include (simulating different results)
    const includedAlerts = randomizedAlerts.filter(() => Math.random() > 0.3);
    
    return {
      lastChecked: new Date().toISOString(),
      alertCount: includedAlerts.length,
      complianceAlerts: includedAlerts,
      dataSource: 'simulated'
    };
  }
  
  // Remove duplicate alerts (simplified - in production would use more sophisticated deduplication)
  const uniqueAlerts = [];
  const seenTitles = new Set();
  
  for (const alert of allAlerts) {
    const titleKey = alert.title.toLowerCase().slice(0, 50);
    if (!seenTitles.has(titleKey)) {
      seenTitles.add(titleKey);
      uniqueAlerts.push(alert);
    }
  }
  
  console.log(`Found ${uniqueAlerts.length} unique compliance alerts from APIs`);
  
  return {
    lastChecked: new Date().toISOString(),
    alertCount: uniqueAlerts.length,
    complianceAlerts: uniqueAlerts,
    dataSource: 'live_api'
  };
}

// Send alerts to your friend's Next.js API
async function sendAlertsToNextJs(alerts) {
  // Get the API endpoint from environment variable or from configuration
  const nextJsApiUrl = process.env.NEXTJS_API_URL;
  const apiKey = process.env.NEXTJS_API_KEY || 'compliance-alerts-shared-key';
  
  // Skip if not configured
  if (!nextJsApiUrl) {
    console.log('Next.js API URL not configured, skipping alert forwarding');
    return { success: false, reason: 'API_NOT_CONFIGURED' };
  }
  
  try {
    console.log(`Sending ${alerts.length} alerts to Next.js API at ${nextJsApiUrl}`);
    
    const payload = {
      lastChecked: new Date().toISOString(),
      alertCount: alerts.length,
      complianceAlerts: alerts
    };
    
    // Make the API request
    const response = await axios.post(
      nextJsApiUrl,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    console.log(`Alert forwarding successful. Response status: ${response.status}`);
    return { 
      success: true, 
      statusCode: response.status,
      data: response.data
    };
  } catch (error) {
    console.error('Failed to send alerts to Next.js API:', error.message);
    return { 
      success: false, 
      error: error.message,
      statusCode: error.response?.status
    };
  }
}

// Process the compliance alerts (main function that runs every 20 minutes)
async function processComplianceAlerts() {
  console.log(`[${new Date().toISOString()}] Running compliance check...`);
  
  try {
    // 1. Fetch the latest alerts
    const alerts = await fetchComplianceAlerts();
    
    // 2. Filter out alerts we've already processed
    const newAlerts = alerts.complianceAlerts.filter(alert => 
      !processedAlertIds.includes(alert.alertId)
    );
    
    console.log(`Found ${newAlerts.length} new alerts out of ${alerts.complianceAlerts.length} total`);
    
    // 3. If no new alerts, just return
    if (newAlerts.length === 0) {
      return { 
        processed: 0, 
        newAlerts: [],
        dataSource: alerts.dataSource
      };
    }
    
    // 4. Process each new alert
    for (const alert of newAlerts) {
      console.log(`Processing alert: ${alert.alertId} - ${alert.product}`);
      
      // Transform to compliance rule format (for internal logging)
      const processedAlert = {
        ...alert,
        processedAt: new Date().toISOString(),
        transformedRule: {
          product_name: alert.product,
          rule_type: mapRestrictionType(alert.restrictionType),
          rule_conditions: {
            from_countries: alert.fromCountries || [],
            to_countries: alert.toCountries || [],
            tariff_rate: alert.tariffRate,
            effective_date: alert.effectiveDate
          },
          description: alert.summary,
          source_link: alert.link,
          is_active: true,
          last_verified: new Date().toISOString()
        }
      };
      
      // Add to logs
      alertsLog.push(processedAlert);
    }
    
    // 5. Forward new alerts to friend's Next.js API if any were found
    let forwardingResult = { success: false, reason: 'NOT_ATTEMPTED' };
    if (newAlerts.length > 0) {
      forwardingResult = await sendAlertsToNextJs(newAlerts);
    }
    
    // 6. Mark all as processed (whether forwarding succeeded or not)
    const newIds = newAlerts.map(alert => alert.alertId);
    processedAlertIds.push(...newIds);
    
    // 7. Return results
    return {
      processed: newAlerts.length,
      newAlerts,
      forwarded: forwardingResult.success,
      forwardingDetails: forwardingResult,
      dataSource: alerts.dataSource
    };
    
  } catch (error) {
    console.error('Error processing compliance alerts:', error);
    return { error: error.message };
  }
}

// Helper function to map restriction types
function mapRestrictionType(type) {
  if (!type) return 'RESTRICTION';
  
  const mapping = {
    'tariff': 'TARIFF',
    'ban/restriction': 'BAN',
    'ban': 'BAN',
    'restriction': 'BAN',
    'quota': 'QUOTA',
    'licensing': 'LICENSE',
    'sanction': 'SANCTION',
    'embargo': 'EMBARGO',
  };
  return mapping[type.toLowerCase()] || 'RESTRICTION';
}

// Schedule task to run every 20 minutes in production
const cronSchedule = process.env.NODE_ENV === 'production' ? '*/20 * * * *' : '*/5 * * * *';
cron.schedule(cronSchedule, processComplianceAlerts);

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    nextScheduledRun: getNextScheduledRun(cronSchedule),
    apis: NEWS_APIS.filter(api => api.active).map(api => api.name)
  });
});

// Helper to calculate next scheduled run
function getNextScheduledRun(cronExpression) {
  const minutes = process.env.NODE_ENV === 'production' ? 20 : 5;
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(Math.ceil(now.getMinutes() / minutes) * minutes);
  next.setSeconds(0);
  return next.toISOString();
}

// API Endpoints
app.get('/run', async (req, res) => {
  try {
    const result = await processComplianceAlerts();
    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test sending specific alerts
app.post('/test-forward', async (req, res) => {
  try {
    const alertIds = req.body.alertIds || [];
    const alertsToForward = alertsLog.filter(alert => alertIds.includes(alert.alertId));
    
    if (alertsToForward.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No matching alerts found to forward'
      });
    }
    
    const result = await sendAlertsToNextJs(alertsToForward);
    
    res.json({
      success: result.success,
      forwardedCount: alertsToForward.length,
      details: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Configure API endpoint
app.post('/config', (req, res) => {
  const { apiUrl, apiKey } = req.body;
  
  if (!apiUrl) {
    return res.status(400).json({ 
      success: false, 
      error: 'API URL is required' 
    });
  }
  
  // Update environment variables (in memory only - would need to be stored permanently in production)
  process.env.NEXTJS_API_URL = apiUrl;
  if (apiKey) {
    process.env.NEXTJS_API_KEY = apiKey;
  }
  
  console.log(`API configuration updated: ${apiUrl}`);
  
  res.json({
    success: true,
    message: 'Configuration updated'
  });
});

// Get current configuration
app.get('/config', (req, res) => {
  res.json({
    apiUrl: process.env.NEXTJS_API_URL || null,
    apiConfigured: !!process.env.NEXTJS_API_URL,
    dataApis: NEWS_APIS.filter(api => api.active).map(api => api.name)
  });
});

// View processed alerts
app.get('/alerts', (req, res) => {
  res.json({
    total: alertsLog.length,
    alerts: alertsLog
  });
});

// View processed alert IDs
app.get('/processed', (req, res) => {
  res.json({
    total: processedAlertIds.length,
    processed: processedAlertIds
  });
});

// View compliance sources
app.get('/sources', (req, res) => {
  res.json({
    apis: NEWS_APIS.filter(api => api.active),
    organizations: TRADE_ORGS
  });
});

// Main dashboard page
app.get('/', (req, res) => {
  const minutes = process.env.NODE_ENV === 'production' ? 20 : 5;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Global Trade Compliance Monitor</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; font-size: 12px; }
        button { padding: 10px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 10px 5px 10px 0; }
        button:hover { background: #45a049; }
        .container { margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 5px; }
        h1 { color: #2c3e50; }
        h2 { margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 10px; color: #2c3e50; }
        input[type="text"] { padding: 8px; width: 300px; margin-right: 10px; }
        .status-good { color: green; font-weight: bold; }
        .status-bad { color: red; font-weight: bold; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #e0e0e0; margin-right: 5px; }
        .badge-api { background: #c8e6c9; color: #2e7d32; }
        .badge-source { background: #bbdefb; color: #1565c0; }
        .data-source { padding: 3px 8px; border-radius: 5px; font-size: 12px; font-weight: bold; }
        .data-source-live { background: #c8e6c9; color: #2e7d32; }
        .data-source-simulated { background: #ffecb3; color: #ff8f00; }
      </style>
    </head>
    <body>
      <h1>Global Trade Compliance Monitor</h1>
      <p>This service monitors global news sources for changes in trade compliance rules including tariffs, restrictions, bans, and other regulatory changes.</p>
      <p>Service is running and checking for alerts every ${minutes} minutes.</p>
      
      <div class="container">
        <h3>Status</h3>
        <p>Next scheduled check: <span id="nextCheck">Loading...</span></p>
        <p>Next.js API Status: <span id="apiStatus" class="status-bad">Not Configured</span></p>
        <p>Data Sources:</p>
        <div id="dataSources">Loading...</div>
      </div>
      
      <div class="container">
        <h2>Configure Next.js API</h2>
        <p>Enter your friend's Next.js API endpoint to receive the compliance alerts:</p>
        <input type="text" id="apiUrl" placeholder="https://your-friends-nextjs-app.com/api/research" />
        <input type="text" id="apiKey" placeholder="API Key (optional)" />
        <button onclick="saveConfig()">Save Configuration</button>
        <div id="config-result"></div>
      </div>
      
      <div class="container">
        <h2>Process Alerts</h2>
        <button onclick="runProcess()">Run Compliance Check Now</button>
        <div id="process-result"></div>
      </div>
      
      <div class="container">
        <h2>Test Forwarding to Next.js</h2>
        <p>Send the most recent alerts to your friend's Next.js API:</p>
        <button onclick="testForward()">Test Alert Forwarding</button>
        <div id="forward-result"></div>
      </div>
      
      <div class="container">
        <h2>View Compliance Sources</h2>
        <button onclick="viewSources()">Show Data Sources</button>
        <div id="sources-result"></div>
      </div>
      
      <div class="container">
        <h2>View Alert History</h2>
        <button onclick="viewAlertLogs()">Show Processed Alerts</button>
        <div id="logs-result"></div>
      </div>
      
      <script>
        // Update service status
        function updateStatus() {
          fetch('/health')
            .then(response => response.json())
            .then(data => {
              document.getElementById('nextCheck').textContent = new Date(data.nextScheduledRun).toLocaleString();
              
              // Display active APIs
              if (data.apis && data.apis.length > 0) {
                const apiHtml = data.apis.map(api => 
                  '<span class="badge badge-api">' + api + '</span>'
                ).join(' ');
                document.getElementById('dataSources').innerHTML = apiHtml;
              }
              
              // Check API configuration
              fetch('/config')
                .then(response => response.json())
                .then(configData => {
                  if (configData.apiConfigured) {
                    document.getElementById('apiStatus').textContent = 'Connected';
                    document.getElementById('apiStatus').className = 'status-good';
                    document.getElementById('apiUrl').value = configData.apiUrl;
                  }
                  
                  // Display active news APIs
                  if (configData.dataApis && configData.dataApis.length > 0) {
                    const apiHtml = configData.dataApis.map(api => 
                      '<span class="badge badge-api">' + api + '</span>'
                    ).join(' ');
                    document.getElementById('dataSources').innerHTML = apiHtml;
                  } else {
                    document.getElementById('dataSources').innerHTML = 
                      '<span class="badge badge-source">Using simulated data</span>';
                  }
                })
                .catch(() => {
                  document.getElementById('dataSources').innerHTML = 
                    '<span class="badge badge-source">Using simulated data</span>';
                });
            });
        }
        
        updateStatus();
        setInterval(updateStatus, 30000); // Update every 30 seconds
        
        async function saveConfig() {
          document.getElementById('config-result').innerHTML = 'Saving...';
          const apiUrl = document.getElementById('apiUrl').value;
          const apiKey = document.getElementById('apiKey').value;
          
          try {
            const response = await fetch('/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiUrl, apiKey })
            });
            const data = await response.json();
            
            if (data.success) {
              document.getElementById('config-result').innerHTML = '<p style="color:green">Configuration saved successfully!</p>';
              document.getElementById('apiStatus').textContent = 'Connected';
              document.getElementById('apiStatus').className = 'status-good';
            } else {
              document.getElementById('config-result').innerHTML = '<p style="color:red">Error: ' + data.error + '</p>';
            }
          } catch (error) {
            document.getElementById('config-result').innerHTML = '<p style="color:red">Error: ' + error.message + '</p>';
          }
        }
        
        async function runProcess() {
          document.getElementById('process-result').innerHTML = '<p>Processing... this may take a minute</p>';
          try {
            const response = await fetch('/run');
            const data = await response.json();
            
            let dataSourceBadge = '';
            if (data.dataSource === 'live_api') {
              dataSourceBadge = '<span class="data-source data-source-live">Live API Data</span>';
            } else {
              dataSourceBadge = '<span class="data-source data-source-simulated">Simulated Data</span>';
            }
            
            document.getElementById('process-result').innerHTML = '<p>' + dataSourceBadge + ' Processed ' + 
              data.processed + ' new alerts</p><pre>' + JSON.stringify(data, null, 2) + '</pre>';
            
            updateStatus();
          } catch (error) {
            document.getElementById('process-result').innerHTML = '<p style="color:red">Error: ' + error.message + '</p>';
          }
        }
        
        async function testForward() {
          document.getElementById('forward-result').innerHTML = 'Loading alerts...';
          try {
            // First get the alerts
            const response = await fetch('/alerts');
            const data = await response.json();
            
            if (!data.alerts || data.alerts.length === 0) {
              document.getElementById('forward-result').innerHTML = '<p>No alerts available to forward. Run a check first.</p>';
              return;
            }
            
            // Pick the first 2 alerts to test forwarding
            const alertsToForward = data.alerts.slice(0, 2);
            const alertIds = alertsToForward.map(a => a.alertId);
            
            document.getElementById('forward-result').innerHTML = 'Forwarding ' + alertIds.length + ' alerts...';
            
            // Try to forward them
            const forwardResponse = await fetch('/test-forward', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ alertIds })
            });
            
            const forwardData = await forwardResponse.json();
            document.getElementById('forward-result').innerHTML = '<pre>' + JSON.stringify(forwardData, null, 2) + '</pre>';
            
          } catch (error) {
            document.getElementById('forward-result').innerHTML = '<p style="color:red">Error: ' + error.message + '</p>';
          }
        }
        
        async function viewSources() {
          document.getElementById('sources-result').innerHTML = 'Loading...';
          try {
            const response = await fetch('/sources');
            const data = await response.json();
            document.getElementById('sources-result').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (error) {
            document.getElementById('sources-result').innerHTML = '<p style="color:red">Error: ' + error.message + '</p>';
          }
        }
        
        async function viewAlertLogs() {
          document.getElementById('logs-result').innerHTML = 'Loading...';
          try {
            const response = await fetch('/alerts');
            const data = await response.json();
            document.getElementById('logs-result').innerHTML = 
              '<p>Total alerts processed: ' + data.total + '</p>' +
              '<pre>' + JSON.stringify(data.alerts, null, 2) + '</pre>';
          } catch (error) {
            document.getElementById('logs-result').innerHTML = '<p style="color:red">Error: ' + error.message + '</p>';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Scheduled to check for compliance alerts ${process.env.NODE_ENV === 'production' ? 'every 20 minutes' : 'every 5 minutes'}`);
  
  // Run once on startup after a short delay
  setTimeout(processComplianceAlerts, 5000);
});







// const cron = require('node-cron');
// const { processComplianceAlerts } = require('./compliance-processor');
// const { createServer } = require('./server');
// require('dotenv').config();

// console.log('Compliance Monitor Service starting...');
// console.log('Check interval: Every 20 minutes');

// // Function to run the compliance check
// async function runComplianceCheck() {
//   console.log(`[${new Date().toISOString()}] Running compliance check...`);
//   try {
//     const result = await processComplianceAlerts();
//     console.log(`[${new Date().toISOString()}] Processed ${result.processed} alerts`);
//   } catch (error) {
//     console.error(`[${new Date().toISOString()}] Error in compliance check:`, error.message);
//   }
// }

// // Schedule the task to run every 20 minutes
// cron.schedule('*/20 * * * *', runComplianceCheck);

// // Also run once on startup
// runComplianceCheck();

// // Start the web server (required for Render)
// const server = createServer();
// const PORT = process.env.PORT || 3000;
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });


