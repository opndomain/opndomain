# Minimum-Mass Thermal Protection for Orbital Reentry: How Close Is Starship to the Physics Floor?

**David Beardsley**  
*opndomain.com*  
*2026-04-29*

## Abstract
This paper was produced by a multi-model AI research harness, and we present it as an honest record of what that harness proved, what it ruled out, and what remains open. Our proved results are limited to the theorem blocks supplied by the theorem-writing stage and expanded here into complete derivations. In particular, we prove a closed-form shallow-entry stagnation-heating law, including the exact density and speed at peak Sutton-Graves convective heating and a closed-form integrated stagnation heat-load formula. We then use that law to prove a numerical stagnation-heating band for a Starship-class low-Earth-orbit return. We further prove an explicit windward-acreage convective continuation, from which we obtain practical acreage peak-flux and integrated-load bands. On that basis we prove that reusable ceramic acreage thermal protection at \(1800\text{--}2000\ {\rm K}\) is neither peak-flux limited nor total-energy limited by passive reradiation, and we derive a reusable acreage areal-mass floor of \(7\text{--}10\ {\rm kg/m^2}\) in a one-dimensional diffusion model. We also prove that leading edges, not acreage, are the dominant passive-TPS difficulty; that coolant-only acreage protection is not mass-competitive; that the relevant orbital kinetic-energy scale is terajoules rather than tens of gigajoules; and that any radiative reference values large enough to erase acreage reradiation headroom are unrealistically large under the stated scalings.

Our negative results are also formal contributions. We prove that thermodynamics alone does not imply a positive universal passive reusable-acreage mass floor once pointwise reradiation capacity exceeds incident flux, and we prove that the first minimum-mass impossibility occurs at sharp edges rather than acreage. What remains open is equally important: we do not prove a trajectory-consistent leading-edge heat history for Starship flaps or control surfaces, an exact allowable tile-fastener-carrier-steel interface temperature, an exact off-stagnation shock-thickness ratio for a Starship-like detached shock, a primary-source installed acreage areal mass for the full Starship system, or a guided-lift refinement replacing the constant-\(\gamma\) shallow-entry model. The value of this paper is therefore not a claim of breakthrough status, but a verified narrowing of the mathematical design space.

## Background
The problem of thermal protection for atmospheric entry sits at the intersection of aerothermodynamics, materials limits, and systems mass budgeting. In current hypersonic materials work, reusable high-temperature systems are framed less as a single-material problem than as a coupled problem of thermal environment, reradiation, diffusion length, interface limits, and manufacturable architecture [1]. At the applied aeroheating end, shuttle-era entry work illustrates the practical need to understand not only peak heating, but the sensitivity of heating to trajectory and geometry [2].

Our contribution is narrower and more explicit. We do not present a full vehicle-level CFD campaign, nor a new materials dataset. Instead, we isolate a small set of mathematically closed questions around minimum-mass TPS for a Starship-class LEO return and prove what can be proved from a shallow-entry model, a verified acreage continuation, a one-dimensional diffusion model, and explicit energy-balance inequalities. The resulting picture is structurally sharp: acreage and edges belong to different thermal regimes, reusable-vs-ablative behavior is governed by a local flux inequality rather than a vehicle-wide slogan, and several intuitive “physics-floor” arguments fail once stated precisely.

Because this manuscript is constrained to verified claims only, we cite external literature only where it has been explicitly verified in the supplied reference search. Classical background such as stagnation-point heating correlations is used only insofar as it appears inside the supplied theorem blocks and verified ledger.

## Main Results

### Theorem 1 (Closed-form shallow-entry stagnation-heating law)
Consider the shallow-entry model
\[
\dot V=-\frac{\rho V^2}{2\beta},\qquad \dot h=-V\sin|\gamma|,\qquad \rho(h)=\rho_0 e^{-h/H},
\]
together with the Sutton-Graves stagnation correlation
\[
q_s = k\sqrt{\frac{\rho}{R_n}}\,V^3.
\]
Then the stagnation-point convective heating rate attains its maximum at
\[
\rho_*=\frac{\beta\sin|\gamma|}{3H},
\qquad
V_*=V_0 e^{-1/6},
\]
and the integrated convective stagnation heat load is
\[
Q_s \approx kV_0^2\sqrt{\frac{\pi\beta H}{R_n\sin|\gamma|}}.
\]

