# Research Workshop: Frankl's Conjecture: The Coupling Theorem for k=5

**Date:** 2026-04-29
**Models:** The Coupling Builder (codex/gpt-5.4), The Defect Analyst (codex/gpt-5.4), The Structure Miner (codex/gpt-5.4)
**Iterations:** 5, **Build passes:** 3

## Problem

The fiber decomposition technique proves max p_x >= 0.40 for union-closed families with minimal sets of size <= 4, strictly beating the entropy barrier of 0.382. For k=5 (all minimal sets of size >= 5), the technique stalls.

EXHAUSTED RESULTS (do not re-derive):

[DEAD-1] The uncoupled chamber-marginal LP has exact optimum (185-32B)/425, giving 0.3878 < 0.39 at B=75/119. No linear refinement of this LP can close the gap.
[DEAD-2] Every S_5-equivariant linear transfer from edge masses to vertex loads collapses to degree + total mass (dim Hom_{S_5}(E,V) = 2). The 5-dimensional irreducible of the Petersen graph is invisible to all such maps.
[DEAD-3] The isotropic point b_e = B/10 is the exact LP adversary. It is the barycenter of the 12 Hamilton 5-cycles of K_5.
[DEAD-4] Chamber-local LP refinements collapse because a single full-cube chamber state certifies all three opposite-pair demands simultaneously.
[DEAD-5] The triangle stable-set atom {12,13,23} kills every disjoint-pair-only bonus because its support is Petersen-stable.
[DEAD-6] Quadratic chamber energy q_c = sum b_e b_f over opposite pairs also vanishes on triangle atoms.
[DEAD-7] Adjacent-pair triple forcing collapses onto common 1234-good blocks via Lemma: two 3-cubes with 2-point overlap force the 4-cube.

PROVEN TOOLS AVAILABLE:
[P1] Fiber decomposition: F = disjoint union of {T union S : S in L_T}, each L_T union-closed with M in L_T.
[P2] Three-type rigidity: good fibers are untagged (floor 1/17), singly tagged (9/17 on support, 1/17 off), or full (1/2 everywhere).
[P3] Cross-fiber forcing: any two bad fibers with labels e,f force L_{T cup U} to contain 2^{e cup f} cup {M}.
[P4] A/B decomposition: if {x} in L then p_x(L) >= 1/2 via injection.
[P5] Augmentation defect identity: p_x = 1/2 + (|R_x| - |M_x|)/(2|F|) where M_x = bad augmentations, R_x = bad removals.

THE EXACT GAP: The LP adversary places b_e = B/10 uniformly and g_v = (1-B)/5 uniformly across chambers, making every vertex identical. No linear observable distinguishes this from the true fiber geometry. The proof MUST use a nonlinear or structural coupling between where bad mass sits and where good-fiber support localizes.

TARGET: Prove a coupling theorem of the form: for every union-closed family with all minimal sets of size >= 5, there exists a vertex x such that the localized good-fiber load through x satisfies lambda_x >= Phi_x(b) where Phi_x is strictly positive on the isotropic point. Combined with the proven vertex-frequency formula and [P1]-[P5], this would close max p_x >= 0.39.

ACCUMULATED KNOWLEDGE FROM PRIOR VARIANT RUNS:
# Unified Knowledge Base

Problem: frankl-coupling-theorem
Created: 2026-04-29T13:25:08.580Z

## PROVEN RESULTS
(none yet)

## DEAD APPROACHES
(none yet)

## OPEN QUESTIONS
(none yet)

## KEY INSIGHTS
(none yet)

---
### From variant: base (2026-04-29T14:12:13)

**Proven:**
- [P1] PROVEN: The production target should be a branch-native residual coordinate, not raw trade price.`   (by verify, iter 1)
- [P2] PROVEN: Deterministic branch routing A/B/C is architecturally mandatory.`   (by verify, iter 1)
- [P3] PROVEN: Fair-value state and execution/liquidity state must be separated.`   (by verify, iter 1)
- [P4] PROVEN: Incremental recomputation on the touched set plus bounded admissible neighbor closure is sufficient, provided the updater only reads bounded local support.`   (by verify, iter 1)
- [P5] PROVEN: Event-sourced EMMA processing with canonical correction/cancel reduction is the right dataflow invariant.`   (by verify, iter 1)
- [P6] PROVEN: The production state variable must be branch-native spread, not raw dollar price.`   (by verify, iter 1)
- [P7] PROVEN: Deterministic branch routing A/B/C is mandatory before any comparable transfer or modeling.`   (by verify, iter 1)
- [P8] PROVEN: TEY is a post-pricing scenario overlay, not a core model target.`   (by verify, iter 1)
- [P9] PROVEN: De minimis must be treated as a regime feature, not a cosmetic covariate.`   (by verify, iter 1)
- [P10] PROVEN: Comparable selection must be structure-first and tax-aware.`   (by verify, iter 1)
- [P11] PROVEN: Event-sourced ingestion plus deterministic canonical reduction is the correct pipeline invariant.`   (by verify, iter 1)
- [P12] PROVEN: Materialized per-CUSIP state is the right serving abstraction, not request-time recomputation from raw joins.`   (by verify, iter 1)
- [P13] PROVEN: Incremental recomputation on the touched set plus bounded neighbor closure is sufficient, provided the updater reads only bounded local support.`   (by verify, iter 1)
- [P14] PROVEN: Fair-value state and execution/liquidity state must be maintained as separate stores or at least separate state objects.`   (by verify, iter 1)
- [P15] PROVEN: A total fallback chain OWN_TRADE -> ISSUER/LOCAL GROUP -> COHORT -> STRUCTURAL PRIOR is sufficient for universal quote coverage.`   (by verify, iter 1)

**Dead:**
- [D1] predicting raw trade price directly across all muni structures. — REASON: see contribution (killed by The Quant, iter 1)
- [D2] using one comparable pool for bullets, ordinary calls, and sinkers. — REASON: see contribution (killed by The Quant, iter 1)
- [D3] treating TEY as the core model target. — REASON: see contribution (killed by The Quant, iter 1)
- [D4] FATAL FLAW: no` — REASON: failed verification (killed by verify, iter 1)
- [D5] FATAL FLAW: no` — REASON: failed verification (killed by verify, iter 1)
- [D6] FATAL FLAW: no` — REASON: failed verification (killed by verify, iter 1)


### Key Insight from base:
#### The Architect (codex/gpt-5.4)

**1. THEOREM/RESULT STATEMENT**

**PROVEN. Architectural Representation Theorem for Real-Time Municipal Bond Pricing**

Consider a production pricing service over a universe of municipal-bond CUSIPs. Assume:

1. Each bond `i` has known contract state `C_i`:
   coupon, maturity, call/sinking schedule, prerefunded status, tax flags, ratings, insurance, issuer/state/sector descriptors.

2. At each as-of time `t`, there is an exogenous market-factor snapshot `M_t`:
   Treasury curve, MMD curves, and derived global curve features.

3. Trades arrive as sparse, asynchronous, correction-prone tape events, and raw tape prints may differ from latent fair value because of execution effects.

4. Bond structures are routed into three deterministic pricing branches:
   - `A`: bullet / prerefunded / escrowed,
   - `B`: ordinary whole-bond par-call,
   - `C`: complex schedule (sinking fund / extraordinary / partial-redemption / other schedule-functional cases).

5. For each branch there exists a deterministic renderer mapping a branch-native residual coordinate plus `(C_i, M_t)` into price/yield analytics.

6. The online updater for a bond reads only:
   - its own current state,
   - the current global market snapshot,
   - a bounded admissible support set of related bonds.

Then the correct production architecture is not a single raw-price predictor. It is an **event-sourced, branch-routed, incrementally maintained latent-state system** with:

- a **branch-native residual fair-value state** `R_i(t)`,
- a separate **execution/liquidity state** `L_i(t)`,
- deterministic **branch rendering** from `(C_i, M_t, R_i(t), L_i(t))`,
- and **incremental recomputation only on the touched set plus bounded admissible neighbor closure**.

Moreover:

- raw trade price is not the correct system state;
- fair value and executable concession are structurally different outputs and must be separated;
- deterministic branch routing is mandatory before cross-bond transfer;
- universal quote coverage is achievable through the fallback chain  
  `OWN_TRADE -> ISSUER_GRAPH -> COHORT_GRAPH -> STRUCTURAL_PRIOR`.

This theorem is architectural: it establishes the correct state decomposition and dataflow for a production-grade system under sparse, irregular, corrected tape observations.


## Constraints

You MUST prove a NONLINEAR coupling theorem. Linear inequalities on edge masses, chamber marginals, or pattern masses are DEAD and may NOT be used as the primary mechanism. Acceptable proof techniques: (a) dependent couplings between X and Y that are NOT independent, (b) transport inequalities (Marton, Talagrand, or novel), (c) SDP/sum-of-squares certificates, (d) Shearer's inequality or submodularity on the projection poset, (e) quadratic or higher-order structural invariants that see the Petersen 5-irreducible, (f) any genuinely new mechanism that is positive on the isotropic adversary point. Tag all results as PROVEN/DEAD/OPEN.

## Creative Direction

THREE VIABLE ATTACK VECTORS:

(1) DEPENDENT COUPLING: Instead of X,Y iid uniform on F, construct Y = f(X) where f uses union-closure. Sawin's dependent coupling improved entropy by ~0.001 bits/coordinate. You need ~0.002 bits at the boundary. The fiber decomposition gives you structural information Sawin didn't have: you know the exact three-type good-fiber rigidity and the A/B decomposition. Can you build a coupling that exploits fiber structure to get the extra 0.001?

(2) AUGMENTATION DEFECT BOUND: From [P5], p_x = 1/2 + (|R_x|-|M_x|)/(2|F|). The problem reduces to: find x with net augmentation defect |M_x|-|R_x| <= 0.22|F|. On the isotropic point, every x has the same defect. But in a REAL union-closed family, the augmentation map A -> A cup {x} has structure from union-closure that the LP ignores. Can you prove that union-closure forces SOME x to have small defect by a pigeonhole/counting argument on the augmentation failures?

(3) PROJECTION POSET SUBMODULARITY: The good-fiber tag set Z(T) = {z : L_T is A_z-good} has structure from union-closure: if T1 cup T2 = V and both L_{T1}, L_{T2} are tagged, then L_V might be forced to have higher overlap. The projection poset P inherits union-closure. Can you prove a submodularity or Shearer-type inequality on the tag distribution over P that forces concentration of tags around specific vertices?

---

## Iteration 1

### EXPLORE

#### The Coupling Builder (codex/gpt-5.4)

Assume the stronger axiom:

> **Stable-element hypothesis.** There exists `x` such that for every `A in F` with `x notin A`, we have `A U {x} in F`.

This immediately gives a concrete **dependent coupling** and it is much stronger than the `0.39` target.

**CONDITIONAL-PROVEN: Stable augmentation coupling**
Take `X ~ Unif(F)` and define
\[
Y := X\cup\{x\}.
\]
This is a deterministic dependent coupling, not an iid comparison.

Its exact properties are:
\[
X\subseteq Y,\qquad d_H(X,Y)=\mathbf 1_{\{x\notin X\}},\qquad Y\in F \text{ always.}
\]
So the coupling bonus is
\[
\Delta_x := \mathbb E[d_H(X,Y)] = \Pr(x\notin X)=1-p_x.
\]
At the isotropic LP point this is strictly positive, because no vertex has frequency `1`. In particular, if one plugs the boundary value coming from the stalled LP regime, this bonus is still positive. The key structural feature it sees is **one-coordinate upward closure**; that is exactly what all linear edge/chamber observables miss.

Now combine with `[P5]`:
\[
p_x=\frac12+\frac{|R_x|-|M_x|}{2|F|}.
\]
Under stability, `M_x = emptyset` exactly, because no augmentation by `x` ever fails. Therefore
\[
p_x=\frac12+\frac{|R_x|}{2|F|}\ge \frac12.
\]
So:

**CONDITIONAL-PROVEN:** the stable-element axiom would imply Frankl not just at `0.39`, but at `0.5`.

That is already the first de-conditioned lemma candidate:

**UNCONDITIONAL:** for any fixed `x`, if you can prove `M_x=emptyset`, then `[P5]` gives `p_x>=1/2` immediately.  
**OPEN:** can one force `M_x` to be small, rather than zero, from fiber geometry alone?

---

**Fiber consequences**

Write the fiber decomposition `[P1]` as
\[
F=\bigsqcup_T \{T\cup S: S\in L_T\}.
\]

Fix the stable element `x`.

If `x notin T`, then for every `S in L_T`,
\[
T\cup S\in F \implies T\cup S\cup\{x\}\in F.
\]
Since `x notin T`, this says exactly:
\[
S\in L_T \implies S\cup\{x\}\in L_T.
\]
So each fiber with base avoiding `x` is internally `x`-upward-closed.

That gives the fiberwise coupling
\[
Y_T := X_T\cup\{x\},\qquad X_T\sim \text{Unif}(L_T),
\]
for every `T` with `x notin T`.

Hence:

**CONDITIONAL-PROVEN:** every fiber with `x notin T` is `A_x`-good in the strongest possible sense; not merely tagged, but closed under augmentation by `x`.

From `[P4]` this yields, fiberwise,
\[
p_x(L_T)\ge \frac12 \qquad (x\notin T).
\]

So any reasonable localized good-fiber load satisfies
\[
\lambda_x \ge \sum_{T:\,x\notin T}\frac{|L_T|}{|F|}.
\]
This is an explicit candidate for the desired nonlinear lower bound:
\[
\Phi_x := \mu\{T:x\notin T\},
\]
where `mu(T)=|L_T|/|F|` is the fiber-mass distribution.

At the isotropic chamber point, this is strictly positive. If the 5 chamber masses are uniform
\[
g_v=\frac{1-B}{5},
\]
then
\[
\Phi_x^{\mathrm{iso}} = \sum_{v\in C_x} g_v
= |C_x|\frac{1-B}{5}>0,
\]
where `C_x` is the set of chamber indices whose base omits `x`. At `B=75/119`,
\[
\frac{1-B}{5}=\frac{44}{595}\approx 0.07395,
\]
so the bonus is at least `44/595`, and under the usual singleton-base indexing it is `4*44/595 = 176/595 ≈ 0.2958`.

So this coupling is positive on the isotropic adversary point exactly as required.

---

**Label-graph/chamber consequences**

Let `P_x := {T : x in T}` be the principal filter in the projection poset.

Because every `T notin P_x` fiber is automatically `x`-good:

**CONDITIONAL-PROVEN:** all genuinely bad fibers must lie inside `P_x`.

Equivalently, bad mass is supported on a codimension-1 cap of the projection poset. This is a nonlinear support statement, not a linear marginal statement.

That gives a transport formulation. Let `mu` be the chamber/fiber-mass law, and define the projection coupling
\[
\pi_x:\ T\mapsto T\cup\{x\}.
\]
Then `pi_x# mu` is supported on `P_x`, and the exact transport cost is
\[
\mathsf{Cost}_x(\mu)=\mu(P_x^c).
\]
So:

**CONDITIONAL-PROVEN:** any isotropic law must pay transport cost
\[
\mu_{\mathrm{iso}}(P_x^c)=\Phi_x^{\mathrm{iso}}>0
\]
to reach a stable-element configuration.

