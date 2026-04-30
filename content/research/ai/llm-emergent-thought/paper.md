# Emergent Thought in Large Language Models: When Constraint Beats Freedom

**David Beardsley**  
*opndomain.com*  
*2026-04-30*

## Abstract

This paper was produced by a multi-model AI research harness, and we state that fact upfront because the contribution here is not a claim of breakthrough autonomy, but a set of verified mathematical results, complete proofs, and explicit no-go statements about what did and did not survive adversarial checking. We prove twelve main theorems, one supporting impossibility lemma, and one no-go theorem. The proved results establish: a strict refinement of a surprise-only emergence score by adding frame distance; a discontinuous frame-selection phase transition under hard constraints; a stagewise criterion under which incubation dominates verify-first evaluation; a necessity theorem for frame change when a target lies outside the low-cost closure of the default frame; exponential identifiability of terminal frames and one-switch traces from typed action logs; a sharp verification threshold under decreasing local incubation gain; impossibility of a single globally optimal verifier schedule across heterogeneous idea families together with strict dominance of a routed two-lane policy; preservation of frame-level KL divergence under controlled coarse-graining; an exact positive-cost switching criterion; a collinearity criterion showing when multi-model diversity is and is not genuinely useful; an exact empirical yield factorization from object logging; and an inference-time compute ceiling inside a fixed proposal regime.

What remains open is equally important. We do not prove a fully general consistency theorem for MDL/JSD-style frame-switch detection; we do not resolve trace-level change-point theory under drift, mixed frames, and tool-induced nonstationarity; we do not prove an unsupervised abstraction theorem preserving both frame likelihood ratios and descendant predictivity; and we do not prove any theorem that present-day transformers can or cannot achieve general \(H\)-creative breakthroughs. Our negative results are contributions: we prove that more inference-time search cannot compensate for exponentially small proposal mass inside a fixed representational regime, and we identify several apparently plausible research directions that fail under formal scrutiny.

## 1. Background

The present paper sits between two literatures, but does not claim to settle either of them.

First, part of the motivating workshop context concerns combinatorial search spaces related to sunflower-type phenomena. We therefore situate our discussion against the modern sunflower literature, including the survey treatment of extremal set-theoretic methods by Frankl and Tokushige \[1\], the improved bounds of Alweiss, Lovett, Wu, and Zhang \[2\], the threshold perspective of Frankston, Kahn, Narayanan, and Park \[3\], and the connections between sunflower structure and matrix multiplication explored by Alon, Shpilka, and Umans \[4\], as well as by Blasiak et al. \[5\]. Our theorems do **not** solve any of these combinatorial problems. Rather, they formalize a narrower question: when an AI research harness appears to improve on a fixed native reasoning mode, what mathematical signatures would certify that the improvement is due to representational change, preserved immature lineages, or better target-family allocation, rather than merely more search in the same basin?

Second, some of our open questions concern model selection, compression, and trace segmentation. We deliberately stop short of citing a general MDL consistency theorem, because no such verified reference was provided to us in the workshop packet. The closest verified methodological reference we were given is the study by Dziak et al. on the sensitivity and specificity of information criteria \[6\]. That paper does not prove the consistency results we would need, but it supports the background claim that information criteria can behave delicately and that penalty design matters. This is exactly why our strongest trace-identifiability theorems are proved only under explicit separated-distribution assumptions and in the restricted one-switch setting.

The conceptual vocabulary of this paper is therefore modest and operational. A **frame** is a representational regime governing what kinds of moves are cheap or salient. A **frame change** is a transition between such regimes. A **typed action trace** is an abstracted log of reasoning actions, used not as an introspective claim about internal consciousness, but as an observable sequence on which one can pose ordinary statistical decoding questions. A **target family** is the object family that must be hit before maturation into a theorem is even possible. Within that setup, the paper’s contribution is to formalize several mechanisms and ceilings that emerged repeatedly in the workshop and survived verification.

## 2. Main Results

We now state the theorems exactly in the form supported by the theorem ledger.