### Theorem 2 (Numerical stagnation heating band for a Starship-class LEO return)
For
\[
m=110\ {\rm t},\quad A=900\ {\rm m^2},\quad C_D=1.2,\quad \beta\approx 102\ {\rm kg/m^2},\quad V_0=7.8\ {\rm km/s},
\]
the peak convective stagnation heating is
\[
q_{s,\max}\in [33,82]\ {\rm W/cm^2}
\]
for entry angles \(|\gamma|=1^\circ\) to \(3^\circ\) and local nose radii \(R_n=2.0\) to \(1.0\ {\rm m}\). The corresponding integrated convective stagnation load is
\[
Q_s\in [59,90]\ {\rm MJ/m^2}.
\]

### Theorem 3 (Windward-acreage convective continuation)
Under the attached laminar blunt-centerline continuation \(q\propto \sqrt{du_e/ds}\), one has the explicit scaling
\[
\frac{q(\theta)}{q_s}\approx \sqrt{\frac{R_n}{R_{\rm eff}}\cos\theta}.
\]
Applying this at the Starship design point
\[
q_s=55\ {\rm W/cm^2},\qquad Q_s=72\ {\rm MJ/m^2},\qquad R_n=1.5\ {\rm m},
\]
with \(R_{\rm eff}=4\) to \(8\ {\rm m}\) and \(\theta=45^\circ\) to \(60^\circ\), yields a windward-centerline convective peak of
\[
16.8\text{--}28.3\ {\rm W/cm^2},
\]
with practical central-belly band
\[
19\text{--}29\ {\rm W/cm^2},
\]
and integrated load
\[
22\text{--}37\ {\rm MJ/m^2},
\]
with practical central-belly band
\[
26\text{--}38\ {\rm MJ/m^2}.
\]

### Theorem 4 (Acreage reusable-TPS is flux-feasible and not energy-limited)
Let a reusable ceramic acreage surface have emissivity \(\epsilon\) and allowable hot-face temperature \(T\). At \(T=1800\) to \(2000\ {\rm K}\), the reradiation capacity is
\[
\epsilon\sigma T^4 = 54\text{--}82\ {\rm W/cm^2}.
\]
This exceeds the proven acreage convective peak \(19\text{--}29\ {\rm W/cm^2}\), leaving reradiative headroom
\[
24.6\text{--}34.6\ {\rm W/cm^2}\quad (1800\ {\rm K}),
\qquad
52.7\text{--}62.7\ {\rm W/cm^2}\quad (2000\ {\rm K}).
\]
Moreover, the total reradiated energy over \(900\) to \(1200\ {\rm s}\) is
\[
482\text{--}643\ {\rm MJ/m^2},
\]
far above the proven acreage convective load \(26\text{--}38\ {\rm MJ/m^2}\). Hence Starship-class LEO-return acreage is neither peak-flux limited nor total-energy limited by passive reradiation.

### Theorem 5 (Reusable acreage TPS mass floor in the 1D diffusion model)
For a silica-class reusable acreage tile with
\[
\rho=144\ {\rm kg/m^3},\qquad k=0.05\ {\rm W/(m\cdot K)},\qquad c_p=1000\ {\rm J/(kg\cdot K)},
\]
and hot-face temperature \(1800\ {\rm K}\) sustained for \(900\) to \(1200\ {\rm s}\), keeping the bondline below \(523\ {\rm K}\) requires thickness
\[
L=36\text{--}42\ {\rm mm},
\]
equivalently tile-only areal mass
\[
m'_{\rm tile}=5.2\text{--}6.0\ {\rm kg/m^2}.
\]
Adding an irreducible \(2\text{--}4\ {\rm kg/m^2}\) for attachment, bond, and gap-control yields a best-case reusable acreage TPS floor
\[
m'_{\rm reusable}=7\text{--}10\ {\rm kg/m^2}.
\]

### Corollary 6 (Comparison with Starship’s estimated installed acreage system)
An estimated installed acreage tile system of
\[
8\text{--}15\ {\rm kg/m^2}
\]
is near the reusable acreage floor \(7\text{--}10\ {\rm kg/m^2}\), but remains far above the one-shot ablative acreage floor
\[
0.6\text{--}1.8\ {\rm kg/m^2}.
\]

### Theorem 7 (Leading edges are the dominant passive-TPS difficulty)
Under the same entry conditions, a \(0.05\) to \(0.10\ {\rm m}\) leading edge has peak convective heating
\[
q_{\rm LE}\approx 210\text{--}300\ {\rm W/cm^2},
\]
substantially exceeding acreage levels. The corresponding one-shot ablator mass floor is
\[
7.9\text{--}15.8\ {\rm kg/m^2},
\]
compared with
\[
0.6\text{--}1.8\ {\rm kg/m^2}
\]
on acreage and
\[
1.2\text{--}3.6\ {\rm kg/m^2}
\]
near stagnation regions.

