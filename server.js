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

// Configuration des proxies vers les microservices
const proxyOptions = {
  changeOrigin: true,
  logger: console,
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error occurred' });
  }
};

// Proxy pour le service de classification
app.use('/api/classify', createProxyMiddleware({
  target: 'http://classifier.railway.internal',
  pathRewrite: {
    '^/api/classify': ''
  },
  ...proxyOptions
}));

// Proxy pour le service de nettoyage
app.use('/api/clean', createProxyMiddleware({
  target: 'http://parser_cleaner.railway.internal',
  pathRewrite: {
    '^/api/clean': ''
  },
  ...proxyOptions
}));

// Proxy pour le service de génération
app.use('/api/generate', createProxyMiddleware({
  target: 'http://response_generator.railway.internal',
  pathRewrite: {
    '^/api/generate': ''
  },
  ...proxyOptions
}));

// Proxy pour le service collecteur (catch-all pour /api)
app.use('/api', createProxyMiddleware({
  target: 'http://lemlist-collector.railway.internal',
  pathRewrite: {
    '^/api': ''
  },
  ...proxyOptions
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
      collector: 'http://lemlist-collector.railway.internal'
    }
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
