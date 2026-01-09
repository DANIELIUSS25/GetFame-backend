/**
 * GetFame Backend Server v3
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

// CORS
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.options('*', cors());

// JSON parsing (except Stripe webhook)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhooks/stripe') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

// Health
app.get('/', (req, res) => res.json({ status: 'ok', service: 'GetFame API', version: '3.0.2' }));
app.get('/api/health', (req, res) => res.json({ 
    status: 'healthy', 
    stripe: !!process.env.STRIPE_SECRET_KEY,
    nowpayments: !!process.env.NOWPAYMENTS_API_KEY,
    jap: !!process.env.JAP_API_KEY
}));

// Services
app.get('/api/services', async (req, res) => {
    try {
        res.json(await getServices());
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

app.get('/api/services/:platform', async (req, res) => {
    try {
        res.json(await getServicesByPlatform(req.params.platform));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

// Order - Stripe
app.post('/api/order', async (req, res) => {
    try {
        const { serviceId, link, quantity, email } = req.body;
        if (!serviceId || !link || !quantity || !email) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const service = await getServiceById(serviceId);
        if (!service) return res.status(404).json({ error: 'Service not found' });

        const order = createOrder({
            serviceId, serviceName: service.name, link, quantity, email,
            pricePerK: service.rate, paymentMethod: 'stripe'
        });

        const checkout = await createStripeCheckout({
            orderId: order.id, amount: order.total, serviceName: service.name,
            quantity, email,
            successUrl: `${process.env.FRONTEND_URL || 'https://getfame.net'}/success/?order=${order.id}`,
            cancelUrl: `${process.env.FRONTEND_URL || 'https://getfame.net'}/order/`
        });

        res.json({ orderId: order.id, checkoutUrl: checkout.url });
    } catch (error) {
        console.error('Order error:', error);
        res.status(500).json({ error: error.message || 'Failed to create order' });
    }
});

// Order - Crypto
app.post('/api/order/crypto', async (req, res) => {
    try {
        const { serviceId, link, quantity, email } = req.body;
        if (!serviceId || !link || !quantity || !email) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const service = await getServiceById(serviceId);
        if (!service) return res.status(404).json({ error: 'Service not found' });

        const order = createOrder({
            serviceId, serviceName: service.name, link, quantity, email,
            pricePerK: service.rate, paymentMethod: 'crypto'
        });

        const payment = await createCryptoPayment({
            amount: order.total, orderId: order.id, email,
            description: `${quantity} ${service.name}`
        });

        res.json({ orderId: order.id, checkoutUrl: payment.invoiceUrl, invoiceId: payment.invoiceId });
    } catch (error) {
        console.error('Crypto order error:', error);
        res.status(500).json({ error: error.message || 'Failed to create crypto payment' });
    }
});

// Order status
app.get('/api/order/:orderId', (req, res) => {
    const order = getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ id: order.id, status: order.status, service: order.serviceName, quantity: order.quantity, total: order.total });
});

// Stripe webhook
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const event = verifyStripeWebhook(req.body, req.headers['stripe-signature']);
        if (event.type === 'checkout.session.completed') {
            const orderId = event.data.object.metadata?.orderId;
            if (orderId) {
                updateOrderStatus(orderId, 'paid');
                try { await processOrder(orderId); } catch (e) { console.error(e); }
            }
        }
        res.json({ received: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// NOWPayments webhook
app.post('/api/webhooks/nowpayments', async (req, res) => {
    try {
        const { payment_status, order_id } = req.body;
        if (payment_status === 'finished' || payment_status === 'confirmed') {
            updateOrderStatus(order_id, 'paid');
            try { await processOrder(order_id); } catch (e) { console.error(e); }
        }
        res.json({ received: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`GetFame Backend v3.0.2 running on port ${PORT}`);
    console.log(`JAP: ${process.env.JAP_API_KEY ? 'OK' : 'Missing'}`);
    console.log(`Stripe: ${process.env.STRIPE_SECRET_KEY ? 'OK' : 'Missing'}`);
    console.log(`NOWPayments: ${process.env.NOWPAYMENTS_API_KEY ? 'OK' : 'Missing'}`);
});