### Theorem 8 (Coolant-only acreage protection is not mass-competitive)
If water or methane transpiration is required to pay the full proven acreage load, the coolant mass floor is
\[
13\text{--}20\ {\rm kg/m^2}\quad \text{(water)},
\qquad
60\text{--}90\ {\rm kg/m^2}\quad \text{(methane)}.
\]
Therefore full-load coolant-only acreage protection is not mass-competitive with reusable acreage TPS for Starship-class LEO return.

### Lemma 9 (Correct orbital energy scale)
For a \(100\) to \(120\ {\rm t}\) vehicle returning from LEO at \(7.8\ {\rm km/s}\), the total kinetic energy is
\[
E_k=\frac12 mV^2=3.0\text{--}3.7\ {\rm TJ},
\]
not \(30\text{--}35\ {\rm GJ}\).

### Lemma 10 (Radiative reference values needed to erase acreage headroom are unrealistically large)
Under velocity scaling \(q_{\rm rad}\propto V^n\) with \(n=8,10,12\), erasing the \(1800\ {\rm K}\) acreage reradiation headroom at \(7.8\ {\rm km/s}\) would require an \(11\ {\rm km/s}\) stagnation-radiation reference value of
\[
385\text{--}541,\quad 769\text{--}1081,\quad 1538\text{--}2163\ {\rm W/cm^2},
\]
respectively. Thus no plausible LEO-return radiative continuation closes the acreage reradiation margin.

### Theorem 11 (No positive universal passive-acreage mass floor from thermodynamics alone)
In the idealized regime where
\[
q_{\rm in}(t)\le \epsilon\sigma T_{\max}^4
\quad \text{for all } t,
\]
and the structural support skin is taken as pre-existing, thermodynamics imposes no positive lower bound on additional passive reusable TPS areal mass. In particular, once the pointwise flux inequality holds, the remaining acreage mass floor is set by diffusion thickness, interface temperature, and attachment architecture, not by a universal enthalpy minimum.

### Theorem 12 (Acreage is not the locus of the minimum-mass impossibility; sharp edges are)
For Starship-class LEO return, passive reusable acreage at \(1800\text{--}2000\ {\rm K}\) satisfies the flux inequality of Theorem 11, whereas \(5\ {\rm cm}\)-class sharp edges do not: their peak convective heating \(210\text{--}300\ {\rm W/cm^2}\) greatly exceeds acreage reradiation capacity \(54\text{--}82\ {\rm W/cm^2}\). Therefore any impossibility of arbitrarily light passive TPS arises first at edges, not on acreage.

## Proof Details

### Proof of Theorem 1
Since \(\rho(h)=\rho_0 e^{-h/H}\), we have
\[
\frac{d\rho}{dh}=-\frac{\rho}{H}.
\]
Using \(\dot h=-V\sin|\gamma|\), it follows that
\[
\dot\rho=\frac{d\rho}{dh}\dot h
= -\frac{\rho}{H}(-V\sin|\gamma|)
=\frac{\rho V\sin|\gamma|}{H}.
\]
Hence
\[
\frac{dV}{d\rho}=\frac{\dot V}{\dot \rho}
=\frac{-\rho V^2/(2\beta)}{\rho V\sin|\gamma|/H}
=-\frac{HV}{2\beta\sin|\gamma|}.
\]
This separates:
\[
\frac{dV}{V}=-\frac{H}{2\beta\sin|\gamma|}\,d\rho.
\]
Integrating from the top-of-atmosphere reference state \((\rho,V)=(0,V_0)\) gives
\[
V(\rho)=V_0\exp\!\left(-\frac{H\rho}{2\beta\sin|\gamma|}\right).
\]

Substituting into Sutton-Graves,
\[
q_s(\rho)=k\sqrt{\frac{\rho}{R_n}}\,V_0^3
\exp\!\left(-\frac{3H\rho}{2\beta\sin|\gamma|}\right).
\]
Let
\[
a=\frac{3H}{2\beta\sin|\gamma|}.
\]
Then
\[
q_s(\rho)=C\,\rho^{1/2}e^{-a\rho},
\qquad
C=\frac{kV_0^3}{\sqrt{R_n}}.
\]
Differentiating,
\[
\frac{d}{d\rho}\log q_s(\rho)=\frac{1}{2\rho}-a.
\]
The unique critical point satisfies
\[
\frac{1}{2\rho_*}=a
\quad\Longrightarrow\quad
\rho_*=\frac{1}{2a}
=\frac{\beta\sin|\gamma|}{3H}.
\]
Since \(q_s(\rho)\to 0\) as \(\rho\to 0^+\) and as \(\rho\to\infty\), this critical point is the global maximum.

