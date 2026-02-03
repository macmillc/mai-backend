const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class HPFGenerator {
  constructor(database) {
    this.db = database;
    this.userId = this.getUserId();
    this.backendUrl = 'https://your-backend-url.com'; // Update after deployment
  }

  // Get or create unique user ID
  getUserId() {
    const idPath = path.join(app.getPath('userData'), 'user-id.txt');
    if (fs.existsSync(idPath)) {
      return fs.readFileSync(idPath, 'utf8');
    }
    const newId = uuidv4();
    fs.writeFileSync(idPath, newId);
    return newId;
  }

  // Check license status
  async checkLicense() {
    try {
      const response = await fetch(`${this.backendUrl}/check-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId })
      });
      
      const data = await response.json();
      console.log('📋 License status:', data.status);
      
      if (data.daysRemaining !== undefined) {
        console.log(`   ${data.daysRemaining} days remaining in trial`);
      }
      
      return data;
    } catch (err) {
      console.error('License check failed:', err);
      return { status: 'error', model: null };
    }
  }

  // ═══════════════════════════════════════════════════════
  // MAIN ENTRY
  // ═══════════════════════════════════════════════════════

  async generate(context) {
    // Check license status first
    const license = await this.checkLicense();
    
    if (license.status === 'expired') {
      return {
        H: 'Your 30-day trial has ended.',
        P: 'Subscribe to continue using Mai.',
        F: ['Click here to subscribe for $24/month']
      };
    }

    if (license.status === 'error') {
      // Fallback to local if backend is down
      return this.local(context);
    }

    // Generate HPF using backend
    try {
      const systemPrompt = SYSTEM_PROMPT;
      const userPrompt = this.buildPrompt(context);

      const response = await fetch(`${this.backendUrl}/generate-hpf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          model: license.model, // 'gpt-4o-mini' or 'gpt-4o'
          context: {
            systemPrompt,
            userPrompt
          }
        })
      });

      const data = await response.json();

      // Enforce structure
      if (!data.H) data.H = 'No history available.';
      if (!data.P) data.P = 'Present unknown.';
      if (!Array.isArray(data.F)) data.F = [String(data.F || 'Keep going')];
      if (data.F.length > 3) data.F = data.F.slice(0, 3);
      if (data.F.length < 2) data.F.push('Keep going');

      const modelUsed = license.status === 'trial' ? 'GPT-4o-mini (trial)' : 'GPT-4o (paid)';
      console.log(`✓ HPF generated via ${modelUsed}`);
      
      return data;

    } catch (err) {
      console.error('Backend HPF failed:', err);
      return this.local(context);
    }
  }

  // ═══════════════════════════════════════════════════════
  // LOCAL ENGINE (fallback)
  // ═══════════════════════════════════════════════════════

  local(context) {
    return {
      H: this.buildH(context),
      P: this.buildP(context),
      F: this.buildF(context)
    };
  }

  buildH(context) {
    const { recentActions, currentApp, browserCtx } = context;

    if (recentActions.length < 2) {
      return 'Mai is brand new here — keep working and it\'ll start remembering your loops.';
    }

    const currentBuilding = browserCtx?.building || currentApp;
    let lastShift = null;
    
    for (let i = recentActions.length - 1; i >= 0; i--) {
      const a = recentActions[i];
      if (a.duration_s < 5) continue;

      const isDifferent =
        (a.building || a.category) !== currentBuilding ||
        (browserCtx && a.building === browserCtx.building && (
          a.apartment !== browserCtx.apartment ||
          a.room !== browserCtx.room
        ));

      if (isDifferent) { lastShift = a; break; }
    }

    if (!lastShift) {
      return `You've been in ${currentBuilding} for a while.`;
    }

    const where = this.describeAction(lastShift);
    const typed = lastShift.typed ? ' typing' : '';
    const dur = lastShift.duration_s >= 60
      ? `~${Math.round(lastShift.duration_s / 60)} min`
      : `~${lastShift.duration_s}s`;

    return `Before this, you were ${where}${typed} for ${dur}.`;
  }

  buildP(context) {
    const { currentApp, browserCtx, recentActions } = context;

    const recentInCurrent = [...recentActions].reverse().slice(0, 5);
    const typingHere = recentInCurrent.some(a => {
      if (browserCtx) return a.building === browserCtx.building && a.typed;
      return a.category === currentApp && a.typed;
    });

    const typing = typingHere ? ' — actively typing.' : '.';

    if (browserCtx?.building) {
      const parts = [];
      if (browserCtx.room) parts.push(browserCtx.room);
      if (browserCtx.apartment) parts.push(browserCtx.apartment);

      if (parts.length > 0) {
        return `You're in ${browserCtx.building} › ${parts.join(' › ')}${typing}`;
      }
      return `You're in ${browserCtx.building}${typing}`;
    }

    return `You're in ${currentApp}${typing}`;
  }

  buildF(context) {
    const { predictions, loopPosition } = context;
    const steps = [];

    if (loopPosition && loopPosition.nextStep) {
      steps.push(`Next: ${this.formatStep(loopPosition.nextStep)}`);

      if (loopPosition.stepsLeft >= 2 && loopPosition.steps) {
        const afterNext = loopPosition.steps[loopPosition.currentIndex + 2];
        if (afterNext) steps.push(`Then: ${this.formatStep(afterNext)}`);
      }
    }

    if (predictions.length > 0 && steps.length < 3) {
      predictions.forEach(pred => {
        if (steps.length >= 3) return;
        const formatted = this.formatStep(pred.to_step);
        if (!steps.some(s => s.includes(formatted))) {
          steps.push(`Usually: ${formatted}`);
        }
      });
    }

    if (steps.length === 0) {
      steps.push('Mai is still mapping your loops — keep working');
      steps.push('The more you use it, the sharper it gets');
    }

    return steps.slice(0, 3);
  }

  describeAction(action) {
    if (action.building) {
      if (action.apartment && action.room) {
        return `in ${action.apartment}'s ${action.room} in ${action.building}`;
      }
      if (action.apartment) {
        return `in ${action.apartment} in ${action.building}`;
      }
      if (action.room) {
        return `in ${action.room} in ${action.building}`;
      }
      return `in ${action.building}`;
    }
    return `in ${action.category || action.app}`;
  }

  formatStep(stepName) {
    const clean = stepName.replace(/\.(typed|used)$/, '');
    const parts = clean.split(':');
    return parts.join(' › ');
  }

  buildPrompt(context) {
    const { currentApp, browserCtx, recentActions, loopPosition, predictions, rareLoops, timeOfDay } = context;

    let currentWhere = currentApp;
    if (browserCtx?.building) {
      const parts = [browserCtx.building];
      if (browserCtx.room) parts.push(browserCtx.room);
      if (browserCtx.apartment) parts.push(browserCtx.apartment);
      currentWhere = parts.join(' › ');
    }

    const actionsText = recentActions.length > 0
      ? recentActions.map(a => {
          let where = a.building || a.category || a.app;
          if (a.building) {
            const p = [a.building];
            if (a.room) p.push(a.room);
            if (a.apartment) p.push(a.apartment);
            where = p.join(' › ');
          }
          return `${a.time} — ${where} ${a.duration_s}s${a.typed ? ' [typed]' : ''}`;
        }).join('\n')
      : 'No recent actions.';

    const loopText = loopPosition
      ? [
          `Loop: "${loopPosition.signature}"`,
          `Seen ${loopPosition.timesSeen}x | Confidence: ${loopPosition.confidence.toFixed(2)}`,
          `Here: ${loopPosition.currentStep}`,
          `Next: ${loopPosition.nextStep || 'end'}`,
        ].filter(Boolean).join('\n')
      : 'Not in a recognized loop yet.';

    const predsText = predictions.length > 0
      ? predictions.map(p => `${p.to_step} (seen ${p.times_seen}x)`).join('\n')
      : 'No predictions yet.';

    return `TIME: ${timeOfDay.hour}:00 on ${timeOfDay.dayName}
NOW: ${currentWhere}

RECENT FOOTPRINTS:
${actionsText}

LOOP POSITION:
${loopText}

WHAT USUALLY FOLLOWS:
${predsText}

Generate H/P/F. Reference specific records and sections. F = exactly 2-3 steps.`;
  }
}

