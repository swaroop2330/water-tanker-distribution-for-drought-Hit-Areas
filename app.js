/**
 * ═══════════════════════════════════════════════════════════════
 * AquaRoute — Water Tanker Distribution Scheduler
 * 
 * Architecture:
 *   - OOP Models: Locality, Tanker, Schedule, PriorityQueue
 *   - Algorithm: Greedy + Max-Priority-Queue for optimal allocation
 *   - Score Formula: (Severity×3) + (DaysWithoutWater×2) +
 *                    (Population/10000) + SpecialNeedsBonus
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ════════════════════════════════════════════════════
   1. DATA MODELS (OOP)
════════════════════════════════════════════════════ */

/**
 * Represents a water-stressed locality (village/town)
 */
class Locality {
  static #nextId = 1;

  constructor({ name, population, severity, distanceKm = 10, daysWithoutWater = 0, specialNeeds = '' }) {
    this.id = Locality.#nextId++;
    this.name = name;
    this.population = parseInt(population);
    this.severity = parseInt(severity);            // 1–10
    this.distanceKm = parseFloat(distanceKm) || 10;
    this.daysWithoutWater = parseInt(daysWithoutWater) || 0;
    this.specialNeeds = specialNeeds.trim();
    this.mapX = Math.random();   // normalized position [0,1]
    this.mapY = Math.random();
    this.assignedTrips = [];
    this.createdAt = new Date();
  }

  /** Daily water demand: 5 L/person/day (WHO minimum) */
  get dailyDemandLitres() {
    return this.population * 5;
  }

  /** Special needs bonus for scoring */
  get specialNeedsBonus() {
    const kw = ['hospital', 'school', 'elderly', 'child', 'infant', 'clinic', 'medical'];
    const text = this.specialNeeds.toLowerCase();
    return kw.some(k => text.includes(k)) ? 5 : 0;
  }

  /**
   * Composite priority score (higher = more urgent)
   * Formula: (Severity×3) + (DaysWithoutWater×2) + (Population/10000) + SpecialNeedsBonus
   */
  get priorityScore() {
    return (this.severity * 3)
      + (this.daysWithoutWater * 2)
      + (this.population / 10000)
      + this.specialNeedsBonus;
  }

  get severityLabel() {
    if (this.severity >= 9) return 'critical';
    if (this.severity >= 7) return 'high';
    if (this.severity >= 4) return 'medium';
    return 'low';
  }

  get populationFormatted() {
    if (this.population >= 100000) return (this.population / 1000).toFixed(0) + 'K';
    if (this.population >= 1000) return (this.population / 1000).toFixed(1) + 'K';
    return this.population.toString();
  }

  toJSON() {
    return {
      id: this.id, name: this.name, population: this.population,
      severity: this.severity, distanceKm: this.distanceKm,
      daysWithoutWater: this.daysWithoutWater, specialNeeds: this.specialNeeds,
      priorityScore: this.priorityScore.toFixed(2), severityLabel: this.severityLabel,
    };
  }
}

/**
 * Represents a water tanker vehicle
 */
class Tanker {
  static #nextId = 1;

  constructor({ tankerId, capacityLitres, maxTripsPerDay, driverName = 'Unassigned', status = 'available' }) {
    this.internalId = Tanker.#nextId++;
    this.tankerId = tankerId || `TK-${String(this.internalId).padStart(2, '0')}`;
    this.capacityLitres = parseInt(capacityLitres);
    this.maxTripsPerDay = parseInt(maxTripsPerDay);
    this.driverName = driverName;
    this.status = status; // 'available' | 'deployed' | 'maintenance'
    this.tripsUsedToday = 0;
    this.assignedRoutes = [];
  }

  get isAvailable() { return this.status === 'available' && this.tripsUsedToday < this.maxTripsPerDay; }
  get tripsRemaining() { return Math.max(0, this.maxTripsPerDay - this.tripsUsedToday); }
  get utilizationPct() { return Math.round((this.tripsUsedToday / this.maxTripsPerDay) * 100); }
  get capacityFormatted() {
    return this.capacityLitres >= 1000 ? (this.capacityLitres / 1000).toFixed(0) + 'K L' : this.capacityLitres + ' L';
  }

  assignTrip(locality) {
    if (!this.isAvailable) throw new Error(`Tanker ${this.tankerId} has no trips remaining.`);
    this.tripsUsedToday++;
    const route = { locality, litresDelivered: this.capacityLitres, tanker: this };
    this.assignedRoutes.push(route);
    return route;
  }

  resetDay() {
    this.tripsUsedToday = 0;
    this.assignedRoutes = [];
  }

  toJSON() {
    return {
      tankerId: this.tankerId, capacityLitres: this.capacityLitres,
      maxTripsPerDay: this.maxTripsPerDay, driverName: this.driverName,
      status: this.status, tripsUsedToday: this.tripsUsedToday,
      utilizationPct: this.utilizationPct,
    };
  }
}

/**
 * Max-Heap Priority Queue (by priorityScore)
 * O(log n) push/pop — the core of our scheduling algorithm
 */
class PriorityQueue {
  constructor() { this._heap = []; }

  get size() { return this._heap.length; }
  get isEmpty() { return this._heap.length === 0; }

  push(locality) {
    this._heap.push(locality);
    this._bubbleUp(this._heap.length - 1);
  }

  pop() {
    if (this.isEmpty) return null;
    const top = this._heap[0];
    const last = this._heap.pop();
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  peek() { return this._heap[0] || null; }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this._heap[parent].priorityScore < this._heap[i].priorityScore) {
        [this._heap[parent], this._heap[i]] = [this._heap[i], this._heap[parent]];
        i = parent;
      } else break;
    }
  }

  _siftDown(i) {
    const n = this._heap.length;
    while (true) {
      let largest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._heap[l].priorityScore > this._heap[largest].priorityScore) largest = l;
      if (r < n && this._heap[r].priorityScore > this._heap[largest].priorityScore) largest = r;
      if (largest !== i) {
        [this._heap[largest], this._heap[i]] = [this._heap[i], this._heap[largest]];
        i = largest;
      } else break;
    }
  }

  toSortedArray() {
    const copy = [...this._heap];
    const result = [];
    const clone = new PriorityQueue();
    clone._heap = [...this._heap];
    while (!clone.isEmpty) result.push(clone.pop());
    return result;
  }
}

/**
 * Greedy Scheduler — assigns tanker trips to localities in priority order
 * Time complexity: O(n log n) — sorting/heap operations
 * Space complexity: O(n + m) — n localities + m tankers
 */
class GreedyScheduler {
  constructor(localities, tankers) {
    this.localities = localities;
    this.tankers = tankers.filter(t => t.status === 'available');
    this.schedule = new DistributionSchedule();
  }

