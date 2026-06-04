#!/usr/bin/env python3
"""
Generate /apps/<slug>/index.html for all 8 Hills App landing pages.

Single source of truth for per-app data. Re-run after edits — the
generator overwrites each landing page. Layout and copy live here;
shared CSS in /apps/apps.css; nav and footer are injected at runtime
by /nav.js so they don't need to be hard-coded.

Usage:
  python3 apps/_generate.py
"""

import html
import json
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
APPS_DIR = SITE / "apps"
ASSETS = "/assets/apps"  # web-absolute

# ── Per-app data ──────────────────────────────────────────────────
APPS = {
    "mortgage-calc": {
        "name": "Mortgage & Loan Calculator",
        "play_id": "com.hillapp.mortgage_calc",
        "apple_id": None,
        "icon": True,
        "tagline": "PITI, PMI, FHA, VA, USDA & refinance break-even. Offline. No lender funnel.",
        "meta_title": "Mortgage & Loan Calculator: PITI, FHA, Refinance | Free",
        "meta_desc": "Free offline mortgage & loan calculator. PITI, FHA/VA/USDA, refinance break-even, DTI affordability. No signup, no lender funnel, no tracking.",
        "primary_badge": "100% Offline",
        "secondary_badges": ["No Lender Funnel", "All 50 States"],
        "category_label": "FinanceApplication",
        "features": [
            ("🏠", "True PITI payment", "Principal, interest, taxes, insurance, HOA and PMI — the real number, not the teaser P&I."),
            ("📋", "All loan types", "Conventional, FHA, VA, USDA with correct PMI 78% auto-drop, FHA life-of-loan MIP, VA funding fee, USDA annual fee."),
            ("📈", "ARM modelling", "5/1, 7/1, 10/1 ARMs with worst-case payment shock under 2/2/5 caps."),
            ("⚖️", "Affordability DTI", "28/36 Comfortable vs 31/43 Stretched (QM-rule). Co-borrower income supported."),
            ("🔄", "Refinance break-even", "Break-even months, lifetime savings, and a one-sentence verdict you can act on."),
            ("📍", "50 states + DC", "State-specific property tax and insurance defaults for every U.S. state."),
        ],
        "use_cases": [
            ("First-time buyer", "Comparing a 30-year fixed vs a 7/1 ARM before locking. See the worst-case rate-shock month in seconds."),
            ("Refinance shopper", "Checking break-even months at today's rate before the next Fed meeting moves the curve."),
            ("Affordability check", "Running the 28/36 comfort DTI with a co-borrower's income to see what's actually safe."),
        ],
        "demo": {
            "heading": "From home price to monthly payment in under a minute",
            "lead": "Drop in a price, choose a loan type, and see the real PITI — principal, interest, taxes, insurance, PMI — not a teaser P&I number.",
            "steps": [
                ("Enter the basics", "Home price, downpayment %, interest rate, loan term. Defaults pre-filled for your state."),
                ("Pick a loan type", "Conventional, FHA, VA or USDA. PMI / MIP / funding fee handled correctly."),
                ("See the full PITI", "Monthly payment broken down. DTI verdict against a real income. Refinance break-even months."),
            ],
            "result": {
                "header": "Sample: $450,000 home · 10% down · 30-yr FHA · 7.125%",
                "rows": [
                    ("Principal & interest", "$2,727 / mo"),
                    ("Property tax + insurance", "$487 / mo"),
                    ("FHA MIP (life of loan)", "$252 / mo"),
                ],
                "final_label": "Total PITI",
                "final_value": "$3,466 / mo",
                "footnote": "DTI: Comfortable at $95,000 income · Refinance break-even: 47 months",
            },
        },
        "faq": [
            ("Is Mortgage & Loan Calculator free?", "Yes — completely free. No paywalls, no premium tier, no upsells. The whole calculator is free forever."),
            ("Does Mortgage & Loan Calculator work without internet?", "Yes. All the math runs on your phone. Only the optional weekly PMMS rate refresh uses the network; everything else is offline."),
            ("Where do the rate defaults come from?", "Freddie Mac Primary Mortgage Market Survey (PMMS). The app shows an explicit 'rates as of {date}' stamp — no false real-time."),
            ("Does Mortgage & Loan Calculator sell my data to lenders?", "No. We have no server, no lender partner, and no referral kickback. We can't sell your data because we never have it."),
            ("Does it include PMI and FHA MIP correctly?", "Yes. PMI auto-drops at 78% LTV by federal law; we model that. FHA life-of-loan MIP under 10% down is also handled."),
            ("Is the affordability calculator accurate?", "It uses standard 28/36 (Fannie Mae conventional) and 31/43 (QM rule) DTI thresholds. Co-borrower income is summed gross."),
        ],
        "related": ["investment-calculator", "debt-free-plan"],
    },
    "paycheck-calculator": {
        "name": "Paycheck Calculator",
        "play_id": "com.hillapp.takehome",
        "apple_id": None,
        "icon": True,
        "tagline": "U.S. paycheck calculator: federal, FICA, 50 states & 11 city wage taxes.",
        "meta_title": "Paycheck Calculator (USA, 2026) — Free Offline Take-Home",
        "meta_desc": "Free offline U.S. paycheck calculator. Federal, FICA, 50 states & 11 city wage taxes. 401(k), bonus & raise scenarios. No signup, no tracking.",
        "primary_badge": "100% Offline",
        "secondary_badges": ["2026 IRS Tables", "All 50 States"],
        "category_label": "FinanceApplication",
        "features": [
            ("💵", "Federal + FICA", "2026 IRS percentage-method tables for single, married, and head-of-household. Social Security wage cap applied correctly."),
            ("🗺️", "50 states + DC", "State income tax for every U.S. state, including no-income-tax states."),
            ("🏙️", "11 city wage taxes", "NYC, Philadelphia, Detroit, Pittsburgh, Wilmington, Kansas City and more — built in, no manual lookup."),
            ("💼", "401(k) & pre-tax", "Pre-tax 401(k), HSA, FSA, and Section 125 plans with marginal-rate savings shown."),
            ("🎚️", "What-if sliders", "Drag a raise %, 401(k) % or bonus and watch the new take-home update instantly."),
            ("⚖️", "Side-by-side compare", "Current job vs offer. Single vs married. Two states. Side by side, no toggling back and forth."),
        ],
        "use_cases": [
            ("Job offer comparison", "Comparing a New York offer to a Texas offer. See the actual after-tax delta, not just the headline salary."),
            ("Raise planning", "Confirming what a 6% raise puts in your bank account after federal, FICA, and your state and city wage tax."),
            ("Contractor switch", "Modelling W-2 vs 1099 take-home with self-employment tax included."),
        ],
        "demo": {
            "heading": "See your real paycheck after taxes",
            "lead": "Skip the gross number. Get the after-tax dollar that actually hits your bank account, broken down by federal, FICA, state and city.",
            "steps": [
                ("Enter salary + state", "Annual salary, pay frequency, filing status, and which of 50 states you live in."),
                ("Add deductions", "401(k) %, HSA, pre-tax benefits, and any one-time bonus or overtime."),
                ("See the full breakdown", "Federal, FICA, state and (where applicable) city wage taxes — line by line."),
            ],
            "result": {
                "header": "Sample: $110,000 in NYC · semi-monthly · 8% 401(k)",
                "rows": [
                    ("Gross pay", "$4,583"),
                    ("Federal income tax", "−$724"),
                    ("FICA (SS + Medicare)", "−$351"),
                    ("NY state + NYC", "−$481"),
                    ("401(k) pre-tax", "−$367"),
                ],
                "final_label": "Take-home / paycheck",
                "final_value": "$2,660",
                "footnote": "Save the scenario; flip to a Texas offer side-by-side in one tap.",
            },
        },
        "faq": [
            ("Is the take-home calculator free?", "Yes — entirely free with no premium tier."),
            ("Does it work offline?", "Yes. The 2026 IRS tables and all 50 state rates ship inside the app. No network call is made when you calculate."),
            ("Is my salary information sent anywhere?", "No. Paycheck Calculator has no server. Your salary, 401(k) %, and state never leave the device."),
            ("Are the tax rates current?", "Yes — 2026 federal IRS percentage-method tables, current state rates, and the 11 city wage taxes are updated each tax year via app update."),
            ("Does it handle 1099 self-employment income?", "Yes. Toggle self-employed mode to add the 15.3% self-employment tax on top of federal."),
            ("Can I compare two jobs side-by-side?", "Yes — that's the headline feature. Save two scenarios, see take-home delta, monthly delta, and yearly delta in one screen."),
        ],
        "related": ["wealthmind", "tip-calculator"],
    },
    "investment-calculator": {
        "name": "Dividend Calculator & ETF SIP",
        "play_id": "com.investcalc.dividend",
        "apple_id": None,
        "icon": True,
        "tagline": "Compound interest, monthly SIP, dividend DRIP, inflation-adjusted projections.",
        "meta_title": "Dividend Calculator & ETF SIP: Compound Interest, Free",
        "meta_desc": "Free offline dividend & ETF SIP calculator. Compound interest, monthly SIP, dividend DRIP, inflation-adjusted growth, saved scenarios. No signup.",
        "primary_badge": "100% Offline",
        "secondary_badges": ["Inflation-Adjusted", "Saved Scenarios"],
        "category_label": "FinanceApplication",
        "features": [
            ("📈", "Compound interest", "Daily, monthly, quarterly and annual compounding with month-by-month tables."),
            ("💸", "Monthly SIP", "Systematic investment plan modelling with realistic returns and contribution escalation."),
            ("🧾", "Dividend DRIP", "Reinvest dividends with yield and dividend growth rate built in."),
            ("🛡️", "Inflation-adjusted", "See future value in today's dollars — the number that actually matters."),
            ("📚", "Saved scenarios", "Keep FIRE 5%, Aggressive 8%, Conservative 3% side-by-side. Compare in one screen."),
            ("🎯", "Goal-seek mode", "Ask: 'How much per month to reach $1M in 20 years?' Get the answer back."),
        ],
        "use_cases": [
            ("FIRE projections", "Modelling Coast FIRE vs Lean FIRE with a 4% withdrawal rate and a 7% real return."),
            ("College savings", "Calculating the monthly contribution needed for a $250,000 college fund in 14 years."),
            ("Retirement planning", "Comparing maxing the 401(k) (+match) vs splitting with a Roth IRA across 30 years."),
        ],
        "demo": {
            "heading": "Project long-term growth without a spreadsheet",
            "lead": "Plug in your starting amount and monthly contribution. See the projection in nominal and inflation-adjusted dollars — the number that actually matters.",
            "steps": [
                ("Enter the starting point", "Current portfolio, monthly contribution, expected annual return."),
                ("Set the time horizon", "Years to project, compounding frequency, assumed inflation rate."),
                ("See the projection", "Future value (nominal + today's dollars), total contributed, growth-only delta."),
            ],
            "result": {
                "header": "Sample: $25,000 start · $1,000 / mo · 7% return · 25 yrs · 3% inflation",
                "rows": [
                    ("Starting amount", "$25,000"),
                    ("Total contributed", "$300,000"),
                    ("Future value (nominal)", "$1,012,000"),
                ],
                "final_label": "Future value in today's dollars",
                "final_value": "$483,000",
                "footnote": "Save as 'Conservative 7%' · run an 'Aggressive 9%' next to it side-by-side.",
            },
        },
        "faq": [
            ("Is the investment calculator free?", "Yes — fully free, no ads, no premium tier."),
            ("Does it support compound interest?", "Yes, with daily, monthly, quarterly, and annual compounding options."),
            ("Can I model dividend reinvestment (DRIP)?", "Yes. Enter the dividend yield and the dividend growth rate; the app projects future portfolio value with reinvestment."),
            ("Are results inflation-adjusted?", "Yes. Toggle inflation-adjusted view to see results in today's dollars at your assumed inflation rate."),
            ("Does it handle FIRE planning?", "Yes — set a withdrawal rate (commonly 4%) and a target portfolio; the app shows how long you have to keep contributing."),
            ("Does it work offline?", "Yes. Pure on-device math. No portfolio is ever uploaded."),
        ],
        "related": ["wealthmind", "mortgage-calc"],
    },
    "debt-free-plan": {
        "name": "Credit Card Payoff Plan",
        "play_id": "com.hillapp.debt_free_plan",
        "apple_id": None,
        "icon": True,
        "tagline": "Avalanche vs snowball. Credit card payoff calculator. See your debt-free date.",
        "meta_title": "Credit Card Payoff Plan: Avalanche vs Snowball Calc",
        "meta_desc": "Free offline credit card payoff planner. Avalanche vs snowball, debt-free date, interest saved, extra payment what-if. No signup, no credit pull.",
        "primary_badge": "No Credit Pull",
        "secondary_badges": ["100% Offline", "No Bank Linking"],
        "category_label": "FinanceApplication",
        "features": [
            ("⚔️", "Avalanche vs snowball", "Run both side-by-side. See the actual interest-saved dollar gap between strategies."),
            ("📅", "Debt-free date", "Exact month and year, not vague 'years remaining'. Move it earlier with extra payments in real-time."),
            ("💳", "Credit card payoff", "Minimum payment trap detection — 'at this rate, payoff is 27 years' — surfaced clearly."),
            ("📊", "Multi-debt timeline", "Track every card, student loan, and personal loan together. One unified payoff plan."),
            ("💰", "Extra-payment what-if", "Drag $50, $100, $250 monthly extra and watch the debt-free date jump forward."),
            ("🎯", "Lump-sum allocation", "Tax refund or bonus directed by avalanche or snowball — see the months saved."),
        ],
        "use_cases": [
            ("Multi-card payoff", "Three credit cards, deciding which to attack first. The avalanche/snowball card shows the math and the psychology."),
            ("Bonus allocation", "Choosing whether to put a $3,000 year-end bonus on the 24% APR card or the smallest balance."),
            ("Student loan strategy", "Modelling whether to pay extra now or invest the difference at 7%."),
        ],
        "demo": {
            "heading": "Find your debt-free date in 60 seconds",
            "lead": "List every debt, pick avalanche or snowball, drag an extra payment slider, and watch the debt-free date jump.",
            "steps": [
                ("List your debts", "Balance, APR and minimum payment for each card, loan, or balance transfer."),
                ("Pick a strategy", "Avalanche (highest APR first) or snowball (smallest balance first). Add any extra payment."),
                ("See your debt-free date", "Exact month and year. Total interest saved compared to minimums-only."),
            ],
            "result": {
                "header": "Sample: 3 cards · $18,200 total · +$300 / mo extra",
                "rows": [
                    ("Avalanche debt-free", "Aug 2029"),
                    ("Snowball debt-free", "Oct 2029"),
                    ("Interest saved (avalanche)", "$1,847"),
                ],
                "final_label": "Months saved vs minimums-only",
                "final_value": "34 months",
                "footnote": "Drag the extra-payment slider live; the date and interest update in real time.",
            },
        },
        "faq": [
            ("Is Credit Card Payoff Plan free?", "Yes — fully free, no premium tier."),
            ("Does it require a credit check or bank link?", "No. No credit pull, no Plaid, no bank linking. You enter your balances and APRs manually."),
            ("Avalanche or snowball — which is better?", "Avalanche saves more interest. Snowball builds more momentum. Credit Card Payoff Plan shows you both, with the exact dollar and month gap."),
            ("Does it work offline?", "Yes. All the math is on your phone. No server, no upload of your balances or APRs."),
            ("Can I model lump-sum payments?", "Yes. Allocate a tax refund or bonus to either strategy and see the months saved."),
            ("Does it handle variable APR cards?", "You can preview a rate-change scenario — 'what if my card jumps from 18.99% to 24.99%' — and see the new timeline."),
        ],
        "related": ["mortgage-calc", "wealthmind"],
    },
    "rental-yield-calculator": {
        "name": "Rental Yield & ROI Calculator",
        "play_id": "com.hillapp.rental_yield_calc",
        "apple_id": None,
        "icon": True,
        "tagline": "Gross & net rental yield, cap rate, cash-on-cash ROI for global property.",
        "meta_title": "Rental Yield & ROI Calculator: Cap Rate, Cash-on-Cash",
        "meta_desc": "Free offline rental yield & ROI calculator. Gross/net yield, cap rate, cash-on-cash. Multi-currency: HKD, USD, GBP. No signup, no agent contact.",
        "primary_badge": "Multi-Currency",
        "secondary_badges": ["100% Offline", "Global Markets"],
        "category_label": "FinanceApplication",
        "features": [
            ("📊", "Gross & net yield", "Headline screening number plus the net yield after vacancy, fees, repairs, insurance and taxes."),
            ("🏢", "Cap rate", "Net operating income / property value — the institutional benchmark, calculated cleanly."),
            ("💰", "Cash-on-cash ROI", "Actual cash return on actual cash invested (downpayment + closing costs). The honest number."),
            ("🌐", "Multi-currency", "HKD, USD, GBP, EUR, JPY, SGD, AUD, CAD and more. Switch currencies in one tap."),
            ("🏠", "Leverage modelling", "Mortgage payment factored into monthly cash flow. See what's actually cashflow-positive."),
            ("🆚", "Side-by-side compare", "Three properties at a glance. Yield, cap rate, ROI, cash flow — all four metrics, in one screen."),
        ],
        "use_cases": [
            ("HK property hunting", "Comparing a Sheung Wan flat to a Tsuen Wan unit before viewing. Net yield with HK property tax built in."),
            ("US BRRRR investing", "Sanity-checking whether the next deal cashflows after PITI, vacancy and management."),
            ("UK buy-to-let", "Modelling gross yield after the post-2025 tax changes and Section 24 mortgage interest rules."),
        ],
        "demo": {
            "heading": "Run any property's yield, ROI and cap rate",
            "lead": "Enter price, rent, and the running costs. Get gross yield, net yield, cap rate and cash-on-cash ROI side-by-side in any currency.",
            "steps": [
                ("Enter price + rent", "Purchase price and expected monthly rent. Switch currency in one tap."),
                ("Add the running costs", "Mortgage, vacancy %, management fee, property tax, insurance, maintenance."),
                ("See the four metrics", "Gross yield, net yield, cap rate, cash-on-cash ROI — read across at once."),
            ],
            "result": {
                "header": "Sample: HK$8.2M flat · HK$24,000 / mo rent · 70% LTV @ 4.5%",
                "rows": [
                    ("Gross yield", "3.51%"),
                    ("Net yield (after costs)", "2.42%"),
                    ("Cap rate (NOI / price)", "2.78%"),
                ],
                "final_label": "Cash-on-cash ROI",
                "final_value": "6.10%",
                "footnote": "Compare three properties side-by-side; the winner highlights in green.",
            },
        },
        "faq": [
            ("Is the rental yield calculator free?", "Yes — fully free with no ads."),
            ("What's the difference between gross yield, net yield, cap rate, and cash-on-cash ROI?", "Gross yield is annual rent / price. Net yield subtracts operating expenses. Cap rate uses net operating income / price (institutional standard). Cash-on-cash ROI is annual cash flow / cash actually invested — the only one that accounts for leverage."),
            ("Does it support Hong Kong property tax?", "Yes. HK property tax presets are built in, alongside US, UK, and EU defaults."),
            ("Can I model a mortgage?", "Yes — leverage modelling factors PITI into the monthly cash flow so you see cash-on-cash ROI honestly."),
            ("Does it work offline?", "Yes. All calculations are local. Currency conversion uses cached mid-market rates after first sync."),
            ("Can I compare multiple properties?", "Yes — three side-by-side with all four key metrics visible."),
        ],
        "related": ["mortgage-calc", "investment-calculator"],
    },
    "rateradar": {
        "name": "RateRadar",
        "play_id": "hk.rateradar.app",
        "apple_id": None,
        "icon": True,
        "tagline": "Should I exchange money today? FX rate tracker with daily verdict.",
        "meta_title": "RateRadar — Should I Exchange Money Today? FX Tracker",
        "meta_desc": "Free FX rate tracker with daily Should-I-Exchange verdict. HKD, USD, JPY & more. 90-day percentile, custom baselines. No tracking, no kickbacks.",
        "primary_badge": "Daily Verdict",
        "secondary_badges": ["No Kickbacks", "EN / 繁中"],
        "category_label": "FinanceApplication",
        "features": [
            ("🎯", "'Should I exchange?' verdict", "Daily Yes / Wait / Now signal with a one-sentence reason. Built around your custom baseline."),
            ("📊", "30/90/365-day percentile", "Today vs the last 30, 90, 365 days. Is today a 1-in-20 day or just average?"),
            ("💱", "Multi-currency dashboard", "HKD, USD, JPY, EUR, GBP, CNY, KRW, THB, AUD, SGD and more on one screen."),
            ("🎚️", "Custom baseline", "Set 'I want JPY when it crosses 5.4 per HKD' and get notified the day it does."),
            ("✈️", "Trip planning mode", "Plan a $5,000 Japan budget in HKD at today's vs target rate. See the saving."),
            ("🌏", "Bilingual EN / 繁中", "Designed in Hong Kong for HK and international users. Full interface in both languages."),
        ],
        "use_cases": [
            ("HK trip planning", "Watching JPY weekly before a Tokyo trip, exchanging on a 1-in-20 day instead of the day you fly."),
            ("Tuition remittance", "Sending overseas tuition each term and deciding 'this month or next?' based on the 90-day rank."),
            ("Expat salary", "Paid in HKD, spending in EUR. Knowing when this month's exchange is unusually favourable."),
        ],
        "demo": {
            "heading": "Know if today is a good day to exchange",
            "lead": "Pick a pair, set a baseline window, and get a daily Yes / Wait / Now verdict based on the actual rate percentile.",
            "steps": [
                ("Pick a currency pair", "HKD → JPY, USD → HKD, EUR → GBP. Add as many pairs as you watch."),
                ("Choose your baseline", "Compare today against the last 30, 90, or 365 days."),
                ("Read today's verdict", "Percentile rank plus a one-sentence Yes / Wait / Now. Optional alerts when a target hits."),
            ],
            "result": {
                "header": "Sample: HKD → JPY today",
                "rows": [
                    ("Today's rate", "5.42"),
                    ("90-day average", "5.21"),
                    ("90-day percentile", "92%"),
                ],
                "final_label": "Today's call",
                "final_value": "NOW — top 10% of last 90 days",
                "footnote": "Set a baseline alert at 5.40 and we'll notify you the day it crosses.",
            },
        },
        "faq": [
            ("Is RateRadar free?", "Yes — fully free with no banner ads or partner kickbacks."),
            ("Where does the rate data come from?", "Public mid-market FX rates from open sources. No personal data is sent."),
            ("How does the daily verdict work?", "RateRadar compares today's rate against your chosen baseline (30/90/365 days). 'Now' fires when today is in the top 10% favourable; 'Wait' when in the bottom 50%."),
            ("Does it work offline?", "Historical charts work offline after first sync. The daily verdict needs a brief network call for today's rate."),
            ("Does it have a remittance partner or affiliate link?", "No. We have zero partner kickbacks. We surface the mid-market rate; you compare against your bank's spread on your own."),
            ("Does it support Hong Kong currency pairs?", "Yes — HKD is a first-class pair. The whole app was designed in Hong Kong."),
        ],
        "related": ["wealthmind", "investment-calculator"],
    },
    "wealthmind": {
        "name": "WealthMind: Budget & Finance",
        "play_id": "com.investcalc.dividend",
        "apple_id": None,
        "icon": False,
        "tagline": "Envelope budget, net worth, FIRE planner — on-device AI advisor. 100% offline.",
        "meta_title": "WealthMind: Private AI Budget & Finance, Offline",
        "meta_desc": "Free private budget & finance app. Envelope budgets, net worth, FIRE planner, on-device AI advisor. AES-256 encrypted backups. No bank linking.",
        "primary_badge": "On-Device AI",
        "secondary_badges": ["AES-256 Backups", "No Bank Linking"],
        "category_label": "FinanceApplication",
        "features": [
            ("💼", "Envelope budgeting", "Monthly envelopes with automatic rollover and overspend rebalancing. Cash-style discipline on your phone."),
            ("📈", "Net worth tracker", "Assets minus liabilities with monthly delta and a year-over-year chart you can actually read."),
            ("🔥", "FIRE planner", "Coast, Lean and Fat FIRE projections based on your current burn rate and assumed return."),
            ("🤖", "On-device AI advisor", "Ask 'can I afford this trip?' or 'where did $200 go?' — Gemma 3n runs on your phone. Nothing uploaded."),
            ("🔐", "AES-256 encrypted backups", "Optional Google Drive backup, encrypted before upload with a key only you hold."),
            ("🌐", "Multi-currency", "Base in HKD, USD, GBP, EUR or any major currency. Foreign expenses converted at the day's rate."),
        ],
        "use_cases": [
            ("Privacy-conscious budgeter", "Tired of Mint, Monarch and Copilot reading every bank transaction? WealthMind is manual-entry, AI-assisted, zero-server."),
            ("FIRE couple", "Modelling Coast vs Lean FIRE together without uploading the entire household financial life to a SaaS."),
            ("Independent contractor", "Tracking irregular 1099 income, expenses, and quarterly tax reserves without a Plaid link or accountant subscription."),
        ],
        "demo": {
            "heading": "Budget privately. Plan FIRE on your phone.",
            "lead": "Envelope budgeting, net worth tracking and on-device FIRE projections — your data never leaves the device. The AI advisor runs locally.",
            "steps": [
                ("Log income + fixed costs", "Monthly income, rent, utilities, subscriptions. Manual entry, no bank link."),
                ("Allocate to envelopes", "Distribute the remainder across housing, food, transport, savings, fun."),
                ("Watch the picture build", "Monthly cash flow, net worth trend, FIRE progress — refreshed live."),
            ],
            "result": {
                "header": "Sample: month snapshot · HKD base",
                "rows": [
                    ("Income this month", "HK$58,000"),
                    ("Envelopes filled", "11 / 12"),
                    ("Net worth Δ this month", "+HK$8,400"),
                ],
                "final_label": "FIRE progress",
                "final_value": "22% · Coast FIRE in 6.2 yrs",
                "footnote": "Ask the on-device AI: 'where did $200 extra go in March?' Answer runs locally.",
            },
        },
        "faq": [
            ("Is WealthMind free?", "Yes. The full app is free. Optional Pro features may be added later, but the core budget, net worth, and AI advisor will stay free."),
            ("Does WealthMind connect to my bank?", "No. WealthMind is intentionally manual-entry. No Plaid, no MX, no read of your accounts. You stay in control."),
            ("Is the AI advisor really on-device?", "Yes. WealthMind ships with Gemma 3n, a 3 GB AI model that runs entirely on your phone after a one-time install. There's no API endpoint we could send your data to."),
            ("Are backups secure?", "Optional Google Drive backup is encrypted on your phone with AES-256 before upload. Only you have the key — losing it means losing the backup."),
            ("Does it support Hong Kong dollars?", "Yes. HKD is a first-class base currency."),
            ("How does it compare to Mint / Monarch / Copilot?", "All three read your bank accounts continuously. WealthMind doesn't have a server to read them with. The trade-off: you enter transactions manually. The advantage: your financial life never leaves your phone."),
        ],
        "related": ["investment-calculator", "debt-free-plan"],
    },
    "tip-calculator": {
        "name": "Tipright: Tip Calculator",
        "play_id": "com.hillapp.tipcalculator",
        "apple_id": None,
        "icon": True,
        "tagline": "Fast tip calculator and bill splitter. Multi-currency. No ads. No signup.",
        "meta_title": "Tipright: Tip Calculator & Bill Splitter — No Ads",
        "meta_desc": "Free offline tip calculator and bill splitter. Multi-currency: USD, HKD, EUR. Even or uneven split, tax-aware, round-up. No ads, no signup.",
        "primary_badge": "No Ads, Ever",
        "secondary_badges": ["100% Offline", "Multi-Currency"],
        "category_label": "UtilitiesApplication",
        "features": [
            ("💵", "Tip calculator", "Slide 0% to 30% or tap a preset 15 / 18 / 20 / 22%. The total updates instantly."),
            ("➗", "Bill splitter", "Split between 2 and 50 people, equal or custom shares. Drag a row for an uneven split."),
            ("🔼", "Round-up", "Round the total or per-person figure to the nearest dollar, HKD, or euro."),
            ("📋", "Tax-aware mode", "Tip on pre-tax or post-tax base — US restaurant convention vs HK 10% service charge."),
            ("🌐", "Multi-currency", "USD, HKD, EUR, GBP, JPY, CAD, AUD and 20+ more currencies built in."),
            ("🚫", "Zero ads", "No banner. No interstitial. No 'Pro to remove ads'. Just the calculator."),
        ],
        "use_cases": [
            ("Group dinner", "Splitting a HK$3,200 hot-pot bill between six people where two didn't drink. Custom shares, screenshot-ready."),
            ("US restaurant", "Tipping on a pre-tax $86 dinner at 20%, with the per-person total ready for the group chat."),
            ("HK lunch", "Service charge already 10% — toggle it on and the tip calculator handles the rest."),
        ],
        "demo": {
            "heading": "Split any bill in 3 seconds",
            "lead": "Bill, tip %, headcount — done. Plus uneven shares for the friend who didn't drink and round-up so nobody owes 26 cents.",
            "steps": [
                ("Enter the bill", "Pre-tax or post-tax base; toggle the HK 10% service charge if it's already on the bill."),
                ("Pick tip % and people", "Slide 0-30% or tap a preset. Set the headcount; drag a row for an uneven share."),
                ("Get the per-person total", "Tip, total, per person. Round-up to the nearest dollar so the math is clean."),
            ],
            "result": {
                "header": "Sample: $86 bill · 18% tip · 4 people",
                "rows": [
                    ("Tip (18%)", "$15.48"),
                    ("Total with tip", "$101.48"),
                    ("Per person (even)", "$25.37"),
                ],
                "final_label": "Per person, rounded up",
                "final_value": "$26 each",
                "footnote": "Drag a row to give one diner a smaller share — useful when someone didn't drink.",
            },
        },
        "faq": [
            ("Is the tip calculator free?", "Yes — fully free with absolutely no ads. Most tip calculators on Play Store are 90% ad; this one is 0%."),
            ("Does it work offline?", "Yes. Open and use, no network needed."),
            ("Can I split unevenly?", "Yes. Drag a row to give one person a bigger or smaller share — useful when someone didn't drink or ordered extra."),
            ("Does it support Hong Kong service charge?", "Yes. Toggle the HK 10% service charge convention; the tip calculator adjusts the base accordingly."),
            ("Why no ads?", "Tip calculator is the most over-monetised category on Play Store. We made the version we wanted ourselves. No ads, ever."),
            ("Does it save past bills?", "No — by design. Bills are ephemeral; nothing is stored. Open, calculate, screenshot, close."),
        ],
        "related": ["paycheck-calculator", "rateradar"],
    },
}

