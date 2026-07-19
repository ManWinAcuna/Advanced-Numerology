# Numerology Life Path Research Notes

## Purpose

This is a reference document, not a spec — nothing in the app changes because of it. The goal was to study Life Path numerology deeply enough (traits, strengths/weaknesses, and *why* certain numbers get along or clash) to understand the reasoning our own compatibility engine is built on, and to spot ideas that could sharpen the sports-betting numerology edge later.

Source: CUE (cuetheapp.com), a separate third-party numerology app, studied live via its Calculator page for all eleven Life Paths in scope — 1, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33 (2 is intentionally excluded, matching our own app's "2 doesn't exist, becomes 11" rule). Content below is paraphrased in my own words, not copied.

## Cross-check against our own data

CUE's numeric compatibility score for every single pairing checked (all 13 partner numbers, across all 11 life paths — over a hundred data points) matched our own `NUMEROLOGY_TABLE` / `SPORTS_NUMEROLOGY_TABLE` in [compat-data.js](compat-data.js) exactly. That's a strong, independent confirmation that our transcribed table is accurate. Nothing to fix here — this section is purely validation.

What CUE has that we don't: a plain-English *reason* for every one of those scores. That reasoning is the new information this research adds — see the pattern language below and the edge ideas at the end.

## How to read the profiles below

Each Life Path gets: its core theme, 2 defining strengths, 2 defining weaknesses, career fit, relationship style, and — where CUE called it out specifically — anything tying the number to physical/athletic traits, since that's the angle most relevant to sports scoring.

---

### 1 — The Leader
**Theme:** New beginnings, independence, male/assertive energy.
**Strengths:** Decisive leadership; thrives under pressure, performs best "back against the wall."
**Weaknesses:** Impatient, stubborn, argues for sport, learns only the hard way.
**Career:** CEO/founder/manager archetype — needs to be giving orders, not taking them.
**Relationships:** Leads the relationship; needs an ambitious, self-driven partner, not a needy one.
**Sports note:** CUE explicitly calls 1 a natural-athlete number — competitive build, thrives on physical stress.

### 3 — The Communicator
**Theme:** Communication, creativity, "child-like" energy, considered the luckiest number.
**Strengths:** Best-in-class communicator; multitasker with a constant stream of ideas.
**Weaknesses:** Short attention span, impulsive decisions, struggles to finish what it starts.
**Career:** Sales, marketing, content, entertainment — needs variety and visibility.
**Relationships:** Needs fun and novelty; a rigid, all-work relationship dies fast.
**Sports note:** No athletic callout; the relevant trait is volatility of focus/energy, not physical build.

### 4 — The Builder
**Theme:** Work, structure, law & order.
**Strengths:** Outworks everyone through sheer discipline; excellent organizer.
**Weaknesses:** Rigid, one-dimensional thinking; gets comfortable and stuck in routine.
**Career:** Government, accounting, engineering, logistics — anything systematic.
**Relationships:** Needs stability and a real plan; can turn rigid/boring if unchecked.
**Sports note:** Durability/consistency archetype — steady, systematic, not explosive.

### 5 — The Free Spirit
**Theme:** Travel, change, beauty.
**Strengths:** Magnetic, entertaining, adaptable to any environment.
**Weaknesses:** Indecisive, prone to overindulgence (CUE flags impulse control broadly, including around intimacy).
**Career:** Travel, hospitality, modeling, anything mobile — a routine job drains it.
**Relationships:** Needs constant novelty and strong physical chemistry; hard to pin down.
**Sports note:** Explicitly framed as physically active/model-body archetype; the defining risk is inconsistency/indecision, not effort.

### 6 — The Caretaker
**Theme:** Home, family, responsibility.
**Strengths:** Extremely reliable, natural nurturer/caretaker.
**Weaknesses:** Self-sacrificing to the point of being taken advantage of; prone to comfortable laziness.
**Career:** Real estate, caretaking roles, education support, government — anything service-oriented.
**Relationships:** Built for loyalty and family-building; needs to feel needed and appreciated.
**Sports note:** No athletic callout; team-glue/support-role archetype rather than a solo standout.

### 7 — The Analyst
**Theme:** Intelligence, the esoteric, the loner/scholar.
**Strengths:** Elite analytical mind; natural at numerology/astrology-style pattern-finding.
**Weaknesses:** Comes off cold/detached; genuinely the worst number for steady material wealth.
**Career:** Programming, research, cybersecurity, teaching — solo, brain-driven work.
**Relationships:** Struggles with emotional expression; CUE explicitly advises against marriage as a strong fit for most 7s.
**Sports note:** Explicitly flagged as injury-prone — advised to avoid high-risk physical activity (even naming motorcycles specifically).

### 8 — The Powerhouse
**Theme:** Money, power, karma.
**Strengths:** Natural with finance and positions of power; thrives on high stakes and risk.
**Weaknesses:** Boom/bust swings — "easy come, easy go" with money; obsessive, burns out.
**Career:** Finance, business ownership, insurance, real estate — anything high-stakes.
**Relationships:** Karmic, intense relationships; conflict is almost always really about security/control.
**Sports note:** CUE flags a physical cost specifically — eye strain and tension from mental pressure, not injury from action.

### 9 — The Adapter
**Theme:** Completion, adaptability, mirroring one's environment.
**Strengths:** Adapts instantly to any environment; a natural strategist working from behind the scenes.
**Weaknesses:** Ego is powerful but fragile; addictive personality; needs to finish what it starts.
**Career:** Assistant/operations/coordination roles — support and behind-the-scenes strategy, not the spotlight.
**Relationships:** Literally becomes a reflection of whoever surrounds it — environment/partner quality matters enormously.
**Sports note:** No fixed athletic archetype; the defining trait is that its performance is environment-dependent — same person, different result, depending on surroundings/team quality.

### 11 — The Charismatic (Master Number)
**Theme:** Emotional energy, charisma, "the athlete."
**Strengths:** Magnetic presence; sharp, reliable intuition.
**Weaknesses:** Emotionally volatile, bordering on self-destructive when unbalanced; genuine duality (great/terrible sides).
**Career:** Athlete, actor, influencer, coaching — anything built on presence and inspiration.
**Relationships:** Intense highs and lows; needs a steady, spiritually grounded partner to avoid burning out the connection.
**Sports note:** CUE labels 11 outright as "the number of the athlete" — explicitly needs physical outlets to burn off emotional intensity, or it turns destructive.

### 22 — The Master Builder (Master Number)
**Theme:** Large-scale building — the "highest material" master number.
**Strengths:** Turns vision into scaled, lasting structures; natural, magnetic leadership.
**Weaknesses:** A real destructive side under pressure; risk of building everyone else up while personally ending up empty-handed.
**Career:** Architect, engineer, strategist, business-builder — big, structural undertakings.
**Relationships:** Needs a stable, appreciative partner to build a shared long-term legacy with.
**Sports note:** No athletic callout — the relevant idea is scale and long-term payoff, i.e. a "process/organization" number rather than a single-moment number.

### 33 — The Master Teacher (Master Number, rarest Life Path)
**Theme:** Influence and amplification — described as the highest, rarest frequency in the whole system.
**Strengths:** Outsized influence on anyone nearby; natural, wise teacher/guide.
**Weaknesses:** Isolating ego; being "three steps ahead" reads as misunderstood or arrogant.
**Career:** Teacher, strategist, visionary, community leader, purpose-driven founder.
**Relationships:** Intense and mission-driven; needs a partner who supports the "mission" without being steamrolled by it.
**Sports note:** No athletic callout — 33's defining trait is amplification: it makes whatever it touches (a team, a room) measurably better or worse, not a fixed physical archetype.

---

## Compatibility — the recurring pattern language

Every one of CUE's "why" explanations for a pairing boils down to whether each number's *core theme* (see above) combines constructively or clashes with the other's. The same handful of thematic collisions repeat everywhere:

- **Structure vs. Freedom** (4 vs 5): the single most common friction pattern — discipline/routine directly fighting movement/change. Always scores low.
- **Power vs. Analysis/Avoidance** (8 vs 7): 8 enforces dominance, 7 refuses to engage with power dynamics at all — direct opposition, not a fight so much as total non-engagement. Consistently the lowest score on the whole board (10/100).
- **Responsibility vs. Freedom** (6 vs 5): same clash as structure-vs-freedom, but emotional (caretaking) instead of procedural.
- **Withdrawal vs. Connection** (7 vs 6): 6 seeks emotional closeness, 7 needs solitude — reads as rejection even when it isn't. Also very low (20/100).
- **Two masters compounding the same axis, well** (e.g., 1 + 11, 7 + 11): when one number provides a stable "container" (direction, independence) for another number's intensity (emotion, vision) *without contesting it*, scores are extremely high (90-99/100). The top scores in the whole system are consistently "one number leads/organizes, the other amplifies, and neither is fighting for the same role."
- **Same-theme overlap** (any number vs. itself, or two numbers sharing a theme, e.g. 3 vs 33): usually mid-high (60-80) — comfortable, but can tip into "too much of the same thing, nothing balances it out."
- **28** (a karmic-debt number that borrows Life Path 4's row in our table) reliably pairs with "pressure/timing/scaling" language — it behaves like a harder-edged 4.

The important finding for our purposes: **the numeric score already encodes all of this** — we don't need new numbers. What we were missing was the *reason* a given gap is small or large, which is exactly what turns "gap of 60 points" into an explainable signal instead of a black box.

## Ideas for boosting the sports betting numerology edge

Nothing below is implemented — these are observations worth considering later, flagged because they came directly out of this research and touch on things the current model doesn't yet use:

1. **"Clash type" as its own signal, not just gap size.** Right now `edgeTierForGap()` only looks at how far apart two combined scores are. But CUE's reasoning shows low scores aren't all the same *kind* of low: an "avoidance" clash (8 vs 7 — total disengagement) reads very differently from an "emotional breakdown" clash (6 vs 7 — active rejection) or a "grinding friction" clash (4 vs 5 — ongoing struggle but still engaged). It's plausible these different clash *flavors* correlate with different real-world outcomes (e.g. blowouts vs. close-but-ugly games vs. upsets) — worth testing once enough MLB/UFC/Tennis results have accumulated on the Stats page.

2. **A volatility/variance profile per Life Path, independent of direction.** Several numbers are explicitly framed by CUE around *swinginess* rather than good/bad: 8 is "easy come, easy go" (big boom/bust), 3 has a short attention span and inconsistent follow-through, 11 has genuine "duality" (great vs. terrible sides), while 4 is framed as steady/consistent and 6 as reliable. A person/team skewing toward high-volatility numbers might warrant a wider confidence interval on a single-game edge (i.e., a Kelly-style stake haircut) even when the average score looks favorable — separate from whether the edge is real.

3. **An athletic/physical archetype flag.** CUE explicitly calls out only three numbers as physically archetypal: 1 and 11 as "the athlete" (built for competition, thrive under physical stress), and 5 as physically active/model-body. It separately flags 7 as literally injury-prone (advises against high-risk physical activity) and 8 as prone to stress-related physical strain (not injury, just wear). None of this is used anywhere in the current UFC/Tennis/MLB models, which treat every Life Path as an equally "neutral" data point. Whether real fighters/players with these life paths actually show different injury or performance-under-physical-stress patterns is testable against our own Stats page history — but it's a genuinely new axis, not something already captured by the existing compat score.

4. **The pitcher-vs-lineup (person-vs-person) factor now has an explainable "why."** The MLB model's pitcher-vs-opposing-lineup average (in [polymarket-mlb.js](polymarket-mlb.js)) is exactly the kind of relationship CUE's reasoning describes. We don't need to change the math, but when reviewing a specific game's breakdown it's now possible to explain *why* a lineup full of 8s is a brutal matchup for a 7 pitcher (avoidance/opposition) versus why a lineup full of 5s is comparatively easy (coexistence without constraint) — useful for sanity-checking outlier games rather than just trusting a number.

None of this requires touching `compat-data.js`, `compat-engine.js`, or any scoring formula today — it's context for *how* to think about extending the model later, once there's enough resolved-game history on the Stats page to actually test any of it against real outcomes.
