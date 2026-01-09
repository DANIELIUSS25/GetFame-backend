# GetFame Backend v4

Secure backend with Telegram notifications for order alerts.

## Features

- ✅ Stripe card payments
- ✅ NOWPayments crypto (BTC, ETH, USDT, LTC)
- ✅ Telegram order notifications
- ✅ JAP panel integration
- ✅ Rate limiting
- ✅ Webhook signature verification
- ✅ Input validation & sanitization
- ✅ Security headers (Helmet)

## Environment Variables

Set these in Render Dashboard → Environment:

| Variable | Description | Required |
|----------|-------------|----------|
| `STRIPE_SECRET_KEY` | Stripe secret key (sk_live_...) | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret (whsec_...) | Yes |
| `NOWPAYMENTS_API_KEY` | NOWPayments API key | Yes |
| `NOWPAYMENTS_IPN_SECRET` | NOWPayments IPN secret | Yes |
| `JAP_API_KEY` | JustAnotherPanel API key | Yes |
| `JAP_API_URL` | JAP API URL | No (has default) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | Yes |
| `TELEGRAM_CHAT_ID` | Your Telegram user ID | Yes |
| `FRONTEND_URL` | Your frontend URL | No (defaults to https://getfame.net) |

## Deployment to Render

1. Push this folder to GitHub
2. Go to Render Dashboard
3. Create new Web Service
4. Connect your GitHub repo
5. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Add all environment variables
7. Deploy

## Security Notes

- All secrets stored in environment variables only
- Webhook signatures verified before processing
- Rate limiting prevents abuse
- Input sanitized before processing
- No sensitive data in logs
- CORS restricted to frontend domain

## Telegram Notification Format

```
🛒 NEW ORDER

📱 Platform: Instagram
📦 Service: Followers (Premium)
📊 Quantity: 5,000
💰 Amount: $99.99
💳 Payment: Stripe (Card)

🔗 Link: instagram.com/user...
📧 Email: use***@email.com
🆔 Service ID: 5951

✅ Status: Payment Confirmed
⏰ Time: 1/9/2025, 3:45:00 PM ET
```
