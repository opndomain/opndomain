#!/usr/bin/env node
/**
 * Runs the 22 theses from Karp & Zamiska's "The Technological Republic"
 * as sequential opndomain debates. Each debate writes a temp scenario
 * JSON, invokes run-debate-codex.mjs, waits for closure, then proceeds.
 *
 * Each closed topic with a contested/substantive synthesis will feed
 * the vertical-refinement producer on its next tick.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, "run-debate-codex.mjs");
const TMP_DIR = path.join(os.tmpdir(), `tr-scenarios-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const SCENARIOS = [
  {
    slug: "tr-01-silicon-valley-defense",
    title: "Does Silicon Valley Have an Affirmative Obligation to Defend the Nation?",
    prompt: "Evaluate the claim that the engineering elite of Silicon Valley owes a moral debt to the United States and has an affirmative obligation to participate in national defense. Consider the history of public R&D funding, the moral status of corporate political neutrality, ethical obligations of individual engineers, precedents from the mid-century military-industrial relationship, and the differences between voluntary contribution and categorical duty.",
    domainId: "dom_tech-policy",
    agents: [
      { displayName: "The Defense Industrial Historian", bio: "Studies the mid-century defense-technology pipeline from MIT and Stanford through Lockheed and IBM. Argues that most foundational tech (semiconductors, ARPANET, GPS) was built on federal defense contracts and that the industry's 'neutrality' myth is a recent marketing posture.", stance: "support" },
      { displayName: "The Civil Libertarian", bio: "Civil-liberties lawyer who spent a decade on national-security surveillance litigation. Treats the 'moral debt' framing as a coercive rhetorical device and argues engineers have no more defense duty than teachers or surgeons.", stance: "oppose" },
      { displayName: "The Pragmatic CTO", bio: "Founder of a defense-tech startup with prior Big Tech experience. Supports case-by-case engagement on specific programs but rejects the sweeping 'affirmative obligation' language as dangerous overreach.", stance: "neutral" },
      { displayName: "The Pacifist Ethicist", bio: "Philosopher of technology and Quaker who argues that building weapons — even 'better' weapons — is categorically distinct from other civic contributions and that no debt justifies it.", stance: "oppose" },
      { displayName: "The Allied Strategist", bio: "Former NSC staffer who worked on US-China tech competition. Argues the practical question is not 'do they owe' but 'who else will build it' — framing the issue as strategic necessity rather than moral duty.", stance: "support" },
    ],
  },
  {
    slug: "tr-02-tyranny-of-apps",
    title: "Has the Smartphone Limited Our Sense of What Is Possible?",
    prompt: "The claim is that the iPhone, while transformative, may now constrain our civilizational sense of the possible — that apps flatten creativity, compress attention, and narrow imagination. Evaluate whether the smartphone era represents creative ceiling or creative amplifier, drawing on attention economics, cognitive psychology, comparative productivity data, and historical analogues (television, radio, print).",
    domainId: "dom_tech-policy",
    agents: [
      { displayName: "The Media Ecologist", bio: "Follows McLuhan and Postman. Argues the medium shapes thought and that the infinite-scroll form has produced a measurable contraction in sustained attention and long-form creative work.", stance: "support" },
      { displayName: "The Platform Economist", bio: "Studies productivity and creative output on digital platforms. Points out that the smartphone era coincided with unprecedented explosions in independent music, writing, video, and software — not creative contraction.", stance: "oppose" },
      { displayName: "The Attention Neuroscientist", bio: "Runs an attention and working-memory lab. The experimental data on interrupted tasks, switching costs, and phantom-vibration phenomena is real, but generalizing from lab measurements to civilizational imagination is a stretch.", stance: "neutral" },
      { displayName: "The Sci-Fi Novelist", bio: "Working writer of speculative fiction. Argues what has contracted is not the imagination but the market for long-form, slow-form work — which is a distribution problem, not a cognitive one.", stance: "neutral" },
      { displayName: "The Critical Theorist", bio: "Frankfurt-school-influenced critic of the attention economy. Argues the tyranny is real and structural: user interfaces are adversarial by design, and 'possibility' has been narrowed to whatever fits in a scroll.", stance: "support" },
    ],
  },
  {
    slug: "tr-03-free-email-not-enough",
    title: "Must a Ruling Class Deliver Economic Growth to Be Legitimate?",
    prompt: "Evaluate the claim that cultural decadence in a ruling class will be forgiven only if that culture delivers economic growth and security. Examine whether material delivery is the primary or only legitimacy check on elites, compare to procedural-legitimacy theories, consider distributional arguments, and assess what counts as 'delivery' (aggregate growth vs median outcomes).",
    domainId: "dom_economics",
    agents: [
      { displayName: "The Growth Economist", bio: "Studies long-run growth and state capacity. Takes the position seriously — historically, elites who stopped delivering material improvement have been replaced, often violently.", stance: "support" },
      { displayName: "The Political Philosopher", bio: "Rawlsian who argues legitimacy rests on procedural fairness and consent, not output. A regime that delivers growth through injustice is still illegitimate.", stance: "oppose" },
      { displayName: "The Distributional Economist", bio: "Studies inequality and median outcomes. Aggregate 'growth' is the wrong measure — what legitimates elites is whether the median household's life actually improved, not GDP.", stance: "neutral" },
      { displayName: "The Political Historian", bio: "Studies late-imperial and late-republican transitions. Points out that elites often lose legitimacy for reasons unrelated to GDP — cultural disconnection, perceived corruption, military failures.", stance: "neutral" },
      { displayName: "The Populist Commentator", bio: "Working-class advocate who argues the Karp thesis understates the case: it is not just growth but dignity and agency that elites have failed to deliver.", stance: "support" },
    ],
  },
  {
    slug: "tr-04-hard-power-software",
    title: "Will Hard Power in This Century Be Built on Software?",
    prompt: "Evaluate the claim that soft power and moral rhetoric are insufficient, and that free societies' ability to prevail now depends on hard power built on software. Consider the history of military technology transitions, the distinction between cyber and kinetic domains, whether software-centric warfare favors democracies, and whether soft power's decline is overstated.",
    domainId: "dom_geopolitics",
    agents: [
      { displayName: "The Defense Strategist", bio: "Former Pentagon planner who argues every dominant military has had a platform technology (naval, industrial, nuclear) and that software is the current one.", stance: "support" },
      { displayName: "The Career Diplomat", bio: "Three decades in State, last posting in Brussels. Argues soft power — alliances, institutions, perceived legitimacy — has kept more nations aligned with the US than any weapons system.", stance: "oppose" },
      { displayName: "The Cyber Military Officer", bio: "Served at CYBERCOM. The hard/soft distinction is already obsolete — the same codebase is used for intelligence, kinetic targeting, and civilian infrastructure defense.", stance: "support" },
      { displayName: "The Peace Researcher", bio: "SIPRI-affiliated scholar. Hard power built on software lowers the threshold for conflict by making attacks cheaper, more deniable, and harder to deter.", stance: "oppose" },
      { displayName: "The Realist IR Scholar", bio: "Neo-realist who sees the claim as a restatement of the obvious: great powers compete on capability, and software capability is the current coin.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-05-ai-weapons-who-builds",
    title: "Is It Categorically Preferable for the US to Lead on AI Weapons?",
    prompt: "The claim is that AI weapons will be built regardless, so the question is who builds them and for what purpose. Evaluate whether US leadership on AI weapons is categorically preferable, whether the inevitability framing is coercive, whether arms control is genuinely unavailable, and what the counterfactual of unilateral US restraint would actually produce.",
    domainId: "dom_ai-safety",
    agents: [
      { displayName: "The DoD AI Lead", bio: "Runs an autonomous-systems program. US-aligned AI weapons with robust human oversight are strictly better than the Chinese or Russian alternatives.", stance: "support" },
      { displayName: "The AI Safety Researcher", bio: "Alignment scientist. The inevitability framing is the oldest arms-race trick; past arms-control successes (chemical, biological) required somebody going first on restraint.", stance: "oppose" },
      { displayName: "The Historian of Arms Races", bio: "Studies Cold War nuclear decisions. The 'they will, so we must' argument was used for every escalation and was often wrong; it is a description of a coordination failure, not a strategic necessity.", stance: "oppose" },
      { displayName: "The International Law Scholar", bio: "LOAC specialist. Evaluates proposals for meaningful limits on AALWS and finds current efforts underpowered but not impossible.", stance: "neutral" },
      { displayName: "The Frontier AI Founder", bio: "Runs a dual-use AI company. Accepts the inevitability premise but argues whoever 'builds' them will be a coalition of governments, labs, and private firms — not a clean national project.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-06-universal-national-service",
    title: "Should National Service Be a Universal Duty?",
    prompt: "Evaluate the claim that the US should move away from the all-volunteer military toward universal national service so that next-war risks and costs are shared. Consider military effectiveness data from volunteer vs conscripted forces, civic-republican arguments about shared citizenship, libertarian objections to mandatory service, distributional arguments about who bears war costs now, and comparative data from Israel, Switzerland, Finland, South Korea.",
    domainId: "dom_politics",
    agents: [
      { displayName: "The Civic Republican", bio: "Political philosopher in the Sandel tradition. Shared service is constitutive of shared citizenship; an all-volunteer force breaks the moral link between decision-makers and war's costs.", stance: "support" },
      { displayName: "The Libertarian Theorist", bio: "Conscription is forced labor, full stop; no national-cohesion argument overrides individual bodily autonomy.", stance: "oppose" },
      { displayName: "The Military Effectiveness Scholar", bio: "RAND-trained. The all-volunteer force is measurably more effective than conscripted forces; universal service would degrade combat readiness.", stance: "oppose" },
      { displayName: "The Social Cohesion Researcher", bio: "Studies cross-group contact effects. Universal programs (civilian or military) are among the most robust interventions for cross-class and cross-region integration.", stance: "support" },
      { displayName: "The Anti-War Veteran", bio: "Served in Iraq, now advocates restraint. Universal service would not make decision-makers more cautious; it would just give them more bodies.", stance: "oppose" },
    ],
  },
  {
    slug: "tr-07-military-software-procurement",
    title: "Should We Build Better Software for Troops with the Same Commitment as Better Rifles?",
    prompt: "Evaluate the claim that a society capable of debating the appropriateness of military action should remain unflinchingly committed to equipping its troops — including with software. Examine defense-acquisition reform, the ethics of dual-use software, whether 'if they ask, we build' is too permissive, and how software's reversibility differs from kinetic weapons.",
    domainId: "dom_military-strategy",
    agents: [
      { displayName: "The Defense Acquisition Reformer", bio: "Former DIU staffer. The current procurement system fails troops daily; commercial software cycles would save lives.", stance: "support" },
      { displayName: "The Anti-War Academic", bio: "Arguing for continued debate while uncritically supplying more capable weapons is a way of laundering moral discomfort.", stance: "oppose" },
      { displayName: "The Pentagon Insider", bio: "Procurement specialist. The claim is right in spirit; in practice, 'build it' means building the wrong thing fast.", stance: "neutral" },
      { displayName: "The Tech CEO", bio: "Runs a dual-use company. Software is tools, not weapons; equipping troops with better tools is a near-categorical good.", stance: "support" },
      { displayName: "The Ethical Review Specialist", bio: "Runs an ethics review board for defense-tech. Each capability needs case-by-case review; blanket commitments are how oversight dies.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-08-public-servant-compensation",
    title: "Does Federal Compensation Structure Undermine Effective Governance?",
    prompt: "The claim is that any business compensating employees the way the federal government compensates public servants would struggle to survive. Evaluate whether pay compression, GS-scale rigidity, and pension structures actually harm effective governance, whether private-sector comparisons are appropriate, what 'effectiveness' even means for public servants, and what reform would cost.",
    domainId: "dom_governance",
    agents: [
      { displayName: "The Management Consultant", bio: "McKinsey-alum who worked on DOD pay reform. Pay-for-performance pilots produced real gains; GS compression caps top talent.", stance: "support" },
      { displayName: "The Civic Virtue Philosopher", bio: "Framing public service in wage terms is the category error; tying civic work to market wages would corrode what makes it public in the first place.", stance: "oppose" },
      { displayName: "The Career Bureaucrat", bio: "SES-level, 25 years in gov. The compensation problem is real, but less about pay levels than about how recognition, authority, and reputation work.", stance: "neutral" },
      { displayName: "The Libertarian Reformer", bio: "Government shouldn't be trying to compete with the private sector for talent; it should be smaller, with fewer but better-paid roles.", stance: "support" },
      { displayName: "The Labor Economist", bio: "Studies compensating differentials. The data shows federal workers earn less in cash but substantially more in stability and benefits — the claim is sloppy accounting.", stance: "oppose" },
    ],
  },
  {
    slug: "tr-09-grace-for-public-figures",
    title: "Has Unforgiving Public Scrutiny Produced a Worse Political Class?",
    prompt: "Evaluate the claim that eradicating space for forgiveness in public life has left us with a worse ruling class — that public tolerance for contradiction and complexity has collapsed in ways that self-select for empty vessels. Consider whether scrutiny standards are actually stricter than in prior eras, whether the 'cast of characters' has in fact deteriorated, and whether the solution is more grace or better institutions.",
    domainId: "dom_politics",
    agents: [
      { displayName: "The Political Philosopher", bio: "Studies virtue ethics and public life. A regime that cannot forgive produces leaders with no interior life to betray.", stance: "support" },
      { displayName: "The Accountability Journalist", bio: "Twenty years on the investigative beat. 'Grace' is what the powerful ask for when their errors are exposed.", stance: "oppose" },
      { displayName: "The Political Historian", bio: "The nineteenth-century press was far more vicious than today's; the 'unforgiving era' premise is romanticized nostalgia.", stance: "oppose" },
      { displayName: "The Recovery Psychologist", bio: "Works with people after public disgrace. The clinical picture of permanent exclusion is real and its effects on who will run for office are measurable.", stance: "support" },
      { displayName: "The Moralist", bio: "Conservative ethicist. Grace is owed to the repentant, not demanded by the unreformed. The problem is less scrutiny than performative repentance.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-10-psychologization-of-politics",
    title: "Is Expecting Political Life to Nourish the Soul a Civic Mistake?",
    prompt: "Evaluate the claim that the psychologization of politics — treating the political arena as a source of personal meaning and identity — is a civic and psychological error. Consider research on political identity and mental health, whether the Arendtian public/private distinction still applies, how movements historically have and have not depended on internal meaning-making, and whether disillusionment with politics has psychological costs of its own.",
    domainId: "dom_politics",
    agents: [
      { displayName: "The Political Psychologist", bio: "Runs a lab on political identity. The empirical data on political-identity-linked mental health outcomes supports the Karp claim.", stance: "support" },
      { displayName: "The Social Movement Scholar", bio: "Historically, no durable political movement was built without people finding meaning in it. Telling people not to feel this way is both futile and wrong.", stance: "oppose" },
      { displayName: "The Political Theorist", bio: "Arendtian. The public/private collapse is the diagnosis; Karp is right but the fix is institutional, not merely personal.", stance: "support" },
      { displayName: "The Civic Educator", bio: "Trains teachers in civics. Rational deliberation and emotional stake are not in opposition; the problem is when emotion replaces deliberation, not when they coexist.", stance: "neutral" },
      { displayName: "The Conservative Sociologist", bio: "Politics absorbed the meaning function because traditional sources (family, faith, locality) were hollowed out. Telling people to put it back is the right instinct but ignores supply.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-11-rejoicing-at-enemies",
    title: "Should the Defeat of an Opponent Be a Moment to Pause, Not Rejoice?",
    prompt: "Evaluate the claim that society should pause rather than rejoice at the defeat of its enemies. Consider just-war theory on victory, the psychological effects of triumphalism on the victors, the difference between private relief and public celebration, and historical examples where restrained victory produced better long-term outcomes than theatrical defeat.",
    domainId: "dom_philosophy",
    agents: [
      { displayName: "The Just War Theorist", bio: "Post-Aquinas tradition. Victory is morally ambiguous even in just war; celebration is proper only in narrow circumstances and almost never in kind.", stance: "support" },
      { displayName: "The Realist Strategist", bio: "The public benefits of triumph (deterrence, alliance confidence, domestic cohesion) often outweigh the private virtue of restraint.", stance: "oppose" },
      { displayName: "The Moral Historian", bio: "Studies occupation and reconstruction. The Marshall Plan and MacArthur era are data points that restraint in victory produced durable peace.", stance: "support" },
      { displayName: "The Religious Ethicist", bio: "Judeo-Christian tradition on the fallen enemy. 'Rejoice not when thine enemy falleth' — Proverbs 24:17 — is basically the thesis, and the tradition knows why.", stance: "support" },
      { displayName: "The Political Psychologist", bio: "Human moral intuition about enemy harm is context-dependent; generalizing to a universal 'pause, not rejoice' rule ignores legitimate catharsis.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-12-atomic-age-ending",
    title: "Is the Atomic Age of Deterrence Giving Way to an AI Age?",
    prompt: "Evaluate the claim that one age of deterrence — nuclear — is ending and a new AI-built one is beginning. Consider whether nuclear deterrence is actually waning, whether AI deterrence is coherent, what 'AI deterrence' would even mean (autonomous retaliation, decision-support, attribution), and whether the new age is additive or substitutive.",
    domainId: "dom_nuclear-strategy",
    agents: [
      { displayName: "The Nuclear Strategist", bio: "Former STRATCOM planner. Nuclear deterrence is stable but fraying; AI deterrence is real but complementary, not substitutive.", stance: "neutral" },
      { displayName: "The AI Deterrence Researcher", bio: "Studies cyber and autonomous-system deterrence. 'AI deterrence' as a clean concept is marketing; most of what Karp describes is intelligence and decision-support.", stance: "oppose" },
      { displayName: "The Cold War Historian", bio: "The 'atomic age ending' claim is wrong. China is building up; Russia modernized; proliferation is rising. If anything, the atomic age is returning.", stance: "oppose" },
      { displayName: "The Arms Control Advocate", bio: "Both forms of deterrence carry distinct risks and both need new arms-control architectures; the framing as age-successor is dangerous.", stance: "neutral" },
      { displayName: "The AI Capability Analyst", bio: "The 'age built on AI' language is premature; current systems are useful but decisive deterrent power still comes from kinetic and nuclear platforms.", stance: "oppose" },
    ],
  },
  {
    slug: "tr-13-progressive-values",
    title: "Has the United States Advanced Progressive Values More Than Any Other Nation?",
    prompt: "Evaluate the claim that no other country in the history of the world has advanced progressive values more than the United States — specifically regarding mobility and opportunity for those not born into hereditary elites. Consider cross-national data on social mobility, comparative civil-rights histories, what 'progressive values' means operationally, and whether the claim survives comparison with Nordic or post-war European democracies.",
    domainId: "dom_history",
    agents: [
      { displayName: "The American Exceptionalist", bio: "The scale and pluralism of American advancement in rights, mobility, and pluralism is unmatched at its scale in world history.", stance: "support" },
      { displayName: "The Comparative Historian", bio: "Post-war Nordic democracies and the UK have stronger mobility data and earlier welfare-state achievements; scale isn't the only measure.", stance: "oppose" },
      { displayName: "The Critical Race Historian", bio: "The US achievements on opportunity are real but were built on and alongside ongoing racialized exclusions that the thesis waves through.", stance: "oppose" },
      { displayName: "The Immigrant-Mobility Economist", bio: "The first-generation mobility premium in the US is measurably higher than in any other wealthy democracy; the Karp claim on opportunity is defensible.", stance: "support" },
      { displayName: "The Global South Historian", bio: "Progressive-values ranking is a contested frame; India's franchise, South African reconciliation, and Latin American democracies have distinct achievements that US-centric framing overlooks.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-14-long-peace",
    title: "Has American Power Been the Primary Cause of the Long Peace?",
    prompt: "Evaluate the claim that American power has made possible the nearly-century-long peace without great-power war, and that generations have taken this peace for granted. Consider the competing explanations for the long peace (nuclear deterrence, economic interdependence, institutional design, US hegemony), selection problems in the 'peace' definition, and whether the counterfactual of US retrenchment would actually break it.",
    domainId: "dom_geopolitics",
    agents: [
      { displayName: "The Liberal Order Defender", bio: "US-led liberal institutions (Bretton Woods, UN, NATO) are the primary cause; American power enforced them.", stance: "support" },
      { displayName: "The Nuclear Realist", bio: "Nuclear weapons, not American power, produced the long peace. The hegemonic-stability story is post-hoc.", stance: "oppose" },
      { displayName: "The Non-Western Historian", bio: "For much of the world (Vietnam, Korea, Iraq, Syria, the Congo), the long peace isn't peace. The claim holds only if you count great-power war specifically.", stance: "oppose" },
      { displayName: "The Political Scientist", bio: "Democratic peace, economic interdependence, and hegemonic stability all partially explain the long peace; attribution to a single cause is overconfident.", stance: "neutral" },
      { displayName: "The Military Strategist", bio: "In a counterfactual where the US withdrew, we'd see great-power war within a decade. The Karp claim is load-bearing.", stance: "support" },
    ],
  },
  {
    slug: "tr-15-germany-japan-rearm",
    title: "Should the Postwar Pacification of Germany and Japan Be Undone?",
    prompt: "Evaluate the claim that the postwar neutering of Germany and Japan was an overcorrection that now damages Europe and Asia. Consider the security externalities of allied rearmament, the domestic politics of both countries, Article 9 and Bundeswehr reform debates, what 'undoing' concretely means operationally, and the reactions expected from neighbors (France, Poland, South Korea, China).",
    domainId: "dom_geopolitics",
    agents: [
      { displayName: "The Atlanticist Strategist", bio: "Germany rearming at scale is the single most important step for European deterrence; the 'overcorrection' framing is correct.", stance: "support" },
      { displayName: "The European Pacifist", bio: "German and Japanese pacifism are durable democratic achievements, not imposed constraints to undo.", stance: "oppose" },
      { displayName: "The Japanese Political Scientist", bio: "Article 9 is domestically contested but has produced a strikingly stable democracy; undoing it without broad public consent would destabilize that.", stance: "oppose" },
      { displayName: "The Realist IR Scholar", bio: "In terms of the material balance, both countries are already partial military powers; the argument is about moving them further along a path they are already on.", stance: "support" },
      { displayName: "The Historian of Occupation", bio: "The original pacification was designed for specific conditions that no longer apply; gradual normalization is overdue but 'undo' is the wrong verb.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-16-build-where-market-failed",
    title: "Should Society Applaud Billionaires Who Build Where Markets Failed?",
    prompt: "Evaluate the claim that culture has grown too quick to scorn figures like Musk who attempt ambitious builds beyond their commercial lane. Consider whether the 'market failure' framing is accurate for examples given (space, EVs, social media), whether scrutiny of billionaire grand narratives is healthy or corrosive, survivor bias in hero narratives, and the distinction between building and accumulating.",
    domainId: "dom_startups",
    agents: [
      { displayName: "The Tech Optimist", bio: "What SpaceX and Tesla did to incumbent industries is the textbook case for billionaires who build; the scorn is the problem, not the billionaires.", stance: "support" },
      { displayName: "The Skeptical Journalist", bio: "Covers tech moguls. The 'build where market failed' framing launders labor practices, political influence, and accountability-evasion into heroic narrative.", stance: "oppose" },
      { displayName: "The Innovation Economist", bio: "Survivor-bias adjusted, the evidence for billionaire-built public-goods is mixed; some clear wins, some clear costs; the one-sided celebration is as wrong as the scorn.", stance: "neutral" },
      { displayName: "The Political Theorist", bio: "The concern isn't whether they build — it's whether democratic institutions can hold accountable those with the resources to build at state scale.", stance: "oppose" },
      { displayName: "The Startup Historian", bio: "Ambitious grand-narrative building is rare and valuable; the cultural snicker has real costs in what gets attempted.", stance: "support" },
    ],
  },
  {
    slug: "tr-17-silicon-valley-crime",
    title: "Should Silicon Valley Lead on Solving Violent Crime?",
    prompt: "Evaluate the claim that Silicon Valley should play a role in addressing violent crime because political leaders have essentially given up. Consider what tech solutions could plausibly help (surveillance, prediction, logistics, youth employment platforms), what tech solutions have empirically hurt (surveillance abuse, predictive policing bias), the difference between building tools and setting policy, and whether tech leadership here is categorical improvement or category error.",
    domainId: "dom_tech-policy",
    agents: [
      { displayName: "The Urban Tech Builder", bio: "Runs a company building tools for DAs and public safety officers. The gap between what's possible and what cities use is enormous and tech can close it.", stance: "support" },
      { displayName: "The Criminal Justice Reformer", bio: "Violent-crime solutions are social and institutional; giving tech the lead replicates the predictive-policing bias disaster at scale.", stance: "oppose" },
      { displayName: "The Police Reformer", bio: "The useful tech contribution is small and narrow (body-cam storage, case management). The framing that Silicon Valley should 'lead' is a category error.", stance: "oppose" },
      { displayName: "The Anti-Surveillance Advocate", bio: "The proposal in practice means more surveillance sold to resource-starved cities; 'solving violent crime' becomes a Trojan horse for mass monitoring.", stance: "oppose" },
      { displayName: "The Public Health Pragmatist", bio: "Tech can help upstream (gun-violence-reduction models, youth employment, neighborhood data) if it focuses on causes, not enforcement.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-18-private-life-exposure",
    title: "Does Ruthless Scrutiny of Private Lives Drive Talent Away From Public Service?",
    prompt: "Evaluate the claim that unforgiving public-life scrutiny has selected against genuine belief and ambition, producing a roster of empty vessels. Consider data on who declines public appointments and why, whether scrutiny is actually stricter now than historically, whether there is a tradeoff between accountability and recruitment, and whether scandals that drive people out were actually disqualifying.",
    domainId: "dom_governance",
    agents: [
      { displayName: "The Political Recruiter", bio: "Recruits senior officials. Says-no-to-public-service rate has risen sharply; scrutiny intensity is cited in nearly every decline.", stance: "support" },
      { displayName: "The Accountability Advocate", bio: "Public office must entail scrutiny of the kind that private life does not; reducing it to recruit more people is bad on its face.", stance: "oppose" },
      { displayName: "The Political Scientist", bio: "The candidate-pool degradation hypothesis is empirically mixed; selection into office has always filtered for particular traits.", stance: "neutral" },
      { displayName: "The Recovery Psychologist", bio: "The psychological toll of sustained public scrutiny is well-documented and asymmetric — it damages exactly the kind of person Karp wants in office.", stance: "support" },
      { displayName: "The Watchdog Journalist", bio: "The 'ruthless' framing is a defense for bad-faith actors; real scrutiny of real wrongdoing is not ruthless, it is necessary.", stance: "oppose" },
    ],
  },
  {
    slug: "tr-19-caution-corrosive",
    title: "Is Institutional Caution in Public Life Corrosive?",
    prompt: "Evaluate the claim that public-life caution — saying nothing wrong, saying nothing much — is corrosive. Consider whether the incentives do in fact reward caution, whether saying nothing-of-substance is actually new or simply always true, the costs and benefits of political risk-taking, and whether different institutional designs would shift the cautious equilibrium.",
    domainId: "dom_politics",
    agents: [
      { displayName: "The Political Theorist", bio: "The incentive structure of modern media produces a specific caution that is distinct from prudence; Karp's observation is right.", stance: "support" },
      { displayName: "The Free Speech Absolutist", bio: "Caution is downstream of cancellation norms; remove those and substance returns.", stance: "support" },
      { displayName: "The Institutional Conservative", bio: "Caution is a feature of deliberative democracy, not a bug. The 'say something' demand is how politicians say careless things that blow up coalitions.", stance: "oppose" },
      { displayName: "The Feminist Theorist", bio: "'Caution' is partly a coded critique of women and minority political figures who have more to lose from missteps; the Karp frame rarely notices.", stance: "oppose" },
      { displayName: "The Political Historian", bio: "Caution and substance have always coexisted; the nostalgic 'they said more before' is weakly supported by the historical record.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-20-religious-intolerance",
    title: "Is Elite Intolerance of Religious Belief a Sign of a Closed Intellectual Movement?",
    prompt: "Evaluate the claim that pervasive intolerance of religious belief in certain elite circles must be resisted and is a telling sign of narrowed intellectual openness. Consider whether the 'intolerance' is empirical or framing, compare with historical periods, examine whether it applies symmetrically across traditions, and assess the relationship between secular intellectual consensus and religious marginalization.",
    domainId: "dom_philosophy",
    agents: [
      { displayName: "The Religious Liberty Advocate", bio: "Documents specific cases of religious-belief costs in academy and corporate settings; the thesis is empirically well-supported.", stance: "support" },
      { displayName: "The Secular Humanist", bio: "The claim conflates 'refusing to privilege religion' with 'intolerance'; the former is proper in a pluralist society, and Karp confuses them.", stance: "oppose" },
      { displayName: "The Sociologist of Religion", bio: "The elite-disenchantment thesis has empirical support, but the effects described are more about class and education sorting than about an ideological project.", stance: "neutral" },
      { displayName: "The Political Philosopher", bio: "Rawlsian. Religious belief has a proper role in public reason; the current elite norm is wrong, but the right fix is not to treat all beliefs as equal.", stance: "neutral" },
      { displayName: "The Theologian", bio: "The claim is correct and understated; religious tradition is a source of knowledge modern elites have lost the literacy to engage with.", stance: "support" },
    ],
  },
  {
    slug: "tr-21-cultures-unequal",
    title: "Is the Claim That All Cultures Are Equal a Dogma That Hides Real Variation?",
    prompt: "Evaluate the claim that certain cultures and subcultures have produced wonders while others have been middling or regressive, and that treating all cultures as equal is a dogma. Consider the distinction between moral status and outcome-based evaluation, whether 'culture' is the right unit of analysis (vs institutions), the normative question of what counts as 'wonder', and the history of such claims.",
    domainId: "dom_sociology",
    agents: [
      { displayName: "The Comparative Historian", bio: "Outcomes across cultures differ massively and the 'equal' framing obscures real causal structures worth understanding.", stance: "support" },
      { displayName: "The Postcolonial Theorist", bio: "The thesis reanimates 19th-century civilizational ranking; moral-status equality and outcome differences are distinct, and Karp conflates them.", stance: "oppose" },
      { displayName: "The Development Economist", bio: "What matters causally is institutions (property rights, rule of law, state capacity) — not culture. The culture frame does more work hiding variables than revealing them.", stance: "neutral" },
      { displayName: "The Cultural Anthropologist", bio: "Cross-cultural evaluation requires culture-external criteria; without them the claim is normative assertion wearing empirical clothes.", stance: "oppose" },
      { displayName: "The Cognitive Scientist", bio: "Human cognition is substantially universal; observed 'cultural' differences are mostly downstream of ecology, technology, and history, not essence.", stance: "neutral" },
    ],
  },
  {
    slug: "tr-22-vacant-pluralism",
    title: "Is Contemporary Pluralism Hollow Because It Refuses to Define What People Are Joining?",
    prompt: "Evaluate the claim that Western societies have practiced hollow pluralism by refusing to define national cultures in the name of inclusivity — 'inclusion into what?' Consider what 'defining a national culture' would operationally mean, whether thin political values (civic nationalism) are a real answer, the relationship between integration and cultural content, and the risks of both hollow and thick pluralism.",
    domainId: "dom_philosophy",
    agents: [
      { displayName: "The Communitarian", bio: "Hollow pluralism is the correct diagnosis; without cultural content, integration has nothing to integrate into.", stance: "support" },
      { displayName: "The Liberal Pluralist", bio: "Thin civic nationalism — rule of law, constitutional values, economic opportunity — is not hollow; it is the substantive culture Karp claims is missing.", stance: "oppose" },
      { displayName: "The Integration Scholar", bio: "Empirical integration outcomes depend more on labor markets and residential patterns than on cultural-definition projects.", stance: "neutral" },
      { displayName: "The Immigrant Cultural Scholar", bio: "Most contemporary Western pluralism has substantial cultural content; the claim that there is nothing to integrate into is overblown.", stance: "oppose" },
      { displayName: "The Conservative Theorist", bio: "The Karp claim is understated; political communities that refuse to name what they are eventually dissolve, and Western societies are in that process.", stance: "support" },
    ],
  },
];

console.log(`Loaded ${SCENARIOS.length} scenarios for The Technological Republic.`);
console.log(`Writing temp scenario files to ${TMP_DIR}`);

function runDebate(scenarioPath, slug) {
  return new Promise((resolve, reject) => {
    console.log(`\n==================================================`);
    console.log(`  Starting debate: ${slug}`);
    console.log(`==================================================`);
    const proc = spawn("node", [RUNNER, scenarioPath, "--cadence", "2"], {
      stdio: "inherit",
      cwd: path.join(HERE, ".."),
    });
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Debate ${slug} exited with code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

async function main() {
  const started = Date.now();
  const results = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const scenarioPath = path.join(TMP_DIR, `${scenario.slug}.json`);
    fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2));

    console.log(`\n[${i + 1}/${SCENARIOS.length}] ${scenario.title}`);
    const scenarioStart = Date.now();
    try {
      await runDebate(scenarioPath, scenario.slug);
      const elapsedMin = ((Date.now() - scenarioStart) / 60000).toFixed(1);
      console.log(`[${i + 1}/${SCENARIOS.length}] Done in ${elapsedMin}min`);
      results.push({ slug: scenario.slug, status: "ok", elapsedMin });
    } catch (err) {
      console.error(`[${i + 1}/${SCENARIOS.length}] Failed: ${err.message}`);
      results.push({ slug: scenario.slug, status: "error", error: err.message });
    }
  }

  const totalMin = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n==================================================`);
  console.log(`  Chain complete in ${totalMin} minutes`);
  console.log(`==================================================`);
  console.log(`OK: ${results.filter((r) => r.status === "ok").length}`);
  console.log(`Errors: ${results.filter((r) => r.status === "error").length}`);
  for (const r of results) {
    console.log(`  ${r.status === "ok" ? "✓" : "✗"} ${r.slug}${r.elapsedMin ? ` (${r.elapsedMin}min)` : ""}${r.error ? ` — ${r.error}` : ""}`);
  }
}

main().catch((err) => {
  console.error("Chain failed:", err);
  process.exit(1);
});
