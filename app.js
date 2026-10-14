/* ---------------------------------------------------------------------------
   Zhen Wang — site behaviour.

   Everything here is progressive enhancement: the pages are complete and
   readable with this file blocked, and nothing is hidden by CSS until JS is
   running. Motion is skipped entirely when the visitor asks for less of it.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hasIO = 'IntersectionObserver' in window;

    /* --- reveal on scroll ------------------------------------------------
       The .reveal class is added here, not in the HTML, so a failed script can
       never leave content invisible.

       An IntersectionObserver alone is not enough: a fast scroll, an anchor
       jump, or a restored scroll position can carry an element past the
       viewport without the observer ever reporting it, and the section then
       stays at opacity 0 forever — which is exactly the failure this page hit
       in the wild. So the observer is backed by a scroll pass that reveals
       anything at or above the fold, and by a timer that gives up on the whole
       effect rather than ever withholding content. */
    function revealOnScroll() {
        if (reduced || !hasIO) return;

        var targets = document.querySelectorAll('.main > section, .page > article > section, .card');
        if (!targets.length) return;

        Array.prototype.forEach.call(targets, function (el, i) {
            // the first screenful is already visible — revealing it just makes the page feel slow
            if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return;
            el.classList.add('reveal');
            el.style.transitionDelay = (Math.min(i, 4) * 40) + 'ms';
        });

        var pending = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
        if (!pending.length) return;

        function show(el) {
            el.classList.add('is-in');
            var at = pending.indexOf(el);
            if (at > -1) pending.splice(at, 1);
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                show(entry.target);
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

        pending.forEach(function (el) { io.observe(el); });

        // anything the observer missed: if its top has reached the fold, show it
        var ticking = false;
        function sweep() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(function () {
                ticking = false;
                Array.prototype.slice.call(pending).forEach(function (el) {
                    if (el.getBoundingClientRect().top >= window.innerHeight) return;
                    show(el);
                    io.unobserve(el);
                });
                if (!pending.length) window.removeEventListener('scroll', sweep);
            });
        }
        window.addEventListener('scroll', sweep, { passive: true });
        window.addEventListener('resize', sweep, { passive: true });
        sweep();

        // last resort: never let the effect be the reason something cannot be read
        window.setTimeout(function () {
            Array.prototype.slice.call(pending).forEach(show);
            io.disconnect();
        }, 4000);
    }

    /* --- which section am I reading --------------------------------------
       Highlights the overview sidebar nav. Uses the observer rather than a
       scroll handler so there is no work per scroll event. */
    function trackSections() {
        var links = document.querySelectorAll('.sidebar-sections a');
        if (!links.length || !hasIO) return;

        var byId = {};
        var sections = [];
        Array.prototype.forEach.call(links, function (link) {
            var id = link.getAttribute('href').slice(1);
            var section = document.getElementById(id);
            if (!section) return;
            byId[id] = link;
            sections.push(section);
        });
        if (!sections.length) return;

        var visible = {};
        function paint() {
            var current = null;
            sections.forEach(function (section) {
                if (visible[section.id]) current = current || section.id;
            });
            Array.prototype.forEach.call(links, function (link) { link.classList.remove('is-current'); });
            if (current && byId[current]) byId[current].classList.add('is-current');
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
            paint();
        }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });

        sections.forEach(function (section) { io.observe(section); });
    }

    revealOnScroll();
    trackSections();
})();

