/**
* GetFame Backend Server v3
 * - Stripe payments (cards)
 * - NOWPayments (crypto)
 * - Curated services
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getServices, getServicesByPlatform, getServiceById } = require('./lib/services');
const { createOrder, getOrder, updateOrderStatus, processOrder } = require('./lib/orders');
const { createStripeCheckout, verifyStripeWebhook } = require('./lib/payments');
const { createCryptoPayment, verifyIPNSignature } = require('./lib/nowpayments');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

// CORS - Allow frontend
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'https://getfame.net',
            'http://getfame.net',
            'https://www.getfame.net',
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            process.env.FRONTEND_URL
        ].filter(Boolean);
        
        if (allowedOrigins.includes(origin) || process.env.FRONTEND_URL === '*') {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(null, true); // Allow anyway for now
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Parse JSON (except for webhooks which need raw body)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhooks/stripe') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'GetFame API',
        version: '3.0.1'
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stripe: !!process.env.STRIPE_SECRET_KEY,
        nowpayments: !!process.env.NOWPAYMENTS_API_KEY,
        jap: !!process.env.JAP_API_KEY
    });
});

// =====================================================
// SERVICES
// =====================================================

// Get all services
app.get('/api/services', async (req, res) => {
    try {
        const services = await getServices();
        res.json(services);
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

// Get services by platform
app.get('/api/services/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const services = await getServicesByPlatform(platform);
        res.json(services);
    } catch (error) {
        console.error('Error fetching platform services:', error);
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

// =====================================================
// ORDERS - STRIPE (Card)
// =====================================================

app.post('/api/order', async (req, res) => {
    try {
        const { serviceId, link, quantity, email } = req.body;

        console.log('Order request:', { serviceId, link, quantity, email });

        // Validate
        if (!serviceId || !link || !quantity || !email) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get service details
        const service = await getServiceById(serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }

        // Create order
        const order = createOrder({
            serviceId,
            serviceName: service.name,
            link,
            quantity,
            email,
            pricePerK: service.rate,
            paymentMethod: 'stripe'
        });

        // Create Stripe checkout
        const checkout = await createStripeCheckout({
            orderId: order.id,
            amount: order.total,
            serviceName: service.name,
            quantity,
            email,
            successUrl: `${process.env.FRONTEND_URL || 'https://getfame.net'}/success/?order=${order.id}`,
            cancelUrl: `${process.env.FRONTEND_URL || 'https://getfame.net'}/order/`
        });

        res.json({
            orderId: order.id,
            checkoutUrl: checkout.url
        });

    } catch (error) {
        console.error('Order error:', error);
        res.status(500).json({ error: error.message || 'Failed to create order' });
    }
});

// =====================================================
// ORDERS - CRYPTO (NOWPayments)
// =====================================================

app.post('/api/order/crypto', async (req, res) => {
    try {
        const { serviceId, link, quantity, email } = req.body;

        console.log('Crypto order request:', { serviceId, link, quantity, email });

        // Validate
        if (!serviceId || !link || !quantity || !email) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get service details
        const service = await getServiceById(serviceId);
        console.log('Service found:', service);
        
        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }

        // Create order
        const order = createOrder({
            serviceId,
            serviceName: service.name,
            link,
            quantity,
            email,
            pricePerK: service.rate,
            paymentMethod: 'crypto'
        });

        console.log('Order created:', order);

        // Create NOWPayments invoice
        const payment = await createCryptoPayment({
            amount: order.total,
            orderId: order.id,
            email,
            description: `${quantity} ${service.name}`
        });

        console.log('Payment created:', payment);

        res.json({
            orderId: order.id,
            checkoutUrl: payment.invoiceUrl,
            invoiceId: payment.invoiceId
        });

    } catch (error) {
        console.error('Crypto order error:', error);
        res.status(500).json({ error: error.message || 'Failed to create crypto payment' });
    }
});

// =====================================================
// ORDER STATUS
// =====================================================

app.get('/api/order/:orderId', (req, res) => {
    try {
        const order = getOrder(req.params.orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({
            id: order.id,
            status: order.status,
            service: order.serviceName,
            quantity: order.quantity,
            total: order.total,
            createdAt: order.createdAt
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get order' });
    }
});

// =====================================================
// WEBHOOKS
// =====================================================

// Stripe Webhook
app.post('/api/webhooks/stripe', 
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        try {
            const sig = req.headers['stripe-signature'];
            const event = verifyStripeWebhook(req.body, sig);

            if (event.type === 'checkout.session.completed') {
                const session = event.data.object;
                const orderId = session.metadata?.orderId;

                if (orderId) {
                    console.log(`✅ Payment received for order ${orderId}`);
                    updateOrderStatus(orderId, 'paid');
                    
                    // Process order (send to JAP)
                    try {
                        await processOrder(orderId);
                        console.log(`✅ Order ${orderId} submitted to JAP`);
                    } catch (err) {
                        console.error(`❌ Failed to process order ${orderId}:`, err);
                    }
                }
            }

            res.json({ received: true });
        } catch (error) {
            console.error('Stripe webhook error:', error);
            res.status(400).json({ error: error.message });
        }
    }
);

// NOWPayments Webhook (IPN)
app.post('/api/webhooks/nowpayments', async (req, res) => {
    try {
        const signature = req.headers['x-nowpayments-sig'];
        
        // Verify signature if IPN secret is configured
        if (process.env.NOWPAYMENTS_IPN_SECRET && signature) {
            const isValid = verifyIPNSignature(req.body, signature);
            if (!isValid) {
                return res.status(400).json({ error: 'Invalid signature' });
            }
        }

        const { payment_status, order_id } = req.body;

        console.log(`NOWPayments IPN: Order ${order_id} - Status: ${payment_status}`);

        // Check if payment is complete
        if (payment_status === 'finished' || payment_status === 'confirmed') {
            console.log(`✅ Crypto payment received for order ${order_id}`);
            updateOrderStatus(order_id, 'paid');

            // Process order (send to JAP)
            try {
                await processOrder(order_id);
                console.log(`✅ Order ${order_id} submitted to JAP`);
            } catch (err) {
                console.error(`❌ Failed to process order ${order_id}:`, err);
            }
        } else if (payment_status === 'partially_paid') {
            updateOrderStatus(order_id, 'partial');
        } else if (payment_status === 'failed' || payment_status === 'expired') {
            updateOrderStatus(order_id, 'failed');
        }

        res.json({ received: true });
    } catch (error) {
        console.error('NOWPayments webhook error:', error);
        res.status(400).json({ error: error.message });
    }
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║       GetFame Backend Server v3.0.1       ║');
    console.log('╠═══════════════════════════════════════════╣');
    console.log(`║ 🚀 Server running on port ${PORT}             ║`);
    console.log(`║ 📡 API: http://localhost:${PORT}/api          ║`);
    console.log(`║ 🔗 JAP API: ${process.env.JAP_API_KEY ? 'Connected' : 'Not configured'}             ║`);
    console.log(`║ 💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Connected' : 'Not configured'}              ║`);
    console.log(`║ ₿  Crypto: ${process.env.NOWPAYMENTS_API_KEY ? 'Connected' : 'Not configured'}              ║`);
    console.log(`║ 🌐 Frontend: ${process.env.FRONTEND_URL || 'Not set'}        ║`);
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');
});

module.exports = app;

