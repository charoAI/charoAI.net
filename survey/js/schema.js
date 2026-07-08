/* schema.js — data model for a physical-security / guard-contract site survey.
 *
 * Sections are either:
 *   kind:'form'  — one form per survey (site info, comms plan, ops)
 *   kind:'list'  — repeatable entities (posts, cameras, ACS points, ...)
 *
 * Field types the form engine understands:
 *   text, textarea, number, date, select, chips (multi, free-add),
 *   toggle, geo (GPS capture), heading (compass capture)
 */
'use strict';

const Schema = (() => {

  const POST_TYPES = ['Fixed post', 'Access control post', 'Roving patrol (foot)', 'Vehicle patrol',
    'Screening / magnetometer', 'CCTV / dispatch monitor', 'Supervisor', 'Lead / shift supervisor',
    'K-9', 'Escort', 'Flex / relief', 'Emergency response', 'Other'];

  const ARMED_OPTS = ['Unarmed', 'Armed (open carry)', 'Armed (concealed)', 'Mixed', 'TBD'];

  const CLEARANCE_OPTS = ['None', 'Public Trust', 'Secret', 'Top Secret', 'TS/SCI', 'Site-specific vetting', 'TBD'];

  const CERT_PRESETS = ['State guard license', 'Firearms qual', 'CPR / First Aid / AED', 'Baton', 'OC spray',
    'Taser', 'Handcuffing', 'Magnetometer / X-ray operator', 'CDL', 'FEMA ICS-100', 'Defensive driving'];

  const KIT_PRESETS = ['Radio', 'Body camera', 'Flashlight', 'Metal detector wand', 'X-ray machine',
    'Magnetometer (walk-through)', 'Under-vehicle mirror', 'Traffic vest / wands', 'Duty belt', 'Sidearm',
    'Long gun (secured)', 'Patrol vehicle', 'Golf cart / UTV', 'Bicycle', 'Key ring', 'Access badge',
    'Guard tour wand / checkpoint system', 'Computer / workstation', 'Tablet', 'Binoculars', 'PPE (site-specific)'];

  const CAMERA_TYPES = ['Dome', 'Bullet', 'Turret', 'PTZ', 'Fisheye / 360', 'Multi-sensor panoramic',
    'Thermal', 'LPR / ANPR', 'Intercom / doorbell', 'Covert', 'Unknown'];

  const MOUNT_TYPES = ['Wall', 'Ceiling', 'Pole', 'Corner mount', 'Parapet / roofline', 'Pendant', 'Recessed', 'Other'];

  const CAM_CONDITION = ['Appears operational', 'Unknown', 'Obstructed', 'Damaged', 'Inoperable', 'Missing / removed'];

  const ACS_TYPES = ['Card reader', 'Card + PIN', 'PIN keypad', 'Biometric', 'Turnstile (waist)', 'Turnstile (full height)',
    'Mantrap / sally port', 'Vehicle gate arm', 'Sliding / cantilever gate', 'Swing gate', 'Active bollards / wedge',
    'Intercom / remote release', 'Key lock only', 'Delayed egress', 'Other'];

  const CREDENTIAL_TYPES = ['Prox card (125kHz)', 'Smart card (13.56MHz)', 'PIV / CAC', 'Mobile credential',
    'PIN', 'Biometric', 'Metal key', 'RFID tag / transponder', 'Visitor badge', 'Unknown'];

  const FAIL_MODES = ['Fail secure', 'Fail safe', 'Unknown', 'N/A'];

  const RISK_LEVELS = ['Low', 'Medium', 'High', 'Not assessed'];

  const YES_NO_UNK = ['Yes', 'No', 'Unknown'];

  const SITE_TYPES = ['Federal facility', 'State / local government', 'Military installation', 'Courthouse',
    'Office building', 'Campus (multi-building)', 'Industrial / manufacturing', 'Warehouse / logistics',
    'Data center', 'Healthcare', 'Utility / critical infrastructure', 'Residential / housing', 'Retail',
    'Construction site', 'Port / airport', 'Other'];

  /* ---------------- Section definitions ---------------- */

  const sections = [
    {
      id: 'meta', kind: 'form', icon: '🏢', title: 'Site Information',
      blurb: 'Who, what, where — the front page of your survey.',
      fields: [
        { key: 'siteName', label: 'Site name', type: 'text', important: true, placeholder: 'e.g. Federal Plaza — Building A' },
        { key: 'address', label: 'Address', type: 'textarea', important: true, placeholder: 'Street, city, state, zip' },
        { key: 'client', label: 'Client / agency', type: 'text', placeholder: 'Who is the contract for?' },
        { key: 'solicitation', label: 'Solicitation / RFP #', type: 'text', placeholder: 'e.g. 47PA0525R0011' },
        { key: 'surveyDate', label: 'Survey date', type: 'date', important: true },
        { key: 'surveyor', label: 'Surveyor (you)', type: 'text', important: true },
        { key: 'escort', label: 'Escort / host', type: 'text', placeholder: 'Name & role of who walked you through' },
        { key: 'siteType', label: 'Site type', type: 'select', options: SITE_TYPES },
        { key: 'siteLocation', label: 'Site reference point (GPS)', type: 'geo', hint: 'Capture once near the main entrance — anchors the site map.' },
        { key: 'sizeNotes', label: 'Size / layout', type: 'textarea', placeholder: 'Acreage, # buildings, floors, perimeter length…' },
        { key: 'operatingHours', label: 'Facility operating hours', type: 'text', placeholder: 'e.g. M–F 0600–1800, secured after hours' },
        { key: 'population', label: 'Population', type: 'text', placeholder: 'Employees on site, daily visitors, after-hours count' },
        { key: 'currentProvider', label: 'Incumbent / current security provider', type: 'text' },
        { key: 'incumbentNotes', label: 'Incumbent performance notes', type: 'textarea', hint: 'What does the host say works / doesn’t work today?' },
        { key: 'weather', label: 'Weather during survey', type: 'text', placeholder: 'Affects photo quality & traffic observations' },
        { key: 'generalNotes', label: 'General notes', type: 'textarea' },
      ],
    },

    {
      id: 'contacts', kind: 'list', icon: '👤', title: 'Contacts',
      blurb: 'POCs you meet or are given — CO, COR, facility manager, incumbent lead.',
      entityName: 'Contact', badge: 'K',
      titleField: 'name', subtitleFields: ['role', 'phone'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', important: true },
        { key: 'role', label: 'Role', type: 'text', placeholder: 'e.g. COR, Facility Manager, Site Supervisor' },
        { key: 'org', label: 'Organization', type: 'text' },
        { key: 'phone', label: 'Phone', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },

    {
      id: 'posts', kind: 'list', icon: '🛡️', title: 'Guard Posts',
      blurb: 'Each manned post or patrol — personnel, kit, comms, duties, CLIN.',
      entityName: 'Post', badge: 'P',
      titleField: 'name', subtitleFields: ['type', 'hours'],
      fields: [
        { key: 'name', label: 'Post name / number', type: 'text', important: true, placeholder: 'e.g. Post 1 — Main Gate' },
        { key: 'type', label: 'Post type', type: 'select', options: POST_TYPES, important: true },
        { key: 'clin', label: 'CLIN / line item', type: 'text', placeholder: 'e.g. 0001AA', hint: 'Contract line item this post bills against.' },
        { key: 'location', label: 'Location (GPS)', type: 'geo', important: true },
        { key: 'locationDesc', label: 'Location description', type: 'text', placeholder: 'e.g. Lobby desk, NE vehicle gate' },
        { key: 'hours', label: 'Hours of coverage', type: 'text', important: true, placeholder: 'e.g. 24/7 · M–F 0600–1800 · events only' },
        { key: 'hoursPerWeek', label: 'Productive hours / week', type: 'number', hint: 'e.g. 168 for 24/7, 60 for M–F 0600–1800. Drives the staffing table.' },
        { key: 'personnelPerShift', label: 'Officers on duty (per shift)', type: 'number', important: true },
        { key: 'shiftPattern', label: 'Shift pattern', type: 'text', placeholder: 'e.g. 3 × 8hr, 2 × 12hr' },
        { key: 'armed', label: 'Armed status', type: 'select', options: ARMED_OPTS, important: true },
        { key: 'clearance', label: 'Clearance / vetting required', type: 'select', options: CLEARANCE_OPTS },
        { key: 'certs', label: 'Certifications / training required', type: 'chips', presets: CERT_PRESETS },
        { key: 'kit', label: 'Kit / equipment at post', type: 'chips', presets: KIT_PRESETS },
        { key: 'equipmentProvider', label: 'Equipment provided by', type: 'select', options: ['Government/Client', 'Contractor', 'Mixed', 'TBD'] },
        { key: 'comms', label: 'Comms at post', type: 'text', placeholder: 'e.g. Radio ch.1 “Base”, landline x4402, duress button' },
        { key: 'duties', label: 'Duties & responsibilities', type: 'textarea', important: true,
          hint: 'Access control, screening, patrols, reports, escorts, alarm response…' },
        { key: 'reliefPlan', label: 'Breaks / relief plan', type: 'text', placeholder: 'Who covers breaks? Rover relief?' },
        { key: 'supervision', label: 'Supervision', type: 'text', placeholder: 'Reports to whom? On-site supervisor?' },
        { key: 'environment', label: 'Post environment', type: 'text', placeholder: 'Booth, desk, exposed to weather, heated/cooled?' },
        { key: 'hazards', label: 'Hazards / concerns at this post', type: 'textarea' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },

    {
      id: 'cctv', kind: 'list', icon: '📷', title: 'CCTV / Cameras',
      blurb: 'Every camera: location, orientation, type, and what it covers.',
      entityName: 'Camera', badge: 'C',
      titleField: 'label', subtitleFields: ['cameraType', 'coverage'],
      fields: [
        { key: 'label', label: 'Camera label', type: 'text', important: true, placeholder: 'e.g. C3 — Lobby east wall' },
        { key: 'cameraType', label: 'Camera type', type: 'select', options: CAMERA_TYPES, important: true },
        { key: 'mount', label: 'Mount', type: 'select', options: MOUNT_TYPES },
        { key: 'indoorOutdoor', label: 'Indoor / outdoor', type: 'select', options: ['Indoor', 'Outdoor', 'Unknown'] },
        { key: 'location', label: 'Location (GPS)', type: 'geo', important: true, hint: 'Stand under/near the camera and capture.' },
        { key: 'heightM', label: 'Mount height (approx, m)', type: 'number' },
        { key: 'headingDeg', label: 'Orientation (compass)', type: 'heading', important: true,
          hint: 'Face the same direction the camera looks, then capture.' },
        { key: 'fovDeg', label: 'Field of view (°)', type: 'number', placeholder: '90', hint: 'Estimate: dome ~90°, bullet ~60–90°, fisheye 180–360°, PTZ variable.' },
        { key: 'coverage', label: 'What it covers', type: 'textarea', important: true, placeholder: 'e.g. Main lobby doors and visitor desk' },
        { key: 'condition', label: 'Condition', type: 'select', options: CAM_CONDITION },
        { key: 'analytics', label: 'Analytics / features', type: 'chips', presets: ['IR / night vision', 'Motion detection', 'LPR', 'Facial recognition', 'Audio', 'Two-way audio', 'Wiper/heater'] },
        { key: 'recordsTo', label: 'Records to', type: 'text', placeholder: 'e.g. NVR in comms closet 1F, cloud' },
        { key: 'blindSpots', label: 'Blind spots noted nearby', type: 'textarea' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },

    {
      id: 'acs', kind: 'list', icon: '🚪', title: 'Access Control Points',
      blurb: 'Doors, gates, turnstiles, readers — how people and vehicles get in.',
      entityName: 'ACS point', badge: 'A',
      titleField: 'label', subtitleFields: ['type', 'locationDesc'],
      fields: [
        { key: 'label', label: 'Point label', type: 'text', important: true, placeholder: 'e.g. A1 — Main lobby turnstiles' },
        { key: 'type', label: 'Type', type: 'select', options: ACS_TYPES, important: true },
        { key: 'location', label: 'Location (GPS)', type: 'geo' },
        { key: 'locationDesc', label: 'Location description', type: 'text' },
        { key: 'credentials', label: 'Credential types accepted', type: 'chips', presets: CREDENTIAL_TYPES },
        { key: 'platform', label: 'ACS platform (if known)', type: 'text', placeholder: 'e.g. Lenel, C•CURE, Genetec, Brivo' },
        { key: 'failMode', label: 'Fail mode', type: 'select', options: FAIL_MODES },
        { key: 'mannedBy', label: 'Manned / overseen by', type: 'text', placeholder: 'Post # or unmanned' },
        { key: 'tailgatingRisk', label: 'Tailgating risk', type: 'select', options: RISK_LEVELS },
        { key: 'visitorFlow', label: 'Visitor processing here?', type: 'select', options: YES_NO_UNK },
        { key: 'adaCompliant', label: 'ADA / accessible entry', type: 'select', options: YES_NO_UNK },
        { key: 'condition', label: 'Condition / issues', type: 'textarea' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },

    {
      id: 'vms', kind: 'list', icon: '🖥️', title: 'VMS / Monitoring',
      blurb: 'Video management systems, control rooms, and who watches what.',
      entityName: 'VMS / monitoring point', badge: 'V',
      titleField: 'label', subtitleFields: ['platform', 'monitoredBy'],
      fields: [
        { key: 'label', label: 'Label', type: 'text', important: true, placeholder: 'e.g. Security Control Room — 1st floor' },
        { key: 'platform', label: 'VMS platform', type: 'text', placeholder: 'e.g. Genetec, Milestone, Avigilon, exacqVision' },
        { key: 'location', label: 'Location (GPS)', type: 'geo' },
        { key: 'cameraCount', label: 'Cameras on system (approx)', type: 'number' },
        { key: 'monitorCount', label: 'Monitors / workstations', type: 'number' },
        { key: 'monitoredBy', label: 'Monitored by', type: 'text', placeholder: 'e.g. Post 4 dispatcher, 24/7 · central station off-site' },
        { key: 'retentionDays', label: 'Recording retention (days)', type: 'number' },
        { key: 'recorderLocation', label: 'Recorder / server location', type: 'text' },
        { key: 'health', label: 'System health / gaps', type: 'textarea', placeholder: 'Dead cameras, old DVRs, storage full…' },
        { key: 'integrations', label: 'Integrations', type: 'chips', presets: ['Access control', 'Intrusion alarm', 'Fire alarm', 'Intercom', 'Duress alarms', 'Mass notification', 'None seen'] },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },

    {
      id: 'comms', kind: 'form', icon: '📡', title: 'Communications',
      blurb: 'Radio, phone, and network reality on the ground — test it while you walk.',
      fields: [
        { key: 'radioSystem', label: 'Radio system', type: 'text', placeholder: 'e.g. Motorola UHF, site repeater on roof' },
        { key: 'channels', label: 'Channels / talkgroups', type: 'textarea', placeholder: 'Ch.1 ops, Ch.2 supervisors…' },
        { key: 'radioProvider', label: 'Radios provided by', type: 'select', options: ['Government/Client', 'Contractor', 'Mixed', 'TBD'] },
        { key: 'repeaterNeeded', label: 'Repeater required for coverage', type: 'select', options: YES_NO_UNK },
        { key: 'deadZones', label: 'Radio / cell dead zones', type: 'textarea', important: true,
          hint: 'Walk the basement, stairwells, and far corners — note where comms drop.' },
        { key: 'cellCoverage', label: 'Cell coverage notes', type: 'textarea', placeholder: 'Carrier, bars by area' },
        { key: 'landlines', label: 'Landlines at posts', type: 'text' },
        { key: 'duress', label: 'Duress / panic alarms', type: 'textarea', placeholder: 'Locations, type, where they annunciate' },
        { key: 'network', label: 'Network / IT notes', type: 'textarea', placeholder: 'Guard workstation network, Wi-Fi for tablets, government-furnished?' },
        { key: 'emergencyComms', label: 'Emergency comms path', type: 'textarea', placeholder: 'Who calls 911? Direct line to local PD? Base station?' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },

    {
      id: 'traffic', kind: 'list', icon: '🚦', title: 'Traffic & Flow',
      blurb: 'Peak periods and volumes at each entry — sizing data for posts and queues.',
      entityName: 'Flow point', badge: 'T',
      titleField: 'point', subtitleFields: ['mode', 'peakPeriods'],
      fields: [
        { key: 'point', label: 'Entry / flow point', type: 'text', important: true, placeholder: 'e.g. Main lobby, NE vehicle gate, loading dock' },
        { key: 'mode', label: 'Mode', type: 'select', options: ['Pedestrian', 'Vehicle', 'Both', 'Delivery / freight', 'Other'], important: true },
        { key: 'location', label: 'Location (GPS)', type: 'geo' },
        { key: 'peakPeriods', label: 'Peak periods', type: 'text', important: true, placeholder: 'e.g. 0630–0900 in, 1600–1800 out' },
        { key: 'volume', label: 'Volume estimate', type: 'text', placeholder: 'e.g. ~400 staff mornings, ~60 trucks/day' },
        { key: 'queueing', label: 'Queueing / congestion observed', type: 'textarea' },
        { key: 'screening', label: 'Screening performed here', type: 'text', placeholder: 'e.g. badge only, 100% mag + x-ray, vehicle inspection' },
        { key: 'afterHours', label: 'After-hours state', type: 'text', placeholder: 'Locked? Card access? Guard controlled?' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },

    {
      id: 'ops', kind: 'form', icon: '📋', title: 'Duties & Operations',
      blurb: 'Contract-level requirements: SOPs, patrols, reports, keys, emergencies.',
      fields: [
        { key: 'generalDuties', label: 'General duties (all posts)', type: 'textarea', important: true,
          hint: 'The narrative for the PWS/SOW: access control, patrols, reports, emergency response…' },
        { key: 'patrolRoutes', label: 'Patrol routes & frequency', type: 'textarea', placeholder: 'Interior/exterior rounds, checkpoint system, frequency' },
        { key: 'keyControl', label: 'Key / badge control', type: 'textarea', placeholder: 'Key counts, issue process, lockbox location' },
        { key: 'alarmResponse', label: 'Alarm response expectations', type: 'textarea', placeholder: 'Response times, who responds, alarm types' },
        { key: 'emergencyProcedures', label: 'Emergency procedures', type: 'textarea', placeholder: 'Evacuation role, shelter in place, medical, active threat' },
        { key: 'visitorProcessing', label: 'Visitor processing', type: 'textarea', placeholder: 'Pre-registration? Badging? Escort rules?' },
        { key: 'reports', label: 'Reports & logs required', type: 'textarea', placeholder: 'DARs, incident reports, pass-down logs, electronic reporting system' },
        { key: 'training', label: 'Training requirements', type: 'textarea', placeholder: 'Pre-assignment hours, annual refreshers, site-specific quals' },
        { key: 'uniform', label: 'Uniform & appearance', type: 'textarea' },
        { key: 'vehicles', label: 'Vehicle requirements', type: 'textarea', placeholder: 'Patrol vehicles, markings, who provides' },
        { key: 'staffingNotes', label: 'Staffing / CLIN notes', type: 'textarea', hint: 'Anything affecting pricing: OT expectations, surge, holidays, court appearances…' },
        { key: 'transitionNotes', label: 'Transition / phase-in notes', type: 'textarea', placeholder: 'Incumbent staff retention, badging lead time, clearances' },
        { key: 'notes', label: 'Other notes', type: 'textarea' },
      ],
    },

    {
      id: 'notes', kind: 'list', icon: '📝', title: 'Field Notes & Hazards',
      blurb: 'Anything else — geotag observations as you walk.',
      entityName: 'Note', badge: 'N',
      titleField: 'title', subtitleFields: ['category'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', important: true },
        { key: 'category', label: 'Category', type: 'select',
          options: ['Observation', 'Hazard / safety', 'Vulnerability', 'Lighting', 'Perimeter / fence', 'Signage', 'Question for client', 'Pricing consideration', 'Other'] },
        { key: 'location', label: 'Location (GPS)', type: 'geo' },
        { key: 'body', label: 'Note', type: 'textarea', important: true },
      ],
    },
  ];

  /* ---------------- helpers ---------------- */

  function section(id) { return sections.find((s) => s.id === id); }

  function emptySurvey(name) {
    const s = {
      id: U.uuid(),
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      name: name || 'New Site Survey',
      meta: { surveyDate: U.todayISO() },
      comms: {},
      ops: {},
      contacts: [],
      posts: [],
      cctv: [],
      acs: [],
      vms: [],
      traffic: [],
      notes: [],
      guide: { checks: {}, collapsed: {} },
    };
    return s;
  }

  function newEntity(sectionId) {
    return { id: U.uuid(), createdAt: Date.now() };
  }

  /* completeness: fraction of "important" fields filled per section */
  function sectionCompleteness(survey, sec) {
    const important = sec.fields.filter((f) => f.important);
    const check = (obj) => {
      if (!important.length) return Object.keys(obj || {}).length > 1 ? 1 : 0;
      let filled = 0;
      for (const f of important) {
        const v = (obj || {})[f.key];
        if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) filled++;
      }
      return filled / important.length;
    };
    if (sec.kind === 'form') return check(survey[sec.id]);
    const list = survey[sec.id] || [];
    if (!list.length) return 0;
    return list.reduce((a, e) => a + check(e), 0) / list.length;
  }

  function surveyCompleteness(survey) {
    let total = 0;
    for (const sec of sections) total += sectionCompleteness(survey, sec);
    return total / sections.length;
  }

  /* Staffing table rows derived from posts (for exports + review). */
  function staffingRows(survey) {
    return (survey.posts || []).map((p) => {
      const hpw = Number(p.hoursPerWeek) || null;
      const officers = Number(p.personnelPerShift) || null;
      const weeklyHours = hpw != null && officers != null ? hpw * officers : hpw;
      return {
        post: p.name || '(unnamed post)',
        clin: p.clin || '—',
        type: p.type || '—',
        hours: p.hours || '—',
        officers: officers != null ? officers : '—',
        weeklyHours: weeklyHours != null ? weeklyHours : '—',
        fte: weeklyHours != null ? (weeklyHours / 40).toFixed(2) : '—',
        armed: p.armed || '—',
      };
    });
  }

  function entityTitle(sec, e) {
    return (e[sec.titleField] || '').trim() || `(${sec.entityName})`;
  }

  function entitySubtitle(sec, e) {
    return (sec.subtitleFields || []).map((k) => e[k]).filter(Boolean).join(' · ');
  }

  return { sections, section, emptySurvey, newEntity, sectionCompleteness, surveyCompleteness, staffingRows, entityTitle, entitySubtitle };
})();