  run() {
    // 1. Reset all tanker trip counts
    this.tankers.forEach(t => t.resetDay());
    this.localities.forEach(l => l.assignedTrips = []);

    // 2. Build max-priority-queue from localities
    const pq = new PriorityQueue();
    this.localities.forEach(l => pq.push(l));

    // 3. Create a circular pool of available tankers sorted by trips remaining
    const availableTankers = [...this.tankers].sort((a, b) => b.maxTripsPerDay - a.maxTripsPerDay);

    let tripRank = 1;

    // 4. Greedy: pop highest-priority locality, assign available tanker
    while (!pq.isEmpty) {
      const locality = pq.pop();

      // Calculate how many tanker loads this locality needs
      const loadsNeeded = Math.ceil(locality.dailyDemandLitres /
        (availableTankers[0]?.capacityLitres || 10000));

      let loadsAssigned = 0;
      let tripsForLocality = [];

      // Assign as many loads as possible (up to demand and available trips)
      for (let i = 0; i < loadsNeeded; i++) {
        // Find tanker with most trips remaining
        const tanker = availableTankers
          .filter(t => t.isAvailable)
          .sort((a, b) => b.tripsRemaining - a.tripsRemaining)[0];

        if (!tanker) break;

        const route = tanker.assignTrip(locality);
        tripsForLocality.push(route);
        loadsAssigned++;

        if (loadsAssigned >= 3) break; // Cap: max 3 loads per locality per day (fairness)
      }

      if (tripsForLocality.length > 0) {
        const totalWater = tripsForLocality.reduce((s, r) => s + r.litresDelivered, 0);
        this.schedule.addEntry({
          rank: tripRank++,
          locality,
          trips: tripsForLocality,
          totalLitres: totalWater,
          coveragePct: Math.min(100, Math.round((totalWater / locality.dailyDemandLitres) * 100)),
          priorityScore: locality.priorityScore,
        });
      } else {
        // No tanker available — mark as unserved
        this.schedule.addUnserved(locality);
      }
    }

    this.schedule.finalize(this.tankers);
    return this.schedule;
  }
}

/**
 * Represents a completed distribution schedule
 */
class DistributionSchedule {
  constructor() {
    this.entries = [];
    this.unserved = [];
    this.generatedAt = new Date();
    this.stats = {};
  }

  addEntry(entry) { this.entries.push(entry); }
  addUnserved(locality) { this.unserved.push(locality); }

  finalize(tankers) {
    const totalTrips = tankers.reduce((s, t) => s + t.tripsUsedToday, 0);
    const totalWater = this.entries.reduce((s, e) => s + e.totalLitres, 0);
    const servedCount = new Set(this.entries.map(e => e.locality.id)).size;
    const totalLocalities = servedCount + this.unserved.length;
    const coverageRate = totalLocalities > 0 ? Math.round((servedCount / totalLocalities) * 100) : 0;

    this.stats = {
      totalTrips, totalWater, servedCount,
      unservedCount: this.unserved.length,
      totalLocalities, coverageRate,
      activeTankers: tankers.filter(t => t.tripsUsedToday > 0).length,
    };
  }

  exportCSV() {
    const header = 'Rank,Locality,Population,Severity,Priority Score,Trips,Litres Delivered,Coverage %,Tankers\n';
    const rows = this.entries.map(e =>
      `${e.rank},"${e.locality.name}",${e.locality.population},${e.locality.severity},${e.priorityScore.toFixed(1)},${e.trips.length},${e.totalLitres},${e.coveragePct}%,"${e.trips.map(t => t.tanker.tankerId).join('; ')}"`
    ).join('\n');
    return header + rows;
  }
}


/* ════════════════════════════════════════════════════
   2. APPLICATION STATE
════════════════════════════════════════════════════ */

const APP = {
  localities: [],
  tankers: [],
  schedule: null,
  editingLocalityId: null,
  chartInstances: {},
};

/* ════════════════════════════════════════════════════
   3. SEED DATA
════════════════════════════════════════════════════ */

function seedData() {
  const localitySeed = [
    { name: 'Ramnagar Village', population: 8500, severity: 9, distanceKm: 12, daysWithoutWater: 5, specialNeeds: 'hospital, elderly population' },
    { name: 'Durgapur Hamlet', population: 3200, severity: 7, distanceKm: 8, daysWithoutWater: 3, specialNeeds: '' },
    { name: 'Krishnapur Township', population: 22000, severity: 8, distanceKm: 25, daysWithoutWater: 4, specialNeeds: 'school, clinic' },
    { name: 'Sundarbans Ward 7', population: 6700, severity: 10, distanceKm: 40, daysWithoutWater: 7, specialNeeds: 'medical camp' },
    { name: 'Tilakpur Colony', population: 11200, severity: 6, distanceKm: 15, daysWithoutWater: 2, specialNeeds: '' },
    { name: 'Anantapur Slum C', population: 4900, severity: 5, distanceKm: 6, daysWithoutWater: 1, specialNeeds: 'infant care center' },
    { name: 'Venkatapur Block', population: 16800, severity: 4, distanceKm: 18, daysWithoutWater: 0, specialNeeds: '' },
    { name: 'Chennapatna Circle', population: 9300, severity: 9, distanceKm: 32, daysWithoutWater: 6, specialNeeds: 'dialysis center' },
  ];

  const tankerSeed = [
    { tankerId: 'TK-01', capacityLitres: 12000, maxTripsPerDay: 4, driverName: 'Ramesh Kumar', status: 'available' },
    { tankerId: 'TK-02', capacityLitres: 10000, maxTripsPerDay: 3, driverName: 'Suresh Babu', status: 'available' },
    { tankerId: 'TK-03', capacityLitres: 15000, maxTripsPerDay: 5, driverName: 'Priya Nair', status: 'available' },
    { tankerId: 'TK-04', capacityLitres: 8000, maxTripsPerDay: 2, driverName: 'Anil Joshi', status: 'maintenance' },
    { tankerId: 'TK-05', capacityLitres: 12000, maxTripsPerDay: 4, driverName: 'Deepa Sharma', status: 'available' },
  ];

  localitySeed.forEach(d => APP.localities.push(new Locality(d)));

  // Assign fixed map positions for seed data
  const positions = [
    [0.2, 0.25], [0.5, 0.15], [0.75, 0.3], [0.85, 0.65],
    [0.35, 0.55], [0.15, 0.7], [0.6, 0.75], [0.45, 0.45],
  ];
  APP.localities.forEach((l, i) => {
    l.mapX = positions[i][0];
    l.mapY = positions[i][1];
  });

  tankerSeed.forEach(d => APP.tankers.push(new Tanker(d)));
}


/* ════════════════════════════════════════════════════
   4. RENDER FUNCTIONS
════════════════════════════════════════════════════ */

function getSeverityBadgeHtml(label, severity) {
  const icons = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
  return `<span class="severity-badge ${label}">${icons[label]} ${severity}/10</span>`;
}

function getPriorityBarColor(label) {
  return { critical: '#ef4444', high: '#f59e0b', medium: '#0ea5e9', low: '#22c55e' }[label];
}