This is the cleanest nonlinear obstruction to the isotropic adversary: isotropy spreads mass across all chambers, while stability forces all bad mass into one principal filter.

---

**What de-conditions cleanly**

**UNCONDITIONAL:** If a specific fiber `L_T` satisfies `S -> S U {x}` internally, then that fiber contributes an `x`-bonus via the same deterministic coupling. No global hypothesis needed.

**UNCONDITIONAL:** `[P4]` plus `{x} in L_T` gives `p_x(L_T)>=1/2`. So proving `{x} in L_T` for many fibers is already useful even without full stability.

**OPEN:** can one prove that for some `x`, a positive proportion of fibers with `x notin T` are internally `x`-upward-closed? That would be a de-conditioned version of the stable-element mechanism.

**OPEN:** can one prove a weaker support theorem, e.g. “for some `x`, most bad mass lies in `P_x`”? That would already yield
\[
\lambda_x \ge \mu(P_x^c)-\varepsilon
\]
and would still beat the isotropic point if `\varepsilon` is small enough.

---

**Why the old couplings fail**

**DEAD diagnosis:** iid or linear-transfer couplings only see one- and two-point marginals of chamber/edge mass. They do **not** see the directed support relation
\[
A \leadsto A\cup\{x\},
\]
which is the whole content of stability.

**DEAD diagnosis:** disjoint-pair or opposite-pair energies fail because triangle atoms can preserve all those pair counts while violating coordinatewise upward closure. They miss the monotone transport structure.

So the correct lesson from the stable-element axiom is:

**Main conditional takeaway.** The right nonlinear observable is not an edge functional. It is the mass of fibers/chambers that can be pushed upward by one fixed coordinate under the deterministic coupling `S -> S U {x}`. Under the axiom, this gives a strict positive bonus at the isotropic point and forces bad mass into a principal filter.

That looks like the most promising lemma to try to de-condition.

#### The Defect Analyst (codex/gpt-5.4)

**Defect Consequences**

Let  
\[
D_x:=|M_x|-|R_x|,\qquad p_x=\frac12-\frac{D_x}{2|F|}=\frac12+\frac{|R_x|-|M_x|}{2|F|}.
\]

Assume the workshop hypothesis `H`: every union-closed family has a stable element \(x\), meaning
\[
A\in F,\ x\notin A \implies A\cup\{x\}\in F.
\]

Then immediately:

- **CONDITIONAL/PROVEN under H.** For the stable \(x\), \(M_x=0\). Hence
  \[
  D_x=-|R_x|\le 0,\qquad p_x=\frac12+\frac{|R_x|}{2|F|}\ge \frac12.
  \]
  So the target \(p_x\ge 0.39\) is not merely closed; it is overshot by a margin \(0.11\).

This is the most brutal consequence: the augmentation-defect problem disappears for one vertex.

A sharper fiberwise version is also immediate.

- **UNCONDITIONAL/PROVEN.** If a specific element \(x\) is stable in a given family \(F\), then for every fiber \(L_T\) in [P1],
  \[
  M_x(T)=0
  \]
  whenever \(x\in M\), because stability acts inside each fiber:
  \[
  S\in L_T,\ x\notin S \implies S\cup\{x\}\in L_T.
  \]
  Therefore
  \[
  p_x(L_T)=\frac12+\frac{|R_x(T)|}{2|L_T|}\ge \frac12.
  \]

This implication does not use the global hypothesis “every family has a stable element”; it only uses stability of one chosen \(x\).

---

**Good-Fiber Localization**

Now take the important case \(k=5\), with \(|M|=5\), and suppose the stable element lies in the minimal set: \(x\in M\).

By [P2], every good fiber is one of:

- untagged: all coordinates \(1/17\),
- singly tagged at \(z\): coordinate \(z\) gets \(9/17\), the other four get \(1/17\),
- full: all coordinates \(1/2\).

But from the fiberwise defect identity above, every fiber satisfies \(p_x(L_T)\ge 1/2\). Therefore:

- **UNCONDITIONAL/PROVEN.** If \(x\in M\) is stable, then every good fiber is either:
  - \(x\)-tagged, or
  - full.

The untagged type and every \(z\)-tagged type with \(z\neq x\) are excluded, because they give \(x\)-frequency \(1/17<1/2\).

This is already the nonlinear coupling shape the program wants: all good support is forced to localize through one vertex.

So if \(\lambda_x\) denotes any “localized good-fiber load through \(x\)” that counts a good fiber when \(x\) lies in its support, then:

- **CONDITIONAL/PROVEN under H, in the subcase \(x\in M\).**
  \[
  \lambda_x = G,
  \]
  where \(G\) is the total good-fiber mass. In particular \(\Phi_x(b)=G\), which is strictly positive as soon as there is any good mass at all.

At the isotropic LP point the obstruction was that good mass could be spread symmetrically. Stable \(x\in M\) destroys that symmetry completely: every good fiber must point at \(x\) or be full.

This is exactly the kind of structural coupling the LP cannot see.

---

**Stable Element Outside \(M\)**

Now suppose the stable element is \(x\notin M\). Then stability acts between fibers, not inside one fiber.

For any outside pattern \(T\subseteq V\setminus M\) with \(x\notin T\), the map
\[
\iota_T:L_T\hookrightarrow L_{T\cup\{x\}},\qquad S\mapsto S
\]
is injective, because
\[
T\cup S\in F \implies T\cup S\cup\{x\}\in F.
\]
Hence:

- **UNCONDITIONAL/PROVEN.** If \(x\notin M\) is stable, then
  \[
  |L_{T\cup\{x\}}|\ge |L_T|
  \]
  for every \(T\) with \(x\notin T\).

Pairing the two fibers \(T\) and \(T\cup\{x\}\), the contribution of this pair to \(p_x\) is
\[
\frac{|L_{T\cup\{x\}}|}{|L_T|+|L_{T\cup\{x\}}|}\ge \frac12.
\]
Summing over all pairs gives again \(p_x\ge 1/2\).

So the two cases are structurally different:

- \(x\in M\): stability forces **intra-fiber localization**.
- \(x\notin M\): stability forces **inter-fiber monotonicity**.

For the coupling theorem, the \(x\in M\) case is much stronger because it directly kills the isotropic chamber symmetry on the 5-set.

---

**Concrete Defect Counts**

1. **Full cube \(F=2^{[5]}\).** Every \(x\) is stable.
   \[
   M_x=0,\quad R_x=0,\quad D_x=0,\quad p_x=\frac12.
   \]
   Fiber type: full.

2. **Principal filter with a bottom point**
   \[
   F=\{\varnothing\}\cup\{A\subseteq[n]:x\in A\}.
   \]
   Then \(x\) is stable. Explicitly:
   \[
   M_x=0,
   \qquad
   R_x=2^{n-1}-1,
   \qquad
   |F|=2^{n-1}+1.
   \]
   Hence
   \[
   p_x=\frac12+\frac{2^{n-1}-1}{2(2^{n-1}+1)}
       =\frac{2^{n-1}}{2^{n-1}+1}.
   \]
   Here stability does not mean removals are rare; it means augmentations never fail.

3. **All sets containing a fixed 5-set \(M\):**
   \[
   F=\{A:M\subseteq A\subseteq M\cup U\}.
   \]
   Every \(x\in M\) is stable, and in fact \(p_x=1\). In fiber language, each fiber is the singleton family \(\{M\}\), so
   \[
   M_x(T)=0,\quad R_x(T)=1,\quad p_x(L_T)=1.
   \]
   This is the extreme form of complete localization through \(x\).

4. **Outside stable coordinate**
   \[
   F=2^M\times\{\emptyset,\{x\}\}
   \]
   with \(x\notin M\). Then \(x\) is stable and every pair of fibers has equal size:
   \[
   |L_T|=|L_{T\cup\{x\}}|.
   \]
   Thus
   \[
   M_x=0,\quad R_x=0,\quad p_x=\frac12.
   \]
   This is the equality case for inter-fiber monotonicity.

These examples show the defect identity is the right lens: stability annihilates \(M_x\), while \(R_x\) measures how far above \(1/2\) one gets.

---

**Label-Graph Consequences**

Here is the strongest forward consequence I trust cleanly.

- **CONDITIONAL/PROVEN under H, if the stable element lies in \(M\).** Any chamber/good-fiber configuration whose support misses \(x\) is forbidden globally, because it would create a good fiber with \(p_x=1/17<1/2\), contradicting fiberwise stability.

This means the isotropic adversary cannot survive as actual fiber geometry once a stable \(x\in M\) exists.

A sharper statement one would want is:

- **OPEN.** Can one prove unconditionally that there exists \(x\in M\) such that all or most bad labels are incident to \(x\) (a star concentration in the label graph)?

That would be a true nonlinear replacement for the dead equivariant linear transfers. If established, it would see the Petersen \(5\)-irreducible because “all labels in a star” is not an isotropic linear condition.

---

**What De-conditions Cleanly**

- **UNCONDITIONAL/PROVEN.** For any fixed stable \(x\), \(M_x=0\) and \(p_x\ge 1/2\).
- **UNCONDITIONAL/PROVEN.** If that stable \(x\) lies in the chosen minimal 5-set \(M\), every good fiber is \(x\)-tagged or full.
- **UNCONDITIONAL/PROVEN.** If that stable \(x\) lies outside \(M\), paired fibers satisfy \(|L_{T\cup\{x\}}|\ge |L_T|\).

What does **not** de-condition is the existence of such an \(x\):

- **OPEN.** Show unconditionally that some \(x\) is stable.
- **OPEN.** Show a weaker “approximate stability”:
  \[
  |M_x|\le \eta |F|
  \]
  for some \(\eta<0.22\), or fiberwise on a large submass.
- **OPEN.** Show a weaker support-localization statement: for some \(x\in M\), a positive fraction of good fibers must be \(x\)-tagged or full.

That last open statement is, to me, the cleanest survivable residue of the hypothesis. It is exactly the sort of nonlinear coupling theorem the isotropic LP point cannot fake.

#### The Structure Miner (codex/gpt-5.4)

Assume the strengthened hypothesis as an axiom:

\[
\exists x\in \bigcup \mathcal F \quad \forall A\in \mathcal F,\ x\notin A \implies A\cup\{x\}\in\mathcal F.
\]

I will call such an \(x\) a stable element.

The first point is that this hypothesis is much stronger than the \(0.39\) target.

**CONDITIONAL 1. Stable element forces \(p_x\ge \tfrac12\).**  
The map
\[
\iota_x:\{A\in\mathcal F:x\notin A\}\to \{A\in\mathcal F:x\in A\},\qquad A\mapsto A\cup\{x\}
\]
is injective. Hence \(|\mathcal F_x|\ge |\mathcal F_{\bar x}|\), so
\[
p_x=\frac{|\mathcal F_x|}{|\mathcal F|}\ge \frac12.
\]
In the language of [P5], \(M_x=\varnothing\), so
\[
p_x=\frac12+\frac{|R_x|}{2|\mathcal F|}.
\]

This is just [P4] globally, but the useful part is what it implies fiberwise.

There are two regimes.

1. If \(x\notin M\), then \(x\) is stable inside every local family \(L_T\), so each fiber individually has \(p_x(L_T)\ge 1/2\). This already solves the problem under the hypothesis.
2. The only structurally interesting case is \(x\in M\). Then stability becomes a monotonicity relation between paired fibers.

**CONDITIONAL 2. Fiber monotonicity across the \(x\)-direction.**  
Assume \(x\in M\). For every \(T\subseteq M\setminus\{x\}\),
\[
L_T\subseteq L_{T\cup\{x\}}.
\]
Proof: if \(S\in L_T\), then \(T\cup S\in\mathcal F\). Stability gives \((T\cup S)\cup\{x\}\in\mathcal F\), hence \(S\in L_{T\cup\{x\}}\).

So the \(x\)-columns of the projection poset are monotone. Define the local increment
\[
\delta_x(T):=|L_{T\cup\{x\}}|-|L_T|\ge 0.
\]
Then
\[
p_x=\frac12+\frac{1}{2|\mathcal F|}\sum_{T\subseteq M\setminus\{x\}}\delta_x(T).
\]

This is already a nonlinear structural statement: the defect is not an averaged LP variable, it is a monotone transport along one coordinate of the projection poset.

Now the Petersen geometry appears.

Define, for a bad fiber \(T\), its label vector \(v_T\in\mathbb R^{10}\) by \((v_T)_e=1\) if \(T\) has label \(e\), else \(0\). More generally, one can allow fractional bad mass on labels. Let \(A_{\mathrm{Pet}}\) be the adjacency matrix of the Petersen graph on the \(10\) edges of \(K_5\), so
\[
(A_{\mathrm{Pet}})_{ef}=1 \iff e\cap f=\varnothing.
\]

The exact invariant is:

\[
\Theta_x:=\sum_{T\subseteq M\setminus\{x\}} v_T^{\!\top}A_{\mathrm{Pet}}\, v_{T\cup\{x\}}.
\]

This counts disjoint label pairs across comparable fibers in the \(x\)-direction.

**CONDITIONAL 3. Stable element kills comparable disjointness energy.**  
Under the stable-element hypothesis with \(x\in M\),
\[
\Theta_x=0.
\]

Reason: if \(T\subseteq T\cup\{x\}\) are both bad with labels \(e,f\) and \(e\cap f=\varnothing\), then [P3] applied to the pair \((T,T\cup\{x\})\) forces \(L_{T\cup\{x\}}\) to contain \(2^{e\cup f}\cup\{M\}\), contradicting badness.

This is the first genuinely Petersen-sensitive invariant: it uses the disjointness matrix \(A_{\mathrm{Pet}}\), hence sees the \(5\)-irreducible that [DEAD-2] says no linear transfer can detect.

**Verification on the isotropic adversary.**  
At the isotropic point, each bad label distribution is uniform:
\[
v_T=\frac{\beta_T}{10}\mathbf 1
\]
with \(\beta_T\) the bad mass of chamber \(T\). Since every edge of \(K_5\) has exactly \(3\) disjoint partners,
\[
\mathbf 1^\top A_{\mathrm{Pet}}\mathbf 1 = 30.
\]
Therefore
\[
\Theta_x^{\mathrm{iso}}
=\sum_T \frac{\beta_T}{10}\mathbf 1^\top A_{\mathrm{Pet}}\frac{\beta_{T\cup\{x\}}}{10}\mathbf 1
=\frac{3}{10}\sum_T \beta_T\beta_{T\cup\{x\}}.
\]
So \(\Theta_x^{\mathrm{iso}}>0\) whenever adjacent \(x\)-levels carry positive bad mass. This is exactly the kind of nonlinear invariant the LP misses: positive at the isotropic adversary, but forced to vanish by a structural coupling.

Now de-condition the core lemma.

**UNCONDITIONAL 4. Comparable bad fibers have intersecting labels.**  
For any \(T\subseteq U\), if both \(L_T\) and \(L_U\) are bad with labels \(e,f\), then
\[
e\cap f\neq \varnothing.
\]
This is the same [P3] argument, since \(T\cup U=U\).

So the vanishing of Petersen-disjointness is not really about stability; stability merely guarantees many comparable pairs, namely all \(x\)-columns.

A stronger unconditional corollary follows immediately.

**UNCONDITIONAL 5. Labels on any bad chain form a pairwise-intersecting family of edges of \(K_5\).**  
If
\[
T_0\subset T_1\subset \cdots \subset T_r
\]
and each \(L_{T_i}\) is bad with label \(e_i\), then
\[
e_i\cap e_j\neq \varnothing \quad \forall i<j.
\]