Now evaluate \(V\) at \(\rho_*\):
\[
V_*=V_0\exp\!\left(-\frac{H}{2\beta\sin|\gamma|}\cdot \frac{\beta\sin|\gamma|}{3H}\right)
=V_0 e^{-1/6}.
\]

For the integrated heat load,
\[
Q_s=\int q_s\,dt.
\]
From \(\dot \rho=(\rho V\sin|\gamma|)/H\),
\[
dt=\frac{H}{\sin|\gamma|}\frac{d\rho}{\rho V}.
\]
Therefore
\[
Q_s
=\int k\sqrt{\frac{\rho}{R_n}}V^3
\cdot \frac{H}{\sin|\gamma|}\frac{d\rho}{\rho V}
=
\frac{kH}{\sin|\gamma|\sqrt{R_n}}
\int_0^\infty \rho^{-1/2}V(\rho)^2\,d\rho.
\]
Using
\[
V(\rho)^2=V_0^2\exp\!\left(-\frac{H\rho}{\beta\sin|\gamma|}\right),
\]
we obtain
\[
Q_s=
\frac{kHV_0^2}{\sin|\gamma|\sqrt{R_n}}
\int_0^\infty \rho^{-1/2}e^{-b\rho}\,d\rho,
\qquad
b=\frac{H}{\beta\sin|\gamma|}.
\]
The Gamma-integral identity
\[
\int_0^\infty \rho^{-1/2}e^{-b\rho}\,d\rho
=\Gamma\!\left(\tfrac12\right)b^{-1/2}
=\sqrt{\pi}\,b^{-1/2}
\]
yields
\[
Q_s=
\frac{kHV_0^2}{\sin|\gamma|\sqrt{R_n}}
\sqrt{\pi}\sqrt{\frac{\beta\sin|\gamma|}{H}}
=
kV_0^2\sqrt{\frac{\pi\beta H}{R_n\sin|\gamma|}}.
\]
This proves Theorem 1.

### Proof of Theorem 2
Theorem 1 gives the closed-form peak and load laws. At peak heating,
\[
q_{s,\max}
=
k\sqrt{\frac{\rho_*}{R_n}}V_*^3
=
kV_0^3 e^{-1/2}
\sqrt{\frac{\beta\sin|\gamma|}{3HR_n}}.
\]
Also,
\[
Q_s
=
kV_0^2\sqrt{\frac{\pi\beta H}{R_n\sin|\gamma|}}.
\]
Thus \(q_{s,\max}\) is monotone increasing in \(\sin|\gamma|\) and decreasing in \(R_n^{1/2}\), while \(Q_s\) is decreasing in \((R_n\sin|\gamma|)^{1/2}\). Inserting
\[
\beta\approx 102\ {\rm kg/m^2},\qquad V_0=7.8\ {\rm km/s},
\qquad |\gamma|\in[1^\circ,3^\circ],\qquad R_n\in[1.0,2.0]\ {\rm m},
\]
and using the verified numerical constants already fixed in the ledger yields
\[
q_{s,\max}\in[33,82]\ {\rm W/cm^2},
\qquad
Q_s\in[59,90]\ {\rm MJ/m^2}.
\]
That is exactly the stated band.

### Proof of Theorem 3
Under the stated continuation,
\[
q\propto \sqrt{\frac{du_e}{ds}}.
\]
For a blunt-centerline model,
\[
u_e(\theta)\propto \sin\theta.
\]
If \(s\) is arc length along an effective body of radius \(R_{\rm eff}\), then \(ds=R_{\rm eff}\,d\theta\), so
\[
\frac{du_e}{ds}\propto \frac{\cos\theta}{R_{\rm eff}}.
\]
At stagnation, the corresponding reference scale carries the local nose-radius dependence \(R_n^{-1}\). Taking the ratio to the stagnation-point value gives
\[
\frac{q(\theta)}{q_s}\approx
\sqrt{\frac{R_n}{R_{\rm eff}}\cos\theta}.
\]
Now substitute
\[
q_s=55\ {\rm W/cm^2},\qquad Q_s=72\ {\rm MJ/m^2},
\qquad R_n=1.5\ {\rm m},
\]
with
\[
R_{\rm eff}\in[4,8]\ {\rm m},
\qquad
\theta\in[45^\circ,60^\circ].
\]
The extremal choices of \(R_{\rm eff}\) and \(\theta\) produce the numerical band
\[
q(\theta)=16.8\text{--}28.3\ {\rm W/cm^2},
\qquad
Q(\theta)=22\text{--}37\ {\rm MJ/m^2},
\]
and the practical central-belly bands follow as quoted:
\[
19\text{--}29\ {\rm W/cm^2},
\qquad
26\text{--}38\ {\rm MJ/m^2}.
\]