function renderLocalities() {
  const grid = document.getElementById('localities-grid');
  if (!grid) return;

  const sorted = [...APP.localities].sort((a, b) => b.priorityScore - a.priorityScore);

  grid.innerHTML = sorted.map((loc, idx) => {
    const label = loc.severityLabel;
    const maxScore = 50;
    const barPct = Math.min(100, (loc.priorityScore / maxScore) * 100);
    const color = getPriorityBarColor(label);
    const hasTrips = loc.assignedTrips && loc.assignedTrips.length > 0;

    return `
    <div class="locality-card ${label}" data-id="${loc.id}">
      <div class="locality-header">
        <div>
          <div class="locality-name">${loc.name}</div>
          <div class="locality-rank">#${idx + 1} Priority Rank</div>
        </div>
        ${getSeverityBadgeHtml(label, loc.severity)}
      </div>
      <div class="locality-stats">
        <div class="loc-stat">
          <div class="loc-stat-val">${loc.populationFormatted}</div>
          <div class="loc-stat-lbl">Population</div>
        </div>
        <div class="loc-stat">
          <div class="loc-stat-val">${loc.daysWithoutWater}d</div>
          <div class="loc-stat-lbl">Days w/o Water</div>
        </div>
        <div class="loc-stat">
          <div class="loc-stat-val">${loc.distanceKm}km</div>
          <div class="loc-stat-lbl">Distance</div>
        </div>
        <div class="loc-stat">
          <div class="loc-stat-val">${(loc.dailyDemandLitres / 1000).toFixed(0)}K L</div>
          <div class="loc-stat-lbl">Daily Demand</div>
        </div>
      </div>
      <div class="priority-bar-wrap">
        <div class="priority-bar-label">
          <span class="priority-bar-text">Priority Score</span>
          <span class="priority-bar-num">${loc.priorityScore.toFixed(1)}</span>
        </div>
        <div class="priority-bar-bg">
          <div class="priority-bar-fill" style="width:${barPct}%; background:${color};" data-fill="${barPct}"></div>
        </div>
      </div>
      <div class="locality-footer">
        <div class="locality-meta">
          ${loc.specialNeeds ? 'Special: ' + loc.specialNeeds : 'No special needs recorded'}
        </div>
        <div class="locality-actions">
          <button class="btn-xs" onclick="editLocality(${loc.id})">Edit</button>
          <button class="btn-xs danger" onclick="deleteLocality(${loc.id})">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Animate bars after render
  setTimeout(() => {
    document.querySelectorAll('.priority-bar-fill').forEach(el => {
      el.style.width = el.getAttribute('data-fill') + '%';
    });
  }, 50);
}

function renderTankers() {
  const grid = document.getElementById('tankers-grid');
  if (!grid) return;

  grid.innerHTML = APP.tankers.map(t => {
    const utilPct = t.utilizationPct;
    return `
    <div class="tanker-card ${t.status}" data-id="${t.internalId}">
      <div class="tanker-header">
        <div class="tanker-id-wrap">
          <div class="tanker-icon">🚚</div>
          <div>
            <div class="tanker-id">${t.tankerId}</div>
            <div class="tanker-driver">${t.driverName}</div>
          </div>
        </div>
        <span class="status-pill ${t.status}">${t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span>
      </div>
      <div class="tanker-info-grid">
        <div class="tanker-info-item">
          <div class="tanker-info-val">${t.capacityFormatted}</div>
          <div class="tanker-info-lbl">Capacity</div>
        </div>
        <div class="tanker-info-item">
          <div class="tanker-info-val">${t.maxTripsPerDay}</div>
          <div class="tanker-info-lbl">Max Trips/Day</div>
        </div>
      </div>
      <div class="trip-progress">
        <div class="trip-progress-label">
          <span class="trip-progress-text">Trips Used Today</span>
          <span class="trip-progress-num">${t.tripsUsedToday} / ${t.maxTripsPerDay}</span>
        </div>
        <div class="trip-bar-bg">
          <div class="trip-bar-fill" style="width:${utilPct}%;"></div>
        </div>
      </div>
      <div class="tanker-footer">
        <button class="btn-xs" onclick="editTanker(${t.internalId})">Edit</button>
        <button class="btn-xs danger" onclick="deleteTanker(${t.internalId})">Remove</button>
      </div>
    </div>`;
  }).join('');
}

function renderSchedule(schedule) {
  const emptyEl = document.getElementById('schedule-empty');
  const resultsEl = document.getElementById('schedule-results');
  const summaryEl = document.getElementById('schedule-summary');
  const timelineEl = document.getElementById('schedule-timeline');

  emptyEl.style.display = 'none';
  resultsEl.style.display = 'block';

  const s = schedule.stats;
  summaryEl.innerHTML = `
    <div class="summary-card">
      <div class="summary-card-val">${s.totalTrips}</div>
      <div class="summary-card-lbl">Total Trips</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-val">${(s.totalWater / 1000).toFixed(0)}K L</div>
      <div class="summary-card-lbl">Water Dispatched</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-val">${s.servedCount}</div>
      <div class="summary-card-lbl">Localities Served</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-val">${s.coverageRate}%</div>
      <div class="summary-card-lbl">Coverage Rate</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-val">${s.unservedCount}</div>
      <div class="summary-card-lbl">Unserved (Insufficient Fleet)</div>
    </div>
  `;

  // Base time: start at 06:00 AM
  let minuteOffset = 0;
  const BASE_HOUR = 6;

  timelineEl.innerHTML = schedule.entries.map((entry, i) => {
    const cls = i < 2 ? 'priority-1' : i < 4 ? 'priority-3' : 'priority-5';
    const tankerIds = [...new Set(entry.trips.map(t => t.tanker.tankerId))].join(', ');
    const timeStart = BASE_HOUR * 60 + minuteOffset;
    const travelTime = Math.round(entry.locality.distanceKm * 2.5); // ~25 km/h avg
    minuteOffset += travelTime + 30; // 30 min loading
    const timeStr = `${String(Math.floor(timeStart / 60)).padStart(2, '0')}:${String(timeStart % 60).padStart(2, '0')}`;

    const coverageColor = entry.coveragePct >= 80 ? '#22c55e' : entry.coveragePct >= 50 ? '#f59e0b' : '#ef4444';

    return `
    <div class="trip-item ${cls}" style="animation-delay:${i * 60}ms">
      <div class="trip-rank">${entry.rank}</div>
      <div class="trip-body">
        <div class="trip-title">${entry.locality.name}</div>
        <div class="trip-meta">
          Pop: ${entry.locality.populationFormatted} &nbsp;|&nbsp;
          Severity: ${entry.locality.severity}/10 &nbsp;|&nbsp;
          ${entry.locality.distanceKm}km from hub
        </div>
        <div class="trip-tags">
          <span class="trip-tag">Score: ${entry.priorityScore.toFixed(1)}</span>
          <span class="trip-tag">${entry.trips.length} trip${entry.trips.length > 1 ? 's' : ''}</span>
          ${entry.locality.specialNeeds ? `<span class="trip-tag">Special Needs</span>` : ''}
          <span class="trip-tag" style="color:${coverageColor}; border-color:${coverageColor}22; background:${coverageColor}11;">
            ${entry.coveragePct}% covered
          </span>
        </div>
      </div>
      <div class="trip-right">
        <div class="trip-water">${(entry.totalLitres / 1000).toFixed(0)}K L</div>
        <div class="trip-tanker">${tankerIds}</div>
        <div class="trip-time">ETA: ${timeStr}</div>
      </div>
    </div>`;
  }).join('') + (schedule.unserved.length > 0 ? `
    <div style="padding: 1rem 1.25rem; background: rgba(239,68,68,0.05); border: 1px dashed rgba(239,68,68,0.2); border-radius: 12px; margin-top: 0.5rem;">
      <div style="font-size:0.82rem; color:#f87171; font-weight:600; margin-bottom:0.5rem;">
        Unserved Localities (Insufficient Tanker Capacity)
      </div>
      <div style="font-size:0.78rem; color:#8ba3c0;">
        ${schedule.unserved.map(l => l.name).join(' &nbsp;&middot;&nbsp; ')}
      </div>
    </div>` : '');
}

function updateHeroStats() {
  const activeTankers = APP.tankers.filter(t => t.status === 'available').length;
  const criticals = APP.localities.filter(l => l.severity >= 9).length;
  const totalPop = APP.localities.reduce((s, l) => s + l.population, 0);

  document.getElementById('hs-tankers').textContent = activeTankers;
  document.getElementById('hs-localities').textContent = APP.localities.length;
  document.getElementById('hs-critical').textContent = criticals;
  document.getElementById('hs-population').textContent =
    totalPop >= 1000000 ? (totalPop / 1000000).toFixed(1) + 'M' :
    totalPop >= 1000 ? (totalPop / 1000).toFixed(0) + 'K' : totalPop;
}

function updateQuickStats(schedule) {
  if (!schedule) {
    document.getElementById('sc-priority-num').textContent = APP.localities.filter(l => l.severity >= 8).length;
    document.getElementById('sc-priority-sub').textContent = 'Severity score >= 8';
    return;
  }
  const s = schedule.stats;
  document.getElementById('sc-trips-num').textContent = s.totalTrips;
  document.getElementById('sc-trips-sub').textContent = `Across ${s.activeTankers} tanker(s)`;
  document.getElementById('sc-water-num').textContent = s.totalWater >= 1000000
    ? (s.totalWater / 1000000).toFixed(1) + 'M L'
    : (s.totalWater / 1000).toFixed(0) + 'K L';
  document.getElementById('sc-coverage-num').textContent = s.coverageRate + '%';
  document.getElementById('sc-coverage-sub').textContent = `${s.servedCount}/${s.totalLocalities} localities`;
  document.getElementById('sc-priority-num').textContent = APP.localities.filter(l => l.severity >= 8).length;
}


/* ════════════════════════════════════════════════════
   5. CANVAS MAP
════════════════════════════════════════════════════ */

let mapAnimFrame;

function drawMap() {
  const canvas = document.getElementById('mapCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#060b14');
  bgGrad.addColorStop(1, '#0c1a2e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = 'rgba(56,189,248,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Hub (distribution center)
  const hubX = W * 0.5, hubY = H * 0.5;
  ctx.beginPath();
  ctx.arc(hubX, hubY, 10, 0, Math.PI * 2);
  const hubGrad = ctx.createRadialGradient(hubX, hubY, 0, hubX, hubY, 10);
  hubGrad.addColorStop(0, '#7dd3fc');
  hubGrad.addColorStop(1, '#0ea5e9');
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(56,189,248,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Hub label
  ctx.fillStyle = '#7dd3fc';
  ctx.font = 'bold 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HUB', hubX, hubY - 14);

  // Hub pulse rings (animated)
  const now = Date.now();
  for (let r = 1; r <= 3; r++) {
    const phase = (now % 2000) / 2000;
    const radius = 15 + r * 15 + phase * 20;
    const alpha = (1 - phase) * 0.3;
    ctx.beginPath();
    ctx.arc(hubX, hubY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const colorMap = {
    critical: '#ef4444', high: '#f59e0b', medium: '#38bdf8', low: '#22c55e'
  };

  // Animate tanker dots on scheduled routes
  const scheduled = APP.schedule ? new Set(APP.schedule.entries.map(e => e.locality.id)) : new Set();

  APP.localities.forEach(loc => {
    const x = hubX + (loc.mapX - 0.5) * (W * 0.85);
    const y = hubY + (loc.mapY - 0.5) * (H * 0.85);
    const color = colorMap[loc.severityLabel];
    const isServed = scheduled.has(loc.id);

    // Route line
    if (isServed) {
      ctx.beginPath();
      ctx.moveTo(hubX, hubY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = color + '44';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Animated tanker on route
      const progress = ((now % 3000) / 3000);
      const tx = hubX + (x - hubX) * progress;
      const ty = hubY + (y - hubY) * progress;
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    // Locality node
    ctx.beginPath();
    ctx.arc(x, y, loc.severity >= 9 ? 8 : loc.severity >= 7 ? 6 : 5, 0, Math.PI * 2);
    const nodeGrad = ctx.createRadialGradient(x, y, 0, x, y, 8);
    nodeGrad.addColorStop(0, color);
    nodeGrad.addColorStop(1, color + '66');
    ctx.fillStyle = nodeGrad;
    ctx.fill();

    // Glow for critical
    if (loc.severity >= 9) {
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Name label (truncated)
    ctx.fillStyle = '#c0d8f0';
    ctx.font = '8px Inter, sans-serif';
    ctx.textAlign = 'center';
    const shortName = loc.name.length > 12 ? loc.name.slice(0, 10) + '..' : loc.name;
    ctx.fillText(shortName, x, y + 16);
  });

  mapAnimFrame = requestAnimationFrame(drawMap);
}


/* ════════════════════════════════════════════════════
   6. CHART RENDERING (vanilla canvas)
════════════════════════════════════════════════════ */

function drawBarChart(canvasId, labels, values, colors, maxVal) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD_L = 50, PAD_R = 20, PAD_T = 20, PAD_B = 60;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  ctx.clearRect(0, 0, W, H);

  // BG
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, W, H);

  const max = maxVal || Math.max(...values, 1) * 1.15;
  const barW = (chartW / labels.length) * 0.6;
  const gap = chartW / labels.length;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD_T + chartH - (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    ctx.fillStyle = '#4a6280';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round((max * i) / 4), PAD_L - 6, y + 3);
  }

  // Bars
  labels.forEach((lbl, i) => {
    const val = values[i] || 0;
    const barH = (val / max) * chartH;
    const x = PAD_L + i * gap + (gap - barW) / 2;
    const y = PAD_T + chartH - barH;

    // Bar with gradient
    const grad = ctx.createLinearGradient(x, y, x, PAD_T + chartH);
    grad.addColorStop(0, colors[i % colors.length]);
    grad.addColorStop(1, colors[i % colors.length] + '44');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Value label on top
    ctx.fillStyle = '#8ba3c0';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(val >= 1000 ? (val / 1000).toFixed(0) + 'K' : val, x + barW / 2, y - 4);

    // X label
    ctx.fillStyle = '#4a6280';
    ctx.font = '8px Inter, sans-serif';
    ctx.textAlign = 'center';
    const lblText = lbl.length > 9 ? lbl.slice(0, 8) + '.' : lbl;
    ctx.fillText(lblText, x + barW / 2, PAD_T + chartH + 14);
    if (lbl.length > 9) ctx.fillText(lbl.slice(8, 16), x + barW / 2, PAD_T + chartH + 24);
  });
}

function drawDonutChart(canvasId, labels, values, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const cx = W / 2 - 30, cy = H / 2, r = Math.min(W, H) * 0.35, inner = r * 0.55;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let startAngle = -Math.PI / 2;

  values.forEach((val, i) => {
    const slice = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    startAngle += slice;
  });

  // Inner hole
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1520';
  ctx.fill();

  // Center text
  ctx.fillStyle = '#f0f6ff';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy + 2);
  ctx.fillStyle = '#8ba3c0';
  ctx.font = '9px Inter, sans-serif';
  ctx.fillText('TOTAL', cx, cy + 14);

  // Legend on right
  labels.forEach((lbl, i) => {
    const ly = 30 + i * 30;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(W - 90, ly, 10, 10);
    ctx.fillStyle = '#8ba3c0';
    ctx.font = '8px Inter, sans-serif';
    ctx.textAlign = 'left';
    const shortLbl = lbl.length > 12 ? lbl.slice(0, 11) + '.' : lbl;
    ctx.fillText(shortLbl, W - 76, ly + 9);
    ctx.fillStyle = '#f0f6ff';
    ctx.font = 'bold 8px Inter, sans-serif';
    const pct = Math.round((values[i] / total) * 100);
    ctx.fillText(pct + '%', W - 76, ly + 19);
  });
}

function renderCharts() {
  const locs = APP.localities;
  if (locs.length === 0) return;

  const names = locs.map(l => l.name.split(' ')[0]);
  const severities = locs.map(l => l.severity);
  const priorities = locs.map(l => parseFloat(l.priorityScore.toFixed(1)));
  const demands = locs.map(l => l.dailyDemandLitres);

  // Chart 1: Severity Distribution (bar)
  drawBarChart('chart-severity', names, severities,
    locs.map(l => getPriorityBarColor(l.severityLabel)), 10);

  // Chart 2: Demand vs Supply (bar)
  const supplyValues = APP.tankers
    .filter(t => t.status === 'available')
    .reduce((s, t) => s + t.capacityLitres * t.maxTripsPerDay, 0);
  const demandValues = locs.map(l => l.dailyDemandLitres);
  const totalDemand = demandValues.reduce((a, b) => a + b, 0);
  drawBarChart('chart-supply', names, demandValues,
    ['#0ea5e9', '#14b8a6', '#a855f7', '#f59e0b', '#ef4444',
     '#38bdf8', '#2dd4bf', '#c084fc'], totalDemand * 1.2);

  // Chart 3: Priority scores (bar)
  drawBarChart('chart-priority', names, priorities,
    ['#38bdf8', '#0ea5e9', '#2dd4bf', '#14b8a6', '#a855f7',
     '#c084fc', '#f59e0b', '#fbbf24'], 50);

  // Chart 4: Tanker utilization (donut)
  const tankerLabels = APP.tankers.map(t => t.tankerId);
  const tankerTrips = APP.tankers.map(t => t.tripsUsedToday || t.maxTripsPerDay * 0.01);
  drawDonutChart('chart-tanker', tankerLabels, tankerTrips,
    ['#0ea5e9', '#14b8a6', '#a855f7', '#f59e0b', '#ef4444']);
}


/* ════════════════════════════════════════════════════
   7. MODAL LOGIC
════════════════════════════════════════════════════ */

function openLocalityModal(editId = null) {
  APP.editingLocalityId = editId;
  const modal = document.getElementById('modal-locality');
  const title = document.getElementById('modal-locality-title');

  if (editId !== null) {
    const loc = APP.localities.find(l => l.id === editId);
    if (!loc) return;
    title.textContent = 'Edit Locality';
    document.getElementById('inp-locality-name').value = loc.name;
    document.getElementById('inp-population').value = loc.population;
    document.getElementById('inp-severity').value = loc.severity;
    document.getElementById('severity-display').textContent = loc.severity;
    document.getElementById('inp-distance').value = loc.distanceKm;
    document.getElementById('inp-days-without').value = loc.daysWithoutWater;
    document.getElementById('inp-special-needs').value = loc.specialNeeds;
  } else {
    title.textContent = 'Add New Locality';
    document.getElementById('inp-locality-name').value = '';
    document.getElementById('inp-population').value = '';
    document.getElementById('inp-severity').value = 5;
    document.getElementById('severity-display').textContent = 5;
    document.getElementById('inp-distance').value = '';
    document.getElementById('inp-days-without').value = '';
    document.getElementById('inp-special-needs').value = '';
  }

  updatePriorityPreview();
  modal.style.display = 'flex';
}

function closeLocalityModal() {
  document.getElementById('modal-locality').style.display = 'none';
  APP.editingLocalityId = null;
}

function updatePriorityPreview() {
  const severity = parseInt(document.getElementById('inp-severity')?.value) || 5;
  const population = parseInt(document.getElementById('inp-population')?.value) || 0;
  const days = parseInt(document.getElementById('inp-days-without')?.value) || 0;
  const special = document.getElementById('inp-special-needs')?.value || '';

  const dummyLoc = new Locality({ name: 'X', population, severity, daysWithoutWater: days, specialNeeds: special });
  const score = dummyLoc.priorityScore;
  const label = dummyLoc.severityLabel;

  const scoreEl = document.getElementById('pp-score-val');
  const badgeEl = document.getElementById('pp-badge');
  if (scoreEl) scoreEl.textContent = score.toFixed(1);
  if (badgeEl) {
    const labels = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
    badgeEl.textContent = labels[label];
    badgeEl.className = `pp-badge severity-badge ${label}`;
  }
}

async function saveLocality() {
  const name = document.getElementById('inp-locality-name')?.value.trim();
  const population = document.getElementById('inp-population')?.value;
  const severity = document.getElementById('inp-severity')?.value;
  const distanceKm = document.getElementById('inp-distance')?.value;
  const daysWithoutWater = document.getElementById('inp-days-without')?.value;
  const specialNeeds = document.getElementById('inp-special-needs')?.value;

  if (!name || !population || !severity) {
    showToast('Please fill in required fields: Name, Population, Severity.', 'error');
    return;
  }

  if (APP.editingLocalityId !== null) {
    const loc = APP.localities.find(l => l.id === APP.editingLocalityId);
    if (loc) {
      loc.name = name;
      loc.population = parseInt(population);
      loc.severity = parseInt(severity);
      loc.distanceKm = parseFloat(distanceKm) || 10;
      loc.daysWithoutWater = parseInt(daysWithoutWater) || 0;
      loc.specialNeeds = specialNeeds.trim();
      await dbSaveLocality(loc);  // ✅ Persist update
    }
    showToast(`Locality "${name}" updated successfully!`, 'success');
  } else {
    const loc = new Locality({ name, population, severity, distanceKm, daysWithoutWater, specialNeeds });
    APP.localities.push(loc);
    await dbSaveLocality(loc);  // ✅ Persist new record
    showToast(`Locality "${name}" added! Priority Score: ${loc.priorityScore.toFixed(1)}`, 'success');
  }

  closeLocalityModal();
  renderLocalities();
  updateHeroStats();
  updateQuickStats(APP.schedule);
  renderCharts();
  await refreshDbExplorer();  // ✅ Refresh DB explorer view
}

function editLocality(id) { openLocalityModal(id); }
async function deleteLocality(id) {
  const loc = APP.localities.find(l => l.id === id);
  if (!loc) return;
  APP.localities = APP.localities.filter(l => l.id !== id);
  if (db) await db.deleteLocality(id);  // ✅ Remove from IndexedDB
  showToast(`Locality "${loc.name}" removed.`, 'info');
  renderLocalities();
  updateHeroStats();
  updateQuickStats(APP.schedule);
  renderCharts();
  await refreshDbExplorer();  // ✅ Refresh DB explorer
}

/* Tanker Modal */
function openTankerModal() {
  const modal = document.getElementById('modal-tanker');
  document.getElementById('inp-tanker-id').value = `TK-${String(APP.tankers.length + 1).padStart(2, '0')}`;
  document.getElementById('inp-tanker-capacity').value = '';
  document.getElementById('inp-tanker-trips').value = '';
  document.getElementById('inp-tanker-driver').value = '';
  document.getElementById('inp-tanker-status').value = 'available';
  modal.style.display = 'flex';
}

function closeTankerModal() {
  document.getElementById('modal-tanker').style.display = 'none';
}

async function saveTanker() {
  const tankerId = document.getElementById('inp-tanker-id')?.value.trim();
  const capacityLitres = document.getElementById('inp-tanker-capacity')?.value;
  const maxTripsPerDay = document.getElementById('inp-tanker-trips')?.value;
  const driverName = document.getElementById('inp-tanker-driver')?.value.trim() || 'Unassigned';
  const status = document.getElementById('inp-tanker-status')?.value;

  if (!tankerId || !capacityLitres || !maxTripsPerDay) {
    showToast('Please fill in Tanker ID, Capacity, and Max Trips.', 'error');
    return;
  }

  // Check for duplicate Tanker ID
  if (APP.tankers.some(t => t.tankerId === tankerId)) {
    showToast(`Tanker ID "${tankerId}" already exists. Use a unique ID.`, 'error');
    return;
  }

  const tanker = new Tanker({ tankerId, capacityLitres, maxTripsPerDay, driverName, status });
  APP.tankers.push(tanker);
  await dbSaveTanker(tanker);  // ✅ Persist to IndexedDB
  closeTankerModal();
  renderTankers();
  updateHeroStats();
  showToast(`Tanker ${tankerId} added to fleet!`, 'success');
  renderCharts();
  await refreshDbExplorer();  // ✅ Refresh DB explorer
}

function editTanker(internalId) {
  showToast('Editing tankers: remove and re-add for now.', 'info');
}

async function deleteTanker(internalId) {
  const tanker = APP.tankers.find(t => t.internalId === internalId);
  if (!tanker) return;
  APP.tankers = APP.tankers.filter(t => t.internalId !== internalId);
  if (db) await db.deleteTanker(internalId);  // ✅ Remove from IndexedDB
  renderTankers();
  updateHeroStats();
  showToast(`Tanker ${tanker.tankerId} removed from fleet.`, 'info');
  await refreshDbExplorer();  // ✅ Refresh DB explorer
}


/* ════════════════════════════════════════════════════
   8. SCHEDULER
════════════════════════════════════════════════════ */

function runScheduler() {
  if (APP.localities.length === 0) {
    showToast('Add at least one locality before running the scheduler.', 'warning');
    return;
  }
  const availTankers = APP.tankers.filter(t => t.status === 'available');
  if (availTankers.length === 0) {
    showToast('No available tankers! Add or activate tankers first.', 'error');
    return;
  }

  showToast('Running Priority Queue + Greedy Scheduler...', 'info');

  setTimeout(async () => {
    const scheduler = new GreedyScheduler(APP.localities, APP.tankers);
    APP.schedule = scheduler.run();

    renderSchedule(APP.schedule);
    renderTankers();
    updateQuickStats(APP.schedule);
    renderCharts();

    // ✅ Save schedule run to DB history
    await dbSaveScheduleRun(APP.schedule);
    // ✅ Persist updated tanker trip counts
    await Promise.all(APP.tankers.map(t => dbSaveTanker(t)));
    await refreshDbExplorer();

    const s = APP.schedule.stats;
    showToast(
      `Schedule ready! ${s.totalTrips} trips, ${(s.totalWater / 1000).toFixed(0)}K L water dispatched to ${s.servedCount} localities.`,
      'success'
    );

    document.getElementById('schedule').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 600);
}

function exportCSV() {
  if (!APP.schedule) { showToast('Run the scheduler first!', 'warning'); return; }
  const csv = APP.schedule.exportCSV();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aquaroute_schedule_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Schedule exported as CSV!', 'success');
}


/* ════════════════════════════════════════════════════
   9. TOAST SYSTEM
════════════════════════════════════════════════════ */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const iconMap = { success: 'OK', error: 'ERR', info: 'INFO', warning: 'WARN' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${iconMap[type]}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}


/* ════════════════════════════════════════════════════
   10. PARTICLES
════════════════════════════════════════════════════ */

function createParticles() {
  const container = document.getElementById('hero-particles');
  if (!container) return;
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      animation-duration: ${Math.random() * 8 + 6}s;
      animation-delay: ${Math.random() * 8}s;
    `;
    container.appendChild(p);
  }
}


/* ════════════════════════════════════════════════════
   11. NAVBAR SCROLL & MOBILE
════════════════════════════════════════════════════ */

function initNavbar() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
    // Update active nav link
    const sections = ['dashboard', 'localities', 'tankers', 'schedule', 'analytics'];
    let current = 'dashboard';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 120) current = id;
    });
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === '#' + current);
    });
  }, { passive: true });

  document.getElementById('nav-hamburger')?.addEventListener('click', () => {
    const links = document.querySelector('.nav-links');
    if (links) {
      const isOpen = links.style.display === 'flex';
      links.style.display = isOpen ? 'none' : 'flex';
      links.style.flexDirection = 'column';
      links.style.position = 'fixed';
      links.style.top = '68px';
      links.style.left = '0';
      links.style.right = '0';
      links.style.background = 'rgba(6,11,20,0.98)';
      links.style.padding = '1rem';
      links.style.zIndex = '99';
      links.style.borderBottom = '1px solid rgba(255,255,255,0.07)';
    }
  });
}


