# Locality Barriers for Spread Regularization: Impossibility Theorems for Linear and Product Families

**David Beardsley**  
*opndomain.com*  
*2026-04-29*

## Abstract

We study whether local-link regularization can force strong spread properties at multiplicative cost \(\exp(\Omega(w\log w))\) for \(w\)-uniform families arising from the workshop program. Our main contribution is negative. First, we prove that the workshop’s original fixed-\(C\) target is false as stated: if the assumed regularity parameter satisfies \(\kappa(w)=\Theta(\log w)\), then for every fixed \(C>1\) and all sufficiently large \(w\), the initial family is already \(C\)-spread. Thus the proposed regularization procedure may terminate at time \(0\).

Second, we analyze the representable link-only program for \(q\)-linear transversal kernel families \(\mathcal H(G,q)\). We prove an exact witness-probability formula
\[
\Pr[S\subseteq A]=q^{-r_N(S)},
\]
where \(N\) is the dual column matroid, and show that linking is exactly contraction in \(N\). From this we derive a sharp obstruction: if \(\mathcal H(G,q)\) is \(\kappa\)-regular and has size at least \((c\log w)^w\), then necessarily \(q=\Theta(\log w)\), and every link-only regularization procedure incurs total multiplicative loss at most
\[
q^w=\exp(O(w\log\log w)).
\]
Therefore this representable/link-only route cannot establish an \(\exp(\Omega(w\log w))\) barrier at the claimed size scale.

We also record several no-go theorems showing that scalar-threshold targets, size-only targets, single weighted witness-size targets, and full symmetrization of the layered obstruction are all impossible routes to the desired lower bound. What remains open is a genuinely geometry-sensitive target, not reducible to these one-dimensional summaries, that could survive arbitrary local links or even arbitrary subfamily restriction.

## 1. Background

The workshop program underlying this paper sought a lower bound of order \(\exp(\Omega(w\log w))\) for spread regularization under local operations. The intended mechanism was to start from a \(w\)-uniform family \(\mathcal H_w\) with witness bounds of the form
\[
\Pr_{A\sim\mathcal H_w}[T\subseteq A]\le \kappa(w)^{-|T|},
\qquad \kappa(w)=\Theta(\log w),
\]
and prove that converting such a family into a stronger target notion of spread must incur very large multiplicative size loss. The theorem blocks supplied to us show that this original goal fails in two logically distinct ways.

The first failure is formal and immediate: if the target spread constant is a fixed \(C>1\), then \(\kappa(w)\to\infty\) already implies \(C\)-spread for large \(w\). Hence the original statement cannot even get off the ground. The second failure is structural: in the main representable model, witness probabilities are governed exactly by dual matroid rank, and local links act by contraction. This rigidity collapses the hoped-for obstruction to one controlled by the alphabet size \(q\), which itself is forced to satisfy \(q=\Theta(\log w)\) at the relevant cardinality scale.

Our background sources are intentionally narrow. We rely on the theorem blocks, the workshop ledger, the supplied metadata, and the standard identities explicitly cited in the theorem blocks. In particular, the negative results in Section 4 are grounded in the ledger entries \([D1]\)–\([D4]\), which record approaches that were proposed and then ruled out by verification during the workshop.

## 2. Main Results

We now state the main theorems exactly at the level supported by the supplied theorem blocks.

### Theorem 1 (The original fixed-\(C\) target is false)

Let \(C>1\) be fixed. Suppose \(\mathcal H_w\) is a \(w\)-uniform family such that for every witness \(T\),
\[
\Pr_{A\sim \mathcal H_w}[T\subseteq A]\le \kappa(w)^{-|T|},
\qquad \kappa(w)=\Theta(\log w).
\]
Then for all sufficiently large \(w\), \(\mathcal H_w\) is already \(C\)-spread:
\[
\Pr_{A\sim \mathcal H_w}[T\subseteq A]\le C^{-|T|}\qquad\text{for all }T.
\]
Hence a local-link regularization procedure may terminate immediately with no loss, so the workshop’s original theorem cannot hold as stated.

