# GetFame Backend

A Node.js backend that connects your GetFame website to JustAnotherPanel (JAP) API with Stripe payment processing.

## Features

- 🔗 **JAP Integration**: Fetches services, places orders, tracks status
- 💰 **Automatic Markup**: Set your profit margin in config
- 💳 **Stripe Payments**: Secure checkout with webhooks
- 🔒 **Security**: Rate limiting, CORS, Helmet protection
- 📦 **Simple Deploy**: Ready for Railway, Render, Vercel, etc.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
```env
# JustAnotherPanel
JAP_API_URL=https://justanotherpanel.com/api/v2
JAP_API_KEY=your_jap_api_key

# Stripe
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Your site
FRONTEND_URL=https://getfame.net

# Profit margin (1.5 = 50% markup)
PROFIT_MARGIN=1.5
```

### 3. Run Locally

```bash
npm run dev
```

Server starts at `http://localhost:3000`

### 4. Test the API

```bash
# Get all services
curl http://localhost:3000/api/services

# Get services by platform
curl http://localhost:3000/api/services/instagram

# Calculate price
curl -X POST http://localhost:3000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"serviceId": 1, "quantity": 1000}'
```

## API Endpoints

### Services

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/services` | GET | Get all services |
| `/api/services/:platform` | GET | Get services by platform |
| `/api/services-grouped` | GET | Get services grouped by platform |
| `/api/service/:id` | GET | Get single service |
| `/api/calculate` | POST | Calculate order price |

### Orders

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/order` | POST | Create order (returns Stripe checkout URL) |
| `/api/order/:id` | GET | Get order status |
| `/api/order/:id/refill` | POST | Request refill |

### Payments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/stripe` | POST | Stripe webhook handler |
| `/api/verify-payment/:sessionId` | GET | Verify payment session |

## Deployment

### Railway (Recommended)

1. Push code to GitHub
2. Connect Railway to your repo
3. Add environment variables in Railway dashboard
4. Deploy!

```bash
# Or use Railway CLI
railway login
railway init
railway up
```

### Render

1. Create new Web Service
2. Connect GitHub repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables

### Vercel

Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```

Then deploy:
```bash
vercel --prod
```

## Stripe Setup

### 1. Create Stripe Account
Go to [stripe.com](https://stripe.com) and create an account.

### 2. Get API Keys
Dashboard → Developers → API Keys
- Copy the **Secret Key** (starts with `sk_`)

### 3. Set Up Webhook

Dashboard → Developers → Webhooks → Add endpoint

- **URL**: `https://your-api-domain.com/api/webhook/stripe`
- **Events**: `checkout.session.completed`, `payment_intent.payment_failed`

Copy the **Webhook Secret** (starts with `whsec_`)

## Frontend Integration

Update your frontend order page to use the API:

```javascript
const API_URL = 'https://api.getfame.net'; // Your backend URL

// Fetch services
const response = await fetch(`${API_URL}/api/services`);
const { services } = await response.json();

// Create order
const order = await fetch(`${API_URL}/api/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        serviceId: 123,
        link: 'https://instagram.com/user',
        quantity: 1000,
        email: 'customer@email.com'
    })
});

const { checkoutUrl } = await order.json();
window.location.href = checkoutUrl; // Redirect to Stripe
```

## File Structure

```
getfame-backend/
├── server.js           # Main Express server
├── package.json        # Dependencies
├── .env.example        # Environment template
├── lib/
│   ├── jap-api.js      # JAP API wrapper
│   ├── services.js     # Services manager (with markup)
│   ├── orders.js       # Orders manager
│   └── payments.js     # Stripe payment handler
└── public/
    └── order.html      # Updated order page
```

## Profit Margin

The `PROFIT_MARGIN` setting multiplies JAP prices:

| JAP Price | Margin | Your Price |
|-----------|--------|------------|
| $1.00     | 1.5    | $1.50      |
| $1.00     | 2.0    | $2.00      |
| $1.00     | 1.3    | $1.30      |

## Production Checklist

- [ ] Use production Stripe keys
- [ ] Set up Stripe webhook
- [ ] Configure CORS for your domain only
- [ ] Add proper authentication for admin routes
- [ ] Set up a database for order persistence
- [ ] Configure logging/monitoring
- [ ] Set up SSL (handled by most hosts)

## Support

For JAP API issues, contact JustAnotherPanel support.
For Stripe issues, check [Stripe Docs](https://stripe.com/docs).

## License

MIT - Use it however you want!