/* ════════════════════════════════════════════════════
   12. EVENT LISTENERS
════════════════════════════════════════════════════ */

function initEventListeners() {
  // Run scheduler buttons
  ['btn-run-main', 'btn-run-scheduler', 'btn-run-empty', 'btn-hero-schedule'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', runScheduler);
  });

  // Add locality
  ['btn-add-locality', 'btn-hero-add'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => openLocalityModal());
  });
  document.getElementById('btn-close-locality-modal')?.addEventListener('click', closeLocalityModal);
  document.getElementById('btn-cancel-locality')?.addEventListener('click', closeLocalityModal);
  document.getElementById('btn-save-locality')?.addEventListener('click', saveLocality);

  // Add tanker
  document.getElementById('btn-add-tanker')?.addEventListener('click', openTankerModal);
  document.getElementById('btn-close-tanker-modal')?.addEventListener('click', closeTankerModal);
  document.getElementById('btn-cancel-tanker')?.addEventListener('click', closeTankerModal);
  document.getElementById('btn-save-tanker')?.addEventListener('click', saveTanker);

  // Sort localities
  document.getElementById('btn-sort-priority')?.addEventListener('click', () => {
    renderLocalities();
    showToast('Localities sorted by priority score (highest first).', 'info');
  });

  // Export
  document.getElementById('btn-export-schedule')?.addEventListener('click', exportCSV);

  // Alert close
  document.getElementById('alert-close')?.addEventListener('click', () => {
    const ab = document.getElementById('alert-banner');
    if (ab) { ab.style.animation = 'none'; ab.style.display = 'none'; }
  });

  // Severity slider live update
  document.getElementById('inp-severity')?.addEventListener('input', function () {
    document.getElementById('severity-display').textContent = this.value;
    updatePriorityPreview();
  });
  ['inp-population', 'inp-days-without', 'inp-special-needs'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updatePriorityPreview);
  });

  // Close modals on overlay click
  ['modal-locality', 'modal-tanker'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function (e) {
      if (e.target === this) {
        if (id === 'modal-locality') closeLocalityModal();
        else closeTankerModal();
      }
    });
  });

  // ESC to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLocalityModal(); closeTankerModal(); }
  });
}


