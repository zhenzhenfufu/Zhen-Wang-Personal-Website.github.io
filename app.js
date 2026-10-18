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
   Plan Validator (course-planner page). No-ops on every other page.

   The two plans and every verdict line below were produced by running the
   planner's own validator.py against the corrected course graph — they are
   recorded output, not a re-implementation, so nothing here can drift from
   what the app actually says. The page only replays them and lets you look up
   a course's prerequisite groups.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var root = document.getElementById('pv');
    if (!root) return;

    var D = {"units":{"DSC 10":4,"DSC 20":4,"DSC 30":4,"DSC 40A":4,"DSC 40B":4,"DSC 80":4,"DSC 100":4,"DSC 102":4,"DSC 106":4,"DSC 140A":4,"DSC 140B":4,"DSC 148":4,"DSC 180A":4,"DSC 180B":4,"MATH 18":4,"MATH 20A":4,"MATH 20B":4,"MATH 20C":4,"MATH 183":4,"MATH 180A":4,"MATH 189":4,"COGS 9":4},"done":["DSC 10","MATH 18","MATH 20A","MATH 20B"],"groups":{"DSC 20":[["DSC 10"]],"DSC 30":[["DSC 20"]],"DSC 40A":[["DSC 10"],["MATH 20C"],["MATH 18"]],"DSC 40B":[["DSC 20"],["DSC 40A"]],"DSC 80":[["DSC 30"],["DSC 40A"]],"DSC 100":[["DSC 40B"],["DSC 80"]],"DSC 106":[["DSC 80"]],"DSC 140A":[["DSC 80"],["ECE 109","MATH 180A","MATH 183"]],"MATH 20C":[["MATH 20B"]],"MATH 183":[["MATH 20C"]],"MATH 180A":[["MATH 20C"]],"COGS 9":[]},"perq":{"plan":[["COGS 9","DSC 20","MATH 20C"],["DSC 30","DSC 40A","MATH 180A"],["DSC 40B","DSC 80","MATH 183"],["DSC 100","DSC 106","DSC 140A"]],"log":[{"term":1,"eligible":["MATH 20C","DSC 20","COGS 9"],"placed":["COGS 9","DSC 20","MATH 20C"]},{"term":2,"eligible":["DSC 40A","DSC 30","MATH 180A","MATH 183"],"placed":["DSC 30","DSC 40A","MATH 180A"]},{"term":3,"eligible":["DSC 80","DSC 40B","MATH 183"],"placed":["DSC 40B","DSC 80","MATH 183"]},{"term":4,"eligible":["DSC 100","DSC 106","DSC 140A"],"placed":["DSC 100","DSC 106","DSC 140A"]}],"violations":[]},"oneshot":{"plan":[["DSC 20","DSC 40A","DSC 80"],["DSC 30","MATH 20C","DSC 140A"],["MATH 183","DSC 40B","COGS 9"],["DSC 100","DSC 106","MATH 180A"]],"violations":[{"code":"PREREQ_MISSING","course":"DSC 40A","msg":"DSC 40A in Q1 Fall requires MATH 20C, which the plan schedules in a later term."},{"code":"PREREQ_MISSING","course":"DSC 80","msg":"DSC 80 in Q1 Fall requires DSC 30, which the plan schedules in a later term."},{"code":"PREREQ_MISSING","course":"DSC 80","msg":"DSC 80 in Q1 Fall requires DSC 40A, which is scheduled in the same term, not before it."},{"code":"PREREQ_MISSING","course":"DSC 140A","msg":"DSC 140A in Q2 Winter requires ECE 109 or MATH 180A or MATH 183, which the plan schedules in a later term."}]}};

    var terms = [].slice.call(root.querySelectorAll('[data-pv-term]'));
    var slots = terms.map(function (t) { return t.querySelector('[data-pv-slot]'); });
    var unitEls = terms.map(function (t) { return t.querySelector('[data-pv-u]'); });
    var verdict = root.querySelector('[data-pv-verdict]');
    var log = root.querySelector('[data-pv-log]');
    var mode = 'perq';

    function where(id) {
        if (D.done.indexOf(id) > -1) return 'completed';
        var plan = D[mode].plan;
        for (var i = 0; i < plan.length; i++) if (plan[i].indexOf(id) > -1) return 'Q' + (i + 1);
        return null;
    }

    function unitsOf(list) {
        return list.reduce(function (sum, id) { return sum + (D.units[id] || 0); }, 0);
    }

    function render() {
        var state = D[mode];
        var flagged = {};
        state.violations.forEach(function (v) { if (v.course) flagged[v.course] = true; });

        state.plan.forEach(function (row, i) {
            slots[i].innerHTML = row.map(function (id) {
                return '<button type="button" class="pv-c' + (flagged[id] ? ' flag' : '') +
                    '" data-id="' + id + '">' + id + '<i>' + D.units[id] + '</i></button>';
            }).join('');
            unitEls[i].textContent = unitsOf(row) + 'u';
            var bad = state.violations.some(function (v) { return v.msg.indexOf('Q' + (i + 1)) === 0 || (v.course && row.indexOf(v.course) > -1); });
            terms[i].className = 'pv-term ' + (bad ? 'bad' : 'ok');
        });

        var errors = state.violations.length;
        verdict.className = 'pv-verdict ' + (errors ? 'pv-fail' : 'pv-pass');
        verdict.textContent = errors
            ? 'Rejected · ' + errors + ' error' + (errors === 1 ? '' : 's')
            : 'Accepted · 12 of 12 courses legal · 0 errors';

        var lines;
        if (mode === 'oneshot') {
            lines = ['<span class="i">one-shot</span> the whole plan proposed in one pass, then checked edge by edge:']
                .concat(state.violations.map(function (v) {
                    return '<span class="e">\u2715</span> ' + v.msg;
                }))
                .concat(['<span class="e">\u2715</span> One error rejects the whole plan.']);
        } else {
            lines = ['<span class="i">per-quarter</span> each term drawn from the eligible set, recomputed first:']
                .concat(state.log.map(function (entry) {
                    return '<span class="i">Q' + entry.term + '</span> eligible = {' + entry.eligible.join(', ') +
                        '} \u2192 placed ' + entry.placed.join(', ') + ' · <b>' + unitsOf(entry.placed) + 'u</b>';
                }))
                .concat(['<span class="g">\u2713</span> Accepted on the first pass — no repair round needed.']);
        }
        log.innerHTML = '<li>' + lines.join('</li><li>') + '</li>';
    }

    function explain(id) {
        var groups = D.groups[id];
        var place = where(id);
        var head = '<b>' + id + '</b>' + (place === 'completed' ? ' — already completed.' : place ? ' — scheduled in ' + place + '.' : '.');
        if (!groups || !groups.length) {
            log.innerHTML = '<li>' + head + ' No prerequisites in the catalog text.</li>';
            return;
        }
        var rows = groups.map(function (group) {
            var options = group.map(function (option) {
                var at = where(option);
                return option + (at ? ' <span class="g">(' + at + ')</span>' : ' <span class="muted">(not in this plan)</span>');
            });
            return 'needs ' + options.join(' <i>or</i> ');
        });
        log.innerHTML = '<li>' + head + '</li><li>' + rows.join('</li><li>') + '</li>';
    }

    root.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('button');
        if (!button || !root.contains(button)) return;
        var pv = button.getAttribute('data-pv');
        if (pv) {
            mode = pv;
            root.querySelectorAll('[data-pv]').forEach(function (b) {
                b.className = 'pv-btn' + (b.getAttribute('data-pv') === mode ? '' : ' pv-btn-ghost');
            });
            render();
            return;
        }
        var id = button.getAttribute('data-id');
        if (id) explain(id);
    });

    render();
})();