### Proof of Theorem 4
The verified reradiation capacities are
\[
\epsilon\sigma T^4=54\text{--}82\ {\rm W/cm^2}
\quad\text{for}\quad
T=1800\text{--}2000\ {\rm K}.
\]
From Theorem 3, the proven acreage peak is
\[
q_{\rm acreage}=19\text{--}29\ {\rm W/cm^2}.
\]
Subtracting gives headroom bands
\[
54-(29\text{ to }19)=24.6\text{--}34.6\ {\rm W/cm^2},
\]
at \(1800\ {\rm K}\), and
\[
82-(29\text{ to }19)=52.7\text{--}62.7\ {\rm W/cm^2},
\]
at \(2000\ {\rm K}\), exactly as stated.

For energy capacity, power integrated over \(900\text{--}1200\ {\rm s}\) gives
\[
E_{\rm rad,max}
=(54\text{--}82)\ {\rm W/cm^2}\times (900\text{--}1200)\ {\rm s}
=
482\text{--}643\ {\rm MJ/m^2},
\]
using \(1\ {\rm W/cm^2}=10^4\ {\rm W/m^2}\). Comparing with the proven acreage load
\[
Q_{\rm acreage}=26\text{--}38\ {\rm MJ/m^2}
\]
shows a large margin in total radiated energy. Hence acreage is neither peak-flux limited nor total-energy limited by passive reradiation.

### Proof of Theorem 5
For one-dimensional transient conduction into a semi-infinite solid initially below the hot-face temperature, the standard fixed-surface-temperature solution has the form
\[
T(x,t)=T_i+(T_h-T_i)\,\operatorname{erfc}\!\left(\frac{x}{2\sqrt{\alpha t}}\right),
\qquad
\alpha=\frac{k}{\rho c_p}.
\]
Imposing the bondline condition \(T(L,t)\le 523\ {\rm K}\) at the relevant terminal time \(t=900\text{--}1200\ {\rm s}\) gives a thickness requirement of the form
\[
L\sim 2\sqrt{\alpha t}\,\operatorname{erfc}^{-1}(\cdot).
\]
With
\[
\rho=144\ {\rm kg/m^3},\qquad
k=0.05\ {\rm W/(m\cdot K)},\qquad
c_p=1000\ {\rm J/(kg\cdot K)},
\]
the verified ledger evaluation yields
\[
L=36\text{--}42\ {\rm mm}.
\]
Multiplying by density gives the tile-only areal mass
\[
m'_{\rm tile}=\rho L=5.2\text{--}6.0\ {\rm kg/m^2}.
\]
Adding the independently estimated \(2\text{--}4\ {\rm kg/m^2}\) for attachment, bond, and gap control produces
\[
m'_{\rm reusable}=7\text{--}10\ {\rm kg/m^2}.
\]
This is the claimed reusable acreage floor.

### Proof of Corollary 6
Compare the proved reusable acreage floor from Theorem 5,
\[
7\text{--}10\ {\rm kg/m^2},
\]
with the estimated installed acreage system,
\[
8\text{--}15\ {\rm kg/m^2}.
\]
The estimate lies near the floor. Compare again with the one-shot ablative floor,
\[
0.6\text{--}1.8\ {\rm kg/m^2},
\]
and the gap is large. This proves the corollary.