# ── Page template ──────────────────────────────────────────────
def render_screenshots_section(slug: str) -> str:
    asset_dir = SITE / "assets" / "apps" / slug
    if not asset_dir.exists():
        shots = []
    else:
        shots = sorted([
            p.name for p in asset_dir.glob("*.png")
            if p.name != "icon.png"
        ])
    if not shots:
        return """
    <section class="app-section">
      <h2>Screenshots</h2>
      <div class="app-screenshots-empty">Screenshots coming soon.</div>
    </section>
"""
    items = "".join(
        f'        <img src="{ASSETS}/{slug}/{html.escape(s)}" '
        f'alt="{html.escape(s.replace(".png", "").replace("_", " "))}" '
        f'loading="lazy" decoding="async" width="220">\n'
        for s in shots
    )
    return f"""
    <section class="app-section">
      <h2>Screenshots</h2>
      <div class="app-screenshots">
{items}      </div>
    </section>
"""


def render_icon(app_data: dict, slug: str) -> str:
    if app_data["icon"]:
        return (
            f'<img src="{ASSETS}/{slug}/icon.png" '
            f'alt="{html.escape(app_data["name"])} icon" '
            f'width="168" height="168">'
        )
    initial = html.escape(app_data["name"][0])
    return (
        f'<span class="app-hero-icon-fallback" aria-hidden="true">'
        f'{initial}</span>'
    )