### Theorem 2 (Representable link-only families cannot yield an \(\exp(\Omega(w\log w))\) barrier)

Let \(G\in \mathbb F_q^{r\times E}\) with \(|E|=w\), and let
\[
\mathcal H(G,q):=\{A_x:x\in\ker G\}
\]
be the associated \(q\)-linear transversal kernel family. Assume

1. \(\mathcal H(G,q)\) is \(\kappa\)-regular with \(\kappa>1\), and  
2. \(|\mathcal H(G,q)|\ge (c\log w)^w\) for some absolute constant \(c>0\).

Then:

1. \(q\le \kappa\);
2. \(q\ge c\log w\);
3. in particular, if \(\kappa=\Theta(\log w)\), then \(q=\Theta(\log w)\);
4. every local-link procedure using only links has total multiplicative size loss at most
\[
q^w=\exp(O(w\log\log w)).
\]

Consequently, the \(q\)-representable/link-only program cannot prove an \(\exp(\Omega(w\log w))\) lower bound at the size scale \((c\log w)^w\) under \(\kappa=\Theta(\log w)\).

### Theorem 3 (Exact link dynamics in linear kernel families)

Let \(M=M(G)\) be the column matroid of \(G\), and let \(N=M^*\). For any witness support \(S\subseteq E\),
\[
\Pr_{A\sim \mathcal H(G,q)}[S\subseteq A]=q^{-r_N(S)}.
\]
If one links on a feasible support \(X\subseteq E\), then for every \(Y\subseteq E\setminus X\),
\[
-\log_q \Pr_{\mathrm{new}}[Y\subseteq A]
=
r_{N/X}(Y)
=
r_N(X\cup Y)-r_N(X).
\]
Thus, in the representable setting, local-link regularization is exactly dual-matroid contraction.

### Supporting lemmas

**Lemma 4 (Singleton forcing in the representable model).**  
If \(\mathcal H(G,q)\) is \(\kappa\)-regular with \(\kappa>1\), then \(q\le \kappa\).

**Lemma 5 (Size lower bound forces alphabet size).**  
If \(|\mathcal H(G,q)|\ge (c\log w)^w\), then \(q\ge c\log w\).

**Lemma 6 (Telescoping loss formula for link-only regularization).**  
For a sequence of links whose total contracted support is \(U\), the total multiplicative loss is exactly
\[
q^{-r_N(U)}.
\]

**Lemma 7 (Same-size witnesses can have different geometry and different probabilities).**  
In the explicit rank-\(2\) family \(H_{2,1,1}(q)\), there exist feasible witnesses \(T_{UV}\) and \(T_{VW}\) of the same cardinality \(|T_{UV}|=|T_{VW}|=2\) such that
\[
\Pr[T_{UV}\subseteq A]=q^{-2},
\qquad
\Pr[T_{VW}\subseteq A]=q^{-1}.
\]

**Lemma 8 (Size-homogeneous representable families have uniform dual matroid).**  
Let \(N\) be a matroid such that \(r_N(S)\) depends only on \(|S|\). Then \(N\) is uniform: there exists \(d\) such that
\[
r_N(S)=\min(|S|,d)
\qquad\text{for all }S.
\]

The role of Lemmas 7 and 8 is conceptual as much as technical. Lemma 7 exhibits geometry beyond cardinality, while Lemma 8 shows that if witness probabilities were forced to depend only on \(|T|\), then the representable geometry would collapse to the uniform case. Together they explain why the surviving open direction must be typed or geometry-sensitive.

## 3. Proof Details

We now expand the proof sketches sufficiently to make the logical dependencies clear.

### 3.1. Proof of Theorem 1

Fix \(C>1\). Since \(\kappa(w)=\Theta(\log w)\), we have \(\kappa(w)\to\infty\) as \(w\to\infty\). Therefore there exists \(w_0\) such that
\[
\kappa(w)\ge C\qquad\text{for all }w\ge w_0.
\]
For every witness \(T\) and every \(w\ge w_0\),
\[
\Pr[T\subseteq A]\le \kappa(w)^{-|T|}\le C^{-|T|}.
\]
Hence \(\mathcal H_w\) is already \(C\)-spread. No witness violates the target at time \(0\), so any regularization theorem claiming unavoidable positive loss toward a fixed-\(C\) target is false in this asymptotic regime.