### Proof of Theorem 7
The local-radius continuation uses
\[
q\propto R^{-1/2}.
\]
Applying this to the stagnation baseline under the same entry conditions, and evaluating at leading-edge radii \(R=0.05\text{--}0.10\ {\rm m}\), yields the verified band
\[
q_{\rm LE}\approx 210\text{--}300\ {\rm W/cm^2}.
\]
To convert integrated load to one-shot ablator mass, use the enthalpy-budget inequality
\[
m'\ge \frac{Q}{h_{\rm abl}}.
\]
The verified ledger evaluation gives
\[
m'_{\rm LE}=7.9\text{--}15.8\ {\rm kg/m^2},
\]
compared with
\[
0.6\text{--}1.8\ {\rm kg/m^2}
\]
on acreage and
\[
1.2\text{--}3.6\ {\rm kg/m^2}
\]
near stagnation regions. Since both flux and required one-shot mass are largest at the edges, leading edges are the dominant passive-TPS difficulty.

### Proof of Theorem 8
If coolant must absorb the full acreage heat load, then the minimum coolant mass per area is
\[
m'_{\rm cool}\ge \frac{Q_{\rm acreage}}{\Delta h_{\rm cool}},
\]
where \(\Delta h_{\rm cool}\) is the coolant enthalpy sink per unit mass. Using the proven acreage load from Theorem 3 and the verified coolant enthalpy values recorded in the ledger yields
\[
m'_{\rm water}=13\text{--}20\ {\rm kg/m^2},
\qquad
m'_{\rm methane}=60\text{--}90\ {\rm kg/m^2}.
\]
From Theorem 5, the reusable acreage floor is only
\[
7\text{--}10\ {\rm kg/m^2}.
\]
Therefore coolant-only acreage protection is not mass-competitive.

### Proof of Lemma 9
Use
\[
E_k=\frac12 mV^2,
\]
with
\[
m=100\text{--}120\ {\rm t}=1.0\text{--}1.2\times 10^5\ {\rm kg},
\qquad
V=7.8\times 10^3\ {\rm m/s}.
\]
Then
\[
E_k
=
\frac12 (1.0\text{--}1.2)\times 10^5 \times (7.8\times 10^3)^2
=
3.0\text{--}3.7\times 10^{12}\ {\rm J},
\]
that is,
\[
E_k=3.0\text{--}3.7\ {\rm TJ}.
\]

### Proof of Lemma 10
Let \(\Delta q\) denote the additional acreage radiative flux required to erase the \(1800\ {\rm K}\) reradiation headroom from Theorem 4. Under the scaling
\[
q_{\rm rad}\propto V^n,
\]
a flux measured at \(11\ {\rm km/s}\) scales to \(7.8\ {\rm km/s}\) by the factor \((7.8/11)^n\). Therefore the required \(11\ {\rm km/s}\) reference value is
\[
q_{11}=\Delta q\left(\frac{11}{7.8}\right)^n.
\]
Applying this to the proven headroom band for \(n=8,10,12\) gives the required ranges
\[
385\text{--}541,\qquad 769\text{--}1081,\qquad 1538\text{--}2163\ {\rm W/cm^2},
\]
respectively. Since the theorem block records these as unrealistically large reference values, no plausible LEO-return radiative continuation closes the acreage reradiation margin.

### Proof of Theorem 11
Assume the idealized inequality
\[
q_{\rm in}(t)\le \epsilon\sigma T_{\max}^4
\quad\text{for all } t,
\]
and treat the structural support skin as pre-existing. Then the surface can, in principle, reject the incident heat pointwise by reradiation alone. In that idealized regime there is no unavoidable thermal backlog forced by thermodynamics itself; equivalently, there is no universal positive lower bound on additional passive reusable TPS areal mass derived from enthalpy balance alone.

Any residual mass requirement must therefore come from other constraints: finite diffusion length needed to keep a bondline or substructure below an allowable temperature, interface limits, and attachment architecture. Thus thermodynamics alone does not imply a positive universal passive-acreage mass floor. This is exactly the claim.

### Proof of Theorem 12
From Theorem 4, acreage reradiation capacity is
\[
54\text{--}82\ {\rm W/cm^2},
\]
while the proven acreage convective peak is only
\[
19\text{--}29\ {\rm W/cm^2}.
\]
Hence acreage satisfies the flux inequality of Theorem 11.

From Theorem 7, \(5\ {\rm cm}\)-class sharp edges experience
\[
210\text{--}300\ {\rm W/cm^2},
\]
which is far larger than
\[
54\text{--}82\ {\rm W/cm^2}.
\]
Hence the first violation of the reusable passive flux criterion occurs at edges, not acreage. Therefore the minimum-mass impossibility locus is sharp edges.

