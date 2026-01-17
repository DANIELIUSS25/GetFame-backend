// =====================================================
// GETFAME BACKEND v5 - With JAP Integration
// =====================================================
// Security Features:
// - All secrets in environment variables
// - JAP service IDs stored server-side (not exposed to frontend)
// - Webhook signature verification
// - Input validation & sanitization
// - Rate limiting
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
    ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    RESEND_API_KEY,
    EMAIL_FROM = 'GetFame <noreply@getfame.net>'
} = process.env;

// Initialize Stripe
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// =====================================================
// JAP SERVICE ID MAPPING (SECURE - Server-side only)
// =====================================================
const JAP_SERVICE_IDS = {
    instagram: {
        followers: { standard: 7446, premium: 5951, vip: 6074 },
        likes: { standard: 7445, premium: 1761 },
        views: { standard: 7444, premium: 7444 },
        comments: { standard: 7447, premium: 7447 }
    },
    tiktok: {
        followers: { standard: 7446, premium: 7446 },
        likes: { standard: 7445, premium: 7445 },
        views: { standard: 7444, premium: 7444 }
    },
    youtube: {
        subscribers: { standard: 7446, premium: 7446 },
        likes: { standard: 7445, premium: 7445 },
        views: { standard: 7444, premium: 7444 }
    },
    twitter: {
        followers: { standard: 7446, premium: 7446 },
        likes: { standard: 7445, premium: 7445 },
        retweets: { standard: 7445, premium: 7445 }
    },
    // Crypto/Web3 services
    crypto: {
        'cmc-followers': { standard: 10110, premium: 10110 },
        'cmc-likes': { standard: 10111, premium: 10111 },
        'watchlist-followers': { standard: 7600, premium: 7600 },
        'watchlist-adds': { standard: 7599, premium: 7599 },
        'opensea-views': { standard: 7593, premium: 7593 },
        'opensea-favorites': { standard: 7594, premium: 7594 },
        'opensea-combo': { standard: 7595, premium: 7595 }
    },
    // Twitter Trends
    trends: {
        'trend-country-1h': { standard: 9613, premium: 9613 },
        'trend-country-2h': { standard: 9614, premium: 9614 },
        'trend-country-5h': { standard: 9615, premium: 9615 },
        'trend-country-12h': { standard: 9616, premium: 9616 },
        'trend-country-24h': { standard: 9617, premium: 9617 },
        'trend-ww-1h': { standard: 9618, premium: 9618 },
        'trend-ww-2h': { standard: 9619, premium: 9619 },
        'trend-ww-5h': { standard: 9620, premium: 9620 },
        'trend-ww-12h': { standard: 9621, premium: 9621 },
        'trend-ww-24h': { standard: 9622, premium: 9622 },
        'trend-crypto': { standard: 8673, premium: 8673 }
    }
};

// Get JAP service ID from platform/service/quality
function getJapServiceId(platform, service, quality = 'standard') {
    // Normalize inputs
    platform = (platform || '').toLowerCase();
    service = (service || '').toLowerCase();
    quality = (quality || 'standard').toLowerCase();

    // Check for trend services
    if (service.startsWith('trend-') || platform === 'trends') {
        const trendIds = JAP_SERVICE_IDS.trends[service];
        return trendIds ? (trendIds[quality] || trendIds.standard) : null;
    }

    // Check for crypto services
    if (platform === 'crypto' || service.includes('cmc') || service.includes('opensea') || service.includes('watchlist')) {
        const cryptoIds = JAP_SERVICE_IDS.crypto[service];
        return cryptoIds ? (cryptoIds[quality] || cryptoIds.standard) : null;
    }

    // Regular social media services
    const platformIds = JAP_SERVICE_IDS[platform];
    if (!platformIds) return null;

    const serviceIds = platformIds[service];
    if (!serviceIds) return null;

    return serviceIds[quality] || serviceIds.standard;
}

// =====================================================
// JAP API INTEGRATION
// =====================================================
async function placeJapOrder(serviceId, link, quantity) {
    if (!JAP_API_KEY) {
        console.error('JAP API key not configured');
        return { success: false, error: 'JAP not configured' };
    }

    try {
        const response = await fetch(JAP_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                key: JAP_API_KEY,
                action: 'add',
                service: serviceId,
                link: link,
                quantity: quantity
            })
        });

        const data = await response.json();

        if (data.order) {
            console.log(`JAP order placed: #${data.order} for service ${serviceId}`);
            return { success: true, orderId: data.order };
        } else {
            console.error('JAP error:', data.error || data);
            return { success: false, error: data.error || 'Unknown JAP error' };
        }
    } catch (error) {
        console.error('JAP API error:', error.message);
        return { success: false, error: error.message };
    }
}