def render_play_btn(app_data: dict) -> str:
    if app_data["play_id"]:
        return (
            f'<a class="app-store-btn google" '
            f'href="https://play.google.com/store/apps/details?id={app_data["play_id"]}" '
            f'rel="noopener">▶ Google Play</a>'
        )
    return (
        '<a class="app-store-btn google" aria-disabled="true" '
        'href="#coming-soon"> Google Play (soon)</a>'
    )


def render_apple_btn(app_data: dict) -> str:
    if app_data["apple_id"]:
        return (
            f'<a class="app-store-btn apple" '
            f'href="https://apps.apple.com/app/id{app_data["apple_id"]}" '
            f'rel="noopener"> App Store</a>'
        )
    return (
        '<a class="app-store-btn apple" aria-disabled="true" '
        'href="#coming-soon"> App Store (soon)</a>'
    )


def render_features(app_data: dict) -> str:
    items = "".join(
        f"""        <div class="app-feature-card">
          <div class="app-feature-icon" aria-hidden="true">{html.escape(icon)}</div>
          <h3>{html.escape(title)}</h3>
          <p>{html.escape(desc)}</p>
        </div>
"""
        for icon, title, desc in app_data["features"]
    )
    return f"""
    <section class="app-section" aria-labelledby="features-title">
      <h2 id="features-title">What can {html.escape(app_data["name"])} do?</h2>
      <div class="app-features-grid">
{items}      </div>
    </section>
"""