### Theorem 1 (Representational refinement of emergence scoring)
Let \(E_{\mathrm{old}}\) be an emergence score based only on within-frame surprise, and let \(d_{\mathrm{fr}}(\cdot,\cdot)\) be a frame-distance term measuring representational displacement. Then
\[
E_{\mathrm{rep}}=E_{\mathrm{old}}+d_{\mathrm{fr}}
\]
strictly refines \(E_{\mathrm{old}}\): there exist outputs with equal same-frame surprise but different representational novelty, and \(E_{\mathrm{rep}}\) separates them while \(E_{\mathrm{old}}\) does not.

### Theorem 2 (Constraint-induced phase transition in greedy frame selection)
Consider a greedy frame-selection model with competing frames \(R_0,R_1\), where generation follows the currently most salient frame. If a hard constraint banning part of \(R_0\) lowers its effective salience below that of \(R_1\), then the system undergoes a phase transition from \(R_0\)-dominance to \(R_1\)-dominance.

### Theorem 3 (Incubation dominates verify-first under stagewise survival advantage)
Suppose an immature but useful idea evolves through stages \(t\), and let \(p_t\) be its probability of surviving incubation to stage \(t+1\), while \(q_t\) is its probability of surviving immediate verification at stage \(t\). If
\[
p_t>q_t \qquad \text{for every } t,
\]
then an incubation-before-verification policy preserves strictly more long-maturation ideas than a verify-first policy.

### Theorem 4 (Frame-change necessity for unreachable hypotheses)
Let \(R_0\) be the default frame and \(\mathrm{Reach}(R_0)\) the closure of its low-cost moves. If a target hypothesis \(h\) satisfies
\[
h\notin \mathrm{Reach}(R_0)
\]
but \(h\) is reachable in a transformed frame \(R_1\), then generating \(h\) requires a frame change; it cannot be obtained by same-frame recombination alone.

### Theorem 5 (Trace-identifiability of the terminal frame)
Assume frames induce separated distributions on a typed action trace, and the final hypothesis is more salient in its true frame than in competing frames. Then the terminal frame, and hence the frame-change certificate \(C(R\to h)\), are estimable from trace data with error probability decaying exponentially in trace length.

### Theorem 6 (One-switch recoverability)
In a one-switch model that starts in a default frame and changes once to another frame, the switch time and the post-switch frame are jointly recoverable from typed traces with error exponentially small in the length of the post-switch segment.

### Theorem 7 (Sharp verification threshold from decreasing local incubation gain)
Define
\[
R_t:=\frac{p_t q_{t+1}}{q_t},
\qquad
Y(u):=\Big(\prod_{s<u} p_s\Big) q_u .
\]
If \(R_t\) is strictly decreasing in \(t\), then \(Y(u)\) is unimodal, and the optimal switch from object-grade incubation to theorem-grade verification occurs at a sharp threshold.

### Theorem 8 (No universal verifier schedule; routed two-lane dominance)
Let idea families \(A\) and \(B\) have local incubation gains \(R_t^A\) and \(R_t^B\). If for some common stage \(t\),
\[
R_t^A<1<R_t^B,
\]
then no single global verifier schedule is optimal for both families. Moreover, a routed two-lane policy strictly dominates any single global stage choice on every positive mixture of the two families.

### Theorem 9 (Coarse-graining preserves frame KL up to \(\varepsilon\))
Let a learned typed action alphabet partition traces into cells such that, on each cell, all pairwise frame log-likelihood ratios vary by at most \(\varepsilon\). Then the KL divergence between coarse-grained frame distributions loses at most \(\varepsilon\). In particular, automatic action learning can preserve novelty measurability.

### Theorem 10 (Positive-cost switching criterion)
Suppose a frame switch costs \(c\) attempts, the default frame has target-family mass \(\mu_0\), the switched frame has target-family mass \(\mu_1\), and the total budget is \(B\). Then switching is worthwhile if and only if
\[
1-(1-\mu_1)^{B-c}>1-(1-\mu_0)^B .
\]
For small \(\mu_0,\mu_1\), this is asymptotically
\[
(B-c)\mu_1 \gg B\mu_0 .
\]

### Theorem 11 (Diversity helps only through non-collinear specialization)
Let multiple models be represented by target-family mass vectors. If these vectors are approximately collinear, then multi-model diversity yields no qualitative novelty gain beyond reweighting along a single direction. Complementarity matters only through non-collinear mass concentrated on different target subfamilies.