/* ════════════════════════════════════════════════════
   13. DATABASE LAYER INTEGRATION
════════════════════════════════════════════════════ */

/** Singleton DB instance */
let db = null;
let dbCurrentTab = 'localities';
let dbAllRecords = [];

async function initDatabase() {
  try {
    db = new AquaDB();
    await db.init();

    // Mark connected
    const badge = document.getElementById('db-status-badge');
    if (badge) {
      badge.textContent = '● Connected';
      badge.classList.add('connected');
    }

    // Try loading persisted data
    const [savedLocalities, savedTankers] = await Promise.all([
      db.getAllLocalities(),
      db.getAllTankers(),
    ]);

    if (savedLocalities.length > 0 || savedTankers.length > 0) {
      // Restore from DB (override seed)
      if (savedLocalities.length > 0) {
        APP.localities = savedLocalities.map(d => {
          const loc = new Locality(d);
          loc.id = d.id;
          loc.mapX = d.mapX || Math.random();
          loc.mapY = d.mapY || Math.random();
          return loc;
        });
      }
      if (savedTankers.length > 0) {
        APP.tankers = savedTankers.map(d => {
          const t = new Tanker(d);
          t.internalId = d.internalId;
          return t;
        });
      }

      renderLocalities();
      renderTankers();
      updateHeroStats();
      updateQuickStats(null);
      renderCharts();
      showToast('Data restored from IndexedDB!', 'success');
    } else {
      // First run — persist seed data
      await persistAllToDb();
      showToast('Seed data saved to IndexedDB.', 'info');
    }

    await refreshDbExplorer();

  } catch (err) {
    console.error('IndexedDB init failed:', err);
    const badge = document.getElementById('db-status-badge');
    if (badge) { badge.textContent = 'Error'; badge.classList.add('error'); }
    showToast('IndexedDB unavailable. Running in memory-only mode.', 'warning');
  }
}