/* ---------------------------------------------------------------------------
   Screenshot gallery (game page). Click or key a frame open; arrows move; Esc
   closes. With JS off the thumbnails are still the screenshots, at full size.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var shots = [].slice.call(document.querySelectorAll('.shot'));
    var view = document.querySelector('.shot-view');
    if (!shots.length || !view) return;

    var big = view.querySelector('.shot-big');
    var cap = view.querySelector('.shot-cap');
    var closeButton = view.querySelector('.shot-close');
    var current = 0;
    var opener = null;

    function open(index) {
        current = (index + shots.length) % shots.length;
        var img = shots[current].querySelector('img');
        big.src = img.getAttribute('src');
        big.alt = img.getAttribute('alt');
        cap.textContent = img.getAttribute('alt');
        view.hidden = false;
        closeButton.focus();
    }

    function close() {
        view.hidden = true;
        if (opener) opener.focus();
    }

    shots.forEach(function (button, index) {
        button.addEventListener('click', function () { opener = button; open(index); });
    });
    closeButton.addEventListener('click', close);
    view.addEventListener('click', function (event) { if (event.target === view) close(); });

    document.addEventListener('keydown', function (event) {
        if (view.hidden) return;
        if (event.key === 'Escape') { close(); return; }
        if (event.key === 'ArrowRight') { event.preventDefault(); open(current + 1); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); open(current - 1); }
    });
})();

/* ---------------------------------------------------------------------------
   Pipeline diagram (Pfizer page): click a stage to read what happens inside
   it, or send one record along the path and watch which stage it is in.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var panel = document.querySelector('[data-stage-panel]');
    var stages = [].slice.call(document.querySelectorAll('.d-stage[data-stage]'));
    if (!panel || !stages.length) return;

    var COPY = {
        '1': '<b>Read.</b> The application form is written by a human in Excel and never twice the same way. ' +
             'The parser finds each field by what it means rather than where it sits, and writes a control ' +
             'file the rest of the pipeline reads. A field it cannot find is reported with its cell — never ' +
             'guessed.',
        '2': '<b>Resolve.</b> Each participant has their own reference date, and the right column to read it ' +
             'from differs between datasets. A cascade works down the available evidence per participant and ' +
             'records which rule fired, which is also what makes the result checkable afterwards.',
        '3': '<b>Classify.</b> Every record is compared against that participant\'s date and labelled before ' +
             'or after. This is the only decision in the system that matters, so no model is allowed anywhere ' +
             'near it — the comparison is deterministic code, and the review agents can disagree but not ' +
             'overrule.',
        '4': '<b>Render.</b> Submission-grade documents, RTF first because that is what is actually filed, ' +
             'then PDF if the machine can produce one. The route chosen is printed at startup so a missing ' +
             'renderer is legible rather than a silent empty folder.',
    };

    var svg = document.querySelector('.diagram svg');
    var token = svg && svg.querySelector('.d-token');
    var path = svg && svg.querySelector('#flowpath');
    var button = document.querySelector('[data-flow]');
    var timer = null;

    function select(stage) {
        stages.forEach(function (g) { g.classList.toggle('is-on', g.getAttribute('data-stage') === stage); });
        if (COPY[stage]) panel.innerHTML = COPY[stage];
    }

    stages.forEach(function (g) {
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        var stage = g.getAttribute('data-stage');
        g.addEventListener('click', function () { select(stage); });
        g.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            select(stage);
        });
    });

    if (!button || !token || !path || !path.getTotalLength) return;

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    button.addEventListener('click', function () {
        if (reducedMotion) { select('4'); return; }
        if (timer) { window.cancelAnimationFrame(timer); }

        var length = path.getTotalLength();
        var start = null;
        var duration = 3200;
        token.style.opacity = 1;

        (function step(now) {
            if (start === null) start = now;
            var t = Math.min((now - start) / duration, 1);
            var point = path.getPointAtLength(length * t);
            token.setAttribute('cx', point.x);
            token.setAttribute('cy', point.y);
            // the four stages sit at roughly even spacing along the path
            select(String(Math.min(4, Math.floor(t * 4) + 1)));
            if (t < 1) { timer = window.requestAnimationFrame(step); return; }
            timer = null;
            window.setTimeout(function () { token.style.opacity = 0; }, 400);
        })(performance.now());
    });
})();

/* ---------------------------------------------------------------------------
   Puzzle-loop walker (game page): click a step, or walk the whole loop once.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var panel = document.querySelector('[data-step-panel]');
    var steps = [].slice.call(document.querySelectorAll('.d-stage[data-step]'));
    if (!panel || !steps.length) return;

    var COPY = {
        '1': '<b>Notice.</b> Something in the reflection does not match the room it belongs to — a bridge in ' +
             'the water with no bridge on the bank, a name on the pool floor that the register does not list.',
        '2': '<b>Reveal.</b> Five implements, each doing exactly one thing: the bell wakes what was hidden, ' +
             'the scroll takes a reflection, bare hands cut it free along its edge, the staff draws and turns ' +
             'it, and a talisman makes the change stay until you peel it off.',
        '3': '<b>Compare.</b> The water is never a copyable answer. You have to stand where the broken thing ' +
             'under the surface lines up with the broken thing above it, and read the difference between them.',
        '4': '<b>Rewrite.</b> A bridge where the courtyard had none, a door in a sealed wall, three shelves ' +
             'that step aside — the space itself changes rather than a key appearing in an inventory.',
        '5': '<b>Confirm.</b> Go back to the pool, the archive, the register. What the rewrite exposes is the ' +
             'version of the academy that was edited away, and the seventeenth name nobody is supposed to have.',
    };

    function select(step) {
        steps.forEach(function (g) { g.classList.toggle('is-on', g.getAttribute('data-step') === step); });
        if (COPY[step]) panel.innerHTML = COPY[step];
    }

    steps.forEach(function (g) {
        var step = g.getAttribute('data-step');
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.addEventListener('click', function () { select(step); });
        g.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            select(step);
        });
    });

    var button = document.querySelector('[data-walk]');
    if (!button) return;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var timers = [];

    button.addEventListener('click', function () {
        timers.forEach(window.clearTimeout);
        timers = [];
        if (reduced) { select('1'); return; }
        steps.forEach(function (_, i) {
            timers.push(window.setTimeout(function () { select(String(i + 1)); }, i * 1400));
        });
    });
})();

/* ---------------------------------------------------------------------------
   Throttling schematic (edge AI page): draw the curve when it scrolls in, and
   let the reader switch between the two things the curve is contrasting.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var curve = document.querySelector('[data-curve]');
    var panel = document.querySelector('[data-phase-panel]');
    var buttons = [].slice.call(document.querySelectorAll('[data-phase]'));
    if (!curve || !panel || !buttons.length) return;

    var COPY = {
        cold: '<b>First minute.</b> The board is cold, the clock sits at its ceiling, and throughput is ' +
              'whatever the spec sheet implies. This is the number a benchmark run of a few seconds reports.',
        hot: '<b>After ten minutes.</b> The silicon has heated the heatsink, the governor pulls the clock ' +
             'down to stay inside its thermal budget, and throughput settles somewhere below where it started. ' +
             'Where it settles — and what it costs per token to stay there — is what the study measures.',
    };

    buttons.forEach(function (button) {
        button.addEventListener('click', function () {
            var phase = button.getAttribute('data-phase');
            buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
            panel.innerHTML = COPY[phase];
            curve.classList.toggle('is-hot', phase === 'hot');
        });
    });

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window) || !curve.getTotalLength) return;

    var length = curve.getTotalLength();
    curve.style.strokeDasharray = length;
    curve.style.strokeDashoffset = length;

    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            curve.style.transition = 'stroke-dashoffset 1.4s ease-out';
            curve.style.strokeDashoffset = 0;
            io.unobserve(entry.target);
        });
    }, { threshold: 0.35 });
    io.observe(curve);
})();

/* ---------------------------------------------------------------------------
   Filter the single experience list. Without JS every row is visible, which is
   the honest default: the filters only ever hide things.
--------------------------------------------------------------------------- */

(function () {
    'use strict';

    var buttons = [].slice.call(document.querySelectorAll('.filters button'));
    var rows = [].slice.call(document.querySelectorAll('.row[data-kind]'));
    if (!buttons.length || !rows.length) return;

    buttons.forEach(function (button) {
        button.addEventListener('click', function () {
            var kind = button.getAttribute('data-filter');
            buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
            rows.forEach(function (row) {
                row.hidden = kind !== 'all' && row.getAttribute('data-kind') !== kind;
            });
        });
    });
})();