### 3.2. Proof of Theorem 3

Let \(G\in\mathbb F_q^{r\times E}\), let \(M=M(G)\) be the column matroid, and let \(N=M^*\). For a support set \(S\subseteq E\), conditioning on \(S\subseteq A\) fixes the coordinates indexed by \(S\). The remaining degrees of freedom are solutions on \(E\setminus S\), whose number is
\[
q^{|E\setminus S|-r_M(E\setminus S)}.
\]
Since
\[
|\ker G|=q^{|E|-r_M(E)},
\]
we obtain
\[
\Pr[S\subseteq A]
=
q^{|E\setminus S|-r_M(E\setminus S)-(|E|-r_M(E))}
=
q^{-(|S|-r_M(E)+r_M(E\setminus S))}.
\]
By the standard dual-rank identity,
\[
r_{M^*}(S)=|S|-r_M(E)+r_M(E\setminus S),
\]
so
\[
\Pr[S\subseteq A]=q^{-r_N(S)}.
\]

Now link on a feasible support \(X\subseteq E\). The residual family is an affine translate of the kernel on \(E\setminus X\), so the new witness probabilities are controlled by the restricted primal matroid \(M|_{E\setminus X}\). Dualizing yields
\[
(M|_{E\setminus X})^*=M^*/X=N/X.
\]
Hence for \(Y\subseteq E\setminus X\),
\[
-\log_q\Pr_{\mathrm{new}}[Y\subseteq A]=r_{N/X}(Y)=r_N(X\cup Y)-r_N(X).
\]
This proves that local linking is exactly contraction in the dual matroid.

### 3.3. Proof of Lemmas 4, 5, and 6

Lemma 4 is immediate from Theorem 3. If \(\{e\}\) is a feasible singleton witness, then \(r_N(\{e\})\neq 0\), since rank \(0\) would force probability \(1\), contradicting \(\kappa>1\). Thus \(r_N(\{e\})=1\), and Theorem 3 gives
\[
\Pr[e\in A]=q^{-1}\le \kappa^{-1},
\]
hence \(q\le \kappa\).

Lemma 5 uses only the size formula
\[
|\mathcal H(G,q)|=q^{r_N(E)}\le q^w.
\]
If \(|\mathcal H(G,q)|\ge (c\log w)^w\), then
\[
q^w\ge (c\log w)^w,
\]
so \(q\ge c\log w\).

Lemma 6 follows from repeated application of the contraction identity in Theorem 3. If we link successively on supports \(X_1,\dots,X_m\), then the \(i\)-th step contributes a multiplicative factor
\[
q^{-r_{N_{i-1}}(X_i)},
\]
where \(N_{i-1}\) is the current dual matroid. The contraction formula
\[
r_{N_i}(Y)=r_{N_{i-1}}(X_i\cup Y)-r_{N_{i-1}}(X_i)
\]
causes the exponents to telescope, leaving exactly
\[
q^{-r_N(U)},
\]
where \(U\) is the total contracted support.

### 3.4. Proof of Theorem 2

Items (1) and (2) are precisely Lemmas 4 and 5. Therefore, under \(\kappa=\Theta(\log w)\), we obtain
\[
c\log w\le q\le \kappa=\Theta(\log w),
\]
so \(q=\Theta(\log w)\).

For item (4), let \(U\subseteq E\) be the total support contracted by any link-only regularization procedure. By Lemma 6, the total multiplicative size loss is exactly \(q^{-r_N(U)}\), so the inverse loss factor is
\[
q^{r_N(U)}\le q^w.
\]
Since \(q=\Theta(\log w)\),
\[
q^w=\exp(O(w\log\log w)).
\]
Thus even the worst possible link-only loss in the representable setting is subexponential in \(w\log w\), and cannot reach the desired \(\exp(\Omega(w\log w))\) scale.

### 3.5. Geometry versus size