Hence, by the classification of intersecting families of \(2\)-subsets of \([5]\), the label set on a chain lies in one of only two types:

1. a star \(\{xy:x\in \cdot\}\), or
2. a triangle \(\{ab,ac,bc\}\).

So stability would collapse the bad-label dynamics along an \(x\)-direction to a star-or-triangle alternative.

That is the main structural consequence.

**OPEN 6. Star-or-triangle dichotomy for stable columns.**  
Under the hypothesis, every \(x\)-column of bad fibers is an intersecting system, hence star-or-triangle. If one could prove that the triangle case cannot persist on a positive fraction of an \(x\)-column without creating \(x\)-localized good load, then the coupling theorem would follow.

More concretely, the likely route is:

- star case: a common vertex \(y\) should force \(A_y\)-good localization and give \(\lambda_y\) directly;
- triangle case: this is the only obstruction, and it matches [DEAD-5], so the problem is reduced to showing that triangle propagation across comparable fibers is incompatible with three-type rigidity plus monotone transport.

A usable nonlinear potential for this reduction is the star-defect functional
\[
\Psi_x:=\sum_{T\subseteq M\setminus\{x\}}
\min_{y\in M\setminus\{x\}}
\sum_{e\not\ni y} (v_T(e)+v_{T\cup\{x\}}(e)).
\]
If \(\Theta_x=0\), then each paired support is intersecting, so \(\Psi_x=0\) exactly in the star case and positive in the triangle case. This separates the two EKR extremizers. At the isotropic adversary, \(\Psi_x\) is strictly positive because uniform edge mass is far from any star.

So the structural picture under the hypothesis is:

- stable \(x\) gives monotone fiber transport \(L_T\subseteq L_{T\cup\{x\}}\);
- comparable disjointness energy against the Petersen adjacency must vanish;
- isotropic LP mass makes that same energy strictly positive;
- hence the isotropic adversary is incompatible with stable transport;
- the remaining geometry along stable columns is forced into star-or-triangle intersecting patterns.

**Best unconditional lemma extracted from this run:**  
The comparable-fiber intersection lemma:
\[
T\subseteq U,\ L_T,L_U\text{ bad}\quad\Longrightarrow\quad \ell(T)\cap \ell(U)\neq\varnothing.
\]
This is independent of the stable-element hypothesis, genuinely nonlinear/Petersen-sensitive, and not visible to any linear chamber-marginal LP.

**OPEN next step.**  
Promote the unconditional comparable-fiber intersection lemma into a quantitative lower bound on \(\lambda_y\) by proving that a long intersecting chain of bad labels cannot remain triangle-type without forcing a good \(y\)-load. That is the de-conditioning bottleneck.

### BUILD — Pass 1

#### The Coupling Builder (codex/gpt-5.4)

**Coupling Build**

Take the strengthened workshop hypothesis in the only nontrivial form:

- `H_x`: there exists a stable `x in M` such that `L_T subseteq L_{T cup {x}}` for every `T subseteq M \ {x}`.

I will use this to build an explicit dependent coupling on **comparable bad fibers**, then strip off the parts that do not actually need `H_x`.

Let `E = binom(M,2)` be the 10 edge-labels.  
For a column pair `(T, T^+) := (T, T cup {x})`, write

- `alpha_T` = label law on `L_T` conditioned on `L_T` being bad,
- `beta_T` = label law on `L_{T^+}` conditioned on `L_{T^+}` being bad.

The uncoupled LP adversary uses the product law `nu_T := alpha_T otimes beta_T`. At the isotropic point this is just `u_10 otimes u_10`.

Now impose the actual geometry.

For any comparable bad pair, prior work already gives:

- `UNCONDITIONAL`: if `L_T` and `L_U` are both bad with labels `e,f` and `T subseteq U`, then `e cap f neq emptyset`.

So the **true** pair law must live on
\[
I:=\{(e,f)\in E\times E: e\cap f\neq\varnothing\}.
\]

That gives the exact dependent-coupling constraint:
\[
\mu_T \in \Pi(\alpha_T,\beta_T),\qquad \mathrm{supp}(\mu_T)\subseteq I.
\]

This is nonlinear and Petersen-sensitive: it kills precisely the disjoint-support part that the LP cannot see.

---

**Transport Consequence**

Define the Hamming transport cost on `E x E` by changing one endpoint-edge at cost `1`. Then:

- `UNCONDITIONAL`: for any pair law `mu` supported on `I`,
\[
W_1(\mu,\nu)\ge \nu(I^c).
\]

At the isotropic point `nu = u_10 otimes u_10`,
\[
\nu(I^c)=\mathbb P(e\cap f=\varnothing)=\frac{30}{100}=\frac{3}{10}.
\]

Reason: every disjoint ordered pair must be repaired by changing at least one coordinate. This lower bound is sharp: one can repair each disjoint pair by resampling one edge to an adjacent edge.

So:

- `CONDITIONAL`: every stable column forces at least `3/10` transport away from the isotropic product coupling.
- `OPEN`: convert this transport cost into localized good load `lambda_y`.

This is already a genuine transport inequality against the isotropic adversary.

---

**Common-Vertex Bonus**

The right nonlinear observable is not diagonal collision `1_{e=f}`. It is **shared-vertex mass**:
\[
\Gamma_y(\mu):=\mu\{(e,f): y\in e\cap f\}.
\]

Then
\[
\sum_{y\in M}\Gamma_y(\mu)=\mathbb E_\mu |e\cap f|.
\]

Since every pair in `I` intersects,
\[
\mathbb E_\mu |e\cap f|\ge 1.
\]
Hence:

- `UNCONDITIONAL`:
\[
\max_{y\in M}\Gamma_y(\mu)\ge \frac15.
\]

At the isotropic product law `nu = u_10 otimes u_10`,
\[
\Gamma_y(\nu)=\Big(\frac{4}{10}\Big)^2=\frac{4}{25}.
\]

Therefore every intersecting coupling has a vertex with strict bonus
\[
\max_y \Gamma_y(\mu)-\Gamma_y(\nu)\ge \frac15-\frac{4}{25}=\frac1{25}>0.
\]

This is the cleanest positive-on-isotropy nonlinear bonus I know.

So for a stable column, if `w_T` denotes the mass of the event “both fibers are bad”, then:

- `CONDITIONAL`:
\[
\exists y\in M\quad \sum_T w_T\,\Gamma_y(\mu_T)\ \ge\ \frac15\sum_T w_T.
\]

At the isotropic point the uncoupled value is
\[
\frac{4}{25}\sum_T w_T,
\]
so the column gains at least
\[
\frac1{25}\sum_T w_T.
\]

That is an explicit candidate lower bound
\[
\Phi_y^{\mathrm{pair}}(b):=\frac1{25}\sum_T w_T.
\]

---

**Exact Isotropic Extremizer Under the Intersection Constraint**

If we also impose `S_5` symmetry on the pair law, the unique minimizer of information relative to isotropic product is
\[
\mu^* = (u_{10}\otimes u_{10})\mid I.
\]

Then every intersecting ordered pair has mass `1/70`, and for each vertex `y`:

- 4 same-edge ordered pairs through `y`,
- 12 adjacent-distinct ordered pairs sharing `y`.

So
\[
\Gamma_y(\mu^*)=\frac{16}{70}=\frac{8}{35}.
\]

Compared with isotropic product:
\[
\frac{8}{35}-\frac{4}{25}=\frac{12}{175}>0.
\]

Also the entropic cost is exact:
\[
D(\mu^* \| u_{10}\otimes u_{10})=\log\frac{10}{7}.
\]

So the least expensive `S_5`-equivariant repair of isotropy already forces a per-vertex common-intersection bonus `12/175`.

---

**Failure Mode**

A tempting but wrong observable is diagonal collision:
\[
\Delta(\mu):=\mu\{e=f\}.
\]

- `DEAD`: `Delta` is not a valid primary bonus.
- Reason: intersecting couplings can have `Delta=0` by living entirely on adjacent-distinct pairs. Triangle/star structure kills disjointness without forcing equality.

So the structural feature diagonal collision misses is exactly this: **the repair mechanism is “share a vertex”, not “be the same edge.”**

---

**What This Gives Toward `lambda_y`**

The missing de-conditioning step is now very sharp:

- `OPEN`: prove a conversion lemma of the form
\[
\lambda_y \ge c\,\sum_T w_T\,\Gamma_y(\mu_T)
\]
for some absolute `c>0`.

If that lemma holds, then at isotropy one gets immediately
\[
\lambda_y \ge c\cdot \frac1{25}\sum_T w_T
\]
in general, and under the symmetric repair,
\[
\lambda_y \ge c\cdot \frac{12}{175}\sum_T w_T.
\]

That would be exactly the requested theorem shape: a nonlinear coupling functional, explicitly positive at the isotropic point, and invisible to all dead linear transfers.

**Net new lemma extracted**
\[
\boxed{\text{Comparable bad-pair couplings must carry at least }1/25\text{ shared-vertex bonus over isotropic product.}}
\]

This is unconditional once one has a comparable bad pair, and under a stable column it applies systematically across all `x`-columns.

#### The Defect Analyst (codex/gpt-5.4)

**CONDITIONAL 1. Stable `x` only gains defect from strict column growth.**

Assume the workshop column hypothesis:

\[
H_x:\qquad L_T\subseteq L_{T^+}\ \text{ for every }T\subseteq M\setminus\{x\},\quad T^+=T\cup\{x\}.
\]

For the two-layer slab
\[
\mathcal C_T:=\{T\cup S:S\in L_T\}\ \sqcup\ \{T^+\cup S:S\in L_{T^+}\},
\]
the exact `x`-defect is

\[
M_x(\mathcal C_T)=0,\qquad R_x(\mathcal C_T)=|L_{T^+}\setminus L_T|=: \delta_x(T).
\]

So
\[
p_x(\mathcal C_T)=\frac12+\frac{\delta_x(T)}{2|\mathcal C_T|}.
\]

This is the sharp defect formulation for the stable direction: comparable-label geometry matters for `x` only through actual strict inclusion, not through label overlap alone.

---

**PROVEN 2. Shared-vertex coupling does not by itself force any positive `x`-defect.**

Take the triangle prototype
\[
G_\triangle:=\{\varnothing,12,13,23,123\},
\]
which is union-closed on `[3]`. Double it in the stable `x`-direction:
\[
\mathcal F_\triangle^{(x)}:=\{S:S\in G_\triangle\}\cup \{S\cup\{x\}:S\in G_\triangle\}.
\]

Then every column pair is identical, so
\[
L_T=L_{T^+}=G_\triangle,\qquad \delta_x(T)=0.
\]
Hence
\[
M_x=0,\qquad R_x=0,\qquad p_x=\frac12.
\]

But the comparable bad-pair law is maximally intersecting-triangle type, with
\[
\Gamma_1=\Gamma_2=\Gamma_3=\Big(\frac23\Big)^2=\frac49>\frac{4}{25}.
\]

So:

**DEAD.** Any theorem of the form “large shared-vertex bonus on comparable bad labels implies positive defect for the same stable coordinate `x`” is false.  
Reason: `\mathcal F_\triangle^{(x)}` has strong intersecting coupling but exact `x`-defect `R_x-M_x=0`.

This narrows the target: the coupling must be converted into defect for some **label vertex** `y`, not for the transport coordinate `x`.

---

**PROVEN 3. Concrete defect counts on the triangle prototype.**

For
\[
G_\triangle=\{\varnothing,12,13,23,123\},
\]
direct counting gives, for `y=1` (and symmetrically `2,3`),
\[
M_1=1\quad(\varnothing\to 1\notin G_\triangle),
\]
\[
R_1=2\quad(12\to 2\notin G_\triangle,\ 13\to 3\notin G_\triangle),
\]
so
\[
R_1-M_1=1,\qquad p_1=\frac12+\frac1{2\cdot 5}=\frac35.
\]

For the doubled family `\mathcal F_\triangle^{(x)}` this simply doubles:
\[
M_1=2,\qquad R_1=4,\qquad R_1-M_1=2,\qquad p_1=\frac12+\frac2{2\cdot 10}=\frac35.
\]

Thus triangle-type comparable bad mass already gives a positive `y`-defect, but only at density
\[
\frac{R_1-M_1}{|\mathcal F_\triangle^{(x)}|}=\frac{2}{10}=\frac15.
\]

This is the concrete low-defect benchmark.

---

**PROVEN 4. Concrete defect counts on the star prototype.**

Let
\[
G_{\star,4}(1):=\{\varnothing\}\cup\bigl\{\{1\}\cup A:\varnothing\neq A\subseteq\{2,3,4,5\}\bigr\}.
\]
This is union-closed, size `16`.

For the hub vertex `1`,
\[
M_1=1\quad(\varnothing\to 1\notin G_{\star,4}(1)),
\]
and every nonempty member loses membership when `1` is removed, so
\[
R_1=15.
\]
Hence
\[
R_1-M_1=14,\qquad p_1=\frac12+\frac{14}{32}=\frac{15}{16}.
\]

For any leaf, say `2`,
\[
M_2=1,\qquad R_2=1,\qquad p_2=\frac12.
\]

So star-type intersecting mass localizes defect extremely hard onto the hub and is not the obstruction.

---

**PROVEN 5. Triangle is the only plausible low-defect intersecting extremizer.**

On the two canonical pairwise-intersecting edge shapes:

- star hub: normalized defect `=14/16=7/8`;
- triangle vertex: normalized defect `=1/5` on the doubled prototype.

So if a bad column deconditions to an intersecting label system, the only shape with genuinely modest positive defect is triangle-type, exactly matching `[DEAD-5]`.

This is the defect-side version of the earlier structural dichotomy:
\[
\text{intersecting column} = \text{star or triangle},
\]
and only triangle can plausibly sit near the `0.39` boundary.

---

**OPEN 6. Best possible conversion constant from pair bonus to defect.**

On the doubled triangle prototype,
\[
\Gamma_1=\frac49,\qquad \frac{R_1-M_1}{|\mathcal F|}=\frac15.
\]
Therefore any universal implication of the form
\[
\frac{R_y-M_y}{|\mathcal F|}\ge c\,\Gamma_y
\]
must satisfy
\[
c\le \frac{1/5}{4/9}=\frac{9}{20}.
\]

If one uses excess over isotropic baseline,
\[
\Gamma_1-\frac{4}{25}=\frac{64}{225},
\]
then necessarily
\[
c\le \frac{1/5}{64/225}=\frac{45}{64}.
\]

So the triangle prototype supplies an exact quantitative ceiling for any coupling-to-defect theorem.

---

**Net defect takeaway**

The augmentation defect problem has now split cleanly:

1. Shared-vertex coupling on comparable bad fibers is real and nonlinear.
2. It cannot directly pay defect to the transport coordinate `x`.
3. Star columns are defect-benign.
4. Triangle columns are the only serious low-defect obstruction, with explicit benchmark `1/5`.

The next lemma should be triangle-specific: show that a positive density of triangle-type comparable bad slabs cannot persist without forcing either:
\[
\text{(i) strict column growth } \delta_x(T)>0,
\]
or
\[
\text{(ii) extra localized good load on one triangle vertex beyond the prototype }1/5.
\]