def render_demo(app_data: dict) -> str:
    """High-conversion 'See it in action' block — placed between
    Features and Use Cases so a scanning visitor sees the signature
    workflow (3 numbered steps + a realistic result card) before any
    persona-based copy. SEO: keywords flow naturally through the
    heading, lead, step titles and result labels.

    Falls through silently if an app's dict has no `demo` field.
    """
    demo = app_data.get("demo")
    if not demo:
        return ""
    steps_html = "".join(
        f"""        <li class="demo-step">
          <span class="demo-step-number" aria-hidden="true">{i}</span>
          <div>
            <h3>{html.escape(title)}</h3>
            <p>{html.escape(body)}</p>
          </div>
        </li>
"""
        for i, (title, body) in enumerate(demo["steps"], start=1)
    )
    res = demo["result"]
    rows_html = "".join(
        f"""            <div class="demo-result-row">
              <span class="demo-result-label">{html.escape(label)}</span>
              <span class="demo-result-value">{html.escape(value)}</span>
            </div>
"""
        for label, value in res["rows"]
    )
    footnote_html = (
        f'<p class="demo-result-footnote">{html.escape(res["footnote"])}</p>'
        if res.get("footnote") else ""
    )
    return f"""
    <section class="app-demo" aria-labelledby="demo-title">
      <div class="app-demo-inner">
        <div class="app-demo-heading">
          <p class="eyebrow">See it in action</p>
          <h2 id="demo-title">{html.escape(demo["heading"])}</h2>
          <p class="section-lead">{html.escape(demo["lead"])}</p>
        </div>
        <div class="demo-grid">
          <ol class="demo-steps">
{steps_html}          </ol>
          <aside class="demo-result" aria-label="Example output">
            <div class="demo-result-header">{html.escape(res["header"])}</div>
            <div class="demo-result-body">
{rows_html}            </div>
            <div class="demo-result-final">
              <span class="demo-result-label">{html.escape(res["final_label"])}</span>
              <span class="demo-result-final-value">{html.escape(res["final_value"])}</span>
            </div>
            {footnote_html}
          </aside>
        </div>
      </div>
    </section>
"""