async function checkJapOrderStatus(orderId) {
    if (!JAP_API_KEY) return null;

    try {
        const response = await fetch(JAP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: JAP_API_KEY,
                action: 'status',
                order: orderId
            })
        });

        return await response.json();
    } catch (error) {
        console.error('JAP status check error:', error.message);
        return null;
    }
}

// =====================================================
// ORDER STORAGE
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
    orders.unshift(newOrder);
    saveOrders(orders);
    return newOrder;
}

function updateOrderStatus(orderId, status, japOrderId = null) {
    const orders = loadOrders();
    const index = orders.findIndex(o => o.id === orderId || o.orderId === orderId);
    if (index >= 0) {
        orders[index].status = status;
        if (japOrderId) orders[index].japOrderId = japOrderId;
        orders[index].updatedAt = new Date().toISOString();
        saveOrders(orders);
        return orders[index];
    }
    return null;
}

function getOrderByStripeSession(sessionId) {
    const orders = loadOrders();
    return orders.find(o => o.stripeSessionId === sessionId);
}

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================
app.use(helmet());

app.use(cors({
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5500'],
    credentials: true
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const orderLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many order attempts, please wait.' }
});

app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhooks/stripe') {
        next();
    } else {
        express.json({ limit: '10kb' })(req, res, next);
    }
});

// =====================================================
// TELEGRAM NOTIFICATIONS
// =====================================================
async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error('Telegram error:', error.message);
    }
}

function formatOrderNotification(order, paymentMethod, japResult = null) {
    const maskedEmail = order.email ? 
        order.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'N/A';
    const maskedLink = order.link ? 
        order.link.substring(0, 30) + '...' : 'N/A';

    let japStatus = '';
    if (japResult) {
        japStatus = japResult.success 
            ? `\n🤖 <b>JAP Order:</b> #${japResult.orderId}`
            : `\n⚠️ <b>JAP Error:</b> ${japResult.error}`;
    }

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
${japStatus}
✅ <b>Status:</b> Payment Confirmed
⏰ <b>Time:</b> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
`.trim();
}

// =====================================================
// HEALTH CHECK
// =====================================================
app.get('/', (req, res) => {
    res.json({ 
        status: 'GetFame Backend v5 Running',
        features: [
            'Stripe',
            'Crypto',
            'JAP Integration',
            'Telegram Notifications'
        ],
        timestamp: new Date().toISOString()
    });
});

// =====================================================
// STRIPE PAYMENT (Card)
// =====================================================
app.post('/api/order', orderLimiter, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe not configured' });
        }

        const { 
            link, 
            email, 
            quantity, 
            amount,
            platform,
            service,
            quality,
            // Legacy support - if frontend sends serviceId directly
            serviceId: legacyServiceId
        } = req.body;

        // Validate required fields
        if (!link || !email || !quantity || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get JAP service ID (from mapping or legacy)
        const japServiceId = legacyServiceId || getJapServiceId(platform, service, quality);
        
        if (!japServiceId) {
            console.error('Could not determine JAP service ID for:', { platform, service, quality });
            return res.status(400).json({ error: 'Invalid service configuration' });
        }

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${platform || 'Social'} ${service || 'Growth'} - ${quantity.toLocaleString()}`,
                        description: `Quality: ${quality || 'Standard'}`
                    },
                    unit_amount: Math.round(amount * 100)
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: `${FRONTEND_URL}/success/?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/order/`,
            customer_email: email,
            metadata: {
                link,
                quantity: quantity.toString(),
                platform,
                service,
                quality,
                japServiceId: japServiceId.toString()
            }
        });

        // Save pending order
        addOrder({
            orderId: `GF-${Date.now().toString(36).toUpperCase()}`,
            stripeSessionId: session.id,
            email,
            link,
            quantity,
            amount,
            platform,
            service,
            quality,
            japServiceId,
            status: 'pending',
            paymentMethod: 'stripe'
        });

        res.json({ url: session.url, sessionId: session.id });

    } catch (error) {
        console.error('Stripe error:', error.message);
        res.status(500).json({ error: 'Payment initialization failed' });
    }
});