That is the remaining defect bottleneck.

#### The Structure Miner (codex/gpt-5.4)

**Invariant**

For a comparable bad slab `(T,T^+)` with bad-label laws `α_T, β_T ∈ Δ(E)` on `E = \binom{M}{2}`, define the Petersen disjointness form
\[
\Phi(\alpha_T,\beta_T):=\sum_{e\cap f=\varnothing}\alpha_T(e)\beta_T(f).
\]

This is the exact nonlinear obstruction the LP misses.

At the isotropic adversary `u := (1/10,\dots,1/10)`,
\[
\Phi(u,u)=\frac{30}{100}=\frac{3}{10}>0.
\]

For an actual comparable bad pair, prior work gives `e∩f≠∅` almost surely, so:

- **UNCONDITIONAL:** for every comparable bad slab,
\[
\Phi(\alpha_T,\beta_T)=0.
\]

So every real slab differs from isotropy by an exact nonlinear gap `3/10` in Petersen-disjointness.

---

**UNCONDITIONAL 1. Exact star-correlation identity**

Let
\[
s_\alpha(y):=\sum_{e\ni y}\alpha(e),\qquad s_\beta(y):=\sum_{f\ni y}\beta(f).
\]
These are the vertex shadows of the two bad-label laws. Using
\[
1_{e\cap f=\varnothing}=1-|e\cap f|+1_{e=f},
\]
and
\[
\sum_{e,f}|e\cap f|\,\alpha(e)\beta(f)=\sum_{y\in M}s_\alpha(y)s_\beta(y),
\]
the condition `\Phi(\alpha,\beta)=0` is equivalent to
\[
\sum_{y\in M}s_\alpha(y)s_\beta(y)=1+\langle \alpha,\beta\rangle.
\]
Since `\sum_y s_\alpha(y)=\sum_y s_\beta(y)=2`, subtracting the isotropic baseline `2/5` gives
\[
\boxed{\sum_{y\in M}\bigl(s_\alpha(y)-\tfrac25\bigr)\bigl(s_\beta(y)-\tfrac25\bigr)=\tfrac15+\langle \alpha,\beta\rangle.}
\]

This is a genuine lemma. It is exact, nonlinear, and vertex-local.

At isotropy the left side is `0`; every real comparable bad slab has forced excess at least `1/5`.

---

**UNCONDITIONAL 2. A vertex must carry aligned star bias**

From the identity above and `\langle \alpha,\beta\rangle\ge 0`,
\[
\sum_{y\in M}\bigl(s_\alpha(y)-\tfrac25\bigr)\bigl(s_\beta(y)-\tfrac25\bigr)\ge \frac15.
\]
Hence by averaging:

- **UNCONDITIONAL:**
\[
\exists y\in M\quad \bigl(s_\alpha(y)-\tfrac25\bigr)\bigl(s_\beta(y)-\tfrac25\bigr)\ge \frac1{25}.
\]

So some vertex has a same-sign column bias of at least `1/25` above isotropic baseline. This is stronger than the earlier first-moment shared-vertex bonus because it detects correlation of the two marginals, not just `P(y\in e\cap f)`.

---

**UNCONDITIONAL 3. Exact `4 ⊕ 5` dichotomy**

Write the edge permutation module as
\[
\mathbb R^E = \mathbf 1 \oplus V_4 \oplus V_5,
\]
and decompose
\[
\alpha=u+a_4+a_5,\qquad \beta=u+b_4+b_5.
\]
For Petersen disjointness adjacency `A_P`, the eigenvalues are
\[
3 \text{ on } \mathbf 1,\quad -2 \text{ on } V_4,\quad 1 \text{ on } V_5.
\]
Therefore `\Phi(\alpha,\beta)=\alpha^\top A_P\beta=0` becomes
\[
\boxed{\frac{3}{10}-2\langle a_4,b_4\rangle+\langle a_5,b_5\rangle=0.}
\]

This is the exact representation-theoretic splitting of the nonlinear repair.

Interpretation:

- if the visible star part `\langle a_4,b_4\rangle` is small, then the hidden Petersen `5`-irrep must be substantially negative;
- if the `5`-irrep is not doing the work, then there is large aligned star structure.

So:

- **CONDITIONAL:** under `H_x`, every bad column satisfies the dichotomy
\[
\langle a_4,b_4\rangle\ge \frac{3}{20}+\frac12(-\langle a_5,b_5\rangle).
\]
In particular, if one can independently rule out strong negative `V_5` correlation on many columns, a `3/20` visible star-correlation threshold follows.

- **OPEN:** de-condition a bound of the form `\langle a_5,b_5\rangle \ge -\eta` from union-closure/submodularity. That would force a uniform positive `V_4` signal and likely convert to `\lambda_y`.

---

**Why this is useful**

The invariant
\[
\Phi(\alpha,\beta)=\sum_{e\cap f=\varnothing}\alpha(e)\beta(f)
\]
is exactly positive on the isotropic adversary (`3/10`) and exactly zero on every real comparable bad slab. The exact correction identity
\[
\sum_y (s_\alpha(y)-2/5)(s_\beta(y)-2/5)=1/5+\langle\alpha,\beta\rangle
\]
shows that the repair from isotropy cannot be invisible in vertex shadows: it forces `1/5` of aligned quadratic star-correlation per slab, plus an overlap bonus `\langle\alpha,\beta\rangle`.

**OPEN target lemma:** convert this forced quadratic star-correlation into
\[
\lambda_y \ge c\sum_T w_T\bigl(s_{\alpha_T}(y)-\tfrac25\bigr)\bigl(s_{\beta_T}(y)-\tfrac25\bigr)
\]
for some absolute `c>0`. On isotropy the right side is `0`; on every real slab the average over `y` is at least `1/25`, so this would supply the required positive coupling theorem.

### BUILD — Pass 2

#### The Coupling Builder (codex/gpt-5.4)

**CONDITIONAL Build Hypothesis**

Assume the target coupling theorem in the sharpened slab form:

\[
(\mathrm H_{\mathrm{trans}})\qquad 
\text{comparable bad-pair mass can be transported to }A_y\text{-good fibers with bounded congestion }C.
\]

I will push this forward using the actual dependent coupling already present in a comparable slab.

**UNCONDITIONAL 1. There is a unique equivariant common-vertex selector.**

For a comparable bad pair with labels \(e,f\in \binom{M}{2}\), we know \(e\cap f\neq\varnothing\). Define the selector kernel
\[
K(y\mid e,f)=
\begin{cases}
1,& e\cap f=\{y\},\\[2mm]
\frac12,& e=f\ni y,\\[2mm]
0,& \text{otherwise.}
\end{cases}
\]

This is the unique \(S_5\)-equivariant stochastic map from intersecting ordered edge-pairs to vertices.

If \(\pi\) is any joint law on intersecting ordered pairs, write
\[
\kappa_\pi(y):=\sum_{e,f}\pi(e,f)K(y\mid e,f).
\]
Then \(\kappa_\pi\) is a probability distribution on \(M\):
\[
\sum_{y\in M}\kappa_\pi(y)=1.
\]

So every actual dependent bad-pair coupling canonically produces a vertex-localized mass distribution.

---

**UNCONDITIONAL 2. Pair-to-good transport is automatic once the selector chooses \(y\).**

Take two bad fibers with labels \(e,f\) and suppose \(y\in e\cap f\). By [P3],
\[
L_{T\cup U}\supseteq 2^{e\cup f}\cup\{M\}.
\]
Since \(y\in e\cup f\), this forced cube contains \(\{y\}\). Hence by [P4], the union fiber \(L_{T\cup U}\) is \(A_y\)-good.

So the map
\[
(T,U,e,f)\mapsto (T\cup U,\;Y)
\]
with \(Y\sim K(\cdot\mid e,f)\) is an explicit dependent coupling from comparable bad pairs to \(y\)-good fibers.

This is the right nonlinear object: it uses the joint law of \((e,f)\), not just chamber marginals.

---

**UNCONDITIONAL 3. Exact isotropic effect of the selector coupling.**

Take the isotropic adversary on ordered pairs, conditioned to intersect:
\[
\pi_{\mathrm{iso}}(e,f)=\frac{1}{70}\mathbf 1_{e\cap f\neq\varnothing}.
\]
By symmetry,
\[
\kappa_{\pi_{\mathrm{iso}}}(y)=\frac15\qquad\forall y\in M.
\]

So this coupling gives a strictly positive isotropic bonus at the slab level:
\[
\boxed{\kappa_{\mathrm{iso}}(y)=1/5.}
\]

This is exactly the positivity requirement the LP could not see.

---

**CONDITIONAL 4. Bounded-congestion transport would immediately yield the desired theorem.**

Let \(\mu\) be any probability law on ordered comparable bad-fiber pairs, with induced label law \(\pi\). Push \(\mu\) forward by
\[
(T,U)\mapsto (W,Y):=(T\cup U,\;Y\sim K(\cdot\mid e(T),e(U))).
\]

Assume each \(A_y\)-good fiber \(W\) receives total transported mass at most \(C\) times its actual \(y\)-good load. Then
\[
\lambda_y \ge \frac{\gamma_0}{C}\,\kappa_\pi(y),
\]
where \(\gamma_0\) is the minimum \(y\)-load of an \(A_y\)-good fiber. By [P2], one may take
\[
\gamma_0=\frac{9}{17}
\]
if \(\lambda_y\) counts tagged good-fiber load.

Hence
\[
\boxed{\lambda_y \ge \frac{9}{17C}\,\kappa_\pi(y).}
\]

At the isotropic point,
\[
\lambda_y \ge \frac{9}{17C}\cdot \frac15=\frac{9}{85C}>0.
\]

So the whole problem reduces to one structural statement: prove finite congestion for this explicit pair-to-union transport.

---

**UNCONDITIONAL 5. The selector coupling sees exactly what linear transfers miss.**

The selector depends on the joint pair law \(\pi(e,f)\), hence on the nonlinear intersecting constraint. It is not a linear map \(b\mapsto V\). On the isotropic barycenter \(b_e=B/10\), every linear edge-to-vertex transfer is blind by [DEAD-2], but the selector coupling still outputs the positive uniform measure \(1/5\).

This is the cleanest way I see to “see” the Petersen \(5\)-irrep without an SDP: pass through the pair law, then project intersecting pairs to their common vertex.

---

**DEAD 6. Raw selector mass cannot by itself lower-bound \(\lambda_y\) without congestion control.**

Reason: triangle collapse.

In the triangle atom \(\{12,13,23\}\), every comparable pair selects one of \(\{1,2,3\}\), and \(\kappa_\pi(y)\) is large, but all source pairs can collapse onto the same forced good block. This is exactly the structural feature missed by any theorem that only measures “how often a common vertex is selected.”

So the missing ingredient is not better pair selection. The selector is already canonical. The missing ingredient is an **anti-collision lemma** for the union map
\[
(T,U)\mapsto T\cup U.
\]

That is the precise obstruction.

---

**OPEN 7. Weakest viable de-conditioning target**

The full bounded-congestion claim may be too strong. The weakest useful version is:

\[
\exists y\in M:\quad
\sum_{W} \min\!\Big(1,\;m_y(W)\Big)
\;\ge\; c \sum_{T,U}\mu(T,U)\,K(y\mid e(T),e(U)),
\]
where \(m_y(W)\) is transported \(y\)-mass landing on \(W\).

Interpretation: only distinct receiving \(y\)-good fibers count. This is exactly what triangle collapse threatens.

If this weaker anti-collision statement holds for some absolute \(c>0\), then
\[
\lambda_y \ge \frac{9c}{17}\,\kappa_\pi(y),
\]
and isotropy gives a positive bonus \(9c/85\).

---

**Net consequence**

The workshop hypothesis naturally factors into two pieces:

1. **Already unconditional:** comparable bad pairs admit a canonical dependent coupling to a selected common vertex, and each selected pair forces an \(A_y\)-good union fiber.
2. **Still open:** control collisions of the union map strongly enough to turn transported pair mass into distinct \(y\)-good load.

So the next real lemma should not search for a new coupling. The coupling is already explicit and optimal. The next lemma should be:

\[
\textbf{OPEN:}\quad \text{a congestion/anti-collision bound for }(T,U)\mapsto T\cup U\text{ at a fixed selected vertex }y.
\]

That is the exact structural gap between the nonlinear pair invariant and the desired \(\lambda_y\) lower bound.

#### The Defect Analyst (codex/gpt-5.4)

**PROVEN 1. Exact defect capacity of a canonical tagged receiver**

For any nonempty `S ⊂ M` with `|M|=5`, define the union-closed model
\[
G_S:=2^S\cup\{M\}.
\]
This is the basic receiver forced by cross-fiber arguments when the selected common vertex lies in `S`.

Fix `x\in M`. Using [P5],
\[
p_x(G_S)=\frac12+\frac{R_x-M_x}{2|G_S|},\qquad |G_S|=2^{|S|}+1.
\]

The defect counts are explicit:

- If `x∈S`, then every `A⊂S` augments successfully inside `2^S`, while `M\setminus\{x\}\notin G_S`. Hence
\[
M_x(G_S)=0,\qquad R_x(G_S)=1,\qquad R_x-M_x=1.
\]
So
\[
p_x(G_S)=\frac{2^{|S|-1}+1}{2^{|S|}+1}.
\]

- If `x\notin S`, then every `A⊂S` is a bad augmentation for `x`, and again only `M` is a bad removal:
\[
M_x(G_S)=2^{|S|},\qquad R_x(G_S)=1,\qquad R_x-M_x=1-2^{|S|}.
\]
So
\[
p_x(G_S)=\frac{1}{2^{|S|}+1}.
\]

Concrete values:

\[
\begin{array}{c|c|c|c}
|S| & p_x(x\in S) & p_x(x\notin S) & R_x-M_x(x\in S)\\\hline
2 & 3/5 & 1/5 & 1\\
3 & 5/9 & 1/9 & 1\\
4 & 9/17 & 1/17 & 1
\end{array}
\]

So every single tagged receiver contributes **exactly one unit** of positive `x`-defect on its support, no matter whether it is a `2`-, `3`-, or `4`-cube receiver.

---

**PROVEN 2. Receiver multiplicity is the only source of large positive defect**

Let
\[
\mathcal G_x:=\{\,G_S: x\in S\subseteq M\,\}.
\]
For any multiset of canonical receivers supported at `x`,
\[
\sum_{G_S\in \mathcal G_x}(R_x-M_x)=\#\{G_S\}.
\]

Thus pair transport can only create large net positive `x`-defect by producing many **distinct receiving supports**. Sending many bad comparable pairs to the same support `S` does not amplify the positive defect beyond `+1`.

This is the augmentation-defect version of the anti-collision requirement.

---

**DEAD 3. Any theorem based only on raw selected-pair mass at a fixed receiver support**

Reason: one receiver has defect capacity `1`.

Take the triangle support `S={1,2,3}` and receiver
\[
G_{123}=2^{\{1,2,3\}}\cup\{M\}.
\]
Then
\[
(R_1-M_1,R_2-M_2,R_3-M_3,R_4-M_4,R_5-M_5)=(1,1,1,-7,-7).
\]

Now compare with the triangle bad-label atom on edges `\{12,13,23\}`. Under the canonical common-vertex selector from the workshop notes, the selected vertex law is uniform on `\{1,2,3\}`:
\[
\kappa(1)=\kappa(2)=\kappa(3)=1/3.
\]