Lemma 7 shows that equal witness size does not determine probability in representable families: two witnesses of size \(2\) can have probabilities \(q^{-2}\) and \(q^{-1}\). Thus any target based only on \(|T|\) forgets information that the model genuinely retains.

Lemma 8 sharpens the point. If \(r_N(S)\) depends only on \(|S|\), then matroid submodularity forces the rank increments to be nonincreasing, so \(r_N\) must be a uniform rank function:
\[
r_N(S)=\min(|S|,d).
\]
Hence size-only dependence is not merely coarse; in the representable setting it collapses the geometry all the way to uniformity.

## 4. No-Go Theorems / Dead Approaches

The theorem blocks and ledger identify four dead families of targets and one ambient size obstruction.

### Theorem 9 (Size-loss ceiling for the original cardinality scale)

If \(|\mathcal H_w|\ge (c\log w)^w\), then no lower bound of the form \(\exp(\Omega(w\log w))\) can hold for raw cardinality loss unless the initial family itself has size at least \(\exp(\Omega(w\log w))\).

Indeed,
\[
\log |\mathcal H_w| = w\log(c\log w)=\Theta(w\log\log w),
\]
so the total multiplicative loss cannot exceed the family’s own size. This already caps any raw-cardinality lower bound at \(\exp(O(w\log\log w))\) on the original scale.

### Theorem 10 (Scalar-threshold targets are impossible for the harmonic-layer program)

Any repaired regularization target depending only on a scalar threshold
\[
\Pr[T\subseteq A]\le \Lambda^{-|T|}
\]
cannot support an \(\exp(\Theta(w\log w))\) lower bound in the harmonic layered program: the canonical regularizer reaches the threshold with loss only \(\exp(O(w\log\log w))\).

This is the formal content of ledger item \([D1]\).

### Theorem 11 (Any target depending only on witness size is impossible)

Let \((b_t)_{t\ge 1}\) be any target profile depending only on witness size, so that
\[
\Pr[T\subseteq A]\le b_{|T|}.
\]
Then the condition collapses to the scalar threshold
\[
\Lambda_b:=\sup_{t\ge 1} b_t^{-1/t},
\]
and is therefore defeated by the canonical regularizer with the same \(\exp(O(w\log\log w))\) loss bound.

This is ledger item \([D2]\) recast as a theorem.

### Theorem 12 (Single weighted witness-size targets are impossible)

Any target based on a single weighted size statistic
\[
\sum_i \omega_i\,|T\cap \text{layer }i|
\]
admits a cheap linear majorant, and the harmonic family can be regularized against that target with loss only \(\exp(O(w\log\log w))\). Hence no \(\exp(\Theta(w\log w))\) lower bound can be proved in this class.

This records ledger item \([D4]\).

### Theorem 13 (Full symmetrization is impossible for the layered obstruction)

There is no full symmetrization of the layered construction that simultaneously

1. hides the layers,
2. preserves arbitrary-witness renormalization, and
3. makes witness statistics depend only on \(|T|\),

because the multiplicative recursion destroys the harmonic obstruction.

This is exactly ledger item \([D3]\).

### Theorem 14 (Independent satisfying architectures necessarily pay a logarithmic loss)

For partition-transversal families, the logarithmic factor is intrinsic to independence: any bounded-link product-reference satisfying architecture phrased only through ambient independent block-hitting must incur a logarithmic loss, and in particular cannot remove the \(\log w\) factor with only \(o(w)\) entropy correction.

This theorem is stated in the supplied block as depending on prior proven results \([P1]\), \([P2]\), \([P7]\), \([P10]\), \([P12]\), \([P17]\). Since those proofs are not reproduced in the present packet, we record Theorem 14 only at the exact level certified by the supplied theorem block. In particular, the underlying \([P*]\) dependency chain is not independently auditable from the current packet, so we do not strengthen or re-derive the claim here.

Taken together, Theorems 9–14 show that every one-parameter repair currently certified by the workshop materials fails. The remaining search space is therefore necessarily geometric, typed, and non-scalar.

## 5. Methodology

This paper is a narration layer over a multi-model AI workshop rather than a single-author derivation from scratch. We therefore state the methodology as plainly as the record allows.

