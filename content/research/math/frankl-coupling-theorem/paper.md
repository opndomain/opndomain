# Nonlinear Coupling Structure for Frankl's Conjecture: Reduction of the \(k=5\) Residual to a Pre-Union Transport Problem

**David Beardsley**  
*opndomain.com*  
*2026-04-29*

## Abstract

This paper was produced by a multi-model AI research harness. Its contribution is not a claimed breakthrough, but a verified reduction: we isolate what has been proved in the ledger, what has been ruled out by counterexample or impossibility argument, what failed verification, and what remains open in the \(k=5\) residual program around Frankl's union-closed sets conjecture.

The ledger-verified results used here are the following. First, the output-side normalized bridge statistic collapses identically to a \(4\)-set marginal:
\[
\widehat T_\mu^{(x)}(y;uv)=2\mu(S_y),
\]
so any post-union bridge spike is not a genuinely third-order invariant. Second, on the rigid good outputs \(C_y=2^{S_y}\cup\{M\}\) and \(C_\bullet=2^M\), the exact affine decoder is
\[
\lambda_x=8a_x-\frac{224}{15}m+\frac{7}{15},
\]
with explicit values
\[
\lambda_x(C_y)=\begin{cases}9/17,&x\neq y,\\ 1/17,&x=y,\end{cases}
\qquad
\lambda_x(C_\bullet)=\frac12.
\]
Third, the isotropic Hamilton-cycle law \(\nu_{\mathrm{iso}}\) has strictly positive pre-union bridge coherence,
\[
\rho_x^{\nu_{\mathrm{iso}}}(y;uv)=\frac14.
\]
Fourth, combining the exact defect formulas with the rigid decoder localizes the remaining obstruction on the rigid outputs:
\[
\delta_x(C_y)=1\ (x\neq y),\qquad \delta_y(C_y)=-15,\qquad \delta_x(C_\bullet)=0.
\]
This shows that, on those outputs, the unresolved issue is anti-congestion under the union pushforward rather than the local sign calculation.

The ledger also rules out several tempting programs. In particular, naive pointwise domination under the union pushforward is impossible; transport from the pair covariance kernel \(K\) alone to cubic path witness mass is impossible; the missing statistic is bridge coherence; and output-side normalized bridge statistics yield no new invariant. Some dead approaches are genuine impossibility or counterexample results, while others are candidate formulations that did not survive verification.

What remains open is equally precise. This paper does not prove the \(k=5\) case. The remaining target is a pre-union to post-union transport theorem with anti-congestion control: one must convert bridge-coherent witness mass into actual output mass while surviving union-pushforward compression.

## 1. Background

We work on a verified \(k=5\) reduction program for Frankl's union-closed sets conjecture. The central difficulty is not to generate candidate witness mass, but to route that mass through the union map in a way that survives many-to-one compression. The present paper records the stable part of that program as certified by the internal ledger.

The verified precursor results establish three themes.

First, there is a forcing program on bad-fiber couplings. The explicit dependent coupling \(Q_x\) is supported on fibers with
\[
p_x(L_U)\ge \frac12
\]
([P2]), and positive witness mass \(\Psi_x(b)>0\) implies positive localized good load through \(x\) ([P3]). A basic pair-to-union forcing lemma underlies this mechanism.

Second, there is a rigid output geometry. Doubly redundant cubic witness triples force the rigid singly-tagged output
\[
C_y=2^{S_y}\cup\{M\}
\]
([P20]), and the anti-congestion problem factors into a geometric term \(12\kappa_x(U)\) and a scalar nesting term \(\eta_x(U)\) ([P8]). This suggests that geometry is not the remaining issue; multiplicity is.

Third, there is a statistical dichotomy between pre-union and post-union data. On the pre-union side, the isotropic Hamilton-cycle law carries positive bridge coherence ([P49]). On the post-union side, the normalized bridge spike collapses to a \(4\)-set marginal ([P52]). Thus the relevant structural information exists before union but is erased after union.