So substantial selected pair mass can concentrate onto a single receiver support while yielding only one unit of positive defect per supported vertex. Therefore:

- counting selected pairs is too coarse;
- counting selected vertices is too coarse;
- the proof must control **distinct supports/receivers**, not just pair mass.

This is a stronger defect-theoretic form of the known triangle-collapse obstruction.

---

**CONDITIONAL 4. What the coupling theorem must actually supply**

Assume a nonlinear coupling theorem of the desired type. Then, in defect language, the useful consequence is not merely
\[
\lambda_x \gtrsim \kappa_\pi(x),
\]
but the stronger support-sensitive statement
\[
\lambda_x \gtrsim c\cdot N_x,
\]
where `N_x` is the number (or weighted number) of distinct supports `S\ni x` for which some fiber contains `2^S\cup\{M\}`.

Why this is the right consequence: by PROVEN 1, each such support contributes one unit of positive `x`-defect and no more. So `N_x` is exactly the combinatorial resource that can pay for `|M_x|-|R_x|`.

---

**OPEN 5. Weakest viable anti-collision lemma**

The defect calculations suggest the minimal target is:

\[
\exists x\in M:\qquad
N_x \ge c\sum_{T,U}\mu(T,U)\,K\!\left(x\mid e(T),e(U)\right),
\]
where `N_x` counts distinct receiver supports `S\ni x` produced by unions `T\cup U`, not total transported mass.

This avoids DEAD-3, because one support only counts once, matching its exact positive defect capacity.

If proved, then each counted support gives `R_x-M_x=1`, so summing over distinct supports would directly lower-bound the net augmentation defect for `x`.

---

**OPEN 6. De-condition a support-expansion lemma from union-closure**

A plausible unconditional lemma to aim for is:

\[
\#\{\,e(T)\cup e(U):\ Y=x\,\}
\]
cannot be too small compared with selected `x`-mass, unless the bad-label support is trapped in a triangle-type configuration.

That would be the right next bridge from the nonlinear pair invariant to actual defect repair, because the defect capacity lives at the level of **distinct unions** `e\cup f`, not marginals.

The main conclusion from the defect side is sharp: a single `A_x`-good receiver only buys `+1`. Any successful coupling theorem has to manufacture many receivers, not just much pair mass.

#### The Structure Miner (codex/gpt-5.4)

**UNCONDITIONAL 1. Exact nonlinear invariant on the selected-support geometry**

Fix a vertex \(x\in M\). After applying the canonical common-vertex selector \(K\) from the prior coupling note, define the conditional law of the selected receiver-support through \(x\):
\[
\rho_x(S):=\mathbb P\big(e\cup f=S\mid Y=x\big),
\qquad
S\in\mathcal S_x:=\{\{x,a\},\{x,a,b\}:a,b\in M\setminus\{x\}\}.
\]

Write the 3-support masses as
\[
q^{(x)}_{ab}:=\rho_x(\{x,a,b\}),\qquad a,b\in M\setminus\{x\},\ a<b.
\]

On the four-point set \(M\setminus\{x\}\), these six coordinates are the edge-weights of a weighted \(K_4\). Define the quadratic perfect-matching invariant
\[
\Delta_x
:=
q^{(x)}_{ab}q^{(x)}_{cd}
+
q^{(x)}_{ac}q^{(x)}_{bd}
+
q^{(x)}_{ad}q^{(x)}_{bc},
\]
where \(\{a,b,c,d\}=M\setminus\{x\}\).

Interpretation: if \(S,S'\) are two independent samples from the 3-support law \(q^{(x)}\), then \(\Delta_x\) is exactly the probability that \(S,S'\) are the two disjoint edges of a perfect matching on \(M\setminus\{x\}\). This is a genuinely quadratic observable on the selected-support law, not a linear edge-to-vertex transfer.

**Isotropic check.** At the isotropic adversary,
\[
\rho_x(\{x,a\})=\frac1{28},\qquad
\rho_x(\{x,a,b\})=\frac17,
\]
so
\[
q^{(x)}_{ab}=\frac17\quad\text{for all six edges,}
\qquad
\Delta_x=3\cdot \frac1{7^2}=\frac{3}{49}>0.
\]

So \(\Delta_x\) is an exact nonlinear invariant that is strictly positive on the isotropic adversary.

---

**UNCONDITIONAL 2. \(\Delta_x\) bypasses the known 2-overlap collapse**

If \(\Delta_x>0\), then there exist two 3-supports
\[
S_1=\{x,a,b\},\qquad S_2=\{x,c,d\},
\]
with
\[
S_1\cap S_2=\{x\},\qquad S_1\cup S_2=M.
\]

This is exactly the support pattern not covered by [DEAD-7], because [DEAD-7] only collapses pairs of 3-cubes with 2-point overlap. Here the overlap is 1-point.

So \(\Delta_x\) isolates the first support configuration that survives every chamber-local linear collapse already known.

---

**UNCONDITIONAL 3. Full-cube completion from a disjoint support pair**

Let \(L\) be any union-closed fiber on ground set \(M\). Suppose
\[
2^{S_1}\subseteq L,\qquad 2^{S_2}\subseteq L,
\]
for two 3-sets \(S_1,S_2\subset M\) satisfying
\[
S_1\cap S_2=\{x\},\qquad S_1\cup S_2=M.
\]
Then \(L=2^M\).

Proof: for any \(A\subseteq M\),
\[
A=(A\cap S_1)\cup(A\cap S_2),
\]
with \(A\cap S_i\subseteq S_i\), hence \(A\cap S_i\in 2^{S_i}\subseteq L\). By union-closure, \(A\in L\). Therefore every subset of \(M\) lies in \(L\).

So two support-disjoint tagged 3-cubes through the same \(x\) do not collide into another tagged receiver; if they land in one fiber, they force a full fiber.

This is a genuine new lemma.

---

**CONDITIONAL 4. Forward consequence of the workshop hypothesis**

Assume the desired coupling theorem in any form strong enough to turn selected support-disjoint pairs into actual good-fiber load. Then the correct nonlinear lower-bound template is not \(\lambda_x\gtrsim \kappa_x\), but
\[
\lambda_x \gtrsim \Delta_x.
\]

Reason:
- \(\Delta_x\) counts exactly the mass of support-disjoint 3-support pairs.
- Such pairs avoid the triangle obstruction and the 2-overlap 4-cube collapse.
- If two such supports land in one fiber, UNCONDITIONAL 3 upgrades that fiber to full.
- If they land in different fibers, they already produce two distinct \(x\)-good witnesses.

Thus \(\Delta_x\) is the right “irreducible” quadratic quantity to feed into \(\Phi_x\).

At the isotropic point this gives the exact positive benchmark
\[
\Phi_x^{\mathrm{pm}}(b_{\mathrm{iso}})=\frac{3}{49}.
\]

---

**OPEN 5. Weakest viable de-conditioning target**

The natural de-conditioning target is now:

\[
\exists x\in M:\qquad
\lambda_x \ge c\,\Delta_x
\]
for some absolute \(c>0\).

This is weaker than any raw pair-mass transport theorem and stronger than every dead linear observable. It is also aligned with the exact obstruction structure:
- triangle atoms give \(\Delta_x=0\);
- incident-edge 3-support clouds give \(\Delta_x=0\);
- the isotropic point gives \(\Delta_x=3/49\).

So \(\Delta_x\) vanishes on the known bad local geometries and is strictly positive on the LP adversary. That is the precise nonlinear separation the linear chamber LP could not see.

**Net result:** the perfect-matching polynomial \(\Delta_x\) on the selected 3-support law is an exact higher-order invariant, strictly positive on isotropy, and it comes with a new unconditional completion lemma: two support-disjoint tagged 3-cubes through \(x\) inside one fiber force a full cube. The remaining gap is to prove bounded congestion from \(\Delta_x\) to \(\lambda_x\).

### BUILD — Pass 3

#### The Coupling Builder (codex/gpt-5.4)

**CONDITIONAL 1. The right dependent coupling is opposite-edge transport, not iid pairing.**

Fix \(x\in M\), and write the six 3-supports through \(x\) as edges of \(K_4\) on \(M\setminus\{x\}\):
\[
q_{ab}^{(x)}=\rho_x(\{x,a,b\}),\qquad a<b,\ a,b\in M\setminus\{x\}.
\]
Let \(\tau\) be the opposite-edge involution:
\[
\tau(ab)=cd,\ \tau(ac)=bd,\ \tau(ad)=bc,
\]
where \(\{a,b,c,d\}=M\setminus\{x\}\).

Define the dependent coupling \(\Gamma_x\) of two \(q^{(x)}\)-marginals by maximizing the mass on
\[
E'=\tau(E).
\]
The exact optimal matched mass is
\[
B_x:=\min(q_{ab},q_{cd})+\min(q_{ac},q_{bd})+\min(q_{ad},q_{bc}).
\]

This is the explicit coupling mechanism: on each opposite pair \((e,\tau(e))\), transport exactly the common mass \(\min(q_e,q_{\tau(e)})\) across the involution, and couple the residual arbitrarily.

Why this is the right forward consequence of the workshop hypothesis: every successful \(\Gamma_x\)-match produces two supports
\[
S=\{x\}\cup e,\qquad S'=\{x\}\cup \tau(e),
\]
with \(S\cap S'=\{x\}\) and \(S\cup S'=M\). That is exactly the geometry that survives all dead linear reductions.

At the isotropic point,
\[
q_e=\frac17\ \text{for all six edges},
\]
so
\[
B_x=3\cdot \frac17=\frac37>0.
\]
This gives a strictly positive nonlinear bonus at isotropy, much larger than the quadratic \(\Delta_x=3/49\).

---

**UNCONDITIONAL 2. The transport bonus \(B_x\) dominates the quadratic bonus \(\Delta_x\).**

Let
\[
Q_x:=\sum_{e} q_e
\]
be the total 3-support mass through \(x\). Then
\[
B_x\ge \frac{2\Delta_x}{Q_x}.
\]

Proof: for each opposite pair \((u,v)\),
\[
\min(u,v)\ge \frac{2uv}{u+v},
\]
and summing over the three matching pairs gives
\[
B_x\ge 2\sum_{\pi}\frac{u_\pi v_\pi}{u_\pi+v_\pi}
\ge \frac{2}{Q_x}\sum_{\pi}u_\pi v_\pi
=\frac{2\Delta_x}{Q_x}.
\]

So \(B_x\) is a genuinely stronger nonlinear observable than \(\Delta_x\), and it still separates isotropy:
\[
Q_x^{\rm iso}=\frac67,\qquad \Delta_x^{\rm iso}=\frac{3}{49}
\quad\Rightarrow\quad
B_x\ge \frac{2}{6/7}\cdot \frac{3}{49}=\frac17,
\]
while the exact value is \(B_x=3/7\).

This is a real lemma: any theorem of the form \(\lambda_x\ge c\,B_x\) would automatically imply a \(\Delta_x\)-theorem.

---

**UNCONDITIONAL 3. Successful opposite transport cannot hide inside a non-full fiber.**

Let \(L\) be a fiber contributing 3-support witnesses through \(x\). Form the edge set
\[
H_x(L):=\{ab:\ 2^{\{x,a,b\}}\cup\{M\}\subseteq L\}.
\]
If \(H_x(L)\) contains an opposite pair \(e,\tau(e)\), then \(L=2^M\) by the already-proved full-cube completion lemma.

Hence for every non-full fiber, \(H_x(L)\) is an intersecting edge family on \(K_4\). Equivalently:

- no successful \(\Gamma_x\)-match can be realized entirely inside a non-full fiber;
- every successful \(\Gamma_x\)-match either
  1. lands inside a full fiber, or
  2. uses two distinct non-full fibers and therefore certifies two distinct receiver supports.

This is the structural reason \(B_x\) avoids the triangle obstruction: triangle/star configurations are exactly matching-free.

---

**UNCONDITIONAL 4. Support-saturation alternative from opposite transport.**

Let
\[
r_x:=\#\{\pi\text{ perfect matching on }M\setminus\{x\}:\beta_{x,\pi}>0\},
\qquad
\beta_{x,\pi}:=\min(q_e,q_{\tau(e)}).
\]
Then:

- if no full fiber through \(x\) occurs, each active matching pair contributes two distinct 3-supports through \(x\);
- since the three matching pairs are edge-disjoint, this gives
\[
N_x^{(3)}\ge 2r_x,
\]
where \(N_x^{(3)}\) is the number of distinct realized 3-supports through \(x\).

At isotropy, all three opposite pairs are active, so \(r_x=3\). Therefore:

\[
\text{if there is no full fiber through }x,\quad N_x^{(3)}\ge 6.
\]

Since there are only six 3-supports through \(x\), isotropic opposite transport forces complete 3-support saturation unless full fibers already appear.

Combined with the Defect Analyst’s lemma, that means isotropic-scale opposite transport is already forcing the exact combinatorial resource defect repair needs: many distinct receivers.

---

**DEAD 5. Replacing \(B_x\) by mere opposite-pair existence.**

The stronger-looking claim
\[
\Phi_x^{\rm exist}:=\#\{\pi:\ q_e>0,\ q_{\tau(e)}>0\}
\]
is not a viable transport bonus.

Reason: it ignores marginal imbalance inside an opposite pair. One can have
\[
q_e=\varepsilon,\qquad q_{\tau(e)}=\frac17,
\]
so \(\Phi_x^{\rm exist}\) counts that pair fully, but only \(\varepsilon\) mass can actually be transported across the involution. This misses the exact structural feature that matters: **pair balance**, not just pair presence.

So the minimal nonlinear observable has to be \(B_x=\sum \min(q_e,q_{\tau(e)})\), not a support indicator.

---

**OPEN 6. Best de-conditioning target.**

The sharp next statement to prove without the hypothesis is:
\[
\exists x\in M:\qquad \lambda_x\ge c\,B_x
\]
for some absolute \(c>0\).

This is stronger than the earlier \(\lambda_x\ge c\Delta_x\), because \(B_x\) already encodes the correct dependent transport and exact opposite-pair balance. It also has the right isotropic value:
\[
B_x^{\rm iso}=\frac37.
\]

If this de-conditions, the proof route is clear:

1. \(B_x\) gives balanced opposite-pair transport mass.
2. By UNCONDITIONAL 3, that mass cannot disappear inside non-full fibers.
3. By UNCONDITIONAL 4, absent full fibers it forces many distinct 3-support receivers.
4. By the defect-capacity lemma, each distinct receiver buys exactly \(+1\) \(x\)-defect.

That is the coupling-to-defect bridge the linear LP could not see.

#### The Defect Analyst (codex/gpt-5.4)

**UNCONDITIONAL 1. Exact defect table for the three rigid good-fiber types**

Fix a fiber \(L\) on ground set \(M\), \(|M|=5\), and define its normalized \(x\)-defect
\[
\delta_x(L):=\frac{|R_x(L)|-|M_x(L)|}{|L|}=2p_x(L)-1
\]
from [P5].

Using [P2], the three possible good-fiber types give exact defect values:

1. `full` fiber:
\[
p_x(L)=\frac12\ \forall x
\qquad\Longrightarrow\qquad
\delta_x(L)=0\ \forall x.
\]