/** Persist a single locality */
async function dbSaveLocality(loc) {
  if (!db) return;
  try {
    const data = loc.toJSON();
    data.mapX = loc.mapX;
    data.mapY = loc.mapY;
    await db.saveLocality({ ...data });
  } catch(e) { console.warn('DB save locality failed', e); }
}

/** Persist a single tanker */
async function dbSaveTanker(tanker) {
  if (!db) return;
  try { await db.saveTanker(tanker.toJSON()); }
  catch(e) { console.warn('DB save tanker failed', e); }
}

/** Persist everything */
async function persistAllToDb() {
  if (!db) return;
  await Promise.all([
    ...APP.localities.map(l => dbSaveLocality(l)),
    ...APP.tankers.map(t => dbSaveTanker(t)),
  ]);
}

/** Save a completed schedule run to history */
async function dbSaveScheduleRun(schedule) {
  if (!db || !schedule) return;
  try {
    await db.saveScheduleRun({
      generatedAt: schedule.generatedAt.toISOString(),
      stats: schedule.stats,
      entries: schedule.entries.map(e => ({
        rank: e.rank,
        localityName: e.locality.name,
        localityId: e.locality.id,
        totalLitres: e.totalLitres,
        coveragePct: e.coveragePct,
        priorityScore: e.priorityScore,
        trips: e.trips.length,
        tankers: e.trips.map(t => t.tanker.tankerId).join(', '),
      })),
      unserved: schedule.unserved.map(l => l.name),
    });
  } catch(e) { console.warn('DB save schedule failed', e); }
}