### 5.1. Workshop structure

The supplied ledger shows a role-based research harness with at least the following specialized agents:

- `Theorem Writer`, which produced the theorem blocks used here.
- the formal verification role, named inconsistently in the packet as `The Formaliz` and `The Formalizer`, which verified and killed at least one candidate line.
- `The Adversary`, which killed at least two candidate lines.
- `The Builder`, which killed at least one candidate line.
- a `compressed` verification stage, referenced repeatedly in the dead-approach reasons.

The workflow visible from the ledger is adversarial and iterative: candidate claims were proposed, compressed or formalized, and then either promoted to theorem blocks or marked dead in the ledger. The dead approaches \([D1]\)–\([D4]\) were not merely abandoned heuristically; they were explicitly “killed by verification” in this workshop process.

### 5.2. What the record certifies, and what it does not

The record certifies theorem statements, proof sketches, dependencies, and ledger outcomes. It does **not** certify the underlying commercial model names, parameter sizes, or total token budgets. It also does not provide a full run log or a complete count of all experimental branches attempted. Accordingly, we do not claim knowledge we do not have.

What we can say honestly is:

- multiple distinct AI roles participated;
- at least four dead approaches were eliminated by explicit verification;
- the present paper includes only claims that appear in the supplied theorem blocks;
- no additional theorem has been inferred here from undocumented workshop activity.

### 5.3. Claims killed by verification

The ledger records the following negative outcomes.

- \([D1]\) The scalar-threshold repair is impossible.
- \([D2]\) Any target depending only on \(|T|\) is impossible.
- \([D3]\) Full symmetrization preserving the harmonic obstruction is impossible.
- \([D4]\) Any single weighted witness-size target is impossible.

These dead approaches directly power Theorems 10–13.

### 5.4. Verified content statistics

From the supplied ledger, the verified counts are:

- Proven results in ledger: \(0\).
- Dead approaches in ledger: \(4\).
- Open questions in ledger: \(1\).

The theorem packet itself additionally contains:

- Main-results theorems: \(3\) (Theorems 1, 2, 3).
- No-go and ambient obstruction theorems: \(6\) (Theorems 9, 10, 11, 12, 13, 14).
- Supporting lemmas: \(5\) (Lemmas 4–8).

Equivalently, the packet contains \(9\) theorems globally and \(5\) supporting lemmas. We separate these counts deliberately: the first list is a ledger statistic, while the second is a paper-assembly statistic from the theorem blocks.

## 6. Conclusion

We have established that the strongest verified outcome of the workshop is negative. The original fixed-\(C\) theorem is false for the stated \(\kappa(w)=\Theta(\log w)\) regime, because sufficiently large \(w\) already implies \(C\)-spread. The main repair route through \(q\)-representable link-only families also fails: exact dual-matroid link dynamics force \(q=\Theta(\log w)\) at the cardinality scale \((c\log w)^w\), and hence cap all link-only multiplicative loss at
\[
\exp(O(w\log\log w)).
\]
This is far below the desired \(\exp(\Omega(w\log w))\) scale.

The broader lesson is that scalarization destroys the obstruction. Fixed thresholds, size-only profiles, and one-dimensional weighted statistics all collapse to targets that the canonical regularizer reaches too cheaply. Even symmetrization itself is obstructed once it erases the typed structure needed to sustain harmonic separation.

What remains is a genuinely geometric program. The current packet points toward dual-rank geometry, typed witness classes, and invariants that survive local links without collapsing to uniformity or to a one-parameter majorant. The open question recorded in the ledger is whether there exists a minor-closed typed target on dual-rank geometry strong enough to force the desired lower bound in the representable setting.

## Internal Sources

[1] **Internal theorem packet.** “Locality Barriers for Spread Regularization: Impossibility Theorems for Linear and Product Families,” theorem blocks supplied by the Theorem Writer, 2026.

[2] **Internal ledger.** Workshop verification ledger with dead approaches \([D1]\)–\([D4]\) and open question \([O1]\), 2026.

[3] **Metadata note.** Supplied workshop metadata for title, author, affiliation, and date, 2026.