const SYSTEM_PROMPT = `You are Mai. A quiet workflow tool. NOT a chatbot. No personality. No "Hey!" 

THE APARTMENT BUILDING:
Work inside SaaS apps has layers:
- BUILDING = the app (Salesforce, HubSpot)
- APARTMENT = the specific record (John Smith, Project Alpha)
- ROOM = the section (Accounts, Pipeline, Activities)

You have access to this depth. USE IT.

H (Historical):
Glance BACK. The last major shift. Reference specific apartment and room. 1-2 sentences.
Good: "Before this, you were in Suzie Lee's account in Salesforce for about 3 minutes."

P (Present):
Where are they RIGHT NOW. With depth. 1 sentence.
Good: "You're in the Activities section of John Smith's deal in HubSpot — looks like you're typing."

F (Future — THE HEMINGWAY BRIDGE):
EXACTLY 2-3 items. The next steps on THEIR path.
Good: ["Switch to Suzie Lee's account", "Then back to Pipeline view"]

TONE: Warm but not chatty. Instructional, not conversational. You are a tool. A good one.

OUTPUT — valid JSON only:
{
  "H": "1-2 sentences referencing specific records/sections",
  "P": "1 sentence with depth",
  "F": ["step 1", "step 2", "step 3"]
}`;

module.exports = HPFGenerator;
