# Mai Backend - Subscription System

**What this does:**
- 30-day free trial with GPT-4o-mini (~$0.01/user cost)
- After trial: $24/month subscription
- Paid users get GPT-4o (better quality)
- You pay OpenAI costs (~$2-5/user/month)
- You profit ~$19-22/user/month

---

## Step 1: Deploy Backend to Railway (Free)

**Go to:** https://railway.app

1. **Sign up** with GitHub
2. **New Project** → **Deploy from GitHub repo**
3. **Upload these files** (or push to GitHub first):
   - `server.js`
   - `package.json`
   - `.env.example` (rename to `.env`)

4. **Set Environment Variables** in Railway:
   - `STRIPE_SECRET_KEY`: `YOUR_STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID`: `YOUR_STRIPE_PRICE_ID`
   - `OPENAI_API_KEY`: `YOUR_OPENAI_KEY_HERE`
   - `PORT`: `3000`

5. **Deploy!**

6. **Copy your Railway URL** (looks like: `https://mai-backend-production.up.railway.app`)

---

## Step 2: Set Up Stripe Webhook

1. **In Stripe Dashboard** → **Developers** → **Webhooks**
2. **Add endpoint**: `https://YOUR-RAILWAY-URL.com/webhook`
3. **Select events:**
   - `checkout.session.completed`
   - `customer.subscription.deleted`
4. **Copy Webhook Secret** (starts with `whsec_...`)
5. **Add to Railway environment variables:**
   - `STRIPE_WEBHOOK_SECRET`: `whsec_...`

---

## Step 3: Update Mai Client

Replace `/mai-v3/ai/hpf-generator.js` with the new `mai-client-hpf-generator.js` file.

**Update line 9:**
```javascript
this.backendUrl = 'https://YOUR-RAILWAY-URL.com'; // Your actual Railway URL
```

**Add uuid package:**
```bash
cd ~/Desktop/mai-app
npm install uuid
```

---

## Step 4: Test It

**Start backend locally first:**
```bash
cd mai-backend
npm install
node server.js
```

Should see:
```
🚀 Mai backend running on port 3000
   Trial: GPT-4o-mini (30 days free)
   Paid: GPT-4o ($24/month)
```

**Test endpoints:**
```bash
# Check license (should return trial status)
curl -X POST http://localhost:3000/check-license \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123"}'

# Create checkout
curl -X POST http://localhost:3000/create-checkout \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123","email":"test@example.com"}'
```

---

## Step 5: Rebuild Signed .dmg

Once everything works:

1. **On new Mac:** Update `hpf-generator.js` with backend URL
2. **Test locally:** `npm start` - verify it calls backend
3. **Zip and transfer to old Mac**
4. **On old Mac:** `npm run build:dmg`
5. **Transfer .dmg back**
6. **Upload to maipresent.com**

---

## User Flow

**Day 1:**
1. User downloads `Mai-4.1.0.dmg`
2. Installs Mai
3. Mai automatically starts 30-day trial
4. Uses GPT-4o-mini (invisible to user)

**Day 31:**
1. Mai shows: "Your trial has ended. Subscribe for $24/month"
2. User clicks → opens Stripe checkout
3. Enters credit card
4. Subscribed! Mai now uses GPT-4o

**Ongoing:**
- User pays $24/month via Stripe
- You pay OpenAI ~$2-5/month per user
- You profit ~$19-22/user/month

---

## Cost Breakdown (5,000 users)

**Trial (30 days):**
- 5,000 users × 10 uses × $0.001 = **$50 total**

**Paid (assuming 2% convert):**
- 100 paid users × $2 OpenAI cost = **$200/month cost**
- 100 paid users × $24 = **$2,400/month revenue**
- **Profit: $2,200/month**

---

## Next Steps

1. Deploy backend to Railway
2. Test with test Stripe card: `4242 4242 4242 4242`
3. Verify trial → paid flow works
4. Switch to Stripe **Live Mode** when ready
5. Replace test keys with live keys
6. Ship it! 🚀