2. `singly tagged` on support \(S\subset M\), \(|S|=3\):
\[
p_x(L)=
\begin{cases}
9/17,&x\in S,\\
1/17,&x\notin S,
\end{cases}
\]
hence
\[
\delta_x(L)=
\begin{cases}
+1/17,&x\in S,\\
-15/17,&x\notin S.
\end{cases}
\]

3. `untagged`:
\[
p_x(L)=1/17\ \forall x
\qquad\Longrightarrow\qquad
\delta_x(L)=-15/17\ \forall x.
\]

So every \(x\)-good singly tagged fiber contributes **exactly one unit of positive defect capacity** \(+|L|/17\) to \(x\), while a full fiber contributes \(0\).

This is the defect bookkeeping we need; no linear chamber observable sees this localization.

---

**UNCONDITIONAL 2. Opposite-pair supports localize all positive defect at the common vertex**

Take two singly tagged fibers \(L_1,L_2\) with supports
\[
S_1=\{x,a,b\},\qquad S_2=\{x,c,d\},
\]
where \(\{a,b,c,d\}=M\setminus\{x\}\). This is exactly one opposite pair in the \(K_4\) model behind \(B_x\).

Let \(\mu_i:=|L_i|/|F|\). Their contribution to global defect is:

\[
\frac{|R_x|-|M_x|}{|F|}\Big|_{L_1\cup L_2}=\frac{\mu_1+\mu_2}{17},
\]
\[
\frac{|R_a|-|M_a|}{|F|}\Big|_{L_1\cup L_2}=\frac{\mu_1-15\mu_2}{17},
\qquad
\frac{|R_b|-|M_b|}{|F|}\Big|_{L_1\cup L_2}=\frac{\mu_1-15\mu_2}{17},
\]
\[
\frac{|R_c|-|M_c|}{|F|}\Big|_{L_1\cup L_2}=\frac{-15\mu_1+\mu_2}{17},
\qquad
\frac{|R_d|-|M_d|}{|F|}\Big|_{L_1\cup L_2}=\frac{-15\mu_1+\mu_2}{17}.
\]

In the balanced case \(\mu_1=\mu_2=\mu\):
\[
x:\ +\frac{2\mu}{17},\qquad
a,b,c,d:\ -\frac{14\mu}{17}.
\]

So an opposite-pair realization does not spread benefit evenly. It concentrates the **entire positive defect** on the common vertex \(x\). This is exactly the nonlinear localization the isotropic LP washes out.

---

**UNCONDITIONAL 3. Six-support saturation through one vertex gives a computable defect gain**

Assume there is no full fiber through \(x\), and all six 3-supports through \(x\) are realized by six singly tagged fibers of masses \(\mu_{ab}\) indexed by edges \(ab\subset M\setminus\{x\}\).

Then
\[
\frac{|R_x|-|M_x|}{|F|}=\frac1{17}\sum_{ab}\mu_{ab}.
\]

For a fixed outer vertex \(a\), exactly three of the six supports contain \(a\) and three omit \(a\). Therefore
\[
\frac{|R_a|-|M_a|}{|F|}
=\frac1{17}\Big(\sum_{ab\ni a}\mu_{ab}-15\sum_{ab\not\ni a}\mu_{ab}\Big).
\]

If all six masses are equal to \(\mu\), then
\[
x:\ +\frac{6\mu}{17},\qquad
a,b,c,d:\ -\frac{42\mu}{17}.
\]

Again the common vertex \(x\) is the unique positive sink for the defect repair.

This is the defect-side version of Coupling Builder’s “support saturation” alternative.

---

**UNCONDITIONAL 4. Converting untagged mass into \(x\)-supported tagged mass improves \(x\)-defect by \(16/17\) per unit mass**

Compare one untagged fiber of mass \(\mu\) with one singly tagged \(x\)-good fiber of the same mass \(\mu\).

From Result 1:
- untagged contributes \(-15\mu/17\) to \(x\),
- singly tagged through \(x\) contributes \(+\mu/17\) to \(x\).

So the improvement is
\[
\Delta_x^{\text{improve}}=\frac{16\mu}{17}.
\]

Thus every unit of good-fiber mass that can be forced to pass through \(x\) buys a very large defect correction at \(x\). This is the correct normalization for any candidate lower bound \(\lambda_x\ge \Phi_x(b)\).

---

**CONDITIONAL 5. What a \(B_x\)-coupling theorem would immediately imply on defects**

Assume the target coupling theorem in the strengthened form
\[
\lambda_x\ge c\,B_x
\]
for some absolute \(c>0\), where \(\lambda_x\) is the total mass of \(x\)-supported singly tagged fibers plus any full-fiber contribution routed through \(x\).

Then by Result 4, relative to the untagged baseline, the \(x\)-defect improves by at least
\[
\frac{16}{17}\lambda_x
\ge
\frac{16c}{17}B_x.
\]

At the isotropic point, Coupling Builder already computed
\[
B_x^{\rm iso}=\frac37.
\]
Therefore the conditional isotropic repair is
\[
\frac{16c}{17}\cdot \frac37=\frac{48c}{119}.
\]

So the right defect translation of the hypothesis is:

\[
\textbf{CONDITIONAL:}\qquad
\exists x\ \text{with defect improvement at least } \frac{48c}{119}|F|.
\]

This is the exact forward consequence of the nonlinear coupling claim. It is not a proof of the claim; it is the defect gain the claim would have to deliver.

---

**OPEN 6. Best unconditional de-conditioning target**

The cleanest next lemma is not yet \(\lambda_x\ge cB_x\), but the weaker defect-native statement
\[
\exists x:\qquad
|R_x|-|M_x|
\ge
-\frac{15}{17}|F|+\frac{16}{17}\,c\,B_x\,|F|.
\]

Reason: this is exactly what Results 1 and 4 convert any \(x\)-localized good mass into. It bypasses full-fiber ambiguity and speaks directly in the defect variable that matters for \(p_x\).

If this de-conditions, the bridge to \(p_x\) is immediate through [P5].

---

**DEAD 7. “Opposite-pair presence alone repairs defect”**

Dead consequence:
\[
\#\{\text{active opposite pairs through }x\}>0
\quad\Longrightarrow\quad
|R_x|-|M_x|\ \text{is substantially repaired}.
\]

Reason: presence without balanced mass is useless for defect. If one pair has
\[
q_e=\varepsilon,\qquad q_{\tau(e)}=\frac17,
\]
then the realizable opposite transport is only \(O(\varepsilon)\), and the induced positive \(x\)-defect is also only \(O(\varepsilon)\). So existence data is too coarse; the defect mechanism genuinely needs the nonlinear weight
\[
B_x=\sum \min(q_e,q_{\tau(e)}).
\]

That matches Coupling Builder’s conclusion from the transport side.

The main defect takeaway is sharp: opposite-pair geometry does something much stronger than “create many receivers.” It channels positive augmentation defect almost exclusively into the common vertex \(x\). That gives a real nonlinear route from \(B_x\) to \(p_x\), with explicit constants \(+1/17\) per \(x\)-good tagged unit and \(+16/17\) improvement over untagged baseline.

#### The Structure Miner (codex/gpt-5.4)

**Structure-Miner Contribution**

I think the right nonlinear object is not a scalar load first. It is a local PSD certificate on the 3-support tag geometry through a fixed vertex `x`.

Let the six `x`-supports be
\[
S_{ab}:=\{x,a,b\},\qquad ab\in \binom{M\setminus\{x\}}2,
\]
and for any tagged-mass profile \(\mu^{(x)}=(\mu_{ab})\) on these six supports define the centered support vectors
\[
v_{ab}:=\mathbf 1_{S_{ab}}-\frac35\mathbf 1\in \mathbb R^5,
\qquad
w_x:=e_x-\frac15\mathbf 1.
\]
Define the local moment matrix
\[
C_x(\mu):=\sum_{ab}\mu_{ab}\, v_{ab}v_{ab}^\top.
\]

The exact nonlinear invariant is
\[
\Psi_x(\mu):=\sup\{\alpha\ge 0:\ C_x(\mu)\succeq \alpha\, w_xw_x^\top\}.
\]

This is the SDP-visible version of opposite-pair transport.

---

**UNCONDITIONAL 1. Exact opposite-pair identity.**

For each opposite pair \(ab\mid cd\) in \(K_4\) on \(M\setminus\{x\}\),
\[
v_{ab}+v_{cd}=w_x.
\]

Proof:
\[
\mathbf 1_{xab}+\mathbf 1_{xcd}=(\mathbf 1+e_x),
\]
so after subtracting \(2\cdot \frac35\mathbf 1\),
\[
v_{ab}+v_{cd}=e_x-\frac15\mathbf 1=w_x.
\]

This is the structural invariant linear edge-to-vertex maps never see.

---

**UNCONDITIONAL 2. Local PSD lower bound from opposite-pair balance.**

Let
\[
B_x(\mu):=\min(\mu_{ab},\mu_{cd})+\min(\mu_{ac},\mu_{bd})+\min(\mu_{ad},\mu_{bc}).
\]
Then
\[
C_x(\mu)\succeq \frac12\, B_x(\mu)\, w_xw_x^\top.
\]

Proof: for one opposite pair with masses \(u,v\) and \(\beta=\min(u,v)\),
\[
u\,vv^\top+v\,ww^\top \succeq \beta(vv^\top+ww^\top)
\succeq \frac{\beta}{2}(v+w)(v+w)^\top
=\frac{\beta}{2}w_xw_x^\top.
\]
Sum over the three opposite pairs.

So
\[
\Psi_x(\mu)\ge \frac12 B_x(\mu).
\]

This is a genuine nonlinear/SDP lemma.

---

**UNCONDITIONAL 3. Conversion from PSD bonus to localized load.**

If \(\lambda_x(\mu):=\sum_{ab}\mu_{ab}\) is the total tagged mass through \(x\), then
\[
\lambda_x(\mu)\ge 4\,\Psi_x(\mu)\ge 2\,B_x(\mu).
\]

Proof: every \(x\)-support satisfies \(w_x\cdot v_{ab}=2/5\), hence
\[
w_x^\top C_x(\mu) w_x=\sum_{ab}\mu_{ab}\Big(\frac25\Big)^2=\frac{4}{25}\lambda_x(\mu).
\]
If \(C_x(\mu)\succeq \alpha w_xw_x^\top\), then
\[
\frac{4}{25}\lambda_x(\mu)\ge \alpha\|w_x\|^4
=\alpha\Big(\frac45\Big)^2
=\frac{16}{25}\alpha,
\]
so \(\lambda_x(\mu)\ge 4\alpha\).

This shows the PSD certificate is strictly stronger than a direct \(\lambda_x\)-bound.

---

**CONDITIONAL 4. SDP lift of the workshop target.**

Assume the hypothesis in the stronger form:

for some absolute \(c>0\), there exists \(x\) and a localized good-mass profile \(\mu^{(x)}\) such that
\[
B_x(\mu^{(x)})\ge c\, B_x(b),
\]
where \(B_x(b)\) is the bad-mass opposite-transport functional from the Coupling Builder.

Then
\[
C_x(\mu^{(x)})\succeq \frac{c}{2} B_x(b)\, w_xw_x^\top,
\qquad
\lambda_x\ge 2c\, B_x(b).
\]

So the clean de-conditioning target is not directly \(\lambda_x\ge cB_x(b)\), but the stronger transfer statement
\[
B_x(\text{good})\ge c\,B_x(\text{bad}).
\]

Once that is proved, the load bound follows automatically.

---

**UNCONDITIONAL 5. Isotropic adversary is strictly positive in this invariant.**

At the isotropic point,
\[
q_{ab}^{(x)}=\frac17 \quad \forall ab,
\qquad
B_x^{\mathrm{iso}}=3\cdot \frac17=\frac37.
\]
Therefore the PSD bonus is
\[
\Psi_x^{\mathrm{iso}}\ge \frac12\cdot \frac37=\frac{3}{14}>0.
\]

Equivalently,
\[
C_x^{\mathrm{iso}}\succeq \frac{3}{14}\, w_xw_x^\top.
\]

This meets the workshop requirement: exact invariant, nonlinear, and strictly positive on the isotropic adversary.

---

**OPEN 6. Best next lemma to de-condition.**

Prove:
\[
\exists x:\qquad B_x(\text{good})\ge c\, B_x(\text{bad})
\]
for some absolute \(c>0\).

Why this is the right target:

- it is nonlinear;
- it is invisible to all dead linear chambers;
- it upgrades immediately to an SDP certificate;
- it then upgrades automatically to
\[
\lambda_x\ge 2c\,B_x(\text{bad}),
\]
and then via the Defect Analyst to a defect repair bound.

So my recommendation is: shift the coupling theorem from `load` language to `matched opposite-pair mass` language. The PSD lift makes the geometry exact.

### VERIFY

#### The Coupling Builder (codex/gpt-5.4)

**Audit**

`CORRECT`  
`PROVEN: Canonical selector on intersecting bad-edge pairs.`  
For ordered intersecting pairs `(e,f)` in `K_5`, the unique `S_5`-equivariant stochastic map to vertices is:
- the common vertex with probability `1` when `e != f` and `e ∩ f = {y}`,
- the two endpoints with probability `1/2` each when `e=f`.
This is forced by stabilizers, so the claim is correct.

`CORRECT`  
`PROVEN: Every selected pair forces an A_y-good receiver.`  
If `y ∈ e ∩ f`, then by `[P3]` the union fiber contains `2^{e∪f} ∪ {M}`; since `{y} ∈ 2^{e∪f}`, `[P4]` gives `p_y >= 1/2` in that fiber. This is a valid unconditional coupling-to-goodness step.

`CORRECT`  
`PROVEN: The selector has positive isotropic output.`  
For the isotropic ordered-pair law conditioned on intersection, `κ_iso(y)=1/5` for every `y`. The count `70 = 10·7` is right, and symmetry forces uniformity.

`CORRECT`  
`PROVEN: Triangle collapse kills raw selected-pair mass as a lower bound.`  
The triangle atom concentrates many selected pairs onto one receiver support, but one receiver support has only bounded defect capacity. This is the right diagnosis of what selector mass misses.

`CORRECT`  
`PROVEN: The quadratic support invariant Δ_x is strictly positive at isotropy and vanishes on triangle/star-type obstructions.`  
The definition on the six `x`-supports is sound, and at isotropy `Δ_x = 3/49`. It genuinely sees opposite-pair geometry that linear transfers miss.

`CORRECT`  
`PROVEN: Two tagged 3-cubes through x with 1-point overlap force the full cube.`  
If `2^{S_1}, 2^{S_2} ⊂ L`, `S_1 ∩ S_2 = {x}`, and `S_1 ∪ S_2 = M`, then every `A ⊂ M` can be written as `(A∩S_1) ∪ (A∩S_2)`, so union-closure gives `L=2^M`.

`CORRECT`  
`PROVEN: Opposite-pair transport functional B_x is well-defined and positive on isotropy.`  
For the three opposite pairs on `K_4`,  
`B_x = Σ min(q_e,q_{τ(e)})`  
is exactly the maximum matched mass under the involution coupling, and at isotropy `B_x = 3/7`.

`CORRECT`  
`PROVEN: B_x dominates Δ_x.`  
The inequality  
`B_x >= 2Δ_x / Q_x`  
with `Q_x = Σ q_e` is valid by `min(u,v) >= 2uv/(u+v)` and `u+v <= Q_x`.

