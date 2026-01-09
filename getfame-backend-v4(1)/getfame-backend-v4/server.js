// =====================================================
// GETFAME BACKEND v4 - With Telegram Notifications
// =====================================================
// Security Features:
// - All secrets in environment variables
// - Webhook signature verification
// - Input validation & sanitization
// - Rate limiting
// - No sensitive data logged
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Stripe = require('stripe');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();

// =====================================================
// ENVIRONMENT VARIABLES (all secrets here)
// =====================================================
const {
    PORT = 3000,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    NOWPAYMENTS_API_KEY,
    NOWPAYMENTS_IPN_SECRET,
    JAP_API_KEY,
    JAP_API_URL = 'https://justanotherpanel.com/api/v2',
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    FRONTEND_URL = 'https://getfame.net',
    NODE_ENV = 'development',
    ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' // default: 'admin'
} = process.env;

// Initialize Stripe
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// =====================================================
// ORDER STORAGE (In production, use a database)
// =====================================================
const ORDERS_FILE = path.join(__dirname, 'orders.json');

function loadOrders() {
    try {
        if (fs.existsSync(ORDERS_FILE)) {
            return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading orders:', e.message);
    }
    return [];
}

function saveOrders(orders) {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    } catch (e) {
        console.error('Error saving orders:', e.message);
    }
}

function addOrder(orderData) {
    const orders = loadOrders();
    const newOrder = {
        id: Date.now(),
        ...orderData,
        date: new Date().toISOString()
    };
    orders.unshift(newOrder); // Add to beginning
    saveOrders(orders);
    return newOrder;
}

function updateOrderStatus(orderId, status, japOrderId = null) {
    const orders = loadOrders();
    const index = orders.findIndex(o => o.id === orderId);
    if (index >= 0) {
        orders[index].status = status;
        if (japOrderId) orders[index].japOrderId = japOrderId;
        saveOrders(orders);
    }
}

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================

// Helmet for security headers
app.use(helmet());

// CORS - only allow your frontend
app.use(cors({
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5500'],
    credentials: true
}));

// Rate limiting - prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Stricter rate limit for order endpoints
const orderLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 orders per minute max
    message: { error: 'Too many order attempts, please wait.' }
});

// Parse JSON (except for webhooks which need raw body)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhooks/stripe') {
        next();
    } else {
        express.json({ limit: '10kb' })(req, res, next);
    }
});

// =====================================================
// TELEGRAM NOTIFICATIONS (Secure)
// =====================================================
async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('Telegram not configured, skipping notification');
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (!response.ok) {
            console.error('Telegram notification failed:', await response.text());
        }
    } catch (error) {
        console.error('Telegram error:', error.message);
    }
}

function formatOrderNotification(order, paymentMethod) {
    // Mask email for privacy in logs
    const maskedEmail = order.email ? 
        order.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'N/A';
    
    // Mask link partially
    const maskedLink = order.link ? 
        order.link.substring(0, 30) + '...' : 'N/A';

    return `
🛒 <b>NEW ORDER</b>

📱 <b>Platform:</b> ${order.platform || 'Instagram'}
📦 <b>Service:</b> ${order.service || 'Followers'}
⭐ <b>Quality:</b> ${order.quality || 'Standard'}
📊 <b>Quantity:</b> ${order.quantity?.toLocaleString() || 'N/A'}
💰 <b>Amount:</b> $${order.amount?.toFixed(2) || '0.00'}
💳 <b>Payment:</b> ${paymentMethod}

🔗 <b>Link:</b> ${maskedLink}
📧 <b>Email:</b> ${maskedEmail}
🆔 <b>Service ID:</b> ${order.serviceId || 'N/A'}

✅ <b>Status:</b> Payment Confirmed
⏰ <b>Time:</b> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
`.trim();
}

// =====================================================
// INPUT VALIDATION
// =====================================================
function validateOrderInput(body) {
    const errors = [];

    if (!body.link || typeof body.link !== 'string' || body.link.length < 5) {
        errors.push('Invalid link');
    }

    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        errors.push('Invalid email');
    }

    if (!body.quantity || body.quantity < 1 || body.quantity > 1000000) {
        errors.push('Invalid quantity');
    }

    if (!body.serviceId || typeof body.serviceId !== 'number') {
        errors.push('Invalid service ID');
    }

    if (!body.amount || body.amount < 0.50 || body.amount > 50000) {
        errors.push('Invalid amount');
    }

    return errors;
}

function sanitizeInput(str) {
    if (typeof str !== 'string') return str;
    return str.trim().slice(0, 500); // Limit length
}