def render_use_cases(app_data: dict) -> str:
    items = "".join(
        f"""        <article class="app-usecase">
          <h3>{html.escape(title)}</h3>
          <p>{html.escape(body)}</p>
        </article>
"""
        for title, body in app_data["use_cases"]
    )
    return f"""
    <section class="app-section" aria-labelledby="usecase-title">
      <h2 id="usecase-title">Who is this for?</h2>
      <div class="app-usecase-grid">
{items}      </div>
    </section>
"""


PRIVACY_ITEMS = [
    "Works completely offline",
    "No account or signup required",
    "Zero data uploaded to any server",
    "No ads, no tracking, no hidden costs",
]


def render_privacy() -> str:
    items = "".join(
        f"""        <li><span class="check" aria-hidden="true">✓</span>{html.escape(item)}</li>
"""
        for item in PRIVACY_ITEMS
    )
    return f"""
    <section class="app-privacy" aria-labelledby="privacy-title">
      <h2 id="privacy-title">Your privacy, our priority</h2>
      <ul class="app-privacy-list">
{items}      </ul>
    </section>
"""


def render_faq(app_data: dict) -> str:
    items = "".join(
        f"""        <details>
          <summary>{html.escape(q)}</summary>
          <div class="answer">{html.escape(a)}</div>
        </details>
"""
        for q, a in app_data["faq"]
    )
    return f"""
    <section class="app-section" aria-labelledby="faq-title">
      <h2 id="faq-title">Frequently Asked Questions</h2>
      <div class="app-faq">
{items}      </div>
    </section>
"""