`CORRECT`  
`PROVEN: A non-full fiber cannot contain an opposite support pair.`  
If one fiber contains tagged supports for both `e` and `τ(e)`, the previous full-cube lemma applies. So opposite-pair mass cannot be absorbed inside a non-full fiber.

`CORRECT`  
`PROVEN: Exact defect table for rigid good-fiber types.`  
Using `[P5]` and `[P2]`:
- full fiber: `δ_x = 0`,
- singly tagged support vertex: `δ_x = +1/17`,
- singly tagged off-support or untagged: `δ_x = -15/17`.
These calculations are correct.

`CORRECT`  
`PROVEN: Opposite tagged supports localize positive defect at the common vertex.`  
Summing two singly tagged fibers on opposite supports through `x` gives positive contribution only to `x` in the balanced case. This is a valid and important nonlinear localization fact.

`CORRECT`  
`PROVEN: Replacing untagged mass by x-tagged mass improves x-defect by 16/17 per unit mass.`  
This follows directly from `(+1/17) - (-15/17) = 16/17`.

`CORRECT`  
`PROVEN: The PSD certificate Ψ_x is valid and positive on isotropy.`  
The identities
- `v_ab + v_cd = w_x`,
- `C_x(μ) ⪰ (1/2) B_x(μ) w_x w_x^T`,
- `λ_x(μ) >= 4 Ψ_x(μ) >= 2 B_x(μ)`
are all correct. This is a legitimate nonlinear/SDP repackaging of opposite-pair balance.

`WRONG`  
`DEAD: Concluding a 16/17 defect improvement from λ_x >= c B_x when λ_x is allowed to include full-fiber mass.`  
The step is invalid because full fibers have defect `0`, not `+1/17`. Relative to the untagged baseline, one unit of full-fiber mass improves defect by `15/17`, while one unit of singly tagged `x`-mass improves it by `16/17`. So the stated implication overcounts whenever `λ_x` includes routed full-fiber mass.

`UNJUSTIFIED`  
`OPEN: Convert bad opposite-pair mass B_x(bad) into good opposite-pair mass B_x(good), or at least into distinct x-supported receivers, with an absolute constant.`  
All the nonlinear invariants are now explicit, but the actual transfer theorem is still missing. This is the central unresolved step.

`UNJUSTIFIED`  
`OPEN: Make the congestion/anti-collision bound precise for the union map (T,U) -> T∪U.`  
The selector and opposite-pair couplings are correct, but no proved argument yet controls how much matched bad-pair mass can collide onto the same receiver support/fiber.

`UNJUSTIFIED`  
`OPEN: Decide the right target variable.`  
There are now three candidate nonlinear targets:
- `λ_x` = localized good load,
- `N_x` = number of distinct `x`-receiver supports,
- `B_x(good)` = matched opposite-pair good mass.
A proof needs one exact transfer statement among these, and that has not been de-conditioned.

**Knowledge Ledger Update**

`PROVEN: There is a canonical equivariant dependent coupling from intersecting bad-edge pairs to a selected common vertex y, and each selected pair forces an A_y-good union fiber.`

`PROVEN: The isotropic adversary has strictly positive nonlinear selector bonus κ_iso(y)=1/5 and strictly positive opposite-pair bonus B_x^iso=3/7.`

`PROVEN: The quadratic support invariant Δ_x and the stronger transport invariant B_x both see the Petersen 5-irrep geometry missed by linear edge-to-vertex maps.`

`PROVEN: Two tagged 3-supports through x whose outer edges are opposite force a full fiber.`

`PROVEN: In defect coordinates, singly tagged x-supported mass contributes +1/17, untagged mass contributes -15/17, and replacing untagged by x-tagged mass improves x-defect by 16/17 per unit mass.`

`PROVEN: The PSD certificate C_x(μ) ⪰ (1/2) B_x(μ) w_x w_x^T is valid and gives λ_x(μ) >= 2 B_x(μ).`

`DEAD: Any defect conclusion that treats full-fiber mass as interchangeable with singly tagged x-supported mass at rate 16/17.`  
Reason: full fibers have different defect effect.

`OPEN: Prove an absolute-constant transfer from bad opposite-pair mass B_x(bad) to either matched good mass B_x(good), distinct x-supported receiver supports N_x, or localized tagged load λ_x.`

`OPEN: Prove an anti-collision theorem for the union map strong enough to prevent triangle-style collapse of matched bad-pair mass.`

**Overall Assessment**

FATAL FLAW: `no`

The main mechanism is still viable. The recent work successfully isolated the correct nonlinear observable: not raw chamber marginals, but opposite-pair balance through a chosen vertex. The single most important `OPEN` question is:

`OPEN: Can one prove, unconditionally, that for some x,
B_x(good) >= c · B_x(bad)
or at least
N_x >= c · B_x(bad)
for an absolute c>0?`

That is the exact bridge still missing between the bad-pair coupling and an actual frequency gain.

PROGRESS RATING: `7/10`

#### The Defect Analyst (codex/gpt-5.4)

`CORRECT`  
`PROVEN: Exact defect table for the rigid good-fiber types.`  
Using `[P2]` and `[P5]`, for a fiber `L` of size `17` in the singly tagged/untagged cases:
- singly tagged on support `S` gives `p_x=9/17` for `x in S` and `1/17` for `x notin S`, hence
  \[
  \delta_x(L)=2p_x-1=
  \begin{cases}
  1/17,&x\in S,\\
  -15/17,&x\notin S,
  \end{cases}
  \]
- untagged gives `delta_x=-15/17`,
- full gives `delta_x=0`.  
This is exact defect bookkeeping.

`CORRECT`  
`PROVEN: A singly tagged x-supported fiber has defect capacity exactly +1 for x.`  
For a tagged receiver `G_S=2^S\cup\{M\}` with `x in S`,
\[
R_x-M_x=1.
\]
Equivalently after normalizing by `|G_S|=17`, its contribution is `+1/17`. This matches the rigid `9/17` frequency.

`CORRECT`  
`PROVEN: Opposite tagged 3-supports localize positive defect at the common vertex.`  
For supports `S_1={x,a,b}`, `S_2={x,c,d}` with masses `mu_1,mu_2`,
\[
x:\ \frac{\mu_1+\mu_2}{17},\qquad
a,b:\ \frac{\mu_1-15\mu_2}{17},\qquad
c,d:\ \frac{-15\mu_1+\mu_2}{17}.
\]
In particular if `mu_1=mu_2`, then only `x` is positive. This is the correct nonlinear localization.

`CORRECT`  
`PROVEN: Six-support saturation through one vertex gives x-defect equal to total tagged mass / 17.`  
If all six 3-supports through `x` are realized by singly tagged fibers of masses `mu_ab`, then
\[
\frac{|R_x|-|M_x|}{|F|}=\frac1{17}\sum_{ab}\mu_{ab}.
\]
That follows by summing `+1/17` over all `x`-supported tagged fibers.

`CORRECT`  
`PROVEN: Replacing untagged mass by singly tagged x-supported mass improves x-defect by 16/17 per unit mass.`  
This is
\[
\frac{1}{17}-\Big(-\frac{15}{17}\Big)=\frac{16}{17}.
\]
This is the correct defect conversion constant, but only for tagged-vs-untagged replacement.

`CORRECT`  
`PROVEN: The opposite-pair transport functional B_x is the right balanced nonlinear observable.`  
With `q_e` on the six `x`-supports and opposite involution `tau`,
\[
B_x=\sum_{\{e,\tau(e)\}}\min(q_e,q_{\tau(e)}).
\]
This is exactly the mass that can be coupled into support-disjoint opposite pairs. At isotropy `q_e=1/7`, so
\[
B_x^{\rm iso}=3/7.
\]

`CORRECT`  
`PROVEN: B_x dominates the quadratic invariant Delta_x.`  
If `Q_x=\sum_e q_e`, then
\[
B_x\ge \frac{2\Delta_x}{Q_x}.
\]
The proof via `min(u,v)\ge 2uv/(u+v)` is valid.

`CORRECT`  
`PROVEN: A non-full fiber cannot contain an opposite support pair.`  
If one fiber contains both `2^{\{x,a,b\}}\cup\{M\}` and `2^{\{x,c,d\}}\cup\{M\}` with opposite outer edges, then the earlier completion lemma yields `L=2^M`. So opposite-pair geometry cannot hide inside a non-full nontrivial tagged fiber.

`CORRECT`  
`PROVEN: The PSD lift is valid and positive on isotropy.`  
For
\[
C_x(\mu)=\sum_{ab}\mu_{ab}v_{ab}v_{ab}^\top,\qquad v_{ab}=\mathbf1_{S_{ab}}-\frac35\mathbf1,
\]
and `w_x=e_x-\frac15\mathbf1`, we have:
\[
v_{ab}+v_{cd}=w_x
\]
for each opposite pair `ab|cd`, hence
\[
C_x(\mu)\succeq \frac12 B_x(\mu)\, w_xw_x^\top.
\]
Also
\[
w_x^\top C_x(\mu)w_x=\frac{4}{25}\lambda_x(\mu),
\]
so if `C_x(\mu)\succeq \alpha w_xw_x^T`, then `lambda_x>=4 alpha`, yielding
\[
\lambda_x(\mu)\ge 2B_x(\mu).
\]
At isotropy this gives a strictly positive certificate.

`WRONG`  
`DEAD: Any defect bound that credits full-fiber mass at the 16/17 tagged-improvement rate.`  
Reason: full fibers have defect `0`, not `+1/17`. Relative to untagged baseline, one unit of full-fiber mass improves `x`-defect by `15/17`, whereas singly tagged `x`-mass improves by `16/17`. So any statement of the form
\[
\lambda_x\ge cB_x \Longrightarrow \text{defect improvement}\ge \frac{16c}{17}B_x
\]
is false if `lambda_x` includes full-fiber mass.

`UNJUSTIFIED`  
`OPEN: Transfer bad opposite-pair mass B_x(bad) into good matched mass, distinct receivers, or tagged load with an absolute constant.`  
What is still missing is an unconditional theorem of one of the forms
\[
B_x(\mathrm{good})\ge c\,B_x(\mathrm{bad}),\qquad
N_x\ge c\,B_x(\mathrm{bad}),\qquad
\lambda_x^{\rm tag}\ge c\,B_x(\mathrm{bad}).
\]
All current nonlinear quantities are internal descriptors, not yet connected by a proved transport theorem.

`UNJUSTIFIED`  
`OPEN: Anti-collision for the union map at the support level.`  
The defect calculations show one realized support only pays `+1`. So to use `B_x(bad)` one needs a structural theorem preventing matched bad-pair mass from collapsing onto too few supports/fibers. No such congestion bound has been proved.

`UNJUSTIFIED`  
`OPEN: Distinguish correctly between the three target variables lambda_x^{tag}, lambda_x^{full}, and N_x.`  
These are not interchangeable:
- `lambda_x^{tag}` converts to defect at rate `16/17` over untagged baseline,
- `lambda_x^{full}` converts only at `15/17`,
- `N_x` counts exact support capacities.  
A correct theorem must state which one is being lower-bounded.

**Knowledge Ledger Update**

`PROVEN: Exact defect contributions are 0 for full fibers, +1/17 on-support and -15/17 off-support for singly tagged fibers, and -15/17 for untagged fibers.`

`PROVEN: Each realized x-supported tagged receiver has exact positive defect capacity +1 for x; multiplicity at the same support does not amplify this capacity.`

`PROVEN: Opposite 3-support realizations through x concentrate positive defect at x and do not distribute it symmetrically to the outer vertices.`

`PROVEN: The nonlinear opposite-pair observable B_x is exact, strictly positive at isotropy with value 3/7, dominates Delta_x, and admits the PSD lift C_x(mu) ⪰ (1/2) B_x(mu) w_x w_x^T.`

`PROVEN: Any non-full fiber is matching-free in the six x-supports; an opposite support pair inside one fiber forces the full cube.`

`DEAD: Any argument that treats full-fiber load as defect-equivalent to singly tagged x-supported load.`  
Reason: full fibers contribute 0 defect, not +1/17.

`OPEN: Prove an absolute-constant theorem sending bad opposite-pair mass B_x(bad) to either tagged good mass, distinct x-supported receiver supports, or direct x-defect repair.`

`OPEN: Prove a support-level anti-collision theorem for the union map strong enough to stop triangle-style collapse of matched bad-pair mass.`

**Overall Assessment**

FATAL FLAW: `no`

The main approach is still alive. The single most important OPEN question is:
\[
\exists x:\quad N_x \ge c\, B_x(\mathrm{bad})
\]
or equivalently a tagged-load version with the full/tagged distinction handled correctly. Defect accounting is now sharp; the missing step is a genuine anti-collision theorem converting balanced opposite bad mass into many distinct realized `x`-supports.

PROGRESS RATING: `8/10`

#### The Structure Miner (codex/gpt-5.4)

`CORRECT`  
`PROVEN: The centered support vectors satisfy an exact opposite-pair identity.`  
With
\[
v_{ab}=\mathbf 1_{\{x,a,b\}}-\frac35\mathbf 1,\qquad
w_x=e_x-\frac15\mathbf 1,
\]
for any opposite pair \(ab\mid cd\) on \(M\setminus\{x\}\),
\[
v_{ab}+v_{cd}=w_x.
\]
This is an exact calculation:
\[
\mathbf 1_{xab}+\mathbf 1_{xcd}=\mathbf 1+e_x.
\]

`CORRECT`  
`PROVEN: The PSD lower bound C_x(\mu)\succeq \frac12 B_x(\mu)\,w_xw_x^\top is valid.`  
For one opposite pair with vectors \(v,w\) and masses \(u,v\), letting \(\beta=\min(u,v)\),
\[
u\,vv^\top+v\,ww^\top \succeq \beta(vv^\top+ww^\top)
\succeq \frac{\beta}{2}(v+w)(v+w)^\top,
\]
since
\[
vv^\top+ww^\top-\frac12(v+w)(v+w)^\top=\frac12(v-w)(v-w)^\top\succeq 0.
\]
Summing over the three opposite pairs gives the claim.

`CORRECT`  
`PROVEN: The PSD certificate implies the load bound \lambda_x(\mu)\ge 4\Psi_x(\mu)\ge 2B_x(\mu).`  
One checks
\[
w_x\cdot v_{ab}=\frac25,\qquad \|w_x\|^2=\frac45,
\]
so
\[
w_x^\top C_x(\mu)w_x=\sum_{ab}\mu_{ab}\Big(\frac25\Big)^2=\frac4{25}\lambda_x(\mu).
\]
If \(C_x(\mu)\succeq \alpha w_xw_x^\top\), then
\[
\frac4{25}\lambda_x(\mu)\ge \alpha\Big(\frac45\Big)^2=\frac{16}{25}\alpha,
\]
hence \(\lambda_x(\mu)\ge 4\alpha\). Combined with \(\Psi_x\ge B_x/2\), this gives \(\lambda_x\ge 2B_x\).

`CORRECT`  
`PROVEN: The PSD invariant is strictly positive on the isotropic adversary.`  
At isotropy, \(q_{ab}^{(x)}=1/7\) for all six supports, so
\[
B_x^{\mathrm{iso}}=3\cdot \frac17=\frac37,
\qquad
\Psi_x^{\mathrm{iso}}\ge \frac12\cdot \frac37=\frac{3}{14}>0.
\]
So this invariant satisfies the workshop requirement.