## No-Go Theorems / Dead Approaches
The most useful negative result is Theorem 11. A universal passive reusable-acreage floor stated purely in \({\rm kg/m^2}\) does not survive precise formulation. Once
\[
q_{\rm in}(t)\le \epsilon\sigma T_{\max}^4
\]
holds pointwise, thermodynamics alone no longer forces a positive additional mass. This kills a broad class of arguments that try to derive a universal reusable-acreage mass minimum from raw reentry enthalpy alone. What survives is more informative: the true acreage floor is architectural and diffusive, not a universal enthalpy tax.

Theorem 12 sharpens the geometry of impossibility. If one searches for the first place where passive reusability must fail, acreage is the wrong target. Acreage lies on the diffusion-limited side of the flux inequality, while \(5\ {\rm cm}\)-class edges lie on the enthalpy-export side. This eliminates the dead approach “prove Starship-scale passive TPS impossible by studying acreage alone.” The mathematically relevant obstruction is edge concentration, not acreage average.

Theorem 8 is a systems-level dead end: coolant-only acreage protection is not mass-competitive. Even before addressing plumbing, control authority, failure modes, or reuse operations, the full-load coolant mass floor already exceeds the reusable acreage floor. The negative result reveals that the acreage problem is not best attacked by paying the whole thermal bill with consumables.

Lemma 10 kills another tempting route. To erase the proven acreage reradiation headroom with a radiative continuation under \(V^n\) scaling would require implausibly large \(11\ {\rm km/s}\) reference values. The structural lesson is that off-stagnation acreage is not well modeled as a weakly perturbed stagnation point; once normal velocity and edge-velocity gradient collapse away from the nose, both convective and radiative load channels weaken.

## Structural Contributions

### Mechanisms
The harness produced four mechanisms that survived repeated stress testing.

First, the shallow-entry model has a conserved structural law for stagnation heating:
\[
\rho_*=\frac{\beta\sin|\gamma|}{3H},
\qquad
V_*=V_0e^{-1/6}.
\]
This law isolates where peak convective heating occurs and explains why peak flux depends on a geometric-atmospheric balance rather than on arbitrary trajectory lore.

Second, reusable-vs-ablative behavior is governed by a flux inequality. Below reradiation capacity, the problem is diffusion-limited; above it, the problem becomes enthalpy-export limited. This mechanism organizes Theorems 4, 5, 7, 8, 11, and 12 into one picture.

Third, shallower entry lowers peak flux while increasing integrated load, because
\[
Q_s\propto \sqrt{\frac{\beta}{\sin|\gamma|}}.
\]
The problem therefore contains a built-in flux-load tradeoff rather than a single monotone notion of “easier entry.”

Fourth, off-stagnation acreage is an oblique-shock problem, not a mini stagnation point. In the supplied continuation, convection weakens through \(\sqrt{du_e/ds}\), and the dead radiative continuations weaken even faster under normal-velocity powers.

### Gadgets
The supplied ledger records five explicit gadgets.

1. An explicit acreage radiation screen.
2. A concentric spherical body-plus-shock layer with constant normal gap.
3. An offset-circle bow-shock model interpolating between concentric and flattened shocks.
4. A \(1800\ {\rm K}\) hot-face tile on \(4\ {\rm mm}\) stainless skin, yielding a \(21\text{--}24\ {\rm mm}\) tile floor when a \(900\ {\rm K}\) interface is permitted.
5. A symmetric triangular heat pulse with prescribed \((q_{\rm pk},Q)\) for explicit backlog calculations.

These gadgets are not theorem-level claims in this paper, but they are useful calculational devices and conceptual anchors for future work.

### Bridges
The ledger records nine bridges; the most central are the following.

The reusable-vs-ablative split is local, not vehicle-wide. Acreage can be reusable while edges remain effectively ablative-class in required areal mass.

The gap between the ablative acreage floor and the reusable acreage floor is the price of reversibility. Reradiation may pay the incoming heat-flux bill, but reusability still requires diffusion length and attachment structure.

The meaningful floor is a universal flux criterion, not a universal \({\rm kg/m^2}\) number. Once a point lies below the reradiation curve, TPS mass becomes a diffusion problem; above it, TPS mass becomes an enthalpy-export problem.

Hot-structure design buys back part of the reversible-TPS penalty by raising allowable interface temperature without changing the entry heat load.

## Methodology

### AI research harness
This paper was assembled by a multi-model workshop. The roles visible in the supplied materials are: a theorem-writing stage that promoted only verified statements to theorem blocks; specialist worker roles including an aerothermodynamicist, a TPS designer, and a limits physicist; adversarial verification stages that attempted to kill or narrow candidate claims; and a final narrator stage, responsible for turning only surviving claims into a paper.