def render_related(app_data: dict) -> str:
    cards = []
    for slug in app_data["related"]:
        target = APPS[slug]
        if target["icon"]:
            icon_html = (
                f'<img src="{ASSETS}/{slug}/icon.png" '
                f'alt="{html.escape(target["name"])} icon" '
                f'loading="lazy" width="48" height="48">'
            )
        else:
            initial = html.escape(target["name"][0])
            icon_html = (
                f'<span class="app-related-card-fallback" aria-hidden="true">'
                f'{initial}</span>'
            )
        cards.append(f"""        <a class="app-related-card" href="/apps/{slug}/">
          {icon_html}
          <div>
            <h3>{html.escape(target["name"])}</h3>
            <p>{html.escape(target["tagline"])}</p>
          </div>
        </a>
""")
    return f"""
    <section class="app-section" aria-labelledby="related-title">
      <h2 id="related-title">You might also like</h2>
      <div class="app-related-grid">
{"".join(cards)}      </div>
    </section>
"""


def render_schema(app_data: dict, slug: str) -> str:
    schema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": app_data["name"],
        "url": f"https://todays-tasks.com/apps/{slug}/",
        "description": app_data["meta_desc"],
        "applicationCategory": app_data["category_label"],
        "operatingSystem": "Android, iOS",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
        },
        "publisher": {
            "@type": "Organization",
            "name": "Hills App",
            "url": "https://todays-tasks.com",
        },
    }
    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
            for q, a in app_data["faq"]
        ],
    }
    return (
        '<script type="application/ld+json">\n'
        + json.dumps(schema, ensure_ascii=False, indent=2)
        + "\n</script>\n"
        '<script type="application/ld+json">\n'
        + json.dumps(faq_schema, ensure_ascii=False, indent=2)
        + "\n</script>"
    )