/* ---------------------------------------------------------------------------
   Prerequisite-graph widget (overview page).

   The SVG is generated from the real parsed graph in the course-planning agent
   — 27 courses, 32 edges — and is meaningful as a static picture. This only
   adds the highlighting: hovering or focusing a course lights up its full
   prerequisite closure, which is exactly the set the planner's validator
   computes before it lets the model choose anything.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var svg = document.getElementById('dag');
    if (!svg) return;

    var nodes = Array.prototype.slice.call(svg.querySelectorAll('.dag-node'));
    var edges = Array.prototype.slice.call(svg.querySelectorAll('.dag-edge'));
    var readout = document.querySelector('.dag-readout');
    var fallback = readout ? readout.getAttribute('data-default') : '';
    var pinned = null;

    var incoming = {};           // course -> [prerequisite, ...]
    edges.forEach(function (edge) {
        var to = edge.getAttribute('data-to');
        (incoming[to] = incoming[to] || []).push(edge.getAttribute('data-from'));
    });

    function closure(id) {
        var seen = {}, queue = [id];
        while (queue.length) {
            var cur = queue.shift();
            (incoming[cur] || []).forEach(function (parent) {
                if (seen[parent]) return;
                seen[parent] = true;
                queue.push(parent);
            });
        }
        return seen;
    }

    function clear() {
        svg.classList.remove('is-active');
        nodes.forEach(function (n) { n.classList.remove('is-anc', 'is-target'); });
        edges.forEach(function (e) { e.classList.remove('is-on'); });
        if (readout) readout.textContent = fallback;
    }

    function show(id) {
        var need = closure(id);
        svg.classList.add('is-active');

        nodes.forEach(function (node) {
            var nid = node.getAttribute('data-id');
            node.classList.toggle('is-target', nid === id);
            node.classList.toggle('is-anc', !!need[nid]);
        });
        edges.forEach(function (edge) {
            var to = edge.getAttribute('data-to');
            edge.classList.toggle('is-on', to === id || !!need[to]);
        });

        if (!readout) return;
        var list = Object.keys(need).sort();
        readout.innerHTML = list.length
            ? '<strong>' + id + '</strong> needs ' + list.length + ' course' +
              (list.length === 1 ? '' : 's') + ' first: ' + list.join(', ') + '.'
            : '<strong>' + id + '</strong> has no prerequisites in this map — a place a plan can start.';
    }

    nodes.forEach(function (node) {
        var id = node.getAttribute('data-id');
        node.addEventListener('mouseenter', function () { if (!pinned) show(id); });
        node.addEventListener('focus', function () { if (!pinned) show(id); });
        node.addEventListener('blur', function () { if (!pinned) clear(); });
        node.addEventListener('click', function () {
            pinned = pinned === id ? null : id;
            pinned ? show(id) : clear();
        });
        node.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            pinned = pinned === id ? null : id;
            pinned ? show(id) : clear();
        });
    });

    svg.addEventListener('mouseleave', function () { if (!pinned) clear(); });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && pinned) { pinned = null; clear(); }
    });
})();

/* ---------------------------------------------------------------------------
   Back to top — only below 900px, where the sticky sidebar is gone and a long
   detail page leaves no other way back. Injected from JS so it never appears
   as dead markup for the desktop layout.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    if (!window.matchMedia || !window.matchMedia('(max-width: 900px)').matches) return;

    var button = document.createElement('button');
    button.className = 'to-top';
    button.type = 'button';
    button.setAttribute('aria-label', 'Back to top');
    button.innerHTML = '<span aria-hidden="true">&#8593;</span>';
    document.body.appendChild(button);

    button.addEventListener('click', function () {
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });

    var ticking = false;
    window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
            button.classList.toggle('is-shown', window.pageYOffset > 700);
            ticking = false;
        });
    }, { passive: true });
})();


/* ---------------------------------------------------------------------------
   Plan Validator widget (course-planner page). No-ops on every other page.

   Data checked against the planner source before shipping: the 12 courses'
   units and prerequisite groups match prereq_graph.build(), <probability>
   resolves to the same four courses, the unit rules are validator.py's
   12 / 19 / 22, and the one-shot plan reproduces its five real errors verbatim.
--------------------------------------------------------------------------- */

/* Plan Validator — the Course Planning Tutor's deterministic checker over a
   12-course slice of its 68-node / 74-edge DAG. Groups, units and the
   12/19/22-unit rules are the app's own (prereq_graph.py, validator.py). */