/* ════════════════════════════════════════════════════
   14. DATABASE EXPLORER UI
════════════════════════════════════════════════════ */

async function refreshDbExplorer() {
  if (!db) return;
  try {
    const counts = await db.getStoreCounts();
    document.getElementById('db-count-localities').textContent = counts.localities;
    document.getElementById('db-count-tankers').textContent    = counts.tankers;
    document.getElementById('db-count-schedules').textContent  = counts.schedules;
    await loadDbTable(dbCurrentTab);
  } catch(e) { console.warn('Explorer refresh failed', e); }
}

async function loadDbTable(tab) {
  dbCurrentTab = tab;
  const titleEl    = document.getElementById('db-table-title');
  const loadingEl  = document.getElementById('db-loading');
  const tableEl    = document.getElementById('db-table');
  const emptyEl    = document.getElementById('db-empty');
  const theadEl    = document.getElementById('db-thead');
  const tbodyEl    = document.getElementById('db-tbody');
  const rowCountEl = document.getElementById('db-row-count');

  if (!titleEl) return;

  titleEl.textContent = tab;
  loadingEl.style.display = 'block';
  tableEl.style.display   = 'none';
  emptyEl.style.display   = 'none';

  let records = [];

  if (tab === 'localities')  records = await db.getAllLocalities();
  if (tab === 'tankers')     records = await db.getAllTankers();
  if (tab === 'schedules')   records = await db.getAllSchedules();

  dbAllRecords = records;
  loadingEl.style.display = 'none';

  if (records.length === 0) {
    emptyEl.style.display = 'block';
    rowCountEl.textContent = '0 records';
    return;
  }

  renderDbTable(records, tab, theadEl, tbodyEl);
  tableEl.style.display = 'table';
  rowCountEl.textContent = `${records.length} record${records.length !== 1 ? 's' : ''}`;
}

