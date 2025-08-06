import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Middleware pour parser JSON
app.use(express.json());

// Middleware de logging pour toutes les requêtes
app.use((req, res, next) => {
  console.log(`📥 Incoming request: ${req.method} ${req.url}`);
  console.log(`🌐 Host: ${req.headers.host}`);
  console.log(`🔗 User-Agent: ${req.headers['user-agent']}`);
  next();
});

// Configuration des proxies vers les microservices
const createProxyConfig = (serviceName, target) => ({
  target,
  changeOrigin: true,
  logger: console,
  timeout: 30000,
  onError: (err, req, res) => {
    console.error(`=== PROXY ERROR for ${serviceName} ===`);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    console.error('Request URL:', req.url);
    console.error('Target:', target);
    console.error('Method:', req.method);
    console.error('=========================');
    
    if (err.code === 'ECONNREFUSED') {
      res.status(503).json({ 
        error: 'Service Unavailable',
        message: `${serviceName} service is not responding`,
        service: serviceName,
        target: target,
        timestamp: new Date().toISOString()
      });
    } else if (err.code === 'ETIMEDOUT') {
      res.status(504).json({ 
        error: 'Gateway Timeout',
        message: `${serviceName} service took too long to respond`,
        service: serviceName
      });
    } else {
      res.status(500).json({ 
        error: 'Proxy Error',
        message: err.message,
        code: err.code,
        service: serviceName
      });
    }
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`🔄 [${serviceName}] Proxying ${req.method} ${req.url} to ${target}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ [${serviceName}] Response ${proxyRes.statusCode} for ${req.method} ${req.url}`);
  }
});

// Configuration des URLs des services via variables d'environnement
const SERVICE_URLS = {
  classifier: process.env.CLASSIFIER_URL || 'http://classifier.railway.internal:8000',
  parsercleaner: process.env.PARSER_CLEANER_URL || 'http://parser_cleaner.railway.internal:8000',
  responsegenerator: process.env.RESPONSE_GENERATOR_URL || 'http://response_generator.railway.internal:8000',
  collector: process.env.COLLECTOR_URL || 'http://lemlist-collector.railway.internal:8000'
};

console.log('🔧 Service URLs configured:', SERVICE_URLS);

// Proxy pour le service de classification
app.use('/api/classify', createProxyMiddleware({
  pathRewrite: {
    '^/api/classify': ''
  },
  ...createProxyConfig('classifier', SERVICE_URLS.classifier)
}));

// Proxy pour le service de nettoyage
app.use('/api/clean', createProxyMiddleware({
  pathRewrite: {
    '^/api/clean': ''
  },
  ...createProxyConfig('parser-cleaner', SERVICE_URLS.parsercleaner)
}));

// Proxy pour le service de génération
app.use('/api/generate', createProxyMiddleware({
  pathRewrite: {
    '^/api/generate': ''
  },
  ...createProxyConfig('response-generator', SERVICE_URLS.responsegenerator)
}));

// Proxy pour le service collecteur - routes spécifiques
app.use('/api/collect', createProxyMiddleware({
  pathRewrite: {
    '^/api/collect': '/collect'
  },
  ...createProxyConfig('collector-collect', SERVICE_URLS.collector)
}));

app.use('/api/companies', createProxyMiddleware({
  pathRewrite: {
    '^/api/companies': '/companies'
  },
  ...createProxyConfig('collector-companies', SERVICE_URLS.collector)
}));

// IMPORTANT: Cette route catch-all doit être EN DERNIER
// Proxy pour le service collecteur (catch-all pour /api) - UNIQUEMENT pour les routes non spécifiées
app.use('/api', createProxyMiddleware({
  pathRewrite: {
    '^/api': ''
  },
  ...createProxyConfig('collector-catchall', SERVICE_URLS.collector)
}));

// Route de santé
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    services: {
      classifier: 'http://classifier.railway.internal',
      parsercleaner: 'http://parser_cleaner.railway.internal',
      responsegenerator: 'http://response_generator.railway.internal',
      collector: 'lemlist-collector.railway.internal'
    }
  });
});

// Route de diagnostic pour tester la connectivité aux services
app.get('/diagnostic', async (req, res) => {
  const servicesWithPort = {
    'collector-8000': 'http://lemlist-collector.railway.internal:8000',
    'collector-3000': 'http://lemlist-collector.railway.internal:3000',
    'collector-no-port': 'http://lemlist-collector.railway.internal'
  };
  
  const results = {};
  
  for (const [name, url] of Object.entries(servicesWithPort)) {
    const testResults = {};
    
    // Test route /status
    try {
      const response = await fetch(url + '/status', { 
        method: 'GET',
        timeout: 5000 
      });
      testResults.status = {
        status: 'reachable',
        statusCode: response.status,
        url: url + '/status'
      };
    } catch (error) {
      testResults.status = {
        status: 'unreachable',
        error: error.message,
        code: error.code,
        url: url + '/status'
      };
    }
    
    results[name] = testResults;
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    serviceTests: results,
    note: "Testing different ports for Railway internal networking"
  });
});

// Middleware pour gérer les routes non trouvées
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend proxy running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
});