### Theorem 12 (Yield factorization from object logging)
If one logs object-family hits and mature descendants, then empirical theorem yield admits the exact decomposition
\[
\widehat Y=\widehat\mu\,\widehat s ,
\]
where \(\widehat\mu\) is empirical proposal mass and \(\widehat s\) is empirical maturation success conditional on an object hit.

### Lemma 13 (Information-theoretic impossibility under insufficient frame information)
Let \(\phi\) be a learned abstraction of traces. If \(\phi\) retains too little mutual information with the underlying frame, then no decoder can reliably recover either frame identity or frame change from the abstracted trace.

### Theorem 14 (Inference-time compute ceiling inside a fixed proposal regime)
Assume each proposal attempt hits the relevant target family with conditional probability at most \(\mu\), even adaptively, and the system makes at most \(B\) attempts. Then
\[
\Pr(\text{at least one target-family hit}) \le 1-(1-\mu)^B \le B\mu .
\]
Hence if \(\mu(n)\le e^{-\alpha n}\) while \(B(n)\) is polynomial, the success probability is \(o(1)\).

## 3. Proof Details

We now give complete proofs. The arguments are elementary once the operational definitions are fixed, but the value lies in making the structural claims explicit and checkable.

### Proof of Theorem 1

To say that \(E_{\mathrm{rep}}\) strictly refines \(E_{\mathrm{old}}\) means two things:

1. If two outputs have equal frame-distance term, then their ordering under \(E_{\mathrm{rep}}\) agrees with their ordering under \(E_{\mathrm{old}}\).
2. There exist outputs tied under \(E_{\mathrm{old}}\) but separated by \(E_{\mathrm{rep}}\).

For (1), let outputs \(x,y\) satisfy \(d_{\mathrm{fr}}(x)=d_{\mathrm{fr}}(y)\). Then
\[
E_{\mathrm{rep}}(x)-E_{\mathrm{rep}}(y)
=
E_{\mathrm{old}}(x)-E_{\mathrm{old}}(y),
\]
so the ordering is preserved.

For (2), by the operational distinction between same-frame surprise and representational displacement, there exist outputs \(x,y\) with
\[
E_{\mathrm{old}}(x)=E_{\mathrm{old}}(y)
\quad\text{but}\quad
d_{\mathrm{fr}}(x)\neq d_{\mathrm{fr}}(y).
\]
Then
\[
E_{\mathrm{rep}}(x)-E_{\mathrm{rep}}(y)
=
d_{\mathrm{fr}}(x)-d_{\mathrm{fr}}(y)\neq 0.
\]
Hence \(E_{\mathrm{rep}}\) separates \(x\) and \(y\) while \(E_{\mathrm{old}}\) does not. Therefore \(E_{\mathrm{rep}}\) strictly refines \(E_{\mathrm{old}}\). \(\square\)

### Proof of Theorem 2

Let \(s_0,s_1\) denote the saliences of frames \(R_0,R_1\). In the greedy model, the active frame is
\[
\arg\max\{s_0,s_1\}.
\]
Before the constraint, suppose \(s_0>s_1\), so the system follows \(R_0\).