function renderDbTable(records, tab, theadEl, tbodyEl) {
  if (tab === 'localities') {
    theadEl.innerHTML = `<tr>
      <th>ID</th><th>Name</th><th>Population</th><th>Severity</th>
      <th>Priority Score</th><th>Days w/o Water</th><th>Distance (km)</th><th>Special Needs</th>
    </tr>`;
    tbodyEl.innerHTML = records.map(r => `<tr>
      <td class="mono">${r.id}</td>
      <td class="highlight">${r.name}</td>
      <td class="mono">${Number(r.population).toLocaleString()}</td>
      <td><span class="db-sev-pill ${r.severityLabel}">${r.severity}/10</span></td>
      <td class="mono">${parseFloat(r.priorityScore).toFixed(1)}</td>
      <td class="mono">${r.daysWithoutWater}d</td>
      <td class="mono">${r.distanceKm} km</td>
      <td>${r.specialNeeds || '—'}</td>
    </tr>`).join('');
  }

  if (tab === 'tankers') {
    theadEl.innerHTML = `<tr>
      <th>Internal ID</th><th>Tanker ID</th><th>Driver</th><th>Capacity (L)</th>
      <th>Max Trips/Day</th><th>Trips Used</th><th>Status</th><th>Utilization</th>
    </tr>`;
    tbodyEl.innerHTML = records.map(r => `<tr>
      <td class="mono">${r.internalId}</td>
      <td class="highlight">${r.tankerId}</td>
      <td>${r.driverName}</td>
      <td class="mono">${Number(r.capacityLitres).toLocaleString()} L</td>
      <td class="mono">${r.maxTripsPerDay}</td>
      <td class="mono">${r.tripsUsedToday}</td>
      <td><span class="status-pill ${r.status}" style="font-size:0.65rem;">${r.status}</span></td>
      <td class="mono">${r.utilizationPct}%</td>
    </tr>`).join('');
  }

  if (tab === 'schedules') {
    theadEl.innerHTML = `<tr>
      <th>Run #</th><th>Generated At</th><th>Total Trips</th><th>Water (L)</th>
      <th>Localities Served</th><th>Coverage %</th><th>Unserved</th>
    </tr>`;
    tbodyEl.innerHTML = records.map(r => `<tr>
      <td class="mono">${r.scheduleId}</td>
      <td class="mono">${new Date(r.generatedAt).toLocaleString()}</td>
      <td class="mono">${r.stats.totalTrips}</td>
      <td class="mono">${Number(r.stats.totalWater).toLocaleString()}</td>
      <td class="mono">${r.stats.servedCount}</td>
      <td class="mono">${r.stats.coverageRate}%</td>
      <td>${r.unserved.length > 0 ? r.unserved.join(', ') : '—'}</td>
    </tr>`).join('');
  }
}

function filterDbTable(query) {
  if (!query.trim()) {
    const theadEl = document.getElementById('db-thead');
    const tbodyEl = document.getElementById('db-tbody');
    renderDbTable(dbAllRecords, dbCurrentTab, theadEl, tbodyEl);
    document.getElementById('db-row-count').textContent = `${dbAllRecords.length} records`;
    return;
  }

  const filtered = dbAllRecords.filter(r =>
    JSON.stringify(r).toLowerCase().includes(query.toLowerCase())
  );
  const theadEl = document.getElementById('db-thead');
  const tbodyEl = document.getElementById('db-tbody');
  renderDbTable(filtered, dbCurrentTab, theadEl, tbodyEl);
  document.getElementById('db-row-count').textContent = `${filtered.length} of ${dbAllRecords.length} records`;
}

async function exportDbJson() {
  if (!db) { showToast('Database not connected.', 'error'); return; }
  const [localities, tankers, schedules] = await Promise.all([
    db.getAllLocalities(), db.getAllTankers(), db.getAllSchedules(),
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    database: 'AquaRouteDB',
    version: 1,
    stores: { localities, tankers, schedules },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `aquaroute_db_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Full database exported as JSON!', 'success');
}

function initDbExplorer() {
  // Tab switching
  document.querySelectorAll('.db-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.db-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadDbTable(btn.dataset.tab);
    });
  });

  document.getElementById('btn-db-refresh')?.addEventListener('click', async () => {
    await refreshDbExplorer();
    showToast('Database refreshed.', 'info');
  });

  document.getElementById('btn-db-export-json')?.addEventListener('click', exportDbJson);

  document.getElementById('btn-db-clear-schedules')?.addEventListener('click', async () => {
    if (!db) return;
    await db.clearSchedules();
    await refreshDbExplorer();
    showToast('Schedule history cleared from database.', 'info');
  });

  document.getElementById('db-search')?.addEventListener('input', function () {
    filterDbTable(this.value);
  });
}

/* ════════════════════════════════════════════════════
   15. INIT
════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  seedData();
  initNavbar();
  initEventListeners();
  createParticles();

  renderLocalities();
  renderTankers();
  updateHeroStats();
  updateQuickStats(null);
  renderCharts();
  drawMap();
  initDbExplorer();

  // Init DB (may override seed data with persisted data)
  await initDatabase();

  setTimeout(() => {
    showToast('Welcome to AquaRoute! Click "Run Scheduler" to optimize distribution.', 'info');
  }, 1200);

  // Update alert banner
  const criticals = APP.localities.filter(l => l.severity >= 9).length;
  const alertText = document.getElementById('alert-text');
  if (alertText) {
    alertText.textContent = `Emergency Protocol Active — ${criticals} localities with critical water shortage detected. Run scheduler to prioritize distribution routes.`;
  }
});

// Make functions globally accessible
window.editLocality   = editLocality;
window.deleteLocality = deleteLocality;
window.editTanker     = editTanker;
window.deleteTanker   = deleteTanker;