`CORRECT`  
`PROVEN: The PSD formulation is a genuine nonlinear repackaging of opposite-pair balance, not a new linear observable.`  
It depends quadratically on the support profile through the matrix
\[
C_x(\mu)=\sum_{ab}\mu_{ab}v_{ab}v_{ab}^\top,
\]
and it isolates the \(w_x\)-direction generated only by opposite-pair combinations. This is exactly outside the dead linear \(E\to V\) transfer framework.

`UNJUSTIFIED`  
`OPEN: Transfer bad opposite-pair mass into a good-side PSD certificate with an absolute constant.`  
The conditional step
\[
B_x(\text{good})\ge c\,B_x(\text{bad})
\Longrightarrow
C_x(\text{good})\succeq \frac c2 B_x(\text{bad})\,w_xw_x^\top
\]
is correct as an implication, but no unconditional argument yet proves
\[
B_x(\text{good})\ge c\,B_x(\text{bad}).
\]
What is needed is a genuine anti-collision/transport theorem for the union map.

`UNJUSTIFIED`  
`OPEN: The variable \mu in the PSD construction must be tied to actual fiber geometry, not just abstract support mass.`  
The matrix argument is internally correct once a good-side support profile \(\mu^{(x)}\) exists. What remains missing is a proved construction of such a profile from bad-pair data that respects the real tagged/full/untagged fiber decomposition.

**Knowledge Ledger Update**

`PROVEN: The opposite-pair support geometry through a fixed vertex x admits an exact PSD certificate: if C_x(\mu)=\sum_{ab}\mu_{ab}v_{ab}v_{ab}^\top with v_{ab}=\mathbf 1_{\{x,a,b\}}-\frac35\mathbf 1, then C_x(\mu)\succeq \frac12 B_x(\mu)\,w_xw_x^\top, where w_x=e_x-\frac15\mathbf 1.`

`PROVEN: The PSD certificate upgrades matched opposite-pair mass into localized tagged load via \lambda_x(\mu)\ge 2B_x(\mu).`

`PROVEN: The PSD invariant is strictly positive on the isotropic adversary; explicitly B_x^{iso}=3/7 and \Psi_x^{iso}\ge 3/14.`

`PROVEN: This PSD invariant sees the Petersen 5-irreducible geometry through the exact identity v_{ab}+v_{cd}=w_x for opposite pairs ab|cd.`

`OPEN: Prove an unconditional absolute-constant transfer from bad opposite-pair mass B_x(bad) to good matched mass B_x(good), or equivalently to a good-side PSD bonus along w_x.`

`OPEN: Prove a support-level anti-collision theorem for the union map strong enough to realize the PSD bonus on actual fibers rather than abstract support marginals.`

**Overall Assessment**

FATAL FLAW: `no`

The main approach is still alive. The single most important `OPEN` question is:
\[
\exists x:\qquad B_x(\mathrm{good})\ge c\,B_x(\mathrm{bad})
\]
for some absolute \(c>0\), or an equivalent PSD-form transfer
\[
C_x(\mathrm{good})\succeq c\,B_x(\mathrm{bad})\,w_xw_x^\top.
\]
That is now the exact missing bridge from the nonlinear invariant to an actual frequency gain.

PROGRESS RATING: `8/10`

### SYNTHESIS

#### The Coupling Builder (codex/gpt-5.4)

## 1. THEOREM/RESULT STATEMENT

**Theorem (strongest unconditional result from the workshop).**  
Let \(\mathcal F\) be a union-closed family, let \(M\in \mathcal F\) be a minimal set with \(|M|=5\), and write the fiber decomposition
\[
\mathcal F=\bigsqcup_T \{T\cup S:S\in L_T\}
\]
as in [P1]. Suppose \(L_T,L_U\) are two bad fibers with \(T\subseteq U\), and let their bad labels be \(e,f\in \binom{M}{2}\).

Then:

1. **Comparable-fiber intersection lemma.**
   \[
   e\cap f\neq \varnothing.
   \]

2. **Canonical dependent coupling to a vertex.**  
   There is a unique \(S_5\)-equivariant stochastic selector
   \[
   K(y\mid e,f)
   \]
   from intersecting ordered edge-pairs \((e,f)\) to vertices \(y\in M\), defined by
   \[
   K(y\mid e,f)=
   \begin{cases}
   1,& e\neq f,\ e\cap f=\{y\},\\
   1/2,& e=f\ni y,\\
   0,& \text{otherwise.}
   \end{cases}
   \]
   For every selected \(y\in e\cap f\), the union fiber \(L_U\) is \(A_y\)-good: by [P3],
   \[
   L_U\supseteq 2^{e\cup f}\cup\{M\},
   \]
   and since \(\{y\}\in 2^{e\cup f}\), [P4] gives
   \[
   p_y(L_U)\ge \tfrac12.
   \]

3. **Opposite-pair nonlinear invariant.**  
   Fix \(x\in M\). Identify the six \(x\)-supported 3-sets \(\{x,a,b\}\) with the six edges \(ab\) of \(K_4\) on \(M\setminus\{x\}\). If \(q^{(x)}_{ab}\) is the selected-support mass on \(\{x,a,b\}\), define
   \[
   B_x:=\min(q_{ab},q_{cd})+\min(q_{ac},q_{bd})+\min(q_{ad},q_{bc}),
   \]
   where \(ab|cd\), \(ac|bd\), \(ad|bc\) are the three opposite edge-pairs in \(K_4\).

   Then \(B_x\) is a genuinely nonlinear transport observable, and at the isotropic adversary,
   \[
   q^{(x)}_{ab}=\frac17 \quad \forall ab,
   \qquad
   B_x^{\mathrm{iso}}=\frac37>0.
   \]

4. **Full-cube completion from opposite supports.**  
   If a fiber \(L\) contains both
   \[
   2^{\{x,a,b\}}\cup\{M\}
   \quad\text{and}\quad
   2^{\{x,c,d\}}\cup\{M\}
   \]
   with \(\{a,b,c,d\}=M\setminus\{x\}\), then \(L=2^M\).

5. **PSD lift.**  
   Let
   \[
   v_{ab}:=\mathbf 1_{\{x,a,b\}}-\frac35\mathbf 1,\qquad
   w_x:=e_x-\frac15\mathbf 1,
   \]
   and define
   \[
   C_x(\mu):=\sum_{ab}\mu_{ab}v_{ab}v_{ab}^\top .
   \]
   Then
   \[
   C_x(\mu)\succeq \frac12\,B_x(\mu)\,w_xw_x^\top.
   \]
   Consequently, if \(\lambda_x(\mu):=\sum_{ab}\mu_{ab}\), then
   \[
   \lambda_x(\mu)\ge 2B_x(\mu).
   \]

6. **Exact defect bookkeeping for good fibers.**  
   For a good fiber \(L\), with
   \[
   \delta_x(L):=\frac{|R_x(L)|-|M_x(L)|}{|L|}=2p_x(L)-1,
   \]
   the three rigid types [P2] give:
   \[
   \delta_x(L)=
   \begin{cases}
   0,& L\text{ full},\\
   +1/17,& L\text{ singly tagged and }x\text{ in support},\\
   -15/17,& L\text{ singly tagged and }x\text{ off support},\\
   -15/17,& L\text{ untagged}.
   \end{cases}
   \]
   Hence replacing one unit of untagged mass by one unit of singly tagged \(x\)-mass improves \(x\)-defect by
   \[
   \frac{16}{17}.
   \]

These statements isolate the correct nonlinear target: an absolute-constant transfer from bad-side opposite-pair mass \(B_x(\mathrm{bad})\) to good-side tagged load, good-side matched mass, or distinct realized \(x\)-supports would imply the desired \(p_x\) gain.

---

## 2. PROOF OR PROOF SKETCH

### Step 1: comparable bad labels must intersect
If \(T\subseteq U\) are bad fibers with labels \(e,f\), then applying [P3] to the pair \((T,U)\) gives
\[
L_U\supseteq 2^{e\cup f}\cup\{M\}
\]
whenever \(e\cap f=\varnothing\). That contradicts badness of \(L_U\). So \(e\cap f\neq\varnothing\).

This is unconditional and already nonlinear: it constrains the joint pair law of comparable bad fibers, not any linear marginal.

### Step 2: canonical coupling from bad pairs to a selected common vertex
Because intersecting ordered pairs have either one common vertex (\(e\neq f\)) or two (\(e=f\)), equivariance forces the selector \(K\) above. This gives a dependent coupling
\[
(e,f)\mapsto Y\in e\cap f.
\]
If \(Y=y\), then [P3] forces \(2^{e\cup f}\cup\{M\}\) inside the union fiber, and \(\{y\}\) lies in that cube, so [P4] yields \(A_y\)-goodness.

At isotropy, the intersecting ordered-pair law is uniform on 70 pairs, so symmetry gives
\[
\kappa_{\mathrm{iso}}(y)=\frac15.
\]

### Step 3: opposite-pair transport is the right nonlinear observable
Fix \(x\). The six selected 3-supports through \(x\) form the edge set of \(K_4\). The only support pattern that avoids all dead linear reductions is an opposite pair:
\[
\{x,a,b\},\ \{x,c,d\},\qquad \{a,b,c,d\}=M\setminus\{x\}.
\]
This motivates
\[
B_x=\sum_{\text{3 opposite pairs}}\min(q_e,q_{\tau(e)}),
\]
the exact matched mass under the opposite-edge involution.

At isotropy, \(q_e=1/7\), so \(B_x^{\rm iso}=3/7\).

### Step 4: opposite supports cannot hide in a non-full fiber
If one fiber contains tagged supports on both opposite 3-sets \(S_1,S_2\) through \(x\), then every \(A\subseteq M\) can be written as
\[
A=(A\cap S_1)\cup(A\cap S_2),
\]
with both pieces lying in the fiber. Union-closure then gives every subset of \(M\), so the fiber is full.

Thus opposite-pair mass either:
- lands in a full fiber, or
- forces distinct non-full receivers.

This is exactly the anti-collapse feature that triangle atoms do not have.

### Step 5: PSD certificate
For opposite pairs \(ab|cd\),
\[
v_{ab}+v_{cd}=w_x.
\]
Hence for one opposite pair with masses \(u,v\) and \(\beta=\min(u,v)\),
\[
u\,v_{ab}v_{ab}^\top+v\,v_{cd}v_{cd}^\top
\succeq \beta\big(v_{ab}v_{ab}^\top+v_{cd}v_{cd}^\top\big)
\succeq \frac{\beta}{2}w_xw_x^\top.
\]
Summing over the three opposite pairs gives
\[
C_x(\mu)\succeq \frac12 B_x(\mu)w_xw_x^\top.
\]

Also,
\[
w_x\cdot v_{ab}=\frac25,\qquad \|w_x\|^2=\frac45,
\]
so
\[
w_x^\top C_x(\mu)w_x=\frac4{25}\lambda_x(\mu).
\]
If \(C_x(\mu)\succeq \alpha w_xw_x^\top\), then
\[
\frac4{25}\lambda_x(\mu)\ge \alpha\frac{16}{25},
\]
hence \(\lambda_x(\mu)\ge 4\alpha\). Using \(\alpha\ge B_x/2\) gives
\[
\lambda_x(\mu)\ge 2B_x(\mu).
\]

### Step 6: defect translation
By [P5], \(p_x=\frac12+\frac{|R_x|-|M_x|}{2|\mathcal F|}\). Using [P2], the exact defect contributions of full, tagged, and untagged good fibers are as listed above. Therefore:
- full mass contributes zero defect;
- tagged mass through \(x\) contributes \(+1/17\);
- untagged mass contributes \(-15/17\);
- replacing untagged by \(x\)-tagged improves by \(16/17\).

So any theorem of the form
\[
\lambda_x^{\rm tag}\ge c\,B_x(\mathrm{bad})
\]
would immediately give a defect improvement
\[
\frac{16c}{17}B_x(\mathrm{bad}),
\]
hence a frequency gain via [P5].

### Gap
What is **not** proved is the transfer
\[
B_x(\mathrm{bad})\to \lambda_x^{\rm tag}
\quad\text{or}\quad
B_x(\mathrm{bad})\to N_x
\quad\text{or}\quad
B_x(\mathrm{bad})\to B_x(\mathrm{good})
\]
with absolute constant. That is the remaining conjectural step.

---

## 3. WHAT WAS ACHIEVED

This is **partial progress, not a complete proof**.

What was achieved is a sharp reduction of the \(k=5\) problem to a specific nonlinear transport statement.

The workshop identified:
- the correct dependent coupling: comparable bad-pair coupling with canonical common-vertex selection;
- the correct nonlinear observable: opposite-pair matched mass \(B_x\), not any linear edge-to-vertex functional;
- an SDP/PSD lift of that observable;
- exact defect conversion constants for the rigid good-fiber types;
- the precise obstruction: anti-collision failure of the union map, especially triangle-style collapse.

So the problem is now much more refined. The isotropic LP adversary is separated by a strictly positive nonlinear invariant:
\[
B_x^{\mathrm{iso}}=\frac37,
\qquad
\Psi_x^{\mathrm{iso}}\ge \frac{3}{14},
\]
while real geometry forces strong structural constraints on how that mass can be realized.

What is still missing is the final bridge from bad-side opposite transport to actual good-side tagged load or defect repair.

---

## 4. OPEN QUESTIONS

1. **Absolute-constant transfer theorem.**  
   Prove that for some \(x\in M\),
   \[
   \lambda_x^{\rm tag}\ge c\,B_x(\mathrm{bad})
   \]
   for an absolute \(c>0\).

2. **Support-count version.**  
   Prove instead
   \[
   N_x\ge c\,B_x(\mathrm{bad}),
   \]
   where \(N_x\) counts distinct realized \(x\)-supported tagged receivers. This matches exact defect capacity more closely.

3. **Good-side matched-mass transfer.**  
   Prove
   \[
   B_x(\mathrm{good})\ge c\,B_x(\mathrm{bad}),
   \]
   which, by the PSD lift, would imply a positive \(w_x\)-direction certificate and then a load bound.

4. **Anti-collision theorem for the union map.**  
   Control how much opposite-pair bad mass can collapse under
   \[
   (T,U)\mapsto T\cup U.
   \]
   This is the core unresolved combinatorial problem.

5. **Triangle obstruction.**  
   Show that triangle-type collapse cannot persist at isotropic scale, or quantify exactly how much \(B_x\) it can absorb.

6. **Full vs tagged accounting.**  
   Any final theorem must distinguish carefully between:
   \[
   \lambda_x^{\rm tag},\qquad \lambda_x^{\rm full},\qquad N_x.
   \]
   Full fibers are good but contribute defect \(0\), so they cannot be counted at the tagged rate.

---

## 5. KEY INSIGHT

The single most important idea is:

**The right object is not a linear load on vertices, but a dependent coupling on comparable bad fibers that selects a common vertex and measures balanced opposite-pair mass \(B_x\) among the six 3-supports through \(x\).**

This does exactly what all dead linear approaches failed to do:
- it is strictly positive on the isotropic adversary;
- it sees the hidden Petersen \(5\)-dimensional geometry;
- it interacts correctly with union-closure, because opposite supports either force a full cube or many distinct tagged receivers;
- and it connects cleanly to the exact defect formula once tagged mass is produced.

So the workshop reduced the \(k=5\) barrier to one sharply posed nonlinear anti-collision problem.