The internal literature also already ruled out several tempting programs. Naive pointwise comparison of union-pushforward mass with ambient output mass fails because the union map can compress exponentially many witnesses onto one upper fiber ([P4], [D1]). Pair-kernel transport fails on the explicit chamber-state law \(\nu_{\mathrm{PM}}\) because pair covariance can be nontrivial while cubic path witness mass vanishes ([P26], [P27]). The missing feature is bridge coherence ([P28]).

This paper places those verified components into a single narrative. The main mathematical point is that once the rigid decoder and exact defect computations are combined, the obstruction is localized: on the rigid outputs, the local sign issue has already been resolved, and the only remaining barrier identified by the ledger is transport through anti-congestion.

## 2. Main Results

We fix
\[
M=\{1,2,3,4,5\}.
\]
For \(y\in M\), let
\[
S_y:=M\setminus\{y\}.
\]
For a law \(\mu\) on \(2^M\), define
\[
a_x(\mu):=\max_{y\neq x}\mu(S_y),\qquad m(\mu):=\mu(M).
\]
We also write
\[
C_y:=2^{S_y}\cup\{M\},\qquad C_\bullet:=2^M.
\]

### Theorem 2.1 (Output-side normalized bridge collapse)
Fix \(x\in M\), \(y\neq x\), and write \(S_y=\{x,u,v,w\}\). For any law \(\mu\) on \(2^M\), define
\[
T_\mu^{(x)}(y;uv)
=
\Pr(xu,uv,vw\subseteq A)+\Pr(xv,uv,uw\subseteq A)
-\Pr(uv\subseteq A)\bigl(\Pr(xu,vw\subseteq A)+\Pr(xv,uw\subseteq A)\bigr),
\]
and, when \(1-\Pr(uv\subseteq A)\neq 0\),
\[
\widehat T_\mu^{(x)}(y;uv):=\frac{T_\mu^{(x)}(y;uv)}{1-\Pr(uv\subseteq A)}.
\]
Then
\[
\rho_x^\mu(y;uv)=1,
\qquad
T_\mu^{(x)}(y;uv)=2\mu(S_y)\bigl(1-\mu(uv)\bigr),
\qquad
\widehat T_\mu^{(x)}(y;uv)=2\mu(S_y).
\]

In particular, the normalized output-side bridge statistic is exactly the \(4\)-set marginal \(2\mu(S_y)\).

### Theorem 2.2 (Rigid-output decoder for localized good load)
On the rigid good outputs \(C_y\) and \(C_\bullet\), one has
\[
\lambda_x=8a_x-\frac{224}{15}m+\frac{7}{15}.
\]
Explicitly,
\[
\lambda_x(C_y)=
\begin{cases}
9/17,&x\neq y,\\[2mm]
1/17,&x=y,
\end{cases}
\qquad
\lambda_x(C_\bullet)=\frac12.
\]

### Theorem 2.3 (Positive pre-union bridge coherence at the isotropic adversary)
Let \(\nu_{\mathrm{iso}}\) be the isotropic Hamilton-cycle law. Then for every \(x\in M\), \(y\neq x\), and \(uv\subseteq S_y\setminus\{x\}\),
\[
\rho_x^{\nu_{\mathrm{iso}}}(y;uv)=\frac14.
\]

### Theorem 2.4 (The obstruction is anti-congestion, not local sign on the rigid outputs)
For the rigid good outputs \(C_y\) and \(C_\bullet\), the ledger gives
\[
\delta_x(C_y)=1 \quad (x\neq y),\qquad \delta_y(C_y)=-15,\qquad \delta_x(C_\bullet)=0.
\]
Accordingly, on these rigid outputs the remaining unresolved difficulty is anti-congestion under the union pushforward.

### Supporting Lemmas