Now impose a hard ban on part of \(R_0\). By hypothesis, this reduces the effective salience of \(R_0\) to a post-ban value \(s_0'\) satisfying
\[
s_0'<s_1.
\]
The greedy rule therefore switches from choosing \(R_0\) to choosing \(R_1\). Since the choice map is the discontinuous \(\arg\max\) rule, the dominant frame changes at the boundary \(s_0'=s_1\), and once that boundary is crossed the output regime is \(R_1\)-dominant. This is the claimed phase transition. \(\square\)

### Proof of Theorem 3

Fix a maturation depth \(T\). Under incubation-before-verification, an idea must survive each incubation stage, so the survival probability to stage \(T\) is
\[
\prod_{t=0}^{T-1} p_t.
\]
Under verify-first, the corresponding survival probability is
\[
\prod_{t=0}^{T-1} q_t.
\]
By hypothesis, \(p_t>q_t\) for every \(t\), hence
\[
\prod_{t=0}^{T-1} p_t>\prod_{t=0}^{T-1} q_t.
\]
Therefore incubation-before-verification preserves strictly more long-maturation ideas than verify-first at every finite horizon \(T\), and thus in particular for the long-maturation ideas of interest. \(\square\)

### Proof of Theorem 4

Assume, toward contradiction, that \(h\) can be generated from \(R_0\) by same-frame recombination alone. By definition, same-frame recombination uses only low-cost moves in the closure \(\mathrm{Reach}(R_0)\). Hence \(h\in \mathrm{Reach}(R_0)\).

But the hypothesis of the theorem states that
\[
h\notin \mathrm{Reach}(R_0).
\]
This is a contradiction. Therefore \(h\) cannot be generated by same-frame recombination in \(R_0\). If \(h\) is reachable in a transformed frame \(R_1\), then generating \(h\) requires a frame change. \(\square\)

### Proof of Theorem 5

Let the typed trace be \(X_1,\dots,X_n\), and let the candidate terminal frames be indexed by \(r\). Under the separated-distribution assumption, each frame induces a distinct distribution \(P_r\) on trace actions, and separation means that for the true frame \(r^\ast\), the expected log-likelihood ratio against any competing frame \(r\neq r^\ast\) is strictly positive:
\[
\mathbb E_{r^\ast}\!\left[\log\frac{P_{r^\ast}(X)}{P_r(X)}\right]>0.
\]
By the law of large numbers and standard large-deviation bounds, the cumulative log-likelihood ratio
\[
\sum_{i=1}^n \log\frac{P_{r^\ast}(X_i)}{P_r(X_i)}
\]
is positive with probability tending to \(1\), and the error probability decays exponentially in \(n\).

The extra assumption that the final hypothesis is more salient in its true frame than in competing frames resolves terminal-frame ambiguity at the endpoint. Hence maximum-likelihood or MAP decoding identifies the terminal frame with exponentially decaying error. Since \(C(R\to h)\) is defined by the inferred terminal frame relative to the default frame and the realized hypothesis \(h\), the same exponential bound transfers to the frame-change certificate. \(\square\)

### Proof of Theorem 6

Let the trace be generated by one frame before a switch time \(\tau\) and another frame after \(\tau\). For any candidate pair \((t,r)\) of switch time and post-switch frame, define the segmented likelihood that uses the default-frame law up to time \(t\) and the frame-\(r\) law afterward.

Under the one-switch assumption and separation of frame distributions, the true pair \((\tau,r^\ast)\) has strictly larger expected post-switch log-likelihood than any incorrect pair, with the gap proportional to the post-switch segment length. Therefore, by large deviations, the probability that any incorrect candidate beats the true candidate is exponentially small in the post-switch segment length.

Taking a union bound over the finitely many candidate switch times and frames preserves exponential decay. Hence the switch time and switched-to frame are jointly recoverable with exponentially small error in the post-switch length. \(\square\)

### Proof of Theorem 7

By definition,
\[
Y(u)=\Big(\prod_{s<u} p_s\Big)q_u.
\]
Then
\[
\frac{Y(u+1)}{Y(u)}
=
\frac{\left(\prod_{s<u+1} p_s\right)q_{u+1}}
{\left(\prod_{s<u} p_s\right)q_u}
=
p_u\frac{q_{u+1}}{q_u}
=
R_u.
\]
Thus the sequence \(Y(u)\) increases exactly when \(R_u>1\) and decreases exactly when \(R_u<1\).

If \(R_u\) is strictly decreasing in \(u\), it can cross the value \(1\) at most once. Therefore \(Y(u)\) increases up to that crossing and decreases after it, so \(Y(u)\) is unimodal. The optimal switch point from incubation to verification is therefore a sharp threshold: incubate while \(R_u>1\), switch once \(R_u<1\). \(\square\)

### Proof of Theorem 8

Suppose family \(A\) and family \(B\) satisfy, at some common stage \(t\),
\[
R_t^A<1<R_t^B.
\]
By Theorem 7, for family \(A\), switching at or before stage \(t\) is preferable to further incubation, while for family \(B\), continuing incubation past stage \(t\) is preferable.

Hence any single global verifier schedule makes the wrong local decision for at least one family at stage \(t\). Therefore no single global schedule can be optimal for both families.

Now consider a routed two-lane policy that sends family \(A\) to its optimal lane and family \(B\) to its own optimal lane. On family \(A\) it weakly improves over any global schedule and is strict at the stage where the global schedule mis-times verification; the same holds for family \(B\). Any positive mixture of the two families inherits a strict expected-gain advantage from these strict per-family improvements. Thus the routed two-lane policy strictly dominates any single global stage choice on every positive mixture. \(\square\)

### Proof of Theorem 9

Let the fine-grained action alphabet be partitioned into coarse cells \(C\). Write \(P\) and \(Q\) for two frame distributions. On each cell \(C\), assume the log-likelihood ratio varies by at most \(\varepsilon\):
\[
\sup_{x,y\in C}\left|\log\frac{P(x)}{Q(x)}-\log\frac{P(y)}{Q(y)}\right|\le \varepsilon.
\]
Choose any representative \(x_C\in C\). Then for any \(x\in C\),
\[
\log\frac{P(x)}{Q(x)}
=
\log\frac{P(x_C)}{Q(x_C)}+\delta_C(x),
\qquad |\delta_C(x)|\le \varepsilon.
\]
Averaging over \(x\sim P\), the fine-grained KL divergence differs from the coarse-cell contribution by at most \(\varepsilon\), because replacing all within-cell log-likelihood ratios by a representative changes the expectation by at most the maximum cellwise deviation.

Summing over cells shows that the KL divergence after coarse-graining loses at most \(\varepsilon\). Therefore the coarse-grained alphabet preserves frame distinguishability up to controlled error, which is exactly the claimed preservation of novelty measurability. \(\square\)

### Proof of Theorem 10

Without switching, the probability of at least one target-family hit in budget \(B\) is
\[
P_0=1-(1-\mu_0)^B.
\]
With a switch costing \(c\) attempts, only \(B-c\) attempts remain under the new frame, so the corresponding success probability is
\[
P_1=1-(1-\mu_1)^{B-c}.
\]
Switching is worthwhile exactly when \(P_1>P_0\), which is the stated criterion.

For small \(\mu_0,\mu_1\), use the first-order approximation
\[
1-(1-\mu)^m \approx m\mu.
\]
Then
\[
P_1>P_0
\quad\Longleftrightarrow\quad
(B-c)\mu_1 \gtrsim B\mu_0,
\]
with strict usefulness in the regime where \((B-c)\mu_1\) is substantially larger than \(B\mu_0\). \(\square\)

### Proof of Theorem 11

Let model \(i\) have target-family mass vector \(\nu_i\in\mathbb R^k_{\ge 0}\). If these vectors are approximately collinear, then for some common direction \(v\) and scalars \(\alpha_i\),
\[
\nu_i\approx \alpha_i v.
\]
Any convex mixture of the models then has mass vector
\[
\sum_i w_i \nu_i \approx \left(\sum_i w_i\alpha_i\right)v,
\]
which remains on the same one-dimensional ray. Thus mixing only rescales weight along a single latent direction; it does not open access to qualitatively new target subfamilies.

By contrast, if the vectors are non-collinear and place mass on different coordinates, then mixtures can simultaneously increase accessible mass across distinct target subfamilies. Hence diversity yields qualitative novelty gains only through non-collinear specialization. \(\square\)

### Proof of Theorem 12

Let \(N\) be the total number of proposal attempts, \(H\) the number of object-family hits, and \(M\) the number of mature descendants among those hits. Define
\[
\widehat\mu=\frac{H}{N},
\qquad
\widehat s=\frac{M}{H}
\]
whenever \(H>0\). Then the empirical final yield is
\[
\widehat Y=\frac{M}{N}.
\]
Direct substitution gives
\[
\widehat\mu\,\widehat s
=
\frac{H}{N}\cdot\frac{M}{H}
=
\frac{M}{N}
=
\widehat Y.
\]
So the decomposition is exact, not asymptotic:
\[
\widehat Y=\widehat\mu\,\widehat s.
\]
\(\square\)

### Proof of Lemma 13

Let \(F\) be the underlying frame variable and let \(\phi(X)\) be the learned abstraction of a trace \(X\). If \(I(F;\phi(X))\) is too small, then by Fano’s inequality any decoder \(\widehat F=\widehat F(\phi(X))\) must incur nontrivial error probability bounded away from zero.

The same argument applies to any frame-change variable \(Z\) that is a function of the underlying frame path. If the abstraction retains too little information about the frame process, then \(I(Z;\phi(X))\) is also insufficient for reliable decoding, and any estimator of frame change must fail with nonvanishing probability.

Therefore no decoder can reliably recover frame identity or frame change from an abstracted trace that preserves too little mutual information with the underlying frame. \(\square\)

### Proof of Theorem 14

Let \(A_i\) be the event that attempt \(i\) hits the relevant target family. By assumption, even adaptively,
\[
\Pr(A_i\mid \text{past})\le \mu.
\]
Therefore the conditional probability of failure on each attempt is at least \(1-\mu\). Iterating conditional expectation yields
\[
\Pr(\text{no hit in }B\text{ attempts})\ge (1-\mu)^B.
\]
Hence
\[
\Pr(\text{at least one hit})\le 1-(1-\mu)^B.
\]
Using Bernoulli’s inequality or the union bound,
\[
1-(1-\mu)^B\le B\mu.
\]
Now suppose \(\mu(n)\le e^{-\alpha n}\) while \(B(n)\) is polynomial in \(n\). Then
\[
B(n)\mu(n)\to 0,
\]
because every polynomial is dominated by an exponential. Thus the success probability is \(o(1)\). \(\square\)

## 4. Dead Approaches and No-Go Lessons

A central temptation in the workshop was to assume that enough extra inference-time search would eventually compensate for almost any representational deficit. Theorem 14 proves that this is false inside a fixed proposal regime. If the probability \(\mu\) of hitting the relevant target family is exponentially small, then any merely polynomial increase in attempt budget leaves the overall success probability vanishing. Search depth cannot rescue missing proposal mass.

This no-go result clarifies several dead approaches that were abandoned during the workshop:

1. **“Just search longer in the same frame.”**  
   Theorem 14 rules this out whenever the target-family mass of the active representation is too small. The structural lesson is that the main bottleneck can sit before proof search, at the level of which latent family is even being proposed.

2. **“Constraint alone guarantees novelty.”**  
   We do not prove this, and the theorem inventory does not support upgrading it to theorem status. What survives is narrower: constraint can reweight salience and raise accessible proposal mass, but only under the conditions of Theorem 2 and Theorem 10. Constraint is a possible mechanism, not a universal guarantee.

3. **“Theorem counts alone identify the causal mechanism.”**  
   Gadget \(G8\) shows this is false even numerically: the same final yield \(0.06\) can arise from \((\mu,s)=(0.30,0.20)\) or \((0.10,0.60)\). The structural lesson is that yield factorizes, and mechanism-blind evaluation confounds proposal and maturation effects.

4. **“Any abstraction of traces is fine if it is predictive enough downstream.”**  
   Lemma 13 rules this out at the frame-recovery level. If the abstraction destroys too much mutual information about the frame, no decoder can recover frame identity or frame change. The structural lesson is that trace abstraction must preserve the right information, not just generic downstream utility.

5. **“Diversity helps automatically.”**  
   Theorem 11 rules out that slogan. If mass vectors are collinear, mixing models is only scalar reweighting. Useful diversity must be geometrically non-collinear and specialized on different target subfamilies.

These dead approaches are not embarrassments; they are search-space reductions. They narrow what future empirical harness design must actually instrument.

## 5. Structural Contributions

Not every durable contribution of the workshop took theorem form. Several mechanisms, gadgets, and bridges persisted across adversarial checking and became useful vocabulary.

### 5.1 Mechanisms

We isolate five mechanisms that survived stress testing.

First, **attractor reweighting / anti-fixation**: constraints can increase novelty by suppressing a dominant but sterile basin and reallocating search mass toward a more fertile frame. This is the mechanism formalized by Theorem 2 in the simplest greedy setting.

Second, **proto-idea option value**: early verification and mature usefulness need not align. Theorem 3 and Theorem 7 make this precise by separating local verification pressure from later maturation success.

Third, the **two-control law for creative harnesses**: proposal-stage interventions act on \(\mu\), while incubation/verification interventions act on \(s\). Novel yield is controlled by both. This perspective is codified by Theorem 12 and reinforced by Theorem 14.

Fourth, **compression-based frame change**: representational novelty is more naturally tied to change-point or compression gain on typed action traces than to token-level surprise alone. Theorems 5, 6, and 9 support this operationalization.

Fifth, **common-frame contamination**: shared wrappers or mixed traces reduce between-frame divergence and therefore contract identifiability. This is not itself promoted to theorem status beyond the coarse-graining and information-loss results, but it is concretely illustrated by gadget \(G9\).

### 5.2 Gadgets

The workshop produced seven explicit gadgets.

- **\(G5\)** is a four-action, two-frame system with
  \[
  P_A=(0.45,0.45,0.05,0.05),\qquad
  P_B=(0.05,0.05,0.45,0.45),
  \]
  showing that a poor clustering can collapse the frame KL gap to \(0\), while a good clustering preserves it. This is the model example behind Theorem 9 and Lemma 13.

- **\(G6\)** takes \(B=100\), \(\mu_0=10^{-4}\), \(\mu_1=0.02\), and \(c=10\). Then
  \[
  1-(1-\mu_0)^{100}\approx 0.00995,
  \qquad
  1-(1-\mu_1)^{90}\approx 0.838,
  \]
  vividly illustrating Theorem 10.

- **\(G7\)** is a mechanism-nonidentifiability pair: endpoint yield alone does not determine whether improvement came from better proposal mass or better maturation.

- **\(G8\)** gives equal final yield \(0.06\) from two distinct mechanisms,
  \[
  (\mu,s)=(0.30,0.20)
  \quad\text{and}\quad
  (\mu,s)=(0.10,0.60),
  \]
  formalizing the same point numerically.

- **\(G9\)** is a contaminated-switch example in which the true switch gives about \(36.8\) nats of MDL gain at \(T=100\), but \(50\%\) shared-wrapper contamination reduces the detectable signal to at most about \(18.4\) nats. This is the concrete warning behind common-frame contamination.

- **\(G10\)** uses two specialized models with
  \[
  \nu_1=(0.9,0.1),\qquad \nu_2=(0.1,0.9),
  \]
  prior \((1/2,1/2)\), and budget \(2\), where single-model success is \(0.59\) but mixed success is \(0.91\). This is the canonical witness for Theorem 11.

- **\(G11\)** is a two-lane numerical system forcing different optimal handoff depths under the same embarrassment cost, numerically illustrating Theorem 8.

### 5.3 Bridges

We record five conjectural bridges that organize future work but are **not** proved theorems.

1. Creativity may be better modeled as simulated annealing on representation graphs than as deeper search in a fixed space.
2. Representational novelty may be formulated as penalized hidden-state decoding on reasoning traces.
3. Multi-model creativity may be diversity over maturation curves \(t\mapsto (p_t,q_t)\), not merely diversity over final outputs.
4. Prompting and ensembling may be interpreted as portfolio allocation over latent door families.
5. Harness design may be recast as a contextual bandit with delayed rewards over lane controls.

These bridges are useful because they connect presently separate programs, but they remain conjectural vocabulary rather than established claims.

## 6. Methodology

This paper was assembled by a multi-model AI research harness. We do not present it as a single-model achievement, and we do not blur the distinction between conjecture generation, proof verification, and final exposition.

The harness used role-specialized models rather than a single undifferentiated agent. In the theorem ledger, the main mathematical work is attributed to roles such as **The Cognitive Scientist**, **The ML Theorist**, and **The Harness Engineer**, with later compression and synthesis passes used to merge duplicates, remove unsupported claims, and normalize the theorem inventory. Our role in the present document is the narrator-synthesizer: we convert the verified theorem blocks and ledger into a coherent mathematical paper without adding new mathematical claims.

The workshop structure was iterative and adversarial. At a high level it followed five stages:

1. **Explore.** Candidate mechanisms, counterexamples, and toy models were proposed.
2. **Build.** Surviving ideas were sharpened into theorem statements or explicit gadgets.
3. **Verify.** Claims were attacked, reduced, or discarded unless they admitted complete proofs under clearly stated assumptions.
4. **Compress.** Duplicated or overlapping statements were merged into a smaller stable theorem set.
5. **Synthesize.** The remaining verified content was organized into a common conceptual vocabulary.

A crucial methodological point is that many candidate claims were killed. The user packet does not provide a full count of all rejected intermediate conjectures, so we do not invent one. What we can say honestly is that the final ledger contains only claims that survived adversarial verification and that several broader ambitions remained explicitly open, including general MDL consistency, robust change-point theory under drift and contamination, and general transformer-level creativity claims.

We also state plainly that the proofs presented here are complete mathematical arguments relative to the stated formal models. They are not heuristic sketches, empirical impressions, or rhetorical paraphrases of experiments. “Machine-verifiable” here means that the statements and derivations were maintained in a structured theorem/ledger workflow designed for exact checking and contradiction filtering, not that we provide a Lean or Coq formalization in this paper.

The knowledge base and reference-search infrastructure were also harness-mediated. The background references included here were drawn only from the verified reference packet supplied to us. We deliberately excluded any citation that was not verified by that search process.

### 6.1 Verified Content Statistics

Using the supplied theorem inventory and ledger, the stable output of the workshop is:

- **Proven results:** \(14\)  
  This count comprises Theorems \(1\)–\(12\), Lemma \(13\), and Theorem \(14\).

- **Dead approaches / no-go theorems:** \(1\) proved no-go theorem  
  Namely Theorem \(14\).  
  In addition, the workshop recorded multiple ruled-out research directions, but only one of them was upgraded to theorem status.

- **Open questions / unachieved targets:** \(9\)  
  This count follows the supplied ledger’s “What Was Not Achieved” section.

- **Mechanisms:** \(5\)

- **Gadgets:** \(7\)

- **Bridges:** \(5\)

These counts are intentionally conservative: we report only what is explicitly stabilized in the supplied theorem blocks and ledger summary.

## 7. Conclusion and Open Problems

The strongest proved conclusion of this paper is limited but sharp. In the workshop formalism, emergent-thought performance is governed by three separable ingredients:

1. proposal mass onto the right object family;
2. preservation of immature but fertile lineages through incubation;
3. recoverable frame change on typed traces.

This is already enough to overturn several vague narratives. More inference-time search is not, by itself, a creativity theory. Constraint is not automatically good, but it can be beneficial by reweighting salience toward a better frame. Diversity is not automatically useful, but it becomes useful when it is non-collinear and specialized. Trace logging is not a cosmetic add-on: without the right trace information, frame-change claims become unidentifiable.

At the same time, the paper is intentionally not a grand claim. We do not prove that current large language models can achieve general creative breakthroughs, and we do not prove the converse. We do not yet have a full general theory of frame-switch consistency under realistic nonstationarity. We do not yet know, in real workshop runs, whether observed gains came from \(\Delta\mu>0\), \(\Delta s>0\), or both.

The single sharpest open question is therefore this:

**Can one exhibit and instrument a real AI research run in which representation forcing together with protected incubation yields a trace-identifiable genuine frame switch and a sustained early-stage positive maturation dividend, with the gains decomposed empirically into \(\Delta\mu\) and \(\Delta s\)?**

## References

\[1\] P. Frankl and N. Tokushige, *Extremal Problems for Finite Sets*, American Mathematical Society, 2018. DOI: 10.1090/stml/086.

\[2\] R. Alweiss, S. Lovett, K. Wu, and J. Zhang, “Improved bounds for the sunflower lemma,” *Proceedings of the 52nd Annual ACM SIGACT Symposium on Theory of Computing*, 2020. DOI: 10.1145/3357713.3384234.

\[3\] K. Frankston, J. Kahn, B. Narayanan, and J. Park, “Thresholds versus fractional expectation-thresholds,” *Annals of Mathematics* 194(2), 2021. DOI: 10.4007/annals.2021.194.2.2.

\[4\] N. Alon, A. Shpilka, and C. Umans, “On Sunflowers and Matrix Multiplication,” *Computational Complexity* 22(2), 2013, pp. 219–243. DOI: 10.1007/s00037-013-0060-1.

\[5\] J. Blasiak, T. M. Church, H. Cohn, J. A. Grochow, E. Naslund, W. F. Sawin, and C. Umans, “On cap sets and the group-theoretic approach to matrix multiplication,” 2017. DOI: 10.19086/da.1245.

\[6\] J. J. Dziak, D. L. Coffman, S. T. Lanza, R. Li, and L. S. Jermiin, “Sensitivity and specificity of information criteria,” *Briefings in Bioinformatics* 21(2), 2020, pp. 553–565. DOI: 10.1093/bib/bbz016.