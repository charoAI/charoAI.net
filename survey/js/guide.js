/* guide.js — the guided walkthrough. Ten phases that take a surveyor of any
 * experience level through a complete prebid security site survey. Each phase
 * has: why it matters, field tips, questions to ask the host, a checklist
 * (persisted per survey), and deep links into the right editors.
 *
 * Action targets are resolved by app.js:
 *   {section:'posts'}            -> open section list
 *   {section:'posts', add:true}  -> jump straight into a new entity form
 *   {capture:true}               -> open the capture tab
 */
'use strict';

const Guide = (() => {

  const phases = [
    {
      id: 'prep', num: 1, title: 'Before You Walk',
      time: '10 min — do this in the parking lot or lobby',
      why: 'Five minutes of setup makes every photo and pin you capture usable later. A survey with no site name, date, or POCs is just a camera roll.',
      tips: [
        '<b>Fill in Site Information first</b> — site name, date, your name, and the escort. Capture the site reference point (GPS) near the main entrance; it anchors the site map.',
        '<b>Ask for a site map or floor plan</b> before you start walking. Photograph it if they have one posted — evacuation maps in lobbies are gold.',
        '<b>Enable GPS and compass</b> using the pills in the header. On iPhone you must tap “Enable compass” and accept the motion permission.',
        '<b>Confirm the photo policy.</b> Some facilities restrict photography — ask the escort what you may shoot, and note any restrictions in General Notes.',
      ],
      ask: [
        'What prompted this solicitation — new requirement, or re-compete?',
        'Who is the incumbent, and what do you wish they did better?',
        'Are there any areas we cannot access or photograph today?',
        'Can I get a copy of the current post orders or PWS?',
      ],
      checklist: [
        'Site information section filled in',
        'Site reference point (GPS) captured',
        'Compass enabled and reading sanely',
        'Photo policy confirmed with escort',
        'Site map / floor plan obtained or photographed',
        'Escort and POCs added to Contacts',
      ],
      actions: [
        { label: 'Open Site Information', target: { section: 'meta' } },
        { label: 'Add a contact', target: { section: 'contacts', add: true } },
      ],
    },

    {
      id: 'approach', num: 2, title: 'Arrival & Approach',
      time: '10–15 min',
      why: 'The approach is what an adversary — and every visitor — sees first. Signage, queuing, and sightlines here shape the access-control story you will tell in the proposal.',
      tips: [
        'Photograph the <b>main entrance from the street</b> — wide shot first, then details. The stamp bar records where you stood and which way you faced.',
        'Capture <b>signage</b>: facility name, restricted-area warnings, “no photography”, visitor parking directions.',
        'Note <b>vehicle queuing space</b> at gates: how many cars fit before traffic backs into the road?',
        'Shoot <b>parking areas</b> and note if they are controlled (gate arm, permit, open).',
      ],
      ask: [
        'Where do visitors vs. employees enter?',
        'Where do deliveries stage?',
        'Any recurring issues at the entrance — protests, trespassers, homeless encampments, traffic?',
      ],
      checklist: [
        'Main entrance photographed from outside',
        'All public approach routes photographed',
        'Signage photographed',
        'Parking areas noted and photographed',
        'Visitor vs. employee entry flow understood',
      ],
      actions: [
        { label: 'Open camera', target: { capture: true } },
        { label: 'Add a field note', target: { section: 'notes', add: true } },
      ],
    },

    {
      id: 'perimeter', num: 3, title: 'Perimeter Walk',
      time: '20–40 min depending on site size',
      why: 'Walk the entire perimeter if allowed. Fence condition, lighting, and blind spots determine patrol requirements — and they are the first thing a technical evaluator checks your proposal against.',
      tips: [
        'Photograph <b>each fence line</b> and any damage, gaps, washouts, or climb aids (pallets, dumpsters, trees against the fence).',
        'Capture <b>every perimeter gate</b> — even the welded-shut ones. Note how each is secured (chain, padlock, card reader, unmanned).',
        'Look up: note <b>exterior lighting</b> positions and dead spots. If you can revisit at night, do; otherwise ask the escort about dark areas.',
        'Note <b>natural surveillance blockers</b>: vegetation, berms, parked trailers, blind corners.',
        'Drop a <b>geotagged field note</b> at every deficiency — the map will show clusters.',
      ],
      ask: [
        'How often is the perimeter patrolled today, and by vehicle or foot?',
        'Any history of breaches, cuts, or jumpers?',
        'Who maintains the fence and lighting — does that fall to security to report?',
      ],
      checklist: [
        'Full perimeter walked (or driven)',
        'All perimeter gates documented',
        'Fence/wall condition photographed',
        'Lighting assessed (or night visit planned)',
        'Blind spots and vulnerabilities noted with GPS',
      ],
      actions: [
        { label: 'Open camera', target: { capture: true } },
        { label: 'Add a field note', target: { section: 'notes', add: true } },
      ],
    },

    {
      id: 'acs', num: 4, title: 'Entry Points & Access Control',
      time: '20–30 min',
      why: 'Every door, gate, and turnstile is a line item in your staffing math: manned or unmanned, screened or badge-only. Get each one on the record.',
      tips: [
        'Create an <b>ACS point</b> for every controlled entry: lobby turnstiles, employee doors, vehicle gates, loading dock, roof access if shown.',
        'Photograph the <b>reader hardware</b> up close (type/brand) and the <b>door from both sides</b>.',
        'Watch for <b>tailgating</b> during a shift change if you can — rate the risk honestly.',
        'Note <b>credential types</b> (prox, PIV/CAC, PIN, keys) and who issues them.',
        'Ask about <b>fail mode</b> on powered doors and gates — fail-secure vs fail-safe changes emergency procedures.',
      ],
      ask: [
        'What ACS platform runs these readers (Lenel, C•CURE, Genetec…)?',
        'Who administers badges — facility staff or the guard force?',
        'What happens when the system goes down? Manual procedures?',
        'How are visitors badged and are escorts required?',
      ],
      checklist: [
        'Every controlled entry documented as an ACS point',
        'Reader hardware photographed',
        'Credential types recorded',
        'Visitor processing flow documented',
        'ACS platform / administrator identified',
      ],
      actions: [
        { label: 'Add ACS point', target: { section: 'acs', add: true } },
        { label: 'Review ACS list', target: { section: 'acs' } },
      ],
    },

    {
      id: 'posts', num: 5, title: 'Guard Posts',
      time: '10 min per post — the core of the survey',
      why: 'Posts are the product. Everything you price — hours, headcount, kit, quals — hangs off the post list. Document existing posts and note where the government’s requirement implies new ones.',
      tips: [
        'At each post, capture the <b>location pin</b>, then shoot <b>four photos facing N/E/S/W</b> from the officer’s position — the classic way to show what a post can and cannot see.',
        'Record <b>hours of coverage</b> and <b>officers per shift</b> — this drives the staffing table and CLIN mapping automatically.',
        'Inventory the <b>kit</b> at the post (radio, wand, x-ray, workstation) and note <b>who provides it</b> — government-furnished vs contractor-furnished changes your price.',
        'Write <b>duties in plain language</b>: “Controls vehicle gate, checks IDs against access roster, inspects commercial vehicles, dispatches rover.”',
        'Note the <b>environment</b>: booth with HVAC? Exposed? That affects uniforms, relief cycles, and retention.',
        'Ask how <b>breaks and relief</b> work today — unrelieved 12-hour fixed posts are a red flag worth writing down.',
      ],
      ask: [
        'Which posts are 24/7 vs business hours? Weekend differences?',
        'What does the current post order require at each post?',
        'Any posts they want added, moved, or eliminated?',
        'Armed or unarmed at each post — and any local licensing quirks?',
        'Overtime patterns? Surge requirements (events, elevated threat)?',
      ],
      checklist: [
        'Every existing post documented',
        'Location pin captured at each post',
        'Cardinal-direction photos taken at key posts',
        'Hours + officers per shift recorded (staffing math)',
        'Kit and equipment provider recorded',
        'Duties written for each post',
        'CLIN assigned or noted for each post',
      ],
      actions: [
        { label: 'Add guard post', target: { section: 'posts', add: true } },
        { label: 'Review posts', target: { section: 'posts' } },
        { label: 'Open camera', target: { capture: true } },
      ],
    },

    {
      id: 'cctv', num: 6, title: 'CCTV Sweep',
      time: '20–40 min',
      why: 'Camera count, coverage, and health tell you how much technology can offset manpower — and whether “monitor CCTV” is a real duty or a fiction. Orientation stamps make your coverage map credible.',
      tips: [
        'Log <b>each camera</b>: stand near it, capture its GPS, then <b>face the direction the lens points and capture the heading</b> — the map will draw its field-of-view wedge.',
        'Photograph the camera itself (type is obvious from the housing: dome, bullet, PTZ, fisheye).',
        'Note <b>condition</b> honestly: obstructed by growth, sun-blinded, hanging by the cable — evaluators love a contractor who saw what’s really there.',
        'Record <b>what each camera covers</b> in one sentence.',
        'You do not need every interior camera on a big site — prioritize perimeter, entrances, lobbies, docks, and anything covering guard posts.',
      ],
      ask: [
        'How many cameras total, and how many actually work?',
        'Who watches them, when, and where?',
        'Any coverage gaps they already know about?',
        'Plans to upgrade or expand the system during this contract?',
      ],
      checklist: [
        'Perimeter and entrance cameras logged with orientation',
        'Camera types and condition recorded',
        'Coverage described per camera',
        'Known dead cameras / gaps noted',
      ],
      actions: [
        { label: 'Add camera', target: { section: 'cctv', add: true } },
        { label: 'Review cameras', target: { section: 'cctv' } },
        { label: 'View coverage map', target: { map: true } },
      ],
    },

    {
      id: 'control', num: 7, title: 'Control Room, VMS & Comms',
      time: '15–20 min',
      why: 'The control room is where the contract’s nervous system lives. VMS platform, retention, alarm annunciation, and radio coverage all become technical-approach paragraphs.',
      tips: [
        'Document the <b>VMS / monitoring point</b>: platform, camera count on the wall, retention days, who staffs it and when.',
        'Photograph the <b>monitor wall and consoles</b> (ask first — control rooms are often sensitive).',
        'Fill in the <b>Communications</b> section as you go: radio system, channels, repeater, landlines, duress alarms and where they annunciate.',
        '<b>Test comms while you walk</b> — note dead zones in basements, stairwells, and far corners of the property. Ask to key a radio if offered.',
        'Ask what <b>alarms land here</b>: intrusion, duress, fire, door-forced — and what the response expectation is.',
      ],
      ask: [
        'What VMS platform and how long is video retained?',
        'Radio system: who provides radios, is there a repeater, any dead zones?',
        'Where do duress alarms annunciate and who responds?',
        'Is there an off-site central station or after-hours monitoring?',
      ],
      checklist: [
        'VMS / monitoring point documented',
        'Retention and camera counts recorded',
        'Radio system and channels documented',
        'Dead zones tested / asked about',
        'Duress alarm locations and annunciation recorded',
      ],
      actions: [
        { label: 'Add VMS / monitoring point', target: { section: 'vms', add: true } },
        { label: 'Open Communications', target: { section: 'comms' } },
      ],
    },

    {
      id: 'traffic', num: 8, title: 'Traffic & Operational Tempo',
      time: '10–15 min + observation',
      why: 'Peak flow determines post sizing: one officer cannot screen 400 people arriving between 0630 and 0800. Real numbers here separate your proposal from guesswork.',
      tips: [
        'Create a <b>flow point</b> for each entrance that moves people, vehicles, or freight.',
        'Get <b>peak periods and volumes</b> from the escort — shift changes, visitor rushes, delivery windows, court days, event days.',
        'If you are on site during a peak, <b>time the queue</b>: people per minute through the lobby, cars per light cycle at the gate.',
        'Ask about <b>after-hours state</b> for each entrance: locked, card access, guard controlled.',
      ],
      ask: [
        'What are peak arrival/departure windows and rough headcounts?',
        'How many trucks/deliveries per day and where do they check in?',
        'Special events, court schedules, or seasonal surges that change staffing?',
      ],
      checklist: [
        'Flow point created per active entrance',
        'Peak periods and volumes recorded',
        'Delivery/freight flow documented',
        'After-hours entrance states recorded',
      ],
      actions: [
        { label: 'Add flow point', target: { section: 'traffic', add: true } },
      ],
    },

    {
      id: 'requirements', num: 9, title: 'Duties, CLINs & Requirements',
      time: '15 min — sit down with the escort if possible',
      why: 'This is where the walk becomes a bid. Tie every post to a CLIN, capture contract-level duties, and collect the pricing landmines (OT, training hours, GFE) while someone can still answer questions.',
      tips: [
        'Fill in <b>Duties & Operations</b>: general duties, patrols, reports, key control, emergency procedures, training, uniforms, vehicles.',
        'In each post, make sure <b>CLIN</b> and <b>productive hours/week</b> are set — the staffing table in your exports computes weekly hours and FTEs from them.',
        'Capture <b>transition intel</b>: incumbent staff quality, badging lead time, clearance processing time — phase-in plans win points.',
        'Note anything that affects <b>price</b>: government-furnished equipment, holidays worked, court appearances, surge language.',
      ],
      ask: [
        'Can we see the current post orders / PWS / QASP?',
        'What reports does the COR expect and in what system?',
        'Pre-assignment and annual training hour requirements?',
        'What has caused deductions or CARs for the incumbent?',
      ],
      checklist: [
        'Duties & Operations section completed',
        'Every post has a CLIN (or a note why not)',
        'Every post has productive hours/week set',
        'Training and reporting requirements captured',
        'Pricing considerations noted',
      ],
      actions: [
        { label: 'Open Duties & Operations', target: { section: 'ops' } },
        { label: 'Review posts / CLINs', target: { section: 'posts' } },
      ],
    },

    {
      id: 'wrapup', num: 10, title: 'Wrap-Up & Debrief',
      time: '10 min before you leave the site',
      why: 'Gaps found in the parking lot are free to fix. Gaps found at your desk cost a follow-up email to a contracting officer.',
      tips: [
        'Run the <b>completeness meter</b> on the Survey tab — anything under ~70% deserves a second look before you leave.',
        'Check the <b>site map</b>: do the pins look right? Any post or camera obviously missing?',
        'Ask the escort your <b>open questions</b> now — check your Field Notes for “Question for client” entries.',
        'Thank the escort and confirm <b>follow-up channels</b> for questions during proposal prep.',
        'Back at the truck: <b>export a JSON backup</b> and, if configured, <b>sync to your home machine</b> before you drive away.',
      ],
      ask: [
        'Anything about this site we have not covered that bidders usually miss?',
        'Best way to submit follow-up questions?',
      ],
      checklist: [
        'Completeness reviewed on Survey tab',
        'Site map pins sanity-checked',
        'Open questions asked and answered',
        'JSON backup exported or synced to home machine',
      ],
      actions: [
        { label: 'Review survey sections', target: { survey: true } },
        { label: 'View site map', target: { map: true } },
        { label: 'Go to Export & Sync', target: { exportTab: true } },
      ],
    },
  ];

  function phaseProgress(survey, phase) {
    const checks = (survey.guide && survey.guide.checks) || {};
    const done = phase.checklist.filter((_, i) => checks[`${phase.id}:${i}`]).length;
    return { done, total: phase.checklist.length };
  }

  return { phases, phaseProgress };
})();
