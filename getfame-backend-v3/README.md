# GetFame Backend v3

SMM services backend with Stripe (cards) and NOWPayments (crypto) support.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables

Create a `.env` file or add these to Render:

| Variable | Description |
|----------|-------------|
| `JAP_API_KEY` | JustAnotherPanel API key |
| `JAP_API_URL` | JAP API URL (default: https://justanotherpanel.com/api/v2) |
| `STRIPE_SECRET_KEY` | Stripe secret key (sk_live_xxx or sk_test_xxx) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NOWPAYMENTS_API_KEY` | NOWPayments API key |
| `NOWPAYMENTS_IPN_SECRET` | NOWPayments IPN secret (optional) |
| `FRONTEND_URL` | Your frontend URL (https://getfame.net) |
| `BACKEND_URL` | Your backend URL |

### 3. Start Server
```bash
npm start
```

## API Endpoints

### Services
- `GET /api/services` - All services
- `GET /api/services/:platform` - Services by platform

### Orders
- `POST /api/order` - Create order (Stripe/Card)
- `POST /api/order/crypto` - Create order (Crypto)
- `GET /api/order/:orderId` - Get order status

### Webhooks
- `POST /api/webhooks/stripe` - Stripe payment webhook
- `POST /api/webhooks/nowpayments` - NOWPayments IPN webhook

## Payment Setup

### Stripe
1. Get API keys from https://dashboard.stripe.com/apikeys
2. Add `STRIPE_SECRET_KEY` to environment
3. Set up webhook at https://dashboard.stripe.com/webhooks
   - Endpoint: `https://your-backend.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`
4. Add `STRIPE_WEBHOOK_SECRET` to environment

### NOWPayments (Crypto)
1. Sign up at https://nowpayments.io
2. Get API key from dashboard
3. Add `NOWPAYMENTS_API_KEY` to environment
4. Set IPN callback URL: `https://your-backend.com/api/webhooks/nowpayments`
5. (Optional) Add `NOWPAYMENTS_IPN_SECRET` for webhook verification

## Adding Services

Edit `lib/curated-services.js` to add/remove services:

```javascript
const CURATED_SERVICES = {
    12345: {
        name: "Service Name",
        platform: "instagram",
        type: "followers",
        description: "Description here"
    }
};
```

## Deployment

### Render
1. Push to GitHub
2. Connect repo to Render
3. Set Root Directory: `getfame-backend-v3`
4. Add environment variables
5. Deploy!