(function () {
  var R = document.getElementById('pv'); if (!R) return;
  var MIN = 12, CAP = 22, HEAVY = 19;
  var ABS = { '<probability>': ['MATH 180A', 'MATH 183', 'CSE 103', 'ECE 109'] };
  var D = [['DSC 10', 4, []], ['MATH 20A', 4, []], ['MATH 18', 4, []], ['CSE 11', 4, []],
    ['DSC 20', 4, [['DSC 10']]], ['MATH 20B', 4, [['MATH 20A']]], ['DSC 80', 4, [['DSC 10']]],
    ['MATH 20C', 4, [['MATH 20B']]], ['DSC 30', 4, [['DSC 20']]], ['MATH 183', 4, [['MATH 20B']]],
    ['DSC 40A', 4, [['DSC 10'], ['MATH 20C'], ['MATH 18']]],
    ['DSC 140A', 4, [['DSC 80'], ['<probability>']]]], M = {};
  D.forEach(function (c) { M[c[0]] = c; });
  var GOOD = [['DSC 10', 'MATH 20A', 'MATH 18'], ['DSC 20', 'MATH 20B', 'DSC 80'],
    ['MATH 20C', 'DSC 30', 'MATH 183'], ['DSC 40A', 'DSC 140A', 'CSE 11']],
    ONE = [['DSC 10', 'DSC 20', 'MATH 20A', 'MATH 18'], ['MATH 20B', 'DSC 40A', 'DSC 140A'],
      ['MATH 20C', 'DSC 80', 'MATH 183'], ['DSC 30', 'CSE 11']],
    terms = [].slice.call(R.querySelectorAll('[data-pv-term]')),
    gets = function (s) { return terms.map(function (e) { return e.querySelector(s); }); },
    slots = gets('[data-pv-slot]'), uEl = gets('[data-pv-u]'),
    vEl = R.querySelector('[data-pv-verdict]'), logEl = R.querySelector('[data-pv-log]'),
    RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: 0 },
    OK = '<span class="g">OK</span> ', NO = '<span class="e">X</span> ', WN = '<span class="w">!</span> ',
    T = GOOD.map(function (a) { return a.slice(); }), timers = [];
  function at(id) { for (var i = 0; i < T.length; i++) if (T[i].indexOf(id) > -1) return i; return -1; }
  function units(i) { var u = 0; T[i].forEach(function (id) { u += M[id][1]; }); return u; }
  function or(g, deep) {
    return g.map(function (a) {
      return ABS[a] ? a.slice(1, -1) + (deep ? ' = {' + ABS[a].join(', ') + '}' : '') : a;
    }).join(' or ');
  }
  function say(L) { logEl.innerHTML = '<li>' + L.join('</li><li>') + '</li>'; }
  /* best standing of a group: 2 = strictly earlier, 1 = same term, 0 = later, -1 = absent */
  function best(g, t) {
    var b = { r: -1 };
    g.forEach(function (a) {
      (ABS[a] || [a]).forEach(function (m) {
        var p = M[m] ? at(m) : -1, r = p < 0 ? -1 : p < t ? 2 : p === t ? 1 : 0;
        if (r > b.r) b = { r: r, m: m, p: p };
      });
    });
    return b;
  }
  function validate() {
    var V = [], seen = {};
    T.forEach(function (row, i) {
      var q = 'Q' + (i + 1), u = units(i);
      row.forEach(function (id) {
        if (seen[id] !== undefined) V.push({ t: i, id: id, s: 1, m: 'is already scheduled in Q' + (seen[id] + 1) + '.' });
        else seen[id] = i;
      });
      if (!row.length) V.push({ t: i, s: 0, m: q + ' has no courses.' });
      else if (u < MIN) V.push({ t: i, s: 1, m: q + ' has ' + u + ' units; full-time standing needs ' + MIN + '.' });
      if (u > CAP) V.push({ t: i, s: 1, m: q + ' has ' + u + ' units; the per-quarter cap is ' + CAP + '.' });
      else if (u >= HEAVY) V.push({ t: i, s: 0, m: q + ' has ' + u + ' units — legal but heavy.' });
      row.forEach(function (id) {
        M[id][2].forEach(function (g) {
          var b = best(g, i);
          if (b.r < 2) V.push({
            t: i, id: id, s: 1, m: 'in ' + q + ' requires ' + or(g) + ', ' + (b.r === 1
              ? 'which is scheduled in the same term, not before it.' : b.r === 0
                ? 'which the plan schedules in a later term.' : 'which the plan never includes.')
          });
        });
      });
    });
    return V;
  }
  function render(anim) {
    var V = validate(), bad = {}, n = 0, E = 0, W = 0;
    V.forEach(function (v) { v.s ? E++ : W++; if (v.id && v.s) bad[v.id] = 1; });
    T.forEach(function (row, i) {
      slots[i].innerHTML = row.map(function (id) {
        return '<button type="button" class="pv-c' + (bad[id] ? ' flag' : '') + (anim ? ' in' : '') +
          '" data-id="' + id + '">' + id + '<i>' + M[id][1] + '</i></button>';
      }).join('');
      var u = units(i), err = V.some(function (v) { return v.t === i && v.s; });
      uEl[i].textContent = u + 'u';
      terms[i].className = 'pv-term' + (row.length ? (err ? ' bad' : ' ok') : '') +
        (u > CAP || (row.length && u < MIN) ? ' over' : '');
      n += row.length;
    });
    var w = W ? ' · ' + W + ' warning' + (W > 1 ? 's' : '') : '';
    vEl.className = 'pv-verdict' + (!n ? '' : E ? ' pv-fail' : ' pv-pass');
    vEl.textContent = !n ? 'Empty plan'
      : E ? 'Rejected · ' + E + ' error' + (E > 1 ? 's' : '') + w + ' · ' + n + ' courses placed'
        : 'Accepted · ' + n + ' of ' + n + ' courses legal · 0 errors' + w;
    return V;
  }
  function lines(V) {
    return V.length ? V.map(function (v) {
      return (v.s ? NO : WN) + (v.id ? '<b>' + v.id + '</b> ' : '') + v.m;
    }) : [OK + 'Prerequisite order, unit load and duplicates all pass.'];
  }
  function explain(id) {
    var t = at(id), gs = M[id][2], L = ['<b>' + id + '</b> in Q' + (t + 1) + ' — ' + (gs.length
      ? gs.length + ' prerequisite group' + (gs.length > 1 ? 's' : '') + '; AND across groups, OR inside one:'
      : 'no prerequisites in the catalog.')];
    gs.forEach(function (g) {
      var b = best(g, t);
      L.push('&nbsp;&nbsp;' + (b.r === 2 ? OK : NO) + '(' + or(g, 1) + ') ' + (b.r < 0
        ? 'nothing in the plan satisfies this' : b.m + ' @ Q' + (b.p + 1) + (b.r === 1
          ? ' — same term, not before it' : b.r === 0 ? ' — too late' : '')));
    });
    say(L);
  }
  function load(P, head, tail) {
    timers.forEach(clearTimeout); timers = [];
    T = P.map(function (a) { return a.slice(); });
    say([head].concat(lines(render(true))).concat([tail]));
  }
  function perQuarter() {
    timers.forEach(clearTimeout); timers = []; T = [[], [], [], []]; render(false);
    var L = ['<span class="i">per-quarter</span> each term drawn from the eligible set, recomputed first:'], t = 0;
    (function step() {
      if (t >= 4) return say(L.concat(lines(render(true)))
        .concat([OK + 'Accepted on the first pass — the path from 40% to 100%.']));
      var el = D.filter(function (c) {
        return at(c[0]) < 0 && c[2].every(function (g) { return best(g, t).r === 2; });
      }).map(function (c) { return c[0]; });
      T[t] = GOOD[t].slice();
      L.push('<span class="i">Q' + (t + 1) + '</span> eligible = {' + el.join(', ') + '} → placed ' +
        T[t].join(', ') + ' · <b>' + units(t) + 'u</b>');
      render(true); say(L); t++;
      timers.push(setTimeout(step, RM.matches ? 0 : 430));
    })();
  }
  R.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b || !R.contains(b)) return;
    var v = b.getAttribute('data-pv');
    if (v === 'oneshot') return load(ONE,
      '<span class="i">one-shot</span> the whole plan proposed in one pass, then checked edge by edge:',
      NO + 'One error rejects the whole plan. Hence 40% first-pass legality.');
    if (v === 'perq') return perQuarter();
    if ((v = b.getAttribute('data-id'))) explain(v);
  });
  render(false);
})();