// =====================================================
// STRIPE WEBHOOK - Fulfill orders after payment
// =====================================================
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        if (STRIPE_WEBHOOK_SECRET) {
            event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
        } else {
            event = JSON.parse(req.body.toString());
        }
    } catch (err) {
        console.error('Stripe webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Get order details from metadata
        const { link, quantity, platform, service, quality, japServiceId } = session.metadata;
        const email = session.customer_email;
        const amount = session.amount_total / 100;

        console.log('Payment confirmed:', { platform, service, quantity, japServiceId });

        // Place order with JAP
        const japResult = await placeJapOrder(
            parseInt(japServiceId),
            link,
            parseInt(quantity)
        );

        // Update order status
        const order = getOrderByStripeSession(session.id);
        if (order) {
            updateOrderStatus(
                order.id,
                japResult.success ? 'processing' : 'pending',
                japResult.orderId
            );
        }

        // Send Telegram notification
        await sendTelegramNotification(formatOrderNotification({
            email,
            link,
            quantity: parseInt(quantity),
            amount,
            platform,
            service,
            quality
        }, 'Stripe (Card)', japResult));
    }

    res.json({ received: true });
});

// =====================================================
// CRYPTO PAYMENT (NOWPayments)
// =====================================================
app.post('/api/order/crypto', orderLimiter, async (req, res) => {
    try {
        if (!NOWPAYMENTS_API_KEY) {
            return res.status(500).json({ error: 'Crypto payments not configured' });
        }

        const { 
            link, 
            email, 
            quantity, 
            amount,
            platform,
            service,
            quality,
            serviceId: legacyServiceId
        } = req.body;

        // Get JAP service ID
        const japServiceId = legacyServiceId || getJapServiceId(platform, service, quality);

        const orderId = `gf_${Date.now()}`;

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
                order_id: orderId,
                order_description: `${platform} ${service} x${quantity}`,
                ipn_callback_url: `https://getfame-backend.onrender.com/api/webhooks/nowpayments`,
                success_url: `${FRONTEND_URL}/success/`,
                cancel_url: `${FRONTEND_URL}/order/`
            })
        });

        const data = await response.json();

        if (data.invoice_url) {
            // Save pending order
            addOrder({
                orderId,
                invoiceId: data.id,
                email,
                link,
                quantity,
                amount,
                platform,
                service,
                quality,
                japServiceId,
                status: 'pending',
                paymentMethod: 'crypto'
            });

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
// NOWPAYMENTS WEBHOOK
// =====================================================
app.post('/api/webhooks/nowpayments', async (req, res) => {
    try {
        // Verify signature
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
                    return res.status(400).json({ error: 'Invalid signature' });
                }
            }
        }

        const { payment_status, order_id, price_amount, pay_currency } = req.body;

        if (payment_status === 'finished' || payment_status === 'confirmed') {
            // Find the order
            const orders = loadOrders();
            const order = orders.find(o => o.orderId === order_id);

            if (order && order.japServiceId) {
                // Place JAP order
                const japResult = await placeJapOrder(
                    order.japServiceId,
                    order.link,
                    order.quantity
                );

                // Update order
                updateOrderStatus(
                    order.id,
                    japResult.success ? 'processing' : 'pending',
                    japResult.orderId
                );

                // Send notification
                await sendTelegramNotification(formatOrderNotification(
                    order,
                    `Crypto (${pay_currency?.toUpperCase()})`,
                    japResult
                ));
            } else {
                // Generic notification if order not found
                await sendTelegramNotification(`
🛒 <b>NEW CRYPTO ORDER</b>

💰 <b>Amount:</b> $${price_amount}
🪙 <b>Currency:</b> ${pay_currency?.toUpperCase()}
🆔 <b>Order ID:</b> ${order_id}

✅ <b>Status:</b> Payment Confirmed
⚠️ <i>Manual fulfillment may be required</i>
`.trim());
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('NOWPayments webhook error:', error.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// =====================================================
// COINBASE COMMERCE WEBHOOK
// =====================================================
app.post('/api/webhooks/coinbase', async (req, res) => {
    try {
        const COINBASE_WEBHOOK_SECRET = process.env.COINBASE_WEBHOOK_SECRET;
        
        // Verify signature if secret is configured
        if (COINBASE_WEBHOOK_SECRET) {
            const signature = req.headers['x-cc-webhook-signature'];
            const payload = JSON.stringify(req.body);
            
            const computedSignature = crypto
                .createHmac('sha256', COINBASE_WEBHOOK_SECRET)
                .update(payload)
                .digest('hex');

            if (signature !== computedSignature) {
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const event = req.body.event;
        const eventType = event?.type;
        const charge = event?.data;

        console.log('Coinbase webhook:', eventType);

        if (eventType === 'charge:confirmed' || eventType === 'charge:completed') {
            // Extract order info from charge
            const metadata = charge.metadata || {};
            const orderId = metadata.order_id || charge.name?.match(/GF-([A-Z0-9-]+)/)?.[0];
            
            // Try to find order or create new one
            let order = loadOrders().find(o => o.orderId === orderId);
            
            if (!order) {
                // Parse items from metadata if available
                let items = [];
                try {
                    items = JSON.parse(metadata.items || '[]');
                } catch (e) {}

                order = {
                    orderId,
                    email: metadata.email || charge.customer_email,
                    link: metadata.username,
                    amount: parseFloat(charge.pricing?.local?.amount || 0),
                    status: 'pending',
                    paymentMethod: 'coinbase',
                    items
                };
            }

            // For Coinbase orders, we need to fulfill manually or via items
            // Send notification for manual processing
            await sendTelegramNotification(`
🛒 <b>COINBASE ORDER CONFIRMED</b>

🆔 <b>Order:</b> ${orderId}
💰 <b>Amount:</b> $${charge.pricing?.local?.amount || 'N/A'}
📧 <b>Email:</b> ${order.email || 'N/A'}
🔗 <b>Username:</b> ${order.link || metadata.username || 'N/A'}

✅ <b>Status:</b> Payment Confirmed
⏰ <b>Time:</b> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET

📋 <i>Check dashboard for order details</i>
`.trim());

            // Update order status
            if (order.id) {
                updateOrderStatus(order.id, 'paid');
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Coinbase webhook error:', error.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// =====================================================
// ADMIN API
// =====================================================
function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    
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

app.post('/api/admin/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts' }
}), async (req, res) => {
    const { username, password, passwordHash } = req.body;

    // Support both plain password and pre-hashed
    let hash = passwordHash;
    if (!hash && password) {
        hash = crypto.createHash('sha256').update(password).digest('hex');
    }

    if (username === 'admin' && hash === ADMIN_PASSWORD_HASH) {
        const token = Buffer.from(`${username}:${hash}`).toString('base64');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/admin/orders', adminAuth, (req, res) => {
    const orders = loadOrders();
    res.json({ orders });
});

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
            pending: orders.filter(o => ['pending', 'processing', 'paid'].includes(o.status)).length
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

app.patch('/api/admin/orders/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'processing', 'completed', 'failed', 'paid'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const updated = updateOrderStatus(parseInt(id), status);
    res.json({ success: true, order: updated });
});

// Manual JAP fulfillment endpoint
app.post('/api/admin/fulfill/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const orders = loadOrders();
    const order = orders.find(o => o.id === parseInt(id));

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.japServiceId || !order.link || !order.quantity) {
        return res.status(400).json({ error: 'Missing order details for fulfillment' });
    }

    const japResult = await placeJapOrder(order.japServiceId, order.link, order.quantity);

    if (japResult.success) {
        updateOrderStatus(order.id, 'processing', japResult.orderId);
        res.json({ success: true, japOrderId: japResult.orderId });
    } else {
        res.status(500).json({ error: japResult.error });
    }
});

// Check JAP order status
app.get('/api/admin/jap-status/:japOrderId', adminAuth, async (req, res) => {
    const { japOrderId } = req.params;
    const status = await checkJapOrderStatus(japOrderId);
    res.json(status || { error: 'Could not fetch status' });
});

// Change admin password
app.post('/api/admin/change-password', adminAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    
    if (currentHash !== ADMIN_PASSWORD_HASH) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Note: In production, you'd update the environment variable
    // For now, just return success - user needs to update env var manually
    const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    
    res.json({ 
        success: true, 
        message: 'Update ADMIN_PASSWORD_HASH in your environment variables to: ' + newHash 
    });
});

// =====================================================
// ERROR HANDLING
// =====================================================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
    console.log(`GetFame Backend v5 running on port ${PORT}`);
    console.log('Features enabled:');
    console.log('- Stripe:', !!STRIPE_SECRET_KEY);
    console.log('- NOWPayments:', !!NOWPAYMENTS_API_KEY);
    console.log('- JAP API:', !!JAP_API_KEY);
    console.log('- Telegram:', !!TELEGRAM_BOT_TOKEN);
});
