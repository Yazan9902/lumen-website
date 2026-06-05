(function () {
  'use strict';

  // =========================================================================
  // HERO NETWORK — subtle web mesh with traveling dots (hero only)
  // =========================================================================
  (function initHeroNetwork() {
    const canvas = document.getElementById('hero-network');
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let w, h, nodes, animationId;
    let isMobile = window.innerWidth < 768;
    let NODE_COUNT = isMobile ? 40 : 70;
    let CONNECTION_DIST = isMobile ? 140 : 180;
    let FRAME_INTERVAL = isMobile ? (1000 / 30) : (1000 / 45);
    let lastFrameTime = 0;
    let isVisible = true;

    // Adjacency list for the static web
    let adjacency = [];
    let connections = [];

    // Multiple travelers — each independent
    const TRAVELER_COUNT = 3;
    const TRAVELER_SPEEDS = [1.5, 1.2, 0.9]; // pixels per frame (faster → slower)
    const TRAVELER_OPACITIES = [0.7, 0.6, 0.5];
    const TRAVELER_PAUSE = [150, 200, 250]; // ms pause at each node
    let travelers = [];

    // Trail: recently traveled edges that fade out
    let trails = [];
    const TRAIL_FADE_DURATION = 1500; // ms for trail to fade
    const MAX_TRAILS = 80;

    // Pointer interaction — the mesh reaches toward the cursor (fine pointers only)
    const POINTER_FINE = window.matchMedia('(pointer: fine)').matches;
    const POINTER_RADIUS = 200;     // px of influence around the cursor
    const POINTER_MAX_LINKS = 6;    // cap lines drawn per frame for perf
    const pointer = { x: -9999, y: -9999, active: false };

    // Meaningful "signal" labels anchored around the emblem (desktop only).
    // Each anchor is a fraction of the viewport; the nearest node gets the label.
    // GenAI is the focal signal — rendered in the warm accent.
    const TEAL = '127, 214, 227';
    const GOLD = '244, 231, 161';
    const LABEL_ANCHORS = [
      { text: 'GENAI',    fx: 0.72, fy: 0.20, color: GOLD },
      { text: 'SECURITY', fx: 0.56, fy: 0.32, color: TEAL },
      { text: 'CLOUD',    fx: 0.88, fy: 0.40, color: TEAL },
      { text: 'BACKUP',   fx: 0.60, fy: 0.72, color: TEAL },
      { text: 'AI',       fx: 0.88, fy: 0.68, color: TEAL }
    ];
    let labeledNodes = [];  // { idx, text, color }
    let labelFont = '600 10px sans-serif';

    function assignLabels() {
      labeledNodes = [];
      labelFont = '600 10px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
      if (isMobile) return;  // keep mobile uncluttered
      const used = [];
      LABEL_ANCHORS.forEach(function (a) {
        const ax = a.fx * w, ay = a.fy * h;
        let best = -1, bestD = Infinity;
        for (let i = 0; i < nodes.length; i++) {
          if (used.indexOf(i) !== -1) continue;
          const dx = nodes[i].x - ax, dy = nodes[i].y - ay;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best !== -1) {
          used.push(best);
          labeledNodes.push({ idx: best, text: a.text, color: a.color });
        }
      });
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createNodes() {
      nodes = [];
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: 1 + Math.random() * 0.8  // 1–1.8px, tiny
        });
      }
      buildConnections();
      ensureConnected();
      initTravelers();
      assignLabels();
    }

    function buildConnections() {
      connections = [];
      adjacency = [];
      for (let i = 0; i < nodes.length; i++) adjacency[i] = [];
      const distSq = CONNECTION_DIST * CONNECTION_DIST;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < distSq) {
            const idx = connections.length;
            connections.push({ a: i, b: j, dist: Math.sqrt(d2) });
            adjacency[i].push({ neighbor: j, connIdx: idx });
            adjacency[j].push({ neighbor: i, connIdx: idx });
          }
        }
      }
    }

    function ensureConnected() {
      // BFS to find connected components, then link them
      const visited = new Array(nodes.length);
      const components = [];
      for (let i = 0; i < nodes.length; i++) {
        if (visited[i]) continue;
        const comp = [];
        const queue = [i];
        visited[i] = true;
        while (queue.length) {
          const n = queue.shift();
          comp.push(n);
          for (let k = 0; k < adjacency[n].length; k++) {
            const nb = adjacency[n][k].neighbor;
            if (!visited[nb]) { visited[nb] = true; queue.push(nb); }
          }
        }
        components.push(comp);
      }
      // Connect each component to the first one
      for (let c = 1; c < components.length; c++) {
        let bestI = -1, bestJ = -1, bestDist = Infinity;
        for (let ci = 0; ci < components[0].length; ci++) {
          for (let cj = 0; cj < components[c].length; cj++) {
            const a = components[0][ci], b = components[c][cj];
            const dx = nodes[a].x - nodes[b].x;
            const dy = nodes[a].y - nodes[b].y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) { bestDist = d2; bestI = a; bestJ = b; }
          }
        }
        if (bestI >= 0) {
          const idx = connections.length;
          connections.push({ a: bestI, b: bestJ, dist: Math.sqrt(bestDist) });
          adjacency[bestI].push({ neighbor: bestJ, connIdx: idx });
          adjacency[bestJ].push({ neighbor: bestI, connIdx: idx });
          // Merge into component 0
          for (let m = 0; m < components[c].length; m++) components[0].push(components[c][m]);
        }
      }
    }

    function pickRandomStart(excludeNodes) {
      // Pick a well-connected node not already taken
      const candidates = [];
      for (let i = 0; i < nodes.length; i++) {
        if (adjacency[i].length >= 2 && excludeNodes.indexOf(i) === -1) {
          candidates.push(i);
        }
      }
      if (candidates.length === 0) {
        // Fallback: any node
        return Math.floor(Math.random() * nodes.length);
      }
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    function initTravelers() {
      travelers = [];
      trails = [];
      const taken = [];
      for (let t = 0; t < TRAVELER_COUNT; t++) {
        const startNode = pickRandomStart(taken);
        taken.push(startNode);
        travelers.push({
          currentNode: startNode,
          targetNode: -1,
          x: nodes[startNode].x,
          y: nodes[startNode].y,
          progress: 0,
          pixelsPerFrame: TRAVELER_SPEEDS[t],
          opacity: TRAVELER_OPACITIES[t],
          paused: true,
          pauseTimer: 0,
          PAUSE_DURATION: TRAVELER_PAUSE[t],
          visitedHistory: [startNode]
        });
      }
    }

    function teleportToWellConnected(trav) {
      const candidates = [];
      for (let i = 0; i < nodes.length; i++) {
        if (adjacency[i].length >= 2 && i !== trav.currentNode) candidates.push(i);
      }
      if (candidates.length === 0) return false;
      const dest = candidates[Math.floor(Math.random() * candidates.length)];
      trav.currentNode = dest;
      trav.x = nodes[dest].x;
      trav.y = nodes[dest].y;
      trav.visitedHistory = [dest];
      return true;
    }

    function pickNextTarget(trav) {
      let neighbors = adjacency[trav.currentNode];
      if (!neighbors || neighbors.length === 0) {
        if (!teleportToWellConnected(trav)) return;
        neighbors = adjacency[trav.currentNode];
      }

      // Ping-pong detection
      if (trav.visitedHistory.length >= 3) {
        const hist = trav.visitedHistory;
        const len = hist.length;
        if (hist[len - 1] === hist[len - 3] && hist[len - 2] !== hist[len - 1]) {
          if (!teleportToWellConnected(trav)) return;
          neighbors = adjacency[trav.currentNode];
        }
      }

      const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
      trav.targetNode = pick.neighbor;
      trav.progress = 0;
    }

    function updateTraveler(trav, time, delta) {
      if (trav.paused) {
        trav.pauseTimer += delta;
        if (trav.pauseTimer >= trav.PAUSE_DURATION) {
          trav.paused = false;
          pickNextTarget(trav);
        }
        return;
      }

      if (trav.targetNode < 0) {
        pickNextTarget(trav);
        return;
      }

      const src = nodes[trav.currentNode];
      const dst = nodes[trav.targetNode];

      const dx = dst.x - src.x;
      const dy = dst.y - src.y;
      const edgeLen = Math.sqrt(dx * dx + dy * dy);
      const step = edgeLen > 0 ? trav.pixelsPerFrame / edgeLen : 0.02;

      trav.progress += step;

      if (trav.progress >= 1) {
        trav.x = dst.x;
        trav.y = dst.y;

        trails.push({
          a: trav.currentNode,
          b: trav.targetNode,
          startTime: time
        });

        trav.currentNode = trav.targetNode;
        trav.targetNode = -1;
        trav.progress = 0;
        trav.paused = true;
        trav.pauseTimer = 0;

        trav.visitedHistory.push(trav.currentNode);
        if (trav.visitedHistory.length > 3) trav.visitedHistory.shift();
      } else {
        trav.x = src.x + (dst.x - src.x) * trav.progress;
        trav.y = src.y + (dst.y - src.y) * trav.progress;
      }
    }

    function draw(time) {
      ctx.clearRect(0, 0, w, h);

      // Expire old trails
      for (let t = trails.length - 1; t >= 0; t--) {
        const age = (time - trails[t].startTime) / TRAIL_FADE_DURATION;
        if (age >= 1 || (1 - age) <= 0.01) trails.splice(t, 1);
      }
      if (trails.length > MAX_TRAILS) {
        trails.splice(0, trails.length - MAX_TRAILS);
      }

      // Build trail edge lookup
      const trailMap = {};
      for (let t = 0; t < trails.length; t++) {
        const tr = trails[t];
        const key = Math.min(tr.a, tr.b) + '_' + Math.max(tr.a, tr.b);
        const age = (time - tr.startTime) / TRAIL_FADE_DURATION;
        trailMap[key] = Math.max(trailMap[key] || 0, 1 - age);
      }

      // Batch static connections
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 0.4;
      for (let c = 0; c < connections.length; c++) {
        const conn = connections[c];
        const key = Math.min(conn.a, conn.b) + '_' + Math.max(conn.a, conn.b);
        if (trailMap[key]) continue;
        const baseOpacity = 0.10 * (1 - conn.dist / CONNECTION_DIST);
        ctx.globalAlpha = baseOpacity / 0.10;
        ctx.moveTo(nodes[conn.a].x, nodes[conn.a].y);
        ctx.lineTo(nodes[conn.b].x, nodes[conn.b].y);
      }
      ctx.globalAlpha = 1;
      ctx.stroke();

      // Draw trail connections
      for (let c = 0; c < connections.length; c++) {
        const conn = connections[c];
        const key = Math.min(conn.a, conn.b) + '_' + Math.max(conn.a, conn.b);
        const trailGlow = trailMap[key];
        if (!trailGlow) continue;
        const baseOpacity = 0.10 * (1 - conn.dist / CONNECTION_DIST);
        const opacity = baseOpacity + trailGlow * 0.18;
        ctx.beginPath();
        ctx.moveTo(nodes[conn.a].x, nodes[conn.a].y);
        ctx.lineTo(nodes[conn.b].x, nodes[conn.b].y);
        ctx.strokeStyle = 'rgba(0, 229, 255, ' + opacity + ')';
        ctx.lineWidth = 0.4 + trailGlow * 0.3;
        ctx.stroke();
      }

      // Batch static nodes
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.moveTo(n.x + n.size, n.y);
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
      }
      ctx.fill();

      // Draw all travelers
      for (let t = 0; t < travelers.length; t++) {
        const trav = travelers[t];
        ctx.beginPath();
        ctx.arc(trav.x, trav.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 229, 255, ' + trav.opacity + ')';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(trav.x, trav.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
        ctx.fill();
      }

      // Pointer interaction — links from the cursor to nearby nodes
      if (POINTER_FINE && pointer.active) {
        const pr2 = POINTER_RADIUS * POINTER_RADIUS;
        // Soft glow that follows the cursor
        const glowR = POINTER_RADIUS * 0.55;
        const grad = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, glowR);
        grad.addColorStop(0, 'rgba(0, 229, 255, 0.06)');
        grad.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Find the nearest nodes, then link + brighten them
        const near = [];
        for (let i = 0; i < nodes.length; i++) {
          const dx = nodes[i].x - pointer.x;
          const dy = nodes[i].y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < pr2) near.push({ i: i, d2: d2 });
        }
        near.sort(function (a, b) { return a.d2 - b.d2; });
        const limit = Math.min(near.length, POINTER_MAX_LINKS);
        for (let k = 0; k < limit; k++) {
          const n = nodes[near[k].i];
          const falloff = 1 - Math.sqrt(near[k].d2) / POINTER_RADIUS; // 1 near → 0 far
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(n.x, n.y);
          ctx.strokeStyle = 'rgba(0, 229, 255, ' + (falloff * 0.32) + ')';
          ctx.lineWidth = 0.6;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(n.x, n.y, n.size + falloff * 1.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(127, 214, 227, ' + (falloff * 0.55) + ')';
          ctx.fill();
        }
      }

      // Meaningful "signal" labels anchored around the emblem (desktop)
      if (labeledNodes.length) {
        ctx.save();
        ctx.font = labelFont;
        ctx.textBaseline = 'middle';
        if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
        for (let li = 0; li < labeledNodes.length; li++) {
          const lab = labeledNodes[li];
          const n = nodes[lab.idx];
          if (!n) continue;
          let prox = 0;
          if (POINTER_FINE && pointer.active) {
            const dx = n.x - pointer.x, dy = n.y - pointer.y;
            prox = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / POINTER_RADIUS);
          }
          // Marker dot
          ctx.beginPath();
          ctx.arc(n.x, n.y, 2 + prox * 1.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(' + lab.color + ', ' + (0.55 + prox * 0.4) + ')';
          ctx.fill();
          // Faint focal ring for the GenAI signal
          if (lab.color === GOLD) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, 7 + prox * 3, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(' + lab.color + ', ' + (0.32 + prox * 0.4) + ')';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          // Label text — flip to the node's left near the right edge
          const leftSide = n.x > w * 0.8;
          ctx.textAlign = leftSide ? 'right' : 'left';
          ctx.fillStyle = 'rgba(' + lab.color + ', ' + (0.34 + prox * 0.5) + ')';
          ctx.fillText(lab.text, n.x + (leftSide ? -12 : 12), n.y);
        }
        ctx.restore();
      }
    }

    function drawStatic() {
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 0.4;
      for (let c = 0; c < connections.length; c++) {
        const conn = connections[c];
        const opacity = 0.10 * (1 - conn.dist / CONNECTION_DIST);
        ctx.globalAlpha = opacity / 0.10;
        ctx.moveTo(nodes[conn.a].x, nodes[conn.a].y);
        ctx.lineTo(nodes[conn.b].x, nodes[conn.b].y);
      }
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.moveTo(n.x + n.size, n.y);
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    let prevTime = 0;
    function animate(time) {
      if (!isVisible) return;
      const delta = time - prevTime;
      prevTime = time;
      const frameDelta = time - lastFrameTime;
      if (frameDelta >= FRAME_INTERVAL) {
        lastFrameTime = time - (frameDelta % FRAME_INTERVAL);
        for (let t = 0; t < travelers.length; t++) {
          updateTraveler(travelers[t], time, delta);
        }
        draw(time);
      }
      animationId = requestAnimationFrame(animate);
    }

    // Reduced motion: static render — web only, no traveling nodes
    if (prefersReducedMotion) {
      resize();
      createNodes();
      drawStatic();
      return;
    }

    // Pointer interaction listeners (animated mode, fine pointers only)
    if (POINTER_FINE) {
      window.addEventListener('mousemove', function (e) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.active = true;
      }, { passive: true });
      // Deactivate when the cursor leaves the window
      document.addEventListener('mouseout', function (e) {
        if (!e.relatedTarget) pointer.active = false;
      }, { passive: true });
    }

    // IntersectionObserver: pause/resume + hide canvas when hero off-screen
    const heroSection = document.getElementById('hero');
    if ('IntersectionObserver' in window && heroSection) {
      const heroObserver = new IntersectionObserver(function (entries) {
        isVisible = entries[0].isIntersecting;
        canvas.style.opacity = isVisible ? '1' : '0';
        if (isVisible && !animationId) {
          prevTime = performance.now();
          animationId = requestAnimationFrame(animate);
        } else if (!isVisible && animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }, { threshold: 0 });
      heroObserver.observe(heroSection);
    }

    // Pause on tab hidden
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
      } else if (isVisible) {
        prevTime = performance.now();
        animationId = requestAnimationFrame(animate);
      }
    });

    function init() {
      resize();
      createNodes();
      prevTime = performance.now();
      animationId = requestAnimationFrame(animate);
    }

    let resizeTimeout;
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function () {
        const newWidth = window.innerWidth;
        // Only rebuild nodes if width actually changed (ignore mobile address bar height changes)
        if (Math.abs(newWidth - lastWidth) < 5) {
          // Height-only change (mobile address bar) — just resize canvas, keep nodes
          resize();
          return;
        }
        lastWidth = newWidth;
        const wasMobile = isMobile;
        isMobile = newWidth < 768;
        if (wasMobile !== isMobile) {
          NODE_COUNT = isMobile ? 40 : 70;
          CONNECTION_DIST = isMobile ? 140 : 180;
          FRAME_INTERVAL = isMobile ? (1000 / 30) : (1000 / 45);
        }
        resize();
        createNodes();
      }, 200);
    });

    init();
  })();

  // =========================================================================
  // EXISTING FUNCTIONALITY (preserved)
  // =========================================================================

  // --- Copyright year ---
  const yearEl = document.getElementById('copyright-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // --- Scroll-to-hide header ---
  const header = document.querySelector('.site-header');
  let lastScrollY = 0;
  const scrollThreshold = 80;

  // --- Mobile nav toggle ---
  const navToggle = document.querySelector('.mobile-nav-toggle');
  const navList = document.getElementById('nav-list');
  const navCloseBtn = document.getElementById('nav-close');

  function onScroll() {
    const currentY = window.scrollY;
    if (navList && navList.classList.contains('open')) {
      lastScrollY = currentY;
      return;
    }
    if (currentY > scrollThreshold && currentY > lastScrollY) {
      header.classList.add('header-hidden');
    } else {
      header.classList.remove('header-hidden');
    }
    lastScrollY = currentY;
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  if (navToggle && navList) {
    const iconHamburger = navToggle.querySelector('.icon-hamburger');

    function toggleNav(forceClose) {
      const open = forceClose ? false : navList.classList.toggle('open');
      if (forceClose) navList.classList.remove('open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (iconHamburger) iconHamburger.style.display = open ? 'none' : '';
      if (header) header.classList.toggle('nav-open', open);
      // Lock background scroll while the full-screen overlay menu is open
      document.body.style.overflow = open ? 'hidden' : '';
    }

    navToggle.addEventListener('click', function () {
      toggleNav(false);
    });

    if (navCloseBtn) {
      navCloseBtn.addEventListener('click', function () {
        toggleNav(true);
      });
    }

    navList.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function () {
        toggleNav(true);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navList.classList.contains('open')) {
        toggleNav(true);
        navToggle.focus();
      }
    });

    // Close dropdown when tapping outside
    document.addEventListener('click', function (e) {
      if (navList.classList.contains('open') &&
          !navList.contains(e.target) &&
          !navToggle.contains(e.target)) {
        toggleNav(true);
      }
    });
  }

  // --- Smooth scroll ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const id = this.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.focus({ preventScroll: true });
      }
    });
  });

  // --- Scroll-triggered fade-ins ---
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fadeEls = document.querySelectorAll('.fade-in');
  if (fadeEls.length > 0 && 'IntersectionObserver' in window) {
    const staggerMap = new Map();

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        const el = entry.target;
        const parent = el.parentElement;

        if (!staggerMap.has(parent)) staggerMap.set(parent, 0);
        const idx = staggerMap.get(parent);
        staggerMap.set(parent, idx + 1);

        const delay = prefersReduced ? 0 : idx * 120;
        setTimeout(function () {
          el.classList.add('visible');
        }, delay);

        observer.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

    fadeEls.forEach(function (el) { observer.observe(el); });
  } else {
    fadeEls.forEach(function (el) { el.classList.add('visible'); });
  }

  // --- Bubble accordion (per group) ---
  const bubbleGroups = document.querySelectorAll('.bubble-group');
  bubbleGroups.forEach(function(group) {
    const bubbles = group.querySelectorAll('.bubble');
    bubbles.forEach(function(bubble) {
      bubble.addEventListener('click', function() {
        const wasActive = this.classList.contains('active');
        bubbles.forEach(function(b) {
          b.classList.remove('active');
          b.setAttribute('aria-expanded', 'false');
        });
        if (!wasActive) {
          this.classList.add('active');
          this.setAttribute('aria-expanded', 'true');
        }
      });
      bubble.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        }
      });
    });
  });

  // --- Sticky mobile CTA (visible only after the hero scrolls away, hidden over contact) ---
  (function () {
    const bar = document.getElementById('sticky-cta');
    if (!bar || !('IntersectionObserver' in window)) return;
    const hero = document.getElementById('hero');
    const contact = document.getElementById('contact');
    let heroVisible = true;
    let contactVisible = false;
    function update() {
      bar.classList.toggle('show', !heroVisible && !contactVisible);
    }
    if (hero) {
      new IntersectionObserver(function (e) {
        heroVisible = e[0].isIntersecting;
        update();
      }, { threshold: 0 }).observe(hero);
    }
    if (contact) {
      new IntersectionObserver(function (e) {
        contactVisible = e[0].isIntersecting;
        update();
      }, { threshold: 0 }).observe(contact);
    }
  })();

  // --- i18n ---
  const ALLOWED_LANGS = ['en', 'ar', 'he'];
  let rawLang = 'en';
  try { rawLang = localStorage.getItem('lumen-lang') || 'en'; } catch (e) { /* private browsing */ }
  let currentLang = ALLOWED_LANGS.indexOf(rawLang) !== -1 ? rawLang : 'en';
  const translations = { en: window.__i18n };
  const langAnnounce = document.getElementById('lang-announce');

  function applyTranslations(lang) {
    const t = translations[lang];
    if (!t) return;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      if (t[key]) {
        if (t[key].indexOf('<br>') !== -1) {
          el.textContent = '';
          const parts = t[key].split('<br>');
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) el.appendChild(document.createElement('br'));
            el.appendChild(document.createTextNode(parts[i]));
          }
        } else {
          el.textContent = t[key];
        }
      }
    });
  }

  function setLanguage(lang) {
    if (ALLOWED_LANGS.indexOf(lang) === -1) lang = 'en';
    const dir = (lang === 'ar' || lang === 'he') ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dir);

    document.querySelectorAll('.lang-toggle button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang') === lang ? 'true' : 'false');
    });

    currentLang = lang;
    try { localStorage.setItem('lumen-lang', lang); } catch (e) { /* private browsing */ }

    if (translations[lang]) {
      if (translations[lang]._complete === false) {
        setLanguage('en');
        return;
      }
      applyTranslations(lang);
      announceLanguage(lang);
      loadFontForLang(lang);
    } else {
      fetch('i18n/' + lang + '.json')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          translations[lang] = data;
          if (data._complete === false) {
            setLanguage('en');
            return;
          }
          applyTranslations(lang);
          announceLanguage(lang);
          loadFontForLang(lang);
        })
        .catch(function () {
          setLanguage('en');
        });
    }
  }

  function announceLanguage(lang) {
    if (!langAnnounce) return;
    const names = { en: 'English', ar: 'Arabic', he: 'Hebrew' };
    langAnnounce.textContent = 'Language changed to ' + (names[lang] || lang);
  }

  function loadFontForLang(lang) {
    if (lang === 'ar' && !document.getElementById('font-arabic')) {
      const link = document.createElement('link');
      link.id = 'font-arabic';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap';
      document.head.appendChild(link);
    } else if (lang === 'he' && !document.getElementById('font-hebrew')) {
      const link = document.createElement('link');
      link.id = 'font-hebrew';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@300;400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }

  document.querySelectorAll('.lang-toggle button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setLanguage(this.getAttribute('data-lang'));
    });
  });

  if (currentLang !== 'en') {
    setLanguage(currentLang);
  }

  // --- Hero headline typewriter (terminal style) ---
  // Kicker fades up via CSS; the headline types out with a glowing cyber cursor;
  // subtitle + CTA (.hero-stagger) reveal once typing completes.
  (function () {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lines = document.querySelectorAll('.hero-line');

    let heroRevealed = false;
    function revealHero() {
      if (heroRevealed) return;
      heroRevealed = true;
      document.querySelectorAll('.hero-stagger').forEach(function (el) {
        el.classList.add('in');
      });
    }

    // Nothing to type, or reduced motion: keep static text and reveal immediately.
    if (!lines.length || reducedMotion) { revealHero(); return; }

    const CHAR_DELAY = 55;        // ms per character
    const LINE_PAUSE = 240;       // ms between lines
    const INITIAL_DELAY = 350;    // ms before first character (after kicker fades in)
    const SAFETY_TIMEOUT = 8000;  // force-show fallback

    // Resilience: never leave the hero hidden if typing stalls.
    setTimeout(revealHero, 3500);

    const t = translations[currentLang] || translations.en || {};
    const lineData = [];
    lines.forEach(function (line) {
      const key = line.getAttribute('data-i18n');
      const text = (key && t[key]) ? t[key] : line.textContent;
      lineData.push({ el: line, text: text });
      line.setAttribute('aria-label', text);
      line.textContent = '';
    });

    // Glowing terminal cursor
    const cursor = document.createElement('span');
    cursor.className = 'hero-typewriter-cursor';
    cursor.textContent = '▌'; // ▌ block caret
    cursor.setAttribute('aria-hidden', 'true');

    let aborted = false;
    const safetyTimer = setTimeout(forceShow, SAFETY_TIMEOUT);

    function forceShow() {
      if (aborted) return;
      aborted = true;
      lineData.forEach(function (d) { d.el.textContent = d.text; });
      if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
      revealHero();
    }

    function typeLine(lineIndex, onDone) {
      if (aborted) return;
      const data = lineData[lineIndex];
      const el = data.el;
      const text = data.text;
      let charIndex = 0;
      el.appendChild(cursor);

      function typeChar() {
        if (aborted) return;
        if (charIndex < text.length) {
          el.insertBefore(document.createTextNode(text[charIndex]), cursor);
          charIndex++;
          setTimeout(typeChar, CHAR_DELAY);
        } else {
          onDone();
        }
      }
      typeChar();
    }

    function typeAllLines(index) {
      if (aborted || index >= lineData.length) {
        if (!aborted) {
          clearTimeout(safetyTimer);
          revealHero();
          // leave the cursor blinking on the final line a moment, then remove
          setTimeout(function () {
            if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
          }, 2600);
        }
        return;
      }
      typeLine(index, function () {
        setTimeout(function () { typeAllLines(index + 1); }, LINE_PAUSE);
      });
    }

    setTimeout(function () { typeAllLines(0); }, INITIAL_DELAY);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !aborted) forceShow();
    });
  })();

  // --- Contact form validation & submission ---
  const form = document.getElementById('contact-form');
  if (form) {
    const validators = {
      name: function (v) { return v.trim().length > 0; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); },
      message: function (v) { return v.trim().length > 0; }
    };

    const errorKeys = {
      name: 'contact.error.name',
      email: 'contact.error.email',
      message: 'contact.error.message'
    };

    function getTranslation(key) {
      const t = translations[currentLang] || translations.en;
      return t[key] || translations.en[key] || '';
    }

    function validateField(field) {
      const name = field.name;
      if (!validators[name]) return true;

      const valid = validators[name](field.value);
      const errorEl = document.getElementById('error-' + name);

      if (!valid) {
        field.classList.add('invalid');
        if (errorEl) errorEl.textContent = getTranslation(errorKeys[name]);
      } else {
        field.classList.remove('invalid');
        if (errorEl) errorEl.textContent = '';
      }
      return valid;
    }

    ['field-name', 'field-email', 'field-message'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('blur', function () { validateField(this); });
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (form.querySelector('[name="_gotcha"]').value) return;

      const fields = [
        document.getElementById('field-name'),
        document.getElementById('field-email'),
        document.getElementById('field-message')
      ];
      let allValid = true;
      fields.forEach(function (f) {
        if (!validateField(f)) allValid = false;
      });
      if (!allValid) return;

      const btn = form.querySelector('.btn-submit');
      const btnText = btn.querySelector('.btn-text');
      const btnLoading = btn.querySelector('.btn-loading');
      const btnSuccess = btn.querySelector('.btn-success');
      const statusEl = document.getElementById('form-status');

      btnText.hidden = true;
      btnLoading.hidden = false;
      btn.disabled = true;

      function showSuccess() {
        btnLoading.hidden = true;
        btnSuccess.hidden = false;
        statusEl.className = 'form-status success';
        statusEl.textContent = getTranslation('contact.success');
        form.reset();
      }

      // Demo build (e.g. GitHub Pages): no backend — simulate a successful send.
      if (document.documentElement.hasAttribute('data-demo')) {
        setTimeout(showSuccess, 700);
        return;
      }

      const payload = {
        name: document.getElementById('field-name').value.trim(),
        email: document.getElementById('field-email').value.trim(),
        phone: document.getElementById('field-phone').value.trim(),
        message: document.getElementById('field-message').value.trim(),
        _gotcha: form.querySelector('[name="_gotcha"]').value
      };

      fetch(form.action, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      })
        .then(function (res) {
          if (res.ok) {
            showSuccess();
          } else {
            throw new Error('fail');
          }
        })
        .catch(function () {
          btnLoading.hidden = true;
          btnText.hidden = false;
          btn.disabled = false;
          statusEl.className = 'form-status error';
          statusEl.textContent = getTranslation('contact.error');
        });
    });
  }
})();