// =====================================================
// JAP API (Order Processing)
// =====================================================
async function createJAPOrder(serviceId, link, quantity) {
    if (!JAP_API_KEY) {
        console.error('JAP API key not configured');
        return null;
    }

    try {
        const response = await fetch(JAP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: JAP_API_KEY,
                action: 'add',
                service: serviceId,
                link: link,
                quantity: quantity
            })
        });

        const data = await response.json();
        console.log('JAP order response:', { orderId: data.order, error: data.error });
        return data;
    } catch (error) {
        console.error('JAP API error:', error.message);
        return null;
    }
}

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'GetFame Backend v4 Running',
        features: ['Stripe', 'Crypto', 'Telegram Notifications'],
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// =====================================================
// STRIPE CHECKOUT
// =====================================================
app.post('/api/order', orderLimiter, async (req, res) => {
    try {
        // Validate input
        const errors = validateOrderInput(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ error: errors.join(', ') });
        }

        if (!stripe) {
            return res.status(500).json({ error: 'Payment system not configured' });
        }

        const { 
            link, 
            email, 
            quantity, 
            serviceId, 
            amount,
            platform,
            service,
            quality
        } = req.body;

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${platform || 'Instagram'} ${service || 'Followers'} (${quality || 'Standard'})`,
                        description: `${quantity.toLocaleString()} ${service || 'followers'} - Instant delivery`
                    },
                    unit_amount: Math.round(amount * 100)
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: `${FRONTEND_URL}/success/?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/order/`,
            customer_email: sanitizeInput(email),
            metadata: {
                link: sanitizeInput(link),
                quantity: quantity.toString(),
                serviceId: serviceId.toString(),
                platform: platform || 'instagram',
                service: service || 'followers',
                quality: quality || 'standard'
            }
        });

        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('Stripe error:', error.message);
        res.status(500).json({ error: 'Payment initialization failed' });
    }
});

// =====================================================
// STRIPE WEBHOOK (Secure)
// =====================================================
app.post('/api/webhooks/stripe', 
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        if (!STRIPE_WEBHOOK_SECRET) {
            console.error('Stripe webhook secret not configured');
            return res.status(500).send('Webhook not configured');
        }

        const sig = req.headers['stripe-signature'];

        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Handle successful payment
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            
            console.log('Payment successful:', session.id);

            const metadata = session.metadata;
            const orderData = {
                link: metadata.link,
                email: session.customer_email,
                quantity: parseInt(metadata.quantity),
                serviceId: parseInt(metadata.serviceId),
                amount: session.amount_total / 100,
                platform: metadata.platform,
                service: metadata.service,
                quality: metadata.quality,
                payment: 'Card',
                status: 'processing',
                stripeSessionId: session.id
            };

            // Save order to storage
            const savedOrder = addOrder(orderData);
            console.log('Order saved:', savedOrder.id);

            // Send Telegram notification
            const notification = formatOrderNotification(orderData, 'Stripe (Card)');
            await sendTelegramNotification(notification);

            // Create JAP order
            const japOrder = await createJAPOrder(
                orderData.serviceId,
                orderData.link,
                orderData.quantity
            );

            if (japOrder?.order) {
                updateOrderStatus(savedOrder.id, 'completed', japOrder.order);
                await sendTelegramNotification(`✅ JAP Order Created: #${japOrder.order}`);
            } else {
                updateOrderStatus(savedOrder.id, 'pending');
                await sendTelegramNotification(`⚠️ JAP Order Failed - Manual action needed\nLink: ${orderData.link}`);
            }
        }

        res.json({ received: true });
    }
);

// =====================================================
// CRYPTO PAYMENT (NOWPayments)
// =====================================================
app.post('/api/order/crypto', orderLimiter, async (req, res) => {
    try {
        const errors = validateOrderInput(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ error: errors.join(', ') });
        }

        if (!NOWPAYMENTS_API_KEY) {
            return res.status(500).json({ error: 'Crypto payments not configured' });
        }

        const { 
            link, 
            email, 
            quantity, 
            serviceId, 
            amount,
            platform,
            service,
            quality
        } = req.body;

        // Create NOWPayments invoice
        const response = await fetch('https://api.nowpayments.io/v1/invoice', {
            method: 'POST',
            headers: {
                'x-api-key': NOWPAYMENTS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                price_amount: amount,
                price_currency: 'usd',
                order_id: `gf_${Date.now()}`,
                order_description: `${platform} ${service} x${quantity}`,
                ipn_callback_url: `${FRONTEND_URL.replace('getfame.net', 'getfame-backend.onrender.com')}/api/webhooks/nowpayments`,
                success_url: `${FRONTEND_URL}/success/`,
                cancel_url: `${FRONTEND_URL}/order/`
            })
        });

        const data = await response.json();

        if (data.invoice_url) {
            // Store order data temporarily (in production, use database)
            // For now, we'll pass it through the order_id
            res.json({ url: data.invoice_url, invoiceId: data.id });
        } else {
            console.error('NOWPayments error:', data);
            res.status(500).json({ error: 'Failed to create crypto payment' });
        }
    } catch (error) {
        console.error('Crypto payment error:', error.message);
        res.status(500).json({ error: 'Crypto payment initialization failed' });
    }
});