def render_page(slug: str, app_data: dict) -> str:
    badges_html = "".join(
        f'<span class="app-hero-badge">✓ {html.escape(b)}</span>\n        '
        for b in [app_data["primary_badge"], *app_data["secondary_badges"]]
    )

    head = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <script>if(location.hostname==="hill02252024.github.io")location.replace("https://todays-tasks.com"+location.pathname+location.search+location.hash);</script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html.escape(app_data["meta_title"])}</title>
  <meta name="description" content="{html.escape(app_data["meta_desc"])}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="https://todays-tasks.com/apps/{slug}/">

  <meta property="og:locale" content="en_US">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Hills App">
  <meta property="og:title" content="{html.escape(app_data["meta_title"])}">
  <meta property="og:description" content="{html.escape(app_data["meta_desc"])}">
  <meta property="og:url" content="https://todays-tasks.com/apps/{slug}/">
  <meta property="og:image" content="https://todays-tasks.com/assets/apps/{slug}/icon.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html.escape(app_data["meta_title"])}">
  <meta name="twitter:description" content="{html.escape(app_data["meta_desc"])}">

  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/apps/apps.css">

  {render_schema(app_data, slug)}
</head>"""

    body = f"""<body>
  <script src="/nav.js" defer></script>

  <main>
    <section class="app-hero">
      <div class="app-hero-icon">{render_icon(app_data, slug)}</div>
      <div class="app-hero-text">
        <h1>{html.escape(app_data["name"])}</h1>
        <p class="app-hero-sub">{html.escape(app_data["tagline"])}</p>
        <div class="app-hero-badges">
        {badges_html.rstrip()}
        </div>
        <div class="app-hero-cta">
          {render_play_btn(app_data)}
          {render_apple_btn(app_data)}
        </div>
      </div>
    </section>
{render_features(app_data)}{render_demo(app_data)}{render_use_cases(app_data)}{render_privacy()}{render_screenshots_section(slug)}{render_faq(app_data)}{render_related(app_data)}
  </main>
</body>
</html>
"""
    return head + "\n" + body


def main() -> int:
    written = []
    for slug, app_data in APPS.items():
        page_dir = APPS_DIR / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        page_path = page_dir / "index.html"
        page_path.write_text(render_page(slug, app_data), encoding="utf-8")
        written.append(str(page_path.relative_to(SITE)))
        print(f"  wrote {page_path.relative_to(SITE)}")
    print(f"\nWrote {len(written)} pages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
