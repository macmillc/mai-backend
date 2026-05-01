const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
require('dotenv').config();

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());

// In-memory store for demo (use database in production)
const users = new Map();

// ═══════════════════════════════════════════════════════
// CREATE CHECKOUT SESSION (30-day trial)
// ═══════════════════════════════════════════════════════

app.post('/create-checkout', async (req, res) => {
  try {
    const { userId, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          userId: userId
        }
      },
      customer_email: email,
      success_url: 'maipresent://success',
      cancel_url: 'maipresent://cancel',
      metadata: {
        userId: userId
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// CHECK LICENSE STATUS
// ═══════════════════════════════════════════════════════

app.post('/check-license', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Check if user exists in our system
    const user = users.get(userId);
    
    if (!user) {
      // New user - start trial
      const installDate = Date.now();
      users.set(userId, {
        installDate,
        subscriptionId: null,
        status: 'trial'
      });
      
      const daysInTrial = 0;
      return res.json({
        status: 'trial',
        daysRemaining: 30 - daysInTrial,
        mmodel: 'claude-haiku-4-5-20251001'
      });
    }

    // Check if trial expired
    const daysSinceInstall = Math.floor((Date.now() - user.installDate) / (1000 * 60 * 60 * 24));
    
    if (user.status === 'trial' && daysSinceInstall >= 30) {
      // Trial expired, no subscription
      return res.json({
        status: 'expired',
        daysRemaining: 0,
        model: null
      });
    }

    if (user.status === 'trial' && daysSinceInstall < 30) {
      // Still in trial
      return res.json({
        status: 'trial',
        daysRemaining: 30 - daysSinceInstall,
        model: 'gpt-4o-mini'
      });
    }

    // Check Stripe subscription status
    if (user.subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(user.subscriptionId);
      
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        return res.json({
          status: 'active',
          model: 'claude-sonnet-4-20250514'
        });
      } else {
        return res.json({
          status: 'expired',
          model: null
        });
      }
    }

    // Default: expired
    res.json({
      status: 'expired',
      daysRemaining: 0,
      model: null
    });

  } catch (err) {
    console.error('License check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// GENERATE HPF (OpenAI Proxy)
// ═══════════════════════════════════════════════════════

app.post('/generate-hpf', async (req, res) => {
  try {
    const { userId, context, model } = req.body;

    // Verify user has access
    const user = users.get(userId);
    if (!user && model !== 'gpt-4o-mini') {
      return res.status(403).json({ error: 'No active license' });
    }

    // Use specified model (model: 'claude-haiku-4-5-20251001' for trial, model: 'claude-sonnet-4-20250514' for paid)
    const message = await anthropic.messages.create({
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: 350,
    system: context.systemPrompt,
    messages: [
    { role: 'user', content: context.userPrompt }
  ]
});
const data = JSON.parse(message.content[0].text);
    res.json(data);

  } catch (err) {
    console.error('HPF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// STRIPE WEBHOOK (handle successful payments)
// ═══════════════════════════════════════════════════════

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const userId = session.metadata.userId;
      const subscriptionId = session.subscription;
      
      // Update user to paid status
      const user = users.get(userId);
      if (user) {
        user.subscriptionId = subscriptionId;
        user.status = 'active';
        users.set(userId, user);
      }
      break;

    case 'customer.subscription.deleted':
      // Handle subscription cancellation
      const subscription = event.data.object;
      // Find user by subscription ID and mark as expired
      for (const [uid, userData] of users.entries()) {
        if (userData.subscriptionId === subscription.id) {
          userData.status = 'expired';
          users.set(uid, userData);
        }
      }
      break;
  }

  res.json({ received: true });
});

// ═══════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mai backend running on port ${PORT}`);
  console.log(`   Trial: Claude Haiku (30 days free)`);
  console.log(`   Paid: Claude Sonnet ($4.42/month)`);
});