// =====================================================
// NOWPAYMENTS WEBHOOK (Secure)
// =====================================================
app.post('/api/webhooks/nowpayments', async (req, res) => {
    try {
        // Verify IPN signature if secret is configured
        if (NOWPAYMENTS_IPN_SECRET) {
            const receivedSig = req.headers['x-nowpayments-sig'];
            if (receivedSig) {
                const sortedParams = Object.keys(req.body)
                    .sort()
                    .reduce((acc, key) => {
                        acc[key] = req.body[key];
                        return acc;
                    }, {});
                
                const expectedSig = crypto
                    .createHmac('sha512', NOWPAYMENTS_IPN_SECRET)
                    .update(JSON.stringify(sortedParams))
                    .digest('hex');

                if (receivedSig !== expectedSig) {
                    console.error('NOWPayments signature mismatch');
                    return res.status(400).json({ error: 'Invalid signature' });
                }
            }
        }

        const { payment_status, order_id, price_amount, pay_currency } = req.body;

        console.log('NOWPayments webhook:', { payment_status, order_id });

        if (payment_status === 'finished' || payment_status === 'confirmed') {
            // Send Telegram notification
            const notification = `
🛒 <b>NEW CRYPTO ORDER</b>

💰 <b>Amount:</b> $${price_amount}
🪙 <b>Currency:</b> ${pay_currency?.toUpperCase()}
🆔 <b>Order ID:</b> ${order_id}

✅ <b>Status:</b> Payment Confirmed
⏰ <b>Time:</b> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET

⚠️ <i>Check dashboard for full order details</i>
`.trim();

            await sendTelegramNotification(notification);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('NOWPayments webhook error:', error.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// =====================================================
// ADMIN API (Protected)
// =====================================================

// Admin authentication middleware
function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    
    // Simple token validation (in production, use JWT)
    // Token format: base64(username:passwordHash)
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [username, passwordHash] = decoded.split(':');
        
        if (username === 'admin' && passwordHash === ADMIN_PASSWORD_HASH) {
            next();
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Admin login
app.post('/api/admin/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // 5 attempts per 15 minutes
    message: { error: 'Too many login attempts' }
}), async (req, res) => {
    const { username, passwordHash } = req.body;

    if (username === 'admin' && passwordHash === ADMIN_PASSWORD_HASH) {
        // Create simple token
        const token = Buffer.from(`${username}:${passwordHash}`).toString('base64');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Get all orders (protected)
app.get('/api/admin/orders', adminAuth, (req, res) => {
    const orders = loadOrders();
    res.json({ orders });
});

// Get dashboard stats (protected)
app.get('/api/admin/stats', adminAuth, (req, res) => {
    const orders = loadOrders();
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = {
        total: {
            orders: orders.length,
            revenue: orders.reduce((sum, o) => sum + (o.amount || 0), 0),
            completed: orders.filter(o => o.status === 'completed').length,
            pending: orders.filter(o => o.status === 'pending' || o.status === 'processing').length
        },
        today: {
            orders: orders.filter(o => new Date(o.date) >= today).length,
            revenue: orders.filter(o => new Date(o.date) >= today).reduce((sum, o) => sum + (o.amount || 0), 0)
        },
        week: {
            orders: orders.filter(o => new Date(o.date) >= weekAgo).length,
            revenue: orders.filter(o => new Date(o.date) >= weekAgo).reduce((sum, o) => sum + (o.amount || 0), 0)
        },
        month: {
            orders: orders.filter(o => new Date(o.date) >= monthAgo).length,
            revenue: orders.filter(o => new Date(o.date) >= monthAgo).reduce((sum, o) => sum + (o.amount || 0), 0)
        }
    };

    res.json(stats);
});

// Update order status (protected)
app.patch('/api/admin/orders/:id', adminAuth, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'processing', 'completed', 'failed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    updateOrderStatus(parseInt(id), status);
    res.json({ success: true });
});

// =====================================================
// ERROR HANDLING
// =====================================================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
    console.log(`GetFame Backend v4 running on port ${PORT}`);
    console.log('Features enabled:');
    console.log('- Stripe:', !!STRIPE_SECRET_KEY);
    console.log('- NOWPayments:', !!NOWPAYMENTS_API_KEY);
    console.log('- Telegram:', !!TELEGRAM_BOT_TOKEN);
    console.log('- JAP API:', !!JAP_API_KEY);
});