#### Lemma 2.5 (Pair-to-union singleton forcing)
Let \(\nu\) be any coupling of the bad-fiber law with itself, and let \(W=T\cup U\). For \(x\in M\), if
\[
H_x(T,U):=\mathbf 1\{x\in \ell(T)\cup \ell(U)\}=1,
\]
then
\[
p_x(L_W)\ge \frac12.
\]
Consequently,
\[
\int p_x(L_W)\,d(U_\#\nu)(W)\ge \frac12\,\nu(H_x=1).
\]

#### Lemma 2.6 (Explicit dependent support detector)
For each \(x\), there is an explicit dependent coupling \(Q_x\), defined by path-weighted sampling of three bad fibers and union output, such that the output is supported on fibers \(L_U\) satisfying
\[
p_x(L_U)\ge \frac12.
\]

#### Lemma 2.7 (Positive witness implies positive localized good load)
If \(\Psi_x(b)>0\), then there exists a fiber contributing positive localized good load through \(x\).

#### Lemma 2.8 (Canonical defect computations)
For
\[
C_y=2^{M\setminus\{y\}}\cup\{M\},
\]
one has
\[
\delta_x(C_y)=1 \quad (x\neq y),\qquad \delta_y(C_y)=-15.
\]
For
\[
C_\bullet=2^M,
\]
one has
\[
\delta_x(C_\bullet)=0\qquad\text{for every }x.
\]

#### Lemma 2.9 (Rigid output from doubly redundant cubic witnesses)
Every doubly redundant cubic witness triple on a path \(ab,bc,cd\subseteq S_y\) forces the same rigid \(4\)-cube output
\[
C_y=2^{S_y}\cup\{M\}.
\]

#### Lemma 2.10 (Anti-congestion factorization)
For the cubic witness routing problem, the obstruction splits into a solved geometric factor \(12\kappa_x(U)\) and an unresolved scalar mass-nesting factor \(\eta_x(U)\).

## 3. Ledger-Certified Proof Reductions

We do not reproduce full standalone derivations for every result. Instead, we give ledger-certified proof sketches and proof reductions based on the verified theorem blocks and transcript dependencies.

### Proof sketch of Theorem 2.1

Fix \(x\in M\), \(y\neq x\), and write \(S_y=\{x,u,v,w\}\). By [P50], each of the four events
\[
\{xu,uv,vw\subseteq A\},\qquad \{xv,uv,uw\subseteq A\},\qquad \{xu,vw\subseteq A\},\qquad \{xv,uw\subseteq A\}
\]
reduces, with the appropriate \(uv\)-conditioning where needed, to the containment event
\[
S_y\subseteq A.
\]
Hence the first two probabilities are each \(\mu(S_y)\), and the last two contribute \(\mu(S_y)\) once multiplied by \(\Pr(uv\subseteq A)=\mu(uv)\). Substitution yields
\[
T_\mu^{(x)}(y;uv)=2\mu(S_y)\bigl(1-\mu(uv)\bigr).
\]
When \(1-\mu(uv)\neq 0\), division gives
\[
\widehat T_\mu^{(x)}(y;uv)=2\mu(S_y).
\]
The identity \(\rho_x^\mu(y;uv)=1\) is the ratio form recorded in [P51]. This is exactly the collapse statement [P52]. \(\square\)

### Proof sketch of Theorem 2.2

By [P53], on the rigid good outputs \(C_y\) and \(C_\bullet\), the localized load is affine in the pair \((a_x,m)\):
\[
\lambda_x=8a_x-\frac{224}{15}m+\frac{7}{15}.
\]
It remains only to evaluate \(a_x\) and \(m\) on the two rigid families.

For \(C_y=2^{S_y}\cup\{M\}\), the ledger gives
\[
m(C_y)=\frac1{17},
\qquad
a_x(C_y)=
\begin{cases}
\frac1{17},&x=y,\\[1mm]
\frac2{17},&x\neq y.
\end{cases}
\]
Substitution yields
\[
\lambda_y(C_y)=\frac1{17},\qquad \lambda_x(C_y)=\frac9{17}\quad(x\neq y).
\]

For \(C_\bullet=2^M\), symmetry gives
\[
a_x(C_\bullet)=\frac12,\qquad m(C_\bullet)=\frac1{32},
\]
and substitution yields
\[
\lambda_x(C_\bullet)=\frac12.
\]
Thus the rigid decoder takes the claimed explicit form on both rigid outputs. \(\square\)

### Proof sketch of Theorem 2.3

By [P23], the isotropic adversary is realized as the barycenter of Hamilton \(5\)-cycles. For fixed \(x\), \(y\neq x\), and \(uv\subseteq S_y\setminus\{x\}\), [P49] identifies the relevant numerator as the count of Hamilton cycles containing one of the two \(x\)-endpoint \(3\)-paths inside \(S_y\), and the denominator as the count of cycles containing the corresponding disjoint endpoint pairs. The verified counts are
\[
\text{path count}=\frac16,\qquad \text{endpoint-pair count}=\frac23.
\]
Therefore
\[
\rho_x^{\nu_{\mathrm{iso}}}(y;uv)=\frac{(1/6)}{(2/3)}=\frac14.
\]
\(\square\)

### Proof sketch of Theorem 2.4

By Lemma 2.8, coming from [P5] and [P6], the rigid outputs have exact defects
\[
\delta_x(C_y)=1 \quad (x\neq y),\qquad \delta_y(C_y)=-15,\qquad \delta_x(C_\bullet)=0.
\]
By Theorem 2.2, [P53] supplies the exact affine decoder for localized good load on the same rigid outputs. Together with [P21] and [P54], this shows that on the rigid outputs the tracked vertices already have the correct local sign behavior, while the surviving unresolved issue is quantitative transport through the union pushforward. By [P8], that issue is the unresolved scalar anti-congestion factor \(\eta_x(U)\). \(\square\)

### Proof sketch of Lemma 2.5

Assume \(H_x(T,U)=1\), so \(x\in \ell(T)\cup\ell(U)\). The verified pair-to-union forcing mechanism implies that the union-closed fiber \(L_{T\cup U}\) contains
\[
2^{\ell(T)\cup\ell(U)}\cup\{M\}.
\]
Since \(x\in \ell(T)\cup\ell(U)\), the singleton \(\{x\}\) is present in \(L_{T\cup U}\), and the \(A/B\)-decomposition of localized load gives
\[
p_x(L_W)\ge \frac12.
\]
Integrating over the pushforward \(U_\#\nu\) gives
\[
\int p_x(L_W)\,d(U_\#\nu)(W)\ge \frac12\,\nu(H_x=1).
\]
\(\square\)

### Proof sketch of Lemma 2.6

This is the explicit construction [P2]. The coupling \(Q_x\) is defined by path-weighted sampling of three bad fibers followed by union output. The verified statement is that every output fiber in its support satisfies
\[
p_x(L_U)\ge \frac12.
\]
Thus \(Q_x\) is a support detector for outputs carrying \(x\)-localized good load. \(\square\)

### Proof sketch of Lemma 2.7

This is [P3]. Positive witness mass \(\Psi_x(b)>0\) guarantees that at least one fiber in the relevant support contributes positive localized good load through \(x\). The point of the lemma is existential rather than quantitative: positivity of the witness statistic already forces the presence of some favorable output fiber. \(\square\)

### Proof sketch of Lemma 2.8

The two defect formulas are precisely the verified computations [P5] and [P6]. For the singly-tagged rigid family \(C_y\),
\[
\delta_x(C_y)=1 \quad (x\neq y),\qquad \delta_y(C_y)=-15.
\]
For the full cube \(C_\bullet=2^M\),
\[
\delta_x(C_\bullet)=0\qquad\text{for every }x.
\]
\(\square\)

### Proof sketch of Lemma 2.9

This is [P20]. Every doubly redundant cubic witness triple on a path \(ab,bc,cd\subseteq S_y\) closes, under the cubic forcing mechanism, to the same rigid singly-tagged output,
\[
C_y=2^{S_y}\cup\{M\}.
\]
The importance of the lemma is rigidity: different witness triples of this type do not produce different output geometries. \(\square\)

### Proof sketch of Lemma 2.10

This is the verified factorization [P8]. The geometric part of the routing problem is accounted for by the exact multiplicity term \(12\kappa_x(U)\). What remains uncontrolled is the scalar mass-nesting factor \(\eta_x(U)\). Thus the anti-congestion obstruction splits into a solved geometric component and an unsolved scalar component. \(\square\)

## 4. No-Go Theorems and Dead Approaches

The negative results are structurally important because they identify which directions cannot close the \(k=5\) residual and which candidate formulations failed to survive verification.

### Theorem 4.1 (No pointwise domination under union pushforward)
No uniform estimate of the form
\[
q_x(W)\le C\,\mu(W)
\]
can hold for the naive union-pushforward mechanism.

The reason is many-to-one compression under the union map: exponentially many witness pairs or triples may land on a single upper fiber. Any pointwise comparison that ignores compression fails ([P4], [D1]). This shows that anti-congestion is not merely an artifact of one proof attempt.

### Theorem 4.2 (Pair-kernel transport alone is impossible)
There exists an explicit chamber-state law \(\nu_{\mathrm{PM}}\), uniform on the three perfect matchings of a \(K_4\)-slice, such that pair covariance energy is nontrivial while the relevant cubic path witness mass vanishes.

Hence no theorem transporting from the pair covariance kernel \(K\) alone to cubic path witness mass can be true ([P26], [P27]). The lesson is that second-order endpoint statistics do not control third-edge realization.

### Theorem 4.3 (Missing statistic: bridge coherence)
The missing structure is bridge coherence. Pair statistics can detect disjoint endpoints, but they cannot determine whether the connecting middle edge occurs in the same chamber-state ([P28]).

This is the conceptual reason Theorem 4.2 fails. Any viable transport object must be sensitive to simultaneous path realization, not only endpoint coexistence.

### Theorem 4.4 (Output-side normalized bridge statistics yield no new invariant)
By Theorem 2.1,
\[
\widehat T_\mu^{(x)}(y;uv)=2\mu(S_y)
\]
for every law \(\mu\) on \(2^M\). Thus any attempt to use output-side normalized bridge spikes as a genuinely higher-order invariant fails identically.

This reveals a sharp dichotomy. Bridge coherence exists before union, as Theorem 2.3 shows, but once one passes to the output law, the statistic collapses to a \(4\)-set marginal. Therefore any viable transport theorem must act before union or must preserve pre-union bridge information through the pushforward.

### What the dead approaches taught us

The dead approaches narrow the search space in a useful way.

First, the obstruction is not arbitrary congestion but a more specific endpoint-redundancy collapse ([D3]). Second, geometric witness counting alone is insufficient because \(\kappa_x(U)\) does not control internal lower-mass crowding within a fixed skeleton ([D2]). Third, raw positivity of localized bridge quantities is not enough to determine defect sign ([D7]). Fourth, attempts to extract extra defect bonus from adjacent \(3\)-cube certificates fail because closure returns exactly to \(C_y\), whose verified defect at tracked vertices is only \(+1\) ([D4]).

Not every dead item has the same status. Some, such as [D1], [D2], [D4], [D6], and [D7], are ruled out by explicit counterexample or contradiction with verified formulas. Others, such as [D8] and [D9], are better understood as candidate formulations that failed verification rather than as impossibility theorems.

In short, the program has already learned which information survives rigid closure, which information is erased by union, and which statistics are too coarse to control the remaining transport.

## 5. Structural Contributions

Not every durable output of the workshop is a theorem. Some of the most useful products are mechanisms, gadgets, and bridges that organize the search space.

### Mechanisms

1. **Pre-union/post-union dichotomy.** Bridge coherence is genuinely present before union but collapses after union to the marginal \(\mu(S_y)\). Theorems 2.1 and 2.3 make this exact.

2. **Anti-congestion decomposition.** Witness routing splits into a solved geometric factor \(12\kappa_x(U)\) and an unresolved scalar factor \(\eta_x(U)\). This isolates the technical obstruction currently recorded by the ledger.

3. **Forcing principle.** If bad-fiber labels hit \(x\), then the union output forces
\[
p_x\ge \frac12.
\]
Lemmas 2.5 and 2.6 make this the basic support-detection mechanism.

4. **Rigid decoder principle.** On the rigid outputs, localized load is governed by the pair \((a_x,m)\), not by raw bridge totals. Theorem 2.2 identifies the exact decoder.

### Gadgets

1. **The singly-tagged rigid family**
\[
C_y=2^{S_y}\cup\{M\},
\]
which isolates one uniquely bad tagged vertex and yields exact defect values.

2. **The full cube**
\[
C_\bullet=2^M,
\]
which calibrates the decoder at the symmetric value \(\lambda_x=\frac12\).

3. **The chamber-state law \(\nu_{\mathrm{PM}}\),**
the explicit counterexample showing that pair-kernel transport cannot work.

4. **The isotropic Hamilton-cycle law \(\nu_{\mathrm{iso}}\),**
which exhibits strictly positive bridge coherence \(\rho=\frac14\) before union.

### Bridges

1. A future transport theorem should connect an \(x\)-localized pre-union bridge tensor or bridge-coherence functional to the post-union quantity
\[
a_x=\max_{y\neq x}\mu(S_y).
\]

2. Any viable theorem must incorporate bridge coherence explicitly; pair-kernel data alone is provably insufficient.

3. The rigid decoder suggests that simultaneous control of \(a_x\) and
\[
m=\mu(M)
\]
would be enough to convert structural witness mass into localized good load, provided anti-congestion can be controlled.

These structural contributions are not promoted to theorem status here. They are the vocabulary that survived adversarial verification and that now organizes the plausible routes forward.

## 6. Methodology

This paper was generated by a multi-model AI research harness and then narrated into standard mathematical prose. We describe that process because the transparency is part of the contribution.

### Workshop structure

The harness operated in five roles.

1. **Explore.** Search-oriented models generated candidate mechanisms, examples, and conjectural statistics.

2. **Build.** Construction-oriented models produced couplings, witness gadgets, and candidate transport statements.

3. **Verify.** Adversarial verifier models checked proposed claims, rejected false generalizations, and reduced surviving statements to explicit theorem blocks with dependency links.

4. **Compress.** A compression pass removed duplicated or weaker formulations, consolidated equivalent statements, and promoted only stable invariants to the ledger.

5. **Synthesize.** The present narrator organized the verified outputs into a mathematical paper without promoting any unverified claim.

### Model roles

The internal ledger identifies role-specialized agents such as **The Coupling Builder**, **The Defect Analyst**, **The Structure Miner**, and **verify**. Their roles, rather than their branding, matter mathematically:

- The Coupling Builder produced explicit dependent couplings and transport counterexamples.
- The Defect Analyst computed exact defect identities and rigid forcing closures.
- The Structure Miner extracted invariant structure and pre-union statistical geometry.
- The verifier rejected unsupported formulations and certified the surviving results.

### Adversarial verification and proof standard

The harness killed many initial ideas. The ledger records dead approaches \([D1]\)–\([D9]\), including failed density-comparison arguments, failed pair-kernel transport programs, and failed candidate bridge tensors. Some of these are genuine impossibility or counterexample results, while others are failed candidate formulations that did not survive verification.

The theorem blocks in this paper are ledger-verified results with proof sketches and dependency links; this paper narrates them without promoting any unverified claim. Where a result is imported directly from the ledger, Section 3 states that dependence explicitly rather than presenting the argument as a new full derivation.

### Knowledge base and reference infrastructure

The harness maintained a structured knowledge ledger containing proven results, dead approaches, open questions, and dependency links. It also used a reference-search layer to validate what counted as an admissible citation. In this paper we therefore cite only verified internal items from that ledger and refrain from importing unverified external mathematical claims.

### Verified content statistics

The ledger records:

- Proven results: \(54\)
- Dead approaches: \(9\)
- Open questions: \(4\)
- Mechanisms: \(4\)
- Gadgets: \(4\)
- Bridges: \(3\)

These counts describe the verified workshop output as of 2026-04-29.

## 7. Conclusion and Open Problems

The verified outcome is a reduction, not a resolution. The ledger establishes that post-union normalized bridge statistics collapse, that rigid outputs admit an exact affine decoder in \((a_x,m)\), that the isotropic adversary has positive pre-union bridge coherence, and that local sign is already correct on the rigid outputs. It also establishes that several natural shortcuts cannot work: neither naive pointwise domination nor pair-kernel transport survives the actual structure of the union pushforward.

Accordingly, the problem has been narrowed sharply. The remaining gap is not conceptual ambiguity about what to measure, nor an unresolved local sign defect on the rigid outputs. The gap is a quantitative transport theorem that carries pre-union bridge-coherent witness mass through the union map without losing control to anti-congestion.

The open questions isolated by the workshop are:

1. Prove a quantitative anti-congestion bound routing doubly redundant witness mass to actual \(C_y\)-mass at outputs.

2. Prove a transport or coupling theorem from an \(x\)-localized bridge tensor \(T^{(x)}\), rather than from the pair kernel \(K\) alone.

3. Lift the rigid-family support detector to the actual coupling output using a normalized omitted-vertex spike rather than raw bridge mass.

4. Localize the transport problem to a fixed \(x\) in a form that explicitly incorporates bridge coherence rather than relying on pair-kernel data alone.

The sharpest remaining question is this:

**Can one prove an \(x\)-localized pre-union to post-union transport theorem, explicitly incorporating bridge coherence and anti-congestion control, that converts positive witness mass into a quantitative lower bound on \(a_x=\max_{y\neq x}\mu(S_y)\)?**

## References

[Transcript CB1] *Coupling Builder, Proven 1*.

[D1] “Take the cubic path coupling and conclude \(\lambda_x \ge c\,\Psi_x(b)\) by a raw density comparison \(q_x\le C\mu\)” — killed by union-pushforward compression.

[D2] Pointwise control \(\widetilde q_x(U)\le C\,\mu_U\,\kappa_x(U)\) — killed because \(\kappa_x(U)\) does not control lower-mass crowding inside a fixed skeleton.

[D3] Treating cubic witness failure as generic congestion — killed because the failure mode is more specific: endpoint-redundancy collapse.

[D4] Trying to extract an extra local defect bonus from the two adjacent \(3\)-cube certificates in the \(\rho_1=\rho_3=1\) case — killed because the actual union-closed output is exactly \(C_y\), whose exact tracked-vertex defect is only \(+1\).

[D7] Inferring the \(x\)-defect sign from mere positivity of the raw \(x\)-localized bridge tensor — killed because \(C_y\) has positive raw bridge mass even for the uniquely worst vertex.

[P2] Explicit dependent coupling \(Q_x\) supported on fibers with \(p_x(L_U)\ge 1/2\).

[P3] Positive witness mass \(\Psi_x(b)>0\) implies existence of a fiber contributing positive localized good load through \(x\).

[P4] Naive pointwise domination of union-pushforward by ambient measure is impossible in general.

[P5] Exact defect computation for the canonical singly-tagged family \(C_y\): \(\delta_x(C_y)=1\) for \(x\neq y\), \(\delta_y(C_y)=-15\).

[P6] Exact defect computation for the full family \(C_\bullet=2^M\): \(\delta_x(C_\bullet)=0\).

[P8] Anti-congestion factorization into geometric term \(12\kappa_x(U)\) and scalar nesting term \(\eta_x(U)\).

[P20] Doubly redundant cubic witness triples force the rigid \(4\)-cube \(C_y=2^{S_y}\cup\{M\}\).

[P21] Every term in \(\Theta_x\) has the correct local sign for the tracked vertex \(x\).

[P23] Isotropic adversary realized as the barycenter of Hamilton \(5\)-cycles.

[P26] Chamber-state law \(\nu_{\mathrm{PM}}\) on the three perfect matchings of a \(K_4\)-slice.

[P27] Pair-kernel transport to cubic path witness mass is false at the chamber-state level.

[P28] The missing statistic for transport is bridge coherence.

[P49] Exact isotropic bridge-coherence count giving \(\rho=1/4\).

[P50] Event equivalence of the four output-side bridge terms with \(S_y\subseteq A\).

[P51] Consequent identity \(\rho_x^\mu(y;uv)=1\) in the output-side normalized bridge setting.

[P52] Output-side normalized bridge spike collapses to \(2\mu(S_y)\).

[P53] Exact affine decoder for \(\lambda_x\) on the rigid good outputs \(C_y\) and \(C_\bullet\).

[P54] The surviving obstruction is anti-congestion under the union pushforward, not local sign.