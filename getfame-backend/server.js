/**
 * GetFame Backend Server
 * Main entry point for the API
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import our modules
const japApi = require('./lib/jap-api');
const servicesManager = require('./lib/services');
const ordersManager = require('./lib/orders');
const paymentHandler = require('./lib/payments');

const app = express();
const PORT = process.env.PORT || 3000;

// ===================
// Middleware
// ===================

// Security headers
app.use(helmet());

// CORS - allow your frontend
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Parse JSON (except for webhooks which need raw body)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhook/stripe') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

// ===================
// API Routes
// ===================

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Get JAP balance (admin only - protect this in production!)
 */
app.get('/api/admin/balance', async (req, res) => {
    try {
        // TODO: Add authentication for admin routes
        const balance = await japApi.getBalance();
        res.json(balance);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===================
// Services Routes
// ===================

/**
 * Get all services
 */
app.get('/api/services', async (req, res) => {
    try {
        const services = await servicesManager.getServices();
        res.json({ services });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

/**
 * Get services by platform
 */
app.get('/api/services/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const services = await servicesManager.getServicesByPlatform(platform);
        res.json({ services });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

/**
 * Get services grouped by platform
 */
app.get('/api/services-grouped', async (req, res) => {
    try {
        const grouped = await servicesManager.getGroupedServices();
        res.json({ services: grouped });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

/**
 * Get single service details
 */
app.get('/api/service/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const service = await servicesManager.getServiceById(id);
        
        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }
        
        res.json({ service });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service' });
    }
});

/**
 * Calculate order price
 */
app.post('/api/calculate', async (req, res) => {
    try {
        const { serviceId, quantity } = req.body;
        
        const service = await servicesManager.getServiceById(serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }

        if (quantity < service.min || quantity > service.max) {
            return res.status(400).json({ 
                error: `Quantity must be between ${service.min} and ${service.max}` 
            });
        }

        const total = servicesManager.calculateTotal(service.rate, quantity);

        res.json({
            service: service.name,
            quantity,
            rate: service.rate,
            total,
            currency: 'USD'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to calculate price' });
    }
});

// ===================
// Order Routes
// ===================

/**
 * Create order (with payment)
 * Returns Stripe checkout URL
 */
app.post('/api/order', async (req, res) => {
    try {
        const { serviceId, link, quantity, email } = req.body;

        // Validate required fields
        if (!serviceId || !link || !quantity) {
            return res.status(400).json({ 
                error: 'Missing required fields: serviceId, link, quantity' 
            });
        }

        // Create Stripe checkout session
        const checkout = await paymentHandler.createCheckoutSession({
            serviceId,
            link,
            quantity,
            email,
            successUrl: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${process.env.FRONTEND_URL}/order`
        });

        res.json({
            success: true,
            checkoutUrl: checkout.url,
            sessionId: checkout.sessionId
        });
    } catch (error) {
        console.error('Order error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * Direct order (without payment - for testing or manual orders)
 * Protect this route in production!
 */
app.post('/api/order/direct', async (req, res) => {
    try {
        const { serviceId, link, quantity, email, apiKey } = req.body;

        // Simple API key check for direct orders
        // In production, use proper authentication
        if (apiKey !== process.env.ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const order = await ordersManager.createOrder({
            serviceId,
            link,
            quantity,
            email
        });

        res.json(order);
    } catch (error) {
        console.error('Direct order error:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * Get order status
 */
app.get('/api/order/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const status = await ordersManager.getOrderStatus(id);
        res.json(status);
    } catch (error) {
        // Don't expose internal errors to users
        res.status(404).json({ error: 'Order not found or invalid ID' });
    }
});

/**
 * Request refill for an order
 */
app.post('/api/order/:id/refill', async (req, res) => {
    try {
        const { id } = req.params;
        const refill = await ordersManager.requestRefill(id);
        res.json(refill);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===================
// Payment Webhooks
// ===================

/**
 * Stripe webhook handler
 */
app.post('/api/webhook/stripe', 
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        const signature = req.headers['stripe-signature'];

        try {
            const result = await paymentHandler.handleWebhook(req.body, signature);
            res.json(result);
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(400).json({ error: error.message });
        }
    }
);

/**
 * Verify payment session (for success page)
 */
app.get('/api/verify-payment/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await paymentHandler.verifySession(sessionId);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===================
// Error Handling
// ===================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ===================
// Start Server
// ===================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║         GetFame Backend Server            ║
╠═══════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}            ║
║  📡 API: http://localhost:${PORT}/api        ║
║  🔗 JAP API: ${process.env.JAP_API_URL ? 'Connected' : 'Not configured'}             ║
║  💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Connected' : 'Not configured'}               ║
╚═══════════════════════════════════════════╝
    `);
});

module.exports = app;