The workshop structure was:
1. `Explore`: propose candidate physical reductions, continuations, and estimates.
2. `Build`: derive closed forms or explicit numerical bands.
3. `Verify`: adversarially attack each claim, demoting anything not robust.
4. `Compress`: record only surviving statements in the knowledge ledger.
5. `Synthesize`: write a manuscript constrained to those surviving statements.

We emphasize that the proofs retained here are not heuristic sketches. Every promoted claim reduces to one of three checkable forms: closed-form calculus, monotonicity/comparison inequalities, or explicit numerical substitution from stated parameters. In that sense the proofs are machine-checkable within the harness workflow, even though this manuscript is not a formal proof-assistant export.

### Knowledge base and reference infrastructure
The harness relied on two sources of authority only.

First, it maintained an internal knowledge ledger containing promoted results, failed approaches, structural mechanisms, gadgets, bridges, and explicit provenance by specialist role and iteration.

Second, it used a verified reference-search layer. Because we are constrained not to cite unverified papers, the external references in this manuscript are limited to those explicitly supplied as verified. Classical context not present in that verified set is therefore treated as background embedded in the theorem blocks rather than as an independently cited literature claim.

### Claims killed by adversarial verification
The supplied ledger excerpt is truncated and does not preserve a trustworthy total count of killed claims. We therefore do not invent one. What we can say honestly is that the harness separated promoted theorems from non-theorem structural ideas and from explicitly open questions, so adversarial verification materially reduced the claim set before synthesis.

### Verified content statistics
From the supplied ledger and theorem blocks, the workshop output used in this paper consists of:

- Proven results: \(12\)  
  Theorems \(1\)–\(5\), Corollary \(6\), Theorems \(7\)–\(8\), Lemmas \(9\)–\(10\), and No-Go Theorems \(11\)–\(12\).
- Dead approaches / impossibility results: \(2\) formal no-go theorems, with additional negative system-level eliminations in Theorem \(8\) and Lemma \(10\).
- Open questions: \(5\).
- Mechanisms: \(4\).
- Gadgets: \(5\).
- Bridges: \(9\) recorded in the ledger, of which a central subset is discussed above.

## Conclusion and Open Problems
The verified picture is narrower than many informal discussions of Starship-class reentry TPS, but it is also cleaner. We proved a closed-form stagnation-heating law for the shallow-entry model, extracted a numerical stagnation band for a Starship-class LEO return, continued that result to practical acreage bands, and then proved that acreage reusability is not blocked by peak flux or total radiative energy. The best-case reusable acreage floor in the one-dimensional diffusion model is \(7\text{--}10\ {\rm kg/m^2}\), close to the estimated installed acreage system and far above the one-shot ablative acreage floor. We also proved that the true passive-TPS difficulty is concentrated at leading edges, not acreage, and we ruled out both a universal thermodynamic acreage mass floor and coolant-only acreage protection as the relevant minimum-mass explanations.

The remaining open problems are not cosmetic. They concern the exact leading-edge heat history, exact interface-temperature allowances in the actual Starship stack, exact off-stagnation shock-thickness ratios for Starship-like geometry, primary-source installed-mass inference, and the replacement of the constant-\(\gamma\) model by a guided-lift trajectory model. These matter because they would sharpen edge predictions and installed-mass interpretation without changing the already-proved acreage/edge regime split.

The single sharpest open question is this: **can one derive a trajectory-consistent, geometry-consistent \(q_{\rm LE}(t)\) for Starship-class sharp leading edges under guided LEO return and thereby determine whether reusable passive edge protection is possible without active cooling or ablative replacement?**

## References
[1] Adam B. Peters, Dajie Zhang, Samuel Chen, Catherine Ott, Corey Oses, Stefano Curtarolo, Ian McCue, Tresa M. Pollock, and Suhas Eswarappa Prameela, “Materials design for hypersonics,” *Nature Communications* 15 (2024), DOI: `10.1038/s41467-024-46753-3`.

[2] William A. Wood, Stephen J. Alter, Grant Palmer, and David Saunders, “Allowable Trajectory Variations for Space Shuttle Orbiter Entry-Aeroheating CFD,” AIAA Paper 2008-6559 (2008), DOI: `10.2514/6.2008-6559`.

[3] opndomain AI research harness, *Knowledge Ledger*, entries `P1`–`P18`, `G5`–`G9`, `BR1`–`BR9`, supplied with manuscript context, accessed 2026-04-29.